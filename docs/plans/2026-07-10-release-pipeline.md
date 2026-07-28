# Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate manager packaging from Electron Forge to electron-builder, ship both mac architectures, and build the release loop: PR-only dev conventions, docs changelog page, `/release` skill, and a PR-triggered GitHub Actions release workflow.

**Architecture:** Spec at `docs/specs/2026-07-10-release-pipeline-design.md`. The packaging config migrates tool-for-tool (behavior parity, checklist-gated); `prepare-bundle.mjs` gains a per-target Node dist table; the release process is a skill (local, drafts a release PR) plus a workflow (remote, builds/tags/publishes only on merged semver-titled PRs).

**Tech Stack:** electron-builder (replacing @electron-forge/*), GitHub Actions (macos-14 + macos-13 runners), Starlight docs page, portable agent skill (`.agents/skills/`).

## Global Constraints

- Work happens on the `ci` branch in this worktree (`~/Code/worktrees/lodekit/stack`). Never fold into `master` — the person integrates.
- Node is pinned at **24.12.0** (`prepare-bundle.mjs` hard-asserts it; this machine runs it — verify with `node --version` before any `bundle`/`make`).
- Run all `pnpm` commands from the **repo root** (`pnpm --filter …`). Never `pnpm install` with CWD inside `manager/`.
- All workspace versions are in lockstep at **0.1.0**: root + `packages/{runtime,mcp,sdk,skill,ui}` + `web/{main,docs}` + `manager` (9 package.json files).
- GitHub repo: `lodekit/lodekit`. Default branch `master`.
- Commit messages: conventional prefixes, **no `Co-Authored-By` trailers**.
- Surgical changes: touch only what the task names; match existing style.
- `CLAUDE.md` is a symlink `claude.md -> agents.md` — edit **`agents.md`**.

---

### Task 1: electron-builder migration

**Files:**
- Modify: `manager/package.json` (deps + scripts)
- Create: `manager/electron-builder.yml`
- Delete: `manager/forge.config.js`, `manager/.npmrc`
- Modify: `manager/.gitignore` (add `dist/`)
- Modify: `agents.md` (manager architecture line; Build & Test `.npmrc` gotcha)

**Interfaces:**
- Produces: `pnpm --filter @lodekit/manager make` → `manager/dist/Lodekit-darwin-<arch>-0.1.0.zip` + `manager/dist/mac-arm64/Lodekit.app`. Task 6's workflow depends on this exact command and artifact path.

- [ ] **Step 1: Swap dependencies**

From the repo root:

```bash
pnpm --filter @lodekit/manager remove @electron-forge/cli @electron-forge/maker-zip
pnpm --filter @lodekit/manager add -D electron-builder
```

Expected: lockfile updated; `manager/package.json` devDependencies now `electron`, `electron-builder`, `vitest`.

- [ ] **Step 2: Replace scripts in `manager/package.json`**

```json
"scripts": {
  "start": "electron .",
  "test": "vitest run",
  "bundle": "node scripts/prepare-bundle.mjs",
  "package": "pnpm bundle && electron-builder --dir",
  "make": "pnpm bundle && electron-builder"
}
```

(`electron-forge start` becomes plain `electron .` — `main` is already `src/main.js`. electron-builder builds the host arch by default; CI runners each build their native arch, so no arch flags in the scripts.)

- [ ] **Step 3: Create `manager/electron-builder.yml`**

```yaml
appId: com.lodekit.manager
productName: Lodekit
# Bundle inputs live in build/ — keep electron-builder's buildResources dir
# (default "build") away from it.
directories:
  output: dist
  buildResources: build-resources
# Zero prod dependencies; nothing may walk pnpm's symlinked node_modules.
npmRebuild: false
# Behavior parity with the Forge build: plain app dir, no asar packing.
asar: false
files:
  - src/**
  - package.json
# Bundle inputs from scripts/prepare-bundle.mjs → Resources/node, Resources/platform.
extraResources:
  - from: build/node
    to: node
  - from: build/platform
    to: platform
mac:
  target: zip
  # Ad-hoc signature for the assisted alpha (same "-" identity Forge used).
  # Developer ID is the dormant toggle: replace with the certificate name when it exists.
  identity: "-"
  # Menubar-only: no Dock icon, no app switcher entry.
  extendInfo:
    LSUIElement: true
  artifactName: "Lodekit-darwin-${arch}-${version}.zip"
```

- [ ] **Step 4: Delete Forge leftovers**

```bash
git rm manager/forge.config.js manager/.npmrc
echo "dist/" >> manager/.gitignore
```

`manager/.npmrc` existed only to satisfy Forge's dev-start check (`node-linker=hoisted`) and is the source of the "never install inside manager/" trap — with Forge gone it goes too.

- [ ] **Step 5: Update `agents.md`**

In the Architecture section's manager bullet, change:

`Packaged (\`make\`): an ad-hoc-signed arm64 \`Lodekit.app\`` → `Packaged (\`make\`, electron-builder): an ad-hoc-signed \`Lodekit.app\``

In Build & Test, the `pnpm install` bullet's **second gotcha** (the sentences from "**Second gotcha:** never run `pnpm install` with CWD inside `manager/`…" through "…node_modules wipe + `pnpm install`.") is deleted — the `.npmrc` that caused it is gone.

- [ ] **Step 6: Verify dev start still works**

```bash
pnpm --filter @lodekit/manager exec electron --version
```

Expected: `v33.x.x` (proves the electron binary resolves without the hoisted `.npmrc`). Do not launch the full app here — a dev runtime may own port 7777.

- [ ] **Step 7: Run the packaged build**

```bash
node --version   # must print v24.12.0
pnpm --filter @lodekit/manager make
```

Expected: bundle assertions pass (they're unchanged), then electron-builder packages and signs. Output exists:

```bash
ls manager/dist/Lodekit-darwin-arm64-0.1.0.zip manager/dist/mac-arm64/Lodekit.app
```

- [ ] **Step 8: Parity checklist (spec §2 — the migration lands only if ALL pass)**

```bash
APP=manager/dist/mac-arm64/Lodekit.app
# 1. Ad-hoc signature
codesign -dv "$APP" 2>&1 | grep -q "Signature=adhoc" && echo SIGN-OK
# 2. Menubar-only
plutil -p "$APP/Contents/Info.plist" | grep -q '"LSUIElement" => 1' && echo LSUI-OK
# 3. Resources layout
ls "$APP/Contents/Resources/node/bin/node" "$APP/Contents/Resources/platform/runtime/package.json" >/dev/null && echo RES-OK
# 4. App dir is plain (asar off) with only package.json + src
ls "$APP/Contents/Resources/app/src/main.js" >/dev/null && [ ! -e "$APP/Contents/Resources/app.asar" ] && echo APP-OK
# 5. Bundled node loads better-sqlite3 from the payload
(cd "$APP/Contents/Resources/platform/runtime" && "../../node/bin/node" -e "require('better-sqlite3')") && echo ABI-OK
```

Expected: all five `*-OK` lines. If `codesign` does not report `adhoc`: first try removing `identity: "-"` and running `make` with `CSC_IDENTITY_AUTO_DISCOVERY=false` (recent electron-builder ad-hoc signs mac builds when no identity resolves); whichever config yields `Signature=adhoc` **and** keeps the other four checks green is the one committed — record the outcome in the commit message.

- [ ] **Step 9: Launch smoke (isolated HOME — covers first-run install)**

Check port 7777 first: `lsof -nP -iTCP:7777 -sTCP:LISTEN`. **If occupied, STOP and surface to the orchestrator — never kill a process you didn't start.** If free, run the packaged app against a scratch HOME (`os.homedir()` honors `$HOME`, so the manager sees a fresh machine and must not touch the real one):

```bash
FAKEHOME=$(mktemp -d)
HOME="$FAKEHOME" "$APP/Contents/MacOS/Lodekit" & APP_PID=$!
sleep 20
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: lodekit.localhost' http://127.0.0.1:7777/   # expect 200
ls "$FAKEHOME/Documents/Lodekit/apps"                                                          # expect showcase apps (first-run install)
ls "$FAKEHOME/Library/Application Support/Lodekit"                                             # expect ONLY platform files (settings.json / runtime.pid) — no Chromium profile (Cache/Cookies/GPUCache)
kill $APP_PID
```

Expected: `200`; showcase apps installed; the platform state dir free of Chromium-profile dirs (electron-builder's `productName` handling must not move Electron's `userData` into `~/Library/Application Support/Lodekit` — the trap documented in `roadmap.md` under "Other deferred items"). If a Chromium profile appears there, pin `userData` explicitly in `main.js` per that roadmap note before proceeding.

- [ ] **Step 10: Manager tests still pass**

```bash
pnpm --filter @lodekit/manager test
```

Expected: all vitest suites (first-run, logs, paths, settings, supervisor) PASS.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(manager): migrate packaging from Electron Forge to electron-builder

Config translated 1:1 (extraResources, LSUIElement, ad-hoc identity, plain
app dir via asar:false, npmRebuild:false); prepare-bundle.mjs untouched.
Forge-only manager/.npmrc removed — the install-inside-manager trap is gone.
Parity checklist (spec §2) passed on the packaged arm64 app."
```

---

### Task 2: per-arch Node dist table + x64

**Files:**
- Modify: `manager/scripts/prepare-bundle.mjs:11-16` (constants) and `:50-51,70` (marker)

**Interfaces:**
- Consumes: Task 1's `make` flow (`pnpm bundle && electron-builder`).
- Produces: bundle target = host `platform-arch` by default, `LODEKIT_BUNDLE_TARGET` env override; `darwin-x64` pinned. Task 6's x64 matrix row relies on host detection on the Intel runner.

- [ ] **Step 1: Confirm the darwin-x64 sha**

```bash
curl -s https://nodejs.org/dist/v24.12.0/SHASUMS256.txt | grep 'darwin-x64.tar.gz'
```

Expected: `b82ea4c62fd08e250cab59d625e75d77cc5b0a3d60c6698ebee4545c88a169c5  node-v24.12.0-darwin-x64.tar.gz` (already pinned in Step 2's table — this step just re-verifies it against nodejs.org).

- [ ] **Step 2: Replace the dist constants**

Replace lines 12–16 of `manager/scripts/prepare-bundle.mjs`:

```js
// The one place the Lodekit-local Node version is pinned (spec §3).
const NODE_VERSION = "24.12.0";
// sha256 per dist tarball, pinned with the version (verified against
// nodejs.org's SHASUMS256.txt when each pin was set).
const NODE_SHA256S = {
  "darwin-arm64": "319f221adc5e44ff0ed57e8a441b2284f02b8dc6fc87b8eb92a6a93643fd8080",
  "darwin-x64": "b82ea4c62fd08e250cab59d625e75d77cc5b0a3d60c6698ebee4545c88a169c5",
};
// Host by default — CI builds each arch on a native runner. LODEKIT_BUNDLE_TARGET
// overrides for experiments; a cross target fails assertNativeModule by design.
const TARGET = process.env.LODEKIT_BUNDLE_TARGET ?? `${process.platform}-${process.arch}`;
const NODE_DIST = `node-v${NODE_VERSION}-${TARGET}`;
const NODE_SHA256 = NODE_SHA256S[TARGET];
if (!NODE_SHA256) throw new Error(`No pinned Node dist for target ${TARGET}`);
```

- [ ] **Step 3: Make the fetch marker target-aware**

In `fetchNode()`, the marker must invalidate when the target changes, not just the version. Change the read (line 51) and write (line 70):

```js
const MARKER_VALUE = `${NODE_VERSION}-${TARGET}`;
```

```js
if (fs.existsSync(marker) && fs.readFileSync(marker, "utf8") === MARKER_VALUE) return;
```

```js
fs.writeFileSync(marker, MARKER_VALUE);
```

(Declare `MARKER_VALUE` next to the other constants from Step 2.)

- [ ] **Step 4: Verify the arm64 path end-to-end**

```bash
pnpm --filter @lodekit/manager bundle
```

Expected: the stale marker (`24.12.0` ≠ `24.12.0-darwin-arm64`) triggers a re-stage from the cached tarball (no re-download), all assertions pass, final line `Bundle inputs ready: …`.

- [ ] **Step 5: Verify the unknown-target guard**

```bash
LODEKIT_BUNDLE_TARGET=linux-x64 pnpm --filter @lodekit/manager bundle 2>&1 | grep "No pinned Node dist"
```

Expected: the error prints (exit non-zero).

- [ ] **Step 6: Commit**

```bash
git add manager/scripts/prepare-bundle.mjs
git commit -m "feat(manager): per-target Node dist table in prepare-bundle

darwin-arm64 + darwin-x64 pinned; target defaults to the host so CI runners
each build their native arch. x64 is verified by CI (spec §3) — a cross
target on this machine fails assertNativeModule by design."
```

---

### Task 3: PR-only dev loop conventions

**Files:**
- Modify: `agents.md` (Conventions section: Branching + Linear history bullets)
- Remote: repo merge-method settings via `gh api`

**Interfaces:**
- Produces: the conventions Task 5's skill and Task 6's workflow assume (rebase-merge-only PRs, release PR titled bare `X.Y.Z`).

- [ ] **Step 1: Rewrite the branching conventions in `agents.md`**

Replace the two bullets `- **Branching:** Trunk-based — commit directly to master. No feature branches.` and the entire `- **Linear history:** …` bullet (including all its sub-bullets) with:

```markdown
- **Branching:** All changes to `master` land via PR — no direct pushes, docs and
  typos included. Slice work happens on a branch/worktree; finishing a slice means
  pushing the branch and raising a PR.
  - PRs are **rebase-merged only** (repo settings disable merge commits and squash
    merges; branches auto-delete on merge). `master` stays a single linear line of
    fine-grained conventional commits — `git rebase master` before raising or
    updating a PR; never a plain `git merge`.
  - PR shape: conventional-prefixed title (`feat:`, `fix:`, scoped variants); body
    with **Summary** (what changed and why), **Notes** (decisions taken, known
    follow-ups), and **Test plan** (checklist of what was verified).
  - **Merging is the person's call.** The agent raises the PR and stops — never
    merge unattended.
  - Regenerate `pnpm-lock.yaml` conflicts with `pnpm install --lockfile-only` rather than hand-merging.
- **Releases:** `/release` (skill at `.agents/skills/release/SKILL.md`) assembles a
  semver release PR with product-level notes — one changelog entry per shipped spec,
  not per commit. Merging it triggers the GitHub release build; the workflow is the
  only creator of `v*` tags.
```

- [ ] **Step 2: Set the repo merge-method settings**

```bash
gh api -X PATCH repos/lodekit/lodekit \
  -F allow_merge_commit=false -F allow_squash_merge=false \
  -F allow_rebase_merge=true -F delete_branch_on_merge=true
```

Verify:

```bash
gh api repos/lodekit/lodekit --jq '{merge_commit: .allow_merge_commit, squash: .allow_squash_merge, rebase: .allow_rebase_merge, auto_delete: .delete_branch_on_merge}'
```

Expected: `{"merge_commit":false,"squash":false,"rebase":true,"auto_delete":true}`. (No branch protection rule — merge-method settings plus convention are the enforcement at solo scale, spec §4.)

- [ ] **Step 3: Roadmap entries for the deferred seams (spec §8)**

In `roadmap.md` under `## Other deferred items`:

1. **Fix the stale Forge NOTE** in the `- **Electron packaging + Lodekit-local Node**` bullet (under `## Parked from the monorepo migration`): replace the sentences from "NOTE (resolved by the slice): no workspace-root `node-linker=hoisted` was needed." through "…only for Forge's dev-start config check." with:

```markdown
  NOTE (resolved by the slice, re-grounded 2026-07-10): the packaged manager bundles no
  node_modules at all (zero prod deps; the platform ships via `extraResources`), and
  packaging is electron-builder (`manager/electron-builder.yml`, `npmRebuild: false`) —
  the Forge-era `manager/.npmrc` hoisted-linker workaround is gone.
```

2. **Add these bullets** (skip any whose content already exists — extend the existing bullet instead; Developer ID signing already has one, leave it):

```markdown
- **Linux support** — deferred until v1 (release-pipeline spec 2026-07-10 §8): XDG path
  branches (runtime config comment marks the spot), hand-written `.desktop` autostart,
  full-color tray PNGs, AppImage + deb targets, an `ubuntu-22.04` release-matrix row;
  document AppIndicator/libfuse2 caveats.
- **Windows support** — deferred until v1 (release-pipeline spec §8): `%APPDATA%` path
  branches, node.exe-at-dist-root layout, Node-native rewrite of the bundle script's
  shell-outs, stdin-close shutdown sentinel (no graceful SIGTERM on Windows), `.ico`
  tray icons, unsigned NSIS + SmartScreen click-through docs, MCP `openInBrowser`
  Windows fix, a `windows-latest` matrix row. Azure Trusted Signing (~$10/mo) as the
  signing toggle when adoption justifies it.
- **Update surfacing** — notify-only first (manager polls GitHub Releases, menubar hint
  + download link, a setting to silence it); `electron-updater` later — electron-builder's
  `latest*.yml` manifests make it additive, and mac auto-update stays impossible until
  Developer ID signing exists (release-pipeline spec §8).
- **Per-PR CI tests** — natural now that all changes land via PR; not part of the
  release-pipeline slice.
- **Flathub** — the eventual Linux store channel (after Linux support).
```

- [ ] **Step 4: Commit**

```bash
git add agents.md roadmap.md
git commit -m "docs: PR-only rebase-merge dev loop; release-pipeline roadmap seams

Replaces direct-to-master trunk flow (spec 2026-07-10 §4). Repo settings
now allow rebase merge only, with auto-delete on merge. Roadmap gains the
deferred cross-platform seams (spec §8) and drops the stale Forge NOTE."
```

---

### Task 4: changelog page scaffold

**Files:**
- Create: `web/docs/src/content/docs/changelog.md`
- Modify: `web/docs/astro.config.mjs` (sidebar)

**Interfaces:**
- Produces: the page Task 5's skill prepends release sections to (insertion point: directly above the first `## ` heading, or at end of file when none exists yet).

- [ ] **Step 1: Create `web/docs/src/content/docs/changelog.md`**

```markdown
---
title: Changelog
---

Release history for Lodekit — one entry per product change, written for people using
Lodekit. Every release also appears on
[GitHub Releases](https://github.com/lodekit/lodekit/releases) with the same notes.
```

(No release sections yet — the first `/release` run adds `## 0.1.0 — …`.)

- [ ] **Step 2: Add the sidebar entry in `web/docs/astro.config.mjs`**

```js
sidebar: [
  { label: "Getting started", slug: "getting-started" },
  { label: "Changelog", slug: "changelog" },
],
```

- [ ] **Step 3: Verify the docs site builds**

```bash
pnpm --filter @lodekit/web-docs build
```

Expected: Astro/Starlight build completes with no errors and the output includes a `changelog` page (`ls web/docs/dist/changelog/index.html`).

- [ ] **Step 4: Commit**

```bash
git add web/docs/src/content/docs/changelog.md web/docs/astro.config.mjs
git commit -m "feat(docs): changelog page scaffold + sidebar entry"
```

---

### Task 5: the release skill

**Files:**
- Create: `.agents/skills/release/SKILL.md`
- Create: symlink `.claude/skills/release` → `../../.agents/skills/release`
- Modify: `agents.md` (skills pointer line in Conventions)

**Interfaces:**
- Consumes: changelog page (Task 4), conventions (Task 3).
- Produces: release PRs titled bare `X.Y.Z` from branch `release/vX.Y.Z`, body = the changelog section content — exactly what Task 6's workflow triggers on.

- [ ] **Step 1: Create `.agents/skills/release/SKILL.md`**

````markdown
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
````

- [ ] **Step 2: Wire discovery**

```bash
mkdir -p .claude/skills
ln -s ../../.agents/skills/release .claude/skills/release
cat .claude/skills/release/SKILL.md | head -3   # symlink resolves
```

Expected: the frontmatter prints.

- [ ] **Step 3: Add the pointer line in `agents.md`**

In the Conventions section, extend the `- **Releases:** …` bullet (added in Task 3) with one sentence at its end:

```markdown
  Portable agent skills live in `.agents/skills/` (Claude Code discovers them via the
  `.claude/skills` symlinks).
```

- [ ] **Step 4: Commit**

```bash
git add .agents .claude/skills agents.md
git commit -m "feat: /release skill — semver bump, product-level notes, release PR

Portable home .agents/skills/release/SKILL.md, symlinked into .claude/skills.
Runs locally through PR creation; merging is the person's call (spec §5)."
```

(If `git status` shows `.claude/worktrees` or other unrelated `.claude/` content, add only `.claude/skills` — check `.gitignore` handling; the symlink itself must be committed.)

---

### Task 6: GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: Task 1's `pnpm --filter @lodekit/manager make` + `manager/dist/Lodekit-darwin-<arch>-<version>.zip`; Task 5's release PR shape (bare semver title, notes body).
- Produces: tag `vX.Y.Z` + GitHub Release with both zips.

- [ ] **Step 1: Create `.github/workflows/release.yml`**

```yaml
name: release

# Fires on every closed PR against master; everything below exits silently unless
# the PR merged AND its title is a bare semver — the release skill's PRs only.
on:
  pull_request:
    types: [closed]
    branches: [master]

permissions:
  contents: write

jobs:
  check:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    outputs:
      release: ${{ steps.final.outputs.release }}
      version: ${{ steps.guard.outputs.version }}
    steps:
      - name: Match release PR title
        id: guard
        env:
          TITLE: ${{ github.event.pull_request.title }}
        run: |
          if [[ "$TITLE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "release=true" >> "$GITHUB_OUTPUT"
            echo "version=$TITLE" >> "$GITHUB_OUTPUT"
          else
            echo "release=false" >> "$GITHUB_OUTPUT"
          fi
      - uses: actions/checkout@v4
        if: steps.guard.outputs.release == 'true'
        with:
          ref: ${{ github.event.pull_request.merge_commit_sha }}
      - name: Guard — PR title matches package.json version
        if: steps.guard.outputs.release == 'true'
        env:
          VERSION: ${{ steps.guard.outputs.version }}
        run: |
          PKG=$(node -p "require('./package.json').version")
          if [ "$PKG" != "$VERSION" ]; then
            echo "::error::release PR title $VERSION != package.json $PKG"
            exit 1
          fi
      - name: Guard — tag does not exist (idempotent re-runs)
        if: steps.guard.outputs.release == 'true'
        id: tag
        env:
          VERSION: ${{ steps.guard.outputs.version }}
        run: |
          if git ls-remote --exit-code --tags origin "refs/tags/v$VERSION" >/dev/null; then
            echo "v$VERSION already exists — nothing to do."
            echo "release=false" >> "$GITHUB_OUTPUT"
          fi
      - name: Final verdict
        id: final
        run: |
          if [ "${{ steps.guard.outputs.release }}" = "true" ] && [ "${{ steps.tag.outputs.release }}" != "false" ]; then
            echo "release=true" >> "$GITHUB_OUTPUT"
          else
            echo "release=false" >> "$GITHUB_OUTPUT"
          fi

  build:
    needs: check
    if: needs.check.outputs.release == 'true'
    strategy:
      fail-fast: true
      matrix:
        include:
          - runner: macos-14   # Apple silicon → darwin-arm64
            arch: arm64
          - runner: macos-13   # Intel → darwin-x64 (runner label: revisit as GitHub retires Intel images)
            arch: x64
    runs-on: ${{ matrix.runner }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.merge_commit_sha }}
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "24.12.0"   # prepare-bundle.mjs hard-asserts this version
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @lodekit/manager make
      - uses: actions/upload-artifact@v4
        with:
          name: mac-${{ matrix.arch }}
          path: manager/dist/Lodekit-darwin-${{ matrix.arch }}-*.zip
          if-no-files-found: error

  publish:
    needs: [check, build]
    if: needs.check.outputs.release == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.merge_commit_sha }}
      - uses: actions/download-artifact@v4
        with:
          path: artifacts
          merge-multiple: true
      - name: Tag and publish the release
        env:
          GH_TOKEN: ${{ github.token }}
          VERSION: ${{ needs.check.outputs.version }}
          BODY: ${{ github.event.pull_request.body }}
        run: |
          printf '%s\n' "$BODY" > notes.md
          gh release create "v$VERSION" \
            --target "${{ github.event.pull_request.merge_commit_sha }}" \
            --title "v$VERSION" \
            --notes-file notes.md \
            artifacts/*.zip
```

Note on `pnpm/action-setup@v4` with no version: it reads the `packageManager` field from the root `package.json`. That field is pinned on `master` (commit `ee78a66`, pnpm 10.30.3) but **not on the `ci` branch** — after rebasing `ci` onto current `master` it will be present. Verify at rebase time: `grep packageManager package.json`; if absent, add `version: 10.30.3` to the action instead.

- [ ] **Step 2: Lint the workflow**

```bash
command -v actionlint || brew install actionlint
actionlint .github/workflows/release.yml
```

Expected: no output (clean). Fix anything it reports.

- [ ] **Step 3: Sanity-check the trigger logic offline**

Confirm by reading (no way to execute locally): a merged PR titled `feat: something` → `check` runs, `guard` sets `release=false`, `build`/`publish` skip. A closed-unmerged PR → `check` skipped entirely. A merged `0.1.0` PR with tag `v0.1.0` already present → `final` sets `release=false`, clean green run, nothing published.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: release workflow — merged semver PR builds, tags, publishes

Two-row mac matrix (arm64 on macos-14, x64 on macos-13); tag + GitHub
Release only after both rows are green; existing tag = clean no-op re-run.
The workflow is the only creator of v* tags (spec §6)."
```

---

### Task 7: branch finalization + first release (human-gated)

**Files:** none new — process only.

- [ ] **Step 1: Full test suite**

```bash
pnpm test
```

Expected: all workspace suites pass.

- [ ] **Step 2: Rebase onto master and push the branch**

```bash
git fetch origin && git rebase origin/master
pnpm install --lockfile-only   # only if the rebase produced lockfile conflicts
pnpm test                      # re-verify after rebase
git push -u origin ci
```

Also apply the Task 6 note: after the rebase, `grep packageManager package.json` — if present, the bare `pnpm/action-setup@v4` stands; if absent, edit the workflow to pin `version: 10.30.3` and amend.

- [ ] **Step 3: Raise the PR (the new dev loop's first PR)**

Title: `feat: release pipeline — electron-builder packaging, /release skill, release workflow`. Body follows the Task 3 PR shape: **Summary** (spec link + what each commit delivers), **Notes** (identity-config outcome from Task 1 Step 8; Intel-runner-label caveat; workflow must be on `master` before it can fire), **Test plan** (checklist: parity checklist passed, launch smoke 200, bundle re-run green, docs build green, actionlint clean, `pnpm test` green).

**STOP after raising the PR.** Merging is the person's call (rebase merge — the first exercise of the new repo settings). Everything below happens after the person merges, in a follow-up session on `master`.

- [ ] **Step 4 (post-merge, person-initiated): cut v0.1.0**

On `master`: run `/release --dry-run` first and review the draft; then `/release` — first-release path (§5 of the skill: zero-bump, initial-release narrative). The skill stops at the release PR; the person merges it; the workflow builds both zips, tags `v0.1.0`, publishes the Release. Verify: `gh release view v0.1.0` shows both `Lodekit-darwin-{arm64,x64}-0.1.0.zip`. Observed trigger safety: the Step 3 feature PR (non-semver title) must show a silently-skipped workflow run. This closes the spec's definition of done.
```
