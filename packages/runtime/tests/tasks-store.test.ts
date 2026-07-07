import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import {
  ensureSchema, applyManifest, listDefs, getDef, setHighWater, hasTasks,
  insertRun, claimNextDue, finishRun, markInterrupted, listRuns, getRun, lastRunOf,
  cancelRun, sweepRuns,
  DEFAULT_RETRIES, DEFAULT_TIMEOUT_MS, DEFAULT_CATCH_UP_MS, BACKOFF_BASE_MS, BACKOFF_CAP_MS,
  RETENTION_KEEP, RETENTION_MAX_AGE_MS,
  type TaskDefRow,
} from "../src/services/tasks.js";

const T0 = 1_700_000_000_000;
let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  ensureSchema(db);
});

const manifest = (over: object = {}) => [{ name: "digest", cron: "0 9 * * *", ...over }];

describe("applyManifest", () => {
  it("upserts with defaults resolved and validates config", () => {
    applyManifest(db, [{ name: "digest", cron: "0 9 * * *" }, { name: "resize", retries: 5, timeout: "1m" }], T0);
    const digest = getDef(db, "digest")!;
    expect(digest).toMatchObject({
      scheduleKind: "cron", scheduleExpr: "0 9 * * *", retries: DEFAULT_RETRIES,
      timeoutMs: DEFAULT_TIMEOUT_MS, catchUpMs: DEFAULT_CATCH_UP_MS, retired: false, error: null,
      registeredAt: T0,
    });
    expect(getDef(db, "resize")).toMatchObject({ scheduleKind: null, retries: 5, timeoutMs: 60_000 });
    expect(hasTasks(db)).toBe(true);
  });

  it("catchUp false stores null; per-task config errors set the error column without failing siblings", () => {
    applyManifest(db, [
      { name: "strict", every: "1h", catchUp: false },
      { name: "broken", cron: "not a cron" },
      { name: "both", cron: "0 9 * * *", every: "1h" },
      { name: "ok", every: "5m" },
    ], T0);
    expect(getDef(db, "strict")!.catchUpMs).toBeNull();
    expect(getDef(db, "broken")!.error).toBeTruthy();
    expect(getDef(db, "both")!.error).toMatch(/mutually exclusive/);
    expect(getDef(db, "ok")!.error).toBeNull();
  });

  it("catchUp true stores Infinity, round-tripping through the -1 row sentinel on re-apply", () => {
    applyManifest(db, [{ name: "eager", every: "1h", catchUp: true }], T0);
    expect(getDef(db, "eager")!.catchUpMs).toBe(Number.POSITIVE_INFINITY);
    applyManifest(db, [{ name: "eager", every: "1h", catchUp: true }], T0);
    expect(getDef(db, "eager")!.catchUpMs).toBe(Number.POSITIVE_INFINITY);
  });

  it("preserves high-water when the schedule is unchanged, resets it when changed", () => {
    applyManifest(db, manifest(), T0);
    setHighWater(db, "digest", T0 + 1000);
    applyManifest(db, manifest(), T0 + 5000);
    expect(getDef(db, "digest")!.highWater).toBe(T0 + 1000);
    expect(getDef(db, "digest")!.registeredAt).toBe(T0);
    applyManifest(db, manifest({ cron: "30 9 * * *" }), T0 + 9000);
    expect(getDef(db, "digest")!.highWater).toBe(T0 + 9000);
    expect(getDef(db, "digest")!.registeredAt).toBe(T0 + 9000);
  });

  it("retires absent tasks (canceling their queued runs) and un-retires returners", () => {
    applyManifest(db, manifest(), T0);
    const { runId } = insertRun(db, { task: "digest", notBefore: T0, source: "enqueue", now: T0 });
    const r1 = applyManifest(db, [], T0 + 1000);
    expect(getDef(db, "digest")!.retired).toBe(true);
    expect(r1.canceled).toEqual([{ task: "digest", runId }]);
    expect(getRun(db, runId)!.state).toBe("canceled");
    applyManifest(db, manifest(), T0 + 2000);
    expect(getDef(db, "digest")!.retired).toBe(false);
  });
});

describe("runs — insert, dedupe, claim, finish", () => {
  beforeEach(() => applyManifest(db, [{ name: "digest", cron: "0 9 * * *" }, { name: "job", retries: 1 }], T0));

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
    applyManifest(db, [{ name: "job", retries: 1 }], T0); // digest retired
    expect(claimNextDue(db, T0 + 120_000)?.task).toBe("job"); // retired digest's runs not claimable
  });

  it("finishRun: success records duration; failure retries with exponential backoff, then terminal", () => {
    insertRun(db, { task: "job", notBefore: T0, source: "enqueue", now: T0 });
    let run = claimNextDue(db, T0 + 500)!;
    const def = getDef(db, "job")!; // retries: 1
    expect(finishRun(db, run, { ok: false, message: "boom" }, def, T0 + 1500))
      .toEqual({ state: "queued", notBefore: T0 + 1500 + BACKOFF_BASE_MS });
    expect(getRun(db, run.id)).toMatchObject({ state: "queued", attempt: 1, error: "boom", startedAt: null });
    run = claimNextDue(db, T0 + 1500 + BACKOFF_BASE_MS)!;
    expect(run.attempt).toBe(2);
    expect(finishRun(db, run, { ok: false, message: "boom2" }, def, T0 + 40_000).state).toBe("failed");
    expect(getRun(db, run.id)).toMatchObject({ state: "failed", error: "boom2", finishedAt: T0 + 40_000 });
    // success path
    const { runId } = insertRun(db, { task: "job", notBefore: T0, source: "manual", now: T0 });
    const r2 = claimNextDue(db, T0 + 41_000)!;
    expect(r2.id).toBe(runId);
    expect(finishRun(db, r2, { ok: true }, def, T0 + 42_000).state).toBe("succeeded");
    expect(getRun(db, runId)).toMatchObject({ state: "succeeded", durationMs: 1000 });
    expect(lastRunOf(db, "job")).toMatchObject({ runId, state: "succeeded" });
  });

  it("backoff caps at BACKOFF_CAP_MS", () => {
    applyManifest(db, [{ name: "stubborn", retries: 10 }], T0);
    insertRun(db, { task: "stubborn", notBefore: T0, source: "enqueue", now: T0 });
    const def = getDef(db, "stubborn")!;
    let now = T0;
    for (let i = 0; i < 7; i++) {
      const run = claimNextDue(db, now + BACKOFF_CAP_MS)!;
      now = run.startedAt!;
      finishRun(db, run, { ok: false, message: "x" }, def, now);
      now += BACKOFF_CAP_MS;
    }
    const row = listRuns(db, { task: "stubborn" })[0];
    expect(row.attempt).toBe(7); // 2^6 * 30s = 32m > cap
    expect(row.notBefore - (now - BACKOFF_CAP_MS)).toBe(BACKOFF_CAP_MS);
  });

  it("markInterrupted applies the failed-attempt rule to running rows", () => {
    insertRun(db, { task: "job", notBefore: T0, source: "enqueue", now: T0 });
    insertRun(db, { task: "digest", notBefore: T0, source: "schedule", now: T0 });
    const a = claimNextDue(db, T0 + 1)!;
    finishRun(db, a, { ok: true }, getDef(db, a.task)!, T0 + 2); // not running: untouched
    const b = claimNextDue(db, T0 + 3)!;
    const transitions = markInterrupted(db, T0 + 10_000);
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
    applyManifest(db, [{ name: "digest", cron: "0 9 * * *" }], T0 + 2); // job retired mid-run
    const def = getDef(db, "job")!; // retries: 1 — retry budget remains
    expect(finishRun(db, run, { ok: false, message: "boom" }, def, T0 + 3).state).toBe("failed");
    expect(getRun(db, run.id)).toMatchObject({ state: "failed", error: "boom" });
  });
});

describe("sweepRuns", () => {
  it("prunes terminal runs beyond last-100 AND older than 30 days; never queued/running", () => {
    applyManifest(db, [{ name: "job" }], T0);
    const def = getDef(db, "job")!;
    const old = T0 - RETENTION_MAX_AGE_MS - 1000;
    for (let i = 0; i < 105; i++) {
      insertRun(db, { task: "job", notBefore: old, source: "enqueue", now: old + i });
      const run = claimNextDue(db, old + i)!;
      finishRun(db, run, { ok: true }, def, old + i);
    }
    insertRun(db, { task: "job", notBefore: old, source: "enqueue", dedupeKey: "keepq", now: old });
    // 105 old terminal runs: rank 101..105 are both over-count and over-age -> swept.
    expect(sweepRuns(db, T0)).toBe(5);
    expect(listRuns(db, { task: "job", limit: 200 }).length).toBe(101); // 100 terminal + 1 queued
    // age alone never sweeps within the newest 100:
    expect(sweepRuns(db, T0)).toBe(0);
  });
});
