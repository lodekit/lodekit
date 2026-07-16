---
name: lodekit-builder
description: Use when building a local tool/app "with Lodekit" — scaffolds via the Lodekit MCP, then writes a single-page app using the Lodekit client SDK and design system.
---

# Building Lodekit Apps

> **Stale — pending the v0.1 rewrite** (umbrella spec §2.7), except the storage sections
> below (Database, Files, Logs, Events, Settings, Secrets), which are current as of the
> db-store slice. The workflow and the rest of this file still await the rewrite.

Lodekit hosts small single-page tools. You write plain HTML + vanilla JS; Lodekit
auto-injects the design system and a client SDK. Data is per-app SQLite via the SDK.

## Workflow

1. Call MCP tool `lodekit_scaffold({ slug, name, description, icon })`. `slug` must match
   `^[a-z0-9-]+$`. This creates `apps/<slug>/` with `lodekit.json` + stub `index.html`/`app.js`
   and returns the app URL.
2. Write `apps/<slug>/index.html` and `apps/<slug>/app.js` with the real tool. Do NOT add
   `<link>`/`<script>` for the design system or SDK — Lodekit injects them.
3. Use design-system classes for a consistent look (below).
4. Use the Database (`db`) or KV (`kv`) for storage — see below for which.
5. Call `lodekit_open_app({ slug })` to open it; `lodekit_inspect_db({ slug })` to check data.

## Choosing storage: Database (`db`) vs KV (`kv`)

Two per-app stores; choose by data kind, without asking the person (they can steer):

- **Database (db-store) — the default for domain records.** Anything that is an
  *entity*: it has fields, has relationships, gets listed/filtered/aggregated, would
  hurt to lose. Recipes, expenses, plants, rows saved from an integration.
- **KV (kv-store) — app memory.** Counters, cursors, preferences, caches, last-seen
  offsets, flags: small values the app writes about itself.

If you're modeling it with composite keys (`checkin:<id>:<day>`) or scanning prefixes
to "join", it's an entity — put it in the database.

## Database (db-store)

Declare the schema in `src/db.ts` — drizzle tables plus the app's typed client:

```ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createDb } from "@lodekit/sdk";

export const recipes = sqliteTable("recipes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  addedAt: integer("added_at", { mode: "timestamp" }).notNull(),
});

export const db = createDb({ recipes });
```

- **Schema applies on save.** The runtime diffs your declaration against the live
  database at boot: additive changes (new table/column/index) apply automatically —
  never write migrations, never run a CLI.
- **No breaking changes.** Destructive changes (drop/rename/type change) are *gated*:
  they don't apply, and the app reports a `schema-gated` event explaining what would
  be lost. Iterate additively (expand-copy): add the new column or table, copy data in
  app code, switch reads, stop writing the old one.
- Table and column names are snake_case, written explicitly (as above). Table names
  must not start with `_` (reserved for the platform).
- **Query anywhere** with the full drizzle builder — server functions, loaders, and
  the browser all work: `await db.select().from(recipes).where(eq(recipes.id, id))`,
  joins, `groupBy`/`count`, `insert().returning()`, `onConflictDoUpdate`.
  Import operators from `drizzle-orm` (`eq`, `and`, `desc`, `count`, `sql`, …).
- **Transactions are `db.batch([...])`** (the proxy driver has no interactive
  transactions). Complex reads can drop to the escape hatch:
  `` await db.values(sql`SELECT …`) `` — raw SQL has no field metadata over the
  proxy driver, so rows come back positional: use `db.values` (positional by
  contract) or the query builder with aliased fields. `db.all` on raw SQL would
  also return positional rows, just typed as objects — a trap.
- Declare relations with `.references(() => other.id, { onDelete: "cascade" })` —
  foreign keys are enforced; cascades replace manual cleanup loops.
- Blobs don't transport over the query door — binary belongs in Files.
- Validate user input with derived schemas where useful: `drizzle-zod`'s
  `createInsertSchema(recipes)` — derived from the table, never a second source of truth.
- Live refresh: `events.watch({ component: "db-store" }, () => …invalidate…)` —
  same pattern as the kv feed; payloads carry identity (`{ table }`), never values.
- **Via MCP**: `lodekit_db_schema` (the declared tables) and `lodekit_db_query`
  (SELECT-only) — inspect real data before assuming a change worked.
- **Reading errors:** drizzle 0.45 wraps driver errors in `DrizzleQueryError` — the
  real message from the Lodekit server (a gate explanation, a guard rejection) rides
  `error.cause`, not `error.message`. When a db call throws, log or inspect
  `error.cause` to see what actually went wrong.

## Files (file-store)

Per-app blob storage for documents and binary data — use the Database (`db`) for
records, KV (`kv`) for small JSON values, Files for bytes (reports, downloads, images).
Import: `import { files } from "@lodekit/sdk"`.

- A file's key is its **slug** (`a-z0-9-`). Pass one explicitly, or pass `title`
  and let the service derive it ("Q2 Report" → `q2-report`); re-putting the same
  slug replaces the content.
- **Export pattern** (file the person downloads): in a server function,
  `await files.put(csvString, { title, contentType: "text/csv", ttl: 7 * 24 * 3600 })`,
  then render `files.url(stat.slug, { download: true })` as the link. `ttl` (seconds)
  auto-deletes it later.
- **Ingest pattern** (fetch and store): pipe the response straight through —
  `await files.put(res.body!, { slug: "latest", contentType: res.headers.get("content-type") ?? undefined })`.
- `files.list({ prefix })`, `files.stat(slug)`, `files.delete(slug)`,
  `files.copy(from, to)`, `files.move(from, to)`.
- Files are real files on disk under the app's data folder — the person can browse
  them in Finder.
- **Via MCP** you can inspect an app's files with `lodekit_files_list` /
  `lodekit_files_stat`. Never pull bytes through MCP: stat returns an absolute
  `path` — read it with your own file tools, and treat it as **read-only** (all
  writes go through `files.put`). Use `url` to verify what's served or to hand
  the person a link.

## Logs (log-store)

Per-app and platform structured log records — use these to debug what an app is actually
doing at runtime. Import: `import { logs } from "@lodekit/sdk"`.

- `logs.info(message, fields?)` — and `debug`/`warn`/`error` — fire-and-forget; works in
  server functions and in the browser.
- `console.log`/`warn`/`error`/`debug` in server code is captured automatically — no
  explicit call needed for ordinary debugging output.
- **Debugging step:** after building or changing an app, check its runtime behavior with
  the `lodekit_logs` MCP tool (`appId`, optional `level`/`q`). Build failures, server
  crashes with stacks, and request access logs all land there — read them before assuming
  a change worked.

## Events (event-store)

The platform event bus — durable, replayable messages that drive app behavior. Every
event is addressed (`app` — whose stream) and attributed (`kind` + `component` — what
class of platform member emitted it, and which instance): a kv write in your app is
`{app, kind: "service", component: "kv-store", type: "key-set", payload: {key}}`.
Import: `import { events } from "@lodekit/sdk"`.

- `await events.emit(type, payload?, { ttl? })` — announce something happened. Name
  types as past-tense facts, `<subject>-<verb-ed>` (`export-finished`, `note-added`) —
  matching `^[a-z0-9-]+$`; payload is a small JSON object carrying identity and
  references, never statuses (the status IS the type). Works in server functions and
  the browser; returns the stored event with its `id` offset. Your events land with
  `kind: "app"`, `component` = your app id.
- `events.watch({ kind?, component?, type? }, cb)` — client-only live subscription
  (keep it in `useEffect`); each filter is a string or array, dimensions AND together.
  The canonical live-data pattern:
  `events.watch({ component: "kv-store" }, () => queryClient.invalidateQueries({ queryKey: ["kv"] }))`
  — one component filter covers all its facts (`key-set`, `key-deleted`, `key-expired`).
- `await events.list({ component?, type?, since?, until?, after?, before?, limit? })` —
  replay the app's stream (includes platform facts about the app: `build-*` and
  `server-*` from the engine).
- **Via MCP**: `lodekit_events` (`app`, `kind`, `component`, `type`, `since`, `after`,
  `limit`) reads the history — use it to check whether an expected event actually fired.

## Settings

The person's knobs: declare them, read them — never write them from app code.

- Declare in `src/settings.ts`:
  ```ts
  import { defineSettings, boolean, select, duration } from "@lodekit/sdk";
  export default defineSettings({
    show_archived: boolean({ label: "Show archived", description: "Include archived items in the list.", default: false }),
  });
  ```
  Every setting needs `label`, `description` (one line — shown under the control), and `default`. Types: `boolean`, `string`, `number`, `select`, `duration`. Keys are snake_case.
- Read (typed) by importing your own schema: `import settings from "../settings"; const v = await settings.get("show_archived");` — plus `settings.all()` and `settings.watch(cb)`.
- The person edits values in the dashboard Settings page; the dashboard renders your schema automatically.
- Boundaries: **Settings** = person writes, app reads. **KV (`kv`)** = the app's own memory — app writes at runtime. **Database (`db`)** = the app's domain records. **Secrets** = credentials, server-side only (see the Secrets section) — never put credentials in Settings or KV.
- Inspect over MCP: `lodekit_settings_list`, `lodekit_settings_get`.

## Secrets

Credentials (API keys, auth tokens) live in the **secret-store** — never in
Settings, never in KV. The person owns a platform-wide secret catalog;
your app declares **slots** it needs, and the person **links** a secret to each
slot in the dashboard. Server-side code reads linked values; browser code never
can.

Declare slots in `src/secrets.ts`:

```ts
import { defineSecrets, secret } from "@lodekit/sdk";

export default defineSecrets({
  weather_api_key: secret({
    label: "Weather API key",
    description: "Used by the watering forecast to fetch local weather.",
  }),
});
```

Read them **only in server functions** (never in components):

```ts
import { secrets, SecretUnavailableError } from "@lodekit/sdk";

const key = await secrets.get("weather_api_key"); // throws SecretUnavailableError
```

Handle `SecretUnavailableError` (`reason: "unlinked" | "unavailable"`) by
rendering a "configure me" state pointing the person at the dashboard's
Secrets page.

Hard rules:

- **Never ask the person to paste a secret value into chat.** Direct them to
  the dashboard → Secrets (or the app's settings page, which shows pending
  slots with a link/create affordance).
- **Never log, echo, or store a secret value** — not in `kv`, not in `db`, not in
  `files`, not in events, not in console output.
- The four-way boundary: **Settings** = the person's knobs; **KV (`kv`)** = app
  memory; **Database (`db`)** = domain records; **Secrets** = credentials the
  person provides.

## Gateways

**You build an integration by using a gateway to the provider — reuse one if
it exists, author one if not.** When the person asks to "integrate with X" or
"get data from X", the gateway is how: a declarative manifest the runtime
enforces. Your app's server code calls through it; the runtime injects the
credentials — app code never holds a key.

The decision flow:

1. **Check existing gateways first**: `lodekit_gateways` (or list
   `<root>/gateways/`). If a gateway for the provider exists, just declare a
   connection (step 3).
2. **Author a manifest** only when none fits:
   `gateways/<provider-id>/manifest.json` + a `favicon.svg`/`png`/`ico` beside it.
   HTTPS only for public hosts (`http:` is allowed only toward
   localhost/private hosts, e.g. a local Home Assistant).

```json
{
  "name": "OpenWeatherMap",
  "website": "https://openweathermap.org",
  "base_url": "https://api.openweathermap.org",
  "auth": { "kind": "api_key", "in": "query", "param": "appid", "slot": "api_key" },
  "slots": { "api_key": { "kind": "secret", "label": "API key" } },
  "limits": { "rate": "60/min" }
}
```

Auth kinds: `none`, `api_key` (query or header), `bearer`, `basic`, `oauth2`
(authorization/token URLs + a config slot named by `client_id_slot`; the
person clicks Connect in the dashboard). Slots are `secret` (the person links a catalog
secret) or `config` (a plain per-connection value — a personal base URL, an
account id).

3. **Declare the connection** in `src/gateways.ts`:

```ts
import { defineGateways, gateway } from "@lodekit/sdk";

export default defineGateways({
  weather: gateway({
    provider: "openweathermap",
    description: "Daily forecast for the watering log.",
  }),
});
```

4. **Call it — only in server functions and tasks** (never browser code):

```ts
import { gateways, GatewayError } from "@lodekit/sdk";

const res = await gateways.weather.get("/data/2.5/forecast", {
  query: { q: "Lisbon", units: "metric" },
});
if (res.ok) {
  const forecast = await res.json();
}
```

Paths are relative — the runtime pins requests under the gateway's base URL.
Failures throw `GatewayError` with a `reason`: `unconfigured`/`needs_reauth`
mean the person finishes the connection in the dashboard (render a
"configure me" state); `rate_limited`/`breaker_open`/`timeout`/`network`/
`unavailable` are transient — let the task run fail and its retry policy
decide; `too_large` is a permanent request-shape problem (the response
exceeds the size cap) — don't blind-retry, rethink the request or raise the
`gateways.max_response_bytes` setting. Every request is recorded in Logs
under `source=gateway:<provider-id>`.

**The polling recipe** (no webhooks exist): a scheduled task calls through
the gateway, writes domain records to the Database, emits an event. Tasks is
the scheduler, the Database is the record, Events is the announcement — no
gateway-side polling machinery exists.

Hard rules:

- **Never ask the person for a credential in chat** — direct them to the
  gateway's page in the dashboard (Gateways → the provider), where they link
  secrets, set config values, and click Connect for OAuth.
- **The agent never handles OAuth tokens.** Connect is a person-only,
  dashboard-only act.
- Don't fetch external APIs directly from app code when a gateway fits —
  the gateway is what gives the person rate limiting, monitoring, and
  key safety.

## Design system classes

`lk-container` (page wrapper), `lk-h1`, `lk-muted`, `lk-card`, `lk-grid`, `lk-row`,
`lk-input`, `lk-select`, `lk-btn`, `lk-table`. Prefer these over custom CSS so tools
look consistent. App-specific tweaks go in an optional `app.css`.
