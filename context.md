# Lodekit

Lodekit is a product with which a person — working with an AI agent in whatever form they use it: a desktop app, an IDE, a terminal — builds and runs their own personal web apps, locally on their machine. This glossary fixes the ubiquitous language of that domain: where a term has a canonical form, prefer it and avoid the listed alternatives.

## Language

### Product & platform

**Lodekit**:
The product — the complete experience, from the landing site and docs to the platform running on the person's machine. One shared instance per machine, never one per app.
_Avoid_: the server, the platform (that's the installed subset), the site

**Platform**:
The shippable collection installed on the person's machine: runtime, SDK, UI library, dashboard, and manager. What downloading Lodekit puts on disk.
_Avoid_: the product (that's Lodekit, which is more), the install, the stack (the stack is how app code is written)

**Runtime**:
The single Node process at the heart of the platform — it hosts, builds, watches, and serves apps, the dashboard, and the API. Referred to in code as `@lodekit/runtime`.
_Avoid_: server, backend, daemon

**Manager**:
The thin menubar app (`@lodekit/manager`) that ships and supervises the platform: it provisions a Lodekit-local Node (pinned version, never the system's), runs the runtime as a child process, and offers status indication, "open dashboard", and quit from the menu bar. It has no product UI of its own — everything it shows is the dashboard, opened in the browser.
_Avoid_: desktop app, shell, controller, tray app, the Electron app (implementation detail)

**Dashboard**:
Lodekit's built-in web UI: every app with its live build state and health, plus each app's settings, raw data, and scheduled tasks.
_Avoid_: home page, admin, console

**Landing site**:
The public marketing site at lodekit.com (`@lodekit/web-main`).
_Avoid_: the website, homepage

**Docs**:
The public documentation site for people at docs.lodekit.com (`@lodekit/web-docs`), living alongside the landing site. Distinct from the Skill — see Flagged ambiguities.
_Avoid_: wiki, manual

### Agent surface

**Agent**:
The AI assistant the person builds through, in whatever form they use it — a desktop app (Claude, Codex), an IDE, or a terminal coding agent. Lodekit is agent-agnostic: any agent that can load the skill and speak MCP can drive it.
_Avoid_: Claude (as the generic word), LLM, assistant, AI

**MCP server**:
The agent-facing surface (`@lodekit/mcp`) through which an agent drives Lodekit — scaffold, list, open, inspect — and reads an app's services on the person's behalf ("show me all my recipes"). Read-only for now; writes come later, behind designed guardrails. Reaches the runtime over HTTP only.
_Avoid_: the integration, the bridge

**Skill**:
The instruction pack (`@lodekit/skill`) an agent loads to learn how to build on Lodekit: the app contract, the stack, and how to use the MCP server and SDK.
_Avoid_: the prompt, system prompt, docs (docs are human-facing)

### Apps

**App**:
A self-contained personal web app that runs on Lodekit. The canonical word — in code, docs, and marketing alike — for the thing a person builds.
_Avoid_: tool, project, site, plugin, widget

**App id**:
An app's URL-safe identity (`^[a-z0-9-]+$`). It equals the app's folder name and is simultaneously its URL path and its data namespace (`apps/<app-id>/`, `data/<app-id>/`). Normative forms: `appId` in code and JSON fields, `:appId` in route params, "app id" in prose. The toolchain injects it into each app's bundle as the canonical define `__LODEKIT_APP_ID__`.
_Avoid_: slug (the retired name), id, key, handle

**Manifest**:
The `manifest.json` at an app's root declaring its name, app id, icon, and description. The record that makes a folder an app.
_Avoid_: config, metadata, lodekit.json (the retired filename)

**App contract**:
The required shape of an app's source: a manifest, `src/routes/` + `src/router.tsx`
(TanStack Start shape), and the build-generated, committed `routeTree.gen.ts`. No HTML
entry. What "a valid app" means.
_Avoid_: template, boilerplate, scaffold (scaffold is the act, not the shape)

**Server function**:
App-defined code that runs on the server side of the contract — a TanStack Start
`createServerFn`, callable from the app's own client; inputs validated at the trust
boundary.
_Avoid_: server code, RPC, action, endpoint

**App worker**:
The per-app worker thread inside the runtime that executes an app's built server bundle
(SSR + server functions).
_Avoid_: sandbox, per-app server, process

**Scaffold**:
To generate a new app's starter files conforming to the app contract.
_Avoid_: create, init, bootstrap, generate

**Showcase app**:
The Greenhouse app in the checked-in root (`root/apps/greenhouse`) — the SDK showcase and
permanent smoke-testing ground, shipped by the manager on first run. Definition-of-done:
new SDK/runtime capability isn't done until Greenhouse exercises it.
_Avoid_: example app, demo app, sample app

**Welcome app**:
The orientation app in the checked-in root (`root/apps/welcome`) — deliberately tiny (one
page, one `kv.incr` counter); reserved to become the guided first-time experience.
_Avoid_: FTUX app (until it is one)

### Services

**Service**:
One cloud battery — a capability the runtime provides to apps: storage, secrets, tasks, settings. Every service is provided by the runtime and reached by apps only through the SDK. Service names are normative end to end: the same word appears in marketing copy, docs, the dashboard, and the SDK's API surface.
_Avoid_: capability, feature, component (components are UI), battery (marketing metaphor, not the domain word)

**Service catalog**:
The full set of services Lodekit offers, named AWS-style: kv-store (the Store), relational-store (the Database, currently parked), file-store (Files), log-store (Logs), event-store (Events), secret-store, tasks (Tasks — one service; task-queue and task-schedule are its two capabilities), settings. The catalog grows over time; each service closes its terminology and surface in its own slice-spec.
_Avoid_: the SDK (the SDK is the layer into the catalog, not the catalog), feature list

The shipped and near-term services:

**Store**:
An app's per-app key–value store of JSON values (the kv-store service), reached through the
SDK as the `kv` handle (`import { kv } from "@lodekit/sdk"`; catalog-name → handle mapping:
kv-store→kv, relational-store→db, file-store→files, secret-store→secrets, log-store→logs, event-store→events). The first storage
service; joined by Files (file-store) in 0.x. Its second iteration shipped as the v0.1 storage
slice (`docs/specs/2026-07-03-kv-store-v2-design.md`). Distinct from the Cache and from
Settings — see Flagged ambiguities.
_Avoid_: cache, settings, preferences

**Files**:
An app's per-app blob storage (the file-store service) for documents and binary data,
reached through the SDK as the `files` handle. A file is identified by its slug; bytes
live as real, Finder-browsable files under the app's data tree, date-foldered, while
the per-app database holds the authoritative index
(`docs/specs/2026-07-06-file-store-design.md`).
_Avoid_: blobs (the retired working name), uploads, attachments, assets

**Logs**:
Per-app and platform structured log records (the log-store service), levels debug/info/
warn/error, emitted via the `logs` handle or captured from app console output, stored in
the platform State, retained 7 days / 200k records, viewable in the dashboard Logs view
and over MCP (`lodekit_logs`) (`docs/specs/2026-07-06-logging-design.md`).
_Avoid_: console, output, telemetry

**Event**:
A durable message on the platform's event bus that drives business logic: the platform announcing an app became ready, an app announcing an export finished, a task announcing a detected change. Every event is addressed (`ns` — whose stream it belongs to) and attributed (`source` — who emitted it), persisted to the event-store, and delivered live over SSE. Events are never the system of record: precious facts belong in the emitting app's own stores — the event announces and triggers (`docs/specs/2026-07-07-events-design.md`).
_Avoid_: message, signal, notification

**Events**:
The platform-wide append-only event log (the event-store service), reached through the SDK as the `events` handle (`emit`/`watch`/`list`). One sqlite log at `data/_platform/events.sqlite` (precious — in the Backup tree), monotonic row id as the offset, retained 30 days / 50k records (change-feed events 7 days), viewable in the dashboard Events view and over MCP (`lodekit_events`).
_Avoid_: message queue, broker, SSE (that's the transport)

**Internal namespace**:
An underscore-prefixed id (`_platform`, `_manager`, `_dashboard`) naming a platform citizen rather than an app. The app-id grammar has no underscore, so internal namespaces can never collide with an app id — no reserved-word list, no enforcement code. Internal namespaces are first-class in the id space, on the event bus (they emit and own streams), in the data tree (`data/_platform/` holds the bus), and as the log query sentinel (`app=_platform`). They are **not** Apps — no source folder, no contract.
_Avoid_: reserved app, system app, internal app

**Database**:
An app's per-app SQL database (relational-store). **Parked**: retired in the v0.1 storage iteration; returns to the catalog once a schemas/migrations story exists.
_Avoid_: store (the store is the KV; the two differ), sql

**Settings**:
Configuration an app declares so the person can view and edit it in the dashboard; the app reads it through the SDK. Distinct from the Store — see Flagged ambiguities.
_Avoid_: preferences, config, options

**Task**:
Background work an app hands to the runtime to run on the app's behalf — queued (task-queue) or triggered on a time schedule (task-schedule; a **scheduled task**). Declared in the app's `src/tasks.ts`; the task name is the kebab-case of its export. Each execution is a **run** (queued → running → succeeded/failed/canceled). Tasks are listed with their schedule and last-run state in the dashboard. Shipped: `docs/specs/2026-07-06-tasks-service-design.md` (v1 = queue + schedule + retries + history; hooks/signals deferred).
_Avoid_: job, cron, worker, workflow

### Storage & filesystem

**Lodekit root**:
The one directory (`LODEKIT_ROOT`) holding the sibling apps tree and data tree. The thing a person backs up.
_Avoid_: workspace, home, project directory

**Apps tree**:
The `apps/` directory under the Lodekit root — app _source_ only, carrying no dependencies.
_Avoid_: source dir, workspace

**Data tree**:
The `data/` directory under the Lodekit root — each app's persistent storage, one namespace per app id. Internal namespaces own data homes here too — data/_platform/ holds the event bus.
_Avoid_: db dir, storage

**Backup tree**:
The apps tree and data tree together: the durable state worth preserving. Explicitly excludes the cache.
_Avoid_: the project, the data

**Cache**:
Regenerable built output, kept outside the Lodekit root (`~/Library/Caches/Lodekit`, `LODEKIT_CACHE_DIR`) and never backed up. Deleting it costs only a rebuild.
_Avoid_: build dir, dist, output, storage

**State**:
Machine-local operational data the platform keeps about itself — currently the logs
database. Lives outside the Lodekit root (`~/Library/Application Support/Lodekit`,
`LODEKIT_STATE_DIR`), never backed up. Unlike the Cache it isn't regenerable; unlike
the Data tree it isn't precious — losing it costs history, never apps or data.
_Avoid_: app data (that's the Data tree), cache, logs dir

**Storage tiers** (the placement rule): place data by cost of loss — *precious* (Backup tree: the person would miss it restoring a backup), *operational history* (State: loss costs history, never apps or data), *regenerable* (Cache: loss costs a rebuild). A service never silently promotes tiers: if a record is precious to an app, the app writes the fact into its own store and an event announces it.

### Building & serving

**Bundled**:
The app contract's build model: app source is compiled into built output (static client assets plus a server bundle) that Lodekit serves. The person never runs a build themselves.
_Avoid_: compiled, production build

**Buildless**:
Code that ships as raw source and runs with no build step — true of the runtime and the SDK, never of apps.
_Avoid_: no-build, raw

**Build state**:
An app's build lifecycle: `building` → `ready` | `error`. Emitted on the event bus as one
`build-state` event type with the state in `payload.status` (type names the kind of event;
payload carries the facts — the same shape as `server-state`).
_Avoid_: status, phase, per-state event types (`building`/`ready` are payload values, not types)

**Shared toolchain**:
The one build stack (Vite + React + TypeScript + Tailwind) Lodekit installs once and shares across every app, so apps carry no dependencies of their own.
_Avoid_: per-app dependencies, node_modules per app

**Stack**:
The prescribed way app code is written: TanStack Start (React, file-based routes, loaders, server functions, SSR) + TypeScript + Tailwind through the shared toolchain, importing the SDK and the UI library, conforming to the app contract. Apps are **server-rendered**. The skill teaches the stack; agents follow its guardrails.
_Avoid_: framework, template, best practices

**SDK**:
The typed client (`@lodekit/sdk`) an app imports to reach its own scoped API — the layer into the service catalog. Works on both sides of the contract — the browser and the app worker. Replaces the old injected `window.lodekit` global.
_Avoid_: client library, api wrapper, window.lodekit

**UI library**:
The themed component library (`@lodekit/ui`) — shadcn components carrying one shared theme — that every app imports, so all apps look like one product.
_Avoid_: design system, component kit, shadcn (the upstream, not the package)

**Theme overrides**:
The person's styling surface: optional plain-CSS files redefining the UI library's
token variables — `theme.css` at the Lodekit root (global: all apps and the dashboard)
and `apps/<app-id>/theme.css` (one app, layered after the global file). Tokens are the
contract; arbitrary CSS is possible but unpromised.
_Avoid_: skins, custom CSS (the mechanism is token redefinition)

**UI catalog**:
The person-facing window onto the UI library: a statically built Storybook the runtime
serves at `/_ui/`, rendering every component under the live global theme or any app's
composed theme. Parallel to the service catalog ("what can my apps use?"). The term is
docs-only — code says `/_ui`.
_Avoid_: "catalog" in code, Storybook (as the product name — Storybook is the tool)

**Scoped API**:
The per-app HTTP API namespaced by app id (`/api/apps/:appId/...`) that backs the SDK.
_Avoid_: the endpoints, the REST API

## Relationships

- The **Manager** installs and supervises the **Runtime**. The runtime has two doors: the **MCP server** (the agent's) and the **Dashboard** (the person's).
- The person builds **Apps** using an **Agent**: the agent loads the **Skill**, drives Lodekit through the **MCP server**, and writes code on the **Stack** — the **SDK** and **UI library** on the **shared toolchain**, conforming to the **App contract**.
- An **App** is identified by its **App id**; that same app id is its URL path and its data namespace.
- Every **Service** in the **Service catalog** is provided by the **Runtime**; an app reaches its services (**Database**, **Store**, **Settings**, **Tasks**) only through the **SDK**, which calls the **Scoped API**.
- An app's **server functions** run in its **app worker** inside the **runtime**; they reach services through the **SDK** over loopback HTTP.
- An app's source lives in the **Apps tree**, its built output in the **Cache**, and its persistent state (**Database** + **Store**) in the **Data tree**.
- The **Backup tree** = apps tree + data tree. The **Cache** is deliberately outside it.
- **Settings** and **Tasks** are declared by an app and surfaced to the person in the **Dashboard**.
- The **MCP server** may read an app's services on the person's behalf (writes later, behind designed guardrails).

## Flagged ambiguities

- **Lodekit vs Platform** — Lodekit is the whole product experience; the platform is its installed subset (runtime, SDK, UI library, dashboard, manager). "Download Lodekit" installs the platform.
- **Store vs Cache** — both sound like "somewhere things are kept," but they are opposites in durability. The **Store** is per-app durable KV state (backed up, in the data tree); the **Cache** is disposable build output (never backed up). Never call the store a cache.
- **Event vs Log** — logs are telemetry (what happened, for observation); events drive business logic (what happened, for reaction). The `log` SSE tail is log-store's live surface, not an event, and never touches the bus.
- **Store vs Settings** — both hold small per-app values. **Settings** are declared by the app and edited by the person in the dashboard (the person's knobs); the **Store** is written by app code at runtime (the app's own memory). An app reads both, but only settings are meant for human hands.
- **Docs vs Skill** — both teach how to use Lodekit, to different readers. **Docs** are the public site for people; the **Skill** is the instruction pack for agents. Content may overlap; the audiences never do.
- **Skill** — `@lodekit/skill` is the Lodekit skill package (content an agent loads to use Lodekit), not to be confused with agent skills in general.
