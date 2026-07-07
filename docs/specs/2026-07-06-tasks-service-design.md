# Tasks service (v1) — design

**Date:** 2026-07-06
**Status:** Approved
**Fits:** umbrella spec §2.12 (`docs/specs/2026-07-02-product-overview-design.md`) — the
Tasks trigger on the Start-hosting substrate
(`docs/specs/2026-07-03-tanstack-start-host-design.md`). Joins the service catalog beside
kv-store (`2026-07-03-kv-store-v2-design.md`) and file-store
(`2026-07-06-file-store-design.md`), whose patterns it deliberately mirrors. Coordinates
with the in-flight logging slice (`docs/specs/2026-07-06-logging-design.md`, `stack`
branch) — see §8, Logging.

## 1. Purpose and v1 scope

Tasks is the service that runs background work on an app's behalf: **task-queue** (enqueue
now or delayed) and **task-schedule** (cron/interval schedules), executing the app's own
exported functions inside its app worker.

**In v1:** single-function tasks; enqueue with delay and dedupe; cron/interval schedules
with a catch-up window; retries with backoff; durable run history; live `tasks-change` SSE
events; a per-app dashboard Tasks panel with Run now / Re-run.

**Not in v1** (deferred to the roadmap, §11): event-triggered tasks, step-based durable
execution (`step.run`/`sleep`/`waitForEvent`), signals, a dynamic schedule API, per-task
concurrency and rate limits, priorities, MCP task tools, and consolidating the internal
kv/file TTL sweeps onto Tasks.

Provider grounding: strip the scale features from Temporal, Cloudflare
(Queues/Cron/Workflows), Inngest, Trigger.dev, QStash, and BullMQ and they converge on the
same core — enqueue now/delayed, cron, retries with backoff, run status + history, some
concurrency control, live observability. That core is v1. The dividing line they all share —
multi-step durable execution — is exactly what v1 defers.

## 2. Decisions and rationale

- **Layer on the internal scheduler; don't conflate.** `packages/runtime/src/scheduler.ts`
  stays the runtime-internal heartbeat (in-memory `setInterval`, no persistence — by
  design). The Tasks dispatcher becomes its third consumer, beside the kv/file sweeps.
  The two differ on every axis: internal sweeps are global (not per-app), run before/without
  any app, need no durability or history, and never appear in the dashboard. Durability
  comes from per-app SQLite, not from the scheduler. (Resolves the roadmap's "Internal
  scheduler vs the Tasks service" item.)
- **Declaration by convention file** (`src/tasks.ts`, a `task()` wrapper) — co-located with
  app code, agent-writable, statically discoverable; the Trigger.dev ergonomic. Chosen over
  manifest declaration (splits declaration across files, drifts) and dynamic registration
  (discovery only exists while a worker is healthy).
- **Serial per app, parallel across apps** — one in-flight run per app; different apps run
  concurrently. Matches the per-app build-chain precedent and keeps handlers easy to reason
  about. Per-task concurrency knobs come later.
- **Catch-up window, not a catch-up boolean.** A missed occurrence runs iff
  `now − scheduledAt ≤ catchUp`, coalesced to at most one run; older occurrences drop.
  Temporal's *catchup window* / Kubernetes' `startingDeadlineSeconds` / Quartz's *misfire
  threshold*. Applies uniformly to startup and any late dispatch — a local runtime is often
  off (laptop asleep, manager quit), so this is where local differs most from cloud. The
  field still accepts booleans for the endpoints of the spectrum: true = an unbounded window
  (always catch up, coalesced), false = on-time only.
- **Enqueue by name, not by reference.** A function reference can't cross the HTTP boundary;
  the `task()` wrapper carries declaration config, not identity.
- **One service, two capabilities.** One engine, one router, one SDK handle (`tasks`).
  *task-queue* and *task-schedule* remain the capability names in docs/marketing language.
  This slice closes the terminology; `context.md` is amended accordingly.

## 3. Terminology (closes with this slice)

- **Task** — a named unit of background work declared by an app in `src/tasks.ts`. Task
  name = the kebab-case of its export identifier (`dailyDigest` → `daily-digest`).
- **Run** — one execution (or pending execution) of a task, with a payload, state, and
  attempt history. States: `queued → running → succeeded | failed | canceled`. A retrying
  run is `queued` with `attempt > 0` and a future `notBefore`; the dashboard labels it
  *retrying*.
- **Schedule** — a task's `cron` or `every` declaration; a **scheduled task** is a task
  with one.
- Catalog naming: the catalog entry is **tasks (Tasks)** with capabilities *task-queue* and
  *task-schedule*. Catalog-name → SDK-handle mapping: `tasks` → `tasks`.
- _Avoid_: job, cron job, worker (taken by app worker), workflow.

## 4. Declaration contract — `src/tasks.ts`

```ts
// apps/<id>/src/tasks.ts
import { task } from "@lodekit/sdk";

export const dailyDigest = task({
  cron: "0 9 * * *",   // 5-field cron, machine-local timezone
  catchUp: "6h",     // duration; true = always; false disables; default "1h"
  run: async () => { /* full SDK access */ },
});

export const resizeImage = task({
  retries: 3,          // retries after the first attempt; default 3
  timeout: "5m",       // per-attempt; default "5m"
  run: async (payload: { fileSlug: string }) => { /* ... */ },
});
```

- `task(config)` is a thin SDK wrapper: it validates config shape and returns it tagged;
  it does not talk to the runtime.
- `cron` and `every` are mutually exclusive; both optional (a task with neither is
  queue-only). `every` is interval sugar (`"30m"`, `"1h"`); `cron` is a 5-field expression
  evaluated in the machine's local timezone (personal tool, person-local time). Parsing and
  next-occurrence math use `croner` (zero-dependency, maintained), never hand-rolled.
- Durations everywhere (`catchUp`, `timeout`, `every`, `delay`) use the same short-duration
  string grammar (`"30s"`, `"10m"`, `"6h"`), one shared parser in the SDK/runtime. `catchUp`
  additionally accepts `true` (always catch up, unbounded window) and `false` (disabled).
- The Start build includes `src/tasks.ts` as an additional server-bundle entry. On worker
  boot, the worker loads it and posts a **task manifest** (names + config) to the runtime,
  which upserts durable definitions into the app's SQLite. Definitions therefore survive a
  down or broken worker: schedules and history stay visible in the dashboard. A task absent
  from the manifest on a successful boot is **retired** — kept for run history, no longer
  schedulable; enqueue to a retired or unknown task is a 400. Apps without `src/tasks.ts`
  have no tasks and no Tasks panel content.
- Manifest config errors (bad cron, bad duration, `cron`+`every` together) fail that task's
  registration with a visible per-task error in the dashboard; other tasks in the file
  still register.

## 5. Storage — the catalog pattern

`packages/runtime/src/services/tasks.ts`, mirroring kv-store/file-store: `CATALOG_NAME =
"tasks"`, a lazy per-app handle over `getAppDb`, a `withTasks` middleware, a chained
`tasksRoutes` Hono router with `zValidator`, `export type TasksRoutes` for the SDK, and SSE
emission on mutation. Two `_lodekit_`-prefixed tables in `data/<appId>/db.sqlite`:

- **`_lodekit_task_defs`** — name (PK), schedule kind + expression, `catchUp`, `retries`,
  `timeout`, retired flag, config-error text, registered-at, last-scheduled-at (the cron
  high-water mark). Schedule changes are detected by direct comparison on re-registration
  (a changed schedule resets the anchor and high-water mark).
- **`_lodekit_task_runs`** — run id (PK, generated), task name, state, payload (JSON text),
  `dedupeKey` (nullable), attempt, `notBefore`, source (`enqueue` | `schedule` | `manual`),
  created/started/finished timestamps, duration, truncated error (message + stack).

## 6. Scoped API and SDK surface

Routes under `/api/apps/:appId/tasks` (registered in `routes.ts` with the standard two-line
`.use(withTasks)` + `.route(tasksRoutes)` pattern):

- `GET /` — list task definitions with next-run time and last-run summary.
- `POST /:name/runs` — enqueue `{ payload?, delay?, at?, dedupeKey? }` → `{ runId }`.
- `GET /runs` / `GET /runs/:id` — query run history (filter by task, state; limit).
- `DELETE /runs/:id` — cancel; only a `queued` run can be canceled (404/409 otherwise).

SDK handle (`import { tasks } from "@lodekit/sdk"`, typed via `hc<TasksRoutes>`):

```ts
const runId = await tasks.enqueue("resize-image", { fileSlug }, { delay: "10s", dedupeKey: fileSlug });
await tasks.cancel(runId);
const runs = await tasks.runs({ task: "resize-image", limit: 20 });
const defs = await tasks.list();
tasks.watch(cb);   // client-side, over the existing shared EventSource channel
```

- Payload is JSON under the existing 100kb scoped-API body limit.
- **`dedupeKey`**: if a `queued` run of the same task with the same key exists, enqueue is
  a no-op returning the existing run id. Dedupe is against queued runs only — cheap
  idempotency, not dedup-across-history.
- `delay` and `at` are mutually exclusive; both set `notBefore`.
- Schedules are declaration-only in v1 — no dynamic schedule API.

## 7. Execution engine

The dispatcher is an internal-scheduler consumer registered in `server.ts start()`:
`every("tasks-dispatch", 1_000, dispatch)`. Enqueue and worker-boot nudge it immediately
via `tick("tasks-dispatch")`, so the 1s poll is a fallback, not the latency floor. The
engine takes an injectable clock (`now()`) so tests drive time without real timers.

Each dispatch pass, per app (skipping apps with a run already in flight — serial per app,
parallel across apps):

1. **Materialize due schedule runs.** For each non-retired scheduled definition, compute
   occurrences after the `last-scheduled-at` high-water mark. If any are due: the latest
   occurrence within its `catchUp` window materializes one `queued` run (source
   `schedule`); older missed occurrences drop. Advance the high-water mark past everything
   considered. At most one queued schedule-run per task at a time (a still-queued previous
   occurrence absorbs the new one).
2. **Start the oldest due run** (`queued`, `notBefore ≤ now`, task not retired): mark
   `running`, stamp `startedAt`, increment `attempt`, and invoke the handler in the app
   worker.

**Invocation.** A new worker message type (`task-run`, distinct from the HTTP `request`
type) through the existing `appWorker` request/response machinery, carrying task name +
payload, with the task's own `timeout` (default 5m) instead of the HTTP 30s. The worker
entry resolves the handler from the loaded `src/tasks.ts` module and runs it; handlers have
full SDK access (loopback HTTP), per umbrella §2.12. If the app's worker is down (build
error, respawn backoff), due runs simply wait in `queued` — visible, never silently
dropped, and no attempt is consumed. A timed-out attempt is failed by the runtime but NOT
aborted inside the worker (no cancellation in v1) — a long-running handler may still be
executing when its retry starts, so serial-per-app holds at the engine level, not inside
the worker.

**Completion and retries — at-least-once.**

- Handler resolves → `succeeded` (duration recorded).
- Handler throws, times out, or the worker dies mid-run → the attempt fails. If
  `attempt ≤ retries`: back to `queued` with `notBefore = now + 30s·2^(attempt−1)`, capped
  at 10m. Else terminal `failed` with the truncated error.
- Runtime death mid-run: on boot, stale `running` rows are treated as a failed attempt
  (interrupted) and rescheduled by the same rule.
- A terminal `failed` run is visible and re-runnable from the dashboard; re-run = a fresh
  run (source `manual`), never a mutation of the failed one. No DLQ concept.
- A failing attempt whose task was retired mid-run goes terminal `failed` immediately
  (no retry) — otherwise the requeued run would be orphaned, since retired defs are
  never claimable and the retire-time cancel only sees `queued` rows.

**Defaults** (all to become settings later — roadmap §11): `retries` 3, `timeout` "5m",
`catchUp` "1h", backoff 30s·2ⁿ capped 10m, dispatch poll 1s.

## 8. Events, logging, and dashboard

Run-state transitions and definition changes (register/retire/config-change) broadcast
**`tasks-change`** on the existing SSE bus, app-scoped, same shape family as
`kv-store-change`: `{ task, runId?, state? }`. Durable state lives in SQLite and is
queryable; SSE is only the live notification (the bus has no replay — established pattern).

**Logging** — coordinates with the in-flight logging slice
(`docs/specs/2026-07-06-logging-design.md`, `stack` branch); the division of labor:

- The **runs table stays the durable run state** — bounded, queryable, driving the
  dashboard panel and re-runs. Logs are diagnostic detail with their own retention.
- The tasks engine logs through the platform logger under a **`tasks` source** (the
  source column is free-form text — no logging-schema change): run start at `debug`,
  retry at `warn`, terminal failure at `error`, app-tagged, with fields
  `{ task, runId, attempt, duration_ms }` (the logging spec's conventional keys).
- Handler `console.*` output is captured automatically as app `console` records by the
  logging slice's worker capture — nothing for Tasks to build. A dispatcher-level
  uncaught throw is likewise already covered by the logging slice's `scheduler`-source
  error records.
- The logging slice's `lodekit_logs` MCP tool is the failed-run debug loop (Claude reads
  the app's logs), which is why Tasks defers its own MCP tools (§11).
- Sequencing: whichever slice lands second wires the `tasks`-source log calls; until
  then the engine's error path tees to stderr like the rest of the runtime. No naming
  collisions: the internal-scheduler registrations are `log-sweep` (logging) vs
  `tasks-dispatch`/`tasks-sweep` (this slice), and the worker postMessage types are
  `log` (logging) vs `task-run` (this slice).

Dashboard v1, per the umbrella's "schedule + last-run state": a per-app **Tasks panel**
listing each task with its schedule, next-run time, and last-run state; a recent-runs list
(state, error); **Run now** (= enqueue with source `manual`) and **Re-run** on failed runs.
Live via `tasks-change`.

## 9. Housekeeping and guardrails

- **Retention:** a `tasks-sweep` internal-scheduler task (same pattern as the kv/file
  sweeps) prunes run history to *last 100 runs or 30 days per task, whichever keeps more*.
  Terminal states only; `queued`/`running` rows are never swept. (Thresholds → settings
  later, roadmap §11.)
- Payloads capped by the existing body limit; stored errors truncated (message + bounded
  stack).
- Trust-boundary validation as everywhere in the catalog: `zValidator` on every route,
  app-id validation in `withTasks`, name/duration/cron grammar validated at manifest
  registration and enqueue.
- The dispatcher is error-isolated by the internal scheduler (a throw logs and continues)
  and additionally guards per app, so one app's corrupt row can't stall other apps.

## 10. Testing

- **Unit (pure, injected clock):** occurrence/catch-up math (within window, outside window,
  coalescing to latest, high-water-mark advance, `every` sugar), duration grammar, backoff
  curve, dedupeKey no-op, retention pruning rule.
- **Service (Hono router, temp root):** enqueue/list/get/cancel round-trips; cancel-only-
  queued conflict; retired/unknown-task 400; validation rejections; SSE `tasks-change`
  emission on transitions.
- **Integration (real worker, e2e pattern):** declare tasks in a fixture app; manifest
  registration on boot; enqueue → handler runs in the worker with SDK access; throw →
  retry with backoff → terminal failed; timeout enforcement; serial-per-app ordering;
  worker-down runs wait without consuming attempts; restart with stale `running` rows
  reschedules; missed-cron catch-up inside vs outside the window. Tests drive the
  dispatcher via `tick("tasks-dispatch")` and the injected clock — no real waiting.

## 11. Deferred (→ roadmap)

- **Event-triggered tasks** — after the events revamp; closes the server-side
  `watch`/signals gap.
- **Step-based durable execution** — `step.run`/`step.sleep`/`waitForEvent`, memoized in
  SQLite (the Temporal/CF-Workflows/Inngest model).
- **Signals**, **dynamic schedule API**, **per-task concurrency / rate limits /
  priorities**.
- **MCP task tools** — with the MCP-slice conventions; read-only first per the security
  roadmap.
- **Sweep consolidation** — optionally move the kv/file TTL sweeps onto Tasks as
  system-level scheduled tasks.
- **Defaults/thresholds → settings** — every default and threshold in this spec (default
  `catchUp`, `retries`, `timeout`, backoff curve, dispatch poll interval, retention "last
  100 runs or 30 days") becomes a setting when the settings service lands.
