# Design Canon Lockstep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** Make the theme PR #115 landed on `web/main` the repo-wide canon. #115 deliberately
diverged from `docs/DESIGN.md` and touched the landing site only; every other surface — the
design doc itself, the engine's default theme, the `@lodekit/ui` token base, the sample theme,
the docs site, and the dashboard wordmark — still carries the pre-#115 values.

**Architecture:** Color reaches the product register through a flat role-token table that
exists twice in lockstep: `packages/engine/themes/lodekit.css` (served at runtime as
`/_ui/theme.css`) and `packages/ui/theme-tokens.css` (the build-time base inside
`@layer lodekit-tokens`). Both must change together. The landing site's own physical-palette
layer (`--ink`, `--paper`, `--persimmon`, …) is **not** propagated: the product theme format is
a flat role-token list that `parseTheme`/`serializeTheme` round-trips and the theme editor
edits, so raw palette vars have no place in it. Landing hexes are therefore inlined onto the
product's role tokens by hand.

**Tech Stack:** Tailwind CSS v4 (`@theme inline`), the typed theme format in
`packages/engine/dashboard/src/lib/theme-css.ts`, vitest (incl. the WCAG AA gate at
`packages/engine/tests/theme-contrast.test.ts`), Astro 7 + Starlight 0.41 (docs site).

## Global Constraints

- **The AA gate is the hard floor.** `theme-contrast.test.ts` covers exactly two files —
  `packages/engine/themes/lodekit.css` and `root/themes/greenhouse-green.css` — across 14
  pairs × light/dark. Every proposed value below is pre-checked (§ Decided values).
- **Landing values do not win unconditionally.** Where a landing value fails the product gate,
  the product's derived value stands. Exactly one case: dark `--destructive`. The landing uses
  `#a61e33` on the night plate (2.27:1 — it renders no destructive UI, so nothing caught it);
  the product keeps its derived `#e06a7d` (5.19:1). Same for the dark alpha hairlines, which
  the landing expresses as solid `--night-lo`.
- **No new tokens in the theme format.** The landing defines `--destructive-foreground`; the
  product's canonical set is the 31 tokens in `COLOR_TOKENS`. Adding one would make every
  vendored theme incomplete and change the format. Out of scope — file a bead if wanted.
- **Community themes are untouched.** catppuccin / dracula / nord / rose-pine are self-contained
  and `AA_EXEMPT`; they only inherit the baked-in `--font-mono` fallback, which does not change.
- **Historical docs stay historical.** `docs/specs/*` and `docs/plans/*` record what was decided
  when. Do not rewrite them, including #115's own plan.
- **Surgical changes** (AGENTS.md): every changed line traces to this plan. No adjacent cleanup.

## Decided values

Approved by the person this session. Light plate, product role tokens:

| token | before | after | note |
|---|---|---|---|
| `--background`, `--sidebar` | `#ede7d8` | `#f6f1e6` | landing's lightened page |
| `--card`, `--popover` | `#f6f1e6` | `#fcf9f0` | landing's near-white raised surface |
| `--primary`, `--ring`, `--sidebar-primary`, `--sidebar-ring` | `#935842` (rust) | `#a93510` (persimmon) | 5.82:1 on page, up from rust's 4.58:1 |
| `--primary-foreground`, `--sidebar-primary-foreground` | `#f6f1e6` | `#fcf9f0` | |
| `--chart-3` | `#935842` | `#a93510` | series follows the accent |

Dark plate: `--primary` / `--ring` / `--sidebar-primary` / `--sidebar-ring` `#dd9741` (ochre) →
`#f0a73c` (gold, 8.19:1 both directions); `--chart-3` `#c07a63` → `#d9714a` (5.10:1 on night,
preserving the old value's 4.94:1 weight in the series). Everything else on the night plate is
already canon and does not move. `--secondary` / `--muted` / `--accent` `#dcd3be` and the
`#cdc4ae` hairlines are unchanged in both plates — the landing kept them.

Type: body weight **500** in the product register. Wordmark: **M PLUS 1 Code 700**, fixed above
the theme format.

### Wordmark loading — deviation from the option as presented

The chosen option sketched `--lk-font-wordmark` in `theme-tokens.css` plus an
`&family=M+PLUS+1+Code:wght@700` segment in `lodekit.css`'s `@import`. **That second half is
unsafe** and is not what this plan does.

`isManaged()` (`theme-editor/controls.tsx:74`) classifies a css2 `@import` line as
editor-owned when *every* family in it is in `FONT_CATALOG` — and Task 5 adds M PLUS 1 Code to
that catalog. `importsFor()` then rebuilds the managed line from only the three selected font
fields. So the first font edit any user made in the theme editor would silently drop the
wordmark family and the dashboard wordmark would fall back to `ui-monospace`.

Instead: both the `@import` and `--lk-font-wordmark` live in
`packages/engine/dashboard/src/index.css` — the one product surface that renders a wordmark,
and a file the theme editor never touches. Apps stop loading a font they never use, and the
policy the person chose (one wordmark, fixed, not theme-editable) holds.

## Tasks

### Task 1 — Canonical token set: engine theme + UI token base

**Files:** `packages/engine/themes/lodekit.css`, `packages/ui/theme-tokens.css`,
`packages/engine/tests/theme-css.test.ts`

- [ ] Apply the § Decided values table to `lodekit.css` `:root` and `.dark`. Keep the file's
      exact format — 2-space indent, `  --name: value;`, inline trivia comments preserved —
      the parser regex is literal about it.
- [ ] Update the header comment (line 1–4): "rust accent by day … ochre accent by night" →
      persimmon / gold.
- [ ] Mirror the identical token table into `packages/ui/theme-tokens.css`'s
      `@layer lodekit-tokens`. These two tables must stay byte-identical in values.
- [ ] Add `font-weight: 500;` to the `body` rule in `theme-tokens.css` `@layer base`.
- [ ] Update the hardcoded assertions in `theme-css.test.ts`: `#935842` → `#a93510` at lines
      93, 94, 149, 169; the `#cdc4ae` comment/usage at 154–156 still holds (hairlines unchanged)
      — verify rather than assume.
- [ ] **Check:** `pnpm --filter @lodekit/engine test` — the AA gate and theme-css tests pass.

### Task 2 — Sample theme retone

**Files:** `root/themes/greenhouse-green.css`

- [ ] Apply the same base retone as Task 1, keeping the moss `--primary` / `--ring` /
      `--sidebar-primary` / `--sidebar-ring` (`#3f6e50` light, `#7fae92` dark).
- [ ] `--chart-3` follows the canon (`#a93510` / `#d9714a`) — it is series color, not brand.
- [ ] Re-check moss against the *new* lighter page: `#3f6e50` on `#f6f1e6` must still clear
      4.5:1, and `#fcf9f0` on `#3f6e50` likewise. If either fails, darken the moss and say so.
- [ ] **Check:** the AA gate covers this file — `pnpm --filter @lodekit/engine test`.

### Task 3 — DESIGN.md becomes the canon again

**Files:** `docs/DESIGN.md`

- [ ] Front-matter: `rust`/`rust-deep` → `persimmon` `#A93510` / `persimmon-deep` `#8A2B0D`;
      add `gold: "#F0A73C"`; `paper` → `#F6F1E6`, `paper-hi` → `#FCF9F0`; `body.fontWeight`
      400 → 500; component recipes `{colors.rust}` → `{colors.persimmon}` etc.
- [ ] §2 Colors: rewrite the Primary block (persimmon 5.82:1 replaces rust's ≈4.7 floor — the
      "no room to lighten" caveat goes away), the Page family values, the chart series order.
      Ochre stays as the brand drench plate; gold is the dark accent.
- [ ] **Resolve the persimmon collision.** Lines 128 and 417 currently ban "persimmon accent
      `#C03F16`" as part of the retired cool-sky identity. Left alone, DESIGN.md reads as
      prohibiting the new canon. Rename the retired one by hex explicitly and note that the
      new persimmon `#A93510` is unrelated.
- [ ] §3 Typography: body weight 500, with 400 named as the detailing weight.
- [ ] §5: wordmark → M PLUS 1 Code 700 (documenting that it is fixed above the theme format
      and loaded per-surface); button primary fill/hover → persimmon / persimmon-deep and
      gold / ochre-bright; input error and hairline values verified against the code.
- [ ] §6 Do's/Don'ts: update every stale hex; drop the rust-floor line.
- [ ] Record the two known register divergences #115 introduced rather than silently
      legitimizing or erasing them: field focus is a border-color change on brand surfaces
      (product keeps the centralized 2px outline), and the ochre band's CTA hover is the chip
      fade, not the night sheet.

### Task 4 — Docs site

**Files:** `web/docs/src/styles/custom.css`, `web/docs/public/favicon.svg`

- [ ] `custom.css`: light accents `#935842`/`#7c4636` → `#a93510`/`#8a2b0d`, `--sl-color-bg`
      light → `#fcf9f0` or `#f6f1e6` (match the product page value), dark accent `#dd9741` →
      `#f0a73c` and `--sl-color-accent-high` accordingly, `--sl-color-accent-low` re-derived
      from the new accents. Fix the line-1 "rust/ochre accents" comment.
- [ ] Add `M+PLUS+1+Code:wght@700` to the Google Fonts `@import` and point `.site-title` at it
      (the heading rule at 49–58 keeps Zen Kaku for `h1`–`h4`; only the wordmark changes).
      This import is not editor-managed, so it is safe here.
- [ ] Replace `public/favicon.svg` — currently a hand-authored 128×128 sparkle, not the
      jar-cloud at all — with the marks.ts-generated mark, matching `web/main/public/favicon.svg`
      (plum ink `#251B25` / pale gold `#F3E0A5`, `viewBox="0 0 32 32"`, `MARK_BODIES.b`).
- [ ] **Check:** `pnpm --filter @lodekit/web-docs build`.

### Task 5 — Dashboard wordmark + theme editor font catalog

**Files:** `packages/engine/dashboard/src/index.css`,
`packages/engine/dashboard/src/components/header.tsx`,
`packages/engine/dashboard/src/components/theme-editor/controls.tsx`

- [ ] `index.css`: add the M PLUS 1 Code 700 Google Fonts `@import` and define
      `--lk-font-wordmark: "M PLUS 1 Code", ui-monospace, monospace;` (see § Wordmark loading).
- [ ] `header.tsx:20`: swap `font-display` for the wordmark var; keep `text-xl font-bold
      uppercase tracking-[0.22em]`.
- [ ] `controls.tsx`: add the M PLUS 1 Code `FontEntry` to `FONT_CATALOG`
      (`googleSpec: "M+PLUS+1+Code:wght@700"`), so the family is reachable from the editor.
- [ ] **Check:** `pnpm --filter @lodekit/engine test`; confirm by inspection that adding the
      catalog entry does not make any *existing* theme's import line newly managed.

### Task 6 — Favicon canon

**Files:** `packages/engine/src/marks.ts`

- [ ] `markFaviconSvg` bakes shadcn-neutral `#18181b` / `#fafafa`. DESIGN.md §5 mandates plum
      ink flipping to pale gold, which is what `web/main/public/favicon.svg` already ships.
      Change to `#251b25` / `#f3e0a5`.
- [ ] **Check:** `packages/engine/tests/favicon.test.ts` — update if it asserts the old hexes.

### Task 7 — Changelog amendment

**Files:** `docs/changelog.md`

- [ ] In the unreleased "A new look: the Sky in a Jar" entry, change "a rust accent reserved
      for actions" to name persimmon (gold by night). This is the agreed exception to the
      append-only rule — the entry describes an unreleased change this session amends — and
      must be called out in the PR body.

## Verification

- [ ] `pnpm test` — full workspace. The AA gate (56 assertions across the two gated themes)
      and `theme-css.test.ts` are the load-bearing ones.
- [ ] `pnpm --filter @lodekit/web-main build` — must still be clean; web/main is not edited by
      this plan, so a failure means something leaked.
- [ ] `pnpm --filter @lodekit/web-docs build`.
- [ ] `pnpm dev` — dashboard visual pass, light and dark: page/card surfaces, the persimmon
      accent on buttons and focus rings, body weight 500, the wordmark in M PLUS 1 Code.
      Switch to a community theme and confirm the wordmark font does **not** change.
- [ ] Theme editor: change a font, save, reload — confirm the wordmark survives (the
      regression the § Wordmark loading deviation exists to prevent).
- [ ] Greenhouse app in dev — the retoned `greenhouse-green` theme, moss primary intact.
- [ ] `/usr/bin/grep -rn "935842\|7c4636\|ede7d8" --include=*.css --include=*.ts --include=*.tsx
      --include=*.md .` outside `docs/specs`, `docs/plans`, `node_modules` returns nothing.
