import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { applyMigrations } from "../src/migrations.js";
import { APP_DB_CHAIN } from "../src/migrations/appDb.js";
import {
  applyManifest, getDef, setHighWater, hasTasks,
  insertRun, claimNextDue, finishRun, markInterrupted, listRuns, getRun, lastRunOf,
  cancelRun, sweepRuns, getTasksDb,
  type TaskDefRow,
} from "../src/services/tasks.js";

const T0 = 1_700_000_000_000;
// Test-local policy numbers (the platform catalog owns the real defaults now).
const BACKOFF_BASE = 30_000;
const BACKOFF_CAP = 600_000;
const KEEP = 100;
const MAX_AGE = 30 * 86_400_000;
const LIMITS = { minEveryMs: 60_000 };

// Mirrors taskEngine's policyFor: the def's declared retries/retired, else the
// effective default — here the catalog's tasks.default_retries (3) stands in.
const polFor = (def: TaskDefRow | undefined) => ({
  retries: def?.retries ?? 3,
  backoffBaseMs: BACKOFF_BASE,
  backoffCapMs: BACKOFF_CAP,
  retired: def?.retired ?? true,
});

let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  applyMigrations(db, APP_DB_CHAIN);
});

const manifest = (over: object = {}) => [{ name: "digest", cron: "0 9 * * *", ...over }];

describe("applyManifest", () => {
  it("defs keep explicit config as-declared and NULL for unspecified (effective resolution is the engine's)", () => {
    applyManifest(db, [{ name: "a" }, { name: "b", retries: 1, timeout: "1m", catchUp: false }], 1000, LIMITS);
    expect(getDef(db, "a")).toMatchObject({ retries: null, timeoutMs: null, catchUpMs: null });
    expect(getDef(db, "b")).toMatchObject({ retries: 1, timeoutMs: 60_000, catchUpMs: 0 });
  });

  it("v0 defs tables are rebuilt by the app-db migration chain (user_version)", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-tasksmig-"));
    try {
      const appDir = path.join(dataDir, "legacy");
      fs.mkdirSync(appDir, { recursive: true });
      const raw = new Database(path.join(appDir, "db.sqlite"));
      raw.exec(`CREATE TABLE _lodekit_task_defs (
        name TEXT PRIMARY KEY, schedule_kind TEXT, schedule_expr TEXT, catch_up_ms INTEGER,
        retries INTEGER NOT NULL, timeout_ms INTEGER NOT NULL, retired INTEGER NOT NULL DEFAULT 0,
        error TEXT, registered_at INTEGER NOT NULL, high_water INTEGER)`);
      raw.prepare(`INSERT INTO _lodekit_task_defs (name, retries, timeout_ms, registered_at) VALUES ('old', 3, 300000, 1)`).run();
      raw.close();
      const db2 = getTasksDb(dataDir, "legacy"); // first open triggers the migration chain → v0 rebuild
      expect(db2.pragma("user_version", { simple: true })).toBe(1);
      expect(getDef(db2, "old")).toBeUndefined(); // rebuilt empty; next boot re-registers
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("upserts declared config (unspecified stays NULL) and validates config", () => {
    applyManifest(db, [{ name: "digest", cron: "0 9 * * *" }, { name: "resize", retries: 5, timeout: "1m" }], T0, LIMITS);
    const digest = getDef(db, "digest")!;
    expect(digest).toMatchObject({
      scheduleKind: "cron", scheduleExpr: "0 9 * * *", retries: null,
      timeoutMs: null, catchUpMs: null, retired: false, error: null,
      registeredAt: T0,
    });
    expect(getDef(db, "resize")).toMatchObject({ scheduleKind: null, retries: 5, timeoutMs: 60_000 });
    expect(hasTasks(db)).toBe(true);
  });

  it("catchUp false stores 0; per-task config errors set the error column without failing siblings", () => {
    applyManifest(db, [
      { name: "strict", every: "1h", catchUp: false },
      { name: "broken", cron: "not a cron" },
      { name: "both", cron: "0 9 * * *", every: "1h" },
      { name: "ok", every: "5m" },
    ], T0, LIMITS);
    expect(getDef(db, "strict")!.catchUpMs).toBe(0);
    expect(getDef(db, "broken")!.error).toBeTruthy();
    expect(getDef(db, "both")!.error).toMatch(/mutually exclusive/);
    expect(getDef(db, "ok")!.error).toBeNull();
  });

  it("catchUp true stores Infinity, round-tripping through the -1 row sentinel on re-apply", () => {
    applyManifest(db, [{ name: "eager", every: "1h", catchUp: true }], T0, LIMITS);
    expect(getDef(db, "eager")!.catchUpMs).toBe(Number.POSITIVE_INFINITY);
    applyManifest(db, [{ name: "eager", every: "1h", catchUp: true }], T0, LIMITS);
    expect(getDef(db, "eager")!.catchUpMs).toBe(Number.POSITIVE_INFINITY);
  });

  it("preserves high-water when the schedule is unchanged, resets it when changed", () => {
    applyManifest(db, manifest(), T0, LIMITS);
    setHighWater(db, "digest", T0 + 1000);
    applyManifest(db, manifest(), T0 + 5000, LIMITS);
    expect(getDef(db, "digest")!.highWater).toBe(T0 + 1000);
    expect(getDef(db, "digest")!.registeredAt).toBe(T0);
    applyManifest(db, manifest({ cron: "30 9 * * *" }), T0 + 9000, LIMITS);
    expect(getDef(db, "digest")!.highWater).toBe(T0 + 9000);
    expect(getDef(db, "digest")!.registeredAt).toBe(T0 + 9000);
  });

  it("retires absent tasks (canceling their queued runs) and un-retires returners", () => {
    applyManifest(db, manifest(), T0, LIMITS);
    const { runId } = insertRun(db, { task: "digest", notBefore: T0, source: "enqueue", now: T0 });
    const r1 = applyManifest(db, [], T0 + 1000, LIMITS);
    expect(getDef(db, "digest")!.retired).toBe(true);
    expect(r1.canceled).toEqual([{ task: "digest", runId }]);
    expect(getRun(db, runId)!.state).toBe("canceled");
    applyManifest(db, manifest(), T0 + 2000, LIMITS);
    expect(getDef(db, "digest")!.retired).toBe(false);
  });
});

describe("runs — insert, dedupe, claim, finish", () => {
  beforeEach(() => applyManifest(db, [{ name: "digest", cron: "0 9 * * *" }, { name: "job", retries: 1 }], T0, LIMITS));

  it("dedupeKey is a no-op against a queued run of the same task", () => {
    const a = insertRun(db, { task: "job", notBefore: T0, source: "enqueue", dedupeKey: "k", now: T0 });
    const b = insertRun(db, { task: "job", notBefore: T0, source: "enqueue", dedupeKey: "k", now: T0 + 1 });
    expect(b).toEqual({ runId: a.runId, deduped: true });
    // different task, same key: no dedupe
    const c = insertRun(db, { task: "digest", notBefore: T0, source: "enqueue", dedupeKey: "k", now: T0 });
    expect(c.deduped).toBe(false);
  });

  it("claimNextDue takes the oldest due run, skips future/retired, and marks it running", () => {
    insertRun(db, { task: "job", notBefore: T0 + 60_000, source: "enqueue", now: T0 }); // future
    const { runId } = insertRun(db, { task: "digest", notBefore: T0, source: "enqueue", now: T0 });
    const claimed = claimNextDue(db, T0 + 1)!;
    expect(claimed.id).toBe(runId);
    expect(claimed).toMatchObject({ state: "running", attempt: 1, startedAt: T0 + 1 });
    expect(claimNextDue(db, T0 + 1)).toBeUndefined(); // only the future run remains
    applyManifest(db, [{ name: "job", retries: 1 }], T0, LIMITS); // digest retired
    expect(claimNextDue(db, T0 + 120_000)?.task).toBe("job"); // retired digest's runs not claimable
  });

  it("finishRun: success records duration; failure retries with exponential backoff, then terminal", () => {
    insertRun(db, { task: "job", notBefore: T0, source: "enqueue", now: T0 });
    let run = claimNextDue(db, T0 + 500)!;
    const def = getDef(db, "job")!; // retries: 1
    expect(finishRun(db, run, { ok: false, message: "boom" }, polFor(def), T0 + 1500))
      .toEqual({ state: "queued", notBefore: T0 + 1500 + BACKOFF_BASE });
    expect(getRun(db, run.id)).toMatchObject({ state: "queued", attempt: 1, error: "boom", startedAt: null });
    run = claimNextDue(db, T0 + 1500 + BACKOFF_BASE)!;
    expect(run.attempt).toBe(2);
    expect(finishRun(db, run, { ok: false, message: "boom2" }, polFor(def), T0 + 40_000).state).toBe("failed");
    expect(getRun(db, run.id)).toMatchObject({ state: "failed", error: "boom2", finishedAt: T0 + 40_000 });
    // success path
    const { runId } = insertRun(db, { task: "job", notBefore: T0, source: "manual", now: T0 });
    const r2 = claimNextDue(db, T0 + 41_000)!;
    expect(r2.id).toBe(runId);
    expect(finishRun(db, r2, { ok: true }, polFor(def), T0 + 42_000).state).toBe("succeeded");
    expect(getRun(db, runId)).toMatchObject({ state: "succeeded", durationMs: 1000 });
    expect(lastRunOf(db, "job")).toMatchObject({ runId, state: "succeeded" });
  });

  it("backoff caps at the policy cap", () => {
    applyManifest(db, [{ name: "stubborn", retries: 10 }], T0, LIMITS);
    insertRun(db, { task: "stubborn", notBefore: T0, source: "enqueue", now: T0 });
    const def = getDef(db, "stubborn")!;
    let now = T0;
    for (let i = 0; i < 7; i++) {
      const run = claimNextDue(db, now + BACKOFF_CAP)!;
      now = run.startedAt!;
      finishRun(db, run, { ok: false, message: "x" }, polFor(def), now);
      now += BACKOFF_CAP;
    }
    const row = listRuns(db, { task: "stubborn" })[0];
    expect(row.attempt).toBe(7); // 2^6 * 30s = 32m > cap
    expect(row.notBefore - (now - BACKOFF_CAP)).toBe(BACKOFF_CAP);
  });

  it("markInterrupted applies the failed-attempt rule to running rows", () => {
    insertRun(db, { task: "job", notBefore: T0, source: "enqueue", now: T0 });
    insertRun(db, { task: "digest", notBefore: T0, source: "schedule", now: T0 });
    const a = claimNextDue(db, T0 + 1)!;
    finishRun(db, a, { ok: true }, polFor(getDef(db, a.task)), T0 + 2); // not running: untouched
    const b = claimNextDue(db, T0 + 3)!;
    const transitions = markInterrupted(db, T0 + 10_000, polFor);
    expect(transitions).toEqual([{ task: b.task, runId: b.id, state: "queued" }]);
    expect(getRun(db, b.id)).toMatchObject({ state: "queued", attempt: 1, error: expect.stringContaining("interrupted") });
  });

  it("cancelRun cancels queued only", () => {
    const { runId } = insertRun(db, { task: "job", notBefore: T0, source: "enqueue", now: T0 });
    expect(cancelRun(db, 99_999, T0)).toBe("not-found");
    expect(cancelRun(db, runId, T0 + 1)).toEqual({ task: "job" });
    expect(getRun(db, runId)!.state).toBe("canceled");
    expect(cancelRun(db, runId, T0 + 2)).toBe("not-queued");
  });

  it("a failing run of a retired def goes terminal instead of requeueing (no orphan)", () => {
    insertRun(db, { task: "job", notBefore: T0, source: "enqueue", now: T0 });
    const run = claimNextDue(db, T0 + 1)!;
    applyManifest(db, [{ name: "digest", cron: "0 9 * * *" }], T0 + 2, LIMITS); // job retired mid-run
    const def = getDef(db, "job")!; // retries: 1 — retry budget remains
    expect(finishRun(db, run, { ok: false, message: "boom" }, polFor(def), T0 + 3).state).toBe("failed");
    expect(getRun(db, run.id)).toMatchObject({ state: "failed", error: "boom" });
  });
});

describe("sweepRuns", () => {
  it("prunes terminal runs beyond last-100 AND older than 30 days; never queued/running", () => {
    applyManifest(db, [{ name: "job" }], T0, LIMITS);
    const def = getDef(db, "job")!;
    const old = T0 - MAX_AGE - 1000;
    for (let i = 0; i < 105; i++) {
      insertRun(db, { task: "job", notBefore: old, source: "enqueue", now: old + i });
      const run = claimNextDue(db, old + i)!;
      finishRun(db, run, { ok: true }, polFor(def), old + i);
    }
    insertRun(db, { task: "job", notBefore: old, source: "enqueue", dedupeKey: "keepq", now: old });
    // 105 old terminal runs: rank 101..105 are both over-count and over-age -> swept.
    expect(sweepRuns(db, T0, KEEP, MAX_AGE)).toBe(5);
    expect(listRuns(db, { task: "job", limit: 200 }).length).toBe(101); // 100 terminal + 1 queued
    // age alone never sweeps within the newest 100:
    expect(sweepRuns(db, T0, KEEP, MAX_AGE)).toBe(0);
  });
});
