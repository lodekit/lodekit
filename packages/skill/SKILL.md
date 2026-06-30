---
name: lodekit-builder
description: Use when building a local tool/app "with Lodekit" — scaffolds via the Lodekit MCP, then writes a single-page app using the Lodekit client SDK and design system.
---

# Building Lodekit Apps

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
