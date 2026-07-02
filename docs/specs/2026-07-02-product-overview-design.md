# Lodekit Product Overview — Design

**Date:** 2026-07-02
**Status:** Draft, pending review
**Role:** The umbrella spec. Unlike the dated slice-specs it sits above them: it fixes the
component map, the cohesion invariants, and the v0.1 line from which subsequent sessions derive
lower-level slice-specs (spec → plan → build, one slice at a time).
**Language:** Canonical terms are fixed in `context.md`. This spec uses them without
redefining them.

## 1. Product statement & the loop

**Cloud batteries, locally, easily.**

Everything your apps need from a cloud, on the one computer you already own. Lodekit is a
home for the software you have your agent build: a real database, durable storage, scheduled
tasks, an always-on runtime — installed as one thing, wrapped in guardrails that keep
agent-written code safe. No accounts, no subscriptions, nobody else's computer. Your apps and
your data are files in a folder you own — back it up and it's yours forever.

Positioning behind the statement: written for **non-devs and tinkerers**; positioned
**against the cloud** (keep the batteries, drop the accounts, subscriptions, and
someone-else's-computer); **local is the point** — ownership — not merely the means; the
robustness claimed is all three of durable, reliable, and safe.

In the language of `context.md`: a person — working with an AI agent in whatever form they
use it: a desktop app, an IDE, a terminal — builds and runs their own personal web apps on
Lodekit, locally. It is agent-agnostic: any agent that can load the skill and speak MCP can
drive it. The **platform** is the installed subset: runtime, SDK, UI library, dashboard, and
manager (§2.1–2.9); the landing site, docs, skill, and MCP server complete the product around
it.

The product is one loop, and every component exists to serve a step of it:

1. **Install.** The person downloads Lodekit — the **manager**, the canonical distribution.
   It provisions Node, starts the **runtime**, registers the **MCP server**, and sits in the
   menu bar with status and a door to the **dashboard**.
2. **Build.** The person asks their **agent** for an app. The agent loads the **skill**,
   drives Lodekit through the **MCP server** (scaffold, inspect, open), and writes app code on
   the **stack**: React + TypeScript on the shared toolchain, importing the **SDK** for data
   and the **UI library** for consistent design, conforming to the **app contract**.
3. **Run.** The runtime watches the apps tree, builds changed apps through the shared
   toolchain, and serves them. The person uses their apps in the browser.
4. **Observe.** The person checks the **dashboard**: every app's build state and health, its
   **settings**, its raw **data** (database + store), and — once shipped — its **tasks**.
5. **Learn.** The **landing site** sells the loop to newcomers; the **docs** teach people how
   to run it; the **skill** teaches agents how to build in it.

A component that doesn't serve a step of this loop doesn't belong in the product.

## 2. Component map

Each component: what it is, its boundary, its contract with neighbors, and where it stands
today. Package names are workspace members unless noted.

### 2.1 Runtime (`@lodekit/runtime`) — shipped core

The single Node process that _is_ Lodekit. It owns: the app registry (scanning the apps tree
for manifests), the build pipeline (Vite JS API → cache), the watcher (debounced per-app
rebuilds), the scoped API, storage, SSE (build state + registry changes), and serving (apps
from the cache, the dashboard, the API). Buildless — runs from source via `tsx`.

- **Boundary:** everything server-side is the runtime. No second process, no per-app
  servers. As the service catalog grows (§2.2), the runtime owns every service in it —
  tasks, secrets, settings, file storage all run inside this one process.
- **Contract:** HTTP is the only way in — the SDK, the MCP server, the dashboard, and the
  manager all reach it over HTTP (+ SSE). Nothing imports runtime internals.
- **Today:** host + build + watch + scoped API (`db`, `store`) + SSE + dashboard serving all
  shipped. The unshipped services (§2.2) and the dev/default path-mode switch are not built.

### 2.2 Service catalog — two services shipped, grows inside the runtime

The cloud batteries themselves. A **service** is one capability the runtime provides to
apps; the **catalog** is the full set, named AWS-style, with per-app namespacing by slug and
persistence in the data tree where applicable:

| Service | Domain word | Status |
| --- | --- | --- |
| kv-store | Store (per-app KV of JSON values) | Shipped; second iteration (name, API, ergonomics) in v0.1 |
| relational-store | Database (SQLite via `better-sqlite3`) | Shipped in the POC; **parked** in the v0.1 storage iteration — returns once a schemas/migrations story exists |
| file-store | Blobs (files/images per app) | Future |
| secret-store | Secrets (encrypted; designed with the lens of powering integrations) | Future |
| task-queue / task-schedule | Tasks (queued + scheduled background work) | Future (§2.12) |
| settings | Settings (declared, person-editable in the dashboard) | Future |

- **Invariant:** every service is provided by the runtime, reached by apps only through the
  SDK, and scoped to the app's slug. Backup tree = apps tree + data tree; the cache lives
  outside it and is disposable.
- **Contract:** service names are normative end to end (marketing → docs → dashboard → SDK
  API). Each service closes its own naming and surface in its slice-spec — including
  revisiting today's `db`/`store` handles in the storage iteration.
- **In code:** each service becomes a module under `packages/runtime/src/services/`, mounted
  on the scoped API, with a matching SDK surface. The convention lands with the v0.1 storage
  iteration (today `db.ts` holds both shipped services); no preemptive restructure before
  then.

### 2.3 SDK (`@lodekit/sdk`) — shipped minimal

The typed client an app imports to reach its own scoped API — the layer into the service
catalog. Buildless raw TypeScript, bundled into each app by the shared toolchain; types flow
from source. The SDK is the *only* sanctioned way app code touches Lodekit — every service
lands as an SDK surface backed by a scoped-API endpoint.

- **Today:** `db.query`/`db.exec`, `store.get`/`store.set`. Transport stays a hand-written
  HTTP facade (tRPC/Zod reconsideration is parked until a procedure surface exists to
  justify it). The v0.1 storage iteration retires the `db` surface (relational-store parked)
  and re-derives the KV surface's name, API, and ergonomics; every later service closes its
  SDK-facing names the same way, in its own slice-spec.

### 2.4 UI library (`@lodekit/ui`) — unbuilt, v0.1-required

The themed component library: shadcn components carrying one shared theme, resolved into apps
via the same alias mechanism as `react` and the SDK. One theme imported everywhere is what
makes ten agent-built apps look like one product instead of ten codepens.

- **Contract:** apps import components (`import { Button } from "@lodekit/ui"`); the skill
  mandates using it; the dashboard uses the same theme so Lodekit itself looks like its apps.
- **Today:** nothing built. First unbuilt component on the derivation order (§4.2), because
  the skill and the scaffold can't be finished without it.

### 2.5 Stack & app contract — shipped shape, unfinished surface

The stack is the prescribed way app code is written; the app contract is its on-disk shape
(manifest + HTML entry + `src/` of React + TypeScript importing the SDK). The shared
toolchain (Vite + React + TypeScript + Tailwind) lives in Lodekit's install, never per-app —
apps carry no dependencies, the person never runs a build.

- **Contract:** the skill teaches the stack; the scaffold emits a conforming starter; the
  runtime refuses nothing (build errors surface as build state, not crashes).
- **Today:** bundled contract + toolchain shipped. Missing: the UI-library import,
  business-logic folder conventions, per-app type-checking (transpile-only today), multi-page
  routing (TanStack Router, deferred), and — arriving with their services — settings
  declaration and server-side task code.

### 2.6 MCP server (`@lodekit/mcp`) — shipped basic

The agent-facing surface. A thin stdio MCP process that reaches the runtime over HTTP only —
no import-time dependency on the runtime, so it stays startable even when the runtime is down
(and can say so usefully).

- **Contract:** two kinds of tools. *Driving* tools mirror what a building agent needs:
  scaffold, list apps, inspect an app (manifest, build state, last build error), open (URLs
  for app + dashboard). *Service* tools give the agent guarded access to an app's services
  on the person's behalf — "show me all the recipes in my recipe app" reads the app's data
  through MCP. **Read-only at v0.1** (scoped to one app's services, same slug namespacing as
  the SDK); write access comes later, once its guardrails are designed (roadmap: Security).
- **Today:** basic driving tools shipped against the old contract-era expectations. Needed:
  alignment with the bundled contract, build-state/error inspection (the agent's feedback
  loop for "did my edit build?"), service tools, and migration off the deprecated
  `server.tool()` API.

### 2.7 Skill (`@lodekit/skill`) — shipped placeholder, v0.1-rewrite

The instruction pack an agent loads to build on Lodekit: the app contract, the stack and its
guardrails, how to use the MCP server and the SDK/UI library, and the edit → build-state →
verify loop. Strictly agent-neutral content — no assumptions about which agent is reading it.

- **Contract:** the skill is the single source of "how to build here" for agents; docs are
  its human-facing sibling (overlapping content, disjoint audiences — see `context.md`).
- **Today:** package exists as content-only placeholder. v0.1 is a rewrite against the
  bundled contract + SDK + UI library, which is why it sits late in the derivation order. For
  v0.1 the person links the skill into their agent manually; automated distribution belongs
  to the future FTUX/onboarding work.

### 2.8 Dashboard — shipped basic, grows with the catalog

Lodekit's built-in web UI, served by the runtime. The person's window into their instance.

- **v0.1 surface:** the app grid with live build state (shipped), restyled with
  `@lodekit/ui`.
- **Future surface:** per-app detail with health (build state history / last error), a
  **data explorer** for browsing the raw database and store keys, and a panel per service as
  it ships — settings editor, tasks (schedule + last-run state), secrets.
- **Contract:** driven entirely by the runtime's HTTP + SSE surfaces; themed with
  `@lodekit/ui` so the product and its apps share one design.

### 2.9 Manager (`@lodekit/manager`) — dev shell today, THE download at v0.1

The canonical distribution: a thin menubar app. It provisions a **Lodekit-local Node** —
always its own copy (bundled inside the app at v0.1; the pre-1.0 northstar is a thin
manager that downloads and manages versioned platform artifacts), pinned to the version
Lodekit is tested against, never the system Node (so Lodekit controls Node and dependency
versioning end to end, and never touches the user's system or PATH). It spawns the runtime as a child Node process (keeping
`better-sqlite3` off Electron's ABI), supervises its lifecycle (start/stop, autostart at
login, clean child-tree shutdown), and offers status indication, "open dashboard" (in the
browser), and quit from the menu bar.

- **Contract:** the manager owns install/lifecycle and nothing else — it has no product UI of
  its own; everything it shows is the dashboard.
- **MCP registration:** manual at v0.1 (per-agent config snippets live with the skill/readme
  until the docs ship); automated registration belongs to the future FTUX/onboarding work.
- **Today:** dev shell only (requires system Node + pnpm, spawn not cross-platform, opens an
  Electron window instead of sitting in the menu bar, no packaging/signing/updates). v0.1 is
  the packaged, installable menubar app (macOS, ad-hoc signed for the assisted alpha;
  Developer ID signing/notarization later in 0.x). Slice-spec:
  `2026-07-02-manager-v0.1-design.md`.

### 2.10 Landing site (`web`, `@lodekit/web`) — placeholder, ships later in 0.x

The public marketing site at lodekit.com (domain secured). Sells the product statement (§1 —
"cloud batteries, locally, easily", in its exact words; _app_ is the one word from marketing
to SDK, per `context.md`), links the download and the docs.

- **Today:** Astro placeholder, undeployed. Ships after v0.1, with the push toward the
  unassisted loop (the assisted alpha doesn't need it).

### 2.11 Docs — unbuilt, ships later in 0.x

The public documentation site for people, living alongside the landing site (Starlight inside
`web`, sharing its tooling and deploy). The first cut is deliberately small: install, build
your first app (through your agent), concepts (the loop, the backup tree, the dashboard), and
per-agent MCP/skill setup guides (the manual registration/linking snippets, which live with
the skill/readme until then). Agent-facing depth stays in the skill.

### 2.12 Tasks — a future service, noted here, not yet specced

Background work an app hands to the runtime: **task-queue** (queued work) and
**task-schedule** (scheduled tasks). A step-level change to the service catalog — the first
capability that puts *app-defined code on the server side of the contract* — so it must be
designed holistically: queueing, scheduling, hooks, signals; where task code lives in the app
folder, how the runtime loads and sandboxes it, what SDK surface it sees, and how schedule +
last-run state reach the dashboard. The spec that introduces tasks must extend the app
contract, the SDK, the skill, and the dashboard together. For now this section only records
that the service exists and is coming; no spec until we get there.

## 3. Cohesion invariants

The cross-cutting rules that make eleven components one product. Slice-specs may not violate
these without amending this spec first.

1. **One shared instance.** One runtime hosts every app. Never one process per app.
2. **The person never builds.** No dev servers, no terminal commands, no per-app
   dependencies. Lodekit drives the build chain programmatically (Vite JS API), and the
   manager provisions its own pinned Lodekit-local Node — never the system's.
3. **The backup tree is sacred.** Apps tree + data tree hold everything worth keeping; both
   stay dependency-free and human-readable. The cache is disposable and lives outside.
4. **HTTP is the runtime's only door.** SDK, MCP server, dashboard, and manager all
   speak HTTP(+SSE) to the runtime. No cross-package imports of runtime internals. Why HTTP:
   apps live in the browser, so HTTP is mandatory for the SDK regardless; routing every other
   client through the same door keeps one uniform, testable, guardable surface (alternatives
   — in-process imports, unix sockets, WebSocket, IPC — each serve only a subset of clients
   and would fragment where guardrails live).
5. **The SDK is the only app-facing surface.** Every service reaches apps as a typed SDK
   surface backed by scoped-API endpoints — never as globals, and never scoped wider than the
   app's own slug.
6. **Agent-agnostic by construction.** The only agent coupling is MCP + the skill, both open
   standards/plain content. No component may depend on a specific agent; agent-specific
   material is limited to per-agent setup guides in the docs.
7. **One theme everywhere.** Apps and the dashboard draw from `@lodekit/ui`, so everything
   running on Lodekit looks like one product.
8. **Failures surface, never crash.** A broken app is a build state and an explanatory page,
   not a down runtime. Trust-boundary validation (slug pattern, path containment) holds at
   every surface.
9. **One language.** `context.md` is normative: canonical terms in code, specs, docs, and
   skill — one word per concept from marketing copy down to SDK API names (_app_, _task_,
   _store_ — never _tool_, _job_, _cache_ for those concepts).

## 4. The v0.1 line (alpha)

The next milestone is **v0.1 — entering alpha**: a version where a person can complete the
loop **assisted** (we help them install, register the MCP manually, link the skill). The
unassisted-stranger bar comes later in 0.x. v0.1 is deliberately not a stability promise:
throughout 0.x the service catalog and components keep growing and the contracts (app
contract, SDK surface, service shapes) are expected to change heavily. v1.0 comes only when
those contracts stabilize; this spec's job is to organize the domains early with big-picture
knowledge, not to fix a concrete v1.0 target.

### 4.1 Per component

| Component | In v0.1 | Later in 0.x |
| --- | --- | --- |
| Runtime | Current core + dev/default path modes + `services/` module convention | One service at a time from the catalog; migrations; cache GC |
| Service catalog | kv-store second iteration (name, API, ergonomics revisited); relational-store parked | file-store, secret-store, task-queue/task-schedule, settings; relational-store's return — each its own slice-spec |
| SDK | The re-derived KV surface (`db` retired with relational-store) | One typed surface per new service; tRPC/Zod transport revisit |
| UI library | Themed shadcn core set (layout, forms, button, table, dialog…) via alias | Charts, data-table, rich-text, media components |
| Stack / contract | Bundled contract + UI-library import | Settings declaration, server-side task code, multi-page routing, type-check gating, logic-folder conventions |
| MCP server | Contract-aligned driving tools incl. build-state/error inspection; read-only service tools; `registerTool` migration | Write access behind designed guardrails; service tools tracking the catalog |
| Skill | Full agent-neutral rewrite against the v0.1 stack; manual linking | Guidance per new service; automated distribution (FTUX) |
| Dashboard | Grid + build state (shipped), restyled with `@lodekit/ui` | App detail/health, data explorer, per-service panels (settings, tasks, secrets) |
| Manager | Packaged menubar app (macOS, ad-hoc signed), bundled Lodekit-local Node (pinned), runtime lifecycle + autostart, status + open-dashboard + quit; manual MCP registration via docs | FTUX/onboarding (auto MCP registration, skill linking), auto-update + managed platform artifacts, Developer ID signing, Windows/Linux |
| Landing site | — | Real page deployed to lodekit.com, with the unassisted-loop push |
| Docs | — (assisted alpha: setup snippets live with the skill/readme) | Starlight: install, first app, concepts, per-agent setup; full reference |
| Tasks | — (recorded as a future service, §2.12; no spec yet) | Holistic design: queueing, scheduling, hooks, signals |

### 4.2 Derivation order

Four slices; each becomes its own slice-spec → plan → build cycle. The order minimizes
rework — everything the skill teaches must exist before the skill is rewritten; the manager
packages last, once what it ships works:

1. **`@lodekit/ui`** — theme + core components + alias into the toolchain + dashboard
   restyle.
2. **Storage iteration (kv-store v2)** — revisit name/API/ergonomics, park relational-store,
   migrate the example apps, introduce `services/` in the runtime, matching SDK surface.
   (1 and 2 are independent — order between them is convenience.)
3. **MCP + skill v0.1** — contract-aligned driving tools, build-state feedback loop,
   read-only service tools, full skill rewrite. (Depends on 1–2 so the skill teaches
   reality.)
4. **Manager v0.1** — packaging, Lodekit-local Node, lifecycle, path-mode switch,
   manual-registration snippets.

After v0.1, the 0.x series proceeds service by service from the catalog (§2.2), each with
its own slice-spec, plus the web/docs push toward the unassisted loop. Roadmap hygiene items
(cache GC, browser-level smoke test, rendering hardening, OSS hygiene) attach to whichever
slice touches their surface; `roadmap.md` remains the ledger for anything not scheduled
here.

## 5. Open questions

None currently. The last two were resolved into `roadmap.md`: MCP write-access guardrails
and local door hardening live under its **Security** section (to be designed together as one
body of work, deferred); relational-store's return (the schemas/migrations story) is its own
roadmap entry, iterated after v0.1 ships. New unsettled points raised by slice-spec sessions
land here.
