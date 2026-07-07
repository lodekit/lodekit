// The tasks dispatch engine (spec §7) — runtime-internal, NOT part of the HTTP
// surface. Rides the internal scheduler (server.ts registers dispatchTasks under
// "tasks-dispatch"); durable state lives in per-app SQLite via services/tasks.
// Serial per app, parallel across apps; at-least-once delivery.
import fs from "node:fs";
import path from "node:path";
import type { Config } from "./config.js";
import { scanApps, isValidAppId } from "./registry.js";
import { getServerState, runTaskInWorker, type TaskRunResult } from "./appWorker.js";
import {
  getTasksDb, applyManifest, listDefs, getDef, setHighWater, hasTasks, hasQueuedScheduleRun,
  insertRun, claimNextDue, finishRun, markInterrupted, emitTasksChange,
  type ManifestTask, type TaskDefRow, type TaskRunRow,
} from "./services/tasks.js";
import { dueOccurrence } from "./taskSchedule.js";
import { effectiveMs, effectiveNumber } from "./services/settings.js";
import { emitLog } from "./logger.js";

// Resolve a run's execution policy at use: the def's explicit value, else the
// app's effective platform default (spec §6 liveness). An unknown/absent def is
// treated as retired (no retry budget) — a run whose def vanished never requeues.
function policyFor(appId: string, def: TaskDefRow | undefined) {
  return {
    retries: def?.retries ?? effectiveNumber("tasks.default_retries", appId),
    backoffBaseMs: effectiveMs("tasks.backoff_base", appId),
    backoffCapMs: effectiveMs("tasks.backoff_cap", appId),
    retired: def?.retired ?? true,
  };
}

export interface EngineDeps {
  now(): number;
  invoke(appId: string, name: string, payload: unknown, timeoutMs: number): Promise<TaskRunResult>;
  workerRunning(appId: string): boolean;
}

let cfg: Config | undefined;
let deps: EngineDeps = defaultDeps();
const apps = new Set<string>();     // app ids known to have task defs or runs
const inflight = new Set<string>(); // serial-per-app guard

function defaultDeps(): EngineDeps {
  return {
    now: () => Date.now(),
    invoke: runTaskInWorker,
    workerRunning: (appId) => getServerState(appId)?.status === "running",
  };
}

export function initTaskEngine(config: Config, overrides: Partial<EngineDeps> = {}): void {
  cfg = config;
  deps = { ...defaultDeps(), ...overrides };
  apps.clear();
  inflight.clear();
}

// The onTasksManifest callback (appWorker): a worker booted and reported its
// declared tasks. A load error is NOT a successful (empty) manifest — previous
// defs survive it (spec §4).
export function registerManifest(appId: string, rawTasks: unknown[], loadError?: string): void {
  if (!cfg || !isValidAppId(appId)) return; // _dashboard sits outside the app-id grammar
  if (loadError) {
    emitLog("error", "tasks", "tasks module failed to load", { stack: loadError }, appId);
    emitTasksChange(appId, { task: "*" });
    return;
  }
  // Never materialize a data dir for an app that has never used tasks.
  if (rawTasks.length === 0 && !fs.existsSync(path.join(cfg.dataDir, appId, "db.sqlite"))) return;
  const db = getTasksDb(cfg.dataDir, appId);
  const { canceled } = applyManifest(db, rawTasks as ManifestTask[], deps.now(), { minEveryMs: effectiveMs("tasks.min_every", appId) });
  if (hasTasks(db)) apps.add(appId);
  emitTasksChange(appId, { task: "*" }); // defs changed — dashboard refetches
  for (const c of canceled) emitTasksChange(appId, { task: c.task, runId: c.runId, state: "canceled" });
  dispatchTasks();
}

// Boot pass (spec §7): rows still 'running' were interrupted by runtime death —
// a consumed, failed attempt. Also seeds the engine's app set from disk so
// schedules materialize (and catch-up applies) before any worker is up.
export function recoverInterruptedRuns(): void {
  if (!cfg) return;
  for (const app of scanApps(cfg.appsDir)) {
    if (!fs.existsSync(path.join(cfg.dataDir, app.appId, "db.sqlite"))) continue;
    const db = getTasksDb(cfg.dataDir, app.appId);
    if (!hasTasks(db)) continue;
    apps.add(app.appId);
    for (const t of markInterrupted(db, deps.now(), (def) => policyFor(app.appId, def))) {
      emitTasksChange(app.appId, { task: t.task, runId: t.runId, state: t.state });
    }
  }
}

// One pass: per app (skipping in-flight apps — serial per app), materialize due
// schedule occurrences, then start the oldest due run if the worker is up.
// Never throws: per-app isolation on top of the scheduler's own error isolation.
export function dispatchTasks(): void {
  if (!cfg) return;
  for (const appId of [...apps]) {
    try {
      dispatchApp(appId);
    } catch (e) {
      emitLog("error", "tasks", "dispatch failed", { stack: e instanceof Error ? (e.stack ?? e.message) : String(e) }, appId);
    }
  }
}

function dispatchApp(appId: string): void {
  if (inflight.has(appId)) return;
  const db = getTasksDb(cfg!.dataDir, appId);
  const now = deps.now();
  for (const def of listDefs(db)) {
    if (def.retired || def.error || !def.scheduleKind) continue;
    const prevHighWater = def.highWater ?? def.registeredAt;
    const { occurrence, highWater } = dueOccurrence({
      kind: def.scheduleKind,
      expr: def.scheduleExpr!,
      anchor: def.registeredAt,
      highWater: prevHighWater,
      catchUpMs: def.catchUpMs ?? effectiveMs("tasks.default_catch_up", appId),
      graceMs: effectiveMs("tasks.schedule_grace", appId),
      now,
    });
    if (highWater !== prevHighWater) setHighWater(db, def.name, highWater);
    // A still-queued previous occurrence absorbs the new one (spec §7 step 1).
    if (occurrence !== null && !hasQueuedScheduleRun(db, def.name)) {
      const { runId } = insertRun(db, { task: def.name, notBefore: occurrence, source: "schedule", now });
      emitTasksChange(appId, { task: def.name, runId, state: "queued" });
    }
  }
  // Runs wait while the worker is down — visible, never dropped, no attempt consumed.
  if (!deps.workerRunning(appId)) return;
  const run = claimNextDue(db, now);
  if (run) void executeRun(appId, run);
}

async function executeRun(appId: string, run: TaskRunRow): Promise<void> {
  inflight.add(appId);
  // Run-lifecycle records under the `tasks` source (spec §8): start debug,
  // retry warn, terminal failure error — durable state stays in the runs table.
  const fields = { task: run.task, runId: run.id, attempt: run.attempt };
  try {
    emitTasksChange(appId, { task: run.task, runId: run.id, state: "running" });
    emitLog("debug", "tasks", `run started: ${run.task}`, fields, appId);
    const db = getTasksDb(cfg!.dataDir, appId);
    const def = getDef(db, run.task)!; // claimNextDue joins on a live def
    let result: TaskRunResult;
    try {
      result = await deps.invoke(
        appId,
        run.task,
        run.payload === null ? undefined : (JSON.parse(run.payload) as unknown),
        def.timeoutMs ?? effectiveMs("tasks.default_timeout", appId)
      );
    } catch (e) {
      result = { ok: false, message: e instanceof Error ? (e.stack ?? e.message) : String(e) };
    }
    const outcome = finishRun(db, run, result, policyFor(appId, def), deps.now());
    emitTasksChange(appId, { task: run.task, runId: run.id, state: outcome.state });
    const duration_ms = run.startedAt != null ? deps.now() - run.startedAt : undefined;
    if (outcome.state === "succeeded") {
      emitLog("debug", "tasks", `run succeeded: ${run.task}`, { ...fields, duration_ms }, appId);
    } else if (outcome.state === "queued") {
      emitLog("warn", "tasks", `run failed, retry scheduled: ${run.task}`, { ...fields, duration_ms, stack: result.ok ? undefined : result.message }, appId);
    } else {
      emitLog("error", "tasks", `run failed terminally: ${run.task}`, { ...fields, duration_ms, stack: result.ok ? undefined : result.message }, appId);
    }
  } catch (e) {
    // A throw here (finishRun write failure, broadcast error) leaves the row
    // 'running' — boot recovery reconciles it. Never let it wedge dispatch.
    emitLog("error", "tasks", `run failed to record: ${run.task}`, { ...fields, stack: e instanceof Error ? (e.stack ?? e.message) : String(e) }, appId);
  } finally {
    inflight.delete(appId);
    dispatchTasks(); // chain the app's next due run without waiting for the poll
  }
}
