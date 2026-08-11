# Agents

lodekit is a local, self-hosted platform on which a person — working with an AI coding
agent — builds and runs their own personal web tools. This file is how we work; the
map below says where everything else lives. `docs/DEFINITIONS.md` fixes the domain
language — use its canonical terms in code, docs, and specs; when a term is unsure or
disputed, resolve it there first. Consult `docs/PRODUCT.md` before outward-facing
prose and `docs/DESIGN.md` before any styling work.

| File | Answers | Update when |
|---|---|---|
| `AGENTS.md` (= `CLAUDE.md`) | how we work: track, develop, release, conventions | the process changes |
| `docs/DEFINITIONS.md` | what words mean — terms, relationships, ambiguity rulings, the Definition of Done | a term is coined, renamed, or disputed |
| `docs/ARCHITECTURE.md` | what exists and how it fits — system map, packages, invariants | structure changes, same PR |
| `docs/specs/` | what we intended and why (design history; may drift once shipped) | a feature is specified |
| `docs/PRODUCT.md` | positioning, narrative, voice | strategy changes |
| `docs/DESIGN.md` | visual identity: Cloud Captured foundations + Marketing/Product registers | the design system changes |
| `docs/CHANGELOG.md` | unreleased changes (buffer; append-only) | a slice ships a loggable change |
| `docs/TODO.md` | parked work: deferred, descoped, postponed | scope falls out, same PR |
| `docs/TRACK.md` | GitHub backlog mechanics: types, fields, node IDs | the backlog schema changes |
| `docs/research/` | committed research outputs | a research doc is asked for |

The relationships: **spec = proposal and rationale history** (point-in-time,
allowed to drift) · **ARCHITECTURE.md + DEFINITIONS.md = present truth**
(rewritten in place, audited) · **plan = in-flight scaffolding** (branch-only,
dies before merge) · **TODO.md = parked** · **gh issues = backlog**.

## Architecture

One engine process (Node/Hono, buildless) serves a person's apps, the scoped API,
and the dashboard from a Lodekit root; the manager supervises it, the agent drives
it through the MCP server, and apps are built on the SDK + UI library. The full
system map, package inventory, and invariants live in `docs/ARCHITECTURE.md` —
update it in the same PR as any structural change.

## Build & Test

Package manager is **pnpm** (workspaces). From the repo root:

- `pnpm install` — installs all packages. A clean install auto-builds the
  `better-sqlite3` native module via the root `pnpm.onlyBuiltDependencies` allowlist
  (pnpm v10 gates install scripts). **Gotcha:** switching Node versions causes a
  `better-sqlite3` ABI mismatch (`NODE_MODULE_VERSION`) — fix with
  `pnpm rebuild better-sqlite3`.
- `pnpm dev` — run the engine against the showcase apps
  (`LODEKIT_ROOT=$(pwd)/root pnpm --filter @lodekit/engine start`).
- `pnpm mcp` — run the MCP server (`pnpm --filter @lodekit/mcp start`).
- `pnpm test` — runs `pnpm -r test`: `@lodekit/engine`, `@lodekit/sdk`, `@lodekit/ui`,
  `@lodekit/manager` (supervisor/paths/logs), and `@lodekit/integration-tests`
  (`packages/integration-tests` — cross-package tests like engine↔MCP, importing
  siblings by package specifier). Per-package: `pnpm --filter @lodekit/engine test`.
- `pnpm --filter @lodekit/web-main dev` | `build` — the landing site.
- `pnpm --filter @lodekit/web-docs dev` | `build` — the docs site.
- `pnpm e2e` — Playwright browser smoke across the three frontends: each page
  renders with zero console errors and its key element visible. Boots the needed
  dev servers itself (reuses ones already running). Dashboard:
  `http://lodekit.localhost:7777/_dashboard/`; web-main: `http://localhost:4381`;
  web-docs: `http://localhost:4382`. The Chromium build arrives via the root
  `postinstall` (skipped when `$CI` is set — a CI job that needs it runs
  `pnpm exec playwright install chromium` explicitly). The Playwright MCP server
  in `.mcp.json` gives sessions an interactive headless browser for visual
  inspection and screenshots. The `@playwright/test` and `@playwright/mcp` pins
  bump together (same Playwright line) — and the `pnpm.overrides` entries that
  force the MCP's bundled Playwright move with them.
- `pnpm --filter @lodekit/manager start` — the menubar manager in dev mode (system Node;
  supervises the engine against `root/`).
- `pnpm --filter @lodekit/manager make` — package `Lodekit.app` (runs
  `scripts/prepare-bundle.mjs` first: pnpm-deploys the platform payload and downloads the
  pinned Node — the version is pinned there, and the bundle must be built on that same
  Node version for the `better-sqlite3` ABI to match).

Engine and MCP are **buildless** — `tsx`, no build step.

## Track

- **Backlog** — GitHub issues (`gh issue list`), the durable backlog. Four
  org-level issue types — `bug` (broken or wrong), `feature` (new capability),
  `chore` (maintenance), `track` (umbrella grouping others) — and three fields:
  Priority (never `urgent`), Area (the owning surface), Definition (undefined =
  needs deep spec, partial = needs light design, defined = solution known).
  Titles imperative and short. API mechanics — node IDs, sub-issues,
  dependencies, field mutations — are in `docs/TRACK.md`.
- **Deferrals** — `docs/TODO.md`. When scope falls out at any phase, append one
  line in the same PR as the work that descoped it:
  `- [YYYY-MM-DD · <provenance>] description` — provenance is where it fell out
  (`spec:slug`, `PR #N`, `session`); an optional leading `P0`/`P1` marks urgency.
  Single lines only, so parallel-worktree merges stay trivial.
- **Drain** — periodically, on the person's ask: group TODO lines into themes,
  file gh issues or tracks per `docs/TRACK.md`, delete the drained lines, and
  raise a PR linking every issue created.
- **In-session steps** — the harness's own todo tracker, nothing else. Never a
  tracking file.

## Develop

Match ceremony to the shape of the ask, and say which lane you're taking: a
**question** gets an answer — no artifacts. **Research** gets findings, committed
to `docs/research/` only if a doc was asked for — no branch, no records. A **small
change** gets a branch, the change, and a PR. A **bug** gets reproduced before it
gets fixed, and lands with a regression test. A **feature** gets a spec first —
when the ask looks feature-shaped and no spec exists, propose one before building.

### Start

Always a feature branch; never commit to master. The default finish is push + PR;
the person may set a different intent at session start (commit-don't-push, hold
and iterate). Before starting: `git fetch origin --prune`; if the worktree branch
is stale or already merged, reset to a fresh branch off `origin/master`.

### Specify

Spec-worthy: a new user-visible capability, a cross-cutting change, or anything
security-boundary-shaped. Write `docs/specs/YYYY-MM-DD-<slug>-design.md` (house
format: Goals / Non-goals / Decision record / numbered design sections / Rollout /
Verification), commit it, push, and open the draft PR — the spec is reviewable on
GitHub from the moment it exists: the person approves in session, comments on the
PR, or edits the file in a worktree. The spec is approved before planning.

### Plan

For multi-task work, plans live in `docs/plans/` on the branch — never on master
(lifecycle in `docs/plans/README.md`):

- Write `docs/plans/YYYY-MM-DD-<slug>.md`: ordered tasks, each self-contained
  (context, files touched, acceptance criteria, how to verify) so a task brief
  can be handed to a subagent as-is. A header line names the spec it implements;
  split a spec into two or more plans when the work comes in slices.
- Commit and push; open the draft PR if Specify didn't. Ask for approval in
  session; the person may defer ("proceed, I'll review on GitHub") — then review
  arrives as PR comments or file edits to reconcile.
- Tick checkboxes and push as tasks land — the draft PR is the live progress view
  and the cross-session continuation artifact (`gh pr list` finds in-flight work).

Single-sitting tasks need no plan.

### Implement

- Execute the plan inline by default; delegate to subagents when the work
  genuinely fans out.
- Tests: write the failing test first when it cheaply expresses the change — bug
  regressions and pure logic. Otherwise pick the lowest rung that exercises the
  change and land the test with it: pure logic → the owning package's vitest;
  component render → `@lodekit/ui` render tests; cross-frontend health →
  `pnpm e2e`; visual judgment → Playwright MCP in-session.
- A new SDK/engine capability isn't done until the Greenhouse showcase exercises
  it (`root/README.md` checklist — part of the Definition of Done).
- If a simpler path exists than the one requested, say so before building it.

### Review

Before a PR leaves draft:

- Self-review the whole branch diff — correctness plus a security lens.
- Risk-flagged work (trust boundaries, parsers, auth, network egress)
  additionally gets a fresh-context adversarial review: a subagent briefed to
  disprove the change, not confirm it.
- Run the docs check: structure changed → ARCHITECTURE.md; term coined or
  changed → DEFINITIONS.md; loggable → CHANGELOG.md; scope fell out → TODO.md.
  All in this same PR.

If an automated review layer is ever wired, it fires once per PR at
ready-for-review; drafts and intermediate pushes are exempt.

### End

- Delete the plan files in the final commit (`docs/plans/` back to README-only) —
  the squash takes the branch's final tree, and the PR body becomes master's
  commit message (`PR_TITLE`/`PR_BODY` squash settings).
- Rewrite the PR body: **Summary** (what and why), **Notes** (decisions taken,
  follow-ups, TODO lines filed, and a blob permalink to each plan's final
  version — link the deletion commit's parent so the file resolves), **Test
  plan** (what was verified). Check the Definition of Done
  (`docs/DEFINITIONS.md`) before flipping to ready.
- Flip the draft to ready (or push + open the PR). Merging is the person's call —
  never merge unattended.
- Squash-merge only: one commit per PR whose subject is the PR title, so
  conventional-prefixed titles are load-bearing. Resolve conflicts with
  `git rebase master`, never a plain merge.

## Release

Merging a `release: vX.Y.Z` PR triggers `.github/workflows/release.yml`, which
builds the mac zips, tags `vX.Y.Z`, and publishes the GitHub Release with the PR
body as notes — the workflow is the only creator of `v*` tags; never tag manually.

- Pre-flight (all must pass; on failure stop and report): on `master`, clean
  tree, up to date; `pnpm test` passes; version lockstep across all 10
  package.json files (root, `packages/{engine,mcp,sdk,skill,ui,integration-tests}`,
  `web/{main,docs}`, `manager`); `gh auth status`; no release PR already open;
  `docs/CHANGELOG.md` has at least one entry.
- Bump all 10 together — features → minor, fixes only → patch; confirm the bump
  with the person.
- Drain the buffer verbatim into `web/docs/src/content/docs/changelog.md` under a
  prepended `## [X.Y.Z](compare-url) (YYYY-MM-DD)` heading; cross-check merged
  PRs (`gh pr list --state merged`) for loggable work missing an entry and
  surface gaps — never silently add. Reset the buffer to its rules header.
- Branch `release/vX.Y.Z`, single commit `release: vX.Y.Z`, PR title the same.
  The person reviews, edits notes, and merges — never merge a release PR
  yourself.
- The release also runs the **steering audit**: verify ARCHITECTURE.md and
  DEFINITIONS.md claims against the code; report verified / stale / missing.

## Conventions

- **Commits & PRs:** conventional-prefixed titles (`feat:`, `fix:`, scoped
  variants); no `Co-Authored-By` trailers; no "Generated with" attribution.
  Multiline gh bodies via `--body-file`, never escaped `\n` — and verify the
  stored body after create/edit.
- **Lockfile:** regenerate `pnpm-lock.yaml` conflicts with
  `pnpm install --lockfile-only`, never hand-merge.
- **Steering docs** are uppercase. `AGENTS.md` lives at the repo root; `CLAUDE.md`
  is a committed symlink to it — never diverge them. The rest live in `docs/` per
  the map above.
- **Canonical docs stand alone:** ARCHITECTURE.md, DEFINITIONS.md, DESIGN.md, and
  PRODUCT.md never link to specs — they carry present truth on their own terms;
  specs are history and may drift.
- **Prose wraps at ~90 columns** in steering docs and specs; tables, code, YAML
  frontmatter, and TODO.md's single-line entries are exempt.
- **docs/CHANGELOG.md** is append-only for agents (category and entry rules in
  its header); **docs/TODO.md** appends are single lines; plan files never reach
  master.
