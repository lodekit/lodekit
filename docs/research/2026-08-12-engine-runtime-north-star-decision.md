# Research: Engine runtime under the north star — Node vs Bun vs Deno vs Go

> **Date:** 2026-08-12
> **Status:** Direction decided 2026-08-31 (Go, direct port) — see "Next steps", which is
> the decision record
> **Issue:** lodekit/lodekit#153 (engine stack track)
> **Prior work:** `.agents/internal/research/2026-07-20-core-stack-improvements-post-go-research.md`,
> `.agents/internal/research/2026-08-06-deno-vs-bun-engine-runtime.md`,
> `~/Desktop/lodekit/lodekit-go-core-research.html` (2026-07-19),
> `~/Desktop/lodekit/lodekit-cross-platform-report.html` (2026-07-07)
> **Method:** five parallel research agents, one per axis (multi-writer sync, Windows/daemon/CLI,
> API contract, Go engine shape, runtime stability + first slices). Full per-axis reports with
> complete source lists: `2026-08-12-engine-runtime-axis-reports.md` (companion file).

## The north star (as refined this session)

- **Data is portable.** User data lives on the local machine and syncs **multi-writer** with a
  cloud or self-hosted gateway that is itself just another engine instance. Requires conflict
  resolution and identity/auth between engine instances.
- **Apps run locally, SPA-only.** The engine serves static SPA bundles plus the scoped API; the
  AI agent (which has a Node toolchain regardless) builds the apps. Server-side user code
  shrinks to scheduled tasks / small extensions, surface TBD.
- **Windows, macOS, Linux.** Engine runs as a daemon with a CLI controller.
- **Contract:** ConnectRPC public API + protobuf realtime was floated; treated here as an open
  question with "split contracts" (OpenAPI public, protobuf sync-only) as the null hypothesis.
- **Goals:** reliable, few dependencies, resilient under this portability; explicit learning /
  showcase value of the stack itself.

## Summary

**Recommendation: Go powers the engine long-term, reached by a strangler migration — never a
big-bang rewrite.** The first slice is a Go `lodekit` binary that is the daemon + CLI +
supervisor (replacing the Electron manager) in front of the untouched Node engine. In parallel,
the Node engine gets the `node:sqlite` swap (#143) behind the existing #141 seam, killing the
ABI pin for the transition years. Bun and Deno are eliminated on stewardship grounds. The #153
fork ("Node path vs Bun path") resolves to a third answer: **Node now, Go progressively, Bun
never (revisit only if a stable 1.4 + LTS materialize), Deno never.**

The decision hinges on three findings: (1) SPA-only deletes the single biggest cost of a Go
engine — the hosting/SSR/Vite subsystems never get ported; (2) multi-writer sync has **no
off-the-shelf answer in any stack**, so sync is novel engine-level work either way and does not
favor keeping TS; (3) among the four candidates only Node and Go are stacks you would bet five
years on today, and on the north-star criteria (single-binary gateway, 3-OS daemon, few deps,
learning value) Go beats Node-forever.

## Key findings

### F1. Multi-writer sync does not pick the runtime — it must be built, and it ports

No existing system provides "laptop engine ↔ gateway engine, both writers, reconcile" where the
gateway is just another instance of our own engine:

- **cr-sqlite is dormant** (no core feature work since 2024; creator now at Rocicorp; Aug 2026
  commits are community build fixes only). Corrosion (Fly.io) proves its CRDT core at scale —
  and Fly's 2025/2026 incident history is a cautionary tale for gossip-everything designs.
- **ElectricSQL, PowerSync, Zero (1.0, Jun 2026) all require Postgres (or another backend DB)
  on the server side** — disqualified by "gateway = another engine". sqlite-sync (SQLite AI) is
  Elastic-licensed and coordinator-bound. Marmot v2 makes apps write via MySQL wire protocol.
  rqlite/LiteFS are single-leader/single-writer.
- **Turso** (Rust SQLite rewrite, MIT, `tursodb --sync-server` self-hosts with no cloud) is the
  strongest trajectory but explicitly **beta**, hub-and-spoke, remote-authoritative. Watch item,
  possible later "buy".
- **The build path is well-trodden at exactly our scale: Actual Budget's design** — every
  mutation becomes a message (table, row, column, value, HLC timestamp), last-write-wins per
  field ordered by hybrid logical clocks, a Merkle trie over timestamps to find the divergence
  point so reconnects exchange only deltas. MIT reference code (jlongster/crdt-example-app,
  annotated), property-tested in production for years. ~1–2k LOC. "The server is basically a
  thin client that keeps messages and moves them around" — literally our gateway shape.
- Lodekit's advantage: the SDK owns all writes (kv, db-store rows, file metadata), so sync
  merges **SDK-shaped mutations, not arbitrary SQL** — a dramatically smaller problem than
  generic CRDT-SQLite. Prerequisite invariant: no raw SQL writes to synced tables from apps.
- **Identity/auth between engines: Syncthing's model.** Self-signed cert per engine; device ID =
  SHA-256(cert) in base32 + check digits; mutual TLS with pinned cert hashes; pairing =
  out-of-band exchange of two short strings. No accounts, no PKI, native in both Node and Go.

The protocol is runtime-agnostic by construction: specify it (protobuf fits naturally here),
implement in TS first if sync lands before the engine port, port later — or land it directly in
Go if the strangler has advanced far enough. **Sync shares the novelty budget with the rewrite;
it neither causes nor cures it.**

### F2. Stability: only Node and Go survive a five-year test (Aug 2026)

- **Node — yes, strengthening.** Node 26 becomes LTS Oct 2026; from Node 27 every release is
  LTS (annual, calendar-aligned, 36-month support). Native TypeScript type-stripping is
  **Stable** as of 24.12.0 — the "buildless tsx in production" brittleness largely dissolves.
  `node:sqlite` is RC (Stability 1.2) with an active stabilization push (blocker list posted
  Aug 4, 2026 on nodejs/node#57445); not Stable yet, no committed date.
- **Bun — no.** Latest stable tag is 1.3.14 (May 13, 2026) — a 3-month stall vs the prior
  2–4-week cadence; the Zig→Rust 1.4 rewrite is canary-only and already shipping inside Claude
  Code but has no public stable tag; no LTS channel exists or is promised; 3,828 open issues /
  4,409 open PRs with the AI-generated PR queue doubling in 18 days; measurable pre-acquisition
  team attrition (RedMonk, Jun 2026). The compile worker bug (oven-sh/bun#29124) is still open,
  fix PR unmerged. Anthropic's backing guarantees survival, but the roadmap serves Claude Code,
  not third-party products. **Revisit trigger:** stable 1.4 tag holding through 2–3 patch
  releases plus an LTS commitment.
- **Deno — technically yes, organizationally no.** Runtime cadence healthy (2.9.5, Aug 6; LTS
  channel to Jan 2027); permission sandbox remains its unique differentiator. But: no funding
  since 2022, March 2026 layoffs, pivot to Deploy/Sandbox, and a demonstrated willingness to
  hard-EOL products (Deploy Classic shut down Jul 20, 2026, no auto-migration). Also the
  largest migration surface of the three JS options for us.
- **Go — strongest stewardship of the four.** Six-month cadence held for a decade, Go 1
  compatibility promise at 13+ years, Go 1.26 current (Green Tea GC default, cgo overhead
  −30%).

### F3. The Windows/daemon axis mostly dissolves — and mostly favors Go where it doesn't

- **The industry norm for single-user localhost tools on Windows is a login-scoped supervised
  process, not a Windows Service.** Syncthing's docs say so explicitly; Ollama registers no
  service at all (`ollama app.exe` in Startup supervises `ollama serve`). Both are Go — but the
  pattern works on any runtime. A true SCM service is optional hardening; only Go can register
  one natively (kardianos/service covers SCM + launchd + systemd behind one API); all three JS
  runtimes need a wrapper (WinSW/Shawl/NSSM — NSSM abandoned, WinSW disputed).
- **Axis ranking (fewest moving parts): Go ≫ Deno > Node > Bun.** Go: one ~15–30 MB static
  binary per target, six targets cross-compiled from one CI job with modernc (pure-Go SQLite).
  Deno: best JS shape (`deno compile`, six targets incl. win-arm64, signable) but wrapper-
  dependent services and compile-mode bugs near our worker model. Node: most pieces (directory
  tree + wrapper) but **zero migration risk** and, after the node:sqlite swap, pure-zip on all
  targets — the swap deletes the last native module. Bun: weakest Windows finish (Defender
  false positives, "Bun" process identity, a self-referential `node` shim footgun).
- **CLI pattern:** Syncthing's single-binary subcommand dispatch (`lodekit serve` = daemon,
  other subcommands are HTTP clients of it) is the fewest-moving-parts fit. Windows PE headers
  force a GUI-vs-console choice per exe — keep any future tray helper a separate exe (the
  reason Tailscale split theirs).

### F4. The API contract is conditional on the runtime — and under Go it flips to Connect

The July refutation ("proto is wrong for the agent-facing API") was re-tested. Verbatim
verdict, updated for Aug 2026:

- **MCP 2026-07-28 doubled down on JSON Schema** (full JSON Schema 2020-12 for tool schemas;
  stateless HTTP; SSE transport formally deprecated). The JSON-Schema-native premise is now
  stronger, not weaker. Two stale claims corrected: protovalidate-es v1 exists (TS validation
  gap closed), and Connect **unary** is plain-fetch + JSON consumable with zero protobuf
  runtime (streaming still needs enveloped framing).
- **If the engine stays JS: split contracts wins again.** Hono + zod + OpenAPI public; SSE
  stays; protobuf only for the engine↔engine sync protocol.
- **If the engine is Go: ConnectRPC-everywhere becomes coherent.** The chain that did not exist
  a year ago now does: `.proto` (+ protovalidate) → connect-go (new `simple` codegen) →
  vanguard-go in-process REST transcoding → protoc-gen-connect-openapi (OpenAPI 3.1) →
  **protoc-gen-go-mcp** (MCP tools generated from the service — Go-only tooling; Redpanda runs
  it in production) → protoc-gen-es + connect-query (typed TS client on TanStack Query v5).
  One schema, four consumers (REST/OpenAPI, MCP, SPA, sync). Bonus: Hono's `hc` typed client
  has documented type-instantiation scaling problems right at our ~110-route size; generated
  clients don't pay that tax.
- **Realtime:** Connect has no WebSocket story and none coming. Pattern across comparable
  products: sync = WebSocket + purpose-built (often binary) protocol; agent surface = plain
  stateless HTTP. Engine↔engine Connect bidi over h2c works (no proxies on that path).
- **Hedge (runtime-neutral):** the ecosystem is drifting to "code mode" — agents consuming a
  typed, searchable SDK rather than 110 individual tools (Cloudflare Code Mode; Anthropic's
  code-execution-with-MCP; Stainless shipping exactly two tools). Whichever stack generates the
  best typed TS surface wins that future; Connect's generated clients are strong there.
- **Caveat:** no single case study shows the six-tool Go chain wired end-to-end; it needs a
  spike before the contract ADR commits to it.

### F5. The Go engine is credible now because SPA-only deleted its biggest cost

The 2026-07-19 Go report's fatal cost — "the app contract as specced dies with Node" — is no
longer Go-specific: SPA-only kills TanStack Start hosting, SSR, Vite-on-device, and per-request
app workers in *either* stack. What remains to port is the scoped API, stores, task runner,
sync, daemon/CLI — the subsystems Go is conventionally best at. The esbuild-is-Go "lucky fact"
is irrelevant (the agent builds apps); embedded NATS stays rejected.

- **Task runner: goja, PocketBase-proven.** PocketBase (60k stars, single Go binary + modernc
  SQLite + goja running user JS hooks/cron with a prewarmed runtime pool) is the decisive
  precedent — and the honest preview of the cost: no timers, CJS-only, no Node/browser APIs;
  the sanctioned contract becomes "agent bundles task code to one ES2017-ish file"
  (agent-trivial, esbuild one-liner). goja has async/await, generators, optional chaining; ESM
  still open (grafana/sobek is the ESM-experimental fork k6 runs on). v8go eliminated (cgo +
  V8 static libs). Watch item: **modernc.org/quickjs** — pure-Go QuickJS at ES2023 incl.
  modules (v0.23.0, Aug 2026), pre-1.0; if it matures it closes most of the dialect gap.
- **SQLite: modernc.org/sqlite** (pure Go, very active, ships in PocketBase; trivial
  cross-compile) — viable *because* F1 removed the loadable-extension requirement (cr-sqlite is
  dead; sync is engine-level). mattn/cgo only if an extension ever becomes a hard requirement.
- **HTTP: stdlib.** Go 1.22+ ServeMux needs no framework; dashboard via embed.FS; SSE via
  http.Flusher; coder/websocket if WS is needed.
- **Dependency count: ~6–8 direct** (modernc/sqlite, goja or sobek, kardianos/service,
  robfig/cron, official Go MCP SDK v1.x — Google-comaintained, stable — x/oauth2, fsnotify,
  optionally coder/websocket). No framework, no ORM, no cgo. Compare: the current engine's npm
  tree plus the Electron toolchain.
- **Two biggest risks:** (1) sync is novel work with no comparator at our exact shape —
  stack-independent (F1) but it lands on a young codebase; (2) the goja dialect gap is chronic:
  every missing web API becomes a skill rule or a host bridge, forever. Contained (PocketBase
  proves it) but permanent.
- **Honest loss ledger vs TS:** the single-language type flow (zod + `hc`) becomes
  codegen-at-a-boundary; the buildless dev loop becomes compile-and-restart; ~8.4k LOC of
  engine behavior re-derived (much less than the July estimate — hosting/SSR/Vite fall out of
  scope); npm long-tail convenience thins. "The agent writes Go" is mostly not a con in 2026 —
  frontier agents are strong Go authors, and Microsoft shipped TypeScript 7.0 GA (Jul 8, 2026)
  with tsc itself ported to Go, ~10x faster, normalizing Go as the native language of
  JS-ecosystem tooling.

### F6. The strangler path is proven, and its first slice is independently justified

- Step 1 — **Go binary = supervisor + CLI + service install + reverse proxy** in front of the
  untouched Node engine — needs only stdlib `httputil.ReverseProxy` + kardianos/service. It
  replaces Electron, delivers the north star's daemon+CLI shape on the spot, and is worth
  shipping **even if the engine rewrite never happens**. The shape is mass-deployed: Ollama's
  app is literally "Go process: tray + supervises server subprocess"; Tailscale's
  daemon + CLI-over-local-socket is the canonical 3-OS pattern.
- Direct prior art for proxy-first Node→Go absorption: Nhost's auth service (Go proxy
  forwarding everything, then absorbing endpoints one by one); purpose-built parity-logging
  strangler proxies exist designed for agent-driven rewrite loops. Turborepo (70k lines
  Go→Rust) and tsc-to-Go set the industry norm for incremental cross-language ports.
- Natural absorption order: (1) daemon/CLI/proxy → (2) static app-bundle serving + dashboard
  embed → (3) stores + scoped API route-by-route, parity-checked behind the proxy → (4) task
  runner (goja) → (5) sync protocol → (6) `lodekit mcp` on the Go MCP SDK. The Node engine
  shrinks to a task-only sidecar, then to nothing.

## Decision matrix

| Criterion (north star) | Node (forever) | Bun | Deno | **Go (strangler)** |
|---|---|---|---|---|
| 5-year stewardship | Yes — strengthening | No — stalled, no LTS | Runtime yes, company no | **Yes — strongest** |
| Single-binary gateway (VPS/NAS) | No (dir tree; SEA experimental) | Yes, weakest finish | Yes (~80 MB) | **Yes (~15–30 MB static)** |
| 3-OS daemon + CLI | Wrapper-dependent | Wrapper + open SCM request | Wrapper-dependent | **Native (kardianos/service)** |
| Windows incl. arm64 | Good after node:sqlite swap | Weakest polish | Good, recent | **Good (pure Go)** |
| Multi-writer sync | Build it (JS-1) | Build it | Build it | Build it (Go-1) — **neutral** |
| Few dependencies | npm tree | npm tree, fewer | npm-compat shims | **~6–8 direct, no cgo** |
| User task code | Native TS (best) | Native TS | Native TS + sandbox | goja dialect gap (**worst**) |
| Migration risk | **Zero** | Medium + unstable target | Largest JS surface | Highest — mitigated by strangler |
| Contract story | Split (OpenAPI + proto sync) | Split | Split | **One proto → 4 consumers** |
| Learning/showcase (explicit goal) | Low | Medium | Medium | **Highest — community default for this product class** |

If learning/showcase were not a criterion, Node-forever would be a defensible verdict (zero
migration risk, stable TS, node:sqlite one release away). With it, and with the gateway shape
making the single static binary the deploy target that matters most, **Go wins — provided it
arrives incrementally and the first slice pays for itself standalone.**

## Recommendation (ordered ladder)

> Superseded 2026-08-31 where it differs from the "Next steps" section below: direct port
> instead of strangler; #143 dropped; #142 closed (Bun path closed for good — no revisit).

1. **Decide + record.** Approve the direction; write the Runtime & Packaging ADR
   (`docs/decisions/`, the #153 close-out) naming: Go strangler, Node engine maintained
   through the transition, Bun path closed (revisit trigger: stable 1.4 + LTS), Deno path
   closed. Include the north star as the decision context and "learning value" as an explicit
   weighted criterion.
2. **First slice — Go daemon + CLI (`lodekit` binary)** replacing the Electron manager:
   `serve` (supervise Node engine child + reverse proxy), `ctl status/logs/doctor`,
   `service install` via kardianos/service; macOS first, tray as stretch (separate exe on
   Windows later — PE header constraint). 1–2 weeks. Forecloses nothing; delivers daemon+CLI
   and deletes Electron even if nothing else ever moves.
3. **Parallel slice — #143 node:sqlite swap now** behind the #141 seam (RC quality is
   acceptable with better-sqlite3 as the seam fallback for one release). Kills the ABI pin and
   the pinned-Node bundling machinery for the transition years; also pure-zips Windows.
4. **Park/close #142** (Bun compile spike): its information value collapses under this
   direction. File the revisit trigger in the issue before closing.
5. **Next decisions after the slice lands** (each its own spec): sync conflict semantics
   (LWW-per-field vs surfaced conflicts — precedes any sync code; F1's SDK-mutation invariant
   is the prerequisite), the SPA-only app contract ADR, and the Connect-chain spike (F4 caveat)
   before the contract flips.

## Next steps (decided 2026-08-31)

Recorded after the person reviewed this document and a working session settled the
direction. Where this section and the ordered ladder above differ, this section wins. The
two supersessions: **no strangler** — nothing has been released, so the current
engine/manager/MCP internals are treated as throwaway proof-of-concept and the Go engine
is built as a direct port, with the Node engine kept only as the reference implementation
for parity; and **no transitional work** — the #143 node:sqlite swap is dropped and #142
is closed. The SDK surface design, UI library, dashboard, showcase apps, and docs site
carry forward, adapted to the new contract.

### Priorities

1. **Lock the engine decision: Go.** Close #153's fork: Go direct port; Bun closed for
   good (no revisit); Deno closed; the north star and "learning value" recorded as
   explicit criteria. This document is the decision record — the dev flow no longer
   keeps ADRs.
2. **Lock the SDK shape** — APIs and how agents build apps. Two spikes gate the spec
   (see Ordered actions). Priority 3 folds in here: the SDK API *is* the layering
   interface.
3. **Layered architecture that keeps sync reachable.** Sync is not built from day 1 —
   the stack starts local-only and expands later — but no decision may block reaching
   multi-writer sync. The candidate mechanism, to be locked in the individual store
   specs rather than here: synced stores write through an op-log with HLC timestamps
   and state tables are projections (log-first, broker-less — NATS/JetStream was
   evaluated and rejected as the vehicle: it doesn't solve reconciliation, breaks the
   one-copyable-data-tree property, loses same-transaction enqueue, and its semantics
   reduce to ~4 SQLite tables at this scale). Locked now: the invariant that all writes
   to synced stores flow through the SDK API.
4. **A functional Go stack able to power and run apps** — including the macOS tray.
5. *(sequenced later)* Multi-gateway auth + sync.

### End-state component map (after priority 4)

One shipped Go binary, `lodekit`, zero Node in the product:

- **`lodekit serve`** — the daemon. One HTTP server, one port, same URL scheme as today:
  - **App host**: serves each app's built SPA bundle as static files with SPA fallback
    (unknown paths rewrite to the app's `index.html`). No Vite, no workers, no SSR.
  - **SDK API**: the scoped HTTP API (kv, db, files, settings, events/SSE, tasks,
    gateways) that the SPA's SDK client calls from the browser. The scope key is a
    **namespace** from day 1, with "one app = one namespace (namespace defaults to app
    id)" as the current semantics.
  - **Stores**: SQLite via modernc.org/sqlite under the data tree; whether writes go
    through the priority-3 op-log is locked in the stores spec.
  - **Task runner**: goja pool executing agent-bundled single-file tasks from the apps
    tree; cron host-side; capabilities only via bridged host functions.
  - **Dashboard**: a built-in app, so pre-building makes sense — which keeps Node
    tooling in the monorepo. The mechanism (e.g. `embed.FS`, built at release time) is
    decided in its spec.
- **`lodekit mcp`** — stdio MCP subcommand on the official Go MCP SDK, reaching the
  daemon over localhost HTTP only (today's invariant, preserved). Absorbs
  `packages/mcp`.
- **CLI subcommands** (`status`, `logs`, `doctor`, `open`,
  `service install|start|stop`) — thin HTTP clients of the daemon; kardianos/service
  for launchd/systemd/SCM. No separate internal API: the daemon's control-plane
  endpoints (status, health, log tail, start/stop-class operations) live as a route
  group — routes mounted under one path prefix with admin-scope auth middleware — on
  the same server and port as the app host and SDK API; CLI and tray call those
  routes. The alternative stays open as context for the future: a separate internal
  listener (Unix socket / named pipe, or a second localhost port — the Tailscale
  pattern), buying process-level isolation at the cost of a second server and
  lifecycle. The choice and the auth mechanics are decided in the daemon/CLI spec.
- **Tray (macOS, in priority 4)**: implementation decided in its spec, between
  fyne.io/systray compiled into the binary on darwin (cgo on darwin only; release
  builds run on macOS runners anyway) and a SwiftUI MenuBarExtra helper. Menu: open
  dashboard, status, start/stop, quit. There is no engine child to supervise; first-run
  app install becomes first-boot logic in `serve`. Signing/notarization ports from the
  Electron scripts. Deferred: Windows tray (separate exe — PE-header constraint),
  Linux tray (AppIndicator fragmentation).

TypeScript remains the language of everything app-facing: apps, shadcn/`@lodekit/ui`,
dashboard sources, and the SDK (now client-side + task typings; its server half dies with
SPA-only). Deleted: Electron manager, the Node MCP process, tsx, better-sqlite3,
worker_threads hosting, Vite-in-engine.

### Build pipeline: the engine builds — single binary, Node-free

The research draft's "agent builds apps" assumption is reversed: it would trade away the
packaged-and-isolated ergonomics, which is an invariant. **The engine builds; the agent
drops source** — today's ergonomics, kept. Findings verified 2026-08-31 that make this
possible without Node:

- Apps already import from a **curated dependency universe** (no per-app
  `node_modules`); this becomes an explicit app-contract rule, and it is what makes
  engine-side bundling tractable (plus a reproducibility/security feature).
- **esbuild is a Go library** — embedded in the engine for TS/JS bundling, resolving the
  curated universe from vendored assets.
- **Tailwind v4's CSS compiler is JavaScript, not Rust.** Oxide (Rust) only does class
  extraction; the `tailwindcss` v4 JS core compiles CSS and provably needs no Node APIs
  (github.com/balintbrews/tailwindcss-in-browser runs the full pipeline in a browser).
  Plan: class extraction in Go; the v4 core pre-bundled to CJS at Lodekit release time
  and executed in goja at app-build time; Lightning CSS skipped (v4 already requires
  modern browsers; we serve localhost). One binary, no subprocesses, `@apply`/`@theme`
  work.
- **Fallback**: vendored `@tailwindcss/browser` with bake-back (browser compiles in dev;
  the engine captures and persists the sheet as the app's static CSS). **Rejected**: the
  standalone Tailwind CLI — it is a Bun-compiled binary embedding the Bun runtime, with
  per-platform quality bugs (broken Alpine ARM64 release; Windows ARM via x64 emulation
  only) — tailwindlabs/tailwindcss PR #14270, issue #14569. **Last resort**: a
  no-Tailwind app contract (chronic fight with agent instincts).
- **Built output is part of the app artifact**: source + dist live in the app dir and
  both sync/back up. Only the authoring machine ever builds; the gateway and secondary
  devices only serve — no toolchain there, and the Vite-on-small-VPS OOM problem from
  the July research evaporates.
- Dev loop: rebuild on change + SSE full reload (esbuild rebuilds in milliseconds, so
  HMR is not missed). Agent-side building survives only as an optional fast path; the
  packaged product stands alone.

### Ordered actions

1. **Close #153** per priority 1, pointing at this document as the decision record.
2. **Spike A — Node-free build pipeline** (~2–3 days): esbuild bundling against the
   curated universe; the TanStack Router file-based-route codegen question (fallback:
   code-based routing in the app contract); Tailwind-v4-core-under-goja. Verified by
   diffing output against a real Vite build of Greenhouse.
3. **Spike B — the Connect chain end-to-end**: proto → connect-go → vanguard REST
   transcoding → OpenAPI → protoc-gen-go-mcp → connect-query TS client. Decides
   ConnectRPC-everywhere vs split contracts before the SDK spec commits (F4's caveat).
4. **SDK / app-contract spec**: namespaces, curated universe, the task contract (bundled
   single-file, goja dialect rules), whether "small server extensions" means
   agent-written endpoints or tasks only, and the build-pipeline contract from Spike A.
5. **Go engine port**, in the natural order: skeleton (static host + dashboard embed +
   CLI + tray) → stores + SDK API → task runner → MCP subcommand → cutover when
   Greenhouse passes on Go with contract-test parity against the Node reference.

### Notes for the future (recorded, not acted on)

- **Sync spec (#5) items**: conflict semantics (LWW-per-field vs surfaced conflicts)
  decided before any sync code; task placement or leases so cron never double-fires
  across instances ("runs on gateway" is a feature — the gateway is awake while the
  laptop sleeps); secrets likely don't sync by default (security decision); events
  fan-out across instances; identity via Syncthing-style mTLS cert pinning with
  out-of-band pairing.
- **Watch items**: Turso as the buy-later sync candidate; Jazz and Evolu as idea sources
  (Evolu's mnemonic-identity pairing especially) — every current-generation sync engine
  either takes over the data model or requires Postgres, and the op-log is the adapter
  seam if a mature one emerges.
- **Cross-namespace grants** (control-center apps reading other namespaces, with
  dashboard-mediated consent) — additive once namespaces exist.
- **Docs debt at cutover**: ARCHITECTURE.md rewrite; DEFINITIONS.md rulings — the op-log
  vs "events are never the system of record", the death of the buildless-tsx invariant,
  and the reworded engine-builds invariant ("the engine builds apps; packaged Lodekit is
  complete and isolated").

## Disagreements

- **Agent D (Go shape) vs Agent C (contract) on ConnectRPC:** D carried forward the July
  verdict ("ConnectRPC stays dead; OpenAPI won"); C re-tested that verdict as its whole axis
  and found it flips under Go (the proto→OpenAPI/MCP/TS-client fan-out now exists, Go-only).
  C's deeper pass wins for the Go branch, with its own caveat honored: the six-tool chain is
  unproven end-to-end — spike before the contract ADR.
- **Windows service necessity:** the July cross-platform report treated services as the target;
  Agent B found the product-class norm is login-scoped autostart (Syncthing's docs say services
  are for headless sysadmin scenarios only). Resolved in favor of autostart-first, SCM as
  optional hardening — which Go happens to get natively anyway.

## Open questions

1. Sync conflict semantics (product decision, precedes all sync code): LWW-per-field,
   LWW-per-row, or surfaced conflicts? And can the SDK enforce "no raw SQL writes to synced
   tables"?
2. Does "small server extensions" mean agent-written HTTP endpoints (reopens per-request user
   code, changes the goja threat model) or only scheduled tasks?
3. node:sqlite Stable 2.0 timing (watch nodejs/node#57445 through Node 26 LTS, Oct 2026) —
   affects when the seam's fallback can be removed, not the direction. *(Moot as of
   2026-08-31: #143 dropped — no transitional work.)*
4. goja vs sobek vs modernc.org/quickjs at task-runner time (1-day spike each, re-check then).
5. The Connect six-tool chain end-to-end (spike before the contract decision in the SDK
   spec).
6. Turso beta-exit timeline and self-hosted sync-server production posture (the "buy" option
   if our hand-rolled sync ever needs replacing).
7. Azure Trusted Signing pricing/eligibility for individuals (Windows signing tier, unverified
   since July).

## Sources

Load-bearing sources are cited inline in the five full axis reports (companion file
`2026-08-12-engine-runtime-axis-reports.md`), all fetched 2026-08-12. Highest-leverage primary
sources: nodejs/node#57445 (sqlite stabilization), oven-sh/bun releases + #29124 + RedMonk
Jun 2026, deno.com/blog/v2.9 + dbushell.com layoffs post, modelcontextprotocol.io 2026-07-28
changelog, connectrpc vanguard-go / protoc-gen-connect-openapi / redpanda protoc-gen-go-mcp,
archive.jlongster.com "Using CRDTs in the wild" + jlongster/crdt-example-app,
docs.syncthing.net (device IDs, autostart), pocketbase.io/docs/js-overview, kardianos/service,
go.dev/blog/go1.26, nhost.io/blog/auth-to-go, vercel.com Turborepo migration,
visualstudiomagazine.com TypeScript 7.0 GA.
