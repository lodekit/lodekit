# agents

lodekit is a local, self-hosted runtime on which a person — working with an AI coding
agent — builds and runs their own personal web tools. See `docs/specs/` for detail.
`context.md` fixes the domain language — use its canonical terms in code, docs, and specs.

Behavioral guardrails for development workflow.
Standard workflow uses the Superpowers skills.
For trivial tasks, use judgment.

## Architecture

pnpm-workspace monorepo. Members: `packages/*`, `web`, `manager`. `examples/` is **not** a
member (so the sample apps never get a `node_modules`). Structure and rationale:
`docs/specs/2026-06-30-monorepo-migration-design.md`.

- **`packages/runtime`** (`@lodekit/runtime`) — the product. A single Node/Hono process
  (buildless, run via `tsx`) that is host + scoped API + dashboard + folder-watcher + SSE,
  and hosts TanStack Start apps in per-app worker threads. It serves apps from a Lodekit
  root (`LODEKIT_ROOT`, default `~/Documents/Lodekit`) holding sibling `apps/` + `data/`
  trees. Storage is per-app `better-sqlite3`.
- **`packages/mcp`** (`@lodekit/mcp`) — the Claude-facing MCP server. Reaches the runtime
  **over HTTP only** — no import-time dependency on the runtime. The dependency-free HTTP
  helpers live in `client.ts`; the MCP-SDK wiring in `index.ts`.
- **`packages/skill`** (`@lodekit/skill`) — the Claude skill (content only).
- **`web`** (`@lodekit/web`) — Astro landing site (Starlight docs deferred).
- **`manager`** (`@lodekit/manager`) — the menubar app that ships and supervises the
  platform. Packaged (`make`): an ad-hoc-signed arm64 `Lodekit.app` bundling a pinned
  Lodekit-local Node + the platform payload (runtime/mcp/skill via `pnpm deploy`) in
  `Resources/`, spawning the runtime as a single direct child Node process (so
  `better-sqlite3` loads outside Electron — no ABI rebuild). Dev (`start`): same menubar
  app supervising the workspace runtime against `examples/` on the system Node.
- **`examples/`** — sample Start apps (no per-app dependencies) as a self-contained Lodekit
  root, used in dev via `LODEKIT_ROOT=./examples`.

Deferred subsystems (designed-in, not built): Starlight and packaging polish (Developer ID
signing/notarization, auto-update). See `roadmap.md`.

## Build & Test

Package manager is **pnpm** (workspaces). From the repo root:

- `pnpm install` — installs all packages. A clean install auto-builds the `better-sqlite3`
  native module via the root `pnpm.onlyBuiltDependencies` allowlist (pnpm v10 gates install
  scripts). **Gotcha:** switching Node versions causes a `better-sqlite3` ABI mismatch
  (`NODE_MODULE_VERSION`) — fix with `pnpm rebuild better-sqlite3`.
  **Second gotcha:** never run `pnpm install` with CWD inside `manager/` — its `.npmrc`
  (`node-linker=hoisted`, needed only for Forge's dev-start check) would rewrite the whole
  workspace to hoisted layout and silently break runtime Vite/Tailwind builds. Install from
  the repo root; recover with a root-level node_modules wipe + `pnpm install`.
- `pnpm dev` — run the runtime against the example apps
  (`LODEKIT_ROOT=$(pwd)/examples pnpm --filter @lodekit/runtime start`).
- `pnpm mcp` — run the MCP server (`pnpm --filter @lodekit/mcp start`).
- `pnpm test` — runs `pnpm -r test`: `@lodekit/runtime` (vitest, incl. the runtime↔MCP
  integration test), `@lodekit/sdk`, and `@lodekit/manager` (supervisor/paths/logs).
  Per-package: `pnpm --filter @lodekit/runtime test`.
- `pnpm --filter @lodekit/web dev` | `build` — the Astro site.
- `pnpm --filter @lodekit/manager start` — the menubar manager in dev mode (system Node;
  supervises the runtime against `examples/`).
- `pnpm --filter @lodekit/manager make` — package `Lodekit.app` (runs
  `scripts/prepare-bundle.mjs` first: pnpm-deploys the platform payload and downloads the
  pinned Node — the version is pinned there, and the bundle must be built on that same
  Node version for the `better-sqlite3` ABI to match).

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

- **Roadmap:** `roadmap.md` is the roadmap file — it tracks deferred work and known gaps. Add parked items there.
- **Docs:** Specs live in `docs/specs/`. Plans live in `docs/plans/`.
- **Branching:** Trunk-based — commit directly to `master`. No feature branches.
- **Linear history:** `master` must stay a single linear line — **no merge commits**.
  - Integrate any diverged work by rebasing, not merging: `git pull --rebase` (set once with
    `git config pull.rebase true`) and `git merge --ff-only` (never a plain `git merge`). 
  - If you're on a worktree/side branch, `git rebase master` before folding it in.
  - **Folding in is the person's call.** When work happens on a worktree/side branch, finish
    it and leave it on the branch — never fold into `master` unattended. The person reviews
    (and may follow up on the branch) before deciding when to integrate.
  - To flatten an accidental merge, tag a backup first (`git tag backup/<desc> master`) then
    `git rebase <fork-point>` — it drops merge commits and replays the rest linearly.
  - Regenerate `pnpm-lock.yaml` conflicts with `pnpm install --lockfile-only` rather than hand-merging.
- **Commits:** Do not add `Co-Authored-By` trailers to commit messages.
