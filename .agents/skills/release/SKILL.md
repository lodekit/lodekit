---
name: release
description: Cut a Lodekit release — semver bump across the workspace, product-level release notes, and a release PR whose merge triggers the build pipeline. Use when the person asks to release or ship a version. Args: patch|minor|major (bare invocation proposes a bump); --dry-run drafts without touching anything.
---

# Release

Assembles a semver release PR. Merging that PR (always the person's call) triggers
`.github/workflows/release.yml`, which builds the mac zips, tags `vX.Y.Z`, and
publishes the GitHub Release with the PR body as notes. The workflow is the only
thing that ever creates version tags — never tag manually.

`--dry-run`: run pre-flight and draft the notes, then stop — edit nothing, create
no branch, no PR.

## 1. Pre-flight

All must pass. On any failure, stop and report — fix nothing silently.

- On `master`: `git rev-parse --abbrev-ref HEAD` prints `master`.
- Clean tree: `git status --porcelain` prints nothing.
- Up to date: `git fetch origin` then `git rev-list HEAD..origin/master --count` prints `0`.
- Tests pass: `pnpm test` from the repo root.
- Version lockstep: the root `package.json`, `packages/{runtime,mcp,sdk,skill,ui}/package.json`,
  `web/{main,docs}/package.json`, and `manager/package.json` (9 files) all carry the
  same version.
- `gh auth status` succeeds.
- No release PR already open:
  `gh pr list --state open --json title --jq '.[].title' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$'`
  must print nothing.
- Previous release tag: `git describe --tags --match 'v*' --abbrev=0` — call it
  `vPREV`. If it fails, no release exists yet: this is the **first release** (§5).
  Otherwise `git rev-list vPREV..HEAD --count` must be > 0.

## 2. Bump

Compute the new version from the lockstep version and the requested bump
(patch/minor/major). Bare invocation: propose a bump from what shipped (features →
minor, fixes only → patch) and confirm with the person before proceeding. Edit the
version field in all 9 package.json files together. First release: skip (§5).

## 3. Notes — product-level

The changelog unit is the **shipped product change**, not the commit.

- Find shipped slices: `git log vPREV..HEAD --diff-filter=A --name-only -- docs/specs/`
  (new specs = shipped slices), plus
  `gh pr list --state merged --base master --limit 50 --json title,body,mergedAt`
  for the evidence trail, plus `git log vPREV..HEAD --oneline` for anything unspecced.
- Draft **one entry per product change**, written for a person *using* Lodekit —
  what they can do now, never how it was built.
- Buckets: `### New`, then `### Fixed` (user-noticeable fixes only). Internal work,
  refactors, docs, and bookkeeping are dropped. Omit an empty bucket.
- Optionally one narrative line under the version heading if the release has a theme.

## 4. Changelog + release PR

- Prepend the new section to `web/docs/src/content/docs/changelog.md`, directly
  above the first existing `## ` heading (at the end of the file if none):

  ```markdown
  ## X.Y.Z — YYYY-MM-DD

  Narrative line, if any.

  ### New
  - **Thing** — what the person can now do…

  ### Fixed
  - What was broken from the user's view…
  ```

- Branch `release/vX.Y.Z` off `master`; single commit `release: vX.Y.Z` containing
  the 9 version bumps + the changelog edit.
- Push and open the PR: title **bare `X.Y.Z`** (the workflow's trigger match), body =
  the new changelog section's content without the `## X.Y.Z` heading line.
- **Stop.** The person reviews, edits the notes if desired, and merges. Never merge
  a release PR yourself.

## 5. First release (no `v*` tag exists)

The workspace already says `0.1.0` and it was never released: the first run is the
one permitted **zero-bump** release. Skip §2 entirely — version stays `0.1.0`. The
notes baseline is everything so far, summarized coarsely as an initial-release
narrative (what Lodekit is, plus its headline capabilities) — do not reconstruct
the history slice by slice.
