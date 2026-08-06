import type { ManagedDb } from "../sqlite.js";
import { getAppDb, openDbs } from "../db.js";
import { emitEvent, CHANGE_FEED_TTL_S } from "../events.js";
import { parseDuration } from "../duration.js";
import { validateSchedule, type ScheduleKind } from "../taskSchedule.js";
import { effectiveMs, effectiveNumber } from "./settings.js";
import { Hono, type MiddlewareHandler } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Config } from "../config.js";
import { isValidAppId } from "../registry.js";
import { validationHook } from "../validation.js";
import { tick } from "../scheduler.js";
import { nextOccurrence } from "../taskSchedule.js";

export const CATALOG_NAME = "tasks";

export interface TaskDefRow {
  name: string;
  scheduleKind: ScheduleKind | null;
  scheduleExpr: string | null;
  catchUpMs: number | null;   // null = unspecified; 0 = disabled (catchUp: false); Infinity = always (catchUp: true)
  retries: number | null;     // null = unspecified — the engine resolves the effective default
  timeoutMs: number | null;   // null = unspecified
  retired: boolean;
  error: string | null;       // config error — the def is visible but never runs
  registeredAt: number;       // anchor for "every"; reset when the schedule changes
  highWater: number | null;   // last schedule occurrence considered (spec §7 step 1)
}

export type RunState = "queued" | "running" | "succeeded" | "failed" | "canceled";
export type RunSource = "enqueue" | "schedule" | "manual";

export interface TaskRunRow {
  id: number;
  task: string;
  state: RunState;
  payload: string | null;     // JSON text
  dedupeKey: string | null;
  attempt: number;
  notBefore: number;
  source: RunSource;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number | null;
  error: string | null;
}

export interface ManifestTask {
  name: string;
  cron?: string;
  every?: string;
  catchUp?: string | boolean;
  retries?: number;
  timeout?: string;
}

/** Validation/semantic error — mapped to HTTP 400 by the router. */
export class TasksError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "TasksError";
  }
}

export function getTasksDb(dataDir: string, appId: string): ManagedDb {
  return getAppDb(dataDir, appId);
}

interface DefDbRow {
  name: string; schedule_kind: string | null; schedule_expr: string | null;
  catch_up_ms: number | null; retries: number | null; timeout_ms: number | null; retired: number;
  error: string | null; registered_at: number; high_water: number | null;
}
interface RunDbRow {
  id: number; task: string; state: string; payload: string | null; dedupe_key: string | null;
  attempt: number; not_before: number; source: string; created_at: number;
  started_at: number | null; finished_at: number | null; duration_ms: number | null; error: string | null;
}

const toDef = (r: DefDbRow): TaskDefRow => ({
  name: r.name,
  scheduleKind: r.schedule_kind as ScheduleKind | null,
  scheduleExpr: r.schedule_expr,
  catchUpMs: r.catch_up_ms === -1 ? Number.POSITIVE_INFINITY : r.catch_up_ms,
  retries: r.retries,
  timeoutMs: r.timeout_ms,
  retired: r.retired === 1,
  error: r.error,
  registeredAt: r.registered_at,
  highWater: r.high_water,
});

const toRun = (r: RunDbRow): TaskRunRow => ({
  id: r.id, task: r.task, state: r.state as RunState, payload: r.payload,
  dedupeKey: r.dedupe_key, attempt: r.attempt, notBefore: r.not_before,
  source: r.source as RunSource, createdAt: r.created_at, startedAt: r.started_at,
  finishedAt: r.finished_at, durationMs: r.duration_ms, error: r.error,
});

const NAME_RE = /^[a-z0-9-]+$/;

// Resolves one manifest task's config; throws on any invalid piece. Stores only
// what the app explicitly declared — NULL for anything unspecified, so the engine
// resolves the effective default at use (spec §6 liveness).
function resolveConfig(t: ManifestTask, minEveryMs: number): {
  scheduleKind: ScheduleKind | null; scheduleExpr: string | null;
  catchUpMs: number | null; retries: number | null; timeoutMs: number | null;
} {
  if (t.cron != null && t.every != null) throw new Error("cron and every are mutually exclusive");
  const scheduleKind: ScheduleKind | null = t.cron != null ? "cron" : t.every != null ? "every" : null;
  const scheduleExpr = t.cron ?? t.every ?? null;
  if (scheduleKind) validateSchedule(scheduleKind, scheduleExpr!, minEveryMs);
  const retries = t.retries ?? null;
  if (retries !== null && (!Number.isInteger(retries) || retries < 0 || retries > 20)) throw new Error(`invalid retries ${t.retries}`);
  return {
    scheduleKind,
    scheduleExpr,
    catchUpMs:
      t.catchUp === undefined ? null
      : t.catchUp === false ? 0
      : t.catchUp === true ? Number.POSITIVE_INFINITY
      : parseDuration(t.catchUp),
    retries,
    timeoutMs: t.timeout === undefined ? null : parseDuration(t.timeout),
  };
}

// Upserts the manifest's defs (config errors land in the error column, siblings
// unaffected), retires absent defs (canceling their queued runs), un-retires
// returners. High-water and registered_at survive an unchanged schedule and
// reset when it changes (spec §4).
export function applyManifest(
  db: ManagedDb,
  tasks: ManifestTask[],
  now: number,
  limits: { minEveryMs: number }
): { canceled: { task: string; runId: number }[] } {
  const canceled: { task: string; runId: number }[] = [];
  const txn = db.transaction(() => {
    const names = new Set<string>();
    for (const t of tasks) {
      if (typeof t?.name !== "string" || !NAME_RE.test(t.name) || t.name.length > 128) continue;
      names.add(t.name);
      const prev = getDef(db, t.name);
      let resolved, error: string | null = null;
      try {
        resolved = resolveConfig(t, limits.minEveryMs);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        resolved = { scheduleKind: null, scheduleExpr: null, catchUpMs: null, retries: null, timeoutMs: null };
      }
      const scheduleChanged =
        !prev || prev.scheduleKind !== resolved.scheduleKind || prev.scheduleExpr !== resolved.scheduleExpr;
      const registeredAt = scheduleChanged ? now : prev!.registeredAt;
      const highWater = scheduleChanged ? now : prev!.highWater;
      db.prepare(
        `INSERT INTO _task_defs
           (name, schedule_kind, schedule_expr, catch_up_ms, retries, timeout_ms, retired, error, registered_at, high_water)
         VALUES (@name, @kind, @expr, @catchUp, @retries, @timeout, 0, @error, @registeredAt, @highWater)
         ON CONFLICT(name) DO UPDATE SET
           schedule_kind = excluded.schedule_kind, schedule_expr = excluded.schedule_expr,
           catch_up_ms = excluded.catch_up_ms, retries = excluded.retries, timeout_ms = excluded.timeout_ms,
           retired = 0, error = excluded.error,
           registered_at = excluded.registered_at, high_water = excluded.high_water`
      ).run({
        name: t.name, kind: resolved.scheduleKind, expr: resolved.scheduleExpr,
        catchUp: resolved.catchUpMs === Number.POSITIVE_INFINITY ? -1 : resolved.catchUpMs,
        retries: resolved.retries, timeout: resolved.timeoutMs,
        error, registeredAt, highWater,
      });
    }
    const existing = (db.prepare("SELECT name FROM _task_defs WHERE retired = 0").all() as { name: string }[]);
    for (const { name } of existing) {
      if (names.has(name)) continue;
      db.prepare("UPDATE _task_defs SET retired = 1 WHERE name = ?").run(name);
      const rows = db
        .prepare(
          `UPDATE _task_runs SET state = 'canceled', finished_at = ?, error = 'task retired'
           WHERE task = ? AND state = 'queued' RETURNING id`
        )
        .all(now, name) as { id: number }[];
      for (const r of rows) canceled.push({ task: name, runId: r.id });
    }
  });
  txn();
  return { canceled };
}

export function listDefs(db: ManagedDb): TaskDefRow[] {
  return (db.prepare("SELECT * FROM _task_defs ORDER BY name").all() as DefDbRow[]).map(toDef);
}

export function getDef(db: ManagedDb, name: string): TaskDefRow | undefined {
  const r = db.prepare("SELECT * FROM _task_defs WHERE name = ?").get(name) as DefDbRow | undefined;
  return r ? toDef(r) : undefined;
}

export function setHighWater(db: ManagedDb, name: string, highWater: number): void {
  db.prepare("UPDATE _task_defs SET high_water = ? WHERE name = ?").run(highWater, name);
}

export function hasTasks(db: ManagedDb): boolean {
  return (
    db.prepare("SELECT 1 FROM _task_defs LIMIT 1").get() !== undefined ||
    db.prepare("SELECT 1 FROM _task_runs LIMIT 1").get() !== undefined
  );
}

export function insertRun(
  db: ManagedDb,
  opts: { task: string; payload?: unknown; notBefore: number; source: RunSource; dedupeKey?: string | null; now: number }
): { runId: number; deduped: boolean } {
  const txn = db.transaction((): { runId: number; deduped: boolean } => {
    if (opts.dedupeKey != null) {
      const existing = db
        .prepare("SELECT id FROM _task_runs WHERE task = ? AND dedupe_key = ? AND state = 'queued' LIMIT 1")
        .get(opts.task, opts.dedupeKey) as { id: number } | undefined;
      if (existing) return { runId: existing.id, deduped: true };
    }
    const info = db
      .prepare(
        `INSERT INTO _task_runs (task, state, payload, dedupe_key, attempt, not_before, source, created_at)
         VALUES (@task, 'queued', @payload, @dedupeKey, 0, @notBefore, @source, @now)`
      )
      .run({
        task: opts.task,
        payload: opts.payload === undefined ? null : JSON.stringify(opts.payload),
        dedupeKey: opts.dedupeKey ?? null,
        notBefore: opts.notBefore,
        source: opts.source,
        now: opts.now,
      });
    return { runId: Number(info.lastInsertRowid), deduped: false };
  });
  return txn();
}

export function hasQueuedScheduleRun(db: ManagedDb, task: string): boolean {
  return (
    db.prepare("SELECT 1 FROM _task_runs WHERE task = ? AND state = 'queued' AND source = 'schedule' LIMIT 1")
      .get(task) !== undefined
  );
}

// Oldest due queued run of a live def, atomically transitioned to running.
export function claimNextDue(db: ManagedDb, now: number): TaskRunRow | undefined {
  const txn = db.transaction((): TaskRunRow | undefined => {
    const row = db
      .prepare(
        `SELECT r.* FROM _task_runs r
         JOIN _task_defs d ON d.name = r.task
         WHERE r.state = 'queued' AND r.not_before <= ? AND d.retired = 0 AND d.error IS NULL
         ORDER BY r.not_before, r.id LIMIT 1`
      )
      .get(now) as RunDbRow | undefined;
    if (!row) return undefined;
    db.prepare("UPDATE _task_runs SET state = 'running', attempt = attempt + 1, started_at = ? WHERE id = ?")
      .run(now, row.id);
    return toRun({ ...row, state: "running", attempt: row.attempt + 1, started_at: now });
  });
  return txn();
}

// At-least-once completion rule (spec §7): success -> succeeded; failure with
// attempts left -> queued with exponential backoff; else terminal failed.
export function finishRun(
  db: ManagedDb,
  run: TaskRunRow,
  result: { ok: boolean; message?: string },
  policy: { retries: number; backoffBaseMs: number; backoffCapMs: number; retired: boolean },
  now: number
): { state: "succeeded" | "failed" | "queued"; notBefore?: number } {
  if (result.ok) {
    db.prepare(
      "UPDATE _task_runs SET state = 'succeeded', finished_at = ?, duration_ms = ?, error = NULL WHERE id = ?"
    ).run(now, run.startedAt != null ? now - run.startedAt : null, run.id);
    return { state: "succeeded" };
  }
  const error = (result.message ?? "task failed").slice(0, 4_000);
  if (run.attempt <= policy.retries && !policy.retired) {
    const notBefore = now + Math.min(policy.backoffBaseMs * 2 ** (run.attempt - 1), policy.backoffCapMs);
    db.prepare(
      "UPDATE _task_runs SET state = 'queued', not_before = ?, started_at = NULL, error = ? WHERE id = ?"
    ).run(notBefore, error, run.id);
    return { state: "queued", notBefore };
  }
  db.prepare(
    "UPDATE _task_runs SET state = 'failed', finished_at = ?, duration_ms = ?, error = ? WHERE id = ?"
  ).run(now, run.startedAt != null ? now - run.startedAt : null, error, run.id);
  return { state: "failed" };
}

// Boot recovery: every row still 'running' was interrupted by engine death —
// a consumed, failed attempt (spec §7).
export function markInterrupted(
  db: ManagedDb,
  now: number,
  policy: (def: TaskDefRow | undefined) => { retries: number; backoffBaseMs: number; backoffCapMs: number; retired: boolean }
): { task: string; runId: number; state: "queued" | "failed" }[] {
  const rows = (db.prepare("SELECT * FROM _task_runs WHERE state = 'running'").all() as RunDbRow[]).map(toRun);
  const out: { task: string; runId: number; state: "queued" | "failed" }[] = [];
  for (const run of rows) {
    const r = finishRun(db, run, { ok: false, message: "interrupted by engine shutdown" }, policy(getDef(db, run.task)), now);
    out.push({ task: run.task, runId: run.id, state: r.state === "queued" ? "queued" : "failed" });
  }
  return out;
}

export function listRuns(
  db: ManagedDb,
  opts: { task?: string; state?: RunState; limit?: number } = {}
): TaskRunRow[] {
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 50)), 200);
  const rows = db
    .prepare(
      `SELECT * FROM _task_runs
       WHERE (@task IS NULL OR task = @task) AND (@state IS NULL OR state = @state)
       ORDER BY id DESC LIMIT @limit`
    )
    .all({ task: opts.task ?? null, state: opts.state ?? null, limit }) as RunDbRow[];
  return rows.map(toRun);
}

export function getRun(db: ManagedDb, id: number): TaskRunRow | undefined {
  const r = db.prepare("SELECT * FROM _task_runs WHERE id = ?").get(id) as RunDbRow | undefined;
  return r ? toRun(r) : undefined;
}

export function lastRunOf(
  db: ManagedDb,
  task: string
): { runId: number; state: RunState; finishedAt: number | null; error: string | null } | undefined {
  const r = db
    .prepare("SELECT id, state, finished_at, error FROM _task_runs WHERE task = ? ORDER BY id DESC LIMIT 1")
    .get(task) as { id: number; state: string; finished_at: number | null; error: string | null } | undefined;
  return r ? { runId: r.id, state: r.state as RunState, finishedAt: r.finished_at, error: r.error } : undefined;
}

export function cancelRun(db: ManagedDb, id: number, now: number): { task: string } | "not-queued" | "not-found" {
  const txn = db.transaction((): { task: string } | "not-queued" | "not-found" => {
    const run = getRun(db, id);
    if (!run) return "not-found";
    if (run.state !== "queued") return "not-queued";
    db.prepare("UPDATE _task_runs SET state = 'canceled', finished_at = ? WHERE id = ?").run(now, id);
    return { task: run.task };
  });
  return txn();
}

// Retention (spec §9): delete terminal runs that are BOTH beyond the newest
// `keep` per task AND older than `maxAgeMs`. Never queued/running.
export function sweepRuns(db: ManagedDb, now: number, keep: number, maxAgeMs: number): number {
  return db
    .prepare(
      `DELETE FROM _task_runs WHERE id IN (
         SELECT id FROM (
           SELECT id, finished_at, ROW_NUMBER() OVER (PARTITION BY task ORDER BY id DESC) AS rn
           FROM _task_runs WHERE state IN ('succeeded','failed','canceled')
         ) WHERE rn > ? AND finished_at < ?
       )`
    )
    .run(keep, now - maxAgeMs).changes;
}

// openDbs pattern (kv-store sweepAll): every connection open since boot has
// the schema (the app-db migration chain's job). Retention knobs resolve per
// app (effective settings), so a per-app override is honored.
export function sweepAllTaskRuns(): void {
  const now = Date.now();
  for (const { appId, db } of openDbs()) {
    sweepRuns(db, now, effectiveNumber("tasks.run_retention_count", appId), effectiveMs("tasks.run_retention_age", appId));
  }
}

// Run transitions are past-tense facts (spec §4): the state is the type, the payload
// carries identity only. A module load error emits defs-changed — the stack lives in
// the adjacent tasks-source log record, and a full stack could blow the payload cap.
const RUN_FACT: Record<RunState, string> = {
  queued: "run-queued",
  running: "run-started",
  succeeded: "run-succeeded",
  failed: "run-failed",
  canceled: "run-canceled",
};

export function emitRunEvent(appId: string, task: string, runId: number, state: RunState): void {
  emitEvent({ app: appId, kind: "service", component: CATALOG_NAME, type: RUN_FACT[state], payload: { task, runId }, ttl: CHANGE_FEED_TTL_S });
}

export function emitTaskDefsChanged(appId: string): void {
  emitEvent({ app: appId, kind: "service", component: CATALOG_NAME, type: "defs-changed", ttl: CHANGE_FEED_TTL_S });
}

export type TasksEnv = { Variables: { tasksDb: ManagedDb; appId: string } };

// Applied by the parent router on /apps/:appId/tasks/* — validates the app id
// and sets the db handle in context vars (kv-store withDb pattern).
export function withTasks(cfg: Config): MiddlewareHandler<TasksEnv> {
  return async (c, next) => {
    const appId = c.req.param("appId");
    if (!appId || !isValidAppId(appId)) return c.json({ error: "invalid app id" }, 400);
    c.set("tasksDb", getTasksDb(cfg.dataDir, appId));
    c.set("appId", appId);
    await next();
  };
}

const nameParam = z.object({ name: z.string().regex(/^[a-z0-9-]+$/).max(128) });
const idParam = z.object({ id: z.coerce.number().int().positive() });
const runsQuery = z.object({
  task: z.string().optional(),
  state: z.enum(["queued", "running", "succeeded", "failed", "canceled"]).optional(),
  limit: z.coerce.number().optional(),
});
const enqueueBody = z.object({
  payload: z.unknown().optional(),
  delay: z.string().optional(),
  at: z.number().int().positive().optional(),
  dedupeKey: z.string().min(1).max(256).optional(),
  source: z.literal("manual").optional(), // dashboard's Run now / Re-run
});

const toApiRun = (r: TaskRunRow) => ({
  id: r.id,
  task: r.task,
  state: r.state,
  source: r.source,
  attempt: r.attempt,
  payload: r.payload === null ? null : (JSON.parse(r.payload) as unknown),
  notBefore: r.notBefore,
  createdAt: r.createdAt,
  startedAt: r.startedAt,
  finishedAt: r.finishedAt,
  durationMs: r.durationMs,
  error: r.error,
});

// Chained style is normative: it is what makes hc route-type inference work.
// onError maps thrown errors (TasksError, parseDuration) to 400 — kv-store pattern.
export const tasksRoutes = new Hono<TasksEnv>()
  .onError((err, c) => c.json({ error: err instanceof Error ? err.message : String(err) }, 400))
  .get("/", (c) => {
    const now = Date.now();
    return c.json({
      tasks: listDefs(c.var.tasksDb).map((d) => ({
        name: d.name,
        schedule: d.scheduleKind ? { kind: d.scheduleKind, expr: d.scheduleExpr! } : null,
        retired: d.retired,
        error: d.error,
        nextRun:
          d.scheduleKind && !d.retired && !d.error
            ? nextOccurrence(d.scheduleKind, d.scheduleExpr!, d.registeredAt, now)
            : null,
        lastRun: lastRunOf(c.var.tasksDb, d.name) ?? null,
      })),
    });
  })
  .get("/runs", zValidator("query", runsQuery, validationHook), (c) => {
    const q = c.req.valid("query");
    return c.json({ runs: listRuns(c.var.tasksDb, { ...q, limit: q.limit ?? effectiveNumber("tasks.list_limit", c.var.appId) }).map(toApiRun) });
  })
  .get("/runs/:id", zValidator("param", idParam, validationHook), (c) => {
    const run = getRun(c.var.tasksDb, c.req.valid("param").id);
    if (!run) return c.json({ error: "run not found" }, 404);
    return c.json(toApiRun(run));
  })
  .delete("/runs/:id", zValidator("param", idParam, validationHook), (c) => {
    const { id } = c.req.valid("param");
    const res = cancelRun(c.var.tasksDb, id, Date.now());
    if (res === "not-found") return c.json({ error: "run not found" }, 404);
    if (res === "not-queued") return c.json({ error: "only a queued run can be canceled" }, 409);
    emitRunEvent(c.var.appId, res.task, id, "canceled");
    return c.json({ canceled: true as const });
  })
  .post(
    "/:name/runs",
    zValidator("param", nameParam, validationHook),
    zValidator("json", enqueueBody, validationHook),
    (c) => {
      const { name } = c.req.valid("param");
      const { payload, delay, at, dedupeKey, source } = c.req.valid("json");
      const def = getDef(c.var.tasksDb, name);
      if (!def || def.retired) throw new TasksError(`unknown task "${name}"`);
      if (def.error) throw new TasksError(`task "${name}" has a configuration error: ${def.error}`);
      if (delay != null && at != null) throw new TasksError("delay and at are mutually exclusive");
      const now = Date.now();
      const notBefore = at ?? (delay != null ? now + parseDuration(delay) : now);
      const { runId, deduped } = insertRun(c.var.tasksDb, {
        task: name, payload, notBefore, source: source ?? "enqueue", dedupeKey: dedupeKey ?? null, now,
      });
      if (!deduped) {
        emitRunEvent(c.var.appId, name, runId, "queued");
        tick("tasks-dispatch"); // no-op until the engine registers it (server.ts)
      }
      return c.json({ runId, deduped });
    }
  );

export type TasksRoutes = typeof tasksRoutes;
