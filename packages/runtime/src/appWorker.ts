import path from "node:path";
import fs from "node:fs";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.js";
import { emitEvent, PLATFORM_NS } from "./events.js";
import { emitLog, createLogger } from "./logger.js";

export type ServerState =
  | { status: "starting" }
  | { status: "running" }
  | { status: "error"; message: string };

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "appWorkerEntry.mjs");
const REQUEST_TIMEOUT_MS = 30_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 10_000;

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

const managed = new Map<string, Managed>();
const states = new Map<string, ServerState>();
let baseUrl = "";

export function configureWorkers(url: string): void { baseUrl = url; }

export function getServerState(appId: string): ServerState | undefined { return states.get(appId); }

function setState(appId: string, state: ServerState): void {
  states.set(appId, state);
  emitEvent({ ns: appId, source: PLATFORM_NS, type: "server-state", payload: { ...state } });
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
  const worker = new Worker(ENTRY, {
    workerData: { serverEntry, tasksEntry: fs.existsSync(tasksEntry) ? tasksEntry : null },
    env: { ...process.env, LODEKIT_BASE_URL: baseUrl },
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
  setState(appId, { status: "error", message });
  emitLog("error", "lifecycle", message, undefined, appId);
  const delay = Math.min(BACKOFF_BASE_MS * 2 ** m.attempts, BACKOFF_CAP_MS);
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
}

export function stopAllWorkers(): void { for (const appId of [...managed.keys()]) stopAppWorker(appId); }

/** Test hook — the underlying Worker (crash-containment tests terminate it). */
export function workerForTest(appId: string): Worker | undefined { return managed.get(appId)?.worker; }

export async function forwardToWorker(appId: string, request: Request): Promise<Response> {
  const m = managed.get(appId);
  if (!m) throw new Error(`no app worker for ${appId}`);
  await m.ready; // rejects on fatal, but only while pending — a no-op once already resolved
  // A worker that crashed *after* becoming ready leaves `m` in place (respawn replaces the
  // managed entry later, on its backoff timer) with `ready` already settled — re-check here
  // or postMessage would silently go to a dead Worker and hang until the 30s timeout instead
  // of failing fast.
  if (m.failed || m.stopped) throw new Error(`app worker for ${appId} is down`);
  const id = m.nextId++;
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? null
      : new Uint8Array(await request.arrayBuffer()); // bodies are small (100kb-class); streams come back, not in
  return await new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => {
      m.pending.delete(id);
      reject(new Error(`app worker request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`));
    }, REQUEST_TIMEOUT_MS);
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
