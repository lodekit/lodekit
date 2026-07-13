# agents

lodekit is a local, self-hosted runtime on which a person — working with an AI coding
agent — builds and runs their own personal web tools. See `docs/specs/` for detail.
`context.md` fixes the domain language — use its canonical terms in code, docs, and specs.

Behavioral guardrails for development workflow.
Standard workflow uses the Superpowers skills.
For trivial tasks, use judgment.

## Architecture

pnpm-workspace monorepo. Members: `packages/*`, `web/*`, `manager`. `root/` is **not** a
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
- **`web/main`** (`@lodekit/web-main`) — Astro landing site.
- **`web/docs`** (`@lodekit/web-docs`) — Starlight docs site (placeholder scaffold).
- **`manager`** (`@lodekit/manager`) — the menubar app that ships and supervises the
  platform. Packaged (`make`, electron-builder): an ad-hoc-signed `Lodekit.app` bundling a pinned
  Lodekit-local Node + the platform payload (runtime/mcp/skill via `pnpm deploy`) in
  `Resources/`, spawning the runtime as a single direct child Node process (so
  `better-sqlite3` loads outside Electron — no ABI rebuild). Dev (`start`): same menubar
  app supervising the workspace runtime against `root/` on the system Node.
- **`root/`** — the checked-in Lodekit root: the Greenhouse showcase app (the SDK's
  smoke-testing ground — see `root/readme.md` for the definition-of-done convention) and
  the Welcome app. Used in dev via `LODEKIT_ROOT=./root`; the packaged manager installs
  its apps into a fresh `~/Documents/Lodekit` on first run.

Deferred subsystems (designed-in, not built): docs content/theming/deploy and packaging
polish (Developer ID signing/notarization, auto-update). See the backlog (GitHub issues).

## Build & Test

Package manager is **pnpm** (workspaces). From the repo root:

- `pnpm install` — installs all packages. A clean install auto-builds the `better-sqlite3`
  native module via the root `pnpm.onlyBuiltDependencies` allowlist (pnpm v10 gates install
  scripts). **Gotcha:** switching Node versions causes a `better-sqlite3` ABI mismatch
  (`NODE_MODULE_VERSION`) — fix with `pnpm rebuild better-sqlite3`.
- `pnpm dev` — run the runtime against the showcase apps
  (`LODEKIT_ROOT=$(pwd)/root pnpm --filter @lodekit/runtime start`).
- `pnpm mcp` — run the MCP server (`pnpm --filter @lodekit/mcp start`).
- `pnpm test` — runs `pnpm -r test`: `@lodekit/runtime` (vitest, incl. the runtime↔MCP
  integration test), `@lodekit/sdk`, and `@lodekit/manager` (supervisor/paths/logs).
  Per-package: `pnpm --filter @lodekit/runtime test`.
- `pnpm --filter @lodekit/web-main dev` | `build` — the landing site.
- `pnpm --filter @lodekit/web-docs dev` | `build` — the docs site.
- `pnpm --filter @lodekit/manager start` — the menubar manager in dev mode (system Node;
  supervises the runtime against `root/`).
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

- **Backlog:** deferred work and known gaps live as GitHub issues (`gh issue list`).
- **Deferrals:** `docs/defer.md` is a transient buffer for work descoped/deferred during
  a session. Append entries under a dated session header linking the spec/plan/PR that
  caused them; **append-only** — never reword, resolve, or remove existing entries (the
  person drains the file into GitHub issues and clears it). `roadmap.md` is retired;
  never recreate it — where an older spec/plan says "add to roadmap.md", that now means
  `docs/defer.md`.
- **Changelog buffer:** `docs/changelog.md` collects unreleased user-facing
  changes. A slice that ships something a Lodekit user can see or do appends an entry
  under `## New` or `## Fixed`, in the same PR as the code; internal work appends
  nothing. **Append-only** for agents — rewording and cutting happen in the release PR
  review.
- **Docs:** Specs live in `docs/specs/`. Plans live in `docs/plans/`.
- **Branching:** All changes to `master` land via PR — no direct pushes, docs and
  typos included. Slice work happens on a branch/worktree; finishing a slice means
  pushing the branch and raising a PR.
  - PRs are **squash-merged only** (repo settings disable merge commits and rebase
    merges; branches auto-delete on merge). `master` stays a single linear line —
    one commit per PR, whose subject is the PR title, so **conventional-prefixed PR
    titles are load-bearing**. Still `git rebase master` to resolve conflicts before
    merging; never a plain `git merge`.
  - PR shape: conventional-prefixed title (`feat:`, `fix:`, scoped variants); body
    with **Summary** (what changed and why), **Notes** (decisions taken, known
    follow-ups), and **Test plan** (checklist of what was verified).
  - **Merging is the person's call.** The agent raises the PR and stops — never
    merge unattended.
  - Regenerate `pnpm-lock.yaml` conflicts with `pnpm install --lockfile-only` rather than hand-merging.
- **Releases:** `/release` (skill at `.agents/skills/release/SKILL.md`) assembles a
  semver release PR: lockstep version bump + drain of `docs/changelog.md` into the
  docs changelog page. Merging it triggers the GitHub release build; the workflow is
  the only creator of `v*` tags. Portable agent skills live in `.agents/skills/`
  (Claude Code discovers them via the `.claude/skills` symlinks).
- **Commits:** Do not add `Co-Authored-By` trailers to commit messages.
- **Definition of done:** a new SDK/runtime capability is not done until the Greenhouse
  showcase app exercises it (`root/readme.md` holds the living coverage checklist).
