# Release workflow — dev loop, release skill, GitHub pipeline, changelog

**Date:** 2026-07-07
**Status:** Approved

## 1. Goal

Close the loop from development session to shipped release: work lands on `master`
(hybrid: local ff-merge or squash-PR), a `/release` skill assembles a semver release PR
with user-facing notes, merging that PR triggers a GitHub Actions workflow that builds
`Lodekit.app`, tags the commit, and publishes a GitHub Release, and the same notes live
as a changelog page in the docs site. This fills the "release automation" gap deferred
in the versioning design (2026-07-06, §8). Solo-developer scale; no branch protection,
no per-PR CI.

## 2. Dev loop (hybrid)

Slice work happens on a branch/worktree as today. **Branch finalization changes:** when
a slice is done, the session pauses for a smoke test, then offers the person:

1. **ff-merge to master, no push** — the default; today's flow, unchanged.
2. **Create PR** — push the branch, `gh pr create` with a structured body:
   - **Summary** — what changed and why.
   - **Changelog** — one or two user-facing lines, or `internal` if it should not
     surface in release notes.
   - **Testing** — what was run/verified.

PRs are **squash-merged only** (repo settings disable merge commits and rebase merges on
PRs; branches auto-delete on merge). The squash commit message inherits the PR title, so
titles keep the conventional prefixes (`feat:`, `fix:`, `docs:`, scoped variants).
Merging remains the person's call — the agent raises the PR and stops.

Direct push to `master` stays allowed for trivial changes (docs, typos, bookkeeping),
same prefixes. Consequence: `master` is a mix of fine-grained folded commits, squash
commits referencing PRs (`#N`), and direct pushes — so **conventional commit prefixes
are load-bearing**: they are the primary changelog source, with PR bodies as enrichment
where a commit references one. CLAUDE.md's branching section is updated to say all of
this.

## 3. The release skill

Agent-agnostic: canonical home **`.agents/skills/release/SKILL.md`** (the portable
skills convention — OpenCode reads it natively), frontmatter limited to the portable
fields (`name`, `description`), body written as plain `git`/`gh`/`pnpm` instructions
with nothing Claude-specific. Discovery wiring: symlink `.claude/skills/release` →
`../../.agents/skills/release` for Claude Code; a pointer line in `AGENTS.md` for agents
without native skill discovery.

Invoked as `/release patch|minor|major` (bare `/release` proposes a bump from what
shipped). Runs entirely locally:

1. **Pre-flight** — on `master`; clean tree; up to date with `origin`; `pnpm test`
   passes; all workspace `package.json` versions in lockstep (versioning design §2);
   `gh` authenticated; no release PR already open; at least one changelog-worthy commit
   since the last `v*` tag. Any failure stops with a report — nothing fixed silently.
2. **Bump** — edit the root and all workspace `package.json` files together.
3. **Notes** — walk `git log vPREV..HEAD`; bucket by prefix (New / Fixed; other work
   collapsed or dropped); pull PR bodies via `gh pr view` where commits reference one;
   draft notes written for a person *using* Lodekit, not a contributor. Commits whose
   PR marked the changelog line `internal`, and `docs:`/`chore:` noise, are omitted.
4. **Changelog entry** — prepend the new section to the docs-site changelog page (§5).
5. **Release PR** — branch `release/vX.Y.Z`; single commit `release: vX.Y.Z` (bumps +
   changelog); PR titled bare `X.Y.Z` with the notes as body. Then stop: the person
   reviews, edits notes if desired, and merges — the merge is the release trigger.

`--dry-run` runs pre-flight and drafts notes, touches nothing.

First-release edge case: no previous `v*` tag exists, so the first run takes an explicit
baseline (a commit hash, or "everything" summarized coarsely) rather than guessing.

## 4. GitHub Actions release workflow

`.github/workflows/release.yml` — the repo's first workflow.

- **Trigger:** `pull_request` type `closed` on `master`; job runs only if the PR merged
  **and** its title matches `^\d+\.\d+\.\d+$`. Everything else exits silently.
- **Guards (before building):** PR title version equals the root `package.json` version
  at the merge commit; tag `vX.Y.Z` does not already exist (idempotent re-runs).
- **Build:** `macos-14` runner (Apple silicon — matches the darwin-arm64 artifact and
  the `better-sqlite3` ABI). Checkout the merge SHA; set up pnpm + Node **24.12.0**
  (`prepare-bundle.mjs` hard-asserts that version); `pnpm install`;
  `pnpm --filter @lodekit/manager make`. Output:
  `manager/out/make/zip/darwin/arm64/Lodekit-darwin-arm64-X.Y.Z.zip`, ad-hoc signed
  exactly as local builds — Developer ID/notarization stays a dormant roadmap toggle.
- **Publish (only after a green build):** create tag `vX.Y.Z` on the merge commit — the
  workflow is the *only* thing that ever creates version tags — then create the GitHub
  Release for that tag: notes = the release PR body, zip attached. Uses `gh` with the
  built-in `GITHUB_TOKEN`; workflow permissions `contents: write` and nothing more.
- **No tests in the workflow** — testing happened in the skill's pre-flight.

## 5. Changelog page

Single page `web/docs/src/content/docs/changelog.md`, added to the Starlight sidebar.
The release skill prepends one section per release:

```markdown
## 0.2.0 — 2026-07-15

Short narrative line about the release, if it has a theme.

### New
- **Events service** — apps can watch kv/files change feeds…

### Fixed
- Shed round-trip state reset…
```

Newest first; `X.Y.Z — date` headings give each release a stable anchor; entries are
written for Lodekit users. The GitHub Release notes are this same text (the release PR
body), so the two never diverge. One file is deliberate YAGNI — splitting into a content
collection (per-release pages, RSS) is a mechanical migration later. The page renders
whenever the docs site ships; until then it is still the canonical changelog, readable
in the repo.

## 6. Failure handling and verification

Invariants:

- The skill never half-releases: pre-flight failures stop before anything is edited; a
  failure mid-draft leaves only a disposable local branch.
- The workflow never half-publishes: guards run before the build; tag + release happen
  only after a green build; re-runs are idempotent (existing tag → clean exit).
- A merged release PR whose build failed is recovered by re-running the workflow run —
  nothing was published, no revert needed.

Verification: skill developed and tested via `--dry-run`; workflow YAML checked with
`actionlint` before commit; trigger safety (ordinary PRs don't match the semver regex)
observed on the first feature PR. The end-to-end proof is cutting the first real
release — the loop is not done until one release has gone through it (the project's
definition-of-done convention applied to itself).

## 7. Rollout order

Each a small slice, all on the `ci` branch:

1. Conventions — CLAUDE.md branching/release update, `AGENTS.md` pointer, smoke-test
   pause + two-option finalization behavior.
2. Changelog page scaffold in `web/docs` + sidebar entry.
3. `.agents/skills/release/SKILL.md` + `.claude/skills` symlink.
4. `.github/workflows/release.yml`.
5. First real release to validate the loop, with an explicitly chosen notes baseline
   (0.1.0 was never released).

## 8. Out of scope

Unchanged roadmap items: docs-site deploy; prereleases (`X.Y.Z-beta.N` titles can gate a
`--prerelease` flag later); Developer ID signing/notarization; npm publishing under the
`@lodekit/*` scope; per-PR CI tests.
