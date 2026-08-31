# Definitions

With Lodekit, a person working with an AI agent — a desktop app, an IDE, or a terminal
coding agent — builds and runs their own personal web apps locally on their machine.
This glossary defines the domain language. Where a term has a canonical form, use it
and avoid the listed alternatives.

## Terms

### Product & platform

**Lodekit**:
The product: the complete experience, from the landing site and docs to the platform
running on the person's machine. One shared instance per machine, never one per app.
_Avoid_: the server, the platform (that's the installed subset), the site

**Platform**:
All Lodekit components together: the engine, the services, the SDK and UI library,
internal apps (dashboard; manager), and the person's apps. A collection, not an actor:
the platform owns nothing and emits nothing; its members do.
_Avoid_: the platform as an emitter/owner (`_platform`), the product (that's Lodekit)

**Engine**:
The single Node process at the center of the platform. It hosts, builds, watches, and
serves apps, the dashboard, and the API. Use this name everywhere: docs, dashboard,
code.
_Avoid_: runtime (retired), server, backend, daemon

**Manager**:
The thin menubar app (`@lodekit/manager`) that ships and supervises the platform. It
provisions a Lodekit-local Node (pinned version, never the system's), runs the engine
as a child process, and offers status, "open dashboard", and quit from the menu bar.
It has no product UI of its own; everything it shows is the dashboard, opened in the
browser.
_Avoid_: desktop app, shell, controller, tray app, the Electron app (implementation
detail)

**Dashboard**:
Lodekit's built-in web UI: every app with its live build state and health, plus each
app's settings, raw data, and scheduled tasks.
_Avoid_: home page, admin, console

**Landing site**:
The public marketing site at lodekit.com (`@lodekit/web-main`).
_Avoid_: the website, homepage

**Docs**:
The public documentation site for people at docs.lodekit.com (`@lodekit/web-docs`),
living alongside the landing site. Distinct from the Skill — see Ambiguities.
_Avoid_: wiki, manual

### Agent surface

**Agent**:
The AI assistant the person builds with, in whatever form they use it: a desktop app
(Claude, Codex), an IDE, or a terminal coding agent. Lodekit is agent-agnostic: any
agent that can load the skill and speak MCP can drive it.
_Avoid_: Claude (as the generic word), LLM, assistant, AI

**MCP server**:
The agent-facing surface (`@lodekit/mcp`). Through it an agent drives Lodekit
(scaffold, list, open, inspect) and reads an app's services on the person's behalf
("show me all my recipes"). Read-only for now; writes come later, behind designed
guardrails. It reaches the engine over HTTP only.
_Avoid_: the integration, the bridge

**Skill**:
The instruction pack (`@lodekit/skill`) an agent loads to learn how to build on
Lodekit: the app contract, the stack, and how to use the MCP server and SDK.
_Avoid_: the prompt, system prompt, docs (docs are human-facing)

### Apps

**App**:
A self-contained personal web app that runs on Lodekit. The canonical word, in code,
docs, and marketing alike, for the thing a person builds.
_Avoid_: tool, project, site, plugin, widget

**App id**:
An app's URL-safe identity (`^[a-z0-9-]+$`). It equals the app's folder name and is
both its URL path and its data namespace (`apps/<app-id>/`, `data/<app-id>/`).
Normative forms: `appId` in code and JSON fields, `:appId` in route params, "app id"
in prose. The toolchain injects it into each app's bundle as the
`__LODEKIT_APP_ID__` define.
_Avoid_: slug (the retired name), id, key, handle

**Manifest**:
The `manifest.json` at an app's root declaring its name, app id, icon, and
description. This file is what makes a folder an app.
_Avoid_: config, metadata, lodekit.json (the retired filename)

**App contract**:
The required shape of an app's source: a manifest, `src/routes/` + `src/router.tsx`
(TanStack Start shape), and the build-generated, committed `routeTree.gen.ts`. No
HTML entry. This is what "a valid app" means.
_Avoid_: template, boilerplate, scaffold (scaffold is the act, not the shape)

**Server function**:
App-defined code that runs on the server side of the contract: a TanStack Start
`createServerFn`, callable from the app's own client, with inputs validated at the
trust boundary.
_Avoid_: server code, RPC, action, endpoint

**App worker**:
The per-app worker thread inside the engine that runs an app's built server bundle
(SSR + server functions).
_Avoid_: sandbox, per-app server, process

**Scaffold**:
To generate a new app's starter files conforming to the app contract.
_Avoid_: create, init, bootstrap, generate

**Showcase app**:
The Greenhouse app in the checked-in root (`root/apps/greenhouse`): the SDK showcase
and permanent smoke-testing ground, shipped by the manager on first run. Part of the
Definition of Done: a new SDK/engine capability is not done until Greenhouse
exercises it.
_Avoid_: example app, demo app, sample app

**Welcome app**:
The orientation app in the checked-in root (`root/apps/welcome`). Deliberately tiny
(one page, one `kv.incr` counter); reserved to become the guided first-time
experience.
_Avoid_: FTUX app (until it is one)

### Services

**Service**:
A capability the engine provides to apps: storage, secrets, tasks, settings. Every
service is provided by the engine and reached by apps only through the SDK. Service
names are normative end to end: the same word appears in marketing copy, docs, the
dashboard, and the SDK's API surface.
_Avoid_: capability, feature, component (UI widgets and the event-attribution field
own that word — see Component), battery (marketing metaphor, not the domain word)

**Service catalog**:
The full set of services Lodekit offers, named AWS-style: kv-store (the Key-Value
Data Store), db-store (the Relational Data Store), file-store (the File Store),
log-store (the Log Store), event-store (the Event Store), secret-store (the Secret
Store), tasks (Tasks — one service; task-queue and task-schedule are its two
capabilities), settings, gateways (Gateways). The catalog grows over time; each
service settles its terminology and surface in its own slice-spec.
_Avoid_: the SDK (the SDK is the layer into the catalog, not the catalog), feature
list

The shipped and near-term services:

**Key-Value Data Store**:
An app's per-app key-value store of JSON values (the kv-store service), reached
through the SDK as the `kv` handle. App memory: counters, cursors, preferences,
caches, flags — small values the app writes about itself at runtime. Domain records
belong in the db-store; see the decision rule there. Distinct from the Cache and
from Settings — see Ambiguities.
_Avoid_: KV (the retired title), the Store (retired name), cache, settings,
preferences

**File Store**:
An app's per-app blob storage (the file-store service) for documents and binary
data, reached through the SDK as the `files` handle. A file is identified by its
slug. Bytes live as real, Finder-browsable files under the app's data tree, in date
folders; the per-app database holds the authoritative index.
_Avoid_: Files (the retired title), blobs (the retired working name), uploads,
attachments, assets

**Log Store**:
Per-app and platform structured log records (the log-store service), levels
debug/info/warn/error. Emitted via the `logs` handle or captured from app console
output, stored in the platform State, retained 7 days / 200k records, viewable in
the dashboard Logs view and over MCP (`lodekit_logs`).
_Avoid_: Logs (the retired title), console, output, telemetry

**Event**:
A durable message on the platform's event bus that drives business logic: the engine
announcing an app became ready, an app announcing an export finished, a task
announcing a detected change. Every event is addressed (`app`: whose stream it
belongs to) and attributed (`kind` + `component`: what class of platform member
emitted it, and which instance), persisted to the event-store, and delivered live
over SSE. Events are never the system of record: precious facts belong in the
emitting app's own stores. The event announces and triggers.
_Avoid_: message, signal, notification

**Event Store**:
The platform-wide append-only event log (the event-store service), reached through
the SDK as the `events` handle (`emit`/`watch`/`list`). One sqlite log at
`data/_platform/events.sqlite` (precious — in the Backup tree), with the monotonic
row id as the offset. Retained 30 days / 50k records (change-feed events 7 days);
viewable in the dashboard Events view and over MCP (`lodekit_events`).
_Avoid_: Events (the retired title), message queue, broker, SSE (that's the
transport)

**Kind**:
The class of platform member an event names as its emitter: `engine`, `service`, or
`app`. Stored on every event. This classifier makes bare component names
unambiguous: an app named `tasks` can never be confused with the tasks service.
Extensible if new member classes ever emit (manager, MCP).
_Avoid_: module (means app source files), type (that's the event name), class

**Component**:
The platform member instance that emitted an event, within its kind: an engine
subsystem (`build`, `lifecycle`, `registry`), a catalog service name (`kv-store`,
`tasks`, …), or an app id. Log-store will converge on the same vocabulary
(follow-up slice).
_Avoid_: source (retired from events; log-store's `source` converges later), emitter

**Internal app**:
An app-shaped platform component shipped by the platform rather than created by the
person: the dashboard (`_dashboard`); the manager when it gets a stream. The `_`
prefix exists only to prevent collisions: the app-id grammar has no underscore, so
internal ids can never collide with a person's app named `dashboard`. UI surfaces
render the human name ("Dashboard"), never the raw id.
_Avoid_: internal namespace (retired term), reserved app, system app

**Event type**: the past-tense fact an event reports, `<subject>-<verb-ed>`
(`key-set`, `run-failed`); the subject is never dropped. The two `-ready` exceptions
(`build-ready`, `server-ready`) are deliberate: "became ready" is the fact, and the
symmetric `started` / `ready` / `failed` triple beats forcing `server-succeeded`.
Payloads carry identifiers and references only; ops and statuses belong in the type,
never the payload.

**Relational Data Store**:
An app's per-app relational database (the db-store service), reached through the SDK
as the `db` handle. Schema is declared in `src/db.ts` (drizzle tables); additive
changes are applied on save, destructive changes are gated. The default home for
domain records: anything that is an entity — has fields, has relationships, gets
listed/filtered/aggregated, would hurt to lose. The kv-store is app memory; the
db-store is the domain model. Returned to the catalog by the db-store slice.
_Avoid_: the Database (the retired title), relational-store (the retired catalog
name), the store, sql

**Settings**:
Configuration the person views and edits in the dashboard Settings page. Platform
settings are declared by the engine: General/Appearance plus every service default,
with dot-namespaced keys like `tasks.default_retries`. App settings are declared in
an app's `src/settings.ts` via `defineSettings()` (snake_case keys); the app reads
its own through the SDK (`settings` handle: read and watch, never write).
Per-app–scoped service settings can be overridden per app; resolution is app
override → platform value → declared default (the effective value). Distinct from
the kv-store — see Ambiguities.
_Avoid_: preferences, config, options

**Task**:
Background work an app hands to the engine to run on the app's behalf: queued
(task-queue) or triggered on a time schedule (task-schedule; a **scheduled task**).
Declared in the app's `src/tasks.ts`; the task name is the kebab-case of its export.
Each execution is a **run** (queued → running → succeeded/failed/canceled). A
person-facing dashboard Tasks surface is pending; runs are observable today through
events and logs.
_Avoid_: job, cron, worker, workflow

**Gateway**:
An app's managed access to one external provider (the gateways service). It is an
agent-authored declarative manifest — name, favicon, website, base URL, auth recipe,
slots, guardrail defaults — at `gateways/<provider-id>/` under the Lodekit root,
plus the engine machinery that executes its traffic (credential injection, rate
limiting, circuit breaking, per-request logging). Countable and person-facing ("the
OpenWeatherMap gateway", "3 apps use this gateway"); one gateway per provider.
Server-side app code calls through it via the SDK's `gateways` handle; credentials
never enter the app worker.
_Avoid_: proxy, connector, integration (see Ambiguities), template.

**Provider**:
The external party a gateway fronts: OpenWeatherMap, an aggregator, a local Home
Assistant. The manifest describes it; the provider id (app-id grammar) is also the
gateway's key.
_Avoid_: service (a catalog word), API (the surface, not the party).

**Connection**:
The grant of one gateway to one app. Declared in the app's `src/gateways.ts` under
an app-local **alias**, completed by the person in the dashboard: **linking** a
catalog secret to each secret slot (the secrets verb, verbatim) and **setting** each
config slot. The completed connection is the grant. Connections key on
`(appId, alias)`, so two aliases on one gateway are two accounts.
_Avoid_: instance (retired), integration config, fill (retired).

### Storage & filesystem

**Lodekit root**:
The one directory (`LODEKIT_ROOT`) holding the sibling apps, data, and gateways
trees. The thing a person backs up.
_Avoid_: workspace, home, project directory

**Apps tree**:
The `apps/` directory under the Lodekit root: app _source_ only, carrying no
dependencies.
_Avoid_: source dir, workspace

**Data tree**:
The `data/` directory under the Lodekit root: each app's persistent storage, one
namespace per app id. Platform-wide storage lives here too; `data/_platform/` holds
the event bus.
_Avoid_: db dir, storage

**Gateways tree**:
The `gateways/` directory under the Lodekit root: one folder per gateway
(`manifest.json` + favicon), sibling to `apps/` and `data/`. Part of the Backup
tree.
_Avoid_: providers dir, integrations dir

**Backup tree**:
The apps tree, data tree, and gateways tree together: the durable state worth
preserving. Explicitly excludes the cache.
_Avoid_: the project, the data

**Cache**:
Regenerable built output, kept outside the Lodekit root (`~/Library/Caches/Lodekit`,
`LODEKIT_CACHE_DIR`) and never backed up. Deleting it costs only a rebuild.
_Avoid_: build dir, dist, output, storage

**State**:
Machine-local operational data the platform keeps about itself; currently the logs
database. Lives outside the Lodekit root (`~/Library/Application Support/Lodekit`,
`LODEKIT_STATE_DIR`), never backed up. Unlike the Cache it is not regenerable;
unlike the Data tree it is not precious. Losing it costs history, never apps or
data.
_Avoid_: app data (that's the Data tree), cache, logs dir

**Storage tiers** (the placement rule): place data by cost of loss. _Precious_
(Backup tree): the person would miss it when restoring a backup. _Operational
history_ (State): loss costs history, never apps or data. _Regenerable_ (Cache):
loss costs a rebuild. A service never silently promotes tiers: if a record is
precious to an app, the app writes the fact into its own store and an event
announces it.

### Building & serving

**Bundled**:
The app contract's build model: app source is compiled into built output (static
client assets plus a server bundle) that Lodekit serves. The person never runs a
build themselves.
_Avoid_: compiled, production build

**Buildless**:
Code that ships as raw source and runs with no build step. True of the engine and
the SDK, never of apps.
_Avoid_: no-build, raw

**Build state**:
An app's build lifecycle, reported on the event bus as past-tense facts from the
engine's build component: `build-started` → `build-ready` | `build-failed`
(`{message}` on failure). The server lifecycle mirrors the triple
(`server-started` / `server-ready` / `server-failed`).
_Avoid_: status, phase, status-in-payload (the state is the type)

**Shared toolchain**:
The one build stack (Vite + React + TypeScript + Tailwind) Lodekit installs once
and shares across every app, so apps carry no dependencies of their own.
_Avoid_: per-app dependencies, node_modules per app

**Stack**:
The prescribed way app code is written: TanStack Start (React, file-based routes,
loaders, server functions, SSR) + TypeScript + Tailwind through the shared
toolchain, importing the SDK and the UI library, conforming to the app contract.
Apps are **server-rendered**. The skill teaches the stack; agents follow its
guardrails.
_Avoid_: framework, template, best practices

**SDK**:
The typed client (`@lodekit/sdk`) an app imports to reach its own scoped API; the
layer into the service catalog. Works on both sides of the contract: the browser
and the app worker. Replaces the old injected `window.lodekit` global.
_Avoid_: client library, api wrapper, window.lodekit

**UI library**:
The themed component library (`@lodekit/ui`): shadcn components carrying one shared
theme, imported by every app so all apps look like one product.
_Avoid_: design system, component kit, shadcn (the upstream, not the package)

**Shell**:
The platform chrome — the header row, the app icon rail, and the small-screen nav
sheet — rendered by the UI library's `AppShell` component. The dashboard and every
app render the same shell inside their own documents, so it wears each surface's
active theme; inside an app the header identity swaps to that app's icon and name.
Rendering it is convention (the scaffold includes it), not enforcement.
_Avoid_: navbar, sidebar (that's one region of it), app shell (in prose; `AppShell`
is the component name)

**Themes**:
The person's styling surface: self-contained theme files in `<root>/themes/`
(canonical theme format: token redefinitions the engine parses and serves live),
applied globally or per app via `themes/config.json` or the dashboard's theme
library and editor. Tokens are the contract, including the optional physics
fields (body weight, easing, the shadow scale). The vendored `shadcn` theme
(stock shadcn/ui, neutral) is the default; `lodekit` carries the Cloud Captured
identity as a selectable option. The earlier per-file override mechanism
(`theme.css` at the root / `apps/<app-id>/theme.css`) is retired; the engine
warns and ignores those files.
_Avoid_: skins, custom CSS, theme overrides (the retired mechanism)

**UI catalog** (retired):
Formerly a statically built Storybook the engine served at `/_ui/`. Removed:
`/_ui/` redirects to the dashboard's Themes page, and the theme editor's components
canvas is now the person-facing window onto the UI library.

**Scoped API**:
The per-app HTTP API namespaced by app id (`/api/apps/:appId/...`) that backs the
SDK.
_Avoid_: the endpoints, the REST API

## Relationships

- The **Manager** installs and supervises the **Engine**. The engine has two doors:
  the **MCP server** (the agent's) and the **Dashboard** (the person's).
- The person builds **Apps** using an **Agent**: the agent loads the **Skill**,
  drives Lodekit through the **MCP server**, and writes code on the **Stack** — the
  **SDK** and **UI library** on the **shared toolchain**, conforming to the **App
  contract**.
- An **App** is identified by its **App id**; that same app id is its URL path and
  its data namespace.
- Every **Service** in the **Service catalog** is provided by the **Engine**; an app
  reaches its services (**db-store**, **kv-store**, **file-store**, **settings**,
  **tasks**) only through the **SDK**, which calls the **Scoped API**.
- An app's **server functions** run in its **app worker** inside the **engine**;
  they reach services through the **SDK** over loopback HTTP.
- An **App** reaches external **Providers** only through **Gateways**; the engine
  injects secrets linked from the **secret-store** host-side, so credentials never
  enter the **app worker**.
- An app's source lives in the **Apps tree**, its built output in the **Cache**, and
  its persistent state (**db-store** + **kv-store** + **file-store**) in the **Data
  tree**.
- The **Backup tree** = apps tree + data tree + gateways tree. The **Cache** is
  deliberately outside it.
- **Settings** and **Tasks** are declared by an app; Settings are surfaced to the
  person in the **Dashboard** (a Tasks surface is pending).
- The **MCP server** may read an app's services on the person's behalf (writes
  later, behind designed guardrails).

## Ambiguities

- **Lodekit vs Platform** — Lodekit is the whole product experience; the platform is
  its installed subset (engine, SDK, UI library, dashboard, manager). "Download
  Lodekit" installs the platform.
- **kv-store vs Cache** — both sound like "somewhere things are kept," but they are
  opposites in durability. The **kv-store** is per-app durable state (backed up, in
  the data tree); the **Cache** is disposable build output (never backed up). Never
  call the kv-store a cache.
- **Event vs Log** — logs are telemetry: what happened, for observation. Events
  drive business logic: what happened, for reaction. The `log` SSE tail is
  log-store's live surface, not an event, and never touches the bus.
- **kv-store vs Settings** — both hold small per-app values. **Settings** are
  declared by the app and edited by the person in the dashboard (the person's
  knobs); the **kv-store** is written by app code at runtime (the app's own memory).
  An app reads both, but only settings are meant for human hands. Credentials are
  neither: the **secret-store** holds sensitive values the person provides,
  encrypted at rest, read only by server-side app code — never Settings, never the
  kv-store. Apps declare **slots** (`src/secrets.ts`); the person **links** a
  catalog secret to each slot in the dashboard — the link is the grant.
- **kv-store vs db-store** — both are per-app durable storage. The **db-store**
  holds domain records (entities, relationships, queries); the **kv-store** holds
  app memory (counters, cursors, preferences, caches, flags). The skill applies
  this rule by default; the person steers by exception.
- **Docs vs Skill** — both teach how to use Lodekit, to different readers. **Docs**
  are the public site for people; the **Skill** is the instruction pack for agents.
  Content may overlap; the audiences never do.
- **Skill** — `@lodekit/skill` is the Lodekit skill package (content an agent loads
  to use Lodekit), not to be confused with agent skills in general.
- **Integration vs Gateway** — "integration" names an outcome, deliberately without
  an artifact: what a person or agent sets out to build ("integrate Greenhouse with
  the weather"). **You build an integration by using a gateway to the provider —
  reuse one if it exists, author one if not.** The domain logic of an integration
  lives in the app; the guarded transport is the gateway. Never name a stored
  object, route, or table "integration".

## Definition of Done

A slice is done when all of these hold:

- **Complete** — every plan task is done or explicitly moved to TODO.md.
- **Tested** — a test exists at the lowest ladder rung that exercises the change,
  and `pnpm test` passes.
- **Showcased** — a new SDK/engine capability is exercised by the Greenhouse app
  (`root/README.md` coverage checklist).
- **Recorded** — ARCHITECTURE.md and DEFINITIONS.md are current for any structure
  change or term this slice introduced.
- **Logged** — docs/CHANGELOG.md has an entry if the PR's conventional type calls
  for one.
- **Parked** — descoped scope has a TODO.md line.
- **Clean** — docs/plans/ is README-only; the branch is pushed; the PR body carries
  Summary / Notes (with plan permalinks) / Test plan.
