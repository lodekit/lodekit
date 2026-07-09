# db-store (v1) — design

**Date:** 2026-07-09
**Status:** Approved
**Fits:** the umbrella spec's service-catalog row "relational-store — Parked"
(`docs/specs/2026-07-02-product-overview-design.md` §2): this is the return, under the
new catalog name **db-store**. Closes the roadmap item "Relational-store's return" by
supplying the schemas/migrations story that parking (kv-store v2,
`docs/specs/2026-07-03-kv-store-v2-design.md`) made the re-entry condition. Follows the
declaration-contract lineage of tasks/settings/secrets (`src/tasks.ts`, `src/settings.ts`,
`src/secrets.ts` → `src/db.ts`) and the `services/` module convention fixed by kv-store v2
§4.1.

## 1. Purpose and v1 scope

db-store is the service that gives each app a **relational database**: a typed,
schema-first SQL surface for the app's domain records — entities with fields and
relationships that get listed, filtered, joined, and aggregated. It becomes the default
home for the *substance* of an app; kv-store remains the app's memory (§3). It is also
the platform's hook toward stricter schemas: the domain model lives as reviewable code in
one file per app.

**In v1:** drizzle as the strongly-coupled schema/query layer (the shadcn trade, §2);
app schema declaration in `src/db.ts` with push-style auto-migration — additive changes
apply on save, destructive changes gate (§7); a unified migration engine for **all**
internal schemas (per-app service tables and the four platform databases), file-based and
data-preserving, whose first migration renames the `_lodekit_*` tables (§5); the
`db` SDK handle on drizzle's sqlite-proxy driver over the scoped API (§8); read-only MCP
tools (§9); the skill's KV-vs-DB decision rule (§11); the Greenhouse showcase refactored
onto db-store as the definition of done (§12).

**Not in v1** (deferred, §14): accepting destructive app migrations (a confirmation
flow), any dashboard surface (the unified data explorer is in flight separately —
`StorePanel` is deleted here, not replaced), data initialization/fixtures, MCP write
tools, rewriting internal service queries onto the drizzle query builder.

## 2. Decisions

The brainstorm's load-bearing calls, with the rejected paths:

- **Drizzle, strongly coupled — expose the real thing, don't wrap it.** Same trade as
  shadcn/`@lodekit/ui`: agents know drizzle from training data, its docs are the
  ecosystem's, and a Lodekit wrapper would be a worse drizzle. Coupling surface:
  `drizzle-orm` joins the shared toolchain (apps import it, no per-app `node_modules`),
  the SDK's `db` handle is a drizzle instance, and the runtime uses `drizzle-kit/api`
  in-process — never the CLI, per the roadmap's guiding principle (Lodekit drives the
  toolchain via code, not shell commands). *Rejected:* a Lodekit `defineSchema` DSL
  (loses ecosystem + agent fluency); raw-SQL-only surface à la the retired POC `db`
  (stringly, no types, doesn't advance stricter schemas).
- **Hybrid migration model — mechanism follows lifecycle.** App schemas are authored
  live with no version lineage → schema-as-truth **push** with a destructive gate.
  Internal schemas ship as runtime versions along a known lineage → **ordered,
  checked-in migration files**, which support data-preserving renames and data
  transforms that a diff engine cannot (a differ sees a rename as drop+create — the
  `_lodekit_store` → `_kv` rename would destroy data under push). One core applier and
  one ledger underneath both (§5). *Rejected:* push for everything (the rename flaw);
  migration files for apps (journals + generated artifacts + ordering discipline that
  agents get wrong under live iteration — heavy at personal scale).
- **Full generalization of schema definition + migrations, now.** Every service's
  tables are declared as drizzle schemas in the runtime and applied through the one
  engine — replacing today's scattered `CREATE TABLE IF NOT EXISTS`, kv-store's
  `PRAGMA table_info` dance, and tasks' lone `user_version` check. Internal *queries*
  stay hand-written prepared statements (rewriting ~1,300 working lines to the query
  builder is churn with no behavioral gain; adopt opportunistically — roadmap).
- **Same file, organized namespaces.** App tables live in the app's existing
  `data/<app-id>/db.sqlite` beside the service tables — no second database file.
  Service tables take a bare-`_` prefix; user tables are physically named exactly as
  declared, and a leading `_` is forbidden (§4). *Rejected:* a separate
  `database.sqlite` per app (a second file in the backup tree for isolation the local
  trust posture doesn't demand); prefixing user tables (`_lodekit_db_<table>`) — a
  physical name differing from the declared name breaks drizzle's mapping, raw
  `` sql`…` `` queries, and introspection.
- **Guard rails, not authorization.** The query door rejects statements referencing
  `_`/`sqlite_` tables at the statement-text level. better-sqlite3 exposes no per-table
  authorizer; apps are user-trusted local code, and the accepted residual is that an app
  could contrive to touch its own service tables. Organized, not paranoid.

## 3. Terminology (closes with this slice)

- **Catalog name `db-store`** (renamed from the parked `relational-store`), joining
  kv-store/file-store/secret-store/log-store/event-store. The scoped-API mount is
  `/api/apps/:appId/db-store/`. **SDK handle `db`** — the mapping fixed by kv-store v2
  §3 holds, with `relational-store` → `db-store` in the catalog list.
- **"The Store" is retired as a domain word.** With the Database back in the catalog,
  Store-vs-Database is exactly the ambiguity the glossary exists to kill. `context.md`
  amendments (part of this slice): the Store entry becomes **KV** (catalog `kv-store`,
  handle `kv`, prose "KV" / "the KV store"); the Database entry un-parks as **Database**
  (catalog `db-store`, handle `db`); the flagged ambiguities and Relationships sections
  follow ("Store vs Cache" → "KV vs Cache", etc.).
- **The decision rule is glossary-level** — stated in `context.md` on both entries so it
  is front and center during development, and taught by the skill (§11):
  **Database (db) is the default for domain records** — anything that is an entity:
  has fields, has relationships, gets listed/filtered/aggregated, would hurt to lose.
  **KV is app memory** — counters, cursors, preferences, caches, last-seen offsets,
  flags: small values the app writes about itself. The person can always steer.

## 4. Table naming and storage layout

Everything stays in `data/<app-id>/db.sqlite` (WAL, plus `PRAGMA foreign_keys = ON` on
app-db connections — entity relationships are the point, so declared FKs enforce).

- **Service tables: bare `_` prefix**, dropping `_lodekit_`. Rename map:
  `_lodekit_store` → `_kv`, `_lodekit_files` → `_files`, `_lodekit_task_defs` →
  `_task_defs`, `_lodekit_task_runs` → `_task_runs`, `_lodekit_setting_defs` →
  `_setting_defs`, `_lodekit_setting_values` → `_setting_values`,
  `_lodekit_secret_slots` → `_secret_slots`. Internal indexes are `_`-prefixed too
  (`idx_store_expires` → `_idx_kv_expires`). New service tables: `_migrations` (the
  ledger, §5) and `_schema` (the last-applied app snapshot, §7).
- **User tables: exactly as declared, unprefixed** (`plants`, `care_events`). Names
  beginning with `_` or `sqlite_` are rejected at schema push. This mirrors the
  internal-namespace convention for app ids (`_platform` can never collide because the
  app-id grammar forbids `_`) — no reserved-word list, no enforcement code beyond the
  one grammar check.
- **Introspection rule:** every schema-listing surface (the `GET /schema` route, MCP,
  the future data explorer) hides `_*` and `sqlite_*`.
- The platform databases (`events.sqlite`, `logs.sqlite`, `secrets.sqlite`,
  `settings.sqlite`) are single-purpose files with unprefixed tables — unchanged except
  for gaining a `_migrations` ledger.

## 5. Migration engine — one applier, two modes

**Core applier** (runtime-internal module): given a better-sqlite3 handle and an ordered
list of named migrations, it applies the pending ones transactionally and records each in
the `_migrations` ledger (`id INTEGER PRIMARY KEY, name TEXT UNIQUE, applied_at INTEGER`).
One applier, one ledger shape, one moment of application: connection open.

**Internal mode — file-based, checked in.** `packages/runtime/src/migrations/` holds one
ordered chain per database target: `app-db/` (the shared per-app `db.sqlite` — all
services contribute to the one chain) and one directory per platform database. A
migration is a plain TS module exporting SQL statements (or a function over the handle
for data transforms). `getAppDb` runs the app-db chain once per connection, replacing the
per-service `ensureSchema` + `WeakSet` pattern; each `init*Store` runs its platform
chain.

- **Migration 001 (app-db) — baseline + the great rename.** Idempotent against every
  historical shape: for each service table, rename from the `_lodekit_` name if present
  (`ALTER TABLE … RENAME TO …`, data-preserving), create if absent, add any missing
  columns (absorbing kv-store's POC-era column backfill), rebuild the renamed indexes.
  Ledger-recorded, so it runs once per database. Platform chains start with an
  equivalent create-if-absent baseline.
- **Internal drizzle declarations + the drift test.** Every service's tables are also
  declared as drizzle schemas (the types, and the future query-builder on-ramp). The
  migration *files* stay the source of truth for DDL; a test keeps the declarations
  honest: migrate a fresh database through the chain, diff it against the declared
  schema with `drizzle-kit/api`, assert the diff is empty. Authoring aid, not runtime
  machinery: new internal migrations can be drafted with `generateSQLiteMigration` at
  dev time, then checked in.

## 6. App schema contract — `src/db.ts`

Apps declare their domain model in `src/db.ts` — drizzle `sqliteTable()` definitions
plus the app's own typed client via the SDK factory:

```ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createDb } from "@lodekit/sdk";

export const plants = sqliteTable("plants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  species: text("species"),
  acquiredAt: integer("acquired_at", { mode: "timestamp" }).notNull(),
});

export const careEvents = sqliteTable("care_events", { /* … */ });

export const db = createDb({ plants, careEvents });
```

- `createDb(schema)` returns a drizzle instance on the **sqlite-proxy driver**
  (`drizzle-orm/sqlite-proxy`): queries build client-side, fully typed
  (`db.select().from(plants).where(…)`, relational queries, `` sql`…` `` escape hatch),
  and execute by shipping `{ sql, params, method }` over the scoped API (§8). Works on
  both sides of the contract — loaders/server functions and the browser — like `kv`.
- Zod is **not** part of the schema. It remains the trust-boundary validator in the
  runtime's routes; the skill optionally teaches `drizzle-zod`
  (`createInsertSchema(plants)`) to *derive* input validators — derived, never a second
  source of truth. Column names are written explicitly in snake_case (as above); no
  casing magic.
- No `src/db.ts` means no schema and no `db` usage — the service is inert for that app
  (kv-only apps like Welcome stay exactly as they are).

## 7. Schema application — push with a destructive gate

Follows the settings-defs worker-boot registration pattern:

1. **Snapshot (worker).** On app-worker boot — before the server bundle loads and
   `ready` is posted — the worker entry imports the built `src/db.ts` bundle,
   serializes the declared schema with `generateSQLiteDrizzleJson` (`drizzle-kit/api`,
   imported by the entry from the runtime's own install), and posts a `db-manifest`
   message over the worker channel — the same mechanism the settings/tasks/secrets
   manifests use, not an HTTP door. Because the host's handler is async, the worker
   posts `db-manifest` and waits (bounded) for the host's ack — the host applies the
   schema before acking — so no request is forwarded before the new schema is live.
2. **Diff (host).** The host loads the last-applied snapshot from the app's `_schema`
   row (empty snapshot for a first push), computes the migration with
   `generateSQLiteMigration(prev, cur)` in-process, and classifies the statements.
3. **Additive** — `CREATE TABLE`, `ALTER TABLE … ADD COLUMN`, `CREATE INDEX` — apply
   transactionally, then store the new snapshot in `_schema`. The agent edits
   `src/db.ts`, saves, and the schema is live: the same feel as every other Lodekit
   surface, and the person never runs a migration.
4. **Destructive** — anything else (drops, renames, type/constraint changes, the
   recreate-table pattern) — **gate**: nothing applies and the snapshot is not updated.
   The gate must not take down a working app: the worker proceeds to `ready` on the
   last-applied schema, and the failure surfaces the way build state does — a
   `schema-state` event (`payload.status: "gated"`, same type-names-the-kind shape as
   `build-state`) plus a lifecycle error log record, both carrying a message naming
   exactly what would be lost and pointing at the expand-copy path. The skill teaches
   no-breaking-changes as the default habit (§11). Accepting destructive migrations via
   a confirmation flow is roadmap (§14).
5. Validation at the registration hook: user-table grammar (§4), snapshot shape. A
   snapshot that fails to load in the worker (import error) is reported, never fatal —
   the runtime keeps the previous schema, mirroring the settings-manifest contract. A
   gated app keeps serving — existing tables and queries keep working; only the new
   schema didn't apply.

## 8. HTTP surface and SDK

Service module `packages/runtime/src/services/db-store.ts`, the kv-store v2 module
convention (CATALOG_NAME + ops + chained Hono router + middleware), mounted at
`/api/apps/:appId/db-store/`:

- `POST /query` — `{ sql, params, method: "run" | "all" | "get" | "values" }`, the
  sqlite-proxy contract. Executes one prepared statement against the app's database
  (better-sqlite3's single-statement `prepare` is itself a guard against multi-statement
  smuggling). Statement text referencing `_`/`sqlite_` tables is rejected (§2).
- `POST /batch` — an array of query payloads executed inside one transaction, results
  array back; drizzle's transactional unit over the proxy driver (interactive
  transactions don't exist on sqlite-proxy — batch is the story, and the skill says so).
- `POST /select` — SELECT-only queries executed on a short-lived **read-only
  connection** — the MCP door (§9); the readonly guarantee is the connection's, not a
  SQL-parsing promise.
- `GET /schema` — user-table introspection (tables, columns with type/notnull/pk/default,
  indexes), `_*`/`sqlite_*` hidden. Serves MCP and the future data explorer.
- Zod-validated at the boundary; kv-store's error conventions (400 with message, never a
  crash). Query params are JSON scalars (string/number/null) — blob columns don't
  transport over the proxy; binary belongs in file-store.
- **Change feed:** successful writes through `/query` and `/batch` emit a
  `db-store-change` event (kv-store's identity-only pattern, change-feed ttl): payload
  `{ op, table? }` — op from the statement's first keyword, table extracted best-effort
  from drizzle's regular SQL shapes. Apps live-refresh via
  `events.watch({ type: "db-store-change" }, …)`, exactly like the kv feed.

**SDK:** `createDb(schema)` is the one new export (`packages/sdk/src/client.ts` grows a
`db` section like `kv`/`files`); the drizzle proxy callback is ~10 lines of `fetch`
against `/query` + `/batch`. There is no `client.db` handle to pre-instantiate — the
instance is schema-bound, so the app constructs it in `src/db.ts`.

## 9. MCP

Read-only, matching the standing posture (writes wait for the MCP write-guardrails
security work):

- `lodekit_db_schema` ({ appId }) — the `GET /schema` view: the agent reads the domain
  model.
- `lodekit_db_query` ({ appId, sql, params? }) — SELECT-only via `POST /select` (§8),
  executed on a short-lived **read-only connection**
  (`new Database(path, { readonly: true })`) so the guarantee is the connection's, not
  a SQL-parsing promise. "Show me all my plants watered this month" without the agent
  touching app code.

## 10. Dashboard

Nothing ships in v1. **`StorePanel` is deleted** (front-loaded for the data-explorer
session — `dashboard/src/routes/index.tsx` loses the component, its toggle, and the
`kv-store-change` invalidation wiring that exists only for it). Roadmap: the **data
explorer** is the unified surface for KV + Database (schema browser, rows, and
eventually Looker-style assisted querying) — never another isolated dashboard panel.

## 11. Skill

The storage section is rewritten around the decision rule (§3), fixing the stale
`lodekit.store.*` API references along the way:

- **Choose without asking:** db for entities, kv for app memory — with the rule's
  wording so the agent applies it by default and the person steers by exception.
- **Authoring:** `src/db.ts` shape, `sqliteTable` idioms (explicit snake_case column
  names, `integer(…, { mode: "timestamp" })`, FKs), `createDb`, querying in loaders and
  server functions, `batch` as the transaction story, the `` sql`…` `` escape hatch for
  complex queries.
- **No-breaking-changes habit:** additive saves apply instantly; for a reshape, expand
  and copy — add the new column/table, backfill by code, switch reads, stop writing the
  old one — instead of a change in place. The gate's error message reinforces the same
  path.
- **Validation:** derive with `drizzle-zod` where server functions take user input.

## 12. Showcase refactor (definition of done)

Greenhouse's domain records move from kv collections to db-store tables (plants, care
events — the entities), demonstrating schema authoring, relations, typed queries, an
aggregate view, and batch; its legitimate app-memory uses stay on `kv` so the showcase
demonstrates both sides of the rule, side by side. Welcome's `kv.incr` counter stays —
it *is* app memory, the rule working. `root/readme.md`'s coverage checklist gains the
db-store section and its Pending entries drain with the refactor.

## 13. Testing

- **Unit — migration engine:** ordering, ledger recording, transactionality (a failing
  migration leaves no partial state), idempotent baseline against POC-era /
  `_lodekit_`-era / fresh databases; the rename preserves rows. The drift test (§5).
- **Unit — push classifier:** additive vs destructive statement classification;
  `_`/`sqlite_` user-table-name rejection; snapshot persistence round-trip.
- **API:** query/batch/schema routes — happy paths, validation failures, `_`-table
  statement rejection, batch atomicity, app-id scoping (app A cannot reach app B).
- **E2E** (existing pattern): an app-shaped flow driving `createDb` through a booted
  runtime — declare schema, boot, insert/select/join, additive schema change applies on
  rebuild, destructive change gates with the app surfacing the error.
- **Integration:** runtime↔MCP test grows the two db tools.
- **Regression:** the full existing suites pass over the renamed tables — every kv/file/
  task/settings test exercises migration 001 implicitly.

## 14. Deferred (→ roadmap)

- **Accepting destructive app migrations** — a person-facing confirmation flow (likely
  dashboard) that lets a gated migration apply deliberately; until then the gate +
  expand-copy is the whole story.
- **Data explorer** (in flight separately) — the unified KV + Database dashboard
  surface; db-store's `GET /schema` and query door are its substrate.
- **Internal queries onto the drizzle builder** — opportunistic, per service, riding the
  declarations landed here.
- **Data initialization/fixtures** — the roadmap's long-standing companion item; push
  handles DDL only, seeding is its own design.
- **Cross-store transactions** — not offered; revisit only with a concrete use case.

## 15. Decisions log

| Decision | Outcome |
| --- | --- |
| Catalog name | `db-store` (renamed from parked `relational-store`); handle `db` |
| KV vs DB guidance | Per-data-kind rule, glossary-level: db = domain records (default), kv = app memory; skill applies it, person steers |
| "The Store" domain word | Retired; `context.md` entries become KV and Database |
| ORM | Drizzle, strongly coupled (shadcn trade); no wrapper |
| App migration model | Push: additive auto-applies on worker boot, destructive gates with expand-copy guidance; no migration files for apps |
| Internal migration model | Ordered checked-in migration files per database target, shared applier + `_migrations` ledger; required by the data-preserving rename |
| Generalization scope | Schemas + migrations unified across all services and platform DBs now; internal queries stay prepared statements |
| App tables location | Same `data/<app-id>/db.sqlite`; service tables `_`-prefixed (drop `_lodekit_`), user tables unprefixed, `_`/`sqlite_` names rejected |
| Table protection | Statement-text rejection of `_` references; no authorizer (better-sqlite3 has none); apps stay user-trusted local code |
| Worker boundary | Unchanged — drizzle sqlite-proxy over the scoped API; workers never touch sqlite |
| Dashboard | Nothing in v1; `StorePanel` deleted; data explorer is the roadmap surface |
| MCP | Read-only `lodekit_db_schema` + `lodekit_db_query` (readonly connection) |
| Showcase | Greenhouse entities move to db (DoD); Welcome stays kv by design |
