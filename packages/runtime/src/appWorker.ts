import path from "node:path";
import fs from "node:fs";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.js";
import { broadcast } from "./sse.js";

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
  nextId: number;
  attempts: number;       // consecutive crashes; reset on ready
  respawn?: NodeJS.Timeout;
  cfg: Config;
  stopped: boolean;       // deliberate stop — suppress respawn
  failed: boolean;        // fail() ran — a crash fires both 'error' and 'exit'; act once
}

const managed = new Map<string, Managed>();
const states = new Map<string, ServerState>();
let baseUrl = "";

export function configureWorkers(url: string): void { baseUrl = url; }

export function getServerState(appId: string): ServerState | undefined { return states.get(appId); }

function setState(appId: string, state: ServerState): void {
  states.set(appId, state);
  broadcast("server-state", { appId, ...state });
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
  const worker = new Worker(ENTRY, {
    workerData: { serverEntry },
    env: { ...process.env, LODEKIT_BASE_URL: baseUrl },
  });
  let readyResolve!: () => void, readyReject!: (e: Error) => void;
  const ready = new Promise<void>((res, rej) => { readyResolve = res; readyReject = rej; });
  ready.catch(() => {}); // observed via forwardToWorker; avoid unhandled rejection
  const m: Managed = {
    worker, ready, readyReject, pending: new Map(), nextId: 1, attempts, cfg,
    stopped: false, failed: false,
  };
  managed.set(appId, m);

  worker.on("message", (msg) => {
    if (msg.type === "ready") { m.attempts = 0; setState(appId, { status: "running" }); readyResolve(); return; }
    if (msg.type === "fatal") { setState(appId, { status: "error", message: msg.message }); readyReject(new Error(msg.message)); return; }
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
  setState(appId, { status: "error", message });
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
  await m.ready; // rejects on fatal
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
