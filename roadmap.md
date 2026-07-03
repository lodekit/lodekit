# Lodekit Roadmap

Deferred work and known gaps. Parked items from the POC design
(`docs/specs/2026-06-30-lodekit-poc-design.md`) and the monorepo migration
(`docs/specs/2026-06-30-monorepo-migration-design.md`). Sequencing and the component map now
live in the umbrella spec (`docs/specs/2026-07-02-product-overview-design.md`, §4).

## Security

Deferred as a body of work; design it together rather than piecemeal (umbrella spec §5
pointed here):

- **MCP write-access guardrails** — service tools are read-only at v0.1. Before writes:
  person confirmation per write? per-app allowlist? What counts as destructive?
- **Local door hardening** — the runtime's localhost HTTP port is reachable by any local
  process and, via DNS-rebinding pages, potentially by the browser. Likely a local auth
  token on the runtime, arriving together with MCP writes.
- **Harden app/dashboard rendering** — the dashboard is React now (escapes by default;
  resolved by the @lodekit/ui slice). Remaining: apps are user-trusted local code, but
  before any multi-user or shared exposure, audit app-side rendering guidance in the skill.
- **Real secrets storage** — back the `lodekit.secrets.get()` stub with actual encrypted
  storage + a UI to manage secrets (the secret-store service; design with the lens of
  powering integrations). **Unblocked** by the tanstack-start-host substrate — server
  functions reach the SDK, so secrets have a server-side door
  (`docs/specs/2026-07-03-tanstack-start-host-design.md`); still its own slice.
- **App-id-existence check** — the kv router (and the scoped events endpoint) materialize
  `data/<app-id>/db.sqlite` for any well-formed app id without checking the app registry —
  inherited from the old `withDb` (now the Hono `withDb` middleware); tighten with this body
  of work.
- **400-vs-500 split** — the kv router's `handle()` maps every thrown error to 400
  (spec-mandated "never crash"); split `KvError` → 400 / unexpected → 500 once
  observability/security work lands.

## Relational-store's return

The database service (per-app SQL) is **parked** by the v0.1 storage iteration — kv-store is
the sole storage service through early 0.x. Iterate after v0.1 ships: define the
schemas/migrations story (plus data initialization/fixtures) that lets relational-store
re-enter the service catalog. The parking shipped with kv-store v2 (docs/specs/2026-07-03-kv-store-v2-design.md).

## App server code — next triggers

The substrate shipped as the tanstack-start-host slice
(`docs/specs/2026-07-03-tanstack-start-host-design.md`): apps (and the dashboard) host as
TanStack Start apps in per-app app workers; server functions reach the SDK over loopback
HTTP. Its HTTP trigger (server functions + server-rendered routes) shipped with it; the
remaining triggers are their own slices:

- **Webhooks trigger** — replace the soft same-origin guard on `/<app-id>/_serverFn/*`
  with a real inbound story: auth, reachability (exposing the runtime beyond localhost),
  and signature verification.
- **Server-side `watch`/signals** — `kv.watch` is client-only this slice (EventSource-based);
  a server-side subscription story belongs with the Tasks design (task-queue/task-schedule),
  invoking exported functions in the app worker.

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

- **tRPC + Zod** — ~~reconsider as the SDK↔runtime transport/validation layer once an
  app-facing *procedure* surface (integrations, jobs) exists to make end-to-end typing pay
  off~~ **Resolved (2026-07-03, stack-refresh slice):** Hono RPC (`hc<Routes>`) + zod
  validators are the SDK↔runtime transport/validation layer.
- **Per-app type-checking** — gate builds (or surface warnings) via `tsc`; the slice transpiles
  without type-checking, so app source (which has no `node_modules`/tsconfig) gets no type feedback yet.
- **Persistence, per-app (inside the data folder):** blob storage, real encrypted secrets, schemas/migrations, and data initialization/fixtures.
- **Integrations** — gateways, outbound connections, rate limiting.
- **Tasks** — task-queue/task-schedule, durable execution, hooks, signals; design
  holistically (umbrella spec §2.12).
- **Settings** — apps register settings surfaced and editable in the dashboard.
- **Business-logic structure** — app-folder conventions that keep app logic from sprawling.
- **Stale build-cache GC** — apps removed while the runtime is down leave orphaned `cacheDir/<app-id>/`
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
- **Electron packaging + Lodekit-local Node** — **specced (2026-07-02)** as the manager
  slice: `docs/specs/2026-07-02-manager-v0.1-design.md` (everything bundled in the .app at
  v0.1, incl. a pinned Lodekit-local Node — never the system's; pre-1.0 northstar: thin
  manager downloading managed platform artifacts — see "Other deferred items").
  NOTE (resolved by the slice): no workspace-root `node-linker=hoisted` was needed. The
  packaged manager bundles no node_modules at all (zero prod deps; the platform ships via
  `extraResource`), and Forge's pnpm-incompatible walks are skipped in `forge.config.js`
  (`rebuildConfig: { onlyModules: [] }`, `prune: false`, `node_modules` in `ignore`).
  `manager/.npmrc` keeps `node-linker=hoisted` only for Forge's dev-start config check.
- **Dev/default path-mode switch** — **specced (2026-07-02)** into the manager slice
  (`docs/specs/2026-07-02-manager-v0.1-design.md` §7): modes live in how the manager
  launches the runtime (packaged = default paths, repo = `examples/`); the runtime is
  already env-driven.
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
- **Desktop spawn cross-platform + child-tree kill** — the macOS half (single direct child,
  exact kill semantics, stale-PID cleanup) is absorbed by the manager slice
  (`docs/specs/2026-07-02-manager-v0.1-design.md` §5). The Windows spawn quirks
  (`pnpm.cmd`/`shell:true`) stay parked with Windows support.
- **Fill in `CLAUDE.md` Architecture / Build & Test** — both sections are still `TODO`. Now that
  the monorepo structure exists, document it, plus the one rough edge: a clean `pnpm install`
  auto-builds `better-sqlite3` (via root `pnpm.onlyBuiltDependencies`), and switching Node
  versions requires `pnpm rebuild better-sqlite3` (ABI mismatch otherwise).

## Other deferred items
- **v0.1 skill rewrite scope** — must cover the `kv` surface, the collection/`_seq:<name>`
  convention, and the new MCP kv tools (`lodekit_kv_list`/`lodekit_kv_get`); the `appId`
  naming (slug retired), the Query `watch → invalidateQueries` live-data pattern, and the
  two contract shapes (single-page expense-tracker, two-page habit-tracker); teach the
  pattern's caveats eyes-open: a write inside a queryFn plus a coarse `kv.watch("")`
  invalidation causes one redundant self-invalidate refetch per write, and collection
  removal does not cascade (e.g. deleting a habit orphans its checkin keys).
- **Internal scheduler vs the Tasks service** — packages/runtime/src/scheduler.ts is runtime-internal plumbing (first user: the kv-store expiry sweep). When the Tasks service (umbrella spec §2.12) is designed holistically, decide whether it subsumes this scheduler or keeps it as the internal substrate.
- **Dashboard startup-build freshness skip** — `buildDashboard` runs on every start. Raised
  relevance since the tanstack-start-host slice: the Start build (~2–5s) is heavier than the
  old bundled build (~1s), per
  `docs/specs/2026-07-03-tanstack-start-host-design.md` §7. Skip via mtime/hash comparison
  if startup cost starts to matter.
- **Watch dashboard source in dev** — dashboard source isn't watched; runtime restart
  rebuilds it. Add rebuild-on-change if restart friction grows.
- **Manager hardening (post-v0.1, from the slice's final review)** — PID-reuse guard for
  stale-runtime cleanup (verify the process before signaling); supervisor test gaps
  (stop-during-poll, spawnRuntime throw); a Retry item for the root-creation-failure boot
  error (today: fix permissions, relaunch); transient "exited unexpectedly" log line during
  a startup-timeout kill.
- **MCP uses deprecated `server.tool`** — `mcp/index.ts` registers tools via the
  SDK's `server.tool()`, deprecated in `@modelcontextprotocol/sdk` 1.12 in favor of
  `registerTool`. Works fine; migrate when convenient.
- **SSE client registry is a process singleton** — `src/sse.ts` keeps one module-level
  `clients` Set shared across all server instances. Fine for the single-process server,
  but SSE integration tests must tear down client connections before `server.close()`,
  and a multi-instance setup would need per-instance registries. Since the Hono migration
  (stack-refresh slice), the registry holds writer callbacks, not Express `Response`
  objects — the facts above are unchanged.

- **No browser-level test coverage** — every test (incl. `e2e.test.ts`) drives the
  HTTP/SDK layer with `fetch`, never a real browser. This let a browser-only bug ship: at
  a no-trailing-slash app URL (`/<slug>`), the relative `<script src="app.js">` resolved
  to `/app.js` (404), so apps loaded inert. Fixed via a `/<slug>` → `/<slug>/` redirect in
  `appHost.ts`; add a headless-browser smoke test so the asset-loading path is covered.
- **Electron shell + autostart** — **specced (2026-07-02)** into the manager slice
  (`docs/specs/2026-07-02-manager-v0.1-design.md`): menubar app with Start at Login.
- **Managed platform artifacts (manager northstar)** — before 1.0, evolve the manager from
  everything-bundled to a thin supervisor that downloads, verifies, and manages versioned
  platform artifacts (Node + payload) under Application Support — platform updates
  independent of the shell, side-by-side versions, rollback. The invariant across every
  step: Lodekit manages its own dependencies, encapsulated, never touching the person's
  system. Pairs with auto-update.
- **Developer ID signing + notarization** — v0.1 ships ad-hoc signed (assisted alpha,
  right-click → Open); needed before any public download. The packaging pipeline keeps it
  as a config toggle (manager slice-spec §9).
- **True `lodekit.local` / port-free access** — mDNS/Bonjour or a local reverse proxy,
  instead of `lodekit.localhost:7777`.
- **Blob storage** — per-app `data/<app-id>/blobs/` for images/files, exposed via the SDK
  and easily browsable in Finder.
- **Multi-page apps + file-based routing (slice 4)** — ~~expand the app contract beyond
  single-page and adopt file-based route conventions. TanStack Router is already wired in
  the toolchain (stack-refresh slice, code-based routes; habit-tracker is the two-page
  example with an appHost SPA fallback); slice 4 designs the multi-page app contract on
  top.~~ **Dissolved (2026-07-03, tanstack-start-host slice):** file-based routing arrives
  with TanStack Start's own route conventions
  (`docs/specs/2026-07-03-tanstack-start-host-design.md`) — no separate slice needed.
- **Per-app git** — initialize/manage a git repo per app or a Lodekit-apps monorepo.
- **Runtime auto-install** — Lodekit checks for / installs Node and other runtime deps.
- **Image/file app icons** — beyond emoji in `lodekit.json`.
- **Monorepo init** — `lodekit init` to set up a pre-existing Lodekit-apps git monorepo.
