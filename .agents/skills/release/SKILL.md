---
name: release
description: Cut a Lodekit release — semver bump across the workspace, drain the changelog buffer (docs/changelog.md) into release notes, and raise a release PR whose merge triggers the build pipeline. Use when the person asks to release or ship a version. Args: patch|minor|major (bare invocation proposes a bump); --dry-run drafts without touching anything.
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
  `gh pr list --state open --json title --jq '.[].title' | grep -E '^release: v[0-9]+\.[0-9]+\.[0-9]+$'`
  must print nothing.
- The changelog buffer `docs/changelog.md` has at least one entry under `## New`
  or `## Fixed` — an empty buffer means nothing user-facing shipped; there is nothing
  to release.
- Previous release tag: `git describe --tags --match 'v*' --abbrev=0` — call it
  `vPREV`. If it fails, no release exists yet: this is the **first release** (§5).

## 2. Bump

Compute the new version from the lockstep version and the requested bump
(patch/minor/major). Bare invocation: propose a bump from what shipped (features →
minor, fixes only → patch) and confirm with the person before proceeding. Edit the
version field in all 9 package.json files together. First release: skip (§5).

## 3. Notes — drain the buffer

The notes are **not reconstructed** at release time: they accumulate in
`docs/changelog.md` as slices ship (one entry per product change, written for a
person *using* Lodekit — see the buffer's own rules header). Here:

- Take the buffer's `## New` / `## Fixed` sections verbatim as the release notes.
  Optionally draft one narrative line for the top if the release has a theme.
- **Completeness cross-check:** scan
  `gh pr list --state merged --base master --limit 50 --json title,mergedAt` (and
  `git log vPREV..HEAD --oneline`) for user-facing work with no buffer entry. If
  something is missing, **surface it to the person** — never silently add entries.
- Do not reword existing entries; editorial changes belong to the person in the
  release PR review.

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

  (The buffer's `## New`/`## Fixed` become `### New`/`### Fixed` under the version
  heading.)

- **Reset the buffer:** truncate `docs/changelog.md` back to its rules header
  (everything above and including the `---` separator), removing the drained entries.
- Branch `release/vX.Y.Z` off `master`; single commit `release: vX.Y.Z` containing
  the 9 version bumps + the changelog edit + the buffer reset.
- Push and open the PR: title **`release: vX.Y.Z`** (the workflow's trigger match —
  it extracts the version from the title, and the squash commit on `master` inherits
  it as its subject), body = the new changelog section's content without the
  `## X.Y.Z` heading line.
- **Stop.** The person reviews, edits the notes if desired, and merges. Never merge
  a release PR yourself.

## 5. First release (no `v*` tag exists)

The workspace already says `0.1.0` and it was never released: the first run is the
one permitted **zero-bump** release. Skip §2 entirely — version stays `0.1.0`. The
buffer was seeded with the initial-release narrative (what Lodekit is, plus its
headline capabilities); drain it like any other release — do not reconstruct the
history slice by slice.
