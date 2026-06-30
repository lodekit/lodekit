# Lodekit Monorepo Migration — Design

**Date:** 2026-06-30
**Status:** Approved, pre-implementation
**Supersedes structure of:** the single-package POC (`docs/specs/2026-06-30-lodekit-poc-design.md`)

## 1. Purpose

The POC proved the three magic moments (ingestion, unified stack, Claude integration) as a
single-package repo. This document specifies the migration of that repo into the **product
monorepo** that will hold every Lodekit deliverable: the runtime, the MCP server, the Claude
skill, the marketing/docs website, the desktop shell, and example apps.

The migration is **foundation-first**. This pass lands a verified structural foundation plus
three live deliverables ("working shells"). Several larger subsystems are **designed into this
spec but deliberately deferred** to their own spec → plan → build cycles (§7), so the
foundation can ship and be verified before risky work piles on top of it.

### In scope (built this pass)

- Convert the repo to **pnpm workspaces**.
- Restructure existing code into `packages/{runtime,mcp,skill}`.
- Relocate the two sample apps to a non-workspace `examples/` tree the runtime still serves.
- Stand up a **running** `web/` (Astro landing placeholder).
- Stand up a **running** `desktop/` (Electron Forge shell that spawns the runtime).
- Housekeeping: workspace manifests, shared tsconfig, `.gitignore`.

### Out of scope (designed in §7, built later)

`@lodekit/sdk`, `@lodekit/ui`, the Vite build toolchain, Starlight docs, Electron
packaging + the find-or-download-local Node strategy, the dev/default path-mode switch, and
Turborepo. All OSS-hygiene files (LICENSE, README, CONTRIBUTING, `.github/`) are parked.

## 2. Why pnpm workspaces, not Turborepo (yet)

"Monorepo" and "Turborepo" are two layers. **Workspaces** (pnpm) are the actual monorepo:
multiple packages, one install, cross-package linking. **Turborepo** is a task-runner + cache
that sits *on top of* workspaces and only earns its config cost once several real build steps
and non-trivial CI times exist. Today the runtime and MCP are buildless and there is nothing
to cache. Turborepo is purely additive — adding it later is a config file, not a restructure —
so it is deferred to the Vite-toolchain milestone (§7.3), where a real build graph first
appears. pnpm is chosen over npm because it is the de-facto OSS-monorepo standard, is stricter,
and is the conventional pairing for when Turborepo is later adopted.

## 3. Target layout

```
lodekit/                       # workspace root — private, holds no app code
  pnpm-workspace.yaml
  package.json                 # root scripts only
  tsconfig.base.json           # shared compiler options, extended by each package
  packages/
    runtime/                   # @lodekit/runtime — server: current src/ + public/ + tests
    mcp/                       # @lodekit/mcp — current mcp/ + mcp.test.ts
    skill/                     # @lodekit/skill — SKILL.md (content package, no build)
  web/                         # @lodekit/web — Astro landing (Starlight docs later, §7.4)
  desktop/                     # @lodekit/desktop — Electron Forge shell
  examples/                    # buildless sample apps — NOT a workspace member
    apps/{expense-tracker,habit-tracker}/
    data/                      # gitignored runtime output
  docs/                        # internal specs/plans (unchanged location)
```

### Naming rationale

- The web/docs deliverable is **`web/`**, not `apps/` — in Lodekit, "apps" is a load-bearing
  product concept (the user's runtime tools). Reusing `apps/` for marketing would create a
  permanent conceptual collision.
- Example tools live under **`examples/`**, never `apps/` at the repo root, for the same
  reason and to keep them out of the workspace (below).

## 4. Workspace wiring

- **`pnpm-workspace.yaml`** globs `packages/*`, `web`, `desktop`. **`examples` is deliberately
  excluded** so the buildless sample apps never acquire a `node_modules`, preserving the POC
  spec's clean-backup-tree invariant ("No per-app `node_modules`").
- All packages use the secured **`@lodekit/*`** scope and are `private: true` for now
  (publishing is parked with OSS hygiene). The names matter today regardless of publishing:
  they are how cross-package deps link (`workspace:*`) and how the future SDK/UI imports resolve.
- **Decoupling preserved:** `@lodekit/mcp` does **not** depend on `@lodekit/runtime`. The MCP
  reaches the server over HTTP (`mcp/index.ts` is a `fetch` client against `LODEKIT_BASE_URL`),
  so there is no import-time edge between them. The only intra-workspace runtime dependency is
  **`desktop → runtime`**.
- **Shared TypeScript config:** `tsconfig.base.json` carries the current compiler options
  (NodeNext, strict, ES2022, `noEmit`); each package's `tsconfig.json` extends it and sets its
  own `include`.

## 5. Package-by-package migration

### 5.1 `@lodekit/runtime` (packages/runtime)

- Move `src/` → `packages/runtime/src/`, `public/` → `packages/runtime/public/`.
- **No code change required.** `server.ts` resolves `public/` via `../public` relative to its
  own module location; with `src/` and `public/` moving together, the relative path still
  resolves (under `tsx`, `import.meta.url` points at the `.ts` source).
- Move all runtime-facing tests (`api`, `appHost`, `assets`, `config`, `dashboard`, `db`,
  `e2e`, `registry`, `scaffold`, `watcher`) and `vitest.config.ts` into `packages/runtime/`.
  `e2e.test.ts` boots the server and drives it over HTTP — it stays with the runtime.
- `package.json`: name `@lodekit/runtime`, the `start` script (`tsx src/index.ts`) and `test`
  script, and the runtime deps (`better-sqlite3`, `chokidar`, `express`, `zod`).
- Stays **buildless in dev** via `tsx`, matching today.

### 5.2 `@lodekit/mcp` (packages/mcp)

- Move `mcp/` → `packages/mcp/`, and `mcp.test.ts` → `packages/mcp/`.
- `package.json`: name `@lodekit/mcp`, the `mcp` script (`tsx index.ts`), deps
  `@modelcontextprotocol/sdk` + `zod`. No workspace dependency on runtime (§4).
- Roadmap note carried forward: still uses the deprecated `server.tool()` — unchanged here.

### 5.3 `@lodekit/skill` (packages/skill)

- Move `skill/SKILL.md` → `packages/skill/`. Content-only package (no build, no tests); exists
  so the skill is a first-class, addressable part of the workspace.

### 5.4 `examples/` (not a workspace member)

- Move `apps/{expense,habit}-tracker/` → `examples/apps/...`.
- The runtime expects a *root* containing sibling `apps/` + `data/` (`config.ts` derives both
  from `LODEKIT_ROOT`). So `examples/` becomes a **self-contained Lodekit root**:
  `examples/apps/<slug>` + `examples/data/` (gitignored). **No `config.ts` change.**
- Dev runs the runtime with `LODEKIT_ROOT=./examples` (§6). This is an explicit **stopgap**;
  the proper dev/default mode switch is the first post-foundation refactor (§7.6).

## 6. Build & run model

- Runtime and MCP remain buildless in dev (`tsx`).
- **Root `package.json` scripts:**
  - `pnpm dev` → run the runtime against the example root (`LODEKIT_ROOT=./examples`).
  - `pnpm test` → `pnpm -r test` (fans out to each package's own `vitest`).
  - `pnpm --filter @lodekit/web dev` / `pnpm --filter @lodekit/desktop start` for the shells.
- **Tests co-locate with their package**; each package owns its `vitest` invocation. There is
  no root-level test runner config beyond the recursive fan-out.

## 7. Designed-in, deferred subsystems

These are **fully placed and wired in the design** so the foundation is forward-compatible,
but **not implemented this pass**. Each gets its own spec → plan → build. Suggested dependency
order: toolchain (§7.3) → sdk/ui (§7.1, §7.2) → docs (§7.4); packaging (§7.5) is independent.

### 7.1 `@lodekit/sdk` — `packages/sdk`

A typed package replacing `window.lodekit`: `import { db, store } from "@lodekit/sdk"`. Lives
in `packages/sdk`, consumed by apps through the Vite toolchain (§7.3) via the same mechanism as
`@lodekit/ui`. Owns the typed contract for `db.query/exec`, `store.get/set`, and the reserved
`secrets` shape. Versioned independently once published.

### 7.2 `@lodekit/ui` — `packages/ui`

A themed shadcn component library exposed as `@lodekit/ui` (`import { Button } from
"@lodekit/ui"`), wired into apps via a Vite alias. One imported theme everywhere = consistent
design across tools through real shadcn instead of hand-rolled CSS. Replaces today's
`public/_lodekit/design-system.css` as the design source of truth.

### 7.3 Vite build toolchain (the v2 "next major step")

Lodekit ships **Vite + React + TypeScript + Tailwind** in its own install-dir `node_modules`,
**shared by every app** — the user still never runs a build, but apps get the full ecosystem.
Build chain driven **programmatically via the Vite JS API**, not shell commands. Lodekit
watches `apps/`, builds per changed app, serves output from a disposable `.cache/<slug>/`
(outside the backup tree), and streams `building… → ready` over SSE. This **evolves the app
contract** from buildless HTML/JS to bundled React/TS — the single largest deferred change, and
the gate for `@lodekit/sdk`/`@lodekit/ui` becoming consumable as real packages. Turborepo
becomes worthwhile once this build graph exists.

### 7.4 Starlight docs (inside `web/`)

The docs site is added to the Astro app as **Starlight** (Astro's purpose-built docs
framework), sharing `web/`'s tooling and deploy. The landing placeholder shipped this pass is
the seed; docs content and Starlight config are the follow-on.

### 7.5 Electron packaging + Node strategy

Turning the dev shell into a distributable app: Forge packaging, code-signing, and the
**Node-runtime strategy** — on launch the desktop app **looks for a system Node**; if none is
found, it **offers to download a Node version installed local to Lodekit only** (in Lodekit's
own install dir), **never touching the user's system Node or PATH**. Pairs with the roadmap's
"runtime auto-install." Also resolves the `better-sqlite3` ABI-rebuild + pnpm-hoist concerns
(§8) in their proper, packaged context.

### 7.6 Dev/default path-mode switch

Replaces the `LODEKIT_ROOT=./examples` stopgap (§5.4) with first-class ergonomics: a **`dev`
mode** that uses the factored example apps + fixtures, and a **`default` mode** that uses the
paths the app configures for itself (`~/Documents/Lodekit`). This is the first refactor after
the foundation lands.

## 8. Known risk: desktop + pnpm + `better-sqlite3`

`better-sqlite3` is a native module. Under Electron it must be rebuilt against Electron's ABI,
and pnpm's symlinked store may require hoist configuration (`node-linker` /
`public-hoist-pattern`) for Forge's tooling to resolve it. This pass mitigates by **spawning
the runtime as a child Node process** (per §9) rather than loading the native module inside
Electron's own process, and by including a verification step (§10) that the desktop shell
actually serves a sample app. Full resolution (ABI rebuild for a *packaged* app) lands with
§7.5.

## 9. `desktop/` shell (this pass)

- Electron Forge scaffold in `desktop/`; `package.json` name `@lodekit/desktop`, depends on
  `@lodekit/runtime` (`workspace:*`).
- Main process **spawns the runtime as a child Node process**, waits for server-ready, opens a
  `BrowserWindow` at `http://lodekit.localhost:7777`, and **terminates the child on quit**.
- **Scoped to dev:** spawns with the **system Node**. The find-or-download-local-Node behavior
  and packaged distribution are §7.5, not this pass. If system Node is absent in dev, the shell
  fails with a clear message (graceful download is the deferred feature).

## 10. Verification — what "done" proves

1. `pnpm install` resolves the workspace cleanly (packages link, examples excluded).
2. `pnpm -r test` — all migrated runtime + MCP tests pass at their new paths.
3. `pnpm dev` serves the relocated `examples/apps/*`; the dashboard lists both sample apps and
   an expense round-trips (add → persists across reload).
4. `pnpm --filter @lodekit/web dev` renders the landing placeholder.
5. `pnpm --filter @lodekit/desktop start` boots the shell, spawns the runtime, and shows a
   sample app in the window.

## 11. Open assumptions

- pnpm is the package manager; Node + the `@lodekit` npm org (secured) back the scope.
- `lodekit.com` (secured) is the eventual `web/` deploy target; deploy config is out of scope
  this pass.
- Single user, single machine — unchanged from the POC.
- The migration preserves all POC behavior; no runtime feature changes ride along with it.
