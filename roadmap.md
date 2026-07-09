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
- **Real secrets storage** — ~~back the `lodekit.secrets.get()` stub with actual encrypted
  storage + a UI to manage secrets (the secret-store service; design with the lens of
  powering integrations).~~ **Shipped (2026-07-07):**
  `docs/specs/2026-07-07-secret-store-design.md` — encrypted catalog (master key in the
  Keychain), slots/links, worker-token server-only reads, dashboard + MCP (names only).
  Deferred from the slice (spec §12): master-key rotation, non-darwin key providers,
  secret expiry, read-audit log, MCP write/link tools, import; the worker-token door
  covers only the secrets value route — extending it stays with "Local door hardening".
- **App-id-existence check** — the kv router and the db-store router (and the scoped events
  endpoint) materialize `data/<app-id>/db.sqlite` for any well-formed app id without checking
  the app registry (both via `getAppDb`) — inherited from the old `withDb` (now the Hono
  `withDb` middleware); tighten with this body of work.
- **400-vs-500 split** — the kv router's `handle()` maps every thrown error to 400
  (spec-mandated "never crash"); split `KvError` → 400 / unexpected → 500 once
  observability/security work lands.

## Relational-store's return

~~The database service (per-app SQL) is **parked**…~~ **Shipped (2026-07-09)** as the
**db-store** slice (`docs/specs/2026-07-09-db-store-design.md`): drizzle schemas in
`src/db.ts`, push-with-gate migrations for apps, the unified migration engine
(file-based chains) for every internal schema, and the `_lodekit_*` → `_*` rename.

## App server code — next triggers

The substrate shipped as the tanstack-start-host slice
(`docs/specs/2026-07-03-tanstack-start-host-design.md`): apps (and the dashboard) host as
TanStack Start apps in per-app app workers; server functions reach the SDK over loopback
HTTP. Its HTTP trigger (server functions + server-rendered routes) shipped with it; the
remaining triggers are their own slices:

- **Webhooks trigger** — replace the soft same-origin guard on `/<app-id>/_serverFn/*`
  with a real inbound story: auth, reachability (exposing the runtime beyond localhost),
  and signature verification.
- **Server-side `watch`/signals** — `events.watch` is client-only (EventSource-based; the
  events slice absorbed `kv.watch`/`files.watch` into it —
  `docs/specs/2026-07-07-events-design.md`). The server-side subscription story is
  **event-triggered tasks**: the Tasks v1 slice-spec deferred it as gated on the events
  revamp (`docs/specs/2026-07-06-tasks-service-design.md` §11) — now unblocked by the
  events slice: the event log's monotonic offsets are designed for it, and durable
  consumer cursors (at-least-once trigger delivery) are a cursor table away, no schema
  change.

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
- **Tasks** — ~~task-queue/task-schedule, durable execution, hooks, signals; design
  holistically (umbrella spec §2.12).~~ **Shipped (2026-07-07):**
  `docs/specs/2026-07-06-tasks-service-design.md` — queue + schedule + retries + history at
  v1; durable execution/hooks/signals deferred (see "Tasks — deferred from the v1
  slice-spec" under Other deferred items).
- **Business-logic structure** — app-folder conventions that keep app logic from sprawling.
- **Stale build-cache GC** — apps removed while the runtime is down leave orphaned `cacheDir/<app-id>/`
  output (`dropBuild` only runs on a live `unlinkDir`; startup `buildAll` only builds existing apps and
  never prunes). Harmless (nothing serves them — no manifest) but the disposable cache accumulates; a
  startup prune of cacheDir entries with no matching app would close it.

## Parked from the monorepo migration

Foundation items deferred by `docs/specs/2026-06-30-monorepo-migration-design.md` (§7).
The Vite toolchain, `@lodekit/ui`, and `@lodekit/sdk` are tracked under "Next major step"
above; the remainder:

- **Starlight docs** — **scaffold shipped (2026-07-06)**: `web/docs` (`@lodekit/web-docs`),
  a separate Starlight app beside the landing site (`web/main`), per
  `docs/specs/2026-07-06-docs-site-v1-design.md`. Still parked: docs content and IA,
  theming/shared design layer with the landing site, and deploy (`docs.lodekit.com`).
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
- **ui.lodekit.com** — deploy the UI catalog's static Storybook build publicly beside
  docs.lodekit.com (docs branch owns web deploys); the build is already
  deploy-agnostic.
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
- **Accepting destructive db-store migrations** — a person-facing confirmation flow
  that lets a gated schema change apply deliberately (db-store spec §14); until then
  the gate + the skill's expand-copy habit is the whole story.
- **Data explorer (dashboard)** — the unified KV + Database surface (schema browser,
  rows, eventually Looker-style assisted querying) — in flight in a separate session;
  `StorePanel` was deleted by the db-store slice; never ship isolated per-service
  data panels again. db-store's `GET /schema` + `/select` are its substrate.
- **Internal queries onto the drizzle builder** — opportunistic, per service, riding
  the declarations in `packages/runtime/src/internalSchema.ts` (drift-tested).
- **db-store fixtures/data initialization** — seeding/fixtures as a designed
  companion (spec §14); push handles DDL only.
- **Versioning — release automation** — changelogs, tags, bump tooling; versions are bumped
  by hand in lockstep for now (docs/specs/2026-07-06-versioning-design.md §8).
- **v0.1 skill rewrite scope** — must cover the `kv` surface, the collection/`_seq:<name>`
  convention, and the new MCP kv tools (`lodekit_kv_list`/`lodekit_kv_get`); the `appId`
  naming (slug retired), the Query `watch → invalidateQueries` live-data pattern, and the
  two contract shapes (single-page expense-tracker, two-page habit-tracker); teach the
  pattern's caveats eyes-open: a write inside a queryFn plus a coarse `kv.watch("")`
  invalidation causes one redundant self-invalidate refetch per write, and collection
  removal does not cascade (e.g. deleting a habit orphans its checkin keys); the `tasks`
  handle, the `src/tasks.ts` + `task()` declaration contract, and the catch-up/retry
  semantics; the `db` surface (`src/db.ts` schema authoring, `createDb`, batch-as-transaction,
  the KV-vs-DB decision rule, expand-copy habit).
- **Internal scheduler vs the Tasks service** — ~~packages/runtime/src/scheduler.ts is runtime-internal plumbing (first user: the kv-store expiry sweep). When the Tasks service (umbrella spec §2.12) is designed holistically, decide whether it subsumes this scheduler or keeps it as the internal substrate.~~ **Resolved (2026-07-06, Tasks slice-spec §2):** layered, not conflated — the scheduler stays the internal heartbeat; the Tasks dispatcher is its third consumer (`docs/specs/2026-07-06-tasks-service-design.md`).
- **Tasks — deferred from the v1 slice-spec** (`docs/specs/2026-07-06-tasks-service-design.md` §11): event-triggered tasks (after the events revamp; closes the server-side `watch`/signals gap), step-based durable execution (`step.run`/`sleep`/`waitForEvent`), signals, dynamic schedule API, per-task concurrency/rate limits/priorities, MCP task tools (read-only first), and optionally consolidating the kv/file TTL sweeps onto Tasks. Accepted at personal scale (final review): dueOccurrence's occurrence-by-occurrence cron walk after long offline gaps (worst ~tens of ms, once) — bound it only if it ever bites.
- **Task schedules and timezone/DST semantics** — cron (and the `every` anchor) evaluate in
  the machine-local timezone (Tasks slice-spec §4), which is under-specified at the edges:
  DST transitions (a `30 2 * * *` task on spring-forward day hits a nonexistent local time;
  fall-back repeats an hour), the person traveling/changing the system timezone (next-run
  times silently shift; a tz jump can make an occurrence look missed or stale against the
  `catchUp` window), and the persisted high-water mark straddling the change. Today the
  behavior is whatever croner + epoch-ms arithmetic do. Decide and be explicit: document
  the exact DST/tz-change rules, and/or add a per-task `tz` option (croner supports one,
  e.g. pinning a schedule to UTC or a named zone).
- **Task-engine app-set eviction on app deletion** — deleting an app (`dropBuild`) stops its
  worker but the tasks engine keeps polling its per-app db each dispatch tick (schedule runs
  materialize into one absorbed queued row per task; SSE events for a gone app). Bounded and
  self-healing on restart (`recoverInterruptedRuns` re-seeds from `scanApps`); evict from the
  engine's app set on unlinkDir when it first matters.
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
- **Electron `userData` would collide with the State dir if the manager is ever renamed** —
  Electron derives its Chromium-profile location from `productName`/`name`, which today is
  the scoped `@lodekit/manager` → `~/Library/Application Support/@lodekit/manager`. Setting
  `productName: "Lodekit"` (a natural packaging polish step) would silently dump that
  profile (Cache, Cookies, GPUCache, …) into `~/Library/Application Support/Lodekit` —
  the platform State dir holding `logs.sqlite`. If renaming, repoint `userData` explicitly
  (`app.setPath("userData", …)`) before anything else touches it.
- **MCP uses deprecated `server.tool`** — `mcp/index.ts` registers tools via the
  SDK's `server.tool()`, deprecated in `@modelcontextprotocol/sdk` 1.12 in favor of
  `registerTool`. Works fine; migrate when convenient.
- **SSE client registry is a process singleton** — `src/sse.ts` keeps one module-level
  `clients` Set shared across all server instances. Fine for the single-process server,
  but SSE integration tests must tear down client connections before `server.close()`,
  and a multi-instance setup would need per-instance registries. Since the Hono migration
  (stack-refresh slice), the registry holds writer callbacks, not Express `Response`
  objects — the facts above are unchanged.
- **App worker respawn has no give-up** — ~~a permanently-fatal server bundle respawns
  forever at the 10s backoff cap (states/SSE churn error→starting→error), and since the
  events slice each crash cycle stores durable no-ttl `server-state` events (~17k/day at
  the cap) that can evict other apps' history via the 50k oldest-first trim.~~
  **Resolved (2026-07-07):** `fail()` latches after 5 consecutive crashes (the next
  build restarts with a fresh counter — the watcher-rebuild path is the retry), and
  `server-state` events carry the 7-day service ttl. Note the counter resets on `ready`,
  so a boots-then-crashes-later loop never latches — acceptable for v1 (the roadmap
  scenario was fatal-at-boot). Earlier partial fix (2026-07-06, logging slice): the
  fatal stack persists as a `lifecycle` error log record
  (`docs/specs/2026-07-06-logging-design.md` §5).
- **`forwardToWorker` buffers request bodies with no size cap** — the scoped API's 100kb
  `bodyLimit` doesn't apply to app-worker forwards. Enforce a cap when the webhooks
  trigger lands.
- **`db.ts`'s `connections` cache never evicts** — fine in production (one Config per
  process) but tests accumulate stale connections across temp roots, so `openDbs()`-walking
  sweeps touch stale fds; add eviction/close (e.g. on data-dir removal or an explicit
  `closeAll` for tests) when it first bites.
- **Scaffold templates interpolate the app display name unescaped** — into generated TS
  source (root title + `CardTitle`). Escape when scaffold is next touched.
- **Scaffold/fixture root routes lack a `notFoundComponent`** — TanStack warns in SSR;
  falls back to a generic `<p>Not Found</p>`. Add one with the slice-3 skill work.
- **`appWorker`'s worker map is keyed by bare `appId`, not per-`Config`** — a stale server
  `"close"` from a previous `start()` can kill a newer instance's workers — only manifests
  in test churn today (mitigated in e2e teardown); revisit if the runtime ever
  multi-instances.

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
- **Blob storage** — ~~per-app `data/<app-id>/blobs/` for images/files, exposed via the SDK
  and easily browsable in Finder.~~ **Shipped (2026-07-06)** as the file-store slice
  (`docs/specs/2026-07-06-file-store-design.md`): slug-identity blobs, TTL, SSE change feed,
  serving URLs, copy/move; SDK handle `files`; real files under `data/<app-id>/files/`,
  browsable in Finder.
- **Dashboard file explorer** — per-app Files panel (list, preview, delete), deferred from
  the file-store slice (`docs/specs/2026-07-06-file-store-design.md`).
- **file-store `list()` drift reconciliation** — Finder-deleted files linger in listings
  until something reads them (lazy reconciliation only, by design — no existence-polling
  sweep); add a cheap reconciliation pass (e.g. stat-on-list) if it bites in practice.
- **Files lifecycle rules via Tasks** — when task-schedule is designed, richer lifecycle
  rules than TTL (e.g. "keep last N exports"), possibly subsuming the file-store sweep —
  same consolidation note as kv-store's scheduler above.
- **file-store storage dedup** — hardlink or content-addressed variants if duplicate bytes
  ever matter at personal scale; today the hash suffix (`<slug>-<hash8>.<ext>`) buys
  integrity, not dedup.
- **Dashboard theme picker** — person-facing UI (presets/color pickers) writing the same
  theme-override token files.
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
- **Derived metrics from the log schema** — request counts, error rates, and build times
  are derivable from the log schema's conventional `fields` keys (`duration_ms`, `status`)
  via plain SQL; deferred by the logging spec (`docs/specs/2026-07-06-logging-design.md`
  §1) — no schema change, no pipeline now.
- **`~/.cache/lodekit` abandoned** — the runtime's cache moved to
  `~/Library/Caches/Lodekit` under the macOS-native paths canon
  (`docs/specs/2026-07-06-logging-design.md` §3); the old XDG-style dir is not migrated,
  safe to delete manually, regenerable by definition.
- **"platform" is a reserved app id but not rejected** — ~~`GET /api/logs?app=platform`
  treats `app=platform` as the platform's own records, but `isValidAppId`/scaffold don't
  reject an actual app id of `platform` — such an app's log records would be invisible in
  the global logs view.~~ **Resolved (2026-07-07, events slice):** the sentinel renamed to
  `_platform` (internal-namespace convention, `docs/specs/2026-07-07-events-design.md` §8),
  which the app-id grammar already rejects; the log-store reserved-id check is deleted.
- **Manager/dashboard event emission** — `_manager` and `_dashboard` are named on the event
  bus but nothing emits as them yet (`docs/specs/2026-07-07-events-design.md` §1). Needs an
  HTTP emit door for out-of-process/internal emitters (the manager announcing "runtime
  restarting", "update available") plus its auth story — pairs with local door hardening
  (Security). Until then, cross-namespace subscriptions for apps stay deliberately off the
  table too (an app's feed is its own namespace); revisit only with a concrete use case.
- **Event emit over MCP** — `lodekit_events` is read-only; Claude emitting events (e.g.
  announcing a finished background job) pairs with the MCP write-access guardrails
  (Security).
- **URL routing-precedence audit** — app ids like `api` or `dashboard` may shadow (or be
  shadowed by) platform mounts; pre-existing, surfaced by the events slice's
  internal-namespace review (underscore paths like `/_ui`, `/_dashboard` are grammar-safe;
  bare names are not). Audit the routing order and decide the collision story.
- **Manager log streams have no `'error'` listener** — `fs.createWriteStream` in
  `manager/src/logs.js` (now one fresh stream per uptime-day) attaches no `'error'`
  handler; a disk error would crash the Electron main process. Attach handlers / degrade
  gracefully.
- **Welcome → guided FTUX** — grow `root/apps/welcome` into the interactive first-time
  experience teaching the high-level concepts (showcase-apps spec §9).
- **Showcase update on manager update** — first-run install never clobbers a person's
  copy; an "update showcase apps" story belongs with auto-update (showcase-apps spec §10).
- **Greenhouse integrations chapter** — when the integrations layer lands, weather-aware
  watering is the first integration demo (showcase-apps spec §13); it also carries the
  **secret-store DoD coverage** deferred from that slice (spec
  2026-07-07-secret-store-design.md §11): declare a `weather_api_key` slot, link, read.
- **Greenhouse showcase Part 2 — events integration** — the deferred half of the showcase
  slice, needs its own plan: `events.emit` (client + server, per-emission `ttl`),
  `events.list` (`before`/`after` cursors + server-side), `events.watch` with a type
  array, the Ledger (Almanac activity feed), While You Were Away (last-seen offset
  replay), and the `weekly_gazette` task (`cron` + `catchUp: "24h"` + `retries`/`timeout`,
  composing from the event stream). Spec §5 + the plan's Part 2 section list the work;
  `root/readme.md`'s Pending block is the coverage checklist to drain.
- **`events-wiring.test.ts` flakes intermittently** — fails ~1-in-3 full-suite runs on a
  pristine master checkout (and `mcp.test.ts` was seen flaking once under load);
  pre-existing from the events slice, surfaced during the showcase-apps rebase. Diagnose
  the timing assumption and deflake.
- **Per-page SSE connection count** — the injected theme resolver (`themeResolverJs` in
  `packages/runtime/src/server.ts`, served on every app page as `/_ui/theme.js`) opens its
  own `EventSource("/api/events")`, separate from the one the SDK's `watch()` opens per
  client (`packages/sdk/src/client.ts`) — two connections for a single app page that uses
  `watch`. All apps share one origin (`lodekit.localhost:7777`), and HTTP/1.1 caps
  concurrent connections per origin at ~6; consolidate onto a shared channel (or lift the
  per-origin connection concern) before enough app tabs are open at once to matter. The
  dashboard half is partly done (UI revamp, 2026-07-09): a shell-level `SSEProvider` now
  holds one shared `EventSource` for the dashboard's own pages (was one each for
  `index`/`settings`/`events`/`logs`/`secrets`), but the theme resolver above still opens
  its own — so a dashboard tab holds two connections; remaining scope is unchanged:
  hosted-app-page/theme-resolver duplication.
- **Manager `runtimeSettings` subscribe hygiene** — `manager/src/runtimeSettings.js`'s
  `defaultSubscribe` reads the `/api/events` SSE response without `res.setEncoding("utf8")`
  (multi-byte UTF-8 split across chunk boundaries could corrupt a frame), and `start()`/
  `stop()` have no guard against a double `start()` (leaks the prior `unsubscribe`) or a
  `stop()` racing an in-flight `start()`. Leak-only today (single caller in `main.js`); fix
  before `runtimeSettings` gets a second caller or a restart-loop path.
- **Dashboard cosmetic nits (UI revamp, 2026-07-10)** — three parked judgment calls, all
  needing a live browser look rather than more code work:
  - *Advanced rows' bottom borders 4px short* — the Service Overrides accordion content
    gets `pr-1` (`dashboard/src/routes/settings.tsx`) so the accordion's `overflow-hidden`
    height animation doesn't clip field focus rings; side effect is each row's `border-b`
    stops 4px short of the non-accordion rows' dividers. Judge whether it's noticeable;
    if so, find a ring-clip fix that doesn't shorten the border.
  - *Narrow services panel pushes content* — on narrow viewports the services panel
    reflows the page content aside; the revamp spec said it should overlay like a drawer.
    Decide whether the spec behavior is worth implementing.
  - *Settings sidebar sticky offset under a scrolled-away header* — the sidebar is
    `md:sticky md:top-24` (`dashboard/src/routes/settings.tsx`), sized to clear a sticky
    header; but the desktop header scrolls away, so the pinned sidebar sits 6rem below the
    viewport top with a dead gap above. Likely a smaller or dynamic top offset.
- **Self-host the brand fonts** — the default theme loads Fraunces + Hanken Grotesk via a
  Google Fonts `@import` in `packages/ui/theme.css` (design.md). Offline — the normal
  state for a local-first tool — every dashboard and app page falls back to
  Georgia/system-ui, and each page load leaks a request to Google. Ship the two variable
  font files (both SIL OFL) inside `packages/ui`, serve them from the runtime, and replace
  the `@import` with `@font-face` declarations.
