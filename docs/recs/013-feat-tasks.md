# 013-feat: Tasks

**Status:** Active · **Last reviewed:** 2026-08-11

## Overview

Tasks is the service that runs background work on an app's behalf — one service, two
capabilities: task-queue (enqueue now or delayed) and task-schedule (cron or interval
schedules). An app declares its tasks in code; the engine materializes, dispatches,
and retries runs, executing the app's own handler inside the app worker with full
SDK access; run state and history are durable, and every transition hits the bus.

## Behavior

- Tasks are declared as exported handlers (`task()`); the task name is the kebab-case
  of the export. A task may carry a cron expression (5-field, machine-local timezone)
  or an interval — mutually exclusive — plus a catch-up window, retry budget, and
  per-attempt timeout. Anything unspecified resolves to the platform's effective
  default at the moment of use, so the person's settings tune the next run.
- Worker boot registers the declared tasks wholesale. A task absent on a successful
  boot is retired (kept for run history, no longer runnable, queued runs canceled)
  and un-retires if it returns; a per-task config error is visible without blocking
  siblings, and a load error never wipes previous definitions.
- Each execution is a run: queued → running → succeeded, failed, or canceled; a
  retrying run is queued with a consumed attempt and a future due time. Runs record
  their source — enqueue, schedule, or manual.
- Enqueue accepts a delay or an absolute time, and a dedupe key: if a queued run of
  the same task holds the same key, the enqueue is absorbed and returns the
  existing run. Only a queued run can be canceled. Execution is serial per app and
  parallel across apps; enqueues and worker boots nudge the dispatcher immediately —
  its poll is a fallback, not the latency floor.
- Delivery is at-least-once. A failed attempt retries with exponential backoff until
  the budget is spent, then goes terminally failed with a truncated error; a
  timed-out attempt is failed by the engine but not aborted inside the worker. If
  the worker is down, due runs wait visibly in queued — never dropped, no attempt
  consumed — and runs interrupted by engine death count as one failed attempt and
  reschedule by the normal rule.
- Of missed schedule occurrences, only the latest inside the catch-up window fires;
  older ones drop, and a still-queued previous occurrence absorbs the new one. A
  grace floor lets a barely-late occurrence fire even with catch-up disabled;
  schedules materialize at engine boot, before any worker is up.
- Run history is queryable (filter by task and state), pruned by person-tunable
  per-app retention (newest N per task, maximum age).
- Every run transition reaches the bus as an app-scoped past-tense fact
  (`run-queued`, `run-started`, `run-succeeded`, `run-failed`, `run-canceled`) and
  definition changes as `defs-changed`, stored with the change-feed retention,
  delivered live, filterable by the tasks component. Diagnostic detail flows to the
  log-store under a tasks source; the runs table stays the durable state.
- The SDK offers enqueue, cancel, run queries, and the definition list — no
  dedicated task watch; the event bus is the one watch surface.
- Task activity currently reaches the person through the dashboard Events and Logs
  views and over the SDK/API; the dedicated Tasks page is an empty stub (see Open
  Questions), and the API's manual run source has no dashboard affordance today.

## Design Decisions

### 1. Layer on the internal scheduler; don't conflate

**Decision:** The engine's in-memory heartbeat stays a dumb interval registry; the
task dispatcher is one consumer of it, and all durability lives in per-app SQLite.
**Why:** Sweeps and app tasks differ in scope, durability, visibility (tasks spec §2).
**Tradeoff:** Two scheduling notions coexist in the engine.

### 2. Declaration by convention file; enqueue by name

**Decision:** Tasks are declared in app source and referenced by name over HTTP,
never by function reference; schedules are declaration-only.
**Why:** Co-located, agent-writable, statically discoverable; a function reference
cannot cross the HTTP boundary (tasks spec §2).
**Tradeoff:** No dynamic schedules; a renamed export retires the task, strands history.

### 3. Serial per app, parallel across apps

**Decision:** One in-flight run per app; different apps run concurrently.
**Why:** Handlers stay easy to reason about, matching the per-app build-chain
precedent; concurrency knobs wait until proven necessary.
**Tradeoff:** One slow task blocks its app's whole queue.

### 4. Catch-up window, not a catch-up boolean

**Decision:** A missed occurrence fires only within its window, coalesced to at most
one run; the boolean endpoints remain as sugar (always / on-time only).
**Why:** A local engine is often off — laptop asleep, manager quit — so misfire
policy is where local differs most from cloud (Temporal's catchup window).
**Tradeoff:** Occurrences outside the window drop silently by design.

### 5. At-least-once with visible waiting, no DLQ

**Decision:** Worker-down runs wait in queued; terminal failures stay visible and
re-runnable as fresh manual runs; timeouts don't abort handlers (no cancellation).
**Why:** On a personal machine, "visible and waiting" beats "silently dropped"; a
dead-letter concept adds ceremony a single person doesn't need.
**Tradeoff:** Handlers tolerate re-execution; a hung handler can overlap its retry.

### 6. The change feed became stored, fine-grained bus facts

**Decision:** The original plain SSE broadcast (`tasks-change`) migrated onto the
event bus, and the canonical-model slice then split the coarse type into per-state
run facts with identity-only payloads; the SDK's dedicated watch was removed.
**Why:** Stored events are replayable and app-scoped, and the state belongs in the
type, not the payload (002-arch); one watch surface, no aliases.
**Tradeoff:** Fact types are load-bearing bus-wide — renaming one is a migration.

## Related

- **Recs:** 001-arch-event-envelope-kind-component, 002-arch-event-fact-types,
  005-arch-engine-rename (the dispatch subsystem is the taskExecutor),
  008-feat-dashboard, 012-feat-settings, 019-feat-logging-events
- **Specs:** `docs/specs/2026-07-06-tasks-service-design.md`,
  `docs/specs/2026-07-07-tasks-change-bus-migration-design.md`,
  `docs/specs/2026-07-16-events-canonical-model-design.md`,
  `docs/specs/2026-07-09-dashboard-ui-revamp-design.md`

## Open Questions

- The person-facing Tasks surface is missing: the dashboard revamp removed the
  per-app tasks panel (schedule, last-run state, Run now / Re-run) and left the
  Tasks page a stub; nothing person-facing drives the manual-trigger API today.
- Event-triggered tasks remain on the backlog; the bus migration was their
  prerequisite, not their delivery.
