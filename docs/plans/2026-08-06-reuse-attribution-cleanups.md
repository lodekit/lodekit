# REUSE & Attribution Cleanups (#162) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent lk-h8bq`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** Close the four declared-vs-actual licensing mismatches from issue #162 — `.claude/skills` REUSE coverage, the beads-superpowers → obra/superpowers attribution chain, the `packages/ui` composite license declaration, and the landing site's missing OFL font notice.

**Architecture:** Pure notice-accuracy changes: `REUSE.toml` annotations, package metadata, `LICENSING.md` prose, and one committed notice file served statically by the landing site. No runtime code changes anywhere.

**Tech Stack:** REUSE spec (`REUSE.toml`, `LICENSES/`), SPDX license expressions, Astro `public/` static assets.

## Global Constraints

- All work on branch `licensing-162` (cut from current `master`). PR title:
  `chore(licensing): REUSE and attribution cleanups (#162)` — squash-merge subject, so exact.
- **No changelog entry** — notice-accuracy work; nothing a Lodekit user can see or do
  (`docs/changelog.md` untouched).
- Every task leaves `reuse lint` green. No `reuse`/`uvx`/`pipx` binary exists on this
  machine; use a throwaway venv (create once, reuse across tasks):

  ```bash
  python3 -m venv "${TMPDIR:-/tmp}/lodekit-reuse-venv"
  "${TMPDIR:-/tmp}/lodekit-reuse-venv/bin/pip" install --quiet reuse
  "${TMPDIR:-/tmp}/lodekit-reuse-venv/bin/reuse" lint
  ```

  Run `reuse lint` from the worktree root. Expected: `Congratulations! Your project is compliant with version 3.3 of the REUSE Specification` and exit 0. (`reuse` skips symlinks, so lint passes before AND after Task 1 — the lint guards against regressions in Tasks 2 and 4, and the `LICENSES/OFL-1.1.txt` requirement.)
- **REUSE.toml precedence:** when several annotations match a path, the one defined
  *later in the file* wins. The blanket `.claude/skills/**` path goes in the early
  Dillon-Frawley annotation; per-skill overrides sit below it — mirroring how the
  existing `.agents/skills` annotations are laid out. Do not reorder annotations.
- `.claude/skills/*` entries are committed **symlink files** (31 of them), not
  directories — per-skill mirror paths are bare (`.claude/skills/session`), not
  globbed (`.claude/skills/session/**`).
- Decisions locked with the engineer (2026-08-06): the OFL notice is a **file only**
  (no footer link); `packages/ui` gets **both** the `Apache-2.0 AND MIT` field and a
  `LICENSING.md` footnote.

---

### Task 1: `.claude/skills` REUSE coverage

**Files:**
- Modify: `REUSE.toml:23-63` (five annotations gain `.claude/skills` mirror paths)

**Interfaces:**
- Consumes: nothing.
- Produces: the `[".agents/skills/**", ".agents/hooks/**", ".claude/skills/**"]` annotation that Task 2 edits the copyright list of.

**Acceptance Criteria:**
- Every `.claude/skills/*` symlink is matched by an annotation that mirrors its target's license/holder (blanket MIT Dillon Frawley; overrides for writing-skills, the four ponytail skills, the two mattpocock skills, and the three Lodekit-authored skills).
- `reuse lint` exits 0.

- [ ] **Step 1: Cut the branch**

```bash
git checkout -b licensing-162
```

- [ ] **Step 2: Add the mirror paths to the five skill annotations in `REUSE.toml`**

Replace the annotation at lines 23–27 with (comment line included):

```toml
# .claude/skills/* are committed symlinks into .agents/skills/ — each carries
# its target's licensing, mirrored per-skill below.
[[annotations]]
path = [".agents/skills/**", ".agents/hooks/**", ".claude/skills/**"]
precedence = "aggregate"
SPDX-FileCopyrightText = "2026 Dillon Frawley"
SPDX-License-Identifier = "MIT"
```

Replace the `writing-skills` annotation (lines 29–33) with:

```toml
[[annotations]]
path = [".agents/skills/writing-skills/**", ".claude/skills/writing-skills"]
precedence = "aggregate"
SPDX-FileCopyrightText = "2025 Jesse Vincent"
SPDX-License-Identifier = "MIT"
```

Replace the ponytail annotation's `path` list with:

```toml
path = [
  ".agents/skills/ponytail/**",
  ".agents/skills/ponytail-audit/**",
  ".agents/skills/ponytail-debt/**",
  ".agents/skills/ponytail-review/**",
  ".claude/skills/ponytail",
  ".claude/skills/ponytail-audit",
  ".claude/skills/ponytail-debt",
  ".claude/skills/ponytail-review",
]
```

Replace the codebase-design/domain-modeling annotation's `path` list with:

```toml
path = [
  ".agents/skills/codebase-design/**",
  ".agents/skills/domain-modeling/**",
  ".claude/skills/codebase-design",
  ".claude/skills/domain-modeling",
]
```

Replace the session/drain-deferrals/release annotation's `path` list with:

```toml
path = [
  ".agents/skills/session/**",
  ".agents/skills/drain-deferrals/**",
  ".agents/skills/release/**",
  ".claude/skills/session",
  ".claude/skills/drain-deferrals",
  ".claude/skills/release",
]
```

- [ ] **Step 3: Verify**

```bash
"${TMPDIR:-/tmp}/lodekit-reuse-venv/bin/reuse" lint
```

Expected: compliant, exit 0.

- [ ] **Step 4: Commit**

```bash
git add REUSE.toml
git commit -m "chore(licensing): cover .claude/skills symlinks in REUSE.toml (#162, lk-h8bq)"
```

---

### Task 2: Complete the upstream attribution chain

**Files:**
- Modify: `REUSE.toml` (the annotation Task 1 produced — copyright list)
- Modify: `.agents/SOURCES.md` (derivation note under the Sources table)

**Interfaces:**
- Consumes: the `[".agents/skills/**", ".agents/hooks/**", ".claude/skills/**"]` annotation from Task 1.
- Produces: nothing later tasks rely on.

**Acceptance Criteria:**
- The blanket skills annotation carries both `2026 Dillon Frawley` and `2025 Jesse Vincent`.
- `.agents/SOURCES.md` records that beads-superpowers derives from obra/superpowers.
- `reuse lint` exits 0.

**Background (verified 2026-08-06):** `DollarDill/beads-superpowers` is MIT
(© 2026 Dillon Frawley) and is a derivative of `obra/superpowers` (MIT,
© 2025 Jesse Vincent) — not a GitHub-native fork, but the lineage is plain, e.g.
`.agents/skills/systematic-debugging/CREATION-LOG.md:7` still reads "Extracted
debugging framework from `/Users/jesse/.claude/CLAUDE.md`". MIT requires the
upstream copyright notice to be preserved in derivative distributions.

- [ ] **Step 1: Add Jesse Vincent to the blanket skills annotation**

In `REUSE.toml`, in the annotation with `path = [".agents/skills/**", ".agents/hooks/**", ".claude/skills/**"]`, change:

```toml
SPDX-FileCopyrightText = "2026 Dillon Frawley"
```

to:

```toml
SPDX-FileCopyrightText = ["2026 Dillon Frawley", "2025 Jesse Vincent"]
```

- [ ] **Step 2: Record the chain in `.agents/SOURCES.md`**

Immediately after the Sources table (after the `mattpocock/skills` row, before the "Tooling versions" paragraph), insert:

```markdown
beads-superpowers is itself derived from obra/superpowers (MIT, © 2025 Jesse
Vincent) — several of its skills originate there (systematic-debugging's
CREATION-LOG, for one, still points at Jesse's CLAUDE.md) — so `REUSE.toml`
carries both copyrights for `.agents/skills/**`.
```

- [ ] **Step 3: Verify**

```bash
"${TMPDIR:-/tmp}/lodekit-reuse-venv/bin/reuse" lint
/usr/bin/grep -n "Jesse Vincent" REUSE.toml .agents/SOURCES.md
```

Expected: lint compliant; grep shows the new copyright entry in both files.

- [ ] **Step 4: Commit**

```bash
git add REUSE.toml .agents/SOURCES.md
git commit -m "chore(licensing): credit obra/superpowers upstream in the skills chain (#162, lk-h8bq)"
```

---

### Task 3: `packages/ui` composite license declaration

**Files:**
- Modify: `packages/ui/package.json:4`
- Modify: `LICENSING.md` (footnote under the license table)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing later tasks rely on. (Task 4 also edits `LICENSING.md`, in a different section — sequenced after this task to avoid conflicts.)

**Acceptance Criteria:**
- `packages/ui/package.json` declares `"license": "Apache-2.0 AND MIT"`.
- `LICENSING.md` explains the composite in one footnote line under the table.
- `reuse lint` exits 0 (unchanged by this task — regression guard).

- [ ] **Step 1: Fix the license field**

In `packages/ui/package.json` change:

```json
  "license": "Apache-2.0",
```

to:

```json
  "license": "Apache-2.0 AND MIT",
```

- [ ] **Step 2: Footnote it in `LICENSING.md`**

Immediately after the license table (after the `.agents/skills/` row, before the "Licensing follows the REUSE specification" paragraph), insert:

```markdown
`packages/ui` vendors the shadcn/ui components (`packages/ui/src/components/`,
MIT, © shadcn), so its `package.json` declares `Apache-2.0 AND MIT` —
`REUSE.toml` draws the per-file boundary.
```

- [ ] **Step 3: Verify**

```bash
node -e "JSON.parse(require('fs').readFileSync('packages/ui/package.json','utf8')); console.log('json ok')"
"${TMPDIR:-/tmp}/lodekit-reuse-venv/bin/reuse" lint
```

Expected: `json ok`; lint compliant.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/package.json LICENSING.md
git commit -m "chore(licensing): declare packages/ui as Apache-2.0 AND MIT (#162, lk-h8bq)"
```

---

### Task 4: OFL notice for the landing-site webfonts

**Files:**
- Create: `LICENSES/OFL-1.1.txt` (canonical SPDX text via `reuse download`)
- Create: `web/main/public/font-licenses.txt`
- Modify: `REUSE.toml` (append one annotation at end of file)
- Modify: `LICENSING.md` ("Third-party code" section, one paragraph)

**Interfaces:**
- Consumes: `LICENSING.md` as left by Task 3.
- Produces: nothing.

**Acceptance Criteria:**
- `/font-licenses.txt` ships with the built landing site, carrying all three font copyright lines plus the full OFL-1.1 text.
- The committed notice file is REUSE-annotated `OFL-1.1` and `LICENSES/OFL-1.1.txt` exists.
- `reuse lint` exits 0; `pnpm --filter @lodekit/web-main build` succeeds and `web/main/dist/font-licenses.txt` exists.

**Background:** the landing site imports `@fontsource/{m-plus-1-code,spline-sans-mono,zen-kaku-gothic-new}` CSS in `web/main/src/layouts/Base.astro:3-8`; the build serves their woff2 files. All three fonts are OFL-1.1; OFL asks that the copyright + license notice travel with redistributed font files. Copyright lines below were read from the `@fontsource/*/LICENSE` files (verified 2026-08-06).

- [ ] **Step 1: Add the canonical OFL-1.1 license text**

```bash
"${TMPDIR:-/tmp}/lodekit-reuse-venv/bin/reuse" download OFL-1.1
```

Expected: `Successfully downloaded ./LICENSES/OFL-1.1.txt`. (Fallback if offline: copy the license body — everything from the `SIL OPEN FONT LICENSE Version 1.1` heading down — out of `web/main/node_modules/@fontsource/m-plus-1-code/LICENSE`.)

- [ ] **Step 2: Write `web/main/public/font-licenses.txt`**

Create the file with this exact header, then append the license text:

```
This site self-hosts the following fonts, served as woff2 subsets via
Fontsource (https://fontsource.org). Each is licensed under the SIL Open
Font License, Version 1.1, reproduced in full below.

M PLUS 1 Code
  Copyright 2021 The M+ FONTS Project Authors (https://github.com/coz-m/MPLUS_FONTS)

Spline Sans Mono
  Copyright 2022 The Spline Sans Mono Project Authors (https://github.com/SorkinType/SplineSansMono)

Zen Kaku Gothic New
  Copyright 2022 The Zen Project Authors (https://github.com/googlefonts/zen-kakugothic)

-----------------------------------------------------------------------
```

```bash
cat LICENSES/OFL-1.1.txt >> web/main/public/font-licenses.txt
```

- [ ] **Step 3: Annotate the notice file in `REUSE.toml`**

Append at end of file:

```toml
# The landing site's webfont notice — redistributes the font projects'
# copyright lines with the served woff2 files (issue #162).
[[annotations]]
path = "web/main/public/font-licenses.txt"
precedence = "aggregate"
SPDX-FileCopyrightText = [
  "2021 The M+ FONTS Project Authors (https://github.com/coz-m/MPLUS_FONTS)",
  "2022 The Spline Sans Mono Project Authors (https://github.com/SorkinType/SplineSansMono)",
  "2022 The Zen Project Authors (https://github.com/googlefonts/zen-kakugothic)",
]
SPDX-License-Identifier = "OFL-1.1"
```

- [ ] **Step 4: Document it in `LICENSING.md`**

In the "Third-party code" section, after the paragraph about dependencies traveling in `node_modules`, insert:

```markdown
The landing site self-hosts three webfonts (M PLUS 1 Code, Spline Sans Mono,
Zen Kaku Gothic New — all `OFL-1.1`). Their copyright and license notice ships
with the site at `/font-licenses.txt` (`web/main/public/font-licenses.txt`).
```

- [ ] **Step 5: Verify**

```bash
"${TMPDIR:-/tmp}/lodekit-reuse-venv/bin/reuse" lint
pnpm --filter @lodekit/web-main build
ls web/main/dist/font-licenses.txt
head -4 web/main/dist/font-licenses.txt
```

Expected: lint compliant; build succeeds; the file exists in `dist/` and starts with the header above.

- [ ] **Step 6: Commit**

```bash
git add LICENSES/OFL-1.1.txt web/main/public/font-licenses.txt REUSE.toml LICENSING.md
git commit -m "chore(licensing): ship the OFL notice with the landing-site webfonts (#162, lk-h8bq)"
```

---

## Completion

Push `licensing-162` and raise the PR (the person merges — never merge unattended):

- Title: `chore(licensing): REUSE and attribution cleanups (#162)`
- Body: **Summary** (the four mismatches and their fixes), **Notes** (decisions:
  notice file only, no footer link; `Apache-2.0 AND MIT` composite is not dual
  licensing; the OFL notice covers the landing site only — the font self-hosting
  work for dashboard/docs (#65, #175) must carry its own notice when it lands),
  **Test plan** (reuse lint, web-main build, JSON validity), `Closes #162`.
- No changelog entry (internal notice-accuracy work).
