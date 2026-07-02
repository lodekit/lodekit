# Lodekit

Lodekit is a single, local, self-hosted runtime on which a person — working with an AI coding agent — builds and runs their own personal web tools. This glossary fixes the ubiquitous language of that domain: where a term has a canonical form, prefer it and avoid the listed alternatives.

## Language

### Product & distribution

**Lodekit**:
The product: one long-running local process that hosts, builds, and serves a person's tools, along with the dashboard, per-app API, and storage. One shared instance, never one per app.
_Avoid_: the server, the platform, the site

**Runtime**:
The single Node process that _is_ Lodekit — it hosts, builds, watches, and serves apps, the dashboard, and the API. Referred to in code as `@lodekit/runtime`.
_Avoid_: server, backend, daemon

**Desktop app**:
The downloadable application (`@lodekit/desktop`) and the canonical way Lodekit is installed: it provisions Node, runs the runtime as a child process, registers the MCP server, and opens the dashboard.
_Avoid_: the installer, the shell, the Electron app (implementation detail)

**Dashboard**:
Lodekit's built-in web UI: every app with its live build state and health, plus each app's settings, raw data, and scheduled jobs.
_Avoid_: home page, admin, console

**Landing site**:
The public marketing site at lodekit.com (`@lodekit/web`).
_Avoid_: the website, homepage

**Docs**:
The public documentation site for people, living alongside the landing site. Distinct from the Skill — see Flagged ambiguities.
_Avoid_: wiki, manual

### Agent surface

**Agent**:
The AI coding assistant the person builds through. Lodekit is agent-agnostic: any agent that can load the skill and speak MCP can drive it.
_Avoid_: Claude (as the generic word), LLM, assistant, AI

**MCP server**:
The agent-facing surface (`@lodekit/mcp`) through which an agent drives Lodekit — scaffold, list, open, inspect. Reaches the runtime over HTTP only.
_Avoid_: the integration, the bridge

**Skill**:
The instruction pack (`@lodekit/skill`) an agent loads to learn how to build on Lodekit: the app contract, the stack, and how to use the MCP server and SDK.
_Avoid_: the prompt, system prompt, docs (docs are human-facing)

### Apps

**App**:
A self-contained personal web tool that runs on Lodekit. The canonical domain and code word for the thing a person builds. (End users see these called _Tools_ — see Flagged ambiguities.)
_Avoid_: project, site, plugin, widget

**Slug**:
An app's URL-safe identity (`^[a-z0-9-]+$`). It equals the app's folder name and is simultaneously its URL path and its data namespace.
_Avoid_: id, key, handle

**Manifest**:
The `manifest.json` at an app's root declaring its name, slug, icon, and description. The record that makes a folder an app.
_Avoid_: config, metadata, lodekit.json (the retired filename)

**App contract**:
The required shape of an app's source: a manifest, an HTML entry, and a `src/` of React + TypeScript that imports the SDK. What "a valid app" means.
_Avoid_: template, boilerplate, scaffold (scaffold is the act, not the shape)

**Scaffold**:
To generate a new app's starter files conforming to the app contract.
_Avoid_: create, init, bootstrap, generate

**Settings**:
Configuration an app declares so the person can view and edit it in the dashboard; the app reads it through the SDK. Distinct from the Store — see Flagged ambiguities.
_Avoid_: preferences, config, options

**Job**:
Background work an app registers for the runtime to run on the app's behalf; a **scheduled job** is one triggered on a time schedule. Jobs are listed with their schedule and last-run state in the dashboard.
_Avoid_: cron, task, worker, workflow

### Storage & filesystem

**Lodekit root**:
The one directory (`LODEKIT_ROOT`) holding the sibling apps tree and data tree. The thing a person backs up.
_Avoid_: workspace, home, project directory

**Apps tree**:
The `apps/` directory under the Lodekit root — app _source_ only, carrying no dependencies.
_Avoid_: source dir, workspace

**Data tree**:
The `data/` directory under the Lodekit root — each app's persistent storage, one namespace per slug.
_Avoid_: db dir, storage

**Backup tree**:
The apps tree and data tree together: the durable state worth preserving. Explicitly excludes the cache.
_Avoid_: the project, the data

**Cache**:
Regenerable built output, kept outside the Lodekit root and never backed up. Deleting it costs only a rebuild.
_Avoid_: build dir, dist, output, storage

**Store**:
An app's per-app key–value store of JSON values, reached through the SDK (`store.get` / `store.set`). Distinct from the Cache and from Settings — see Flagged ambiguities.
_Avoid_: cache, settings, kv, preferences

**Database**:
An app's per-app SQL database, reached through the SDK (`db.query` / `db.exec`). One per slug, living in the data tree.
_Avoid_: store (the store is the KV; the two differ), sql

### Building & serving

**Bundled**:
The current app contract: app source is compiled into static output that Lodekit serves. The person still never runs a build themselves.
_Avoid_: compiled, production build

**Buildless**:
Code that ships as raw source and runs with no build step — true of the runtime and the SDK. (Apps were once buildless too; that contract is retired — see Flagged ambiguities.)
_Avoid_: no-build, raw

**Build state**:
An app's build lifecycle: `building` → `ready` | `error`. Streamed live to the dashboard.
_Avoid_: status, phase

**Shared toolchain**:
The one build stack (Vite + React + TypeScript + Tailwind) Lodekit installs once and shares across every app, so apps carry no dependencies of their own.
_Avoid_: per-app dependencies, node_modules per app

**Stack**:
The prescribed way app code is written: React + TypeScript + Tailwind through the shared toolchain, importing the SDK and the UI library, and conforming to the app contract. The skill teaches the stack; agents follow its guardrails.
_Avoid_: framework, template, best practices

**SDK**:
The typed client (`@lodekit/sdk`) an app imports to reach its own scoped API — currently `db` and `store`. Replaces the old injected `window.lodekit` global.
_Avoid_: client library, api wrapper, window.lodekit

**UI library**:
The themed component library (`@lodekit/ui`) — shadcn components carrying one shared theme — that every app imports, so all tools look like one product.
_Avoid_: design system, component kit, shadcn (the upstream, not the package)

**Scoped API**:
The per-app HTTP API namespaced by slug (`/api/apps/:slug/...`) that backs the SDK.
_Avoid_: the endpoints, the REST API

## Relationships

- The **Desktop app** installs and supervises the **Runtime**. The runtime has two doors: the **MCP server** (the agent's) and the **Dashboard** (the person's).
- An agent builds an **App** by loading the **Skill**, driving Lodekit through the **MCP server**, and writing code on the **Stack** — the **SDK** and **UI library** on the **shared toolchain**, conforming to the **App contract**.
- An **App** is identified by its **Slug**; that same slug is its URL path and its data namespace.
- An app's source lives in the **Apps tree**, its built output in the **Cache**, and its persistent state (**Database** + **Store**) in the **Data tree**.
- The **Backup tree** = apps tree + data tree. The **Cache** is deliberately outside it.
- An **App** reaches its **Database** and **Store** only through the **SDK**, which calls the **Scoped API**.
- **Settings** and **Jobs** are declared by an app and surfaced to the person in the **Dashboard**.

## Flagged ambiguities

- **App vs Tool** — the same thing. _App_ is canonical in the domain and code; _Tool_ is the word shown to end users ("build a tool with Lodekit"). Use _App_ everywhere except human-facing copy.
- **Store vs Cache** — both sound like "somewhere things are kept," but they are opposites in durability. The **Store** is per-app durable KV state (backed up, in the data tree); the **Cache** is disposable build output (never backed up). Never call the store a cache.
- **Store vs Settings** — both hold small per-app values. **Settings** are declared by the app and edited by the person in the dashboard (the person's knobs); the **Store** is written by app code at runtime (the app's own memory). An app reads both, but only settings are meant for human hands.
- **Docs vs Skill** — both teach how to use Lodekit, to different readers. **Docs** are the public site for people; the **Skill** is the instruction pack for agents. Content may overlap; the audiences never do.
- **Buildless: runtime/SDK vs the retired app contract** — _buildless_ now means only the runtime and the SDK (raw source, no build). Apps used to be buildless too (the POC contract); that is retired in favor of the **Bundled** contract. Don't describe an app as buildless.
- **Skill** — `@lodekit/skill` is the Lodekit skill package (content an agent loads to use Lodekit), not to be confused with agent skills in general.
