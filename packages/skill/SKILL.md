---
name: lodekit-builder
description: Use when building a local tool/app "with Lodekit" — scaffolds via the Lodekit MCP, then writes a single-page app using the Lodekit client SDK and design system.
---

# Building Lodekit Apps

> **Stale — pending the v0.1 rewrite** (umbrella spec §2.7). The storage API is now the `kv`
> handle (`docs/specs/2026-07-03-kv-store-v2-design.md`); `lodekit_inspect_db` was replaced by
> `lodekit_kv_list`/`lodekit_kv_get`.

Lodekit hosts small single-page tools. You write plain HTML + vanilla JS; Lodekit
auto-injects the design system and a client SDK. Data is per-app SQLite via the SDK.

## Workflow

1. Call MCP tool `lodekit_scaffold({ slug, name, description, icon })`. `slug` must match
   `^[a-z0-9-]+$`. This creates `apps/<slug>/` with `lodekit.json` + stub `index.html`/`app.js`
   and returns the app URL.
2. Write `apps/<slug>/index.html` and `apps/<slug>/app.js` with the real tool. Do NOT add
   `<link>`/`<script>` for the design system or SDK — Lodekit injects them.
3. Use design-system classes for a consistent look (below).
4. Use `window.lodekit` for storage. Create tables on load with `db.exec`.
5. Call `lodekit_open_app({ slug })` to open it; `lodekit_inspect_db({ slug })` to check data.

## Client SDK (`window.lodekit`)

- `await lodekit.db.query(sql, params?)` → array of row objects.
- `await lodekit.db.exec(sql, params?)` → `{ changes, lastInsertRowid }`.
- `await lodekit.store.get(key)` → JSON value or `null`.
- `await lodekit.store.set(key, value)` → persists JSON.
- `lodekit.secrets.get(name)` — not implemented in the POC; do not use.

## Files (file-store)

Per-app blob storage for documents and binary data — use the Store (`kv`) for JSON
values, Files for bytes (reports, downloads, images). Import: `import { files } from "@lodekit/sdk"`.

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

The platform event bus — durable, replayable messages that drive app behavior.
Import: `import { events } from "@lodekit/sdk"`.

- `await events.emit(type, payload?, { ttl? })` — announce something happened
  (`type` matches `^[a-z0-9-]+$`; payload is a small JSON object — identity, not blobs).
  Works in server functions and the browser; returns the stored event with its `id` offset.
- `events.watch({ type? }, cb)` — client-only live subscription (keep it in `useEffect`).
  The canonical live-data pattern:
  `events.watch({ type: "kv-store-change" }, () => queryClient.invalidateQueries({ queryKey: ["kv"] }))`
  — this replaces the removed `kv.watch`/`files.watch`.
- `await events.list({ type?, after?, before?, limit? })` — replay the app's stream (includes
  platform events about the app: `build-state` and `server-state`, each carrying the
  state in `payload.status`).
- **Via MCP**: `lodekit_events` (`appId`, `type`, `after`, `limit`) reads the history —
  use it to check whether an expected event actually fired.

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
- Boundaries: **Settings** = person writes, app reads. **Store (`kv`)** = the app's own memory — app writes at runtime. **Secrets** = credentials, server-side only (coming) — never put credentials in Settings or the Store.
- Inspect over MCP: `lodekit_settings_list`, `lodekit_settings_get`.

## Design system classes

`lk-container` (page wrapper), `lk-h1`, `lk-muted`, `lk-card`, `lk-grid`, `lk-row`,
`lk-input`, `lk-select`, `lk-btn`, `lk-table`. Prefer these over custom CSS so tools
look consistent. App-specific tweaks go in an optional `app.css`.

## Example `app.js`

```js
async function init() {
  await lodekit.db.exec(
    "CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, body TEXT, created_at TEXT)"
  );
  await render();
}
async function render() {
  const notes = await lodekit.db.query("SELECT * FROM notes ORDER BY id DESC");
  // ...build DOM with lk- classes...
}
init();
```
