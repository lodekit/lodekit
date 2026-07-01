# Lodekit Roadmap

Deferred work and known gaps. Parked items from the POC design
(`docs/specs/2026-06-30-lodekit-poc-design.md`) and the monorepo migration
(`docs/specs/2026-06-30-monorepo-migration-design.md`).

## Guiding principle

The user should never rely on dev servers or terminal build commands. Lodekit ships a
runtime / web server, and tools are built *on Lodekit as the SDK* and run inside that
instance (one shared instance; per-app instances only if ever proven necessary). Lodekit
controls the build chain **programmatically (via code, not shell commands)** — to the
point of possibly shipping with an internal Node runtime, or downloading one on first
run.

## Next major step: Lodekit-owned shared build toolchain

**Slice 1 shipped (2026-07-01)** — `docs/specs/2026-07-01-build-pipeline-and-sdk-design.md` /
`docs/plans/2026-07-01-build-pipeline-and-sdk.md`: the Vite build pipeline (runtime `build.ts`, driven
via the Vite JS API), the bundled React/TS app contract (`manifest.json` + `src/`, served from
`cacheDir` with `building… → ready` over SSE), and a minimal typed `@lodekit/sdk` (`db` + `store`).
Decided along the way: **build-on-change → serve static output** (not a per-app Vite dev-server/HMR).
The bullets below that remain unbuilt (`@lodekit/ui`, TanStack, internal Node runtime) get their own
slices.

The POC is buildless, which rules out the real component ecosystem. The intended v2:

- Lodekit ships **Vite + React + TypeScript + Tailwind** in its own `node_modules` (in the
  Lodekit install dir), **shared by every app** — so the user still never runs a build, but
  apps get the full ecosystem. No per-app `node_modules` (backup tree stays clean).
- Build chain driven **programmatically via the Vite JS API**, not terminal commands.
- Possibly ship/download an **internal Node runtime** so the user needs nothing
  preinstalled.
- A themed **shadcn library exposed as `@lodekit/ui`** via a Vite alias — `import { Button }
  from "@lodekit/ui"`. One theme imported everywhere = consistent design across tools,
  through real shadcn instead of hand-rolled CSS.
- **TanStack** in the toolchain: **Table** (typed, sortable lists) and **Router**
  (once apps go multi-page).
- A **typed `@lodekit/sdk`** package replacing `window.lodekit` — `import { db, store } from
  "@lodekit/sdk"` — so Claude writes correctly-typed code.
- Lodekit watches `apps/`, runs Vite per changed app, serves output from `.cache/<slug>/`
  (disposable, regenerable, outside the backup tree). Dashboard shows
  `building… → ready` over SSE.
- Decide: build-on-change → serve static output, vs. Vite dev-server/HMR per app.

### Deferred from the build-pipeline slice (spec §11)

Big-picture context that shaped the slice-1 SDK design but was explicitly **not** built or stubbed:

- **tRPC + Zod** — reconsider as the SDK↔runtime transport/validation layer once an app-facing
  *procedure* surface (integrations, jobs) exists to make end-to-end typing pay off.
- **Per-app type-checking** — gate builds (or surface warnings) via `tsc`; the slice transpiles
  without type-checking, so app source (which has no `node_modules`/tsconfig) gets no type feedback yet.
- **Persistence, per-app (inside the data folder):** blob storage, real encrypted secrets,
  cache with TTLs, schemas/migrations, and data initialization/fixtures.
- **Integrations** — gateways, outbound connections, rate limiting.
- **Workflows** — job queue, durable execution, scheduler/poller.
- **Settings** — apps register settings surfaced and editable in the dashboard.
- **Business-logic structure** — app-folder conventions that keep app logic from sprawling.
- **Stale build-cache GC** — apps removed while the runtime is down leave orphaned `cacheDir/<slug>/`
  output (`dropBuild` only runs on a live `unlinkDir`; startup `buildAll` only builds existing apps and
  never prunes). Harmless (nothing serves them — no manifest) but the disposable cache accumulates; a
  startup prune of cacheDir entries with no matching app would close it.

## Parked from the monorepo migration

Foundation items deferred by `docs/specs/2026-06-30-monorepo-migration-design.md` (§7).
The Vite toolchain, `@lodekit/ui`, and `@lodekit/sdk` are tracked under "Next major step"
above; the remainder:

- **Starlight docs** — add Astro's Starlight docs framework inside `web/`, sharing the
  landing site's tooling and deploy. The landing placeholder shipped by the migration is
  the seed.
- **Electron packaging + Lodekit-local Node** — turn the dev shell into a distributable
  app (Forge packaging, code-signing) and implement the Node strategy: find system Node,
  else **offer to download a Node version installed local to Lodekit only** — never
  touching the user's system Node or PATH. Pairs with "Runtime auto-install" below, and
  resolves the `better-sqlite3` ABI-rebuild / pnpm-hoist concern in its packaged context.
  NOTE: `desktop/.npmrc`'s `node-linker=hoisted` only satisfies Forge's config check at
  `electron-forge start` (CWD=desktop); a workspace-root `pnpm install` ignores it, so the
  real layout stays isolated. Before adding `electron-forge make`/`package`, move
  `node-linker=hoisted` to a **workspace-root `.npmrc`** (which changes every package's
  node_modules layout — re-verify all packages under it).
- **Dev/default path-mode switch** — replace the `LODEKIT_ROOT=./examples` dev stopgap
  with first-class modes: a `dev` mode using the factored example apps + fixtures, and a
  `default` mode using the app's own configured paths (`~/Documents/Lodekit`). First
  refactor after the foundation lands.
- **Turborepo** — adopt the task-runner/cache layer once the Vite build graph exists and
  CI times justify it; purely additive on top of pnpm workspaces, no restructure.
- **OSS hygiene** — LICENSE, public README, CONTRIBUTING, CODE_OF_CONDUCT, `.github/`
  templates; reserve/publish under the secured `@lodekit/*` npm scope.
- **`web/` deploy** — deploy the Astro site to `lodekit.com` (domain secured).
- **Dedicated integration-test home** — cross-package integration tests (e.g. the
  runtime↔MCP test that boots the real server and drives the MCP helpers) currently live in
  `packages/runtime/tests/` because that package already has the heavy deps. As thorough
  integration coverage grows, give it a dedicated location/package instead of lodging it in
  whichever unit owns the deps. When built, import `@lodekit/mcp` via its package specifier
  (give `packages/mcp` an `exports`/`main` + declare it a devDependency) instead of the current
  relative reach-in `packages/runtime/tests/mcp.test.ts` → `../../mcp/client.js`, which bypasses
  the package boundary.
- **Desktop spawn cross-platform + child-tree kill** — `desktop/src/main.js` does
  `spawn("pnpm", …)` (needs `pnpm.cmd`/`shell:true` on Windows) and `runtime.kill()` SIGTERMs
  `pnpm`, which may not propagate to the `tsx` grandchild (possible orphaned node). Both belong
  with the deferred Electron-packaging work.
- **Fill in `CLAUDE.md` Architecture / Build & Test** — both sections are still `TODO`. Now that
  the monorepo structure exists, document it, plus the one rough edge: a clean `pnpm install`
  auto-builds `better-sqlite3` (via root `pnpm.onlyBuiltDependencies`), and switching Node
  versions requires `pnpm rebuild better-sqlite3` (ABI mismatch otherwise).

## Other deferred items
- **MCP uses deprecated `server.tool`** — `mcp/index.ts` registers tools via the
  SDK's `server.tool()`, deprecated in `@modelcontextprotocol/sdk` 1.12 in favor of
  `registerTool`. Works fine; migrate when convenient.
- **SSE client registry is a process singleton** — `src/sse.ts` keeps one module-level
  `clients` Set shared across all server instances. Fine for the single-process server,
  but SSE integration tests must tear down client connections before `server.close()`,
  and a multi-instance setup would need per-instance registries.

- **No browser-level test coverage** — every test (incl. `e2e.test.ts`) drives the
  HTTP/SDK layer with `fetch`, never a real browser. This let a browser-only bug ship: at
  a no-trailing-slash app URL (`/<slug>`), the relative `<script src="app.js">` resolved
  to `/app.js` (404), so apps loaded inert. Fixed via a `/<slug>` → `/<slug>/` redirect in
  `appHost.ts`; add a headless-browser smoke test so the asset-loading path is covered.
- **Electron shell + autostart** — clickable desktop app; Lodekit runs at login.
- **True `lodekit.local` / port-free access** — mDNS/Bonjour or a local reverse proxy,
  instead of `lodekit.localhost:7777`.
- **Real secrets storage** — back the `lodekit.secrets.get()` stub with actual encrypted
  storage + a UI to manage secrets.
- **Blob storage** — per-app `data/<slug>/blobs/` for images/files, exposed via the SDK
  and easily browsable in Finder.
- **Multi-page apps + client-side routing** — expand the app contract beyond
  single-page.
- **Per-app git** — initialize/manage a git repo per app or a Lodekit-apps monorepo.
- **Runtime auto-install** — Lodekit checks for / installs Node and other runtime deps.
- **Image/file app icons** — beyond emoji in `lodekit.json`.
- **Monorepo init** — `lodekit init` to set up a pre-existing Lodekit-apps git monorepo.
- **Harden app/dashboard rendering** — the POC builds DOM via `innerHTML` with
  app-controlled strings (manifest name/description, expense notes). Acceptable for a
  single-user local tool, but switch to `textContent`/safe DOM (or sanitize) before any
  multi-user or shared exposure. Concrete gap flagged by the security scanner:
  `examples/apps/expense-tracker/app.js` interpolates `category`/`note` straight into a
  table via `innerHTML` with no escaping, whereas `examples/apps/habit-tracker/app.js`
  already has an `escapeHtml` helper — give expense-tracker the same treatment (or rebuild
  rows with `createElement` + `textContent`).
