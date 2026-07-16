import path from "node:path";
import fs from "node:fs";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Config } from "./config.js";
import { emitEvent, CHANGE_FEED_TTL_S } from "./events.js";
import { emitLog, createLogger } from "./logger.js";
import { effectiveMs } from "./services/settings.js";

export type ServerState =
  | { status: "starting" }
  | { status: "running" }
  | { status: "error"; message: string };

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "appWorkerEntry.mjs");
// Give-up latch: a permanently-fatal bundle would otherwise respawn forever at the
// backoff cap, churning states and durable server-state events. After this many
// consecutive crashes, stay in error until the next build restarts the worker
// (build.ts calls startAppWorker after every successful rebuild, resetting the count).
const MAX_CONSECUTIVE_CRASHES = 5;

// Backoff comes from the effective hosting.restart_backoff_* settings per app;
// the test hook pins it so crash-loop tests run fast (no args = back to settings).
let backoffForTest: { baseMs: number; capMs: number } | null = null;
/** Test hook — shrink the respawn backoff so crash-loop tests run fast. */
export function setBackoffForTest(baseMs?: number, capMs?: number): void {
  backoffForTest = baseMs === undefined ? null : { baseMs, capMs: capMs ?? baseMs };
}

interface Managed {
  worker: Worker;
  ready: Promise<void>;
  readyReject: (e: Error) => void; // settles waiters on crash/stop; no-op once ready resolved
  pending: Map<number, { resolve: (r: Response) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>;
  pendingTasks: Map<number, { resolve: (r: TaskRunResult) => void; timer: NodeJS.Timeout }>;
  nextId: number;
  attempts: number;       // consecutive crashes; reset on ready
  respawn?: NodeJS.Timeout;
  cfg: Config;
  stopped: boolean;       // deliberate stop — suppress respawn
  failed: boolean;        // fail() ran — a crash fires both 'error' and 'exit'; act once
}

export type TaskRunResult = { ok: true } | { ok: false; message: string };

let manifestCb: ((appId: string, tasks: unknown[], error?: string) => void) | undefined;

/** Engine hook (single, last-wins): fired once per worker boot with the app's task manifest. */
export function onTasksManifest(cb: (appId: string, tasks: unknown[], error?: string) => void): void {
  manifestCb = cb;
}

let settingsManifestCb: ((appId: string, fields: Record<string, unknown>, error?: string) => void) | undefined;

/** Settings hook (single, last-wins): fired once per worker boot with the app's settings manifest. */
export function onSettingsManifest(cb: (appId: string, fields: Record<string, unknown>, error?: string) => void): void {
  settingsManifestCb = cb;
}

let secretsManifestCb: ((appId: string, slots: Record<string, unknown>, error?: string) => void) | undefined;

/** Secrets hook (single, last-wins): fired once per worker boot with the app's declared slots. */
export function onSecretsManifest(cb: (appId: string, slots: Record<string, unknown>, error?: string) => void): void {
  secretsManifestCb = cb;
}

let gatewaysManifestCb: ((appId: string, uses: Record<string, unknown>, error?: string) => void) | undefined;

/** Gateways hook (single, last-wins): fired once per worker boot with the app's declared gateway uses. */
export function onGatewaysManifest(cb: (appId: string, uses: Record<string, unknown>, error?: string) => void): void {
  gatewaysManifestCb = cb;
}

let dbManifestCb: ((appId: string, snapshot: unknown, error?: string) => Promise<unknown> | void) | undefined;

/** db-store hook (single, last-wins): fired at worker boot, BEFORE ready, with the
 *  app's schema snapshot. The worker waits for the ack this handler triggers. */
export function onDbManifest(cb: (appId: string, snapshot: unknown, error?: string) => Promise<unknown> | void): void {
  dbManifestCb = cb;
}

const managed = new Map<string, Managed>();

// Per-spawn worker tokens (secret-store spec §7): the server-only door's
// credential. In-memory only — never persisted, never logged.
const workerTokens = new Map<string, string>();

export function verifyWorkerToken(appId: string, token: string | undefined): boolean {
  const expected = workerTokens.get(appId);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Test hook — routes tests mint a token without spawning a real worker. */
export function setWorkerTokenForTest(appId: string, token: string | null): void {
  if (token === null) workerTokens.delete(appId);
  else workerTokens.set(appId, token);
}

const states = new Map<string, ServerState>();
let baseUrl = "";

export function configureWorkers(url: string): void { baseUrl = url; }

export function getServerState(appId: string): ServerState | undefined { return states.get(appId); }

const SERVER_FACT = { starting: "server-started", running: "server-ready", error: "server-failed" } as const;

function setState(appId: string, state: ServerState): void {
  states.set(appId, state);
  emitEvent({
    app: appId, kind: "engine", component: "lifecycle", type: SERVER_FACT[state.status],
    payload: state.status === "error" ? { message: state.message } : undefined,
    ttl: CHANGE_FEED_TTL_S,
  });
}

export function startAppWorker(cfg: Config, appId: string): void {
  stopAppWorker(appId);
  spawn(cfg, appId, 0);
}

function spawn(cfg: Config, appId: string, attempts: number): void {
  const serverEntry = path.join(cfg.cacheDir, appId, "server", "server.js");
  if (!fs.existsSync(serverEntry)) {
    setState(appId, { status: "error", message: "server bundle missing (not built)" });
    return;
  }
  setState(appId, { status: "starting" });
  const tasksEntry = path.join(cfg.cacheDir, appId, "server", "tasks.js");
  const settingsEntry = path.join(cfg.cacheDir, appId, "server", "settings.js");
  const secretsEntry = path.join(cfg.cacheDir, appId, "server", "secrets.js");
  const gatewaysEntry = path.join(cfg.cacheDir, appId, "server", "gateways.js");
  const dbEntry = path.join(cfg.cacheDir, appId, "server", "db.js");
  const workerToken = randomBytes(32).toString("hex");
  workerTokens.set(appId, workerToken);
  const worker = new Worker(ENTRY, {
    workerData: {
      serverEntry,
      tasksEntry: fs.existsSync(tasksEntry) ? tasksEntry : null,
      settingsEntry: fs.existsSync(settingsEntry) ? settingsEntry : null,
      secretsEntry: fs.existsSync(secretsEntry) ? secretsEntry : null,
      gatewaysEntry: fs.existsSync(gatewaysEntry) ? gatewaysEntry : null,
      dbEntry: fs.existsSync(dbEntry) ? dbEntry : null,
    },
    env: { ...process.env, LODEKIT_BASE_URL: baseUrl, LODEKIT_WORKER_TOKEN: workerToken },
  });
  let readyResolve!: () => void, readyReject!: (e: Error) => void;
  const ready = new Promise<void>((res, rej) => { readyResolve = res; readyReject = rej; });
  ready.catch(() => {}); // observed via forwardToWorker; avoid unhandled rejection
  const m: Managed = {
    worker, ready, readyReject, pending: new Map(), pendingTasks: new Map(), nextId: 1, attempts, cfg,
    stopped: false, failed: false,
  };
  managed.set(appId, m);

  const lifecycle = createLogger("lifecycle", appId);
  worker.on("message", (msg) => {
    if (msg.type === "log") { emitLog(msg.level, "console", msg.message, msg.fields ?? undefined, appId); return; }
    if (msg.type === "ready") { m.attempts = 0; setState(appId, { status: "running" }); lifecycle.info("app server ready"); readyResolve(); return; }
    if (msg.type === "fatal") { setState(appId, { status: "error", message: msg.message }); lifecycle.error("app server failed to start", { stack: msg.message }); readyReject(new Error(msg.message)); return; }
    if (msg.type === "tasks-manifest") { manifestCb?.(appId, msg.tasks ?? [], msg.error); return; }
    if (msg.type === "settings-manifest") { settingsManifestCb?.(appId, msg.fields ?? {}, msg.error); return; }
    if (msg.type === "secrets-manifest") { secretsManifestCb?.(appId, msg.slots ?? {}, msg.error); return; }
    if (msg.type === "gateways-manifest") { gatewaysManifestCb?.(appId, msg.uses ?? {}, msg.error); return; }
    if (msg.type === "db-manifest") {
      void (async () => {
        try {
          await dbManifestCb?.(appId, msg.snapshot ?? null, msg.error);
        } catch (e) {
          // Degrade, never die: a corrupt db file or snapshot must not take the host
          // down — the app keeps serving on whatever schema its database has.
          const message = `schema push failed unexpectedly: ${e instanceof Error ? e.message : String(e)}`;
          emitLog("error", "db-store", message, e instanceof Error && e.stack ? { stack: e.stack } : undefined, appId);
          emitEvent({ app: appId, kind: "service", component: "db-store", type: "schema-gated", payload: { message }, ttl: CHANGE_FEED_TTL_S });
        } finally {
          // Ack even on a failed push — the app serves on its previous schema.
          try { worker.postMessage({ type: "db-manifest-ack" }); } catch { /* worker died */ }
        }
      })();
      return;
    }
    if (msg.type === "task-result") {
      const t = m.pendingTasks.get(msg.id);
      if (!t) return;
      m.pendingTasks.delete(msg.id);
      clearTimeout(t.timer);
      t.resolve(msg.ok ? { ok: true } : { ok: false, message: msg.message ?? "task failed" });
      return;
    }
    const p = m.pending.get(msg.id);
    if (!p) return;
    m.pending.delete(msg.id); clearTimeout(p.timer);
    if (msg.type === "response") p.resolve(new Response(msg.body, { status: msg.status, headers: msg.headers }));
    else p.reject(new Error(msg.message));
  });
  worker.on("error", (e) => fail(appId, m, `app worker error: ${e.stack ?? e}`));
  worker.on("exit", (code) => { if (!m.stopped) fail(appId, m, `app worker exited (code ${code})`); });
}

function fail(appId: string, m: Managed, message: string): void {
  // A genuine crash fires both 'error' and 'exit'; act on the first only, or the
  // second setTimeout would orphan the first (untracked spawn / resurrect-after-stop).
  if (m.stopped || m.failed) return;
  m.failed = true;
  m.readyReject(new Error(message)); // settle forwards awaiting startup (no-op if already ready)
  for (const [, p] of m.pending) { clearTimeout(p.timer); p.reject(new Error(message)); }
  m.pending.clear();
  for (const [, t] of m.pendingTasks) { clearTimeout(t.timer); t.resolve({ ok: false, message }); }
  m.pendingTasks.clear();
  const crashes = m.attempts + 1;
  const latched = crashes >= MAX_CONSECUTIVE_CRASHES;
  setState(appId, {
    status: "error",
    message: latched ? `${message}\n(gave up after ${crashes} consecutive crashes — the next build retries)` : message,
  });
  emitLog("error", "lifecycle", message, undefined, appId);
  if (latched) {
    emitLog("error", "lifecycle", `gave up after ${crashes} consecutive crashes; the next build retries`, undefined, appId);
    return;
  }
  const delay = backoffForTest
    ? Math.min(backoffForTest.baseMs * 2 ** m.attempts, backoffForTest.capMs)
    : Math.min(effectiveMs("hosting.restart_backoff_base", appId) * 2 ** m.attempts, effectiveMs("hosting.restart_backoff_cap", appId));
  m.respawn = setTimeout(() => {
    if (managed.get(appId) === m && !m.stopped) spawn(m.cfg, appId, m.attempts + 1);
  }, delay);
  m.respawn.unref();
}

export function stopAppWorker(appId: string): void {
  const m = managed.get(appId);
  if (!m) return;
  m.stopped = true;
  clearTimeout(m.respawn);
  m.readyReject(new Error("app worker stopped")); // settle forwards awaiting startup
  for (const [, p] of m.pending) { clearTimeout(p.timer); p.reject(new Error("app worker stopped")); }
  m.pending.clear();
  for (const [, t] of m.pendingTasks) { clearTimeout(t.timer); t.resolve({ ok: false, message: "app worker stopped" }); }
  m.pendingTasks.clear();
  void m.worker.terminate();
  managed.delete(appId);
  states.delete(appId);
  workerTokens.delete(appId);
}

export function stopAllWorkers(): void { for (const appId of [...managed.keys()]) stopAppWorker(appId); }

/** Test hook — the underlying Worker (crash-containment tests terminate it). */
export function workerForTest(appId: string): Worker | undefined { return managed.get(appId)?.worker; }

// Hard cap on a forwarded request body (the scoped API's 100kb bodyLimit does not
// cover app-worker forwards; hard caps stay code — platformSettings.ts header).
// Bodies are fully buffered here and transferred to the worker, so an unbounded
// body is an unbounded allocation. Generous vs the API's cap: _serverFn payloads
// carry user content.
export const FORWARD_BODY_MAX_BYTES = 5 * 1024 * 1024;

// Buffers a request body, refusing beyond maxBytes: a lying or absent
// Content-Length is caught by counting; breaking out cancels the source stream.
// Returns a fresh Uint8Array so its buffer is safe to transfer via postMessage.
async function readBodyCapped(request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | "too-large"> {
  if (Number(request.headers.get("content-length")) > maxBytes) return "too-large";
  if (!request.body) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of request.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > maxBytes) return "too-large";
    chunks.push(chunk);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
  return out;
}

export async function forwardToWorker(appId: string, request: Request): Promise<Response> {
  const m = managed.get(appId);
  if (!m) throw new Error(`no app worker for ${appId}`);
  await m.ready; // rejects on fatal, but only while pending — a no-op once already resolved
  // A worker that crashed *after* becoming ready leaves `m` in place (respawn replaces the
  // managed entry later, on its backoff timer) with `ready` already settled — re-check here
  // or postMessage would silently go to a dead Worker and hang until the request timeout
  // instead of failing fast.
  if (m.failed || m.stopped) throw new Error(`app worker for ${appId} is down`);
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? null
      : await readBodyCapped(request, FORWARD_BODY_MAX_BYTES); // streams come back, not in
  if (body === "too-large") {
    return Response.json({ error: "request body too large" }, { status: 413 });
  }
  const id = m.nextId++;
  const timeoutMs = effectiveMs("hosting.request_timeout", appId);
  return await new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => {
      m.pending.delete(id);
      reject(new Error(`app worker request timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    timer.unref();
    m.pending.set(id, { resolve, reject, timer });
    m.worker.postMessage(
      { type: "request", id, method: request.method, url: request.url, headers: [...request.headers], body },
      body ? [body.buffer] : []
    );
  });
}

// Runs one task attempt in the app's worker. Never rejects: down/dead/timed-out
// workers resolve { ok: false } — the engine turns that into a failed attempt.
// (The engine checks getServerState() before claiming, so "down" here is a
// narrow race; the consumed attempt on that path is documented in the spec.)
export async function runTaskInWorker(
  appId: string,
  name: string,
  payload: unknown,
  timeoutMs: number
): Promise<TaskRunResult> {
  const m = managed.get(appId);
  if (!m || m.failed || m.stopped) return { ok: false, message: `app worker for ${appId} is down` };
  try {
    await m.ready;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
  if (m.failed || m.stopped) return { ok: false, message: `app worker for ${appId} is down` };
  const id = m.nextId++;
  return await new Promise<TaskRunResult>((resolve) => {
    const timer = setTimeout(() => {
      m.pendingTasks.delete(id);
      resolve({ ok: false, message: `task timed out after ${Math.round(timeoutMs / 1000)}s` });
    }, timeoutMs);
    timer.unref();
    m.pendingTasks.set(id, { resolve, timer });
    m.worker.postMessage({ type: "task-run", id, name, payload });
  });
}
