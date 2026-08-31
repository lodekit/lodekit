---
name: lk-release
description: Cuts a release — pre-flight, the lockstep version bump, the changelog drain, the steering audit, and the release PR whose merge builds and tags. Runs when the person asks for a release.
disable-model-invocation: true
---

# Release

Every step runs from the repo root, in order. The release PR is the deliverable; the
person reviews it, edits the notes, and merges.

## Pre-flight

All of these pass before anything is written. On any failure, stop and report which
check failed — a half-cut release leaves a bumped tree with no PR behind it.

- On `master`, clean, and up to date with `origin/master`: `git fetch origin --prune`,
  then `git rev-parse --abbrev-ref HEAD` prints `master`, `git status --short` prints
  nothing, and `git rev-parse HEAD origin/master` prints two identical lines.
- `pnpm test` passes.
- The same version in all 10 package.json files:

```bash
grep -h '"version"' package.json \
  packages/{engine,mcp,sdk,skill,ui,integration-tests}/package.json \
  web/{main,docs}/package.json manager/package.json | sort -u
```

  One line means they agree; more than one means a package drifted.

- `gh auth status` works.
- No release PR is open already:
  `gh pr list --search 'release: in:title' --state open`.
- `docs/CHANGELOG.md` has at least one entry under a category heading.

## Bump

Features → minor, fixes only → patch (breaking → major once out of 0.x). Confirm the
target version with the person using the harness's structured question tool before
writing anything: the bump is where the release stops being reversible by doing nothing.

Rewrite the `"version"` field in the same ten files, leaving the rest of each file's
formatting untouched:

```bash
node -e 'const fs=require("fs");const [v,...f]=process.argv.slice(1);for(const p of f){const s=fs.readFileSync(p,"utf8");fs.writeFileSync(p,s.replace(/"version": "[^"]+"/,`"version": "${v}"`));}' \
  X.Y.Z package.json packages/{engine,mcp,sdk,skill,ui,integration-tests}/package.json \
  web/{main,docs}/package.json manager/package.json
```

Run the grep above again: one line, the new version.

## Changelog

Move the buffer's entries out of `docs/CHANGELOG.md` and into
`web/docs/src/content/docs/changelog.md` verbatim, category headings and all, under a
prepended heading:

`## [X.Y.Z](https://github.com/lodekit/lodekit/compare/vPREV...vX.Y.Z) (YYYY-MM-DD)`

`vPREV` is the tag this release follows. This heading shape and the category headings
are the current rule (dev-flow v3, D14); the 0.1.0 entry already in the file predates
it and keeps its own heading — never restyle older entries.

Cross-check what merged since the last release for loggable work that never reached
the buffer:

```bash
gh pr list --state merged --search 'merged:>=<last release date>' --json number,title
```

Report `feat`, `fix`, `perf`, and `refactor` PRs missing an entry to the person, and
never add entries silently — whoever shipped the work decides how it reads.

Reset the buffer to its rules header: the heading, the paragraph under it, and the
rules list down to and including the `---`, with nothing below.

## Steering audit

Check each claim in `docs/ARCHITECTURE.md` and `docs/DEFINITIONS.md` against the code,
and report every claim as verified, stale, or missing. The report goes in the release
PR body, where the stale ones become the next backlog items.

## Branch and PR

Branch `release/vX.Y.Z`, one commit `release: vX.Y.Z`, PR title the same — the workflow
matches that title exactly. The body is the release notes (the drained entries) plus
the audit report, written with `--body-file` and read back with `gh pr view --json body`
after creation, since the body ships as the published release notes.

Merging that PR triggers `.github/workflows/release.yml`, which builds the mac zips,
tags `vX.Y.Z`, and publishes the GitHub Release. The workflow is the only creator of
`v*` tags: never tag by hand, and never merge a release PR yourself.
