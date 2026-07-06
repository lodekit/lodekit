# file-store (Files) — Design

**Date:** 2026-07-06
**Status:** Draft, pending review
**Role:** Slice-spec for the file-store service — the first 0.x service-catalog slice after
v0.1 (`docs/specs/2026-07-02-product-overview-design.md`, §2.2 marks file-store "Future").
Closes the service's name, storage model, API, and ergonomics; generalizes the
services-use-the-app-database convention that kv-store v2 started.

## 1. Goals & scope

Blob storage for apps, inspired by S3 but re-derived for the local paradigm: one person,
one process, a real filesystem underneath. Two driving use cases:

1. **Ingest** — an app downloads a file (e.g. an XML export from an accounting service)
   and stores it for parsing.
2. **Export** — an app produces a document (e.g. a CSV/PDF report) the person downloads
   from the browser, auto-deleted later via TTL.

**Scope decision — full service + thin proofs on all three consumer sides:** the runtime
service and SDK handle, read-only MCP tools, skill documentation, and one example-app flow
as the acceptance test. The dashboard file-explorer panel is deferred (roadmap).

**Non-goals:** dashboard file explorer; storage dedup (§4.3); versioning; MCP write access
(Security body of work); richer lifecycle rules than TTL (waits for the Tasks service —
roadmap).

## 2. S3 assessment — what comes in, what stays out

Lens: most S3 machinery exists to solve cloud problems — flaky networks, many writers,
fleet-scale durability — that a single local process on a person's disk doesn't have.
What survives is the core object model and the ergonomics around it.

**In:**

| S3 capability | file-store shape |
| --- | --- |
| PutObject / GetObject / DeleteObject | `put`, `get`, `delete` |
| Key namespace | Slug identity (§4.1) over a date-sharded on-disk layout (§4.2) |
| ListObjectsV2 (prefix + pagination) | `list({ prefix, limit, cursor })` — metadata only |
| HeadObject | `stat` — full metadata without the bytes |
| Streaming bodies | HTTP-native streams both directions; never a whole file in memory |
| Presigned GET URLs | The local analog: a stable per-file **serving URL** apps hand to the browser (`<img src>`, download links) |
| Object expiration (lifecycle) | `put(..., { ttl })` + the existing `scheduler.ts` sweep, mirroring kv-store TTL |
| Event notifications | `file-store-change` SSE events, mirroring `kv-store-change` |
| CopyObject | `copy(from, to)` and `move(from, to)` — cheap on a real filesystem |
| Custom metadata (`x-amz-meta-*`) | One JSON `metadata` object per file (≤ 4 KB) |
| ETag / If-None-Match | On the serving endpoint only — the stored content hash is a free, exact ETag; repeat browser loads cost a 304 |

**Out, with reasons:**

- **Multipart upload** — exists for flaky networks and parallelism; a local stream doesn't
  need it.
- **Versioning, object lock, retention** — heavy machinery; the backup tree is the
  durability story.
- **Storage classes, tiering, replication, cross-region** — no meaning locally.
- **ACLs / bucket policies / presigned-URL auth** — per-app scoping *is* the access model;
  everything is loopback.
- **Conditional writes / ETag beyond serving** — concurrency machinery for many writers;
  one person, one process.
- **Static website hosting** — apps already are that.
- **Storage dedup** — the hash suffix (§4.2) buys integrity and collision-free names, not
  dedup: two slugs with identical content are two copies on disk. Fine at personal scale;
  content-addressed paths or hardlinks would cost Finder readability or complexity
  (roadmap revisit).

## 3. Naming (normative)

- **Catalog name** `file-store` (fixed by kv-store v2 §3): scoped-API mount
  `/api/apps/:appId/file-store/`, runtime module `services/file-store.ts`, SSE event type
  `file-store-change`.
- **SDK/client handle** `files`: `createClient(...).files`, and apps import
  `import { files } from "@lodekit/sdk"` — per the catalog-name → handle mapping fixed in
  kv-store v2 §3.
- **Domain word** for prose, docs, and the dashboard: **Files**.
- **On-disk directory** `data/<app-id>/files/` — matching the handle end to end. The
  roadmap's provisional `blobs/` name is retired.
- **`context.md` amendment (part of this slice):** add a **Files** service entry
  (slug-identity blob storage, `files` handle, browsable in Finder as real files) and
  update the Store entry's "sole storage service" claim.

## 4. Storage model

### 4.1 Identity — slug

A file's stable identity is its **slug**: `^[a-z0-9-]+$`, 1–128 chars, unique per app.
Apps either choose it explicitly or let the service derive it from a human `title`
("Contas Jul 2026" → `contas-jul-2026`; lowercase, diacritics folded, non-alphanumeric
runs collapsed to `-`, trimmed, capped at 128; empty or missing → `file`). Derived slugs
that collide get a `-2`, `-3`, … suffix; an **explicit** slug that exists is a replace
(§4.4), never a collision.

### 4.2 On-disk layout — date-sharded, human-readable, hash-suffixed

```
data/finance/files/
├── 2026-07-06/
│   ├── contas-jul-2026-8f3a2c1d.xml     ← title "Contas Jul 2026", slug derived
│   └── monthly-report-1c9be409.pdf      ← slug "monthly-report", app-chosen
└── 2026-07-08/
    └── monthly-report-77aa0142.pdf      ← same slug re-put: replaced (§4.4)
```

Bytes live at `files/<YYYY-MM-DD>/<slug>-<hash8>.<ext>`:

- **Date folder** — the put date (runtime-local time). Sharding by date keeps directories
  small at any scale and gives Finder a natural browsing axis ("the report I exported last
  Tuesday"). Days with no writes create no folders; a folder is removed when its last file
  goes (delete, replace, move, expiry).
- **`hash8`** — the first 8 hex chars of the content's SHA-256 (the full hash is stored in
  the row). Buys verifiable integrity and collision-free filenames.
- **`.ext`** — mapped from the content type via a small table of common types; omitted
  when unknown. Kept so Finder and Quick Look behave.

### 4.3 Write path — stream, hash, rename

`put` streams the request body to a dot-prefixed temp file (`files/<date>/.tmp-<random>`,
hidden in Finder, same directory so the rename is same-volume) while hashing incrementally,
then renames it to its final name. No whole file in memory; no partial file ever visible
under a final name. A failed put removes its temp file; orphaned temps older than one hour
are removed by the sweep (§8).

### 4.4 Replace semantics

Re-`put` on an existing slug is S3 PUT semantics: new bytes land under today's date folder,
the row repoints, the old bytes are deleted (and their date folder pruned if emptied).
`created_at` survives; `updated_at` bumps. Same content on the same day resolves to the
same final path — the rename simply lands on it. Apps wanting history use dated slugs
(`report-2026-07`).

### 4.5 SQLite is the authority; Finder is a window

A file is in the store iff its row exists (and its bytes are where the row points).
Consequences, stated as rules:

- **Hand-dropped files** (Finder drag-in) are not part of the store — ignored, never an
  error.
- **Finder deletions** reconcile lazily: any read that hits ENOENT (`get`, the serving
  URL, `stat`, MCP) returns 404, deletes the stale row, and emits a `del` event. There is
  **no** existence-polling sweep — verifying every file on a timer would be constant churn
  to catch a rare out-of-band action.
- **Known drift (accepted):** `list()` answers purely from SQLite, so a Finder-deleted
  file keeps appearing in listings until something reads it. Recorded on the roadmap as a
  candidate for a cheap reconciliation pass later.

## 5. Data model — and the general services-database convention

```sql
CREATE TABLE IF NOT EXISTS _lodekit_files (
  slug         TEXT PRIMARY KEY,
  path         TEXT NOT NULL,      -- relative: '2026-07-06/contas-jul-2026-8f3a2c1d.xml'
  title        TEXT,
  content_type TEXT NOT NULL,
  size         INTEGER NOT NULL,
  hash         TEXT NOT NULL,      -- full sha256, hex
  metadata     TEXT,               -- JSON object (custom metadata) or NULL
  created_at   INTEGER NOT NULL,   -- epoch ms
  updated_at   INTEGER NOT NULL,
  expires_at   INTEGER             -- NULL = no expiry
);
CREATE INDEX IF NOT EXISTS idx_files_expires
  ON _lodekit_files(expires_at) WHERE expires_at IS NOT NULL;
```

**Convention (normative, generalizing kv-store v2 §4.1):** the per-app database
(`data/<app-id>/db.sqlite`) is where every service keeps its structured state — sometimes
as the payload itself (kv-store), sometimes as the authoritative index over payload living
elsewhere (file-store; later task-queue runs, settings values). Each service owns tables
under the `_lodekit_<service>` name prefix and its own idempotent `ensureSchema`, run
lazily on first touch; `db.ts` stays connection management only. When relational-store
returns, app-owned tables share the file with the `_lodekit_*` service tables — the prefix
is the reserved namespace.

## 6. Operations & HTTP surface

Mounted at `/api/apps/:appId/file-store/`. Action routes are POST-only and `/:slug` routes
are method-separated (the kv-store v2 trick), so literal slugs like `copy` never collide.

```
PUT    /file-store/:slug                    raw bytes (streamed)              → FileStat
POST   /file-store                          raw bytes, service derives slug   → FileStat
GET    /file-store/:slug                    → the bytes (serving URL)
GET    /file-store/:slug/stat               → FileStat
DELETE /file-store/:slug                    → { deleted }
GET    /file-store?prefix=&limit=&cursor=   → { entries: FileStat[], nextCursor }
POST   /file-store/copy    { from, to }     → FileStat (of the new file)
POST   /file-store/move    { from, to }     → FileStat
```

**Upload metadata** rides the raw-body request S3-style: `Content-Type` (default
`application/octet-stream`), `X-Lodekit-Title`, `X-Lodekit-Metadata` (JSON object,
≤ 4 KB), `?ttl=` (seconds). TTL semantics mirror kv-store: put without ttl clears expiry;
expired files read as missing (lazy delete on read).

**One `FileStat` shape everywhere** (stat, put/copy/move responses, list entries):

```jsonc
{
  "slug": "monthly-report",
  "title": "Monthly Report",
  "contentType": "application/pdf",
  "size": 48123,
  "hash": "77aa0142…",            // full sha256
  "metadata": { "period": "2026-07" },
  "createdAt": 1751791200000,
  "updatedAt": 1751963900000,
  "expiresAt": 1752568700000,     // null = no expiry
  "url": "http://localhost:7777/api/apps/finance/file-store/monthly-report",
  "path": "/Users/…/Lodekit/data/finance/files/2026-07-08/monthly-report-77aa0142.pdf"
}
```

`url` is the serving URL (absolute, from the runtime's own origin); `path` the resolved
absolute disk path — both already exist server-side, and both matter to different
consumers (§9.1).

**The serving endpoint** (`GET /:slug`) sets `Content-Type`, `ETag: "<hash>"` (answering
`If-None-Match` with a bodyless 304 — the stored hash is an exact content identifier, so
repeat browser loads of unchanged files transfer nothing and re-puts bust the cache
automatically), and `Content-Disposition: inline; filename="<slug>.<ext>"`; `?download=1`
switches to `attachment` for download links. Served user bytes also carry
`X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`, so stored content
never executes on the app origin (embeds and downloads unaffected).

**`list`** filters by slug prefix, returns FileStats slug-ascending with keyset pagination
(`cursor` = last slug of the previous page), default limit 100, max 1000, expired filtered
out.

**`copy`** writes a second copy of the bytes under today's date folder with the new slug
prefix; the new row copies title/content_type/metadata/expires_at, with fresh timestamps.
**`move`** is a rename: the row is re-keyed, the disk file renamed in place
(`<newslug>-<hash8>.<ext>`, staying in its current date folder; `created_at` survives). Both replace an existing destination slug (put semantics, old bytes
deleted).

## 7. SDK — the `files` handle

```ts
import { files } from "@lodekit/sdk";           // core: createClient({ baseUrl, appId }).files

await files.put(body, { slug?, title?, contentType?, ttl?, metadata? })  // → FileStat
await files.get(slug)              // → Blob | undefined (undefined = missing)
files.url(slug, { download? })     // → string, for <img src> / <a href>
await files.stat(slug)             // → FileStat | undefined
await files.delete(slug)           // → boolean
await files.list({ prefix?, limit?, cursor? })  // → { entries, nextCursor }
await files.copy(from, to)         // → FileStat
await files.move(from, to)         // → FileStat
files.watch(prefix, callback)      // SSE change feed; returns unsubscribe
```

- `body: string | Blob | ArrayBuffer | ReadableStream` — a server function can pipe a
  fetched response body (`res.body`) straight through to `put` without buffering.
- `put` without `slug` derives from `title` (§4.1) and returns the FileStat carrying the
  slug the app should keep.
- `watch` shares the app's scoped EventSource with `kv.watch` (one connection per app),
  filtering `file-store-change` events by slug prefix.

## 8. Change feed & sweep

- **SSE:** `{ type: "file-store-change", slug, op: "put" | "del" | "expire" }` on the
  scoped `/api/apps/:appId/events` channel; the global `/api/events` carries the same with
  an `appId` field. `put`/replace and `copy` emit `put` for the written slug; `delete` and
  lazy reconciliation emit `del`; `move` emits `del` (from) + `put` (to); the sweep emits
  `expire`. Never any bytes on the wire.
- **Sweep** (registered on the existing `scheduler.ts`, ~60 s per open connection):
  **TTL-only** — deletes rows with `expires_at < now` (partial index) plus their bytes and
  emptied date folders, and removes orphaned `.tmp-` files older than one hour. It does
  not verify existence of unexpired files (§4.5).

## 9. Thin proofs — MCP, example app, skill

### 9.1 MCP (read-only)

Two tools on the SDK core, consistent with `lodekit_kv_list`/`lodekit_kv_get`:

- `lodekit_files_list({ appId, prefix? })` — FileStats.
- `lodekit_files_stat({ appId, slug })` — one FileStat.

FileStat's dual `url`/`path` is deliberate agent ergonomics. Bytes never flow through MCP
(the worst channel for them — tool results land in the agent's context). Instead the skill
teaches the decision rule: **an agent with file tools reads `path` directly** (partial
reads, grep — treating it as read-only; writes go through `put` once MCP write access
exists), and uses `url` to verify what's actually served or to hand the person a link.
Hiding the path would buy nothing — the agent already lives in this filesystem (it writes
the apps tree) — while URL-only would strand desktop agents whose fetch tools refuse
localhost.

### 9.2 Example app (acceptance test)

expense-tracker gains **Export CSV**: a server function renders the expense list to CSV and
`files.put`s it with `title: "Expenses <month>"` and a 7-day TTL; the UI lists recent
exports via `files.list({ prefix: "expenses-" })` and renders each `files.url(slug,
{ download: true })` as a download link. Exercises derived slugs, streaming, TTL, list,
and the serving URL end to end.

### 9.3 Skill

`@lodekit/skill` documents the `files` handle: when to reach for Files vs the Store
(bytes/documents vs JSON values), the export-file pattern (§9.2's shape), ingest via
piping a fetched body to `put`, and the MCP `path`-vs-`url` rule (§9.1).

## 10. Error handling & validation

- Trust-boundary validation, all mapped to 400s (a `FilesError` mirroring `KvError`):
  slug/`from`/`to` against `^[a-z0-9-]{1,128}$`; `ttl` a positive number; `title` ≤ 512
  chars; `X-Lodekit-Metadata` valid JSON object ≤ 4 KB; `limit`/`cursor` well-formed.
  App-id scoping via the existing guard. The slug charset makes path traversal
  structurally impossible.
- **No artificial body-size cap** — it's the person's disk. A put that fails mid-stream
  (disk full, client abort) removes its temp file and leaves the previous version of the
  slug untouched.
- Missing slug on `get`/`stat`/serve/`copy`/`move` → 404 (SDK: `undefined`); `delete` of a
  missing slug is not an error — 200 `{ deleted: false }` (SDK: `false`), matching
  kv-store's `del`. ENOENT with a live row → the lazy reconciliation of §4.5 (404 + row
  cleanup + `del` event).
- A failing sweep tick logs and continues (scheduler contract, kv-store v2 §4.4).

## 11. Testing

Vitest, in the `@lodekit/runtime` suite:

- **Unit:** slug derivation (diacritics, collapse, cap, empty → `file`) and derive-collision
  suffixing; replace semantics (repoint, old-bytes delete, `created_at` survival,
  same-content-same-day path stability); hash/extension mapping; TTL expiry (fake timers +
  scheduler `tick()`); lazy reconciliation on ENOENT; date-folder pruning; temp-file
  cleanup on failed put.
- **API:** all eight routes incl. validation failures, the literal-slug/action-route
  method separation, a streamed round-trip (bytes in = bytes out), ETag/304, and
  `?download` disposition.
- **E2E** (existing pattern): the §9.2 export flow via the SDK core against a booted
  runtime; `watch` receiving `file-store-change` on the scoped channel; scoping (app A's
  channel never sees app B's files).
- **Integration:** the runtime↔MCP test extended with the two files tools.

## 12. Doc & roadmap updates

- **`context.md`:** the naming amendment (§3).
- **Umbrella spec:** §2.2 file-store status column after ship.
- **`roadmap.md`:** close the "Blob storage" entry (this spec); add —
  - **Dashboard file explorer** — per-app Files panel (list, preview, delete), deferred
    from this slice.
  - **`list()` drift reconciliation** — Finder-deleted files linger in listings until
    first read (§4.5); revisit a cheap reconciliation pass (e.g. stat-on-list or a lazy
    background pass) if it bites in practice.
  - **Files lifecycle rules via Tasks** — when task-schedule is designed, richer
    lifecycle than TTL (e.g. "keep last N exports") and possibly subsuming the sweep —
    same consolidation note as kv-store's scheduler.
  - **Storage dedup** — hardlink or content-addressed variants if duplicate bytes ever
    matter at personal scale (§2).

## 13. Decisions log

| Decision | Outcome |
| --- | --- |
| S3 feature cut | Core object model + streaming, serving URLs, TTL, SSE, copy/move, custom metadata, serving-side ETag; multipart/versioning/ACLs/tiering/dedup out (§2) |
| Consumer proofs | All three thin proofs this slice: MCP read tools, example-app export flow, skill docs; dashboard explorer deferred |
| Storage architecture | Adapted content-addressing: SQLite authoritative, date-sharded folders, human-readable `<slug>-<hash8>.<ext>` filenames (integrity, not dedup) |
| Identity | Slug = per-app key (chosen or title-derived); re-put replaces, S3 PUT semantics |
| Finder stance | Window, not a write surface: drops ignored, deletions reconciled lazily on read; no existence-polling sweep; `list()` drift accepted → roadmap |
| Services-DB convention | Per-app db holds every service's structured state (payload or authoritative index) under `_lodekit_<service>` tables; normative from this slice |
| MCP byte access | Bytes never through MCP; FileStat carries both `url` and absolute `path`, skill teaches the path-first rule |
| ETag/304 | In, serving endpoint only — the stored hash makes it free and exact |
| Serving hardening headers | `X-Content-Type-Options: nosniff` + `Content-Security-Policy: sandbox` added during implementation from security review |
| Upload metadata header encoding | `X-Lodekit-Title`/`X-Lodekit-Metadata` travel percent-encoded UTF-8 (fetch header values must be ByteStrings); SDK encodes, runtime decodes |
