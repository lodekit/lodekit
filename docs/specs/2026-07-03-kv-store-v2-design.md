# kv-store v2 (Storage Iteration) — Design

**Date:** 2026-07-03
**Status:** Draft, pending review
**Role:** Slice-spec for slice 2 of the umbrella spec's derivation order
(`docs/specs/2026-07-02-product-overview-design.md`, §4.2): the storage iteration. Closes the
kv-store service's name, API, and ergonomics; parks relational-store; introduces the
`services/` convention in the runtime; shapes the SDK so MCP and the dashboard consume the
same client as apps.

## 1. Goals & scope

kv-store becomes the sole storage service through early 0.x, expressive enough to power real
apps (the retiring `db` surface is the bar: both example apps must migrate onto it), offering
the most valuable Redis capabilities re-derived SQLite-native. Future ones will follow in the
next minor version updates.

**Scope decision — shape + thin proof.** This slice designs the services-layer contract that
MCP and the dashboard consume, and builds one thin proof on each side: two read-only MCP
store tools, and a minimal dashboard store panel. The full data explorer and the MCP tool
suite remain with slice 3 / later — they land on rails this slice defines.

**Non-goals:** relational-store's return (own roadmap entry, needs a schemas/migrations
story); MCP write access (Security body of work); the full dashboard data explorer; the
Tasks service (§2.12 of the umbrella spec); any change to the runtime's HTTP framework
(Express stays; the TanStack question was examined and set aside as out of scope — no
roadmap entry, revisit later).

## 2. Redis assessment — what comes in, what stays out

Lens: at personal-app scale, single process, SQLite underneath, Redis's value is its atomic
primitives and fast KV semantics — not its exotic data structures, which largely compensate
for Redis having no queryable storage. SQLite + JSON values + prefix scan covers those use
cases more simply. Everything kept is a single atomic statement against one table.

**In (simple — each roughly one prepared statement):**

| Redis capability | kv-store v2 shape |
| --- | --- |
| GET / SET | `get`, `set` — kept, with the null-vs-missing ambiguity fixed (`found` flag; apps can store `null`) |
| DEL / EXISTS | `del(key)`, `has(key)` |
| INCR / DECRBY | `incr(key, by = 1)`, atomic, returns the new value |
| KEYS / SCAN | `list({ prefix, limit, cursor })` returning keys **and** values — one indexed query (better than Redis's SCAN); powers app collections, the dashboard panel, and the MCP read tools |
| EXPIRE / TTL / SETEX | `set(key, value, { ttl })`; lazy expiry on read + swept periodically. Closes the roadmap's "cache with TTLs" item |
| MGET / MSET | `getMany(keys)`, `setMany(entries, { ttl? })` — one round trip, one transaction |

**In (the one moderate-cost pick):**

| Redis capability | kv-store v2 shape |
| --- | --- |
| Pub/Sub | A change feed over SSE (§6) — keyspace-notification style (key + op, no values). Gives every app live multi-tab sync and makes the dashboard panel live |

**Out, with reasons:**

- **Hashes** — a JSON object value plus key namespacing already is a hash here; a second
  addressing scheme buys sugar at the cost of API surface.
- **Lists (LPUSH/LPOP)** — queue-shaped; queues are the future task-queue service's
  territory. For app collections, lists are worse than key-per-item (no update/delete by id).
- **Sets** — membership is `has()` on a composite key; SMEMBERS is `list()` on the prefix.
- **Sorted sets** — large API surface; at personal scale `list()` + in-app sort suffices.
  Revisit only if relational-store's return doesn't cover ordering needs first.
- **Transactions/Lua, streams, persistence/cluster knobs** — overkill, or moot (SQLite is
  already the persistence story).

## 3. Naming (normative)

- **Catalog name** `kv-store` is used in URLs and code layout: the scoped-API mount is
  `/api/apps/:slug/kv-store/…`; the runtime module is `services/kv-store.ts`.
- **Mechanical rule:** every service module declares its catalog name and mounts at
  `/api/apps/:slug/<catalog-name>/`. Future services slot in with zero path-collision risk
  (`relational-store`, `file-store`, `secret-store`, `task-queue`). SSE event types are
  prefixed the same way (`kv-store-change`).
- **SDK/client handle** is **`kv`**: `createClient(...).kv`, and apps import
  `import { kv } from "@lodekit/sdk"`. The catalog-name → handle mapping is fixed here and
  extends mechanically: `kv-store`→`kv`; later `relational-store`→`db`, `file-store`→`files`,
  `secret-store`→`secrets`.
- **`context.md` amendment (part of this slice):** the Store entry keeps "the Store" as the
  prose domain word; `kv` moves off the avoid list and is recorded as the canonical
  SDK/client handle. Sanctioned by the umbrella spec (§2.2: each service closes its own
  naming in its slice-spec, "including revisiting today's `db`/`store` handles").

## 4. Runtime — `services/` convention, data model, ops, HTTP

### 4.1 Services convention

New directory `packages/runtime/src/services/`; first occupant `kv-store.ts`. A service
module owns three things:

1. **Schema** — table creation and column migration for its slice of the per-app database.
2. **Operations** — pure functions over a `better-sqlite3` `Database` handle.
3. **Router factory** — an Express router `routes.ts` mounts at
   `/api/apps/:slug/<catalog-name>/`.

`db.ts` shrinks to connection management only (`getAppDb`, the connection cache, the WAL
pragma). Its `query`/`exec`/`schema`/`storeGet`/`storeSet` functions are deleted with
relational-store's parking.

### 4.2 Data model

Per-app file stays `data/<slug>/db.sqlite` (no rename — it remains the app's database file,
ready for relational-store's return). The store table:

```sql
CREATE TABLE IF NOT EXISTS _lodekit_store (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,     -- JSON
  created_at INTEGER NOT NULL,  -- epoch ms
  updated_at INTEGER NOT NULL,
  expires_at INTEGER            -- NULL = no expiry
);
CREATE INDEX IF NOT EXISTS idx_store_expires
  ON _lodekit_store(expires_at) WHERE expires_at IS NOT NULL;
```

**Migration in place on open:** POC-era tables (`key, value`) gain the three columns via
`PRAGMA table_info` → `ALTER TABLE ADD COLUMN` (backfilling timestamps with "now"). No data
loss for existing stores.

### 4.3 Operation semantics

Each op is one prepared statement; atomicity comes from better-sqlite3 being synchronous in
the single runtime process.

| Op | Semantics (Redis-aligned where it matters) |
| --- | --- |
| `get(key)` | `{ found, value, createdAt, updatedAt, expiresAt }`. Expired keys read as missing (lazy delete on read). `found` fixes null-vs-missing: apps can store `null`. |
| `set(key, value, { ttl? })` | Upsert; preserves `created_at`, bumps `updated_at`. `ttl` (seconds) sets `expires_at`; **set without ttl clears expiry** (Redis `SET` semantics). |
| `del(key)` | `{ deleted: boolean }`. |
| `has(key)` | Derived from `get`'s `found` flag — no dedicated endpoint. |
| `incr(key, by = 1)` | Returns the new value. Missing key starts from 0. Stored value that isn't a JSON number → 400. Single upsert statement, race-free. |
| `list({ prefix?, limit?, cursor? })` | Indexed `LIKE 'prefix%'` (with `ESCAPE` for literal `%`/`_` in prefixes) on the PK; returns entries (key, value, timestamps), key-ascending; expired filtered out; keyset pagination (`cursor` = last key of the previous page); default limit 1000. |
| `getMany(keys)` / `setMany(entries, { ttl? })` | One round trip; `setMany` runs in one transaction and applies `set`'s TTL semantics per entry. |

**Expiry:** lazy delete on read, plus a runtime-wide sweep (every ~60 s per open connection:
`DELETE FROM _lodekit_store WHERE expires_at < now`), using the partial index.

### 4.4 Internal scheduler (first recurring task — shared plumbing)

The sweep is the runtime's first recurring internal task, so the mechanism is shared from
day one: a small `src/scheduler.ts` exposing `every(name, intervalMs, fn)` —

- error-isolated: a throwing task logs and continues (umbrella invariant 8);
- `unref()`'d so it never holds the process open; cleared on shutdown;
- testable via a manual `tick()`.

Services register recurring work through it instead of hand-rolling `setInterval`.
**Boundary:** this is runtime-internal plumbing, not the Tasks service (person/app-facing,
umbrella §2.12). When Tasks is designed holistically it decides whether to subsume this
scheduler or keep it as the internal substrate — recorded on the roadmap.

### 4.5 HTTP surface

Mounted at `/api/apps/:slug/kv-store/`, replacing `/db/*` entirely:

```
GET    /kv-store?prefix=&limit=&cursor=      → { entries, nextCursor }
GET    /kv-store/:key                        → { found, value, createdAt, updatedAt, expiresAt }
PUT    /kv-store/:key      { value, ttl? }   → { ok }
DELETE /kv-store/:key                        → { deleted }
POST   /kv-store/incr      { key, by? }      → { value }
POST   /kv-store/get-many  { keys }          → { entries }
POST   /kv-store/set-many  { entries, ttl? } → { ok }
```

Trust-boundary validation: slug pattern (existing `withDb`-style guard), key non-empty and
≤ 512 chars, `ttl`/`by` must be numbers (`ttl` positive), `incr` on a non-number → 400.
Value size stays bounded by the existing `express.json` body limit. Keys are URL-encoded in
paths; the action routes (`incr`, `get-many`, `set-many`) are POST-only while `/:key` serves
only GET/PUT/DELETE, so literal keys with those names don't collide (covered by a test).

## 5. SDK — isomorphic core, `kv` handle, collection sugar

### 5.1 One client factory

`@lodekit/sdk` splits into a transport-agnostic core and a browser entry:

```ts
// core — no window dependency, plain fetch, no runtime imports
const lodekit = createClient({ baseUrl, slug });
lodekit.kv.get(...)   // kv-store today; later: lodekit.db, lodekit.files, lodekit.secrets
```

- **App entry** (what apps import — ergonomics unchanged in shape):
  `import { kv } from "@lodekit/sdk"` — a singleton built by `createClient`.
- **MCP and the dashboard** import the core and call `createClient` with explicit
  `{ baseUrl, slug }` per app they touch — which cross-app consumers need anyway.
- **`db` is deleted** from the SDK (with its routes and MCP tool) — relational-store parked.
- `kv.get<T>` returns `T | undefined` (`undefined` = missing), so apps can store `null`.

### 5.2 Slug injection at build time (explicit, not sniffed)

The app entry no longer parses `window.location`. The runtime's Vite build knows which app it
is building, and injects the slug as a compile-time constant (Vite `define`, e.g.
`__LODEKIT_SLUG__`); the SDK app entry reads it. URL shape and hosting path become irrelevant
to the SDK; `baseUrl` stays `""` (apps are served same-origin). The scaffold generates
nothing extra — the build step is the one place that reliably knows the app's identity.

### 5.3 Collection sugar (client-side only)

A thin helper built purely on the six ops — the ergonomic bridge that lets `db` retire:

```ts
const expenses = kv.collection<Expense>("expense");
// items at "expense:<id>"; the id counter at "_seq:expense" —
// deliberately outside the item prefix so list({ prefix: "expense:" }) never returns it
await expenses.add(v);      // incr "_seq:expense" → set "expense:<id>" → { id, value }
await expenses.all();       // list by prefix, sorted by createdAt ascending
await expenses.get(id);
await expenses.set(id, v);
await expenses.remove(id);
```

The `_seq:<name>` counter convention is reserved by the SDK and documented for the skill.
No server-side collection concept exists — the runtime sees only keys (approach decision:
server stays pure; ergonomics live in the replaceable client layer, which is also what
relational-store's return would naturally replace).

## 6. Pub/Sub — the SSE change feed

Keyspace-notification style: events carry **key + op, never values** — consumers refetch
what they care about; the channel stays light regardless of value sizes.

- **New scoped endpoint** `GET /api/apps/:slug/events`: an app receives only its own events —
  `{ type: "kv-store-change", key, op: "set" | "del" | "expire" }`. Required by umbrella
  invariant 5 (never scoped wider than the app's slug); apps must not watch the global
  channel, which would leak other apps' keys.
- The **existing global `/api/events`** (dashboard's channel — trusted, cross-app by design)
  carries the same events with a `slug` field, alongside build/registry events.
- `set`, `del`, `incr`, `setMany`, and the expiry sweep all emit.
- **SDK:** `kv.watch(prefix, callback)` → opens the scoped EventSource lazily (one per app,
  shared across watchers), filters by prefix, returns an unsubscribe. EventSource's native
  retry handles reconnects.

## 7. Thin proofs — MCP and dashboard

**MCP (read-only service tools, replacing `lodekit_inspect_db`):**

- `lodekit_kv_list({ slug, prefix? })` — entries with metadata; the "show me all the
  recipes in my recipe app" read.
- `lodekit_kv_get({ slug, key })`.

Both are built on the SDK core via `createClient`. Read-only per the umbrella spec; write
access waits for the Security body of work. Driving tools are untouched (their v0.1
alignment is slice 3).

**Dashboard (minimal store panel):** a per-app panel (disclosure on the app card or a
per-app route — whichever fits the current grid with least invention) showing keys + JSON
values via `list`, live via the SSE feed. Data layer uses **TanStack Query**, invalidating
on `kv-store-change` events — seeding the TanStack consolidation on the consumer side, where
it fits. Explicitly *not* the full data explorer: no editing, no search, no pagination UI
beyond "load more". It exists to prove the contract: the dashboard consumes the same core
client and the same events as apps.

## 8. Example-app migration (acceptance test)

Both example apps drop SQL entirely; `db` usage is the bar kv-store v2 must clear.

- **expense-tracker:** `kv.collection<Expense>("expense")`; `currency` stays a plain key.
- **habit-tracker:** `kv.collection<Habit>("habit")`; checkins as raw ops on composite keys —
  `set("checkin:<habitId>:<day>", true)` / `del(...)` / `list({ prefix: "checkin:" })` —
  deliberately exercising both the sugar and the primitives.
- Fixture data under `examples/data/` is rewritten to the new shape (dev fixtures — no
  user-data concern; real POC-era stores are preserved by §4.2's column migration).

## 9. Error handling

- Trust-boundary validation per §4.5; failures are 400s with messages, never crashes.
- The SDK surfaces runtime errors as thrown `Error`s carrying the server's message (today's
  behavior, kept).
- `watch` reconnects via EventSource's native retry; TanStack Query's refetch-on-reconnect
  covers events missed while disconnected.
- A failing sweep tick logs and continues (scheduler contract, §4.4).

## 10. Testing

Vitest, in the `@lodekit/runtime` suite as today:

- **Unit:** every op, including TTL expiry (fake timers + manual scheduler `tick()`), `incr`
  on non-numbers, `list` prefix/pagination/expired-filtering and `%`/`_` escaping, and the
  column migration from a POC-shaped table.
- **API:** the seven routes, including validation failures and the literal-key/action-route
  method separation (§4.5).
- **E2E** (existing pattern): an app-shaped flow driving the SDK core against a booted
  runtime — collection add/all/remove; `watch` receiving `kv-store-change` events on the
  scoped channel; scoping (app A's channel never sees app B's keys).
- **Integration:** the runtime↔MCP test updated — store tools replace `inspect_db`.

## 11. Retirements & doc updates

- **Deleted:** `/db/query`, `/db/exec`, `/db/schema` routes; `dbsvc.query/exec/schema/
  storeGet/storeSet`; the SDK `db` export; MCP `lodekit_inspect_db` (+ its `client.ts`
  helper).
- **`context.md`:** the naming amendment (§3).
- **`roadmap.md`:** close "cache with TTLs"; update the relational-store-parked entry to
  point here; add the scheduler-vs-Tasks consolidation note (§4.4).
- **Umbrella spec:** §2.2/§2.3 status columns updated after ship.

## 12. Decisions log

| Decision | Outcome |
| --- | --- |
| Slice scope for MCP/dashboard | Shape the contract + one thin proof each (full explorer and tool suite stay later) |
| Redis feature cut | Six simple ops + Pub/Sub; hashes/lists/sets/zsets/transactions out (§2) |
| SDK shape | Isomorphic core; one `createClient` factory shared by apps, MCP, dashboard |
| Collections | SDK sugar over pure server primitives (approach B); no server-side namespaces |
| SDK handle | `kv` (`lodekit.kv`, `import { kv }`); catalog-name→handle mapping fixed (§3) |
| Slug binding | Build-time Vite `define` injection, not `window.location` parsing |
| HTTP framework | Express stays; TanStack examined and set aside as out of this spec's scope (no roadmap entry). TanStack Query adopted in the dashboard thin proof |
| Recurring internal work | Shared `scheduler.ts` from day one; boundary with the future Tasks service recorded on the roadmap |
