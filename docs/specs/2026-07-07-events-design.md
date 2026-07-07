# Events — Design

**Date:** 2026-07-07
**Status:** Draft, pending review
**Role:** Slice-spec for the platform's event bus: a unified, durable, Kafka-shaped event
log over sqlite that platform and apps emit to and consume from. Introduces the
event-store service (catalog), the **internal namespace** convention (`_platform`,
`_manager`, `_dashboard`), and the storage-tier guideline as canonical terms. Absorbs the
kv/file-store change feeds and the platform's build/lifecycle broadcasts into one
substrate; designed as the future trigger layer for Tasks and webhooks.

## 1. Goals & scope

Events grew organically: `sse.ts` is a 22-line in-memory fan-out, six event types ride it
(build states, `server-state`, `apps-changed`, the `log` tail, `kv-store-change`,
`file-store-change`), all emitted by the platform, none persisted — a disconnected
consumer misses everything, and apps cannot emit at all. This slice makes events a
first-class capability:

1. **One event bus** — a durable, append-only event log every citizen emits to: the
   platform (build/lifecycle/registry events), apps (business events via a new SDK
   `events` handle), and later the manager and task runners.
2. **One watch surface** — apps subscribe with `events.watch(...)`; the per-service
   `kv.watch`/`files.watch` duplicates are removed and their change feeds become events.
3. **Both consumers are first-class** — a dashboard Events view (live tail + history) and
   an MCP tool so Claude can ask "what happened while I was away."

**Scope decisions made in review:**

- **Events drive business logic; logs are telemetry.** That is the canonical line between
  the two stores. The dashboard reacting to `ready`, an expense tracker surfacing a
  finished CSV export, a polling task announcing a detected change — events. What
  happened, for observation — logs. The `log` SSE tail therefore stays log-store's
  surface (storing tail messages would double-store the log); everything else on the bus
  is an event and is stored, period. No transient class, no per-type durability flags.
- **No broker dependency.** RabbitMQ/Kafka/NATS are separate daemons (Erlang/JVM/Go) — a
  second process to provision, supervise, and package, bought for properties (partitions,
  replication, cross-machine consumer groups) that don't exist on a single-person,
  single-process platform. Embedded alternatives are thin layers over the primitive we
  already ship. What we take from Kafka is its **shape**: an append-only log whose
  monotonic row id is the offset — live consumers tail over SSE, catch-up consumers read
  `WHERE id > cursor`, and the future Tasks service gets at-least-once trigger delivery
  by adding a cursor table, no schema change.
- **Events are precious, not State.** Once events drive business logic, an unconsumed
  event is pending work, not history — losing it in a restore costs a missed trigger, not
  nostalgia. By the storage-tier guideline (§2) that places the bus in the Backup tree:
  `data/_platform/events.sqlite`. Retention still applies — precious means *backed up*,
  not *kept forever*.
- **Internal namespaces, not reserved words.** People legitimately want apps named
  `dashboard` or `platform`. Instead of a reserved-id list (which steals names and needs
  enforcement at every validation point), internal citizens use underscore-prefixed
  namespaces — `_platform`, `_manager`, `_dashboard` — which the app-id grammar
  (`^[a-z0-9-]+$`) already makes impossible to collide with. Zero enforcement code; the
  grammar does the work. This formalizes existing practice: `_dashboard` is already the
  dashboard's app-worker id and `/_ui` the UI catalog's URL prefix.

**Non-goals** (each parked on the roadmap): manager/dashboard emission (the HTTP door for
`_manager` and its auth story); server-side `events.watch` and durable consumer cursors
(the Tasks design consumes the offset schema as-is); retention as dashboard/app settings;
event emit over MCP; cross-namespace subscriptions for apps (an app's feed is its own
namespace, period); the URL routing-precedence audit for app names that shadow platform
mounts (`api`, `dashboard`) — pre-existing, not event-specific.

## 2. Concepts & canonical terms

New `context.md` entries:

> **Event**:
> A durable message on the platform's event bus that drives business logic: the platform
> announcing an app became ready, an app announcing an export finished, a task announcing
> a detected change. Every event is addressed (`ns` — whose stream it belongs to) and
> attributed (`source` — who emitted it), persisted to the event-store, and delivered
> live over SSE. Events are never the system of record: precious facts belong in the
> emitting app's own stores — the event announces and triggers.
> _Avoid_: message, signal, notification

> **Event bus**:
> The platform-wide append-only event log — the event-store service (catalog name
> `event-store`, SDK handle `events`). One sqlite log at `data/_platform/events.sqlite`
> (precious — in the Backup tree), monotonic row id as the offset, SSE as the live tail,
> `list` as the replay read.
> _Avoid_: message queue, broker, SSE (that's the transport)

> **Internal namespace**:
> An underscore-prefixed id (`_platform`, `_manager`, `_dashboard`) naming a platform
> citizen rather than an app. The app-id grammar has no underscore, so internal
> namespaces can never collide with an app id — no reserved-word list, no enforcement.
> Internal namespaces are first-class in the id space, on the event bus (they emit and
> own streams), and in the data tree (`data/_platform/` holds the bus; `data/_manager/`
> is available when needed). They are **not** Apps — no source folder, no contract.
> _Avoid_: reserved app, system app, internal app

**Contrasts** (context.md "terms that bite" section): **Event vs Log** — logs are
telemetry (what happened, for observation); events drive business logic (what happened,
for reaction). **Event vs live tail** — the `log` SSE message is log-store's live surface
riding the shared SSE transport; it is not an event and never touches the bus.

**Storage-tier guideline** (context.md, alongside the tree terms — the rule the tree
definitions already encode, stated once as a decision test): place data by **cost of
loss** — *precious* (Backup tree: the person would miss it restoring a backup),
*operational history* (State: loss costs history, never apps or data), *regenerable*
(Cache: loss costs a rebuild). A service never silently promotes tiers: if a record is
precious to an app, the app writes the fact into its own store and the event announces
it.

## 3. Data model

One table in `data/_platform/events.sqlite` (WAL), created with its directory at startup.
The platform owns the file, so the table is plainly `events`:

```sql
CREATE TABLE events (
  id         INTEGER PRIMARY KEY,   -- rowid: the offset — monotonic, cheap cursor
  ts         INTEGER NOT NULL,      -- epoch ms
  ns         TEXT NOT NULL,         -- whose stream: app id or internal namespace (^_?[a-z0-9-]+$)
  source     TEXT NOT NULL,         -- who emitted: same grammar as ns
  type       TEXT NOT NULL,         -- event name, app-id grammar ^[a-z0-9-]+$
  payload    TEXT,                  -- JSON object or NULL; ≤ 8 KB serialized
  expires_at INTEGER                -- epoch ms from per-emission ttl; NULL = default retention
);
CREATE INDEX events_ns ON events(ns, id);
```

- **`ns` vs `source`** — mirrors log-store's `app_id` + `source` split. The platform
  emits app-relevant events *into the app's namespace* (`ns: "expenses", source:
  "_platform", type: "ready"`), so an app's own feed carries its lifecycle without
  exposing any sibling's. App emissions are `ns = source =` the app's id, set by the
  runtime — attribution cannot be forged by construction.
- **Payloads carry identity, not values** — the keyspace-notification principle the
  change feeds already follow (`{key, op}`, never the value); consumers refetch. The 8 KB
  cap enforces the spirit.
- **Root-local, unlike logs** — the bus lives in the data tree, so a dev root
  (`./examples`) has its own bus, cleanly separated from the real one. (Logs went the
  other way — global State — because telemetry spans roots; events belong to a root's
  apps and data.)

## 4. Emission

There is exactly one emission path and one writer to `events.sqlite`.

**Emit facade** (`packages/runtime/src/events.ts`): `emitEvent({ns, source, type,
payload?, ttl?})` — validate (grammar on `ns`/`source`/`type`, payload cap, ttl bounds) →
insert via prepared statement → `broadcast` over the untouched `sse.ts`. **Wire shape:**
the SSE `event:` field is the *type* (so `addEventListener("ready")` patterns survive);
`data:` is the full stored envelope `{id, ts, ns, source, type, payload}` — the offset
travels with every live event. SSE scoping keeps today's rule with `ns` as the key: the
scoped feed (`/api/apps/:appId/events`) receives ns-matched events, the global feed
(`/api/events`) receives everything. If the insert fails, the facade logs an error
(log-store) and broadcasts anyway — live consumers keep working and emitters are never
blocked; the gap is history, not delivery.

**App emission** — `POST /api/apps/:appId/event-store` (service router, §5): body
`{type, payload?, ttl?}`; the runtime stamps `ns = source = appId`. Same-origin guard
like other writes. Returns the stored event, so the app learns its offset.

**Platform emitter migration** — the three state broadcasters move onto the facade
(superseding the logging spec's "state broadcasts are untouched" note, which predates the
bus):

| Event | Was | Becomes |
| --- | --- | --- |
| `building` / `ready` / `error` | `build.ts` `setState` broadcast | `{ns: <app id>, source: "_platform"}`; payload `{message}` on error. The dashboard's own builds emit as `ns: "_dashboard"`. |
| `server-state` | `appWorker.ts` broadcast | `{ns: <app id>, source: "_platform"}`, payload `{status, message?}`. Respawn churn is bounded by the existing backoff plus retention; the give-up latch stays a roadmap item. |
| `apps-changed` | `watcher.ts` broadcast of the full registry scan | `{ns: "_platform", source: "_platform"}` with **no payload** — consumers refetch the app list (identity, not values). |

**Change feeds become events** — `kv-store-change` and `file-store-change` move from
plain broadcasts to `emitEvent` with `{ns: <app id>, source: "_platform"}` and their
existing payloads (`{key, op}` / `{slug, op}`), emitted with a service-set **`ttl` of 7
days** (vs the 30-day default): durable ≠ forever, and the shorter window keeps the
noisiest tenant from bloating the backed-up file while still buying replay and future
task triggers. The TTL-expiry sweeps keep emitting their `expire` ops through the same
path.

**Not on the bus** — the `log` SSE tail keeps its plain broadcast in `logger.ts`
(log-store's live surface; logs are telemetry). `sse.ts` itself is unchanged: shared
transport infrastructure with two users — the bus and the log tail.

## 5. Query surfaces

**HTTP.** Service module `services/event-store.ts` with `CATALOG_NAME = "event-store"`,
a chained Hono router mounted at `/api/apps/:appId/event-store` in `routes.ts`, route
type exported for the SDK (log-store pattern):

- `POST /api/apps/:appId/event-store` — emit (§4).
- `GET /api/apps/:appId/event-store` — the app's stream (incl. `_platform`-sourced
  events in its ns). Params: `type`, `after` (id cursor, ascending replay) *or* `before`
  (newest-first pagination), `limit` (default 100, capped at 1000).
- `GET /api/events/history` — global, all namespaces; same params plus `ns`. Dashboard-
  and MCP-facing. (`/api/events` itself stays the SSE feed.)

**SDK** (`@lodekit/sdk`) — the `events` handle, catalog mapping `event-store → events`:

- `events.emit(type, payload?, {ttl?})` — client & server (it's a POST to the scoped
  API); returns the stored event.
- `events.watch({type?}, cb)` — client-only, on the existing shared-EventSource channel
  (now its only SDK user); `type` a string or array; `cb` receives the full envelope;
  returns an unsubscribe. Key/slug filtering happens in the callback.
- `events.list({type?, after?, before?, limit?})` — the app's stream.

`kv.watch` and `files.watch` are **removed** (with the `KvChange`/`FilesChange` types —
an exported `LodekitEvent<T>` envelope type replaces them). One watch surface. The
expense-tracker example migrates to
`events.watch({type: "kv-store-change"}, …)` — a three-line change.

**Dashboard.** An **Events view** — the dashboard's third route, on the Logs-view
pattern: backfill from `GET /api/events/history`, live tail from the already-open global
`EventSource`, filter chips for ns (including the internal namespaces), type, and
free-text; rows expand to show the payload. The index page's listeners (build badges,
health, app list, kv invalidation) become envelope-aware; `apps-changed` handling
refetches instead of reading the payload. The appHost interstitial script updates
likewise.

**MCP.** One new read-only tool, `lodekit_events` (`appId?`, `type?`, `after?`,
`limit?`), calling `GET /api/events/history` over HTTP like `lodekit_logs`. Claude
builds an app, wonders whether the export task fired — and reads the stream.

## 6. Retention & failure handling

- **Sweep** — on the existing 60s scheduler: delete rows past `expires_at`, delete rows
  older than **30 days**, then trim oldest-first beyond **50k rows**. Constants this
  slice; settings-service override on the roadmap. Per-emission `ttl` (seconds, positive,
  ≤ the 30-day default) covers the app-driven case now.
- **Emit never takes down its caller** — validation errors return 400 on the HTTP door
  and throw only there; internal emitters pass validated shapes. Insert failures: log +
  broadcast anyway (§4). The SDK handle surfaces HTTP errors on `emit` (an app may care
  that its event wasn't recorded) but `watch` reconnects silently via EventSource
  semantics.
- **Unopenable DB at startup** — the runtime still boots; the bus degrades to
  broadcast-only (live events flow, history is empty), with an error log record saying
  so. Same posture as logs.
- A person deleting `data/_platform/` costs event history and pending replay, never apps
  or data; the file is recreated on next startup.

## 7. Testing

Vitest in the runtime package: event-store service tests (emit→list roundtrip, offset
ordering, `after`/`before` cursors, type filter, payload cap, grammar and ttl
validation); SSE scoping (an app feed sees its own and `_platform`-sourced events in its
ns, never a sibling's; global sees all); retention sweep (ttl + age + cap); change-feed
migration (a `kv.set` lands a stored `kv-store-change` event and reaches a scoped SSE
client); degradation with an unopenable DB; and a `lodekit_events` case in the
runtime↔MCP integration test. SDK tests for `emit`/`list`/`watch` filtering. The
example-app smoke stays green after the watch migration.

## 8. Docs & bookkeeping

- **`context.md`:** Event, Event bus, Internal namespace terms (§2); the Event/Log and
  Event/live-tail contrasts; the storage-tier guideline; catalog table gains
  `event-store → events`; Data tree entry notes `data/_platform/` (internal namespaces
  own data homes too).
- **`roadmap.md`:** new entries for the non-goals (§1) — manager/dashboard emission door,
  server-side watch + consumer cursors folded into the existing Tasks-design entry, event
  retention as settings, MCP emit, routing-precedence audit. Close "`platform` is a
  reserved app id but not rejected": the sentinel renames to `_platform`, which the
  grammar already rejects — log-store's global endpoint and `lodekit_logs` update
  accordingly, and the explicit reserved-id check in `services/log-store.ts` is deleted.
- **kv-store v2 / file-store specs:** their change-feed sections are superseded by §4
  (wire event names and payloads unchanged; transport and durability upgraded).
- **Skill (`packages/skill`):** document the `events` handle (emit/watch/list), the
  envelope, and the watch-migration pattern (`events.watch({type: "kv-store-change"})`
  replacing `kv.watch`).
