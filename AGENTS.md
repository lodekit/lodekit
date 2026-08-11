# Agents

lodekit is a local, self-hosted platform where a person, working with an AI coding
agent, builds and runs their own personal web tools. This file describes how we work;
the map below says where everything else lives. `docs/DEFINITIONS.md` defines the
domain language: use its terms in code, docs, and specs, and settle any unclear or
disputed term there first. Read `docs/PRODUCT.md` before writing outward-facing prose
and `docs/DESIGN.md` before any styling work.

| File | Answers | Update when |
|---|---|---|
| `AGENTS.md` (= `CLAUDE.md`) | how we work: track, develop, release, conventions | the process changes |
| `docs/DEFINITIONS.md` | what words mean: terms, relationships, ambiguity rulings, the Definition of Done | a term is coined, renamed, or disputed |
| `docs/ARCHITECTURE.md` | what exists and how it fits: system map, packages, invariants | structure changes, same PR |
| `docs/specs/` | what we intended and why (design history; may drift once shipped) | a feature is specified |
| `docs/PRODUCT.md` | positioning, narrative, voice | strategy changes |
| `docs/DESIGN.md` | visual identity: Cloud Captured foundations + Marketing/Product registers | the design system changes |
| `docs/CHANGELOG.md` | unreleased changes (buffer; append-only) | a slice ships a loggable change |
| `docs/TODO.md` | parked work: deferred, descoped, postponed | scope falls out, same PR |
| `docs/TRACK.md` | GitHub backlog mechanics: types, fields, node IDs | the backlog schema changes |
| `docs/research/` | committed research outputs | a research doc is asked for |

How the records relate: specs record what we proposed and why; they are point-in-time
and may drift once shipped. ARCHITECTURE.md and DEFINITIONS.md hold present truth and
are rewritten in place and audited. Plans exist only on their branch and are deleted
before merge. TODO.md holds parked work. GitHub issues hold the backlog.

## Architecture

One engine process (Node/Hono, buildless) serves a person's apps, the scoped API, and
the dashboard from a Lodekit root. The manager supervises the engine, the agent drives
it through the MCP server, and apps are built on the SDK and UI library. The full
system map, package inventory, and invariants live in `docs/ARCHITECTURE.md`; update
it in the same PR as any structural change.

## Build & Test

Package manager is **pnpm** (workspaces). From the repo root:

- `pnpm install` — installs all packages. A clean install builds the `better-sqlite3`
  native module via the root `pnpm.onlyBuiltDependencies` allowlist (pnpm v10 blocks
  install scripts by default). **Gotcha:** switching Node versions breaks the
  `better-sqlite3` ABI (`NODE_MODULE_VERSION` error); fix with
  `pnpm rebuild better-sqlite3`.
- `pnpm dev` — run the engine against the showcase apps
  (`LODEKIT_ROOT=$(pwd)/root pnpm --filter @lodekit/engine start`).
- `pnpm mcp` — run the MCP server (`pnpm --filter @lodekit/mcp start`).
- `pnpm test` — runs `pnpm -r test`: `@lodekit/engine`, `@lodekit/sdk`, `@lodekit/ui`,
  `@lodekit/manager` (supervisor/paths/logs), and `@lodekit/integration-tests`
  (`packages/integration-tests`, cross-package tests such as engine↔MCP, importing
  siblings by package specifier). Run one package with
  `pnpm --filter @lodekit/engine test`.
- `pnpm --filter @lodekit/web-main dev` | `build` — the landing site.
- `pnpm --filter @lodekit/web-docs dev` | `build` — the docs site.
- `pnpm e2e` — Playwright browser smoke test across the three frontends: each page
  renders with zero console errors and its key element visible. It starts the dev
  servers it needs and reuses ones already running. URLs: dashboard
  `http://lodekit.localhost:7777/_dashboard/`, web-main `http://localhost:4381`,
  web-docs `http://localhost:4382`. The root `postinstall` installs the Chromium
  build (skipped when `$CI` is set; a CI job that needs it runs
  `pnpm exec playwright install chromium` itself). The Playwright MCP server in
  `.mcp.json` gives sessions a headless browser for visual inspection and
  screenshots. Bump `@playwright/test` and `@playwright/mcp` together (same
  Playwright line), and move the `pnpm.overrides` entries that force the MCP's
  bundled Playwright with them.
- `pnpm --filter @lodekit/manager start` — the menubar manager in dev mode (system
  Node; supervises the engine against `root/`).
- `pnpm --filter @lodekit/manager make` — package `Lodekit.app`. Runs
  `scripts/prepare-bundle.mjs` first, which pnpm-deploys the platform payload and
  downloads the pinned Node. The Node version is pinned in that script, and the
  bundle must be built on the same version so the `better-sqlite3` ABI matches.

Engine and MCP are **buildless**: `tsx`, no build step.

## Track

- **Backlog** — GitHub issues (`gh issue list`). Four org-level issue types: `bug`
  (broken or wrong), `feature` (new capability), `chore` (maintenance), and `track`
  (umbrella grouping others). Three fields: Priority (never `urgent`), Area (the
  owning surface), and Definition (undefined = needs deep spec, partial = needs
  light design, defined = solution known). Keep titles short and imperative. API
  mechanics (node IDs, sub-issues, dependencies, field mutations) are in
  `docs/TRACK.md`.
- **Deferrals** — `docs/TODO.md`. When scope falls out at any phase, append one line
  in the same PR as the work that dropped it:
  `- [YYYY-MM-DD · <provenance>] description`. Provenance is where it fell out
  (`spec:slug`, `PR #N`, `session`); an optional leading `P0`/`P1` marks urgency.
  Keep entries to single lines so parallel-worktree merges stay trivial.
- **Drain** — periodically, when the person asks: group TODO lines into themes, file
  gh issues or tracks per `docs/TRACK.md`, delete the drained lines, and open a PR
  linking every issue created.
- **In-session steps** — use the harness's own todo tracker, nothing else. Never a
  tracking file.

## Develop

Match the effort to the ask, and say which lane you're taking. A **question** gets an
answer, no artifacts. **Research** gets findings, committed to `docs/research/` only
if a doc was asked for — no branch, no records. A **small change** gets a branch, the
change, and a PR. A **bug** gets reproduced before it gets fixed, and lands with a
regression test. A **feature** gets a spec first; if the ask looks like a feature and
no spec exists, propose one before building.

### Start

Always work on a feature branch; never commit to master. The default finish is push +
PR; the person may set a different intent at session start (commit but don't push,
hold and iterate). Before starting, run `git fetch origin --prune`. If the worktree
branch is stale or already merged, reset to a fresh branch off `origin/master`.

### Specify

A spec is needed for a new user-visible capability, a cross-cutting change, or
anything that touches a security boundary. Write
`docs/specs/YYYY-MM-DD-<slug>-design.md` in the house format (Goals / Non-goals /
Decision record / numbered design sections / Rollout / Verification). Commit it,
push, and open the draft PR, so the spec is reviewable on GitHub as soon as it
exists: the person approves in session, comments on the PR, or edits the file in a
worktree. The spec must be approved before planning.

### Plan

For multi-task work, plans live in `docs/plans/` on the branch, never on master
(lifecycle in `docs/plans/README.md`):

- Write `docs/plans/YYYY-MM-DD-<slug>.md` as ordered tasks. Make each task
  self-contained (context, files touched, acceptance criteria, how to verify) so it
  can be handed to a subagent as-is. Name the spec the plan implements in a header
  line; split a spec into two or more plans when the work comes in slices.
- Commit and push; open the draft PR if Specify didn't. Ask for approval in session.
  The person may defer ("proceed, I'll review on GitHub"); review then arrives as PR
  comments or file edits to reconcile.
- Tick checkboxes and push as tasks land. The draft PR is the live progress view and
  the continuation point across sessions (`gh pr list` finds in-flight work).

Single-sitting tasks need no plan.

### Implement

- Execute the plan inline by default; delegate to subagents when the work genuinely
  fans out.
- Tests: write the failing test first when it cheaply expresses the change (bug
  regressions, pure logic). Otherwise pick the lowest rung that exercises the change
  and land the test with it: pure logic → the owning package's vitest; component
  render → `@lodekit/ui` render tests; cross-frontend health → `pnpm e2e`; visual
  judgment → Playwright MCP in-session.
- A new SDK or engine capability is not done until the Greenhouse showcase exercises
  it (`root/README.md` checklist; part of the Definition of Done).
- If a simpler path exists than the one requested, say so before building it.

### Review

Before a PR leaves draft:

- Self-review the whole branch diff for correctness and security.
- Risk-flagged work (trust boundaries, parsers, auth, network egress) also gets a
  fresh-context adversarial review: a subagent briefed to disprove the change, not
  confirm it.
- Run the docs check, all in the same PR: structure changed → ARCHITECTURE.md; term
  coined or changed → DEFINITIONS.md; loggable change → CHANGELOG.md; scope fell
  out → TODO.md.

If an automated review layer is ever wired up, it fires once per PR at
ready-for-review; drafts and intermediate pushes are exempt.

### End

- Delete the plan files in the final commit, leaving `docs/plans/` README-only. The
  squash takes the branch's final tree, and the PR body becomes master's commit
  message (`PR_TITLE`/`PR_BODY` squash settings).
- Rewrite the PR body: **Summary** (what and why), **Notes** (decisions taken,
  follow-ups, TODO lines filed, and a blob permalink to each plan's final version —
  link the deletion commit's parent so the file resolves), **Test plan** (what was
  verified). Check the Definition of Done (`docs/DEFINITIONS.md`) before flipping to
  ready.
- Flip the draft to ready (or push + open the PR). Merging is the person's call;
  never merge unattended.
- Squash-merge only: one commit per PR, with the PR title as its subject. That is
  why conventional-prefixed titles matter. Resolve conflicts with
  `git rebase master`, never a plain merge.

## Release

Merging a `release: vX.Y.Z` PR triggers `.github/workflows/release.yml`, which builds
the mac zips, tags `vX.Y.Z`, and publishes the GitHub Release with the PR body as
notes. The workflow is the only creator of `v*` tags; never tag manually.

- Pre-flight (all must pass; on failure stop and report): on `master` with a clean,
  up-to-date tree; `pnpm test` passes; the same version in all 10 package.json files
  (root, `packages/{engine,mcp,sdk,skill,ui,integration-tests}`, `web/{main,docs}`,
  `manager`); `gh auth status` works; no release PR already open;
  `docs/CHANGELOG.md` has at least one entry.
- Bump all 10 versions together: features → minor, fixes only → patch. Confirm the
  bump with the person.
- Drain the buffer verbatim into `web/docs/src/content/docs/changelog.md` under a
  prepended `## [X.Y.Z](compare-url) (YYYY-MM-DD)` heading. Cross-check merged PRs
  (`gh pr list --state merged`) for loggable work missing an entry and report gaps;
  never add entries silently. Reset the buffer to its rules header.
- Branch `release/vX.Y.Z`, single commit `release: vX.Y.Z`, PR title the same. The
  person reviews, edits notes, and merges; never merge a release PR yourself.
- The release also runs the **steering audit**: check ARCHITECTURE.md and
  DEFINITIONS.md claims against the code, and report each as verified, stale, or
  missing.

## Conventions

- **Commits & PRs:** conventional-prefixed titles (`feat:`, `fix:`, scoped
  variants). No `Co-Authored-By` trailers, no "Generated with" attribution. Write
  multiline gh bodies with `--body-file`, never escaped `\n`, and verify the stored
  body after create/edit.
- **Lockfile:** regenerate `pnpm-lock.yaml` conflicts with
  `pnpm install --lockfile-only`; never hand-merge.
- **Steering docs** are uppercase. `AGENTS.md` lives at the repo root; `CLAUDE.md` is
  a committed symlink to it — never let them diverge. The rest live in `docs/` per
  the map above.
- **Canonical docs stand alone:** ARCHITECTURE.md, DEFINITIONS.md, DESIGN.md, and
  PRODUCT.md never link to specs. They carry present truth on their own; specs are
  history and may drift.
- **Prose wraps at ~90 columns** in steering docs and specs. Tables, code, YAML
  frontmatter, and TODO.md's single-line entries are exempt.
- **docs/CHANGELOG.md** is append-only for agents (category and entry rules in its
  header); **docs/TODO.md** appends are single lines; plan files never reach master.
