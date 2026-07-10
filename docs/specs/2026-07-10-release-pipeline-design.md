# Release pipeline — electron-builder packaging, mac arch matrix, PR-only dev loop, changelog

**Date:** 2026-07-10
**Status:** Approved

Supersedes and replaces the 2026-07-07 release-workflow design (approved, never
implemented, deleted with this spec). Incorporates the verdicts of the 2026-07-07
cross-platform release research (survey of eleven OSS Electron apps; report kept outside
the repo).

## 1. Goal

Two coupled outcomes, one loop:

- **Packaging that can grow past the arm64 Mac.** Migrate the manager from Electron
  Forge to **electron-builder** — the ecosystem-consensus tool — and ship **both mac
  architectures** (arm64 + x64). Windows and Linux are deferred until v1 (decided), but
  after this spec they are additional matrix rows and config targets, not tool
  migrations.
- **A release process.** Development lands on `master` exclusively via rebase-merged
  PRs; a `/release` skill assembles a semver release PR with **product-level** notes;
  merging that PR triggers a GitHub Actions workflow that builds both mac zips, tags the
  commit, and publishes a GitHub Release; the same notes live as a changelog page in the
  docs site.

Solo-developer scale throughout. Versioning cadence is lazy: releases are cut when the
person feels like shipping, and the version can sit still for a long time.

## 2. Packaging — Forge → electron-builder

Every surveyed project of Lodekit's shape ships on electron-builder; Forge's Windows
path is deprecated upstream. The real pipeline — `manager/scripts/prepare-bundle.mjs`
(pnpm-deploy the platform payload, download the pinned Node) — is tool-agnostic and
carries over untouched. What migrates is the thin packaging config:

| Forge (`forge.config.js`) | electron-builder |
| --- | --- |
| `name` / `appBundleId` | `productName: "Lodekit"` / `appId: "com.lodekit.manager"` |
| `extendInfo: { LSUIElement: true }` | `mac.extendInfo` — same key |
| `extraResource: build/node, build/platform` | `extraResources` — same `Resources/` layout |
| `osxSign: { identity: "-" }` (ad-hoc) | ad-hoc mac signing preserved; Developer ID stays the dormant toggle |
| `prune: false` + `ignore` regex | `files` whitelist: `package.json` + `src/` only, plus `npmRebuild: false` (manager has zero prod deps; nothing may walk pnpm's symlinked layout) |
| `maker-zip` (darwin) | `mac.target: zip`, per-arch |

Two deliberate choices:

- **`asar: false`.** electron-builder defaults to asar packing; we disable it to keep
  the current plain app-dir layout. Behavior parity beats novelty for the migration;
  turning asar on later is a one-line experiment.
- **Artifact naming continuity:** `artifactName` fixed to
  `Lodekit-darwin-${arch}-${version}.zip`, matching today's Forge output.

`make` stays `pnpm bundle && electron-builder …`. Electron version unchanged.

**Parity checklist** — the migration lands only when the packaged arm64 app passes all
of: menubar-only (no Dock icon, no app-switcher entry); `Resources/node` +
`Resources/platform` layout intact; ad-hoc signature valid (`codesign -dv`); runtime
boots as a direct child Node process and `better-sqlite3` loads; first-run install into
a fresh `~/Documents/Lodekit` works; clean quit through the supervisor.

## 3. mac artifacts — the arch matrix

`prepare-bundle.mjs`'s single Node-dist constant becomes a
`(platform, arch) → { url, sha256 }` table with `darwin-arm64` and `darwin-x64` entries.
The bundle script takes a target (`LODEKIT_BUNDLE_TARGET` env override, defaulting to
the host); electron-builder likewise defaults to the host arch, so each CI runner
builds its native target with no flags. The pinned Node version (hard-asserted in the
script) stays the single source of truth.

Two separate artifacts, no universal binary — universal would require lipo-ing the
bundled Node and merging dual-arch native modules (`better-sqlite3` ships neither),
which is the one surveyed practice that actively conflicts with our design. Cross-building
locally isn't wired (a cross target fails the bundle's native-module
assert by design); CI on an Intel runner is x64's verification.

## 4. Dev loop — PR-only, rebase-merged

Replaces CLAUDE.md's "commit directly to master" convention.

- **All changes to `master` land via PR.** No direct pushes — docs and typo fixes
  included. Slice work happens on a branch/worktree as today; finishing a slice means
  pushing the branch and raising a PR.
- **Rebase merge only.** Repo settings disable merge commits and squash merges and
  auto-delete head branches. Rebase-merging preserves the branch's fine-grained
  conventional commits on `master` and keeps history a single linear line. (A branch
  protection rule requiring PRs may be enabled, but at solo scale the merge-method
  settings plus convention are the enforcement.)
- **PR shape:** conventional-prefixed title (`feat:`, `fix:`, scoped variants); body
  with **Summary** (what changed and why, with bullets), **Notes** (decisions taken,
  known follow-ups), and **Test plan** (a checklist of what was verified).
- **Merging is the person's call.** The agent raises the PR and stops — the existing
  no-unattended-integration rule, unchanged.

Consequence: `master` stays fine-grained conventional commits, every one reachable from
a merged PR. The changelog does **not** lean on this granularity — its unit is the
shipped spec (§5) — but PR bodies are the evidence trail the release skill reads.

## 5. The release skill

Agent-agnostic: canonical home **`.agents/skills/release/SKILL.md`** (portable
frontmatter: `name`, `description`; body plain `git`/`gh`/`pnpm` instructions).
Discovery wiring: symlink `.claude/skills/release` → `../../.agents/skills/release`; a
pointer line in `AGENTS.md`.

Invoked as `/release patch|minor|major` (bare `/release` proposes a bump from what
shipped). Runs entirely locally:

1. **Pre-flight** — on `master`; clean tree; up to date with `origin`; `pnpm test`
   passes; all workspace `package.json` versions in lockstep (versioning design
   2026-07-06 §2); `gh` authenticated; no release PR already open; at least one shipped
   change since the last `v*` tag. Any failure stops with a report — nothing fixed
   silently.
2. **Bump** — edit the root and all workspace `package.json` files together.
3. **Notes — product-level, one entry per shipped spec.** The unit of the changelog is
   the product change, not the commit. The skill identifies the specs/slices shipped
   since the last `v*` tag (new `docs/specs/` entries and the feature work merged for
   them, with PR bodies via `gh` as the evidence trail) and drafts **one user-facing
   entry per product change**, written for a person *using* Lodekit. Notable fixes get
   a Fixed bucket; internal work, docs, and bookkeeping are dropped. The git log is
   evidence, never the outline.
4. **Changelog entry** — prepend the new section to the docs-site changelog page (§7).
5. **Release PR** — branch `release/vX.Y.Z`; single commit `release: vX.Y.Z` (bumps +
   changelog); PR titled bare `X.Y.Z` with the notes as body. Then stop: the person
   reviews, edits notes if desired, and merges — the merge is the release trigger.

`--dry-run` runs pre-flight and drafts notes, touches nothing.

**First release:** no `v*` tag exists and the workspace already says `0.1.0`, so the
first run is the one permitted zero-bump release — version stays `0.1.0`, notes
baseline is everything so far, summarized coarsely as an initial-release narrative
rather than reconstructed slice by slice.

## 6. GitHub Actions release workflow

`.github/workflows/release.yml` — the repo's first workflow.

- **Trigger:** `pull_request` type `closed` on `master`; job runs only if the PR merged
  **and** its title matches `^\d+\.\d+\.\d+$`. Everything else exits silently.
- **Guards (before building):** PR title version equals the root `package.json` version
  at the merged tip; tag `vX.Y.Z` does not already exist (idempotent re-runs).
- **Build — a two-row matrix:**

  | Runner | Target | Artifact |
  | --- | --- | --- |
  | Apple-silicon runner (`macos-14`+) | darwin-arm64 | zip, ad-hoc signed |
  | Intel runner (`macos-15-intel` at time of writing) | darwin-x64 | zip, ad-hoc signed |

  Each row: checkout the merged tip (`merge_commit_sha`); set up pnpm + the pinned Node
  (`prepare-bundle.mjs` hard-asserts the version); `pnpm install`; `make` with the arch
  flag; upload the zip as a build artifact. GitHub's Intel runner availability is a
  moving target — the label is pinned at implementation time and revisiting it is a
  one-line change. Linux/Windows arrive later as additional rows.
- **Publish (a separate job, only after every matrix row is green):** create tag
  `vX.Y.Z` on the merged tip — the workflow is the *only* thing that ever creates
  version tags — then create the GitHub Release: notes = the release PR body, both zips
  attached. Uses `gh` with the built-in `GITHUB_TOKEN`; workflow permissions
  `contents: write` and nothing more.
- **No tests in the workflow** — testing happened in the skill's pre-flight.

## 7. Changelog page

Single page `web/docs/src/content/docs/changelog.md`, added to the Starlight sidebar.
The release skill prepends one section per release, product-level:

```markdown
## 0.2.0 — 2026-08-01

Short narrative line about the release, if it has a theme.

### New
- **Gateways** — connect apps to external services with runtime-managed credentials…
- **Database store** — apps get a real relational store with migrations…

### Fixed
- Shed round-trip state reset…
```

Newest first; `X.Y.Z — date` headings give each release a stable anchor; entries are
written for Lodekit users, one per shipped product change. The GitHub Release notes are
this same text (the release PR body), so the two never diverge. One file is deliberate
YAGNI — splitting into a content collection (per-release pages, RSS) is a mechanical
migration later. The page renders whenever the docs site ships; until then it is still
the canonical changelog, readable in the repo.

## 8. Deferred seams

Each deferred item has a designed-in seam to land on later; all go to `roadmap.md`:

- **Linux** (research stage 2): XDG path branches (the runtime config comment already
  marks the spot), hand-written `.desktop` autostart, full-color tray PNGs,
  AppImage + deb targets, an `ubuntu-22.04` matrix row; document AppIndicator/libfuse2
  caveats.
- **Windows** (research stage 3): `%APPDATA%`/`%LOCALAPPDATA%` path branches,
  node.exe-at-dist-root layout, Node-native rewrite of the bundle script's shell-outs,
  **stdin-close shutdown sentinel** (Windows has no graceful SIGTERM; the manager
  closes the runtime's stdin, hard-kill after 5s as backstop), `.ico` tray icons,
  unsigned NSIS with the SmartScreen click-through documented, MCP `openInBrowser`
  Windows fix, a `windows-latest` row.
- **Signing:** mac Developer ID + notarization; Windows Azure Trusted Signing — both
  config toggles, no structural change.
- **Updates:** notify-only check first (manager polls the Releases API, one menubar
  hint + download link, a setting to silence it); `electron-updater` later —
  electron-builder's `latest*.yml` manifests make it additive, and it stays impossible
  on mac until Developer ID signing exists.
- **Per-PR CI tests:** natural now that PRs are mandatory, but not part of this spec.
- **Flathub** as the eventual Linux store channel.

## 9. Failure handling and verification

Invariants:

- The migration never regresses the working pipeline: electron-builder lands only after
  the §2 parity checklist passes on a packaged arm64 app.
- The skill never half-releases: pre-flight failures stop before anything is edited; a
  failure mid-draft leaves only a disposable local branch.
- The workflow never half-publishes: guards run before the build; tag + release happen
  only after every matrix row is green; re-runs are idempotent (existing tag → clean
  exit).
- A merged release PR whose build failed is recovered by re-running the workflow —
  nothing was published, no revert needed.

Verification: skill developed and tested via `--dry-run`; workflow YAML checked with
`actionlint` before commit; trigger safety (ordinary PRs don't match the semver regex)
observed on the first feature PR. The end-to-end proof is cutting the first real
release — the loop is not done until one release has gone through it.

## 10. Rollout order

Each a slice on the `ci` branch (landing via PRs once the conventions slice merges):

1. **electron-builder migration** — config translation, arm64 `make`, full §2 parity
   smoke.
2. **Arch table + x64** — dist table in `prepare-bundle.mjs`, arch-aware `make`,
   optional Rosetta smoke.
3. **Conventions** — CLAUDE.md branching/release rewrite (PR-only, rebase merge, PR
   shape), repo merge-method settings, `AGENTS.md` pointer.
4. **Changelog page scaffold** in `web/docs` + sidebar entry.
5. **Release skill** — `.agents/skills/release/SKILL.md` + `.claude/skills` symlink.
6. **`.github/workflows/release.yml`.**
7. **Cut v0.1.0** — the first real release validates the loop end-to-end (the
   project's definition-of-done convention applied to itself).

## 11. Out of scope

Docs-site deploy; prereleases (`X.Y.Z-beta.N` titles can gate a `--prerelease` flag
later); npm publishing under the `@lodekit/*` scope; all Windows/Linux product work
(seams only, §8).
