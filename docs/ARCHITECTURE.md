# Architecture

The current shape of the system: what exists, where it lives, and how it fits.
Present-tense and deliberately not exhaustive; no API or schema dumps. Decision
rationale and feature designs live in the dated specs. Structural changes update
this file in the same PR; claims are audited against the code at release time.

## System map

Lodekit is a local, self-hosted platform: one engine process serving a person's
own web tools from a Lodekit root (`LODEKIT_ROOT`, default `~/Documents/Lodekit`)
holding sibling `apps/` + `data/` trees.

1. The **manager** (menubar app) installs and supervises the platform. Packaged,
   it ships an ad-hoc-signed `Lodekit.app` bundling a pinned Lodekit-local Node
   and the platform payload, and spawns the **engine** as a single direct child
   Node process. In dev it supervises the workspace engine against `root/` on the
   system Node.
2. The **engine**, a single Node/Hono process, is the host, the scoped API, the
   dashboard, the folder-watcher, and the SSE server. It watches the apps tree,
   builds apps into the cache, and hosts each app's server side (TanStack Start)
   in a per-app worker thread. Everything is served on one port.
3. The engine has two doors: the **dashboard** for the person (apps overview,
   settings, tasks, secrets, themes, data explorer, logs) and the **MCP server**
   for the agent (drives the platform over HTTP, never by importing the engine).
4. **Apps** are built on the stack: the **SDK** + **UI library** on the shared
   toolchain, conforming to the app contract. An app reaches its services
   (db-store, kv-store, file-store, settings, tasks) only through the SDK, which
   calls the scoped API. Server functions run in the app's worker and reach
   services over loopback HTTP. External providers are reachable only through
   **gateways**, with secrets injected host-side.
5. Data: app source in the apps tree, built output in the cache (disposable),
   durable state (db/kv/file per app) in the data tree. Backup tree = apps tree +
   data tree + gateways tree; the cache is deliberately outside it.

## Packages

pnpm-workspace monorepo. Members: `packages/*`, `web/*`, `manager`. `root/` is
**not** a member, so the sample apps never get a `node_modules`.

- **`packages/engine`** (`@lodekit/engine`) — the product. The engine process
  described above; buildless, run via `tsx`. Storage is per-app `better-sqlite3`.
  Also home of the dashboard sources and the vendored themes. Serve-time chrome
  endpoints live under `/_ui/*`: theme delivery (`theme.css`/`theme.js`/
  `theme.json`), favicons, and `shell.json` (app inventory + mark style for the
  `AppShell` chrome).
- **`packages/sdk`** (`@lodekit/sdk`) — the app-facing library: how an app
  reaches every platform service, server- and client-side.
- **`packages/ui`** (`@lodekit/ui`) — the component library (shadcn-lineage)
  used by apps and the dashboard; carries the stock-neutral base tokens
  (`theme-tokens.css`, `theme.css`), in lockstep with the vendored default
  `shadcn` theme. Identity lives in the vendored `lodekit` theme. Also home of
  `AppShell`, the platform chrome (header + app icon rail) the dashboard and
  every app render from their own document roots; it feeds itself from the
  engine's `/_ui/shell.json` when a surface passes no live data.
- **`packages/mcp`** (`@lodekit/mcp`) — the Claude-facing MCP server. Reaches the
  engine **over HTTP only**; no import-time dependency on the engine. The
  dependency-free HTTP helpers live in `client.ts`, the MCP-SDK wiring in
  `index.ts`.
- **`packages/skill`** (`@lodekit/skill`) — the Claude skill (content only).
- **`packages/integration-tests`** (`@lodekit/integration-tests`) — cross-package
  integration tests (engine↔MCP); imports the siblings by package specifier,
  never by relative reach-in.
- **`web/main`** (`@lodekit/web-main`) — Astro landing site.
- **`web/docs`** (`@lodekit/web-docs`) — Starlight docs site: ~44 pages, custom
  diagram components, build-time link validation. Deployed to `docs.lodekit.com`
  by `deploy-web-docs.yml` (manual dispatch).
- **`manager`** (`@lodekit/manager`) — the menubar app (Electron, electron-builder
  `make`). Spawns the engine outside Electron so `better-sqlite3` loads without an
  ABI rebuild.
- **`root/`** — the checked-in Lodekit root: the Greenhouse showcase app (the
  SDK's smoke-testing ground; `root/README.md` holds the coverage checklist) and
  the Welcome app. Used in dev via `LODEKIT_ROOT=./root`; the packaged manager
  installs its apps into a fresh `~/Documents/Lodekit` on first run.

## Invariants

- **No dev servers, no terminal builds.** The person never relies on dev servers
  or terminal build commands. Lodekit ships an engine / web server; apps are
  built on Lodekit as the SDK and run inside that one shared instance (per-app
  instances only if ever proven necessary). Lodekit controls the build chain
  **programmatically (via code, not shell commands)**, down to provisioning its
  own Lodekit-local Node, never the system's.
- **The engine and MCP are buildless**: `tsx`, no build step.
- **Credentials never enter the app worker.** Secrets are linked in the
  dashboard and injected host-side at the gateway boundary.
- **The MCP server reaches the engine over HTTP only**, never an import.
