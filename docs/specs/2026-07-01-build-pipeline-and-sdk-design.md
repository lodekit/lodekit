# Lodekit Build Pipeline + Minimal SDK — Design

**Date:** 2026-07-01
**Status:** Approved, pre-implementation
**Builds on:** `docs/specs/2026-06-30-lodekit-poc-design.md` (app contract, SDK, API) and
`docs/specs/2026-06-30-monorepo-migration-design.md` (§7.1 `@lodekit/sdk`, §7.3 Vite toolchain)

## 1. Purpose

The POC is **buildless** — plain HTML + vanilla JS + an injected `window.lodekit` global. That
rules out the real component ecosystem (React, shadcn, TanStack) and gives Claude no typed
contract to write against. This spec is the **first slice of the v2 toolchain**: Lodekit builds
apps itself with Vite, evolving the app contract from buildless HTML/JS to **bundled React +
TypeScript**, and ships a minimal typed **`@lodekit/sdk`**.

It is deliberately the **riskiest, most-enabling slice** — the build pipeline every later
subsystem (`@lodekit/ui`, TanStack, typed platform procedures) depends on. Those later
subsystems are **not** in this spec; they get their own spec → plan → build cycles.

### The cut-over decision

Everything shipped so far is POC. This slice **cuts over entirely** to the bundled contract —
there is no dual-mode host and no buildless fallback. Both example apps are rewritten. One
serving path, one contract. This keeps the runtime simple and the contract clean as we iterate
toward v1.

### In scope

- A Vite build pipeline driven **programmatically via the Vite JS API** (no shell commands).
- The evolved **bundled app contract** (React + TypeScript, `manifest.json`, `src/`).
- The **watch → build → cache → serve** loop with per-app build status over SSE.
- **`@lodekit/sdk`** — a typed HTTP client exposing `db` + `store` (the two capabilities that
  already exist in the backend).
- Updated **scaffold** output for the new contract.
- **Both example apps migrated** to the new contract and verified.

### Out of scope (deferred to roadmap / own specs)

`@lodekit/ui` (themed shadcn), TanStack (Table, Router), tRPC + Zod (transport/validation
reconsideration), and every big-picture SDK block: real secrets, blob storage, cache/TTL,
schemas/migrations, data init/fixtures, integrations (gateways, connections, rate limiting),
workflows (job queue, durable execution, scheduler/poller), app-registered **settings** surfaced
in the dashboard, business-logic app-structure conventions, and per-app `tsc` type-checking.
These shaped the SDK's design as context but are **not built or stubbed** here.

## 2. Toolchain

Lodekit ships **Vite + React + TypeScript + Tailwind** in its own install-dir `node_modules`,
**shared by every app**. The user still never runs a build; apps get the full ecosystem.

- **Tailwind is included; shadcn is not.** Tailwind is a single Vite plugin and gives apps real
  styling immediately. The deferred piece is the themed component library `@lodekit/ui` (shadcn
  on top of Tailwind) — its own spec (§7.2 of the migration design). The POC's injected
  `_lodekit/design-system.css` is **retired**.
- **Build orchestration lives in `packages/runtime`** as a new `src/build.ts` module that wraps
  the Vite JS API. The runtime remains `tsx`-run for its *own* code — depending on Vite to build
  *apps* does not change that. A single process continues to own watch + build + serve, matching
  the POC architecture. (Factoring the toolchain into its own package is a possible later
  refactor, not this slice.)
- **Toolchain dependencies** (`vite`, `@vitejs/plugin-react`, `react`, `react-dom`, Tailwind and
  its Vite plugin, TypeScript) are dependencies of `packages/runtime`. In the monorepo/dev they
  resolve from the workspace install; in a future packaged app they live in Lodekit's install
  dir (the packaging/Node-runtime story is deferred to migration §7.5).

## 3. App contract (the evolved folder)

```
apps/<slug>/
  manifest.json       { name, slug, icon, description }
  index.html          Vite entry — <script type="module" src="/src/main.tsx"></script>
  src/main.tsx        React root (mounts <App/> into #root)
  src/App.tsx         app UI
  src/*.css           optional styles (Tailwind or plain CSS)
```

- **Renamed manifest:** `lodekit.json` → **`manifest.json`**. (Overlaps the PWA web-app-manifest
  filename, but nothing references it via `<link rel="manifest">` and it lives in app *source*,
  not built output, so there is no collision.)
- **No per-app `package.json`, no per-app `node_modules`.** Apps `import` `react`,
  `@lodekit/sdk` (and later `@lodekit/ui`); Vite resolves these via `resolve.alias` into
  Lodekit's shared `node_modules`. This preserves the POC's clean-backup-tree invariant: the
  `apps/` tree carries no dependencies.
- Apps remain **single-page**. Client-side routing is deferred (roadmap / TanStack Router).
- `slug` still must match the folder name; it is the URL path and the data namespace.

## 4. `@lodekit/sdk` (`packages/sdk`)

A typed, hand-written **HTTP client** over the **unchanged** `/api/apps/:slug/...` endpoints.
No backend rewrite rides along; the SDK is a thin typed wrapper, and the transport stays swappable
behind this facade (tRPC/Zod reconsideration is a roadmap item).

Surface (only capabilities that exist in the backend today):

| Method | Behavior |
| --- | --- |
| `db.query(sql, params?)` | `POST /db/query` → typed `Promise<Row[]>`. |
| `db.exec(sql, params?)` | `POST /db/exec` → `Promise<{ changes, lastInsertRowid }>`. |
| `store.get(key)` | `GET /store/:key` → `Promise<T \| null>`. |
| `store.set(key, value)` | `PUT /store/:key` → `Promise<void>`. |

- The app's **slug and API base are derived from `window.location`**, exactly as the POC SDK did.
  SQL row types are `unknown`/generic-parameterized — a SQL passthrough cannot infer them.
- **Buildless package:** `@lodekit/sdk` ships raw `.ts`. Each app's Vite build transpiles it into
  that app's bundle, and types flow directly from source. No build step (consistent with runtime
  and mcp; a publish build is deferred with OSS hygiene). Resolved via the same alias mechanism
  as `react`.
- Replaces the injected `window.lodekit` global entirely. No `/_lodekit/sdk.js` is served.

## 5. Build lifecycle & serving

### Cache directory

Built output lives at `<cacheDir>/<slug>/`, **outside `LODEKIT_ROOT`** — it is regenerable and
must never be backed up (the backup tree is `apps/` + `data/`). `cacheDir` is derived in
`config.ts`. In dev, it is a **gitignored `.cache/` at the repo root**.

### Build orchestration (`src/build.ts`)

- Wraps the Vite JS API (`build()`), producing static output into `<cacheDir>/<slug>/`.
- Per-app inline config: `root` = `apps/<slug>/`, `build.outDir` = `<cacheDir>/<slug>/`,
  `resolve.alias` for `react`, `react-dom`, `@lodekit/sdk` (and future `@lodekit/ui`) pointing at
  Lodekit's shared `node_modules`, React + Tailwind plugins.
- Tracks **per-app build state**: `building` → `ready` | `error(message)`.

### Startup and watch

- **On startup:** build every registered app once before/as the server accepts traffic.
- **Watcher:** on a change under `apps/<slug>/`, a **debounced per-app rebuild** runs via
  `build.ts`. Registry scanning for add/remove of apps stays. A new app folder triggers an
  initial build; a removed folder drops its cache entry.
- **SSE:** the existing event stream gains **`building` / `ready` / `error`** events keyed by
  slug (alongside the existing `apps-changed`).

### Serving (`appHost`)

- Serves **static built output from `<cacheDir>/<slug>/`** instead of reading `apps/` directly.
- **No asset injection** — the SDK and CSS are bundled into the app by Vite.
- **Not-yet-built / building state:** when `<cacheDir>/<slug>/` does not yet exist (e.g. during
  the initial build or a rebuild-in-progress with no prior output), `/<slug>/` serves a
  **"building" page** that subscribes to SSE and reloads on `ready`. A failed build serves the
  build-failed page (§7).
- The `/<slug>` → `/<slug>/` redirect is retained (so relative asset URLs resolve under the app).
- The registry still scans `apps/` for `manifest.json` to know which apps exist.

### Dashboard

Shows per-app **build state** (building / ready / error) driven off the SSE stream, in addition
to the existing live app grid.

## 6. Scaffold

`scaffoldApp` (and the MCP scaffold stub that mirrors it) writes the **new contract**:
`manifest.json` + `index.html` (Vite entry) + `src/main.tsx` (React root) + a minimal
`src/App.tsx` that imports `@lodekit/sdk`. The old `index.html` + `app.js` (globals) stub is
removed.

## 7. Error handling

- **Build failures never crash the runtime.** The app's state becomes `error`, the message
  streams to the dashboard, and requesting `/<slug>/` serves a clear **"build failed" page** with
  the error (chosen over serving stale last-good output — honesty over silent staleness).
- **Type errors are not hard failures** in this slice. Vite/esbuild transpiles without
  type-checking; the SDK's shipped types give editors and Claude correctness feedback, but the
  build does not gate on `tsc`. Full type-check gating is a roadmap item.
- Trust-boundary and path-safety behavior from the POC is preserved: `slug` validated against
  `^[a-z0-9-]+$`, paths resolved within their roots (now including `cacheDir`).

## 8. Testing (minimum, per guardrails)

- **Unit (`build.ts`):** build a fixture app → assert `<cacheDir>/<slug>/index.html` and a hashed
  JS asset exist.
- **SSE:** a file change yields `building` → `ready`; a deliberately broken app yields `error`.
- **e2e:** boot the runtime, build a migrated example app, `fetch` the bundled `index.html` and a
  hashed asset (both 200), and round-trip `db.exec` / `db.query` through the real API.
- **Migration check:** both example apps rebuilt to the new contract serve and persist across
  reload.

## 9. Components & boundaries (summary)

| Unit | Does | Depends on |
| --- | --- | --- |
| `build.ts` (runtime) | Build an app via Vite JS API → `<cacheDir>/<slug>/`; track state | Vite, React/Tailwind plugins |
| `watcher` (runtime) | Debounced per-app rebuild + registry scan on change | `build.ts`, sse |
| `appHost` (runtime) | Serve static built output from `cacheDir` | `cacheDir`, registry |
| `@lodekit/sdk` | Typed HTTP client (`db`, `store`) bundled into apps | backend API |
| dashboard | App grid + per-app build state | SSE |
| scaffold / mcp | Write the bundled app stub | app contract |
| example apps | Expense + habit trackers, rewritten to React/TS | `@lodekit/sdk`, React |

## 10. Verification — what "done" proves

1. `pnpm install` resolves the workspace cleanly, including the new `packages/sdk` and the
   runtime's toolchain deps.
2. `pnpm -r test` — new build/SSE/e2e tests pass alongside the migrated suite.
3. `pnpm dev` builds both migrated example apps on startup, serves them from `cacheDir`, and an
   expense/habit round-trips (add → persists across reload) through `@lodekit/sdk`.
4. Editing an app's source triggers a rebuild and the dashboard shows `building` → `ready`; a
   syntax error shows `error` with a message and a build-failed page at `/<slug>/`.
5. No `node_modules` or `package.json` appears under `apps/`; built output lives only under
   `cacheDir` (outside `LODEKIT_ROOT`).

## 11. Roadmap additions (captured from this session's big-picture context)

To append to `roadmap.md`:

- **tRPC + Zod** — reconsider as the SDK↔runtime transport/validation layer once an app-facing
  *procedure* surface (integrations, jobs) exists to make end-to-end typing pay off.
- **`@lodekit/ui`** — themed shadcn, enriched over time with charts, data-table, rich-text
  editing, and media components.
- **TanStack** — Table (typed sortable lists) and Router (multi-page apps).
- **Persistence, per-app (inside the data folder):** blob storage, real encrypted secrets,
  cache with TTLs, schemas/migrations, and data initialization/fixtures.
- **Integrations** — gateways, outbound connections, rate limiting.
- **Workflows** — job queue, durable execution, scheduler/poller.
- **Settings** — apps register settings surfaced and editable in the dashboard.
- **Business-logic structure** — app-folder conventions that keep app logic from sprawling.
- **Per-app type-checking** — gate builds (or surface warnings) via `tsc`.

## 12. Open assumptions

- Single user, single machine — unchanged from the POC.
- Serve strategy is **build-on-change → static output** (not a Vite dev server / HMR per app),
  matching the disposable-`.cache` model.
- Dev uses `LODEKIT_ROOT=./examples`; the dev/default path-mode switch (migration §7.6) is still
  its own deferred refactor.
- Packaging and the local-Node strategy (migration §7.5) remain deferred; this slice assumes the
  toolchain deps resolve from the workspace install.
