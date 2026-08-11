# 004-arch: Worktree installs share one pnpm global virtual store

**Date:** 2026-07-17 · **Status:** Accepted (records the decision shipped in PR #99, 2026-07-16; consequence evidence from the Explorer-v2 session, 2026-07-17)

## Context

The workflow runs many short-lived git worktrees (per-slice and per-task). Each
worktree historically needed its own full `pnpm install`, paying the whole
node_modules materialization cost per worktree. PR #99 enabled pnpm's
global virtual store (`~/.local/share/pnpm/store/v10/links/...`), making installs
in a fresh worktree near-instant (seconds, shared hard-linked store).

## Decision

Keep the global virtual store on. Every worktree — including long-lived ones —
must run `pnpm install` after checking out a commit that postdates the switch;
a `node_modules` tree materialized before the switch is silently incompatible
with it.

## Rationale

Per-task worktrees are only viable if installs are cheap; the global store makes
a fresh worktree usable in ~5 s instead of minutes. The cost is a one-time
migration hazard per pre-existing worktree, which a single `pnpm install`
(sub-second when already consistent) resolves.

## Consequences

- **Failure mode to recognize:** a stale (pre-switch) `node_modules` produces
  deep-resolution errors that look like dependency bugs, not install problems.
  Observed instance: `Cannot find package 'drizzle-orm' imported from
  …/pnpm/store/v10/links/@/drizzle-kit/…/api.mjs` — drizzle-kit (which has a
  known undeclared `drizzle-orm` import) resolving through the global links store
  where the old layout satisfied it. Fifteen `db-push`/`schema-drift` tests failed
  with a green suite elsewhere.
- **Rule:** on any weird module-resolution failure in a worktree, run
  `pnpm install` first and re-run before debugging code. Fresh worktree
  checkouts still need one `pnpm install` (fast) before tests.
- The `better-sqlite3` ABI-on-Node-switch gotcha (AGENTS.md) is unchanged and
  orthogonal.
