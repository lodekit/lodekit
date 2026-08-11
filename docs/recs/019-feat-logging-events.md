# 019-feat: Logging & Events

**Status:** Active · **Last reviewed:** 2026-08-11

## Overview

Logging and events are two adjacent capabilities with one deliberate line between them:
the log-store is telemetry — what happened, recorded for observation — and the event bus
is business facts — what happened, announced for reaction. The engine, the services, and
apps feed both; the person reads both in the dashboard (a Logs view and an Events
explorer), and the agent reads both over MCP — the debug loop ("read the app's logs")
and the catch-up loop ("what happened while I was away").

## Behavior

- Logs are structured records: a level (debug / info / warn / error), the emitting
  component, an optional app id, a message, and structured fields. Three inflows: engine
  subsystems log directly; an app worker's console output is captured automatically and
  tagged with its app; and apps log deliberately through the SDK's logs handle —
  fire-and-forget, browser and server alike. App requests are logged with duration.
- The live log tail streams over its own wire channel, distinct from the bus — the tail
  is log-store's surface and never becomes an event. The dashboard Logs view is a
  live-following tail with backfill, filters (app, component, minimum level, text), and
  expandable error rows.
- Logging never harms its caller: the SDK handle swallows network errors, a failed insert
  degrades to stderr, errors tee to stderr, and an unopenable log database still lets the
  engine boot. Logs live in the machine-local State — losing them costs history, never
  apps or data. Retention is age- plus row-capped, settings-driven with per-app overrides.
- Events are one platform-wide append-only log whose monotonic id is the offset: live
  consumers tail over SSE, catch-up consumers replay from a cursor. Every event is
  addressed (which app's stream it belongs to; null means platform-wide) and attributed
  by kind (engine / service / app) plus component (the emitting instance).
- An event's type is a fine-grained past-tense fact (key-set, build-ready, run-failed);
  payloads carry identifiers and references only, capped small, never ops or statuses.
- Emitters: engine subsystems announce build/server lifecycle and registry changes;
  services announce their change feeds (with a shorter service-set ttl — the bus's
  noisiest tenant); apps emit their own facts through the SDK, attribution stamped by
  the engine so it cannot be forged.
- Consumers: events.watch filters by kind, component, and type — each a string or array —
  on the app's scoped feed, which carries only that app's stream; the global feed (the
  dashboard's) carries everything. events.list replays ascending from an offset or pages
  newest-first, with time-range and component/type filters. The dashboard Events explorer
  adds URL-reflected filters, a filtered count, and a time histogram fed by stats.
- Delivery beats history: a failed insert still broadcasts live (with a zero offset); an
  unopenable bus database degrades to live-only. Events are precious — the bus lives in
  the data tree, inside the Backup tree — with settings-driven age, row-cap, and per-app
  retention.

## Design Decisions

### 1. Logs and events are separate stores with a stated line

**Decision:** Telemetry and business facts never share a store, a wire channel, or a
retention policy; the log tail is not an event.
**Why:** Merging them makes every consumer filter noise from signal: reaction logic must
not wade through request telemetry, and storing the tail on the bus would double-store
the log (2026-07-06-logging-design, 2026-07-07-events-design).
**Tradeoff:** Two pipelines, two dashboard views, and two vocabularies to keep aligned.

### 2. Kafka's shape without a broker

**Decision:** The bus is an append-only SQLite log — monotonic row id as the offset, SSE
as the live tail, cursor reads for replay — not an embedded or external message broker.
**Why:** Brokers are a second daemon bought for partitions, replication, and consumer
fleets that a single-person single-process platform doesn't have; the log shape alone
buys replay and future at-least-once task triggers (2026-07-07-events-design).
**Tradeoff:** No consumer groups or delivery guarantees; durable subscriptions are unbuilt.

### 3. Emitters are kind plus component; "source" is retired from events

**Decision:** Every event names the class of platform member that emitted it (engine /
service / app) and the instance within that class
(001-arch-event-envelope-kind-component).
**Why:** A bare emitter column is ambiguous by construction — the app-id grammar admits
`tasks` and `kv-store` as app names — and the shipped `source` field carried one constant
value on every real row. The classifier stays human-readable with no reserved-word list.
**Tradeoff:** Log records still speak the older `source` vocabulary until the named
convergence follow-up lands — two explorers, briefly two words.

### 4. Fine-grained past-tense fact types

**Decision:** One event type per fact (key-set / key-deleted / key-expired), not one
coarse type per service with the operation in the payload (002-arch-event-fact-types).
**Why:** The type is the fact — consumers filter without interpreting payloads, and the
component filter covers "everything this service did" without enumerating fact names.
**Tradeoff:** A wider type vocabulary that only a normative taxonomy keeps coherent; new
emitters extend it by spec, not ad hoc.

### 5. Stats are caller-bucketed sparse counts with complete facets

**Decision:** The explorer's header is fed by one aggregate endpoint: the caller chooses
the histogram bucket, empty buckets are omitted, and facet maps come back complete — no
silent top-N truncation (003-arch-event-stats-sparse).
**Why:** Plain SQL over a bounded table serves ELK-style analytics at Lodekit scale;
completeness is affordable because cardinality is bounded by the taxonomy plus app count.
**Tradeoff:** The approach leans on the retention caps — it would not survive unbounded
cardinality or row counts.

### 6. Both pipelines degrade instead of blocking

**Decision:** A failed event insert still broadcasts live; a failed log insert falls back
to stderr; an unopenable database leaves the engine booting with reduced history.
**Why:** Observability must never take down the thing it observes, and live consumers
(dashboard badges, watching apps) matter more than a complete archive
(2026-07-06-logging-design, 2026-07-07-events-design).
**Tradeoff:** History can silently gap; replaying consumers can miss what live watchers saw.

## Related

- **Recs:** 001-arch-event-envelope-kind-component, 002-arch-event-fact-types,
  003-arch-event-stats-sparse
- **Specs:** docs/specs/2026-07-06-logging-design.md,
  docs/specs/2026-07-07-events-design.md,
  docs/specs/2026-07-16-events-canonical-model-design.md

## Open Questions

- Log-store convergence: log records still use `source` (and a `_platform` query
  sentinel) where events use kind + component — a named follow-up slice.
- Server-side subscriptions with durable cursors await the Tasks design; watch is client-only.
