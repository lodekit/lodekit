# Events Canonical Model, Explorer v2 & the Engine Rename — Design

**Date:** 2026-07-16
**Status:** Approved (2026-07-16); envelope decision recorded as ADR-0001
**Role:** Slice-spec that makes the event envelope speak the platform's own component
language (`app` / `kind` / `component` / fine-grained fact types), rebuilds the dashboard
Events view into an explorer with filters and ELK-style analytics, and promotes
**Engine** to the canonical name for the runtime. Supersedes the envelope and type
vocabulary of `2026-07-07-events-design.md` (its bus architecture — one durable sqlite
log, one emission path, SSE live tail, offset semantics — is unchanged). The log-store
follow-up that adopts the same vocabulary is a separate slice (§11).

## 1. Goals & scope

The event bus shipped with three addressing fields — `ns`, `source`, `type` — and an
audit of every emitter and both live databases (2026-07-16) showed the model drifting
from the platform's language:

- `source` is `"_platform"` on **100 % of real rows** — it has never carried information
  (no app has ever emitted; apps only watch).
- The concept people actually filter by — *which service did this* — is smuggled inside
  `type` prefixes (`kv-store-change`), and inconsistently (`secrets-change`, not
  `secret-store-change`; `gateway-change`, not `gateways-change`).
- `namespace` is a term that exists nowhere else in the product, and log-store uses the
  word `source` for a *different* concept (the emitting component) than event-store does
  (the emitting citizen). Two adjacent explorers, one word, two meanings.

This slice makes the envelope canonical so every consumer — the Events explorer, MCP,
future task triggers — reads events without implicit mappings:

1. **Canonical addressing** — every event names *whose stream* (`app`), *what class of
   platform member emitted it* (`kind`: `engine` | `service` | `app`), and *which
   instance* (`component`). "Platform" is a collection, not an actor: no event is owned
   or emitted by "the platform".
2. **Fine-grained fact types** — a type is a past-tense fact (`key-set`,
   `run-failed`, `build-ready`); ops and statuses move out of payloads into types.
   Payloads carry identity and references only.
3. **Explorer v2** — filter by app, kind, component, type, and date range; a header with
   the filtered count and a time histogram (ELK-inspired, sqlite-scaled).
4. **Engine rename** — "runtime" retires; **Engine** becomes the one name across canon,
   docs, code identifiers, and (last) the package itself. Forced coherently by this
   slice: `engine` is now a value stored on the bus and shown to people.

**Decisions taken in review (2026-07-16 discussion):**

- **`kind` + `component`, retiring `source`.** A classifier plus an instance is the only
  collision-free scheme without a reserved-word list: the app-id grammar admits `tasks`,
  `engine`, `kv-store` as legitimate app names, so a bare instance column is ambiguous
  by construction. `kind` disambiguates, keeps raw values human-readable, and matches
  precedent (Kubernetes `kind`, ECS `event.kind`). "Module" was considered and rejected —
  it already means app source files in this codebase's informal language ("the tasks
  module"). Retiring `source` from events also dissolves the log-store word collision
  instead of managing it.
- **Engine subsystems are components.** log-store's finer sources (`build`, `lifecycle`,
  `host`, `scheduler`) are components *of the engine* — so `kind: "engine",
  component: "build"` is one vocabulary both stores converge on. The engine itself never
  appears as a component; its subsystems do.
- **Fine-grained types over coarse `changed` + payload ops.** One less thing to interpret
  from the payload. The old spec's objection (subscribers enumerating state sets) is
  dissolved by the `component` filter: `events.watch({component: "kv-store"})` covers
  all `key-*` facts without naming them.
- **The `"*"` payload sentinel dies.** "Definitions changed, refetch" becomes its own
  fact type (`defs-changed`, empty payload) instead of a magic payload value.
- **No backfill.** Nothing is released and `root/data/` is gitignored — no event data is
  vendored anywhere. The migration drops and recreates the table; dev databases reset.
  ("Precious" is the storage-*tier* label — backup-worthy at runtime — not a
  data-preservation obligation pre-release.)

**Non-goals** (unchanged from the events spec unless noted): manager/dashboard emission;
server-side watch and consumer cursors; event emit over MCP; cross-namespace app
subscriptions. New: the **log-store convergence** (adopting `kind`/`component`, retiring
the `app=_platform` query sentinel) is a named follow-up slice, not part of this one;
registry diffing (`app-installed`/`app-removed` instead of `apps-changed`) waits until
the watcher computes diffs.

## 2. Concepts & canonical terms

`CONTEXT.md` changes (this section is normative for that edit):

> **Platform**:
> The collection of all Lodekit components: the engine, the services, the SDK and UI
> library, internal apps (dashboard; manager), and the person's apps. A collection, not
> an actor — the platform owns nothing and emits nothing; its members do.
> _Avoid_: the platform as an emitter/owner (`_platform`), the product (that's Lodekit)

> **Engine**:
> The single Node process at the heart of the platform — it hosts, builds, watches, and
> serves apps, the dashboard, and the API. The canonical name everywhere: canon, docs,
> dashboard, code. (Package name `@lodekit/engine` after the rename lands, §8.)
> _Avoid_: runtime (retired), server, backend, daemon

The **Runtime** entry is deleted; its _Avoid_ list moves here. Until §8 tier 3 lands,
code keeps the `@lodekit/runtime` specifier — a package name, not domain language.

> **Kind**:
> The class of platform member an event names as its emitter: `engine`, `service`, or
> `app`. Stored on every event; the classifier that makes bare component names
> unambiguous (an app named `tasks` can never be confused with the tasks service).
> Extensible if new member classes ever emit (manager, MCP).
> _Avoid_: module (means app source files), type (that's the event name), class

> **Component**:
> The platform member instance that emitted an event, within its kind: an engine
> subsystem (`build`, `lifecycle`, `registry`), a catalog service name (`kv-store`,
> `tasks`, …), or an app id. The same vocabulary log-store converges on (follow-up
> slice).
> _Avoid_: source (retired from events; log-store's `source` converges later), emitter

> **Internal app**:
> An app-shaped platform component shipped by the platform rather than created by the
> person: the dashboard (`_dashboard`); the manager when it gets a stream. The `_`
> prefix is purely the collision mechanism — the app-id grammar has no underscore, so
> internal ids can never collide with a person's app named `dashboard`. UI surfaces
> render the human name ("Dashboard"), never the raw id.
> _Avoid_: internal namespace (retired term), reserved app, system app

The **Internal namespace** entry is deleted. `_platform` ceases to exist on the bus:
platform-wide events have `app = null` (§3). The `data/_platform/` directory on disk is
unchanged plumbing (invisible; renaming it buys nothing). The **Event** entry updates to
the new envelope language ("addressed (`app`) and attributed (`kind` + `component`)").

**Type naming rule** (canon, "terms that bite" adjacent): an event type is a past-tense
fact, `<subject>-<verb-ed>`, subject dropped never — the two `-ready` exceptions
(`build-ready`, `server-ready`) are deliberate: "became ready" is the fact, and the
symmetric `started / ready / failed` triple beats forcing `server-succeeded`. Payloads
carry identifiers and references, never ops or statuses — those are the type.

## 3. Data model

`data/_platform/events.sqlite`, one table, rebuilt by a new `EVENTS_CHAIN` migration
(drop + recreate; no backfill):

```sql
CREATE TABLE events (
  id         INTEGER PRIMARY KEY,   -- rowid: the offset — monotonic, cheap cursor
  ts         INTEGER NOT NULL,      -- epoch ms
  app        TEXT,                  -- whose stream: app id or internal app; NULL = platform-wide
  kind       TEXT NOT NULL,         -- 'engine' | 'service' | 'app'
  component  TEXT NOT NULL,         -- engine subsystem | catalog name | app id
  type       TEXT NOT NULL,         -- past-tense fact, ^[a-z0-9-]+$
  payload    TEXT,                  -- JSON object or NULL; ≤ 8 KB serialized
  expires_at INTEGER                -- epoch ms from per-emission ttl; NULL = default retention
);
CREATE INDEX events_app ON events(app, id);
CREATE INDEX events_ts  ON events(ts);   -- new: date-range filters, histogram, retention sweep
```

Validation in the emit facade:

- `app`: `^_?[a-z0-9-]+$` or `null`. Null means platform-wide — the event rides the
  global feed only, belongs to no app's stream (a stated decision, not an accident).
- `kind`: the closed set `engine | service | app`.
- `component`: `^_?[a-z0-9-]+$`; when `kind = "app"`, must equal `app` (attribution
  cannot be forged by construction — the runtime stamps it on the scoped door, exactly
  as `ns = source` today).
- `type`: `^[a-z0-9-]+$` (unchanged `TYPE_RE`). App-chosen types need no reserved list:
  `kind` already separates them from platform facts.
- Payload cap (8 KB) and ttl bounds unchanged.

Retention is unchanged: 30 days / 50 k rows default sweep; the 7-day change-feed ttl
(`CHANGE_FEED_TTL_S`) keeps its exact per-emitter assignment (§5 table).

## 4. The event taxonomy

The complete platform vocabulary. This table is normative — every emitter below, no
others; new emitters extend it via spec.

| kind | component | type | app | payload | ttl |
| --- | --- | --- | --- | --- | --- |
| engine | build | `build-started` / `build-ready` / `build-failed` | app id, `_dashboard` | `{message?}` on failure | default |
| engine | lifecycle | `server-started` / `server-ready` / `server-failed` | app id, `_dashboard` | `{message?}` on failure | 7 d |
| engine | registry | `apps-changed` | null | — | default |
| service | kv-store | `key-set` / `key-deleted` / `key-expired` | app id | `{key}` | 7 d |
| service | file-store | `file-put` / `file-deleted` / `file-expired` | app id | `{slug}` | 7 d |
| service | db-store | `row-inserted` / `row-updated` / `row-deleted` / `row-replaced` | app id | `{table?}` | 7 d |
| service | db-store | `schema-applied` / `schema-gated` | app id | `{message?}` on gate | 7 d |
| service | settings | `value-set` / `value-cleared` | app id / null (platform settings) | `{key}` | 7 d |
| service | settings | `defs-changed` | app id | — | 7 d |
| service | secret-store | `secret-created` / `secret-updated` / `secret-deleted` | null (catalog) | `{slug}` | 7 d |
| service | secret-store | `slot-linked` / `slot-unlinked` | app id | `{slot}` | 7 d |
| service | secret-store | `defs-changed` | app id | — | 7 d |
| service | tasks | `run-queued` / `run-started` / `run-succeeded` / `run-failed` / `run-canceled` | app id | `{task, runId}` | 7 d |
| service | tasks | `defs-changed` | app id | — | 7 d |
| service | gateways | `connection-linked` / `connection-unlinked` / `connection-configured` / `connection-cleared` / `connection-authorized` | app id | `{alias, slot?}` | 7 d |
| service | gateways | `connection-recovered` / `connection-failed` / `auth-expired` | app id | `{alias, provider}` | 7 d |
| service | gateways | `breaker-opened` / `breaker-closed` | null | `{provider}` | 7 d |
| service | gateways | `provider-changed` | null | `{provider}` | 7 d |
| service | gateways | `defs-changed` | app id | — | 7 d |
| app | own app id | app-chosen (skill guidance: past-tense facts, e.g. `export-finished`) | own app id | app-chosen, ≤ 8 KB | per emission |

Notes:

- `row-replaced` covers drizzle `REPLACE` statements (the `WRITE_OP` regex already
  matches `replace`); today it rode the payload as `op: "replace"`.
- `apps-changed` stays coarse: the watcher does a debounced full rescan and computes no
  diff. It already reads as subject-verb; upgrading to `app-installed`/`app-removed`
  waits for registry diffing (non-goal).
- The gateway health triple translates today's payload statuses: `ok` →
  `connection-recovered`, `unhealthy` → `connection-failed`, `needs_reauth` →
  `auth-expired`. The breaker pair maps `open`/`closed` verbatim.
- Cascaded secret deletion (a catalog secret deleted while linked) emits
  `slot-unlinked` into each affected app's stream, as the cascade does today.
- `connection-*` payloads gain `{slot}` where the handler has it (today's payload drops
  it) — reference data, consistent with the payload rule.

## 5. Emission

The facade keeps its contract (validate → insert → broadcast; insert failure still
broadcasts with `id: 0`; never throws into its caller). `EmitInput` becomes
`{app: string | null, kind, component, type, payload?, ttl?}`.

`PLATFORM_NS` leaves `events.ts`: event emitters stop importing it entirely. log-store
still needs the `_platform` query sentinel until its follow-up slice — the constant
moves to `logger.ts`/`logStore.ts` (their concern now, nobody else's).

Emitter-by-emitter migration (all twelve `PLATFORM_NS` importers):

| File | Today | Becomes |
| --- | --- | --- |
| `services/kv-store.ts` | `kv-store-change` `{key, op}` | `key-set` / `key-deleted` / `key-expired` `{key}` |
| `services/file-store.ts` | `file-store-change` `{slug, op}` | `file-put` / `file-deleted` / `file-expired` `{slug}` |
| `services/db-store.ts` | `db-store-change` `{op, table?}`; `schema-state` `{status, message?}` | `row-<op>ed` `{table?}`; `schema-applied` / `schema-gated` `{message?}` |
| `services/settings.ts` | `settings-change` `{key}` (`"*"` for defs) | `value-set` (PUT) / `value-cleared` (DELETE) `{key}`; `defs-changed` |
| `services/secret-store.ts` | `secrets-change` `{slug}`/`{slot}` (`"*"` for defs) | `secret-created`/`-updated`/`-deleted` `{slug}` (app null); `slot-linked`/`slot-unlinked` `{slot}`; `defs-changed` |
| `services/tasks.ts` + `taskEngine.ts` | `tasks-change` `{task, runId?, state?}` (`task: "*"` for defs) | `run-<state>` `{task, runId}` (incl. the startup reconcile); `defs-changed` |
| `gatewayEvents.ts` (+ callers in `gatewayEngine.ts`, `gatewayOauth.ts`, `services/gateways.ts`, `watcher.ts`) | `gateway-change` `{alias}`/`{provider}`; `gateway-health` | the `connection-*` / `breaker-*` / `provider-changed` / `defs-changed` set (§4) |
| `build.ts` | `build-state` `{status, message?}` | `build-started` / `build-ready` / `build-failed` `{message?}` |
| `appWorker.ts` | `server-state` `{status, message?}`; relays db-store's `schema-state` | `server-started` / `server-ready` / `server-failed` `{message?}`; relays `schema-gated` |
| `watcher.ts` | `apps-changed` (ns `_platform`) | `apps-changed` (app null, kind engine, component registry) |

**App emission** (`POST /api/apps/:appId/event-store`): body `{type, payload?, ttl?}`
unchanged; the runtime stamps `app = component = appId`, `kind = "app"`.

**SSE scoping**: the broadcast key is `record.app`. Scoped feeds
(`/api/apps/:appId/events`) receive app-matched events; the global feed receives
everything; null-app events reach the global feed only. Wire name `event` and
full-envelope `data:` unchanged.

## 6. Query surfaces

**HTTP.**

- `GET /api/events/history` — params `app`, `kind`, `component`, `type`, `since`,
  `until` (epoch ms, closed-open `[since, until)`), `after` *or* `before` (id cursors,
  unchanged semantics), `limit`. The `ns` and `source` params are removed, not aliased.
- `GET /api/apps/:appId/event-store` — gains `component`, `since`, `until` alongside the
  existing `type`/`after`/`before`/`limit`.
- `GET /api/events/stats` — **new**, the explorer-header endpoint. Same filter params as
  `history` (minus cursors/limit) plus `bucket` (ms, the caller-chosen histogram
  interval). Returns
  `{total, buckets: [{t, n}], byKind: {...}, byComponent: {...}, byType: {...}, byApp: {...}}` —
  facet maps are complete (no silent top-N truncation; cardinality is bounded by the
  taxonomy plus app count at Lodekit scale). Implementation is plain SQL over the
  ≤ 50 k-row table: one `GROUP BY ts/:bucket`, one `GROUP BY` per facet, all under the
  same WHERE; the `events_ts` index carries the range scan.

**SDK** (`@lodekit/sdk`, `events` handle):

- `LodekitEvent<T>` envelope: `{id, ts, app, kind, component, type, payload}`.
- `events.watch({kind?, component?, type?}, cb)` — each filter a string or array;
  replaces `{type?}`-only filtering.
- `events.list({component?, type?, since?, until?, after?, before?, limit?})`.
- `events.emit(type, payload?, {ttl?})` — signature unchanged.

**MCP** (`lodekit_events` in `packages/mcp/index.ts`): params become `app?` (an app id;
the `"_platform"` sentinel description is deleted), `kind?`, `component?`, `type?`,
`since?`, `after?`, `limit?` — still a thin call over `GET /api/events/history`.

**Consumers migrating in the same PR** (the complete inventory): dashboard
`components/sse.tsx`, `routes/index.tsx`, `routes/events.tsx`, `routes/gateways.tsx`,
`routes/gateways_.$providerId.tsx`, the data-explorer routes (`data/$appId/kv.tsx`,
`files.tsx`, `tables/$table.tsx`); the `appHost.ts` interstitial script; Greenhouse's
three watch sites (`index.tsx`, `plants.$plantId.tsx`, `almanac.tsx` — e.g.
`events.watch({component: ["db-store", "kv-store"]})` replaces
`{type: ["db-store-change", "kv-store-change"]}`); `root/README.md`'s DoD rows quoting
the old filters.

## 7. Explorer v2 (dashboard Events view)

The raw table grows into an explorer, ELK-inspired, sqlite-scaled:

- **Header**: the filtered event count plus a time histogram (bar chart, `@lodekit/ui`
  charts) fed by `/api/events/stats`. Bucket width derives from the selected range
  (range ÷ ~60, snapped to 1 m / 5 m / 30 m / 1 h / 6 h / 1 d). Stats refetch on filter
  change; live events nudge a debounced refresh, not per-event recompute.
- **Filters**, all reflected in URL search params: app (select: apps + internal apps,
  rendered by human name), kind (chips: Engine / Services / Apps), component (select,
  populated from `byComponent`), type (select/input from `byType`), date range (presets
  15 m / 1 h / 24 h / 7 d / 30 d + custom), free-text payload search (client-side, as
  today).
- **Rows**: time, type badge, component, app, payload preview; expand for pretty JSON —
  the existing row pattern, plus the new columns. Internal apps render "Dashboard",
  never `_dashboard`. Live tail over the existing global EventSource continues,
  respecting filters; a live row with `id: 0` (insert-failed, broadcast-only) still
  renders (delivery over history, unchanged posture).
- **Load more** pagination via `before`, as today.

## 8. The engine rename

Three tiers, one intent: after this spec, "runtime" is not a Lodekit word.

- **Tier 1 — canon + person-facing** (rides with PR 1, §9): `CONTEXT.md` per §2;
  `AGENTS.md` architecture prose; the docs site (21 pages say "runtime" today); the
  dashboard already says Engine. Shipped specs under `docs/specs/` are dated snapshots —
  they are not rewritten.
- **Tier 2 — code identifiers**: `taskEngine.ts` → `taskExecutor.ts` and
  `gatewayEngine.ts` → `gatewayExecutor.ts` (with their exported symbols) — "engine"
  stops meaning per-subsystem machinery the moment it names the whole process. Comments
  and log/code prose in touched files update opportunistically; no mass comment rewrite.
- **Tier 3 — the package**: `@lodekit/runtime` → `@lodekit/engine`,
  `packages/runtime/` → `packages/engine/`. Touches: root `package.json` scripts
  (`pnpm dev` filter), `pnpm-workspace` members (glob-covered), manager
  `scripts/prepare-bundle.mjs` (pnpm-deploy filter) and supervisor paths,
  `@lodekit/integration-tests` imports (`@lodekit/runtime/*` → `@lodekit/engine/*`),
  CI workflows, `AGENTS.md` Build & Test, lockfile regeneration
  (`pnpm install --lockfile-only`). The MCP package is untouched (HTTP-only by design).
  Purely mechanical; its own PR; nothing else in this spec depends on it landing.

## 9. Migration, slicing & PR plan

**Storage migration**: one new `EVENTS_CHAIN` entry — `DROP TABLE events` + the §3
schema. No data carried (nothing released, nothing vendored). Live SSE consumers see the
new envelope immediately; every consumer updates in the same PR, so there is no
compatibility window and no dual-shape code.

**PR slicing** (one spec, sequential PRs; merging is the person's call at each step):

1. `feat(runtime): canonical event model — app/kind/component + fact types` — §3–§6 +
   tier-1 `CONTEXT.md`/`AGENTS.md` canon, all emitters, SDK, MCP, every consumer, the
   migration, tests. The explorer gets a minimal field-rename update only.
2. `feat(dashboard): event explorer v2 — filters, date range, histogram` — §7 + the
   stats endpoint.
3. `refactor(runtime): engine rename — docs site + code identifiers` — §8 tiers 1
   (docs-site sweep) + 2.
4. `chore: rename @lodekit/runtime to @lodekit/engine` — §8 tier 3.

PRs 3–4 are independent of 2 and can land in either order after 1.

## 10. Testing

- **Runtime**: facade validation (kind enum, component grammar, `kind=app ⇒ component=app`,
  null-app accepted, payload/ttl bounds unchanged); one mapping test per emitter (e.g. a
  `kv.set` lands `{app, kind: "service", component: "kv-store", type: "key-set",
  payload: {key}}`; a settings DELETE lands `value-cleared`; a defs reload lands
  `defs-changed` with no payload); SSE scoping (scoped feed sees own-app events, never a
  sibling's; null-app events reach the global feed only); `since`/`until` filtering;
  `/api/events/stats` (total, bucket edges, facet completeness under filters); the
  migration applies over a v1 database; retention sweep unchanged.
- **SDK**: `watch` filtering by kind/component/type incl. arrays; `list` params;
  envelope type.
- **Integration** (`@lodekit/integration-tests`): `lodekit_events` with the new params
  end-to-end.
- **Greenhouse smoke** stays green after the watch migration (DoD, §11).

## 11. Docs & bookkeeping

- **`CONTEXT.md`**: §2 verbatim — Platform, Engine, Kind, Component, Internal app; delete
  Runtime and Internal namespace; update Event/Event Store; the type-naming rule.
- **`docs/changelog.md`** (`## New`, same PR as PR 2): the Events explorer — filter by
  app, service/engine component, event type, and date; live count and histogram. PR 1
  appends its envelope/naming change under `## New` as well (user-visible in the
  explorer, MCP, and SDK).
- **Skill** (`packages/skill`): the `events` handle docs — new envelope, watch filters,
  the past-tense type guidance for app-emitted events.
- **`root/README.md`**: DoD rows update to the new watch filters; the pending Part 2
  items (`events.emit`, `events.list`, Ledger, While You Were Away) stay pending —
  their contract now stamps `kind`/`component`.
- **Backlog** (`defer`-labeled beads, provenance this spec; drained to GitHub issues
  via `drain-deferrals`): the **log-store convergence**
  follow-up — adopt `kind`/`component` in log records and queries, retire the
  `app=_platform` sentinel and the relocated `PLATFORM_NS` constant, align `emitLog`
  call sites (`build`/`lifecycle`/`host`/`scheduler` become engine components; `app`/
  `console` become `kind: "app"` with a channel field). Also: registry diffing
  (`app-installed`/`app-removed`) if it ever earns its keep.
