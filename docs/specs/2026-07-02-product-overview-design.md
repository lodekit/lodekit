# Lodekit Product Overview — Design

**Date:** 2026-07-02
**Status:** Draft, pending review
**Role:** The umbrella spec. Unlike the dated slice-specs it sits above them: it fixes the
component map, the cohesion invariants, and the v1 line from which subsequent sessions derive
lower-level slice-specs (spec → plan → build, one slice at a time).
**Language:** Canonical terms are fixed in `context.md`. This spec uses them without
redefining them.

## 1. Product statement & the loop

Lodekit is a single, local, self-hosted runtime on which a person — working with an AI coding
agent — builds and runs their own personal web tools. It is agent-agnostic: any agent that can
load the skill and speak MCP can drive it.

The product is one loop, and every component exists to serve a step of it:

1. **Install.** The person downloads the **desktop app** — the canonical distribution. It
   provisions Node, starts the **runtime**, registers the **MCP server**, and opens the
   **dashboard**.
2. **Build.** The person asks their **agent** for a tool. The agent loads the **skill**,
   drives Lodekit through the **MCP server** (scaffold, inspect, open), and writes app code on
   the **stack**: React + TypeScript on the shared toolchain, importing the **SDK** for data
   and the **UI library** for consistent design, conforming to the **app contract**.
3. **Run.** The runtime watches the apps tree, builds changed apps through the shared
   toolchain, and serves them. The person uses their tools in the browser.
4. **Observe.** The person checks the **dashboard**: every app's build state and health, its
   **settings**, its raw **data** (database + store), and — once shipped — its **jobs**.
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

- **Boundary:** everything server-side is the runtime. No second process, no per-app servers.
- **Contract:** HTTP is the only way in — the SDK, the MCP server, the dashboard, and the
  desktop app all reach it over HTTP (+ SSE). Nothing imports runtime internals.
- **Today:** host + build + watch + scoped API (`db`, `store`) + SSE + dashboard serving all
  shipped. Settings, jobs, secrets, blobs, and the dev/default path-mode switch are not built.

### 2.2 Storage — shipped core, grows inside the runtime

Per-app persistence in the data tree, namespaced by slug: the **database** (SQLite via
`better-sqlite3`) and the **store** (KV of JSON values). Exposed only through the scoped API;
apps reach it only through the SDK.

- **Invariant:** backup tree = apps tree + data tree; the cache lives outside it and is
  disposable.
- **Today:** database + store shipped. Designed-in, not built: blobs, encrypted secrets,
  schemas/migrations, cache-with-TTL, data fixtures.

### 2.3 SDK (`@lodekit/sdk`) — shipped minimal

The typed client an app imports to reach its own scoped API. Buildless raw TypeScript,
bundled into each app by the shared toolchain; types flow from source. The SDK is the *only*
sanctioned way app code touches Lodekit — every new app-facing capability (settings, later
jobs/secrets/blobs) lands as an SDK surface backed by a scoped-API endpoint.

- **Today:** `db.query`/`db.exec`, `store.get`/`store.set`. Settings access is the next
  surface. Transport stays a hand-written HTTP facade (tRPC/Zod reconsideration is parked
  until a procedure surface exists to justify it).

### 2.4 UI library (`@lodekit/ui`) — unbuilt, v1-required

The themed component library: shadcn components carrying one shared theme, resolved into apps
via the same alias mechanism as `react` and the SDK. One theme imported everywhere is what
makes ten agent-built tools look like one product instead of ten codepens.

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
- **Today:** bundled contract + toolchain shipped. Missing: the UI-library import, settings
  declaration, business-logic folder conventions, per-app
  type-checking (transpile-only today), multi-page routing (TanStack Router, deferred). The
  settings declaration's shape is open question §5.4.

### 2.6 MCP server (`@lodekit/mcp`) — shipped basic

The agent-facing surface. A thin stdio MCP process that reaches the runtime over HTTP only —
no import-time dependency on the runtime, so it stays startable even when the runtime is down
(and can say so usefully).

- **Contract:** tools mirror what a building agent needs: scaffold, list apps, inspect an
  app (manifest, build state, last build error), open (URLs for app + dashboard). It is a
  *driving* surface, not a data surface — app data flows through the SDK inside the app, not
  through MCP.
- **Today:** basic tools shipped against the old contract-era expectations. v1 needs:
  alignment with the bundled contract, build-state/error inspection (the agent's feedback
  loop for "did my edit build?"), and migration off the deprecated `server.tool()` API.

### 2.7 Skill (`@lodekit/skill`) — shipped placeholder, v1-rewrite

The instruction pack an agent loads to build on Lodekit: the app contract, the stack and its
guardrails, how to use the MCP server and the SDK/UI library, and the edit → build-state →
verify loop. Strictly agent-neutral content — no assumptions about which agent is reading it.

- **Contract:** the skill is the single source of "how to build here" for agents; docs are
  its human-facing sibling (overlapping content, disjoint audiences — see `context.md`).
- **Today:** package exists as content-only placeholder. v1 is a rewrite against the bundled
  contract + SDK + UI library, which is why it sits late in the derivation order.

### 2.8 Dashboard — shipped basic, v1-expansion

Lodekit's built-in web UI, served by the runtime. The person's window into their instance.

- **v1 surface:** the app grid with live build state (shipped); per-app detail with health
  (build state history / last error), a **settings** editor, and a **data explorer** for
  browsing the raw database (tables, rows, read-only query) and store keys. A **jobs** panel
  joins when jobs ship (post-v1, §4.1).
- **Contract:** driven entirely by the runtime's HTTP + SSE surfaces; themed with
  `@lodekit/ui` so the product and its apps share one design.
- **Today:** grid + build state over SSE shipped. Detail view, settings editor, data explorer
  unbuilt.

### 2.9 Desktop app (`@lodekit/desktop`) — dev shell today, THE download at v1

The canonical distribution. An Electron shell that: provisions Node (find system Node, else
download one local to Lodekit — never touching the user's system), spawns the runtime as a
child Node process (keeping `better-sqlite3` off Electron's ABI), supervises its lifecycle
(start/stop, autostart at login, clean child-tree shutdown), registers the MCP server with
the person's agent(s), and opens a window on the dashboard.

- **Contract:** the desktop app owns install/lifecycle and nothing else — it contains no
  product logic; everything it shows is the dashboard.
- **Today:** dev shell only (requires system Node + pnpm, spawn not cross-platform, no
  packaging/signing/updates). v1 is the packaged, signed, installable app.

### 2.10 Landing site (`web`, `@lodekit/web`) — placeholder, v1-deploy

The public marketing site at lodekit.com (domain secured). Sells the loop in end-user
language ("build your own tools" — _tools_, not _apps_, per `context.md`), links the download
and the docs.

- **Today:** Astro placeholder, undeployed. v1 is a real page + deploy.

### 2.11 Docs — unbuilt, v1-minimal

The public documentation site for people, living alongside the landing site (Starlight inside
`web`, sharing its tooling and deploy). v1 is deliberately small: install, build your first
tool (through your agent), concepts (the loop, the backup tree, the dashboard), and per-agent
MCP/skill setup guides. Agent-facing depth stays in the skill.

### 2.12 Jobs — designed-in, post-v1

Background work an app registers for the runtime to run on its behalf; scheduled jobs first.
This is the first capability that puts *app-defined code on the server side of the contract*
— where job code lives in the app folder, how the runtime loads and sandboxes it, what SDK
surface it sees, and how schedule + last-run state reach the dashboard. That contract change
is why jobs are a designed-in component here but sit past the v1 line (§4.1): the spec that
introduces them must extend the app contract, the SDK, the skill, and the dashboard together.

## 3. Cohesion invariants

The cross-cutting rules that make eleven components one product. Slice-specs may not violate
these without amending this spec first.

1. **One shared instance.** One runtime hosts every app. Never one process per app.
2. **The person never builds.** No dev servers, no terminal commands, no per-app
   dependencies. Lodekit drives the build chain programmatically (Vite JS API), and the
   desktop app provisions Node itself.
3. **The backup tree is sacred.** Apps tree + data tree hold everything worth keeping; both
   stay dependency-free and human-readable. The cache is disposable and lives outside.
4. **HTTP is the runtime's only door.** SDK, MCP server, dashboard, and desktop app all
   speak HTTP(+SSE) to the runtime. No cross-package imports of runtime internals.
5. **The SDK is the only app-facing surface.** New capabilities reach apps as typed SDK
   methods backed by scoped-API endpoints — never as globals, and never scoped wider than the
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
   skill; _Tool_ only in end-user copy.

## 4. The v1 line

v1 is the first version a stranger can download and complete the loop with, unassisted.

### 4.1 Per component

| Component | In v1 | Designed-in, post-v1 |
| --- | --- | --- |
| Runtime | Current core + settings registration/storage + endpoints for dashboard detail (health, data explorer) + dev/default path modes | Jobs scheduler, blobs, secrets, migrations, cache GC |
| Storage | Database + store (shipped) | Blobs, secrets, schemas/migrations, fixtures |
| SDK | `db`, `store`, `settings` (read) | `jobs`, `secrets`, `blobs`; tRPC/Zod transport revisit |
| UI library | Themed shadcn core set (layout, forms, button, table, dialog…) via alias | Charts, data-table, rich-text, media components |
| Stack / contract | Bundled contract + UI-library import + settings declaration | Server-side job code, multi-page routing, type-check gating, logic-folder conventions |
| MCP server | Contract-aligned tools incl. build-state/error inspection; `registerTool` migration | Data/introspection tools beyond the building loop |
| Skill | Full agent-neutral rewrite against v1 stack | Jobs guidance, advanced patterns |
| Dashboard | Grid + build state (shipped) + app detail: health, settings editor, data explorer | Jobs panel, secrets UI, log viewer |
| Desktop app | Packaged/signed installer, Node provisioning, runtime lifecycle + autostart, MCP registration, dashboard window | Auto-update channel, tray niceties |
| Landing site | Real page deployed to lodekit.com | — |
| Docs | Starlight: install, first tool, concepts, per-agent setup | Full reference, cookbook |
| Jobs | — (component designed, contract sketched in its own spec) | Scheduler + server-side contract + dashboard panel as v1.x headline |

### 4.2 Derivation order

Each line becomes its own slice-spec → plan → build cycle; the order minimizes rework
(everything the skill teaches must exist before the skill is rewritten; everything the
desktop app ships must work before it's packaged):

1. **`@lodekit/ui`** — theme + core components + alias into the toolchain + dashboard
   adoption.
2. **Settings** — declaration in the contract, runtime storage, SDK surface, dashboard
   editor.
3. **Dashboard v1** — app detail: health, data explorer (reads the settings + runtime
   endpoints from 1–2).
4. **MCP + skill v1** — contract-aligned tools, build-state feedback loop, full skill
   rewrite. (Depends on 1–3 being true so the skill teaches reality.)
5. **Desktop v1** — packaging, Node provisioning, lifecycle, MCP registration, path-mode
   switch.
6. **Web v1** — landing page + minimal docs, deployed.
7. **(post-v1) Jobs** — server-side contract + scheduler + dashboard panel.

Roadmap hygiene items (cache GC, browser-level smoke test, rendering hardening, OSS hygiene)
attach to whichever slice touches their surface; `roadmap.md` remains the ledger for anything
not scheduled here.

## 5. Open questions

Unsettled points slice-spec sessions must resolve (or escalate) rather than assume:

1. **Jobs timing & contract** *(assumed post-v1 in this draft — confirm)*: does v1 really
   ship without automation, and when jobs come, what is the server-side app-code shape
   (module in the app folder? sandboxing? SDK access from job context)?
2. **MCP registration mechanics** — "the desktop app registers the MCP server" differs per
   agent (config file locations, formats). Which agents get first-class automatic
   registration vs. a copy-paste snippet in docs?
3. **Skill distribution** — how does a non-Claude agent actually load `@lodekit/skill`?
   (Served by the runtime over HTTP? Installed to known per-agent locations by the desktop
   app? Both?)
4. **Settings shape** — declared in the manifest vs. a separate file vs. registered via SDK
   at runtime; typing and validation story.
5. **Data explorer write access** — read-only browsing vs. letting the person edit rows/keys
   (data-loss guardrails if writable).
6. **Node provisioning default** — prefer system Node when compatible, or always use the
   Lodekit-local Node for reproducibility?
7. **Update story** — is auto-update in scope for the desktop app shortly after v1, and what
   updates with it (runtime? toolchain? UI theme — which changes how existing apps look)?
8. **Secrets before integrations?** — apps calling external APIs need secrets earlier than
   the integrations subsystem; does a minimal secrets surface deserve a v1.x fast-track?
