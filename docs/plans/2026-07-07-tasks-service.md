# Tasks Service (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tasks service per `docs/specs/2026-07-06-tasks-service-design.md` — queue + cron/interval schedules + retries + durable run history, executing app-exported handlers in app workers, with SSE events, an SDK handle, and a dashboard panel.

**Architecture:** A new catalog service (`services/tasks.ts`: per-app SQLite tables `_lodekit_task_defs`/`_lodekit_task_runs`, Hono router, SSE) plus a runtime-internal dispatch engine (`taskEngine.ts`) that rides the existing internal scheduler (`every("tasks-dispatch", 1s)`), invokes handlers through a new `task-run` worker message, and enforces serial-per-app / parallel-across-apps. Apps declare tasks in `src/tasks.ts` via an SDK `task()` wrapper; the Start build emits a separate `server/tasks.js` bundle; the worker loads it and posts a task manifest on boot.

**Tech Stack:** TypeScript (tsx, buildless), Hono + zod + `hc` typed RPC, better-sqlite3, `croner` (cron parsing — the one new dependency), Vite ssr build, vitest.

## Global Constraints

- Work on the current branch (`service`), commit per task. Do NOT merge/rebase into `master` — the person integrates. No `Co-Authored-By` trailers.
- Catalog name / URL segment: `tasks`. SSE event: `tasks-change`. SDK handle: `tasks`.
- Task name = kebab-case of the `src/tasks.ts` export identifier (`dailyDigest` → `daily-digest`), grammar `^[a-z0-9-]+$`.
- Run states: `queued → running → succeeded | failed | canceled`. Retrying = `queued` with `attempt > 0` and future `not_before`.
- Defaults (spec §7; all noted in roadmap as future settings — do not make them configurable now): `retries` 3, `timeout` "5m", `catchUp` "1h", backoff `30s·2^(attempt−1)` capped at 10m, dispatch poll 1s, retention keep last 100 runs or 30 days per task (whichever keeps more).
- Duration grammar (shared): `<number><s|m|h|d>` — e.g. `"30s"`, `"10m"`, `"6h"`.
- Cron: 5-field, machine-local timezone, parsed with `croner` — never hand-rolled.
- Concurrency: at most one in-flight run per app; apps run in parallel.
- Delivery: at-least-once. Worker down at claim time → runs wait, no attempt consumed. Crash/timeout mid-run → attempt consumed.
- Payload: JSON under the existing 100kb `bodyLimit`.
- All storage functions take `now` as a parameter; the engine takes injectable deps (`now`, `invoke`, `workerRunning`) — tests never sleep on real timers.
- Follow existing file style exactly (kv-store.ts is the template for the service; scheduler.ts stays untouched).
- Surgical changes only: don't touch the logging slice's files/concerns (that's the `stack` branch); the `tasks`-source log calls land with whichever slice ships second (spec §8).

## File Map

| File | Role |
| --- | --- |
| Create `packages/runtime/src/duration.ts` | `parseDuration` — shared duration-string parser |
| Create `packages/runtime/src/taskSchedule.ts` | Pure occurrence math over `croner`: `dueOccurrence`, `nextOccurrence`, `validateSchedule` |
| Create `packages/runtime/src/services/tasks.ts` | Catalog service: schema, def/run storage, retention sweep, router + `TasksRoutes`, `withTasks`, SSE emit |
| Create `packages/runtime/src/taskEngine.ts` | Dispatcher: manifest registration, schedule materialization, claim/invoke/finish, recovery, injectable deps |
| Modify `packages/runtime/src/routes.ts` | Mount the tasks service |
| Modify `packages/runtime/src/build.ts` | Emit `server/tasks.js` when `src/tasks.ts` exists |
| Modify `packages/runtime/src/appWorker.ts` | `task-run`/`task-result`/`tasks-manifest` protocol, `runTaskInWorker`, `onTasksManifest` |
| Modify `packages/runtime/src/appWorkerEntry.mjs` | Load tasks bundle, post manifest, run handlers |
| Modify `packages/runtime/src/server.ts` | Engine init, recovery, `tasks-dispatch`/`tasks-sweep` scheduler registrations |
| Modify `packages/runtime/package.json` | `croner` dep; export `./services/tasks` subpath |
| Create `packages/sdk/src/task.ts` | `task()` declaration wrapper + types |
| Modify `packages/sdk/src/client.ts` + `index.ts` | `Tasks` handle (hc-typed), `tasks` singleton, re-exports |
| Modify `packages/runtime/dashboard/src/routes/index.tsx` | Per-app Tasks panel |
| Tests | `tests/duration.test.ts`, `tests/task-schedule.test.ts`, `tests/tasks-store.test.ts`, `tests/tasks-api.test.ts`, `tests/task-worker.test.ts`, `tests/task-engine.test.ts`, `tests/tasks-e2e.test.ts`, `packages/sdk/tests/task.test.ts` |

---

### Task 1: `parseDuration` — the shared duration grammar

**Files:**
- Create: `packages/runtime/src/duration.ts`
- Test: `packages/runtime/tests/duration.test.ts`

**Interfaces:**
- Produces: `parseDuration(input: string): number` — milliseconds; throws `Error("invalid duration ...")` on anything outside `<positive number><s|m|h|d>`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/runtime/tests/duration.test.ts
import { describe, it, expect } from "vitest";
import { parseDuration } from "../src/duration.js";

describe("parseDuration", () => {
  it("parses s/m/h/d", () => {
    expect(parseDuration("30s")).toBe(30_000);
    expect(parseDuration("10m")).toBe(600_000);
    expect(parseDuration("6h")).toBe(21_600_000);
    expect(parseDuration("2d")).toBe(172_800_000);
    expect(parseDuration("1.5h")).toBe(5_400_000);
  });

  it("rejects bad grammar", () => {
    for (const bad of ["", "5", "s", "5 m", "5ms", "-5m", "5mm", "1h30m", "Infinity", "0m"]) {
      expect(() => parseDuration(bad), bad).toThrow(/invalid duration/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/duration.test.ts`
Expected: FAIL — cannot find module `../src/duration.js`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/runtime/src/duration.ts
// Shared short-duration grammar (spec §4): "<number><s|m|h|d>", e.g. "30s", "10m", "6h".
const RE = /^(\d+(?:\.\d+)?)(s|m|h|d)$/;
const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

export function parseDuration(input: string): number {
  const m = RE.exec(input);
  const value = m ? Number(m[1]) : 0;
  if (!m || !(value > 0)) throw new Error(`invalid duration "${input}" (expected e.g. "30s", "10m", "6h")`);
  return Math.round(value * UNIT_MS[m[2] as keyof typeof UNIT_MS]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/duration.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/duration.ts packages/runtime/tests/duration.test.ts
git commit -m "feat(runtime): parseDuration — shared short-duration grammar for the tasks service"
```

---

### Task 2: Schedule occurrence math (`taskSchedule.ts` + croner)

**Files:**
- Create: `packages/runtime/src/taskSchedule.ts`
- Modify: `packages/runtime/package.json` (add `"croner": "^9.0.0"` to dependencies)
- Test: `packages/runtime/tests/task-schedule.test.ts`

**Interfaces:**
- Consumes: `parseDuration` (Task 1).
- Produces:
  - `type ScheduleKind = "cron" | "every"`
  - `validateSchedule(kind: ScheduleKind, expr: string): void` — throws on a bad cron expression / bad or sub-minute `every` duration.
  - `dueOccurrence(opts: { kind: ScheduleKind; expr: string; anchor: number; highWater: number; catchUpMs: number | null; now: number }): { occurrence: number | null; highWater: number }` — latest occurrence in `(highWater, now]`; `occurrence` non-null only when within the catch-up window; `highWater` always advances past everything considered. `catchUpMs: null` = catch-up disabled (`catchUp: false`).
  - `nextOccurrence(kind: ScheduleKind, expr: string, anchor: number, now: number): number | null` — next occurrence strictly after `now` (for the dashboard's next-run display).
  - `GRACE_MS = 30_000` — dispatch-latency floor: an occurrence always fires if it's within `max(catchUpMs ?? 0, GRACE_MS)` of `now`. Without this floor, `catchUp: false` (window 0) could never fire at all — every dispatch is at least poll-latency late. Spec-consistent clarification.

- [ ] **Step 1: Add the dependency**

In `packages/runtime/package.json` dependencies (alphabetical position, after `chokidar`):

```json
    "croner": "^9.0.0",
```

Run: `pnpm install` **from the repo root** (never from inside `manager/`).
Expected: lockfile updated, `croner` resolvable.

- [ ] **Step 2: Write the failing test**

```ts
// packages/runtime/tests/task-schedule.test.ts
import { describe, it, expect } from "vitest";
import { dueOccurrence, nextOccurrence, validateSchedule, GRACE_MS } from "../src/taskSchedule.js";

const HOUR = 3_600_000;
// Anchor all cron tests at a fixed local-midnight so "0 9 * * *" is deterministic.
const midnight = new Date(2026, 0, 5, 0, 0, 0, 0).getTime(); // Mon Jan 5 2026, local
const nineAm = new Date(2026, 0, 5, 9, 0, 0, 0).getTime();

describe("validateSchedule", () => {
  it("accepts 5-field cron and >=1m every", () => {
    validateSchedule("cron", "0 9 * * *");
    validateSchedule("every", "30m");
  });
  it("rejects bad cron, bad duration, sub-minute every", () => {
    expect(() => validateSchedule("cron", "not a cron")).toThrow();
    expect(() => validateSchedule("every", "nope")).toThrow(/invalid duration/);
    expect(() => validateSchedule("every", "30s")).toThrow(/at least/);
  });
});

describe("dueOccurrence — cron", () => {
  const base = { kind: "cron" as const, expr: "0 9 * * *", anchor: midnight, catchUpMs: HOUR };

  it("no occurrence yet: null, high-water unchanged", () => {
    const r = dueOccurrence({ ...base, highWater: midnight, now: nineAm - 1 });
    expect(r).toEqual({ occurrence: null, highWater: midnight });
  });

  it("due within the window: fires and advances high-water", () => {
    const r = dueOccurrence({ ...base, highWater: midnight, now: nineAm + 5 * 60_000 });
    expect(r).toEqual({ occurrence: nineAm, highWater: nineAm });
  });

  it("outside the window: drops but still advances high-water", () => {
    const r = dueOccurrence({ ...base, highWater: midnight, now: nineAm + 2 * HOUR });
    expect(r).toEqual({ occurrence: null, highWater: nineAm });
  });

  it("multiple missed occurrences coalesce to the latest", () => {
    // Two 9ams missed (runtime off for two days); only the latest fires.
    const now = nineAm + 24 * HOUR + 10 * 60_000;
    const r = dueOccurrence({ ...base, highWater: midnight, now });
    expect(r).toEqual({ occurrence: nineAm + 24 * HOUR, highWater: nineAm + 24 * HOUR });
  });

  it("catchUp disabled (null): only fires within the grace floor", () => {
    const late = dueOccurrence({ ...base, catchUpMs: null, highWater: midnight, now: nineAm + GRACE_MS + 1 });
    expect(late.occurrence).toBeNull();
    expect(late.highWater).toBe(nineAm);
    const onTime = dueOccurrence({ ...base, catchUpMs: null, highWater: midnight, now: nineAm + 1_000 });
    expect(onTime.occurrence).toBe(nineAm);
  });
});

describe("dueOccurrence — every", () => {
  const base = { kind: "every" as const, expr: "1h", anchor: midnight, catchUpMs: HOUR };

  it("fires at anchor + k*interval, never at the anchor itself", () => {
    expect(dueOccurrence({ ...base, highWater: midnight, now: midnight + HOUR - 1 }).occurrence).toBeNull();
    const r = dueOccurrence({ ...base, highWater: midnight, now: midnight + HOUR + 1_000 });
    expect(r).toEqual({ occurrence: midnight + HOUR, highWater: midnight + HOUR });
  });

  it("coalesces a gap to the latest interval tick", () => {
    const r = dueOccurrence({ ...base, highWater: midnight, now: midnight + 5 * HOUR + 1_000 });
    expect(r).toEqual({ occurrence: midnight + 5 * HOUR, highWater: midnight + 5 * HOUR });
  });
});

describe("nextOccurrence", () => {
  it("cron: next match strictly after now", () => {
    expect(nextOccurrence("cron", "0 9 * * *", midnight, nineAm)).toBe(nineAm + 24 * HOUR);
    expect(nextOccurrence("cron", "0 9 * * *", midnight, midnight)).toBe(nineAm);
  });
  it("every: anchor + next interval tick", () => {
    expect(nextOccurrence("every", "1h", midnight, midnight)).toBe(midnight + HOUR);
    expect(nextOccurrence("every", "1h", midnight, midnight + 90 * 60_000)).toBe(midnight + 2 * HOUR);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/task-schedule.test.ts`
Expected: FAIL — cannot find module `../src/taskSchedule.js`.

- [ ] **Step 4: Write the implementation**

```ts
// packages/runtime/src/taskSchedule.ts
// Pure schedule/occurrence math for the tasks service (spec §7). All times epoch ms.
// Cron parsing is croner's job — 5-field expressions, machine-local timezone.
import { Cron } from "croner";
import { parseDuration } from "./duration.js";

export type ScheduleKind = "cron" | "every";

// Dispatch-latency floor for the catch-up window: an occurrence within GRACE_MS of
// `now` always fires, even with catchUp disabled — otherwise a window of 0 could
// never fire (every dispatch is at least poll-latency late).
export const GRACE_MS = 30_000;

const MIN_EVERY_MS = 60_000;

export function validateSchedule(kind: ScheduleKind, expr: string): void {
  if (kind === "cron") {
    new Cron(expr); // throws on a bad expression
    return;
  }
  if (parseDuration(expr) < MIN_EVERY_MS) {
    throw new Error(`every "${expr}" is below the minimum interval (at least "1m")`);
  }
}

// Latest occurrence t with highWater < t <= now (occurrences strictly after the
// anchor for "every"). Coalescing is structural: only the latest can fire; the
// returned highWater skips everything considered, fired or dropped.
export function dueOccurrence(opts: {
  kind: ScheduleKind;
  expr: string;
  anchor: number;
  highWater: number;
  catchUpMs: number | null;
  now: number;
}): { occurrence: number | null; highWater: number } {
  const { kind, expr, anchor, highWater, catchUpMs, now } = opts;
  let latest: number | null = null;
  if (kind === "every") {
    const interval = parseDuration(expr);
    const k = Math.floor((now - anchor) / interval);
    const t = anchor + k * interval;
    if (k >= 1 && t > highWater) latest = t;
  } else {
    const cron = new Cron(expr);
    let cursor = new Date(highWater);
    for (;;) {
      const next = cron.nextRun(cursor);
      if (!next || next.getTime() > now) break;
      latest = next.getTime();
      cursor = next;
    }
  }
  if (latest === null) return { occurrence: null, highWater };
  const window = Math.max(catchUpMs ?? 0, GRACE_MS);
  return { occurrence: now - latest <= window ? latest : null, highWater: latest };
}

export function nextOccurrence(kind: ScheduleKind, expr: string, anchor: number, now: number): number | null {
  if (kind === "every") {
    const interval = parseDuration(expr);
    const k = Math.floor(Math.max(0, now - anchor) / interval) + 1;
    return anchor + k * interval;
  }
  const next = new Cron(expr).nextRun(new Date(now));
  return next ? next.getTime() : null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/task-schedule.test.ts`
Expected: PASS. If the "never at the anchor itself" or "strictly after now" cases fail, check croner's `nextRun` boundary semantics (it must be strictly-after; adjust the cursor by +1ms if croner ever returns the cursor time itself).

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/taskSchedule.ts packages/runtime/tests/task-schedule.test.ts packages/runtime/package.json pnpm-lock.yaml
git commit -m "feat(runtime): task schedule occurrence math — croner-backed cron/every with catch-up window"
```

---

### Task 3: Tasks storage — schema, defs, runs, retention (`services/tasks.ts`, storage half)

**Files:**
- Create: `packages/runtime/src/services/tasks.ts` (storage half — the router is Task 4)
- Test: `packages/runtime/tests/tasks-store.test.ts`

**Interfaces:**
- Consumes: `getAppDb`/`openDbs` (`../db.js`), `validateSchedule`/`ScheduleKind` (Task 2), `parseDuration` (Task 1).
- Produces (all consumed by Tasks 4/8/9 — signatures are load-bearing):
  - `CATALOG_NAME = "tasks"`
  - `interface TaskDefRow { name: string; scheduleKind: ScheduleKind | null; scheduleExpr: string | null; catchUpMs: number | null; retries: number; timeoutMs: number; retired: boolean; error: string | null; registeredAt: number; highWater: number | null }`
  - `interface TaskRunRow { id: number; task: string; state: "queued"|"running"|"succeeded"|"failed"|"canceled"; payload: string | null; dedupeKey: string | null; attempt: number; notBefore: number; source: "enqueue"|"schedule"|"manual"; createdAt: number; startedAt: number | null; finishedAt: number | null; durationMs: number | null; error: string | null }`
  - `interface ManifestTask { name: string; cron?: string; every?: string; catchUp?: string | false; retries?: number; timeout?: string }`
  - `getTasksDb(dataDir: string, appId: string): Database.Database` (lazy schema, `WeakSet` pattern) and `ensureSchema(db): void`
  - `hasQueuedScheduleRun(db, task: string): boolean` — the absorb-next-occurrence guard (spec §7 step 1)
  - `applyManifest(db, tasks: ManifestTask[], now: number): { canceled: { task: string; runId: number }[] }`
  - `listDefs(db): TaskDefRow[]`, `getDef(db, name): TaskDefRow | undefined`, `setHighWater(db, name, highWater): void`, `hasTasks(db): boolean`
  - `insertRun(db, opts: { task: string; payload?: unknown; notBefore: number; source: TaskRunRow["source"]; dedupeKey?: string | null; now: number }): { runId: number; deduped: boolean }`
  - `claimNextDue(db, now): TaskRunRow | undefined` — oldest due queued run of a live (non-retired, non-error) def, atomically marked `running` with `attempt+1`/`startedAt`
  - `finishRun(db, run: TaskRunRow, result: { ok: boolean; message?: string }, def: TaskDefRow, now): { state: "succeeded"|"failed"|"queued"; notBefore?: number }`
  - `markInterrupted(db, now): { task: string; runId: number; state: "queued"|"failed" }[]`
  - `listRuns(db, opts: { task?: string; state?: TaskRunRow["state"]; limit?: number }): TaskRunRow[]` (newest-first), `getRun(db, id): TaskRunRow | undefined`, `lastRunOf(db, task): { runId: number; state: TaskRunRow["state"]; finishedAt: number | null; error: string | null } | undefined`
  - `cancelRun(db, id, now): { task: string } | "not-queued" | "not-found"`
  - `sweepRuns(db, now): number`, `sweepAllTaskRuns(): void`
  - Constants: `DEFAULT_RETRIES = 3`, `DEFAULT_TIMEOUT_MS = 300_000`, `DEFAULT_CATCH_UP_MS = 3_600_000`, `BACKOFF_BASE_MS = 30_000`, `BACKOFF_CAP_MS = 600_000`, `RETENTION_KEEP = 100`, `RETENTION_MAX_AGE_MS = 2_592_000_000`
  - `emitTasksChange(appId: string, data: { task: string; runId?: number; state?: string; error?: string }): void` — broadcasts `tasks-change` (kv-store `emit` pattern)

- [ ] **Step 1: Write the failing tests**

```ts
// packages/runtime/tests/tasks-store.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/tasks-store.test.ts`
Expected: FAIL — cannot find module `../src/services/tasks.js`.

- [ ] **Step 3: Write the storage half of `services/tasks.ts`**

```ts
// packages/runtime/src/services/tasks.ts
import type Database from "better-sqlite3";
import { getAppDb, openDbs } from "../db.js";
import { broadcast } from "../sse.js";
import { parseDuration } from "../duration.js";
import { validateSchedule, type ScheduleKind } from "../taskSchedule.js";

export const CATALOG_NAME = "tasks";

// Defaults and thresholds (spec §7/§9; roadmap: become settings later).
export const DEFAULT_RETRIES = 3;
export const DEFAULT_TIMEOUT_MS = 300_000;      // "5m"
export const DEFAULT_CATCH_UP_MS = 3_600_000;   // "1h"
export const BACKOFF_BASE_MS = 30_000;
export const BACKOFF_CAP_MS = 600_000;          // 10m
export const RETENTION_KEEP = 100;
export const RETENTION_MAX_AGE_MS = 30 * 86_400_000;

export interface TaskDefRow {
  name: string;
  scheduleKind: ScheduleKind | null;
  scheduleExpr: string | null;
  catchUpMs: number | null;   // null = catch-up disabled (catchUp: false)
  retries: number;
  timeoutMs: number;
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
  catchUp?: string | false;
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

const ensured = new WeakSet<Database.Database>();

export function getTasksDb(dataDir: string, appId: string): Database.Database {
  const db = getAppDb(dataDir, appId);
  if (!ensured.has(db)) {
    ensureSchema(db);
    ensured.add(db);
  }
  return db;
}

export function ensureSchema(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS _lodekit_task_defs (
      name          TEXT PRIMARY KEY,
      schedule_kind TEXT,
      schedule_expr TEXT,
      catch_up_ms   INTEGER,
      retries       INTEGER NOT NULL,
      timeout_ms    INTEGER NOT NULL,
      retired       INTEGER NOT NULL DEFAULT 0,
      error         TEXT,
      registered_at INTEGER NOT NULL,
      high_water    INTEGER
    );
    CREATE TABLE IF NOT EXISTS _lodekit_task_runs (
      id          INTEGER PRIMARY KEY,
      task        TEXT NOT NULL,
      state       TEXT NOT NULL,
      payload     TEXT,
      dedupe_key  TEXT,
      attempt     INTEGER NOT NULL DEFAULT 0,
      not_before  INTEGER NOT NULL,
      source      TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      started_at  INTEGER,
      finished_at INTEGER,
      duration_ms INTEGER,
      error       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_task_runs_due ON _lodekit_task_runs(state, not_before);
    CREATE INDEX IF NOT EXISTS idx_task_runs_task ON _lodekit_task_runs(task, id);`
  );
}

interface DefDbRow {
  name: string; schedule_kind: string | null; schedule_expr: string | null;
  catch_up_ms: number | null; retries: number; timeout_ms: number; retired: number;
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
  catchUpMs: r.catch_up_ms,
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

// Resolves one manifest task's config; throws on any invalid piece.
function resolveConfig(t: ManifestTask): {
  scheduleKind: ScheduleKind | null; scheduleExpr: string | null;
  catchUpMs: number | null; retries: number; timeoutMs: number;
} {
  if (t.cron != null && t.every != null) throw new Error("cron and every are mutually exclusive");
  const scheduleKind: ScheduleKind | null = t.cron != null ? "cron" : t.every != null ? "every" : null;
  const scheduleExpr = t.cron ?? t.every ?? null;
  if (scheduleKind) validateSchedule(scheduleKind, scheduleExpr!);
  const retries = t.retries ?? DEFAULT_RETRIES;
  if (!Number.isInteger(retries) || retries < 0 || retries > 20) throw new Error(`invalid retries ${t.retries}`);
  return {
    scheduleKind,
    scheduleExpr,
    catchUpMs: t.catchUp === false ? null : parseDuration(t.catchUp ?? "1h"),
    retries,
    timeoutMs: parseDuration(t.timeout ?? "5m"),
  };
}

// Upserts the manifest's defs (config errors land in the error column, siblings
// unaffected), retires absent defs (canceling their queued runs), un-retires
// returners. High-water and registered_at survive an unchanged schedule and
// reset when it changes (spec §4).
export function applyManifest(
  db: Database.Database,
  tasks: ManifestTask[],
  now: number
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
        resolved = resolveConfig(t);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        resolved = { scheduleKind: null, scheduleExpr: null, catchUpMs: DEFAULT_CATCH_UP_MS, retries: DEFAULT_RETRIES, timeoutMs: DEFAULT_TIMEOUT_MS };
      }
      const scheduleChanged =
        !prev || prev.scheduleKind !== resolved.scheduleKind || prev.scheduleExpr !== resolved.scheduleExpr;
      const registeredAt = scheduleChanged ? now : prev!.registeredAt;
      const highWater = scheduleChanged ? now : prev!.highWater;
      db.prepare(
        `INSERT INTO _lodekit_task_defs
           (name, schedule_kind, schedule_expr, catch_up_ms, retries, timeout_ms, retired, error, registered_at, high_water)
         VALUES (@name, @kind, @expr, @catchUp, @retries, @timeout, 0, @error, @registeredAt, @highWater)
         ON CONFLICT(name) DO UPDATE SET
           schedule_kind = excluded.schedule_kind, schedule_expr = excluded.schedule_expr,
           catch_up_ms = excluded.catch_up_ms, retries = excluded.retries, timeout_ms = excluded.timeout_ms,
           retired = 0, error = excluded.error,
           registered_at = excluded.registered_at, high_water = excluded.high_water`
      ).run({
        name: t.name, kind: resolved.scheduleKind, expr: resolved.scheduleExpr,
        catchUp: resolved.catchUpMs, retries: resolved.retries, timeout: resolved.timeoutMs,
        error, registeredAt, highWater,
      });
    }
    const existing = (db.prepare("SELECT name FROM _lodekit_task_defs WHERE retired = 0").all() as { name: string }[]);
    for (const { name } of existing) {
      if (names.has(name)) continue;
      db.prepare("UPDATE _lodekit_task_defs SET retired = 1 WHERE name = ?").run(name);
      const rows = db
        .prepare(
          `UPDATE _lodekit_task_runs SET state = 'canceled', finished_at = ?, error = 'task retired'
           WHERE task = ? AND state = 'queued' RETURNING id`
        )
        .all(now, name) as { id: number }[];
      for (const r of rows) canceled.push({ task: name, runId: r.id });
    }
  });
  txn();
  return { canceled };
}

export function listDefs(db: Database.Database): TaskDefRow[] {
  return (db.prepare("SELECT * FROM _lodekit_task_defs ORDER BY name").all() as DefDbRow[]).map(toDef);
}

export function getDef(db: Database.Database, name: string): TaskDefRow | undefined {
  const r = db.prepare("SELECT * FROM _lodekit_task_defs WHERE name = ?").get(name) as DefDbRow | undefined;
  return r ? toDef(r) : undefined;
}

export function setHighWater(db: Database.Database, name: string, highWater: number): void {
  db.prepare("UPDATE _lodekit_task_defs SET high_water = ? WHERE name = ?").run(highWater, name);
}

export function hasTasks(db: Database.Database): boolean {
  return (
    db.prepare("SELECT 1 FROM _lodekit_task_defs LIMIT 1").get() !== undefined ||
    db.prepare("SELECT 1 FROM _lodekit_task_runs LIMIT 1").get() !== undefined
  );
}

export function insertRun(
  db: Database.Database,
  opts: { task: string; payload?: unknown; notBefore: number; source: RunSource; dedupeKey?: string | null; now: number }
): { runId: number; deduped: boolean } {
  const txn = db.transaction((): { runId: number; deduped: boolean } => {
    if (opts.dedupeKey != null) {
      const existing = db
        .prepare("SELECT id FROM _lodekit_task_runs WHERE task = ? AND dedupe_key = ? AND state = 'queued' LIMIT 1")
        .get(opts.task, opts.dedupeKey) as { id: number } | undefined;
      if (existing) return { runId: existing.id, deduped: true };
    }
    const info = db
      .prepare(
        `INSERT INTO _lodekit_task_runs (task, state, payload, dedupe_key, attempt, not_before, source, created_at)
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

export function hasQueuedScheduleRun(db: Database.Database, task: string): boolean {
  return (
    db.prepare("SELECT 1 FROM _lodekit_task_runs WHERE task = ? AND state = 'queued' AND source = 'schedule' LIMIT 1")
      .get(task) !== undefined
  );
}

// Oldest due queued run of a live def, atomically transitioned to running.
export function claimNextDue(db: Database.Database, now: number): TaskRunRow | undefined {
  const txn = db.transaction((): TaskRunRow | undefined => {
    const row = db
      .prepare(
        `SELECT r.* FROM _lodekit_task_runs r
         JOIN _lodekit_task_defs d ON d.name = r.task
         WHERE r.state = 'queued' AND r.not_before <= ? AND d.retired = 0 AND d.error IS NULL
         ORDER BY r.not_before, r.id LIMIT 1`
      )
      .get(now) as RunDbRow | undefined;
    if (!row) return undefined;
    db.prepare("UPDATE _lodekit_task_runs SET state = 'running', attempt = attempt + 1, started_at = ? WHERE id = ?")
      .run(now, row.id);
    return toRun({ ...row, state: "running", attempt: row.attempt + 1, started_at: now });
  });
  return txn();
}

// At-least-once completion rule (spec §7): success -> succeeded; failure with
// attempts left -> queued with exponential backoff; else terminal failed.
export function finishRun(
  db: Database.Database,
  run: TaskRunRow,
  result: { ok: boolean; message?: string },
  def: TaskDefRow,
  now: number
): { state: "succeeded" | "failed" | "queued"; notBefore?: number } {
  if (result.ok) {
    db.prepare(
      "UPDATE _lodekit_task_runs SET state = 'succeeded', finished_at = ?, duration_ms = ?, error = NULL WHERE id = ?"
    ).run(now, run.startedAt != null ? now - run.startedAt : null, run.id);
    return { state: "succeeded" };
  }
  const error = (result.message ?? "task failed").slice(0, 4_000);
  if (run.attempt <= def.retries) {
    const notBefore = now + Math.min(BACKOFF_BASE_MS * 2 ** (run.attempt - 1), BACKOFF_CAP_MS);
    db.prepare(
      "UPDATE _lodekit_task_runs SET state = 'queued', not_before = ?, started_at = NULL, error = ? WHERE id = ?"
    ).run(notBefore, error, run.id);
    return { state: "queued", notBefore };
  }
  db.prepare(
    "UPDATE _lodekit_task_runs SET state = 'failed', finished_at = ?, duration_ms = ?, error = ? WHERE id = ?"
  ).run(now, run.startedAt != null ? now - run.startedAt : null, error, run.id);
  return { state: "failed" };
}

// Boot recovery: every row still 'running' was interrupted by runtime death —
// a consumed, failed attempt (spec §7).
export function markInterrupted(
  db: Database.Database,
  now: number
): { task: string; runId: number; state: "queued" | "failed" }[] {
  const rows = (db.prepare("SELECT * FROM _lodekit_task_runs WHERE state = 'running'").all() as RunDbRow[]).map(toRun);
  const out: { task: string; runId: number; state: "queued" | "failed" }[] = [];
  for (const run of rows) {
    const def = getDef(db, run.task);
    const fallback: TaskDefRow = def ?? {
      name: run.task, scheduleKind: null, scheduleExpr: null, catchUpMs: null,
      retries: 0, timeoutMs: DEFAULT_TIMEOUT_MS, retired: true, error: null,
      registeredAt: now, highWater: null,
    };
    const r = finishRun(db, run, { ok: false, message: "interrupted by runtime shutdown" }, fallback, now);
    out.push({ task: run.task, runId: run.id, state: r.state === "queued" ? "queued" : "failed" });
  }
  return out;
}

export function listRuns(
  db: Database.Database,
  opts: { task?: string; state?: RunState; limit?: number } = {}
): TaskRunRow[] {
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 50)), 200);
  const rows = db
    .prepare(
      `SELECT * FROM _lodekit_task_runs
       WHERE (@task IS NULL OR task = @task) AND (@state IS NULL OR state = @state)
       ORDER BY id DESC LIMIT @limit`
    )
    .all({ task: opts.task ?? null, state: opts.state ?? null, limit }) as RunDbRow[];
  return rows.map(toRun);
}

export function getRun(db: Database.Database, id: number): TaskRunRow | undefined {
  const r = db.prepare("SELECT * FROM _lodekit_task_runs WHERE id = ?").get(id) as RunDbRow | undefined;
  return r ? toRun(r) : undefined;
}

export function lastRunOf(
  db: Database.Database,
  task: string
): { runId: number; state: RunState; finishedAt: number | null; error: string | null } | undefined {
  const r = db
    .prepare("SELECT id, state, finished_at, error FROM _lodekit_task_runs WHERE task = ? ORDER BY id DESC LIMIT 1")
    .get(task) as { id: number; state: string; finished_at: number | null; error: string | null } | undefined;
  return r ? { runId: r.id, state: r.state as RunState, finishedAt: r.finished_at, error: r.error } : undefined;
}

export function cancelRun(db: Database.Database, id: number, now: number): { task: string } | "not-queued" | "not-found" {
  const txn = db.transaction((): { task: string } | "not-queued" | "not-found" => {
    const run = getRun(db, id);
    if (!run) return "not-found";
    if (run.state !== "queued") return "not-queued";
    db.prepare("UPDATE _lodekit_task_runs SET state = 'canceled', finished_at = ? WHERE id = ?").run(now, id);
    return { task: run.task };
  });
  return txn();
}

// Retention (spec §9): delete terminal runs that are BOTH beyond the newest
// RETENTION_KEEP per task AND older than RETENTION_MAX_AGE_MS. Never queued/running.
export function sweepRuns(db: Database.Database, now: number): number {
  return db
    .prepare(
      `DELETE FROM _lodekit_task_runs WHERE id IN (
         SELECT id FROM (
           SELECT id, finished_at, ROW_NUMBER() OVER (PARTITION BY task ORDER BY id DESC) AS rn
           FROM _lodekit_task_runs WHERE state IN ('succeeded','failed','canceled')
         ) WHERE rn > ? AND finished_at < ?
       )`
    )
    .run(RETENTION_KEEP, now - RETENTION_MAX_AGE_MS).changes;
}

// openDbs pattern (kv-store sweepAll): only connections opened through
// getTasksDb are guaranteed the schema — ensure idempotently.
export function sweepAllTaskRuns(): void {
  const now = Date.now();
  for (const { db } of openDbs()) {
    if (!ensured.has(db)) {
      ensureSchema(db);
      ensured.add(db);
    }
    sweepRuns(db, now);
  }
}

const EVENT = `${CATALOG_NAME}-change`;

export function emitTasksChange(
  appId: string,
  data: { task: string; runId?: number; state?: string; error?: string }
): void {
  broadcast(EVENT, { appId, ...data }, appId);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/tasks-store.test.ts tests/task-schedule.test.ts tests/duration.test.ts`
Expected: PASS, all three files.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/services/tasks.ts packages/runtime/tests/tasks-store.test.ts
git commit -m "feat(runtime): tasks storage — defs/runs tables, claim/finish/backoff, retention sweep"
```

---

### Task 4: Tasks HTTP surface — router, registration, SSE

**Files:**
- Modify: `packages/runtime/src/services/tasks.ts` (append the router half)
- Modify: `packages/runtime/src/routes.ts`
- Modify: `packages/runtime/package.json` (add the `./services/tasks` export subpath)
- Test: `packages/runtime/tests/tasks-api.test.ts`

**Interfaces:**
- Consumes: everything Task 3 produces; `validationHook` (`../validation.js`); `isValidAppId` (`../registry.js`); `tick` (`../scheduler.js`); `nextOccurrence` (Task 2).
- Produces:
  - `withTasks(cfg: Config): MiddlewareHandler<TasksEnv>` with `TasksEnv = { Variables: { tasksDb: Database.Database; appId: string } }`
  - `tasksRoutes` (chained Hono router) and `export type TasksRoutes = typeof tasksRoutes` — consumed by the SDK (Task 5)
  - Routes (spec §6): `GET /` (defs + nextRun + lastRun), `POST /:name/runs` (enqueue → `{ runId, deduped }`), `GET /runs`, `GET /runs/:id`, `DELETE /runs/:id` (cancel)
  - Enqueue nudges the dispatcher with `tick("tasks-dispatch")` (a no-op until Task 9 registers it — no import cycle with the engine)
  - Mounted in `routes.ts` under `/apps/:appId/tasks` (after the 100kb `bodyLimit`, like kv-store)
  - API run shape (camelCase, payload parsed): `{ id, task, state, source, attempt, payload, notBefore, createdAt, startedAt, finishedAt, durationMs, error }`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/runtime/tests/tasks-api.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";
import type { Config } from "../src/config.js";
import { getTasksDb, applyManifest } from "../src/services/tasks.js";

let root: string, server: Server, base: string, cfg: Config;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-tasksapi-"));
  cfg = {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: path.join(root, ".cache"),
    port: 0,
    baseUrl: "http://lodekit.localhost:0",
  };
  await new Promise<void>((resolve) => {
    server = createServer(cfg).listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  // Seed defs the way the engine does — through the storage layer.
  applyManifest(getTasksDb(cfg.dataDir, "app"), [
    { name: "digest", cron: "0 9 * * *" },
    { name: "resize", retries: 1 },
    { name: "broken", cron: "not a cron" },
  ], Date.now());
  applyManifest(getTasksDb(cfg.dataDir, "app"), [
    { name: "digest", cron: "0 9 * * *" },
    { name: "resize", retries: 1 },
    { name: "broken", cron: "not a cron" },
  ], Date.now()); // idempotent re-apply must not disturb anything
});
afterEach(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
});

const api = (p = "") => `${base}/api/apps/app/tasks${p}`;
const post = async (url: string, body: unknown) => {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

describe("tasks HTTP surface", () => {
  it("GET / lists defs with schedule, nextRun, error, lastRun", async () => {
    const { tasks } = await (await fetch(api())).json();
    const byName = Object.fromEntries(tasks.map((t: { name: string }) => [t.name, t]));
    expect(byName.digest).toMatchObject({ schedule: { kind: "cron", expr: "0 9 * * *" }, retired: false, lastRun: null });
    expect(byName.digest.nextRun).toBeGreaterThan(Date.now());
    expect(byName.resize.schedule).toBeNull();
    expect(byName.broken.error).toBeTruthy();
    expect(byName.broken.nextRun).toBeNull();
  });

  it("enqueue round-trip: runId, listed queued, get by id, payload preserved", async () => {
    const { status, body } = await post(api("/resize/runs"), { payload: { fileSlug: "pic" } });
    expect(status).toBe(200);
    expect(body.deduped).toBe(false);
    const run = await (await fetch(api(`/runs/${body.runId}`))).json();
    expect(run).toMatchObject({ id: body.runId, task: "resize", state: "queued", source: "enqueue", payload: { fileSlug: "pic" } });
    const { runs } = await (await fetch(api("/runs?task=resize&state=queued"))).json();
    expect(runs.map((r: { id: number }) => r.id)).toContain(body.runId);
  });

  it("dedupeKey returns the existing queued run", async () => {
    const a = await post(api("/resize/runs"), { dedupeKey: "pic" });
    const b = await post(api("/resize/runs"), { dedupeKey: "pic" });
    expect(b.body).toEqual({ runId: a.body.runId, deduped: true });
  });

  it("delay/at set notBefore; both together is a 400", async () => {
    const before = Date.now();
    const { body } = await post(api("/resize/runs"), { delay: "10m" });
    const run = await (await fetch(api(`/runs/${body.runId}`))).json();
    expect(run.notBefore).toBeGreaterThanOrEqual(before + 600_000);
    const at = Date.now() + 5_000;
    const r2 = await post(api("/resize/runs"), { at });
    expect((await (await fetch(api(`/runs/${r2.body.runId}`))).json()).notBefore).toBe(at);
    expect((await post(api("/resize/runs"), { delay: "10m", at })).status).toBe(400);
    expect((await post(api("/resize/runs"), { delay: "10 minutes" })).status).toBe(400);
  });

  it("rejects unknown, retired-equivalent, and config-error tasks with 400", async () => {
    expect((await post(api("/nope/runs"), {})).status).toBe(400);
    expect((await post(api("/broken/runs"), {})).status).toBe(400);
    expect((await post(`${base}/api/apps/UPPER/tasks/resize/runs`, {})).status).toBe(400); // invalid app id
  });

  it("cancel: 200 for queued, 409 after, 404 for unknown", async () => {
    const { body } = await post(api("/resize/runs"), { delay: "1h" });
    const del = await fetch(api(`/runs/${body.runId}`), { method: "DELETE" });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ canceled: true });
    expect((await fetch(api(`/runs/${body.runId}`), { method: "DELETE" })).status).toBe(409);
    expect((await fetch(api("/runs/99999"), { method: "DELETE" })).status).toBe(404);
    expect((await fetch(api(`/runs/${body.runId}`))).status).toBe(200);
    expect((await fetch(api("/runs/99999"))).status).toBe(404);
  });

  it("broadcasts tasks-change on enqueue over the app SSE channel", async () => {
    const ac = new AbortController();
    const res = await fetch(`${base}/api/apps/app/events`, { signal: ac.signal });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const waitFor = async (needle: string) => {
      const deadline = Date.now() + 5_000;
      while (!buf.includes(needle) && Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
      }
      expect(buf).toContain(needle);
    };
    await post(api("/resize/runs"), {});
    await waitFor("event: tasks-change");
    await waitFor('"state":"queued"');
    ac.abort();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/tasks-api.test.ts`
Expected: FAIL — every request 404s (routes not mounted / exports missing).

- [ ] **Step 3: Append the router half to `services/tasks.ts`**

Add to the imports at the top of `packages/runtime/src/services/tasks.ts`:

```ts
import { Hono, type MiddlewareHandler } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Config } from "../config.js";
import { isValidAppId } from "../registry.js";
import { validationHook } from "../validation.js";
import { tick } from "../scheduler.js";
import { nextOccurrence } from "../taskSchedule.js";
```

Append at the end of the file:

```ts
export type TasksEnv = { Variables: { tasksDb: Database.Database; appId: string } };

// Applied by the parent router on /apps/:appId/tasks/* — validates the app id
// and sets the better-sqlite3 handle in context vars (kv-store withDb pattern).
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
    return c.json({ runs: listRuns(c.var.tasksDb, c.req.valid("query")).map(toApiRun) });
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
    emitTasksChange(c.var.appId, { task: res.task, runId: id, state: "canceled" });
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
        emitTasksChange(c.var.appId, { task: name, runId, state: "queued" });
        tick("tasks-dispatch"); // no-op until the engine registers it (server.ts)
      }
      return c.json({ runId, deduped });
    }
  );

export type TasksRoutes = typeof tasksRoutes;
```

- [ ] **Step 4: Mount the service in `routes.ts`**

In `packages/runtime/src/routes.ts`, add the import (after the file-store import):

```ts
import { tasksRoutes, withTasks, CATALOG_NAME as TASKS } from "./services/tasks.js";
```

and register after the kv-store pair (payloads sit under the 100kb `bodyLimit`, like kv):

```ts
    .use(`/apps/:appId/${TASKS}/*`, withTasks(cfg))
    .route(`/apps/:appId/${TASKS}`, tasksRoutes)
```

- [ ] **Step 5: Add the export subpath**

In `packages/runtime/package.json`, extend `exports`:

```json
  "exports": {
    "./services/kv-store": "./src/services/kv-store.ts",
    "./services/tasks": "./src/services/tasks.ts"
  },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/tasks-api.test.ts`
Expected: PASS (7 tests). Then `pnpm --filter @lodekit/runtime exec tsc --noEmit` — clean.

- [ ] **Step 7: Commit**

```bash
git add packages/runtime/src/services/tasks.ts packages/runtime/src/routes.ts packages/runtime/package.json packages/runtime/tests/tasks-api.test.ts
git commit -m "feat(runtime): tasks HTTP surface — defs/runs/enqueue/cancel routes, tasks-change SSE"
```

---

### Task 5: SDK — `task()` wrapper and the `tasks` handle

**Files:**
- Create: `packages/sdk/src/task.ts`
- Modify: `packages/sdk/src/client.ts`
- Modify: `packages/sdk/src/index.ts`
- Test: `packages/sdk/tests/task.test.ts`

**Interfaces:**
- Consumes: `TasksRoutes` via `@lodekit/runtime/services/tasks` (Task 4's export subpath); the shared `parse`/`createEventChannel` already in `client.ts`.
- Produces:
  - `task<P>(config: TaskConfig<P>): DefinedTask<P>` where `TaskConfig<P> = { cron?: string; every?: string; catchUp?: string | false; retries?: number; timeout?: string; run: (payload: P) => void | Promise<void> }` and `DefinedTask<P> = TaskConfig<P> & { __lodekitTask: true }` — the marker `appWorkerEntry.mjs` scans for (Task 7).
  - `interface Tasks { enqueue(name, payload?, opts?: { delay?: string; at?: number; dedupeKey?: string }): Promise<number>; cancel(runId: number): Promise<boolean>; runs(opts?): Promise<TaskRun[]>; list(): Promise<TaskInfo[]>; watch(cb): () => void }`
  - Types `TaskRun`, `TaskInfo`, `TasksChange`; `LodekitClient` gains `tasks`; `index.ts` exports the `tasks` singleton and re-exports `task` + types.

- [ ] **Step 1: Write the failing test**

```ts
// packages/sdk/tests/task.test.ts
import { describe, it, expect } from "vitest";
import { task } from "../src/task.js";

describe("task()", () => {
  it("tags the config with the worker-scanned marker", () => {
    const t = task({ cron: "0 9 * * *", catchUp: "6h", run: async () => {} });
    expect(t.__lodekitTask).toBe(true);
    expect(t.cron).toBe("0 9 * * *");
    expect(typeof t.run).toBe("function");
  });

  it("rejects cron+every together and a missing run", () => {
    expect(() => task({ cron: "0 9 * * *", every: "1h", run: async () => {} })).toThrow(/mutually exclusive/);
    // @ts-expect-error run is required
    expect(() => task({ cron: "0 9 * * *" })).toThrow(/run/);
  });

  it("passes the typed payload through", async () => {
    let got: { n: number } | undefined;
    const t = task<{ n: number }>({ run: (p) => { got = p; } });
    await t.run({ n: 7 });
    expect(got).toEqual({ n: 7 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lodekit/sdk exec vitest run tests/task.test.ts`
Expected: FAIL — cannot find module `../src/task.js`.

- [ ] **Step 3: Write `packages/sdk/src/task.ts`**

```ts
// The declaration side of the tasks service (spec §4): a thin validator/tagger.
// It never talks to the runtime — appWorkerEntry scans a built src/tasks.ts
// module for the __lodekitTask marker and reports the config as the manifest.
export interface TaskConfig<P = unknown> {
  /** 5-field cron expression, machine-local timezone. Mutually exclusive with `every`. */
  cron?: string;
  /** Interval sugar ("30m", "1h"), minimum "1m". Mutually exclusive with `cron`. */
  every?: string;
  /** Catch-up window for missed occurrences ("6h"); false disables. Default "1h". */
  catchUp?: string | false;
  /** Retries after the first attempt. Default 3. */
  retries?: number;
  /** Per-attempt timeout ("5m" default). */
  timeout?: string;
  run: (payload: P) => void | Promise<void>;
}

export type DefinedTask<P = unknown> = TaskConfig<P> & { __lodekitTask: true };

export function task<P = unknown>(config: TaskConfig<P>): DefinedTask<P> {
  if (typeof config.run !== "function") throw new Error('task(): "run" must be a function');
  if (config.cron != null && config.every != null) {
    throw new Error('task(): "cron" and "every" are mutually exclusive');
  }
  return { __lodekitTask: true, ...config };
}
```

- [ ] **Step 4: Add the `Tasks` handle to `client.ts`**

In `packages/sdk/src/client.ts`, extend the routes-type import:

```ts
import type { KvRoutes } from "@lodekit/runtime/services/kv-store";
import type { TasksRoutes } from "@lodekit/runtime/services/tasks";
```

Add the types after `FilePutBody` (before `Files`):

```ts
export type TaskRunState = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface TaskRun {
  id: number;
  task: string;
  state: TaskRunState;
  source: "enqueue" | "schedule" | "manual";
  attempt: number;
  payload: unknown;
  notBefore: number;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number | null;
  error: string | null;
}

export interface TaskInfo {
  name: string;
  schedule: { kind: "cron" | "every"; expr: string } | null;
  retired: boolean;
  error: string | null;
  nextRun: number | null;
  lastRun: { runId: number; state: TaskRunState; finishedAt: number | null; error: string | null } | null;
}

export type TasksChange = { task: string; runId?: number; state?: TaskRunState };

export interface Tasks {
  /** Queue a run now (or delayed); resolves to the run id. */
  enqueue(name: string, payload?: unknown, opts?: { delay?: string; at?: number; dedupeKey?: string }): Promise<number>;
  /** Cancel a still-queued run; false when it already started/finished or doesn't exist. */
  cancel(runId: number): Promise<boolean>;
  runs(opts?: { task?: string; state?: TaskRunState; limit?: number }): Promise<TaskRun[]>;
  list(): Promise<TaskInfo[]>;
  watch(cb: (change: TasksChange) => void): () => void;
}
```

Extend `LodekitClient`:

```ts
export interface LodekitClient {
  kv: Kv;
  files: Files;
  tasks: Tasks;
}
```

Inside `createClient`, after the `files` implementation, add and include in the return value:

```ts
  const tasksRpc = hc<TasksRoutes>(`${baseUrl}/api/apps/${appId}/tasks`);

  const tasks: Tasks = {
    async enqueue(name, payload, opts = {}) {
      const r = await parse(
        await tasksRpc[":name"].runs.$post({
          param: { name },
          json: {
            ...(payload !== undefined ? { payload } : {}),
            ...(opts.delay !== undefined ? { delay: opts.delay } : {}),
            ...(opts.at !== undefined ? { at: opts.at } : {}),
            ...(opts.dedupeKey !== undefined ? { dedupeKey: opts.dedupeKey } : {}),
          },
        })
      );
      return r.runId;
    },
    async cancel(runId) {
      try {
        await parse(await tasksRpc.runs[":id"].$delete({ param: { id: String(runId) } }));
        return true;
      } catch {
        return false; // 404 unknown / 409 not-queued
      }
    },
    async runs(opts = {}) {
      const query: Record<string, string> = {};
      if (opts.task !== undefined) query.task = opts.task;
      if (opts.state !== undefined) query.state = opts.state;
      if (opts.limit !== undefined) query.limit = String(opts.limit);
      return (await parse(await tasksRpc.runs.$get({ query }))).runs as TaskRun[];
    },
    async list() {
      return (await parse(await tasksRpc.index.$get())).tasks as TaskInfo[];
    },
    watch(cb) {
      return channel.on<TasksChange>("tasks-change", () => true, cb);
    },
  };

  return { kv, files, tasks };
```

- [ ] **Step 5: Export from `index.ts`**

In `packages/sdk/src/index.ts`, extend the re-exports and singletons:

```ts
export { task } from "./task.js";
export type { TaskConfig, DefinedTask } from "./task.js";
```

extend the type re-export line with `Tasks, TaskRun, TaskInfo, TaskRunState, TasksChange`, and after `export const files = client.files;`:

```ts
export const tasks = client.tasks;
```

- [ ] **Step 6: Run tests and type-check**

Run: `pnpm --filter @lodekit/sdk exec vitest run` — PASS (existing client tests + new task tests).
Run: `pnpm --filter @lodekit/sdk exec tsc --noEmit` — clean (this is the hc↔routes contract check).

- [ ] **Step 7: Commit**

```bash
git add packages/sdk/src/task.ts packages/sdk/src/client.ts packages/sdk/src/index.ts packages/sdk/tests/task.test.ts
git commit -m "feat(sdk): task() declaration wrapper and hc-typed tasks handle"
```

---

### Task 6: Build — emit `server/tasks.js` when `src/tasks.ts` exists

**Files:**
- Modify: `packages/runtime/src/build.ts`
- Test: `packages/runtime/tests/build-tasks.test.ts`

**Interfaces:**
- Consumes: the existing `buildStart(t: StartBuildTarget)`, `deepImportResolver()`, `appAliases()`.
- Produces: after a successful Start build, `<outDir>/server/tasks.js` exists iff `<rootDir>/src/tasks.ts` exists — a self-contained ESM ssr bundle (SDK inlined via `noExternal`), consumed by `appWorker` (Task 7). The main build's `emptyOutDir` on `server/` clears stale copies, so a deleted `src/tasks.ts` disappears on rebuild for free.

- [ ] **Step 1: Write the failing test**

```ts
// packages/runtime/tests/build-tasks.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStart } from "../src/build.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fixture = path.join(__dirname, "fixtures", "start-app");

let appDir: string, outDir: string;

function copyDir(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

beforeAll(() => {
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-taskbuild-app-"));
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-taskbuild-out-"));
  copyDir(fixture, appDir);
  fs.writeFileSync(
    path.join(appDir, "src", "tasks.ts"),
    `import { task, kv } from "@lodekit/sdk";

export const recordPing = task({ retries: 0, run: async (p: { key: string }) => {
  await kv.set(p.key, "ran");
} });

export const explode = task({ run: async () => { throw new Error("explode!"); } });
`
  );
});
afterAll(() => {
  fs.rmSync(appDir, { recursive: true, force: true });
  fs.rmSync(outDir, { recursive: true, force: true });
});

describe("buildStart tasks entry", () => {
  it("emits an importable server/tasks.js with marker-tagged exports", async () => {
    await buildStart({ rootDir: appDir, outDir, urlBase: "/tasky", appId: "tasky" });
    const tasksJs = path.join(outDir, "server", "tasks.js");
    expect(fs.existsSync(tasksJs)).toBe(true);
    expect(fs.existsSync(path.join(outDir, "server", "server.js"))).toBe(true); // main build intact
    const mod = await import(tasksJs);
    expect(mod.recordPing.__lodekitTask).toBe(true);
    expect(mod.recordPing.retries).toBe(0);
    expect(typeof mod.recordPing.run).toBe("function");
    expect(mod.explode.__lodekitTask).toBe(true);
  }, 120_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/build-tasks.test.ts`
Expected: FAIL — `server/tasks.js` does not exist.

- [ ] **Step 3: Implement in `build.ts`**

Extend the vite import at the top:

```ts
import { createBuilder, build } from "vite";
```

In `buildStart`, after `await builder.buildApp();` and before the `package.json` write, add:

```ts
  // The tasks entry (spec §4): src/tasks.ts becomes a separate self-contained ssr
  // bundle beside server.js. A separate small build rather than an extra rollup
  // input — the tanstackStart plugin owns the main ssr input, and the SDK talks
  // to the runtime over loopback HTTP anyway, so the bundles share no state.
  const tasksSource = path.join(fs.realpathSync(t.rootDir), "src", "tasks.ts");
  if (fs.existsSync(tasksSource)) {
    await build({
      configFile: false,
      root: fs.realpathSync(t.rootDir),
      logLevel: "silent",
      define: { __LODEKIT_APP_ID__: JSON.stringify(t.appId), ...t.defines },
      plugins: [deepImportResolver()],
      resolve: { alias: appAliases(themeOverridesFile) },
      ssr: { noExternal: true },
      build: {
        ssr: tasksSource,
        outDir: path.join(t.outDir, "server"),
        emptyOutDir: false, // server.js from the main build lives here
        rollupOptions: {
          output: { entryFileNames: "tasks.js", chunkFileNames: "assets/tasks-[name]-[hash].js" },
        },
      },
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/build-tasks.test.ts`
Expected: PASS (one full Start build, ~60s). Also run `pnpm --filter @lodekit/runtime exec vitest run tests/build-start.test.ts` — the no-tasks path must stay green.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/build.ts packages/runtime/tests/build-tasks.test.ts
git commit -m "feat(runtime): build src/tasks.ts into a separate server/tasks.js ssr bundle"
```

---

### Task 7: Worker protocol — manifest, `task-run`/`task-result`

**Files:**
- Modify: `packages/runtime/src/appWorkerEntry.mjs`
- Modify: `packages/runtime/src/appWorker.ts`
- Test: `packages/runtime/tests/task-worker.test.ts`

**Interfaces:**
- Consumes: the `__lodekitTask` marker shape (Task 5); `server/tasks.js` location (Task 6).
- Produces:
  - Protocol additions — worker → main: `{ type: "tasks-manifest", tasks: [{ name, cron?, every?, catchUp?, retries?, timeout? }], error?: string }` (always posted once after ready; `error` set when the tasks module failed to import — defs must NOT be retired on that path); main → worker: `{ type: "task-run", id, name, payload }`; worker → main: `{ type: "task-result", id, ok, message? }`.
  - `onTasksManifest(cb: (appId: string, tasks: unknown[], error?: string) => void): void` — single module-level callback, last registration wins (server.ts wires the engine in Task 9).
  - `runTaskInWorker(appId: string, name: string, payload: unknown, timeoutMs: number): Promise<TaskRunResult>` with `type TaskRunResult = { ok: true } | { ok: false; message: string }` — never throws; worker death/timeout/down all resolve `ok: false`.
  - Task names: kebab-case of the export identifier, computed in the worker.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/runtime/tests/task-worker.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  configureWorkers, startAppWorker, stopAllWorkers, getServerState,
  onTasksManifest, runTaskInWorker, workerForTest,
} from "../src/appWorker.js";
import type { Config } from "../src/config.js";

let cacheDir: string;
let cfg: Config;
const manifests = new Map<string, { tasks: unknown[]; error?: string }>();

// Hand-written plain-ESM bundles — the worker only needs files on disk, not a Vite build.
function writeApp(appId: string, tasksJs: string | null) {
  const dir = path.join(cacheDir, appId, "server");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, appId, "package.json"), JSON.stringify({ type: "module" }));
  fs.writeFileSync(path.join(dir, "server.js"), `export default { fetch: () => new Response("ok") };\n`);
  if (tasksJs !== null) fs.writeFileSync(path.join(dir, "tasks.js"), tasksJs);
}

async function waitFor(pred: () => boolean, ms: number) {
  const end = Date.now() + ms;
  while (!pred() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
  expect(pred()).toBe(true);
}

beforeAll(() => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-taskworker-"));
  cfg = { root: "", appsDir: "", dataDir: "", cacheDir, port: 0, baseUrl: "" };
  configureWorkers("http://127.0.0.1:9");
  onTasksManifest((appId, tasks, error) => manifests.set(appId, { tasks, error }));
  writeApp("tasky", `
export const ping = { __lodekitTask: true, cron: "0 9 * * *", run: async () => {} };
export const boom = { __lodekitTask: true, run: async () => { throw new Error("kaboom"); } };
export const slow = { __lodekitTask: true, run: () => new Promise((r) => setTimeout(r, 60_000)) };
export const echoFail = { __lodekitTask: true, run: async (p) => { throw new Error("got:" + JSON.stringify(p)); } };
export const notATask = { run: async () => {} };
`);
  writeApp("bare", null);
  writeApp("busted", `throw new Error("bad module");\n`);
});
afterAll(() => {
  stopAllWorkers();
  fs.rmSync(cacheDir, { recursive: true, force: true });
});

describe("worker task protocol", () => {
  it("posts a kebab-cased manifest with config, skipping unmarked exports", async () => {
    startAppWorker(cfg, "tasky");
    await waitFor(() => manifests.has("tasky"), 10_000);
    const { tasks, error } = manifests.get("tasky")!;
    expect(error).toBeUndefined();
    expect(tasks).toEqual([
      { name: "ping", cron: "0 9 * * *" },
      { name: "boom" },
      { name: "slow" },
      { name: "echo-fail" },
    ]);
    await waitFor(() => getServerState("tasky")?.status === "running", 10_000);
  });

  it("runs a task; failures carry the thrown stack; payload passes through", async () => {
    expect(await runTaskInWorker("tasky", "ping", undefined, 5_000)).toEqual({ ok: true });
    const fail = await runTaskInWorker("tasky", "boom", undefined, 5_000);
    expect(fail.ok).toBe(false);
    expect((fail as { message: string }).message).toContain("kaboom");
    const echoed = await runTaskInWorker("tasky", "echo-fail", { n: 7 }, 5_000);
    expect((echoed as { message: string }).message).toContain('got:{"n":7}');
  });

  it("unknown task and timeout resolve ok:false", async () => {
    const unknown = await runTaskInWorker("tasky", "nope", undefined, 5_000);
    expect(unknown).toMatchObject({ ok: false, message: expect.stringContaining("unknown task") });
    const timedOut = await runTaskInWorker("tasky", "slow", undefined, 300);
    expect(timedOut).toMatchObject({ ok: false, message: expect.stringContaining("timed out") });
  });

  it("worker death mid-run settles the pending task ok:false", async () => {
    const p = runTaskInWorker("tasky", "slow", undefined, 30_000);
    await new Promise((r) => setTimeout(r, 100));
    await workerForTest("tasky")!.terminate();
    expect((await p).ok).toBe(false);
    stopAllWorkers(); // don't leak the backoff respawn into other tests
  });

  it("no tasks.js: an empty manifest still arrives (retire-on-delete path)", async () => {
    startAppWorker(cfg, "bare");
    await waitFor(() => manifests.has("bare"), 10_000);
    expect(manifests.get("bare")).toEqual({ tasks: [], error: undefined });
  });

  it("a tasks module that throws on import reports error and keeps serving", async () => {
    startAppWorker(cfg, "busted");
    await waitFor(() => manifests.has("busted"), 10_000);
    expect(manifests.get("busted")!.error).toContain("bad module");
    expect(manifests.get("busted")!.tasks).toEqual([]);
    await waitFor(() => getServerState("busted")?.status === "running", 10_000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/task-worker.test.ts`
Expected: FAIL — `onTasksManifest`/`runTaskInWorker` not exported.

- [ ] **Step 3: Extend `appWorkerEntry.mjs`**

Replace the protocol header comment and extend the file:

```js
// Runs one app's built server bundle. Plain JS on purpose: workers must not
// depend on the tsx loader. Protocol (structured clone + transfers):
//   main -> worker  { type:"request", id, method, url, headers:[[k,v]], body:Uint8Array|null }
//                   | { type:"task-run", id, name, payload }
//   worker -> main  { type:"ready" } | { type:"fatal", message }
//                   | { type:"tasks-manifest", tasks:[{name,...config}], error? }
//                   | { type:"response", id, status, headers:[[k,v]], body:ReadableStream|null }
//                   | { type:"response-error", id, message }
//                   | { type:"task-result", id, ok, message? }
import { parentPort, workerData } from "node:worker_threads";

let handler;
try {
  const mod = await import(workerData.serverEntry);
  handler = mod.default;
  if (typeof handler?.fetch !== "function") {
    throw new Error("server bundle default export has no fetch()");
  }
  parentPort.postMessage({ type: "ready" });
} catch (e) {
  parentPort.postMessage({ type: "fatal", message: e?.stack ?? String(e) });
  process.exit(1);
}

// Task handlers from the app's built src/tasks.ts (spec §4). Task name =
// kebab-case of the export identifier. An import failure is reported, never
// fatal — the app keeps serving HTTP; the runtime keeps the previous defs.
const taskHandlers = new Map();
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const CONFIG_KEYS = ["cron", "every", "catchUp", "retries", "timeout"];
if (workerData.tasksEntry) {
  try {
    const mod = await import(workerData.tasksEntry);
    const tasks = [];
    for (const [key, val] of Object.entries(mod)) {
      if (!val || val.__lodekitTask !== true || typeof val.run !== "function") continue;
      const name = kebab(key);
      taskHandlers.set(name, val.run);
      const entry = { name };
      for (const k of CONFIG_KEYS) if (val[k] !== undefined) entry[k] = val[k];
      tasks.push(entry);
    }
    parentPort.postMessage({ type: "tasks-manifest", tasks });
  } catch (e) {
    parentPort.postMessage({ type: "tasks-manifest", tasks: [], error: e?.stack ?? String(e) });
  }
} else {
  parentPort.postMessage({ type: "tasks-manifest", tasks: [] });
}

parentPort.on("message", async (msg) => {
  if (msg.type === "task-run") {
    const run = taskHandlers.get(msg.name);
    if (!run) {
      parentPort.postMessage({ type: "task-result", id: msg.id, ok: false, message: `unknown task "${msg.name}"` });
      return;
    }
    try {
      await run(msg.payload);
      parentPort.postMessage({ type: "task-result", id: msg.id, ok: true });
    } catch (e) {
      parentPort.postMessage({ type: "task-result", id: msg.id, ok: false, message: e?.stack ?? String(e) });
    }
    return;
  }
  if (msg.type !== "request") return;
  try {
    const request = new Request(msg.url, {
      method: msg.method,
      headers: msg.headers,
      body: msg.body ?? undefined,
    });
    const response = await handler.fetch(request);
    const headers = [...response.headers];
    if (response.body) {
      parentPort.postMessage(
        { type: "response", id: msg.id, status: response.status, headers, body: response.body },
        [response.body]
      );
    } else {
      parentPort.postMessage({ type: "response", id: msg.id, status: response.status, headers, body: null });
    }
  } catch (e) {
    parentPort.postMessage({ type: "response-error", id: msg.id, message: e?.stack ?? String(e) });
  }
});
```

- [ ] **Step 4: Extend `appWorker.ts`**

Add to `Managed`:

```ts
  pendingTasks: Map<number, { resolve: (r: TaskRunResult) => void; timer: NodeJS.Timeout }>;
```

Add near `ServerState`:

```ts
export type TaskRunResult = { ok: true } | { ok: false; message: string };

let manifestCb: ((appId: string, tasks: unknown[], error?: string) => void) | undefined;

/** Engine hook (single, last-wins): fired once per worker boot with the app's task manifest. */
export function onTasksManifest(cb: (appId: string, tasks: unknown[], error?: string) => void): void {
  manifestCb = cb;
}
```

In `spawn()`, resolve the tasks entry and pass it through, and initialize the map:

```ts
  const tasksEntry = path.join(cfg.cacheDir, appId, "server", "tasks.js");
  const worker = new Worker(ENTRY, {
    workerData: { serverEntry, tasksEntry: fs.existsSync(tasksEntry) ? tasksEntry : null },
    env: { ...process.env, LODEKIT_BASE_URL: baseUrl },
  });
```

```ts
  const m: Managed = {
    worker, ready, readyReject, pending: new Map(), pendingTasks: new Map(), nextId: 1, attempts, cfg,
    stopped: false, failed: false,
  };
```

In the `worker.on("message", ...)` handler, before the `m.pending.get(msg.id)` lookup:

```ts
    if (msg.type === "tasks-manifest") { manifestCb?.(appId, msg.tasks ?? [], msg.error); return; }
    if (msg.type === "task-result") {
      const t = m.pendingTasks.get(msg.id);
      if (!t) return;
      m.pendingTasks.delete(msg.id);
      clearTimeout(t.timer);
      t.resolve(msg.ok ? { ok: true } : { ok: false, message: msg.message ?? "task failed" });
      return;
    }
```

In `fail()`, after the `m.pending` loop:

```ts
  for (const [, t] of m.pendingTasks) { clearTimeout(t.timer); t.resolve({ ok: false, message }); }
  m.pendingTasks.clear();
```

In `stopAppWorker()`, after the `m.pending` loop:

```ts
  for (const [, t] of m.pendingTasks) { clearTimeout(t.timer); t.resolve({ ok: false, message: "app worker stopped" }); }
  m.pendingTasks.clear();
```

At the end of the file:

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/task-worker.test.ts tests/appWorker.test.ts`
Expected: PASS — new protocol green, existing appWorker behavior untouched.

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/appWorkerEntry.mjs packages/runtime/src/appWorker.ts packages/runtime/tests/task-worker.test.ts
git commit -m "feat(runtime): worker task protocol — manifest on boot, task-run/task-result, runTaskInWorker"
```

---

### Task 8: The dispatch engine (`taskEngine.ts`)

**Files:**
- Create: `packages/runtime/src/taskEngine.ts`
- Test: `packages/runtime/tests/task-engine.test.ts`

**Interfaces:**
- Consumes: Task 3 storage, Task 2 `dueOccurrence`, Task 7 `runTaskInWorker`/`TaskRunResult`/`getServerState`, `scanApps`/`isValidAppId`.
- Produces (wired by Task 9):
  - `interface EngineDeps { now(): number; invoke(appId: string, name: string, payload: unknown, timeoutMs: number): Promise<TaskRunResult>; workerRunning(appId: string): boolean }`
  - `initTaskEngine(config: Config, overrides?: Partial<EngineDeps>): void` — resets the module-level app/inflight sets; defaults: `Date.now`, `runTaskInWorker`, `getServerState(...)?.status === "running"`.
  - `registerManifest(appId: string, tasks: unknown[], error?: string): void` — the `onTasksManifest` callback.
  - `recoverInterruptedRuns(): void` — boot pass.
  - `dispatchTasks(): void` — the `every("tasks-dispatch", 1s)` body; also self-chains after each run completes.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/runtime/tests/task-engine.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Config } from "../src/config.js";
import { initTaskEngine, registerManifest, recoverInterruptedRuns, dispatchTasks } from "../src/taskEngine.js";
import {
  getTasksDb, applyManifest, insertRun, claimNextDue, getRun, getDef, listRuns,
  BACKOFF_BASE_MS,
} from "../src/services/tasks.js";
import type { TaskRunResult } from "../src/appWorker.js";

const T0 = 1_700_000_000_000;
let root: string, cfg: Config, clock: number;
let workerUp: boolean;
let invocations: { appId: string; name: string; payload: unknown; timeoutMs: number }[];
// Each invoke pulls the next scripted result; a pending entry lets tests hold a run in flight.
let script: (TaskRunResult | { hold: Promise<TaskRunResult> })[];

const tick = () => new Promise((r) => setImmediate(r));

function makeApp(appId: string) {
  fs.mkdirSync(path.join(cfg.appsDir, appId), { recursive: true });
  fs.writeFileSync(
    path.join(cfg.appsDir, appId, "manifest.json"),
    JSON.stringify({ name: appId, appId })
  );
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-engine-"));
  cfg = {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: path.join(root, ".cache"),
    port: 0,
    baseUrl: "",
  };
  clock = T0;
  workerUp = true;
  invocations = [];
  script = [];
  initTaskEngine(cfg, {
    now: () => clock,
    workerRunning: () => workerUp,
    invoke: async (appId, name, payload, timeoutMs) => {
      invocations.push({ appId, name, payload, timeoutMs });
      const next = script.shift() ?? { ok: true as const };
      return "hold" in next ? next.hold : next;
    },
  });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("taskEngine", () => {
  it("runs an enqueued task with the def's timeout and records success", async () => {
    registerManifest("alpha", [{ name: "job", timeout: "1m" }]);
    const db = getTasksDb(cfg.dataDir, "alpha");
    const { runId } = insertRun(db, { task: "job", payload: { n: 1 }, notBefore: clock, source: "enqueue", now: clock });
    dispatchTasks();
    await vi.waitFor(() => expect(getRun(db, runId)!.state).toBe("succeeded"));
    expect(invocations).toEqual([{ appId: "alpha", name: "job", payload: { n: 1 }, timeoutMs: 60_000 }]);
  });

  it("serial per app, parallel across apps", async () => {
    registerManifest("alpha", [{ name: "job" }]);
    registerManifest("beta", [{ name: "job" }]);
    const dbA = getTasksDb(cfg.dataDir, "alpha");
    const dbB = getTasksDb(cfg.dataDir, "beta");
    let releaseA!: (r: TaskRunResult) => void;
    script = [
      { hold: new Promise<TaskRunResult>((r) => (releaseA = r)) },
      { ok: true },
      { ok: true },
    ];
    insertRun(dbA, { task: "job", notBefore: clock, source: "enqueue", now: clock });
    const second = insertRun(dbA, { task: "job", notBefore: clock, source: "enqueue", now: clock + 1 });
    insertRun(dbB, { task: "job", notBefore: clock, source: "enqueue", now: clock });
    dispatchTasks();
    await tick();
    dispatchTasks(); // alpha is in flight — must not double-claim
    await tick();
    expect(invocations.map((i) => i.appId).sort()).toEqual(["alpha", "beta"]); // one per app
    releaseA({ ok: true });
    await vi.waitFor(() => expect(getRun(dbA, second.runId)!.state).toBe("succeeded")); // self-chained
    expect(invocations.length).toBe(3);
  });

  it("worker down: runs wait, no attempt consumed", async () => {
    registerManifest("alpha", [{ name: "job" }]);
    const db = getTasksDb(cfg.dataDir, "alpha");
    const { runId } = insertRun(db, { task: "job", notBefore: clock, source: "enqueue", now: clock });
    workerUp = false;
    dispatchTasks();
    await tick();
    expect(invocations).toEqual([]);
    expect(getRun(db, runId)!).toMatchObject({ state: "queued", attempt: 0 });
    workerUp = true;
    dispatchTasks();
    await vi.waitFor(() => expect(getRun(db, runId)!.state).toBe("succeeded"));
  });

  it("failed attempts retry on the backoff clock", async () => {
    registerManifest("alpha", [{ name: "job", retries: 1 }]);
    const db = getTasksDb(cfg.dataDir, "alpha");
    const { runId } = insertRun(db, { task: "job", notBefore: clock, source: "enqueue", now: clock });
    script = [{ ok: false, message: "boom" }, { ok: true }];
    dispatchTasks();
    await vi.waitFor(() => expect(getRun(db, runId)!).toMatchObject({ state: "queued", attempt: 1 }));
    clock += BACKOFF_BASE_MS - 1;
    dispatchTasks();
    await tick();
    expect(invocations.length).toBe(1); // still backing off
    clock += 2;
    dispatchTasks();
    await vi.waitFor(() => expect(getRun(db, runId)!.state).toBe("succeeded"));
  });

  it("materializes due schedule runs, coalesced, respecting the catch-up window", async () => {
    registerManifest("alpha", [
      { name: "tock", every: "1h", catchUp: "6h" },
      { name: "strict", every: "1h", catchUp: "5m" },
    ]);
    const db = getTasksDb(cfg.dataDir, "alpha");
    clock += 3 * 3_600_000 + 1_000; // three intervals missed
    dispatchTasks();
    await vi.waitFor(() => expect(listRuns(db, { task: "tock" }).length).toBe(1)); // coalesced to one
    expect(listRuns(db, { task: "tock" })[0].source).toBe("schedule");
    // strict's latest occurrence is 1s old? No — it's 1s past the 3h mark, so the
    // occurrence itself is 1s late: within grace, it fires. Push one out of window:
    await vi.waitFor(() => expect(listRuns(db, { task: "strict" }).length).toBe(1));
    clock += 3_600_000 + 20 * 60_000; // next occurrence now 20m stale
    dispatchTasks();
    await tick();
    expect(listRuns(db, { task: "strict" }).length).toBe(1); // dropped: 20m > 5m window
    expect(listRuns(db, { task: "tock" }).length).toBe(2);   // 20m < 6h window: fired
  });

  it("a still-queued schedule run absorbs the next occurrence", async () => {
    registerManifest("alpha", [{ name: "tock", every: "1h", catchUp: "6h" }]);
    const db = getTasksDb(cfg.dataDir, "alpha");
    workerUp = false; // nothing executes; queued schedule runs pile up unless absorbed
    clock += 3_600_000 + 1_000;
    dispatchTasks();
    clock += 3_600_000;
    dispatchTasks();
    await tick();
    expect(listRuns(db, { task: "tock" }).length).toBe(1);
  });

  it("recoverInterruptedRuns requeues running rows and re-registers the app", async () => {
    makeApp("alpha");
    const db = getTasksDb(cfg.dataDir, "alpha");
    applyManifest(db, [{ name: "job", retries: 3 }], clock);
    insertRun(db, { task: "job", notBefore: clock, source: "enqueue", now: clock });
    const claimed = claimNextDue(db, clock)!; // simulate death mid-run
    initTaskEngine(cfg, { now: () => clock, workerRunning: () => workerUp, invoke: async (a, n, p, t) => { invocations.push({ appId: a, name: n, payload: p, timeoutMs: t }); return { ok: true }; } });
    recoverInterruptedRuns();
    expect(getRun(db, claimed.id)!).toMatchObject({ state: "queued", attempt: 1 });
    clock += BACKOFF_BASE_MS + 1;
    dispatchTasks();
    await vi.waitFor(() => expect(getRun(db, claimed.id)!.state).toBe("succeeded"));
  });

  it("a tasks-module load error keeps previous defs; _dashboard is ignored", async () => {
    registerManifest("alpha", [{ name: "job" }]);
    const db = getTasksDb(cfg.dataDir, "alpha");
    registerManifest("alpha", [], "SyntaxError: bad module");
    expect(getDef(db, "job")!.retired).toBe(false); // NOT retired by the failed load
    registerManifest("_dashboard", [{ name: "sneaky" }]);
    expect(fs.existsSync(path.join(cfg.dataDir, "_dashboard"))).toBe(false);
  });

  it("apps without tasks never get a data dir", () => {
    registerManifest("plain", []);
    expect(fs.existsSync(path.join(cfg.dataDir, "plain"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/task-engine.test.ts`
Expected: FAIL — cannot find module `../src/taskEngine.js`.

- [ ] **Step 3: Write `packages/runtime/src/taskEngine.ts`**

```ts
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
  type ManifestTask, type TaskRunRow,
} from "./services/tasks.js";
import { dueOccurrence } from "./taskSchedule.js";

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
    console.error(`[tasks] ${appId}: tasks module failed to load:\n${loadError}`);
    emitTasksChange(appId, { task: "*", error: loadError });
    return;
  }
  // Never materialize a data dir for an app that has never used tasks.
  if (rawTasks.length === 0 && !fs.existsSync(path.join(cfg.dataDir, appId, "db.sqlite"))) return;
  const db = getTasksDb(cfg.dataDir, appId);
  const { canceled } = applyManifest(db, rawTasks as ManifestTask[], deps.now());
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
    for (const t of markInterrupted(db, deps.now())) {
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
      console.error(`[tasks] dispatch failed for ${appId}:`, e);
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
      catchUpMs: def.catchUpMs,
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
  emitTasksChange(appId, { task: run.task, runId: run.id, state: "running" });
  const db = getTasksDb(cfg!.dataDir, appId);
  const def = getDef(db, run.task)!; // claimNextDue joins on a live def
  let result: TaskRunResult;
  try {
    result = await deps.invoke(
      appId,
      run.task,
      run.payload === null ? undefined : (JSON.parse(run.payload) as unknown),
      def.timeoutMs
    );
  } catch (e) {
    result = { ok: false, message: e instanceof Error ? (e.stack ?? e.message) : String(e) };
  }
  const outcome = finishRun(db, run, result, def, deps.now());
  emitTasksChange(appId, { task: run.task, runId: run.id, state: outcome.state });
  inflight.delete(appId);
  dispatchTasks(); // chain the app's next due run without waiting for the poll
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/task-engine.test.ts`
Expected: PASS (9 tests). Then `pnpm --filter @lodekit/runtime exec tsc --noEmit` — clean.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/taskEngine.ts packages/runtime/tests/task-engine.test.ts
git commit -m "feat(runtime): task dispatch engine — materialize schedules, claim/invoke/finish, recovery"
```

---

### Task 9: Server wiring + end-to-end

**Files:**
- Modify: `packages/runtime/src/server.ts`
- Test: `packages/runtime/tests/tasks-e2e.test.ts`

**Interfaces:**
- Consumes: Task 8 engine, Task 7 `onTasksManifest`, Task 3 `sweepAllTaskRuns`, existing `every`/`stop` (scheduler.ts — untouched).
- Produces: a running system — worker boot manifests flow into the engine; `tasks-dispatch` (1s) and `tasks-sweep` (60s) ride the internal scheduler; recovery runs at boot.

- [ ] **Step 1: Write the failing e2e test**

```ts
// packages/runtime/tests/tasks-e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import { start } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { stopAllWorkers } from "../src/appWorker.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fixture = path.join(__dirname, "fixtures", "start-app");

let root: string, cache: string, server: Server, base: string;

function copyDir(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

async function waitReady(appId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await (await fetch(`${base}/${appId}/`)).text();
    if (last.includes("/_build/")) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${appId}; last page: ${last.slice(0, 300)}`);
}

async function pollRun(runId: number, pred: (run: { state: string; attempt: number }) => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let run: { state: string; attempt: number; error: string | null; notBefore: number } | undefined;
  while (Date.now() < deadline) {
    run = await (await fetch(`${base}/api/apps/start-app/tasks/runs/${runId}`)).json() as typeof run;
    if (run && pred(run)) return run;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`run ${runId} never matched; last: ${JSON.stringify(run)}`);
}

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-taskse2e-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-taskse2e-cache-"));
  copyDir(fixture, path.join(root, "apps", "start-app"));
  fs.writeFileSync(
    path.join(root, "apps", "start-app", "src", "tasks.ts"),
    `import { task, kv } from "@lodekit/sdk";

export const record = task({ run: async (p: { key: string }) => {
  await kv.set(p.key, "ran");
} });

export const explode = task({ retries: 3, run: async () => { throw new Error("explode!"); } });
`
  );
  process.env.LODEKIT_ROOT = root;
  process.env.LODEKIT_CACHE_DIR = cache;
  process.env.LODEKIT_PORT = "0";
  server = await start(loadConfig());
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  await waitReady("start-app", 90_000);
}, 120_000);
afterAll(async () => {
  stopAllWorkers();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
  delete process.env.LODEKIT_ROOT;
  delete process.env.LODEKIT_CACHE_DIR;
  delete process.env.LODEKIT_PORT;
});

describe("tasks e2e (real worker, real dispatcher)", () => {
  it("worker boot registers the manifest; defs are listable", async () => {
    const { tasks } = await (await fetch(`${base}/api/apps/start-app/tasks`)).json();
    const names = tasks.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual(["explode", "record"]);
    expect(tasks.find((t: { name: string }) => t.name === "record").schedule).toBeNull();
  }, 15_000);

  it("enqueue -> handler runs in the app worker with SDK access -> succeeded", async () => {
    const res = await fetch(`${base}/api/apps/start-app/tasks/record/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: { key: "task:proof" } }),
    });
    const { runId } = await res.json();
    await pollRun(runId, (r) => r.state === "succeeded", 15_000);
    const kv = await (await fetch(`${base}/api/apps/start-app/kv-store/${encodeURIComponent("task:proof")}`)).json();
    expect(kv).toMatchObject({ found: true, value: "ran" });
  }, 30_000);

  it("a throwing handler schedules a retry (queued, attempt 1, backoff notBefore)", async () => {
    const before = Date.now();
    const res = await fetch(`${base}/api/apps/start-app/tasks/explode/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { runId } = await res.json();
    const run = await pollRun(runId, (r) => r.state === "queued" && r.attempt === 1, 15_000);
    expect(run.error).toContain("explode!");
    expect(run.notBefore).toBeGreaterThanOrEqual(before + 29_000); // ~30s backoff
  }, 30_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/tasks-e2e.test.ts`
Expected: FAIL — defs list is empty / runs never leave `queued` (engine not wired).

- [ ] **Step 3: Wire `server.ts`**

Add imports:

```ts
import { onTasksManifest } from "./appWorker.js";
import { initTaskEngine, registerManifest, recoverInterruptedRuns, dispatchTasks } from "./taskEngine.js";
import { sweepAllTaskRuns } from "./services/tasks.js";
```

(fold `onTasksManifest` into the existing `./appWorker.js` import line.)

In `start()`, after `configureWorkers(...)` and before `await buildDashboard(cfg)`:

```ts
  initTaskEngine(cfg);
  onTasksManifest(registerManifest);
  recoverInterruptedRuns();
```

After the existing `every(...)` registrations:

```ts
  every("tasks-dispatch", 1_000, dispatchTasks);
  every("tasks-sweep", 60_000, sweepAllTaskRuns);
```

In the `server.on("close", ...)` handler, alongside the existing stops:

```ts
    stop("tasks-dispatch");
    stop("tasks-sweep");
```

- [ ] **Step 4: Run the e2e, then the full suite**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/tasks-e2e.test.ts`
Expected: PASS (3 tests; one real Start build in the hook).

Run: `pnpm test` (repo root — runtime + sdk + manager).
Expected: PASS everywhere. The pre-existing `e2e.test.ts`/`appWorker.test.ts` must stay green — they exercise apps without `src/tasks.ts`, i.e. the empty-manifest path.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/server.ts packages/runtime/tests/tasks-e2e.test.ts
git commit -m "feat(runtime): wire the tasks engine — manifest hook, dispatch/sweep scheduler tasks, boot recovery"
```

---

### Task 10: Dashboard Tasks panel

**Files:**
- Modify: `packages/runtime/dashboard/src/routes/index.tsx`

**Interfaces:**
- Consumes: SDK `createClient(...).tasks` (Task 5), the `tasks-change` SSE event (Task 4), existing `@lodekit/ui` components and panel-toggle pattern.
- Produces: a per-app Tasks panel (spec §8): task list with schedule / next run / last-run state / config errors, recent runs with expandable errors, **Run now**, and **Re-run** on failed runs (both enqueue with `source: "manual"`).

- [ ] **Step 1: Add the panel**

In `packages/runtime/dashboard/src/routes/index.tsx`:

1. Extend the react-query import: `import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";` and the SDK import: `import { createClient, type KvEntry, type TaskInfo, type TaskRun } from "@lodekit/sdk";`

2. Add the component after `StorePanel`:

```tsx
function StateBadgeForRun({ state }: { state: TaskRun["state"] }) {
  if (state === "failed") return <Badge variant="destructive">failed</Badge>;
  if (state === "succeeded") return <Badge variant="secondary">succeeded</Badge>;
  return <Badge variant="outline">{state}</Badge>;
}

function TasksPanel({ appId }: { appId: string }) {
  const tasks = createClient({ baseUrl: "", appId }).tasks;
  const queryClient = useQueryClient();
  const defs = useQuery({ queryKey: ["tasks", appId], queryFn: () => tasks.list() });
  const runs = useQuery({ queryKey: ["task-runs", appId], queryFn: () => tasks.runs({ limit: 15 }) });

  // Run now / Re-run — source "manual" (spec §8); invalidation arrives over SSE.
  async function runNow(name: string, payload?: unknown) {
    await fetch(`/api/apps/${appId}/tasks/${name}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload === undefined ? { source: "manual" } : { source: "manual", payload }),
    });
    void queryClient.invalidateQueries({ queryKey: ["task-runs", appId] });
  }

  if (defs.isLoading) return <Skeleton className="mt-2 h-4" />;
  if (defs.isError) return <p className="mt-2 text-sm text-muted-foreground">Failed to load tasks.</p>;
  const list = defs.data ?? [];
  return (
    <div className="mt-2 space-y-2 border-t pt-2 text-sm">
      {list.length === 0 ? (
        <p className="text-muted-foreground">No tasks declared.</p>
      ) : (
        list.filter((t: TaskInfo) => !t.retired).map((t: TaskInfo) => (
          <div key={t.name} className="flex items-center gap-2">
            <code className="shrink-0">{t.name}</code>
            {t.schedule && <Badge variant="outline">{t.schedule.expr}</Badge>}
            {t.error ? (
              <Badge variant="destructive" title={t.error}>config error</Badge>
            ) : t.nextRun ? (
              <span className="truncate text-muted-foreground">next {new Date(t.nextRun).toLocaleString()}</span>
            ) : null}
            {t.lastRun && <StateBadgeForRun state={t.lastRun.state} />}
            {!t.error && (
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void runNow(t.name)}>
                Run now
              </Button>
            )}
          </div>
        ))
      )}
      {(runs.data ?? []).length > 0 && (
        <div className="space-y-1 border-t pt-2">
          {(runs.data ?? []).map((r: TaskRun) => (
            <div key={r.id} className="flex items-center gap-2">
              <code className="shrink-0 text-muted-foreground">#{r.id}</code>
              <code className="shrink-0">{r.task}</code>
              <StateBadgeForRun state={r.state} />
              {r.error && <span className="truncate text-muted-foreground" title={r.error}>{r.error}</span>}
              {r.state === "failed" && (
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void runNow(r.task, r.payload ?? undefined)}>
                  Re-run
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

3. In `DashboardHome`, add a second panel-toggle state beside `openPanels`:

```tsx
  const [openTasks, setOpenTasks] = useState<Record<string, boolean>>({});
```

add the SSE listener in the `useEffect` (after the `kv-store-change` listener):

```tsx
    es.addEventListener("tasks-change", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { appId: string };
      void queryClient.invalidateQueries({ queryKey: ["tasks", d.appId] });
      void queryClient.invalidateQueries({ queryKey: ["task-runs", d.appId] });
    });
```

and in the card's button row, after the Data button:

```tsx
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpenTasks((p) => ({ ...p, [a.appId]: !p[a.appId] }))}
                  >
                    {openTasks[a.appId] ? "Hide tasks" : "Tasks"}
                  </Button>
```

with, under the existing StorePanel line:

```tsx
                {openTasks[a.appId] && <TasksPanel appId={a.appId} />}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/dashboard.test.ts` — the dashboard must still build (a type/JSX error fails the Start build).
Manual check: `pnpm dev` (runs against `examples/`), open `http://lodekit.localhost:7777/_dashboard/`, toggle **Tasks** on a card — expect "No tasks declared." (example apps declare none yet); no console errors.

- [ ] **Step 3: Commit**

```bash
git add packages/runtime/dashboard/src/routes/index.tsx
git commit -m "feat(dashboard): per-app Tasks panel — schedule, last-run state, run history, Run now / Re-run"
```

---

### Task 11: Docs bookkeeping

**Files:**
- Modify: `docs/specs/2026-07-02-product-overview-design.md`
- Modify: `roadmap.md`
- Modify: `context.md`

**Interfaces:** none — text only.

- [ ] **Step 1: Umbrella spec status**

In `docs/specs/2026-07-02-product-overview-design.md`, update the status-table row (§ where `| Tasks | — (the substrate ships this slice, §2.12; no Tasks spec yet) | ... |` appears) to:

```
| Tasks | v1 shipped (`docs/specs/2026-07-06-tasks-service-design.md`): queue + schedule + retries + run history on the §2.12 substrate | Event triggers (after the events revamp), steps/signals, MCP task tools |
```

and in §2.12's trigger list, mark the Tasks bullet shipped:

```
- **Tasks** (task-queue, task-schedule) — **shipped** (`docs/specs/2026-07-06-tasks-service-design.md`):
  queueing, scheduling, retries, and run history, invoking exported functions in the same
  app worker; hooks/signals deferred to the roadmap.
```

- [ ] **Step 2: Roadmap + context.md**

In `roadmap.md`, update the (already struck-through) Tasks bullet's status note from **Specced (2026-07-06)** to **Shipped (2026-07-07)**, keeping the deferred-items pointer. Add one line to the "v0.1 skill rewrite scope" bullet: the skill must also cover the `tasks` handle, the `src/tasks.ts` + `task()` declaration contract, and the catch-up/retry semantics.

In `context.md`, update the **Task** entry's trailing status from `Specced: ...` to `Shipped: docs/specs/2026-07-06-tasks-service-design.md (v1 = queue + schedule + retries + history; hooks/signals deferred).`

- [ ] **Step 3: Commit**

```bash
git add docs/specs/2026-07-02-product-overview-design.md roadmap.md context.md
git commit -m "docs: tasks service ships — umbrella status, roadmap, context.md Task entry"
```

---

## Final verification (after all tasks)

- `pnpm test` from the repo root — all packages green.
- `pnpm --filter @lodekit/runtime exec tsc --noEmit` and `pnpm --filter @lodekit/sdk exec tsc --noEmit` — clean.
- Manual smoke (`pnpm dev` against `examples/`): dashboard loads, Tasks panels render, no worker crash-loops in the terminal.





