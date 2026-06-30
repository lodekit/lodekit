# agents

lodekit is a <TODO>. See `readme.md` and `docs/specs/` for detail.

Behavioral guardrails for development workflow.
Standard workflow uses the Superpowers skills.
For trivial tasks, use judgment.

## Architecture

pnpm-workspace monorepo. Members: `packages/*`, `web`, `desktop`. `examples/` is **not** a
member (so the buildless sample apps never get a `node_modules`). Structure and rationale:
`docs/specs/2026-06-30-monorepo-migration-design.md`.

- **`packages/runtime`** (`@lodekit/runtime`) — the product. A single Node/Express process
  (buildless, run via `tsx`) that is host + scoped API + dashboard + folder-watcher + SSE. It
  serves apps from a Lodekit root (`LODEKIT_ROOT`, default `~/Documents/Lodekit`) holding
  sibling `apps/` + `data/` trees. Storage is per-app `better-sqlite3`.
- **`packages/mcp`** (`@lodekit/mcp`) — the Claude-facing MCP server. Reaches the runtime
  **over HTTP only** — no import-time dependency on the runtime. The dependency-free HTTP
  helpers live in `client.ts`; the MCP-SDK wiring in `index.ts`.
- **`packages/skill`** (`@lodekit/skill`) — the Claude skill (content only).
- **`web`** (`@lodekit/web`) — Astro landing site (Starlight docs deferred).
- **`desktop`** (`@lodekit/desktop`) — Electron Forge shell that **spawns the runtime as a
  child Node process** (so `better-sqlite3` loads outside Electron — no ABI rebuild) and opens
  a window at the dashboard.
- **`examples/`** — buildless sample apps as a self-contained Lodekit root, used in dev via
  `LODEKIT_ROOT=./examples`.

Deferred subsystems (designed-in, not built): `@lodekit/sdk`, `@lodekit/ui`, the Vite build
toolchain, Starlight, and Electron packaging. See `roadmap.md`.

## Build & Test

Package manager is **pnpm** (workspaces). From the repo root:

- `pnpm install` — installs all packages. A clean install auto-builds the `better-sqlite3`
  native module via the root `pnpm.onlyBuiltDependencies` allowlist (pnpm v10 gates install
  scripts). **Gotcha:** switching Node versions causes a `better-sqlite3` ABI mismatch
  (`NODE_MODULE_VERSION`) — fix with `pnpm rebuild better-sqlite3`.
- `pnpm dev` — run the runtime against the example apps
  (`LODEKIT_ROOT=$(pwd)/examples pnpm --filter @lodekit/runtime start`).
- `pnpm mcp` — run the MCP server (`pnpm --filter @lodekit/mcp start`).
- `pnpm test` — runs `pnpm -r test`; today only `@lodekit/runtime` has a suite (vitest, incl.
  the runtime↔MCP integration test). Per-package: `pnpm --filter @lodekit/runtime test`.
- `pnpm --filter @lodekit/web dev` | `build` — the Astro site.
- `pnpm --filter @lodekit/desktop start` — the Electron shell (needs system Node + pnpm on
  PATH; spawns the runtime child against `examples/`).

Runtime and MCP are **buildless** — `tsx`, no build step.

## Lazy, Not Negligent

Simplicity never means cutting safety.

- Always keep trust-boundary validation, data-loss handling, security, and accessibility.
- A single smoke test or assert is the minimum, not bloat.
- Only unnecessary complexity gets removed.

## Surgical Changes

- Every changed line must trace directly to the request.
- Touch only what you must. Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken. Match existing style, even if you'd do it differently.
- Remove imports, variables, and functions that YOUR changes made unused.
- Don't delete pre-existing dead code. If you notice it, mention it.


## Surface, Don't Assume

- When something is genuinely ambiguous and the plan doesn't settle it, name the ambiguity and present the options.
- Don't pick an interpretation silently.
- If a simpler path exists than the one requested, say so before building.

## Conventions

- **Branching:** Trunk-based — commit directly to `master`. No feature branches.
- **Commits:** Do not add `Co-Authored-By` trailers to commit messages.
- **Docs:** Specs live in `docs/specs/`. Plans live in `docs/plans/`.
- **Roadmap:** `roadmap.md` is the roadmap file — it tracks deferred work and known gaps. Add parked items there.