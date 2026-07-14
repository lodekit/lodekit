# Data Explorer — design

**Date:** 2026-07-14 · **Tracking:** GitHub issue #60 · **Status:** approved

A unified, read-only data store explorer replacing the `/_dashboard/data` placeholder.
It gives the person a friendly way to browse one app's data at a time across the
relational store (db-store), key-value store, file store, and the app's own events.
Secrets, settings, and logs are out of scope (they have their own dashboard pages).
Inspiration: Supabase's table editor (sidebar + filter chips + sort rules), read-only.

## Decisions (locked during brainstorming)

- **Explorer-local sidebar.** The global top-header shell stays; `/data` becomes a
  full-bleed page with its own internal sidebar. No whole-dashboard shell change.
- **One app at a time**, chosen via a selector at the top of the explorer sidebar.
- **Read-only throughout.** No inserts/updates/deletes, no SQL editor (later).
- **Query path A:** the client compiles filter/sort/page/search state into
  parameterized SQL against the existing read-only `POST /db-store/select` door
  (which was built for this consumer). No structured rows endpoint.
- **Heuristic recent-activity timestamps** for user tables (see §4).
- **Charts** use the `@lodekit/ui` chart kit (recharts port, `--chart-1…5` tokens);
  the complex grid uses `useDataTable`/`DataTable` in manual mode. **No new
  dependencies** — explicitly not `@tanstack/react-virtual`, JSON viewers, or date
  libs (`Intl` for relative times/numbers).
- **Storage panel is a placeholder**: sidebar item with a "Soon" indicator and a
  coming-soon view. Persisted storage metrics/models are future work.
- **Events view shows app events only**: `ns = appId` **and** `source = appId` —
  this excludes `_platform`-namespace events and platform-sourced change-feed
  records (`kv-store-change` etc.) that live under the app's namespace.

## 1. Layout & routing

`dashboard/src/routes/data.tsx` becomes a **layout route** (sidebar + `<Outlet/>`);
children live under `dashboard/src/routes/data/`:

| Path | View |
| --- | --- |
| `/data` | Redirect to the first app's overview; empty state if no apps |
| `/data/$appId` | Overview |
| `/data/$appId/tables/$table` | Table browser |
| `/data/$appId/kv` | Key-value |
| `/data/$appId/files` | Files |
| `/data/$appId/events` | Events |
| `/data/$appId/storage` | Coming-soon stub |

- Deep-linkable per app/table. Table state (filters/sort/page/search) is component
  state, not URL state, in v1.
- **Full bleed:** the root layout's `max-w-[70rem]` wrapper becomes conditional — the
  data layout route sets `staticData: { fullBleed: true }` and `__root.tsx` honors it
  (single conditional; no other page changes).
- **Sidebar** is plain composition (no `@lodekit/ui` sidebar primitive — that one
  assumes viewport ownership): a fixed-width left column with the app selector
  (existing `Select`, app name + icon from `/api/apps`), then nav: Overview, Tables
  (table list from `/db-store/schema` expanded beneath), Key-value, Files, Events,
  Storage (with a "Soon" `Badge`). Active item follows the matched route.
- Unknown `appId` (not in `/api/apps`) → redirect to `/data`.

## 2. Server additions (all read-only, additive)

### 2.1 `GET /api/apps/:appId/data/summary`

New service `packages/runtime/src/services/data-explorer.ts`, mounted at
`/api/apps/:appId/data` behind the same app-id-validating middleware as the other
per-app services. Response:

```jsonc
{
  "tables": [{ "name": "plants", "rows": 142, "sizeBytes": 421888 }], // user tables only
  "kv":     { "count": 38 },
  "files":  { "count": 21, "totalBytes": 8123456 },
  "events": { "count": 87 },                    // ns = appId AND source = appId
  "dbFileBytes": 1310720,                        // fs.stat of db.sqlite (0 if absent)
  "recent": [                                    // merged, newest first, capped at 10
    { "store": "file",  "label": "photo-042.jpg",      "at": 1760400000000 },
    { "store": "table", "label": "plants",             "detail": "row", "at": 1760399000000 },
    { "store": "kv",    "label": "last-sync-cursor",   "at": 1760398000000 },
    { "store": "event", "label": "watering.completed", "at": 1760397000000 }
  ]
}
```

- **Row counts:** `COUNT(*)` per user table (user tables enumerated exactly as
  `userSchema()` does — never `_`/`sqlite_` prefixed).
- **Sizes:** `SELECT name, SUM(pgsize) FROM dbstat GROUP BY name` on a short-lived
  read-only connection. If the `dbstat` vtab is unavailable in the better-sqlite3
  build, every `sizeBytes` is `null` and the UI falls back to `dbFileBytes` only.
- **No db file yet:** tables/kv/files zero out (the endpoint never 404s for a valid app); the events count and event recents stay real — they live in the platform event store, not the app db.
- **Recent list sources:** `_kv.created_at`, `_files.created_at`, events `ts`
  (filtered as above), and each user table that has a **heuristic timestamp
  column** — first case-insensitive match among `created_at`, `createdAt`,
  `created`, `inserted_at`, `timestamp`, `ts`. Values must parse as a date:
  INTEGER epoch (seconds vs millis by magnitude) or TEXT ISO; unparseable rows are
  skipped. Tables without a match simply don't contribute. Top-N per source, merged
  and truncated server-side.

### 2.2 `GET /api/events/history` — optional `source=` param

Additive zod-validated query param filtering the existing history query by exact
`source` match. The explorer calls `ns=<appId>&source=<appId>`. Existing callers
are unaffected.

### 2.3 SSE invalidations (`dashboard/src/components/sse.tsx`)

- `db-store-change` → invalidate the summary + schema query keys for that ns.
- `file-store-change` → invalidate summary + files list keys.
- Table **row** queries are *not* auto-invalidated — rows refresh only via the
  explicit refresh button (no row-shifts mid-browse). KV keeps its existing
  live invalidation.

## 3. Client data layer

React Query throughout, keys like `["data", appId, "summary"]`,
`["data", appId, "table", table, state]`. New pure module
`dashboard/src/lib/table-query.ts` (unit-tested) compiles grid state into SQL for
`POST /db-store/select`:

- **Identifiers** (table/column names) are accepted only if they appear in the
  server-reported schema, and are double-quote-escaped. Values always go through
  bound `params` — never string-spliced.
- **Filters:** `=  !=  >  >=  <  <=  contains (LIKE %v%)  is null  is not null`,
  ANDed.
- **Search:** one debounced input compiled to `OR` of `LIKE %term%` across the
  table's TEXT-affinity columns (skipped if the table has none).
- **Sort:** ordered rule list → `ORDER BY "c1" ASC, "c2" DESC …` (precedence =
  order of addition).
- **Pagination:** `LIMIT ? OFFSET ?` plus a companion `SELECT COUNT(*)` with the
  same WHERE for total/page math (two round trips per page-load is fine locally).

## 4. Views

- **Overview:** stat cards (total rows across tables, KV entries, files count +
  bytes, events count); two charts on the chart kit — *objects per store* (bar) and
  *estimated size per table* (bar, hidden when `sizeBytes` is null); a table
  shortcuts grid (click → table browser); recent-activity list (store badge, label,
  relative time via `Intl.RelativeTimeFormat`; click navigates to the store's view).
- **Table browser:** toolbar = search input, filter chips + add-filter popover
  (column ▸ operator ▸ value), sort popover managing the ordered multi-sort rules
  (add/remove/flip; Supabase-style), refresh button. Grid = `DataTable` manual mode
  with `DataTableColumnHeader` (quick single-sort) and `DataTablePagination`
  (real total; page sizes 25/50/100, default 50). Column headers show name + declared
  type + pk indicator; `NULL` renders dimmed; long values truncate. Row click opens a
  detail panel (full row, key/value, pretty-printed JSON for object-ish text, copy
  buttons).
- **Key-value:** columns key / value preview / created / updated / expires; the
  search box maps to the endpoint's `prefix` param; cursor pagination (prev stack +
  next); refresh; row detail panel with pretty JSON value.
- **Files:** columns title (fallback slug) with a mime-family icon, content type,
  humanized size, created, expires; cursor pagination; refresh; detail panel shows
  the full `FileStat` incl. metadata JSON and a link to the raw file URL (opens in a
  new tab; served sandboxed by the runtime). No thumbnails/media previews in v1.
- **Events:** newest-first list (`/api/events/history?ns=&source=`), type filter,
  expandable payload JSON, cursor pagination (`before`), refresh. No live tail in v1
  (the global /events page has it); follow-up candidate.
- **Storage:** coming-soon view (icon + copy), sidebar badge "Soon".
- **Empty/edge states:** no apps at all; valid app with no `db.sqlite` yet (friendly
  zero states per view; summary returns zeros); empty table; table dropped
  mid-session (select 4xx → inline error + back to overview); fetch failures →
  inline error with retry.

## 5. Out of scope (v1)

SQL editor; write operations; thumbnails/media previews; storage metrics
persistence + models (the panel behind the "Soon" badge); live tail in the events
view; URL-persisted grid state; virtualized/infinite scrolling.

## 6. Testing & delivery

- **Unit (runtime, vitest):** summary service against a fixture sqlite — counts,
  dbstat fallback path, heuristic recent (incl. a table with no timestamp column and
  unparseable values); events `source` filter; route test for `/data/summary`
  (valid app, app without db, invalid app id).
- **Unit (dashboard):** `table-query.ts` compiler — identifier quoting/rejection,
  each operator, search across TEXT columns, multi-sort precedence, pagination
  params.
- Dashboard views follow the existing convention (no component tests); manual smoke
  against the Greenhouse root. This is dashboard surface, not a new SDK capability,
  so the Greenhouse DoD checklist is unaffected.
- Work lands on the `service` worktree branch; the person reviews and folds in.
