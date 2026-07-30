# Open-source release readiness — design

**Date:** 2026-07-28
**Status:** proposed
**Provenance:** research dossier `lodekit-oss-readiness.html` (16 July 2026, five-angle
deep-research pass, 23 sources, adversarially verified); decisions taken in the
brainstorming session recorded as bead `lk-av9s`.

---

## 1. Goal & non-goals

**Goal:** put everything in the codebase in place so that flipping
`github.com/lodekit/lodekit` to public is a settings change and nothing more — licensing,
notices, launch files, and a sweep for anything that shouldn't be public.

**Non-goals — these are launch-gate items owned outside this spec (§8):**

- The visibility flip itself. The repo stays private until the gate is clear.
- Security findings #87–#97. They stay open in Issues and are fixed on their own
  schedule; the repo does not go public before they are resolved.
- Entity, funding, and trademark registration. None of it touches the codebase.
- Developer ID signing and notarization — the beta's job.
- npm publication. Not intended for now; all manifests stay `private: true`.

---

## 2. Decisions taken

| Decision | Choice | Rationale |
|---|---|---|
| License model | AGPL-3.0-**only** default + Apache-2.0 carve-outs | Copyleft on the product, permissive on everything a user's own app touches (§3.1). `-only` rather than `-or-later`: `-or-later` delegates future licensing to the FSF irreversibly; with ~100% of copyright held by one author, relicensing forward stays possible at any time. Taking the option costs nothing; giving it away can't be undone. |
| Copyright holder | `The Lodekit Authors` | No Lodekit entity exists yet, and copyright can't be assigned to one that doesn't. Idiomatic (Go, Kubernetes), always true, keeps a legal name out of every file header, and assigns cleanly to a future Lodekit Org. |
| Marks | Reserved, fork-friendly, unregistered | Research §5 concludes copyright over agent-written code is weak; §6 concludes trademark is the backstop that doesn't depend on it. A NOTICE paragraph costs nothing and upgrades cleanly if the mark is ever registered. No `TRADEMARKS.md` — premature without a registration. |
| `docs/PRODUCT.md` | Publishes as-is | Consistent with the transparency posture; content is fair-minded by its own rule ("punch at systems, never at people"). |
| Contributions | Closed for now, opened eventually | No DCO/CLA machinery, copyright stays in one pair of hands, and no PR surface to flood. |
| Docs license | Apache-2.0, not CC-BY-4.0 | CC-BY is the more correct instrument for prose, but a third license family buys nothing practical. Revisit if docs get reused enough to matter. |

---

## 3. License architecture

### 3.1 The boundary

One rule generates it: **anything a user's own app imports, or copies as a starting
point, must be permissive.** AGPL on `@lodekit/sdk` or `@lodekit/ui` would mean every
personal tool built on Lodekit arguably inherits AGPL — which defeats the product's
reason to exist.

| Path | SPDX | Reason |
|---|---|---|
| `packages/engine/**` | `AGPL-3.0-only` | the product |
| `manager/**` | `AGPL-3.0-only` | the product's shell |
| `packages/integration-tests/**` | `AGPL-3.0-only` | tests the engine, never shipped |
| `web/main/**` | `AGPL-3.0-only` | brand surface, no reuse intent |
| `packages/sdk/**` | `Apache-2.0` | **imported by every user app** |
| `packages/ui/**` | `Apache-2.0` | **imported by every user app's frontend** |
| `packages/mcp/**` | `Apache-2.0` | protocol client; third parties should be able to write their own |
| `packages/skill/**` | `Apache-2.0` | agent-facing content, meant to be adapted |
| `root/apps/**`, `root/gateways/**`, `root/themes/**` | `Apache-2.0` | examples people copy wholesale |
| `docs/**`, `web/docs/**` | `Apache-2.0` | documentation |
| `.agents/**`, `.claude/skills/**` | `MIT` (upstream) | vendored; notices preserved per §4.1 |
| vendored files inside AGPL/Apache trees | per-file SPDX | §4.1 |

`web/docs/**` is Apache wholesale rather than splitting content from Starlight
scaffold — a seam there buys nothing.

### 3.2 Mechanism: `REUSE.toml`, not per-file headers

Full REUSE compliance wants an SPDX header on every file — ~400+ files of churn.
`REUSE.toml` expresses the same boundary as path globs instead. New files inherit their
glob automatically; `reuse lint` (§7) catches anything that falls outside every glob.

Per-file `SPDX-FileCopyrightText` / `SPDX-License-Identifier` headers are added **only**
where a file is vendored from elsewhere and its glob would otherwise misstate its
provenance (§4.1).

Note that `.claude/skills/*` are committed **symlinks** into `.agents/skills/*`. REUSE
generally skips symlinks; the `.agents/**` annotation is the one that carries the
licensing, and `reuse lint` behaviour on the symlinks is confirmed during
implementation rather than assumed.

### 3.3 Files

- `LICENSE` at the repo root — full AGPL-3.0 text. GitHub's license detector reads the
  root `LICENSE`; without it the repo shows as unlicensed regardless of `LICENSES/`.
- `LICENSES/AGPL-3.0-only.txt`, `LICENSES/Apache-2.0.txt`, `LICENSES/MIT.txt` — the
  REUSE-conventional location. The AGPL text is duplicated between `LICENSE` and
  `LICENSES/`; this is standard and both are needed for their respective consumers.
- `REUSE.toml` at the root.
- `LICENSING.md` — the split explained in prose for humans, linking to `REUSE.toml` as
  the machine-readable source of truth. Referenced from `README.md`.

### 3.4 Manifests

All ten workspace manifests gain an SPDX `license` field matching their tree's entry in
§3.1. `lodekit-monorepo` (root) takes `AGPL-3.0-only`.

They **stay `private: true`.** npm and GitHub both read a missing `license` field as
proprietary, so the field is required regardless of publication — the two are
independent.

---

## 4. Third-party notices & redistribution

### 4.1 Vendored code

Four upstreams, all verified MIT via the GitHub API on 2026-07-28 — compatible with both
sides of the split, so this is notice preservation, not a licensing conflict:

| Vendored path | Source | License |
|---|---|---|
| `.agents/skills/**` (21 skills + hook) | `DollarDill/beads-superpowers` | MIT |
| `.agents/skills/writing-skills/**` | `obra/superpowers` | MIT |
| `.agents/skills/ponytail*/**` | `DietrichGebert/ponytail` | MIT |
| `.agents/skills/{codebase-design,domain-modeling}/**` | `mattpocock/skills` | MIT |
| `packages/ui/shadcn-tailwind.css` + shadcn-derived components | shadcn/ui | MIT |
| `web/main/src/components/demo/prompt-kit/**` | `ibelick/prompt-kit` | MIT |
| vendored community themes (catppuccin, dracula, nord, rose-pine) | upstream projects | per-theme, to confirm |

Each gets a `REUSE.toml` annotation naming the upstream copyright holder (read from that
upstream's own `LICENSE`) and `MIT` as the license. `.agents/SOURCES.md` already records
provenance; this adds the licensing half it doesn't carry.

**The community themes need their licenses confirmed individually** before annotation —
they are the one row above that has not been verified.

### 4.2 No aggregate notices file

An aggregate `THIRD-PARTY-NOTICES` file is **not** produced. The obligation the npm
dependency tree creates is notice *preservation*, and it is already satisfied: each
package's own `LICENSE` — and, for the Apache-2.0 dependencies, its `NOTICE` if it has
one — travels inside the packaged `node_modules`, which ship whole in
`Resources/platform/`. An aggregate file is a courtesy convention layered on top of
that, not a legal requirement, and it carries a maintenance cost (regeneration on every
dependency change) for no additional compliance.

The redistributed *binaries* are a different matter and are handled in §4.3.

### 4.3 Packaging: the redistribution gap

`Lodekit.app` redistributes two third-party binaries with notice obligations.

**Node.js — already satisfied.** `electron-builder.yml` declares
`extraResources: build/node → node`, which copies the whole extracted Node tree, and the
Node tarball carries its aggregate `LICENSE` at the root. It ships at
`Resources/node/LICENSE`. **To confirm empirically during implementation** — the research
flagged this as a gap and it appears not to be one.

**Electron — the real gap.** electron-builder does not copy Electron's `LICENSE` or
`LICENSES.chromium.html` into macOS output; the research verified this empirically
against `manager/dist/mac-arm64/`. The fix extends the existing `afterPack` hook
(`manager/scripts/assert-pack.cjs`), which already asserts that runtime-read paths made
it into the bundle: copy both files from the Electron dist into the app bundle, then
assert both exist — the same guard shape it already applies to the menubar icons.

The bundled `ffmpeg.dylib` is LGPL-2.1, which strictly also wants corresponding source
availability. Even Electron's own releases have an open issue about this; the practical
ecosystem mitigation is a pointer to Electron's source release for the exact version
used, which goes in `LICENSING.md` alongside the Electron entry.

---

## 5. Launch files

| File | Job |
|---|---|
| `README.md` | Does not exist today. §5.1. |
| `LICENSING.md` | The split in prose (§3.3). |
| `NOTICE` | Copyright line, Apache-2.0 §4(d) mechanics, trademark paragraph (§5.2). |
| `SECURITY.md` | Alpha framing, private vulnerability reporting, scope, no bug bounty. |
| `CONTRIBUTING.md` | Closed-contributions posture, agent workflow as documentation, human-editorial-control statement (research §5). |

Five files, and that is the whole set. No `CODE_OF_CONDUCT.md` (with contributions
closed there is no contributor community to govern, and the Contributor Covenant's
required reporting contact would mean standing up a channel for nobody), no
`THIRD-PARTY-NOTICES` (§4.2), no PR or issue templates, no `FUNDING.yml`,
`GOVERNANCE.md`, `SUPPORT.md`, or `TRADEMARKS.md`. Each is reconsidered if and when
contributions open.

All new prose is written per the `write-documentation` skill and consults
`docs/PRODUCT.md` for voice.

### 5.1 `README.md` outline

1. What Lodekit is — one paragraph in PRODUCT.md's voice.
2. **Status and disclaimer** — §5.3.
3. Install (packaged app; ad-hoc-signed caveat).
4. Quickstart — a pointer to `docs.lodekit.com`, not steps inline. The docs site isn't
   published yet, so the link is dead on day one; that is accepted rather than
   duplicating a quickstart into the README that would then drift.
5. How it works — short, linking to `docs/` and `CONTEXT.md`.
6. Licensing — two sentences plus a link to `LICENSING.md`.
7. Contributing — closed for now, link to `CONTRIBUTING.md`.
8. Security — link to `SECURITY.md`.

### 5.2 Trademark paragraph (in `NOTICE`)

Asserts the unregistered mark, per research §6:

- The code licenses grant no permission to use the "Lodekit" name, logos, or marks.
- These are marks and trade names of the Lodekit project, not registered at this time.
- Truthful referential use ("based on Lodekit", "forked from Lodekit") is expressly
  welcome — which implies that claiming official status is not.

### 5.3 Status and disclaimer block

Adapts research §4's draft. The legal protection comes from non-commerciality plus the
license's warranty clause — this block is about honesty and expectation-setting, not
liability engineering. It states:

- Free software supplied outside any commercial activity, without warranty.
- Written almost entirely by AI coding agents, directed, curated, and reviewed by a
  human maintainer.
- Not independently reviewed or security-audited.
- macOS binaries are ad-hoc signed and **not notarized**; since macOS Sequoia the
  right-click-open bypass is gone, so users go through System Settings → Privacy &
  Security → "Open Anyway".
- **App isolation is cooperative, not enforced.** App code runs in worker threads with
  the user's full privileges and full `fs` / `net` / `child_process` access. This is
  issue #90 stated as an architectural property rather than filed as a bug — it is more
  useful to a user as a disclosure they can act on.
- Data is stored locally in SQLite; take your own backups.
- Don't run Lodekit where a defect would cause damage you can't absorb.

---

## 6. Repo sweep

Findings from a full sweep of the working tree and all 486 commits of history.

### 6.1 Clean

- **Git history:** single author `ulyssesv <1129459+ulyssesv@users.noreply.github.com>` —
  no personal email exposed. No secrets in any diff (scanned for `sk-ant`, `sk-proj`,
  `ghp_`, `github_pat`, `AKIA`, private-key headers, `xoxb-`, Google API keys). No
  `.env`, key, certificate, or credential file ever committed. No sensitive deleted
  files.
- **Ignored correctly:** `.beads/`, `.agents/internal/`, `.codebase-memory/`.
- `manager/tests/paths.test.js` already uses a generic `/Users/someone`.

### 6.2 Local paths to genericise

27 lines across 13 files. **All are prose in completed `docs/plans/` and `docs/specs/`
documents** — historical execution context describing where a past slice was worked.
No code reads them, no test asserts them, nothing can break.

| Shape | Count | Files | Replacement |
|---|---|---|---|
| `/Users/<user>/Code/worktrees/lodekit/<branch>` | 20 | `2026-07-02-manager-v0.1.md`, `2026-07-03-tanstack-start-host.md`, `2026-07-06-docs-site-v1.md`, `2026-07-07-tasks-change-bus-migration.md`, `2026-07-09-db-store.md`, `2026-07-10-release-pipeline.md`, `2026-07-14-data-explorer.md`, `2026-07-14-ui-charts-data-table.md`, `2026-07-16-worktree-disk-usage.md`, `2026-07-17-engine-package-rename.md`, `docs/specs/2026-07-06-file-store-design.md` | `~/Code/worktrees/lodekit/<branch>` |
| `/private/tmp/claude-501/-Users-<user>-Code-worktrees-lodekit-docs/<uuid>/scratchpad/...` | 3 | `2026-07-12-docs-content-v1.md` | `<scratchpad>/facts/...` |
| `~/.claude/projects/-Users-<user>-Code-github-lodekit/memory/` | 2 | `2026-07-15-dev-flow-v2.md`, `docs/specs/2026-07-15-dev-flow-v2-design.md` | `~/.claude/projects/<project-slug>/memory/` |

`~/Code/worktrees/lodekit/` is safe as a replacement: these are historical records of how
*this* project was worked, so the convention is accurate, and the paths were in fact
under a home directory. Nothing resolves them at runtime.

**Not touched:** `.agents/skills/systematic-debugging/CREATION-LOG.md`,
`.agents/skills/systematic-debugging/root-cause-tracing.md`,
`.agents/skills/using-git-worktrees/SKILL.md` contain `/Users/jesse/...` — the *upstream*
author's username in vendored files. Editing them would add an `SOURCES.md` divergence
entry for no benefit.

History is not rewritten. These paths remain in the 486-commit history and that is
accepted: they leak a macOS username and nothing else.

### 6.3 `docs/PRODUCT.md`

§3 `Key assumptions & open questions` contains `OSS/community positioning is open.` —
which this work closes. `AGENTS.md` designates PRODUCT.md a steering doc to be consulted
*before any outward-facing prose*, and §5's README/CONTRIBUTING/SECURITY are exactly
that. Updating the line makes the steering doc an accurate input to the work rather than
a stale one. One line; strike it from scope if you'd rather leave it — the cost is only
that this spec supplies the positioning inline instead.

### 6.4 Public issue backlog

The 54 non-security open issues become publicly readable. A visible known-gaps list reads
as honesty. One skim pass for anything careless; no rewrite.

---

## 7. Verification

| Check | Kind |
|---|---|
| `reuse lint` passes | CI job (new) |
| Packed `Lodekit.app` contains Electron's `LICENSE` and `LICENSES.chromium.html` | assertion in `assert-pack.cjs` (extended) |
| Packed `Lodekit.app` contains `Resources/node/LICENSE` | assertion in `assert-pack.cjs` (extended) |
| `pnpm test` green | existing |
| No leaked home path (`/Users/<user>`, `-Users-<user>-`) in tracked files | one-off grep at review |
| Every workspace manifest has a `license` field | one-off check at review |

`reuse lint` is worth a CI job specifically because `REUSE.toml` uses path globs: a file
added outside every glob falls into no-license limbo silently, and nobody notices for
months.

---

## 8. Launch gate

Ticked by the person, not by this work. The repo goes public when:

- [ ] Security findings #87–#97 resolved (or consciously accepted and disclosed).
- [ ] Everything in §3–§6 landed and merged.
- [ ] Repo description and homepage set.
- [ ] Private vulnerability reporting enabled (Settings → Security).
- [ ] **Post-flip:** interaction limit set to "Collaborators only".
- [ ] **Post-flip:** confirm GitHub's license detector reads `AGPL-3.0-only`.

---

## 9. Open questions

- **Community theme licenses** (§4.1) — the one unverified row; confirm per theme before
  annotating.
- **Node `LICENSE` in the bundle** (§4.3) — expected to already ship; confirm empirically
  rather than assuming the research's claim of a gap.
- **Feedback channel while contributions are closed** — `CONTRIBUTING.md` needs somewhere
  to send people who aren't collaborators and therefore can't open an issue. An address
  on the domain already owned is the obvious answer, but none exists yet. Until one does,
  the file states the closed posture without promising a channel.
