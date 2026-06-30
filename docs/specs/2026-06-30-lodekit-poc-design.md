# Lodekit POC — Design

**Date:** 2026-06-30
**Status:** Approved, pre-implementation

## 1. Purpose

Lodekit is a dev tool that lets a user build small local apps on a unified, centralized
stack — so the user never manages storage, runtime, or build tooling themselves.
This document specifies a **proof of concept**: one thin end-to-end slice that proves
the idea is worth building.

### The three magic moments the POC must demonstrate

1. **Ingestion** — files land in a watched folder → the app appears live in the
   dashboard, runnable, with no build commands run by the user.
2. **Unified stack** — the app automatically gets SQLite storage + a consistent themed
   design system + a real URL, identical in shape to every other tool.
3. **Claude integration** — an MCP server (plus a thin Skill) lets Claude scaffold,
   build, list, open, and inspect Lodekit apps.

**Showcase tool:** an expense tracker (add expense → list + running total), built live
by Claude through the MCP.

### Explicitly NOT being proven in the POC

Electron desktop shell, autostart, real secrets storage, blob storage, multi-page apps,
client-side routing, a real build toolchain (shadcn/TanStack/TypeScript), per-app git,
runtime auto-install, and true `lodekit.local`. These are real and desired — see
`roadmap.md` — but none are required to prove the three magic moments, and several
(notably the build toolchain) would slow the POC down materially.

## 2. Architecture

Lodekit is a **single Node process** started with one command (`lodekit start`). It is four
things at once:

- **Static app host** — serves each app at `http://lodekit.localhost:7777/<slug>`,
  auto-injecting the design-system CSS and the client SDK into the app's `index.html`.
- **Backend API** — scoped per-app endpoints for SQL, KV, and the app registry.
- **Dashboard** — `http://lodekit.localhost:7777/` lists all apps and live-updates.
- **Folder watcher** — watches `apps/`, reconciles folders against the registry, and
  pushes live dashboard updates over SSE.

### Why `lodekit.localhost`

Browsers resolve `*.localhost` to loopback automatically (RFC 6761) — **no `/etc/hosts`
edit, no sudo.** This gives the "real domain" feel for free. The literal `.local` TLD
(mDNS/Bonjour) and port-free access are deferred to the roadmap.

### Stack

- **Node + Express** — well-understood, reliable.
- **`better-sqlite3`** — synchronous, simple, no async ceremony for a local tool.
- **`chokidar`** — robust cross-platform file watching.
- **No per-app dependencies.** Apps are buildless: plain HTML + vanilla JS + CSS.

### Buildless decision (and its known successor)

The POC is deliberately **buildless** to get something running fast. The tradeoff:
this rules out the real shadcn/TanStack/TypeScript ecosystem, which fundamentally
requires a bundler. The chosen v2 direction (captured in `roadmap.md`) is a
**Lodekit-owned shared build toolchain**: Lodekit ships Vite + React + TypeScript + a themed
shadcn `@lodekit/ui` library + TanStack, in Lodekit's own `node_modules`, shared by every app —
so the user still never runs a build, but apps get the full ecosystem. The POC's
contract is designed to evolve toward that without throwing work away.

## 3. App contract (what Claude writes)

An app is a folder under the apps root:

```
~/Documents/Lodekit/
  apps/<slug>/
    lodekit.json       { name, slug, icon, description }
    index.html     entry point — plain HTML
    app.js         logic — vanilla JS, uses window.lodekit
    app.css        optional app-specific styles
  data/<slug>/
    db.sqlite      per-app database (provisioned on first use)
  lodekit.db           Lodekit registry (list of apps + metadata)
# Lodekit's own node_modules live in the Lodekit install dir, NOT under ~/Documents/Lodekit
```

**Manifest (`lodekit.json`):**

```json
{
  "name": "Expense Tracker",
  "slug": "expense-tracker",
  "icon": "💸",
  "description": "Track expenses with a running total."
}
```

- `slug` must match the folder name; it is the URL path and the data namespace.
- `icon` is an emoji for the POC (image icons → roadmap).

**Auto-injection.** When Lodekit serves an app's `index.html`, it injects (so the app
author never has to remember them):
- `<link rel="stylesheet" href="/_lodekit/design-system.css">` — the design system.
- `<script src="/_lodekit/sdk.js"></script>` — the client SDK, exposing `window.lodekit`.

Apps are **single-page**. Multi-page and client-side routing are roadmap.

### Layout rationale

- `apps/` (code) and `data/` (databases) are **separate sibling trees** → the user can
  `git` the `apps/` tree without dragging databases in, and back up the whole
  `~/Documents/Lodekit` root to capture everything.
- No per-app `node_modules` → the backup/git tree stays clean by construction.

## 4. Client SDK (`window.lodekit`)

Injected into every app. All methods are async and call the backend API, scoped to the
app's own slug (an app cannot reach another app's data).

| Method | Behavior |
| --- | --- |
| `lodekit.db.query(sql, params?)` | Run a SELECT (or any returning query) against this app's `db.sqlite`; resolves to an array of row objects. |
| `lodekit.db.exec(sql, params?)` | Run a statement (CREATE/INSERT/UPDATE/DELETE); resolves to `{ changes, lastInsertRowid }`. |
| `lodekit.store.get(key)` | Read a JSON value from the app's KV table; resolves to the value or `null`. |
| `lodekit.store.set(key, value)` | Write a JSON value to the app's KV table. |
| `lodekit.secrets.get(name)` | **Stub** — reserved shape; throws "not implemented in POC". |

The KV helper is backed by a `_lodekit_store(key TEXT PRIMARY KEY, value TEXT)` table that
Lodekit auto-creates in the app's DB on first use. Values are JSON-serialized.

The app determines the slug it is scoped to from the URL path it was served under; the
SDK derives the API base (`/api/apps/<slug>/...`) from `window.location`.

## 5. Backend API

All endpoints are scoped by `:slug`. Lodekit provisions `data/<slug>/db.sqlite` lazily on
first access.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/apps/:slug/db/query` | Body `{ sql, params }` → `{ rows }`. |
| `POST /api/apps/:slug/db/exec` | Body `{ sql, params }` → `{ changes, lastInsertRowid }`. |
| `GET  /api/apps/:slug/store/:key` | → `{ value }` (or `null`). |
| `PUT  /api/apps/:slug/store/:key` | Body `{ value }` → `{ ok: true }`. |
| `GET  /api/apps` | Registry: list of `{ name, slug, icon, description }`. |
| `GET  /api/events` | SSE stream; emits on registry change (app added/changed/removed). |

**Trust boundary (kept per project guardrails, even in a POC):** the SQL endpoints run
arbitrary SQL — acceptable because Lodekit is a single-user local tool and each connection
is opened against only that app's DB file, so the blast radius is the app's own data.
The `:slug` is validated against `^[a-z0-9-]+$` and resolved within the apps root to
prevent path traversal into other apps or the wider filesystem.

## 6. Dashboard (`lodekit.localhost:7777/`)

Built with the same design-system CSS the apps use (dogfoods visual consistency).

- **Header** — "Lodekit" wordmark + a count of registered apps.
- **App grid** — one card per app: icon, name, description; clicking opens `/<slug>`.
- **Empty state** — when no apps exist: a friendly prompt, "Ask Claude to build a tool
  with Lodekit."
- **Live** — subscribes to `/api/events` (SSE); when an app is scaffolded or files
  land, the new card appears without a manual refresh.

## 7. MCP server (the Claude-facing surface)

A separate MCP server process that Claude connects to. Tools:

| Tool | Behavior |
| --- | --- |
| `lodekit_scaffold(slug, name, description, icon?)` | Create `apps/<slug>/` with `lodekit.json` + stub `index.html`/`app.js`, register the app. Returns the created paths + the app URL. |
| `lodekit_list_apps()` | Return the registry (name, slug, description, URL). |
| `lodekit_open_app(slug)` | Open `http://lodekit.localhost:7777/<slug>` in the default browser. |
| `lodekit_inspect_db(slug)` | Return the app DB's schema (tables + columns) and a small sample of rows per table. |

Claude writes the actual app code (`index.html`, `app.js`) with its own file tools
after scaffolding. The MCP's job is to place files in the right location, keep the
registry correct, and give Claude eyes into the running stack.

The MCP needs to know the Lodekit apps root and base URL; for the POC these come from
config/env shared with the Lodekit server (single machine, single user).

## 8. Skill (thin)

A markdown skill that points Claude at the MCP and provides a one-page cheat-sheet:
- the app contract (folder layout + `lodekit.json`),
- the SDK API (`window.lodekit` table above),
- the design-system class names / components available,
- the rule: scaffold via MCP first, then write `index.html` + `app.js`.

Just enough that "build me an expense tracker with Lodekit" produces correct files in the
right place using the design system.

## 9. Demo tool — Expense Tracker

Proves the full loop. Built live by Claude through the MCP.

- **UI** — a form (amount, category, note) + a list of expenses + a running total,
  all styled with the design system.
- **Storage** — expenses in a SQLite table via `lodekit.db`; a settings value (e.g. default
  currency) via `lodekit.store` — exercising **both** storage paths.
- **Schema** — `expenses(id INTEGER PRIMARY KEY, amount REAL, category TEXT, note TEXT,
  created_at TEXT)`.

## 10. Components & boundaries (summary)

| Unit | Does | Depends on |
| --- | --- | --- |
| `lodekit-server` | HTTP host: static apps, API, dashboard, watcher, SSE | Express, better-sqlite3, chokidar |
| design-system | themed CSS served at `/_lodekit/design-system.css` | — |
| client-sdk | `window.lodekit`, served at `/_lodekit/sdk.js` | backend API |
| dashboard | app grid + live updates | API, SSE, design-system |
| mcp-server | scaffold/list/open/inspect tools | shared config (apps root, base URL) |
| skill | conventions cheat-sheet | — (references the above) |
| demo app | expense tracker under `apps/` | client-sdk, design-system |

## 11. Testing (minimum, per guardrails)

- A smoke test that boots `lodekit-server`, scaffolds an app, hits the `db/exec` +
  `db/query` round-trip, and asserts the registry lists the app.
- A check that the SSE registry-change event fires when an app folder is added.
- Manual end-to-end: run `lodekit start`, have Claude build the expense tracker via the
  MCP, open it, add an expense, confirm it persists across reload.

## 12. Open assumptions (made explicit)

- **Apps root location:** `~/Documents/Lodekit` for the POC (configurable later).
- **Port:** `7777`.
- **Single user, single machine** — no auth, no multi-tenant concerns.
- **Build strategy:** none (buildless). The successor toolchain is on the roadmap.
- **Dashboard live-update:** SSE (chosen over polling so the "appears instantly"
  moment is crisp).
