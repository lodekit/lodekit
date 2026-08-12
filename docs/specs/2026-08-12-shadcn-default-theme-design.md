# Shadcn default theme — design

**Date:** 2026-08-12
**Status:** draft — pending approval
**Scope:** The product's default look becomes neutral: a new vendored `shadcn` theme
(stock shadcn/ui, neutral base) replaces `lodekit` as the platform default. The
identity physics the base layer currently forces on every theme (elevation, easing,
body weight, the focus rules) either become theme-carried via typed canonical-format
fields or are dropped. `lodekit` stays a selectable vendored theme and carries its
physics with it. DESIGN.md's Product register is restructured to match, and the stale
docs-site theming guide is rewritten.

## Goals

- Default to neutral: dashboard and apps with no theme selection render stock
  shadcn/ui (neutral base), not Cloud Captured.
- Keep `lodekit` as a first-class vendored theme, visually unchanged where the theme
  format can carry it; it is the default candidate again once a toned-down revision
  exists (future work).
- Make elevation, easing, and body weight part of the canonical theme format, so no
  identity physics lives above themes; every theme (vendored, user) can set them.
- One focus story: stock shadcn ring focus everywhere in the product, all themes.
- Documentation tells the truth: DESIGN.md §3, DEFINITIONS.md, ARCHITECTURE.md, the
  docs-site theming guide.

## Non-goals

- No change to the marketing site (`web/main`) — Cloud Captured remains its register,
  including its own focus treatment.
- No redesign of the `lodekit` theme (the toned-down revision is future work).
- No icon-system changes: the `@lodekit/ui/icons` facade and its vendored sets
  (lucide, phosphor, tabler) stay as they are; `shadcn` selects `lucide`, which is
  stock shadcn's icon set anyway.
- No new vendored *theme* ports beyond `shadcn` (the Dracula/Catppuccin/Nord/
  Rosé Pine set is unchanged).
- No font self-hosting: theme fonts keep loading via the Google css2 `@import`
  mechanism. Vendoring the popular theme fonts engine-served is recorded in
  `docs/TODO.md` (this PR), joining the existing self-hosted-fonts deferral.
- Editor support for physics is preset-level only; free-form shadow editing stays in
  the preserved-custom-CSS lane.
- `web/docs` skin unchanged (still opts out of theming; guide *content* is in scope).

## Decision record

- **Neutral base palette** (stock shadcn default), converted to hex — hex is canonical
  house-wide; the AA gate, swatches, and `readableForeground` all consume hex.
  (Person, this session.)
- **Full stock base**: the `@lodekit/ui` base layer ships stock shadcn physics; the
  identity physics move into the themes that want them. (Person, this session.)
- **Typed format fields over a custom-CSS tail** — round-trip correctness and editor
  honesty outweigh the parser/serializer work. (Person, this session.)
- **Focus-Is-A-Border dropped in the product**: stock ring focus everywhere, not
  theme-carried. Revisit only if the stock ring grates in practice. (Person, this
  session.)
- **The default theme must pass the AA contrast gate.** If a stock neutral pair fails
  a gated check, tune minimally and comment the deviation — never exempt the default.
- **DESIGN.md §3 restructured** (not a one-line ruling). (Person, this session.)
- **Theming guide rewritten in this slice** — it still documents the retired
  `<root>/theme.css` mechanism and is wrong today. (Person, this session.)
- **Geist as the theme's face** — the canonical shadcn.com typeface, loaded via the
  standard Google css2 `@import` like every other themed font; system stacks were
  the plainer option but miss the recognizable stock look. (Person, this session.)

## 1. The `shadcn` theme

`packages/engine/themes/shadcn.css`, canonical format, header comment naming the
source (`ui.shadcn.com`, MIT) like the other ports:

- **Fonts: Geist.** One css2 `@import` (Geist 400/500/600 + Geist Mono 400/500);
  `--font-ui` / `--font-display` = `"Geist", ui-sans-serif, system-ui, sans-serif`
  (+ emoji fallbacks), `--font-mono` = `"Geist Mono", ui-monospace, monospace`.
- `--radius: 0.625rem`, `--spacing: 0.25rem`, `--icon-library: lucide`.
- The 31 color tokens in both plates: stock shadcn **neutral** values, oklch→hex
  converted verbatim at implementation time.
- **No physics fields** — absent means stock, which is the point.
- Joins the AA contrast gate (not `AA_EXEMPT`), per the decision above.
- The editor's `FONT_CATALOG` gains Geist and Geist Mono entries (Inter and the
  system stacks are already present), so the theme's fonts display as matched
  selections rather than unmatched labels.

## 2. The base layer goes stock

`packages/ui/theme-tokens.css` — the build-time base that lets `@lodekit/ui` compile
and render standalone (vitest render tests, any consumer without a running engine)
and carries the `@theme inline` bridge — moves its lockstep partner from
`lodekit.css` to `shadcn.css`:

- Token values in `@layer lodekit-tokens` flip to the same neutral hex set; the
  header comment is rewritten. The layer name stays (internal, not worth the churn).
- **Deleted:** the `--lk-ease-drift` definition and its `--ease-drift` /
  `--default-transition-timing-function` aliases; the `--lk-shadow-*` slots (rest,
  overlay, lift) and the `@theme inline` shadow alias block; the entire
  Focus-Is-A-Border rule set (single rule, pointer-focus, `aria-invalid`,
  input-group delegation, forced-colors fallback) — component internals' stock ring
  utilities take over; the hard `body { font-weight: 500 }`.
- **Kept:** `color-scheme` handling, the `border-border outline-ring/50` base, the
  `@theme inline` font/radius/color bridges, `h1–h4` display-font + 700 (headings
  follow `--font-display`, which every theme sets), and the mono-voice
  `code/kbd/samp/pre { font-weight: 400 }` rule (a no-op at stock body weight, load-
  bearing under themes that raise it).
- **Changed:** `body` gains `font-weight: var(--font-weight-body, 400)`.
- **Sweep:** every `ease-drift` utility and `--lk-*` var consumer across
  `packages/ui` src, the dashboard, and the showcase apps migrates to stock
  equivalents (usually: delete the class; the default transition easing is now the
  theme's business). `--lk-font-wordmark` in `dashboard/src/index.css` is chrome
  above the theme format and is untouched.

## 3. Canonical format: physics fields

The format (parser/serializer in `packages/engine/dashboard/src/lib/theme-css.ts`)
gains **optional** fields, following the `--font-mono` precedent — absent field →
no line emitted, byte-identical round-trip, stock behavior:

- **`:root`-only typed fields:** `--font-weight-body` (consumed by the base `body`
  rule) and `--default-transition-timing-function` (the Tailwind v4 default-easing
  token, stock-named).
- **Per-plate optional tokens** (allowed in `:root` and `.dark`, like the color
  set): the shadow scale `--shadow-2xs`, `--shadow-xs`, `--shadow-sm`, `--shadow`,
  `--shadow-md`, `--shadow-lg`, `--shadow-xl`, `--shadow-2xl`. Names match the
  shadcn/tweakcn export convention, so ecosystem themes keep porting near-verbatim.
  A plate that omits them inherits (`.dark` falls back to the `:root` values; both
  absent → stock).

**Runtime requirement:** all of these must be overridable by the served theme CSS —
utilities must resolve them via `var()` at runtime, not inline them at build time.
Where Tailwind v4 already emits runtime references (expected for the shadow scale),
nothing is needed; where it inlines a default (possible for the easing token),
`theme-tokens.css` adds a thin passthrough with the stock value as fallback — the
same pattern the retheme used. Verified at implementation by a test asserting the
built CSS references the vars.

## 4. Default flip (engine)

- `DEFAULT_THEME = "shadcn"` (`packages/engine/src/services/themes.ts:17`). The
  resolution chain stays app → global → default; `resolveThemeCss()`'s never-throw
  floor now reads the vendored `shadcn.css`.
- `<root>/themes/config.json` semantics unchanged. The repo's showcase root keeps
  its `greenhouse → greenhouse-green` assignment; the dashboard and `welcome` now
  resolve to `shadcn`.
- No other `lodekit` fallback exists in code (verified in session); tests that
  encode the old default are updated (§Verification).

## 5. Editor: Effects controls

The theme editor gains an **Effects** group with preset-level controls, honest about
divergence the way color roles show "mixed":

- **Elevation:** Stock (fields absent) / Flat (all shadow tokens `0 0 #0000`, both
  plates); a diverged set — e.g. lodekit's ink-tinted overlays — displays "Custom".
- **Easing:** Stock (absent) / Drift (`cubic-bezier(0.22, 1, 0.36, 1)`); otherwise
  "Custom".
- **Body weight:** Normal (400 / absent) / Medium (500).

Round-trip fidelity holds: parse→save of an unedited theme stays byte-identical,
including themes that set none, some, or non-preset values of the new fields.

## 6. `lodekit` and `greenhouse-green` carry their physics

- `packages/engine/themes/lodekit.css` gains the physics fields: body weight 500,
  drift easing, and the Flat Paper shadow set (light plate: resting steps
  `0 0 #0000`, `--shadow-md` and up the ink-tinted overlay value; dark plate: all
  `0 0 #0000` — night has no shadows). Its rendered look is unchanged except focus
  (now stock ring, by decision) and the unused lift shadow (deleted unless the §2
  sweep finds a live consumer).
- `root/themes/greenhouse-green.css` gains the same physics block — the showcase
  exercises the new format capability, per the Definition of Done.
  `root/README.md`'s coverage checklist gains the row.

## 7. Documentation

- **DESIGN.md** — §3 restructured into: **product shell** (theme-independent
  truths: stock shadcn components and physics by default, tokens-only, no entrance
  choreography, the fixed rem scale, chrome above the theme format — wordmark,
  mark, favicons — and the web-docs stance); **the lodekit theme** (Cloud Captured
  as a product expression: parchment surfaces, One Accent, Flat Paper, drift,
  body 500 — true when the theme is selected, carried by the theme file); and the
  **default ruling** (neutral `shadcn` is the default; `lodekit` optional, default
  candidate again after a toned-down revision). §1 gains a scope sentence
  (Foundations describe the identity, expressed fully on Marketing surfaces and via
  the lodekit theme). Focus-Is-A-Border is rescoped to Marketing surfaces only, and
  stale claims are corrected (§1's "theme-tokens.css sets body 500", §3's focus
  bullet, the Elevation section's register note).
- **DEFINITIONS.md** — the Themes entry names `shadcn` as the default theme.
- **ARCHITECTURE.md** — audit its theming claims; update any default-theme line.
- **`web/docs` guide/theming.mdx** — rewritten to the current model: default theme,
  the themes library and editor, `<root>/themes/*.css` + `config.json`, per-app
  selection, user themes. The retired `theme.css` mechanism disappears from it.
- **CHANGELOG.md** — New: neutral `shadcn` default theme; themes can now carry
  elevation, easing, and body weight. Changed: `lodekit` becomes an optional theme;
  focus and elevation are stock by default (visible change for existing roots that
  never picked a theme, and for themes that relied on the old base physics).
- **TODO.md** — append (same PR): vendor the top ~10 theme fonts engine-served
  (Geist, Inter, and the `FONT_CATALOG` families), removing the Google request from
  themes; sharpens the existing self-hosted-fonts deferral.
- **Backlog:** the issue tracking Focus-Is-A-Border product adoption is closed with
  a comment linking this PR (the rule no longer applies to the product register).

## Rollout

One PR, commits phased so each lands green: format fields (§3) → base flip + new
theme + default flip (§1, §2, §4, §6) → editor (§5) → docs (§7). No migration:
existing user themes stay valid (new fields optional); their look shifts where they
relied on the old base physics — named in the changelog, one-line fix (set the
fields) if anyone wants the old behavior back.

## Verification

- `pnpm test` green: `themes.test.ts` (six vendored themes, resolution falls back
  to `shadcn`, delete-while-selected lands on `shadcn`), `themes-api.test.ts`,
  `ui-serving.test.ts` (degrade paths), `theme-css.test.ts` (round-trip for new
  fields: present, absent, edited, per-plate shadows), `theme-contrast.test.ts`
  (gate includes `shadcn`, both plates), `@lodekit/ui` tests, plus the §3 built-CSS
  `var()` assertion.
- Visual (`pnpm dev` against `root/`): dashboard and Welcome render neutral shadcn;
  Greenhouse keeps moss Cloud Captured including flat elevation; switching global to
  `lodekit` restores the identity (flat at rest, drift, body 500) with stock focus;
  editor Effects presets round-trip.
- `pnpm e2e` green; `pnpm --filter @lodekit/web-docs build` green (rewritten guide).
