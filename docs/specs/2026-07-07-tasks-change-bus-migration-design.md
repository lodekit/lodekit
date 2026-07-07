# tasks-change onto the event bus

**Date:** 2026-07-07 · **Status:** approved · **Scope:** fast-follow to the events slice
(`2026-07-07-events-design.md`), migrating the last pre-bus service feed.

## 1. Context

The Tasks v1 slice (`2026-07-06-tasks-service-design.md` §8) landed in parallel with the
events slice, so its change feed still rides a plain SSE broadcast
(`broadcast("tasks-change", …)` in `services/tasks.ts`) plus a dedicated SDK surface
(`tasks.watch` / `TasksChange`) — the pre-bus pattern kv/file-store migrated away from.
It works (the transport is shared) but it is the one service feed that isn't a stored,
replayable event. This slice migrates it exactly the way `kv-store-change` /
`file-store-change` moved (events spec §4) and removes the roadmap entry that tracked it.

## 2. Runtime

`emitTasksChange` (`services/tasks.ts`) keeps its name and all call sites; its body
becomes the kv-store `emit` pattern:

```ts
emitEvent({ ns: appId, source: PLATFORM_NS, type: EVENT, payload: data, ttl: CHANGE_FEED_TTL_S });
```

- `EVENT` stays `` `${CATALOG_NAME}-change` `` → `tasks-change`; the event **type** string
  is unchanged. The SSE **wire name** changes from `tasks-change` to the bus's single
  `event: event` envelope — the same consumer-visible move kv/file-store made.
- Payload is the identity-only shape family from the tasks spec §8:
  `{ task, runId?, state? }`. The `appId` member of the old broadcast payload is dropped —
  the envelope's `ns` carries it.
- **The `error?` field is dropped** (decision, this spec): the one emitter that passed it
  (`taskEngine.registerManifest` on a module load error) sends a full stack trace, which
  could exceed the 8 KB payload cap and silently drop the change notification. The same
  stack is already persisted as a `tasks`-source error log record emitted alongside, and
  no consumer reads `TasksChange.error` today. The load-error emission becomes
  `{ task: "*" }` — "defs state changed, refetch"; detail lives in the log.
- Service-set `ttl` of `CHANGE_FEED_TTL_S` (7 days), like the other change feeds:
  durable ≠ forever.
- The `broadcast` import in `services/tasks.ts` goes away. `emitEvent` validates its own
  inputs and never throws, so the engine's "a broadcast error never wedges dispatch"
  property is preserved by construction.

Tasks-change events are now stored (replayable via `events.list` / the history endpoint,
visible in the dashboard Events view) and delivered ns-scoped: an app's feed sees its own
tasks changes, never a sibling's.

## 3. SDK

`Tasks.watch` and the exported `TasksChange` type are **removed** — the same move the
events spec made for `kv.watch`/`files.watch` (one watch surface, no aliases). Consumers
use:

```ts
client.events.watch({ type: "tasks-change" }, (ev) => { /* ev.ns is the app id */ });
```

`LodekitClient` keeps the `tasks` handle for everything else (enqueue/cancel/runs/list).

## 4. Dashboard

The index route's separate `es.addEventListener("tasks-change", …)` block folds into the
existing envelope-aware `event` listener as a `d.type === "tasks-change"` branch,
invalidating the `["tasks", d.ns]` and `["task-runs", d.ns]` queries (previously keyed
off the broadcast's `appId` field).

## 5. Tests

The `tasks-api.test.ts` SSE case updates from the old wire name to the envelope and gains
the migration's two new guarantees, mirroring the events spec's change-feed-migration
test: an enqueue lands a **stored** `tasks-change` event (listable on the app's stream,
service ttl applied) and reaches a **scoped** SSE client under `event: event` with
`ns` = the app id. SDK tests need no changes: no `tasks.watch` case exists (removal is
compile-time) and `events.watch` filtering is already covered.

## 6. Docs & bookkeeping

- **Tasks spec** (`2026-07-06-tasks-service-design.md` §8): dated supersession note in the
  kv/file style — transport and durability upgraded, event type and payload identity
  unchanged, `error` field dropped in favor of the adjacent log record.
- **Events spec** (`2026-07-07-events-design.md` §4): the change-feeds paragraph gains
  `tasks-change` (it now names only kv/file-store).
- **`roadmap.md`:** delete the "`tasks-change` feed onto the event bus" entry. The
  event-triggered-tasks entry it pointed at stays — this migration is its prerequisite,
  not its delivery.
- **Skill (`packages/skill`):** no change — `SKILL.md` never documented `tasks.watch`,
  and its `events.watch` guidance already covers the pattern. (Nothing else consumes the
  old surface: no examples usage.)

## 7. Non-goals

Event-triggered tasks (server-side subscriptions) stay on the roadmap; retention values
stay constants (gated on the settings service); the respawn give-up latch is untouched.
