# Lodekit Retheme — the default template in the new identity

**Date:** 2026-07-19 · **Session:** pair spec (bead lk-is3)

Replace the retired cork-amber identity with the new "Sky in a Jar" woodblock-print
identity (`docs/DESIGN.md`) across the product register and the docs skin. The
"default Lodekit template" — the vendored `lodekit` theme plus the `@lodekit/ui`
base — is recreated wholesale; the dashboard chrome adopts the identity's mono
metadata layer; Greenhouse and the docs skin follow.

**Scope decisions (settled in brainstorming):**

- **In:** product register (theme files, `@lodekit/ui` base layer + primitives,
  theme-editor font catalog, dashboard chrome pass), Greenhouse showcase theme,
  docs skin (`web/docs`), tests.
- **Out:** the landing site (`web/main`) — the brand-register redesign is in flight
  in a separate session on the `web` branch. Never touch it here.
- **Format extension:** the canonical theme format gains `--font-mono` end-to-end
  (parser, serializer, editor, docs, tests).
- **Fonts:** delivered via the existing Google css2 `@import` mechanism. Engine-served
  self-hosted fonts are deferred (bead to file, `defer` label).

## 1. Files that carry the identity

Two files stay in lockstep, as today:

1. **`packages/engine/themes/lodekit.css`** — the vendored default theme
   (`DEFAULT_THEME`), canonical format: one `@import` block, `:root` (light) +
   `.dark`, full shadcn token set, typed extras `--font-ui` / `--font-display` /
   **`--font-mono`** (new) / `--radius` / `--spacing` / `--icon-library`.
2. **`packages/ui/theme-tokens.css`** — identical values as the build-time base in
   `@lodekit/ui`, plus the `@theme inline` bridge.

Consumers need no wiring changes: the dashboard imports `@lodekit/ui/theme.css`;
apps get the same import from the scaffold plus the serve-time
`/_ui/theme.css?app=` resolution. `scaffold.ts` is untouched.

## 2. Token mapping

### 2.1 Typography tokens

- `--font-ui`: `"Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", ui-sans-serif,
  system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"` — weights 400/500/700.
- `--font-display`: the same stack. The Two-Voice Rule makes display a *scale*, not
  a second family; the token stays for format compatibility and future themes.
- `--font-mono` (new): `"Spline Sans Mono", ui-monospace, monospace` — weights 400/500.
- Google css2 import: `Zen+Kaku+Gothic+New:wght@400;500;700` +
  `Spline+Sans+Mono:wght@400;500`, `display=swap`.

### 2.2 Light plate (`:root`)

| Token | Value | DESIGN.md role |
| --- | --- | --- |
| `--background` / `--foreground` | `#EDE7D8` / `#251B25` | Page / Plum Ink |
| `--card`, `--popover` (+fg ink) | `#F6F1E6` | Page High |
| `--primary` / `--primary-foreground` | `#935842` / `#F6F1E6` | Rust / page-hi text |
| `--secondary`, `--muted`, `--accent` | `#DCD3BE` | Page Low washes |
| `--secondary-foreground`, `--accent-foreground` | `#251B25` | ink |
| `--muted-foreground` | `#4F4F59` | Slate |
| `--border`, `--input` | `#CDC4AE` | Hairline |
| `--ring` | `#935842` | Rust |
| `--destructive` | `#A61E33` | Crimson |
| `--chart-1…5` | `#4B5D91`, `#DD9741`, `#935842`, `#8394A9`, `#251B25` | fixed series order |
| `--sidebar` | `#EDE7D8` | ink-on-page nav |
| `--sidebar-primary` / fg | `#935842` / `#F6F1E6` | |
| `--sidebar-accent` (+fg ink) | `#DCD3BE` | active wash |
| `--sidebar-border` / `--sidebar-ring` | `#CDC4AE` / `#935842` | |

shadcn's `--accent` (hover wash) stays neutral — the brand accent maps to
`--primary` only, same discipline as the outgoing theme. The One Accent Rule holds:
rust appears only on interactive/active elements.

### 2.3 Night plate (`.dark`)

| Token | Value | DESIGN.md role |
| --- | --- | --- |
| `--background` / `--foreground` | `#121A44` / `#F3E0A5` | Deep Indigo / Pale Gold (ink only) |
| `--card`, `--popover` (+fg pale gold) | `#1B2452` | Night High |
| `--primary` / `--primary-foreground` | `#DD9741` / `#121A44` | Ochre / deep-indigo text |
| `--secondary`, `--muted`, `--accent` | `#242E63` | Night Low washes |
| `--muted-foreground` | `#C6BBA8` | Parchment |
| `--border` | `rgba(243, 224, 165, 0.16)` | derived — gold-tinted hairline |
| `--input` | `rgba(243, 224, 165, 0.22)` | derived |
| `--ring` | `#DD9741` | Ochre |
| `--destructive` | ≈`#D4576B` | derived — brightened crimson, tuned to AA |
| `--chart-1…5` | brightened per series | derived (plum slot → pale plum) |
| sidebar family | night surfaces, ochre primary (indigo fg), night-lo accent, gold-alpha border | |

**Derived values** (marked `(L)`-style in file comments): the dark hairline alpha,
dark destructive, and the dark chart series are Lodekit-derived — DESIGN.md doesn't
specify them. Final hex is tuned at implementation time against the §8 contrast
test; the values above are starting points, not contracts.

### 2.4 Shape and spacing

- `--radius: 0.1875rem` (3px). Mapping through shadcn's scale: buttons/inputs
  (`rounded-lg` = radius) land exactly on DESIGN.md's 3px; cards/dialogs
  (`rounded-xl` = radius + 4px) land at 7px, inside the 5–8px band; small controls
  bottom out near-sharp (≥1px) via the components' existing `min()` guards.
- `--spacing: 0.25rem` unchanged — DESIGN.md's 4/8/16/24/40 scale is its multiples.
- `--icon-library: lucide` unchanged.

**Accepted internals behavior:** cards/dialogs/popovers draw their edge as
`ring-foreground/10` (ink-tinted, adapts to both plates) rather than `--border`;
visually a hairline in both modes. `--border` still governs separators, inputs,
and tables. Not fought — component internals are never forked (DESIGN.md §5).

## 3. Canonical format extension: `--font-mono`

- **Model** (`packages/engine/dashboard/src/lib/theme-css.ts`): `ThemeModel` gains
  `fontMono: string`; the typed-token map adds `"font-mono": "fontMono"`; parse
  default is `""`; the serializer emits the line alongside the other two fonts.
  Round-trip safe: a theme without the token parses, edits, and serializes without
  data loss (empty field → no line emitted).
- **Fallback:** themes that never set `--font-mono` inherit the baked-in Spline Sans
  Mono stack from `theme-tokens.css` — no visual cliff for existing user themes.
- **Editor** (`theme-editor/controls.tsx`): Typography gains a third select, "Mono
  font"; `importsFor` composes the managed css2 import from all three selections.
- **`FONT_CATALOG`:**
  - Add: Zen Kaku Gothic New (`Zen+Kaku+Gothic+New:wght@400;500;700`), Spline Sans
    Mono (`Spline+Sans+Mono:wght@400;500`), and "System mono"
    (`ui-monospace, monospace`, no import).
  - Remove: Fraunces and Hanken Grotesk — retired by name in DESIGN.md. Existing
    user themes referencing them keep working (the parser preserves any family
    string; the editor shows an unmatched label); they only leave the curated menu.
  - All other entries stay.
- **Tailwind bridge** (`@lodekit/ui/theme.css` `@theme inline`):
  `--font-mono: var(--font-mono)` — the stock `font-mono` utility resolves to the
  themed mono everywhere.

## 4. `@lodekit/ui` identity layer

All in `theme.css` (ours); component internals and the vendored
`shadcn-tailwind.css` are untouched.

- **Motion:** define `--ease-drift: cubic-bezier(.22, 1, .36, 1)`; set Tailwind
  v4's `--default-transition-timing-function` to it so every stock `transition-*`
  utility drifts; expose `ease-drift` as a theme token for explicit use. No other
  easing is introduced anywhere in this slice.
- **Flat Paper via the shadow scale:** redefine the shadow theme tokens as runtime
  `var()`s: `--shadow-2xs`/`--shadow-xs`/`--shadow-sm` → `none` (flat at rest);
  `--shadow-md` and up → the *overlay* value (ink-tinted `rgba(37, 27, 37, …)` per
  DESIGN.md §4 — popovers/menus carry `shadow-md`, so overlay starts there). The
  *lift* value ships as a named token for brand-surface hover use but is not wired
  into the resting scale. `.dark` sets all of them to `none` — dark elevation is
  the night-hi/night-lo lightness steps already in the tokens.
- **Focus:** one base rule on `:focus-visible`: zero the Tailwind ring glow
  (`--tw-ring-shadow: 0 0 #0000 !important` — a documented, centralized
  custom-property override that beats the utility layer without forking any
  component) and draw `outline: 2px solid var(--ring); outline-offset: 3px`.
- **Type base:** `h1–h4` keep `font-family: var(--font-display)` and gain
  `font-weight: 700`.
- **Primitives** (new exports, a few lines each, `className` passthrough, no cva):
  - `Kicker` — mono eyebrow: `font-mono` 0.72rem 500, uppercase,
    `tracking-[0.12em]`, muted-foreground default.
  - `Meta` — mono data voice: `font-mono` 0.8125rem, normal case,
    `tracking-[0.01em]`, `tabular-nums`.
- **Accepted deviations (deliberate, not gaps):** tw-animate entrance micro-motions
  inside dialog/popover internals (`zoom-in-95`, `slide-in-from-*-2`, ~100–200ms)
  stay — they sit within the product duration ramp and removing them means forking
  internals. Cloud drift and the hero entrance are brand-register moves that live
  with the landing work.

## 5. Dashboard chrome pass

All 13 routes plus shared components, expressed only through tokens, utilities,
and the two primitives:

- **Wordmark/lockup** (`logo.tsx`, `header.tsx`): mark beside LODEKIT — Zen Kaku
  700, uppercase, `tracking-[0.22em]`, ~1.25rem, single color, lockup gap ≈0.6em.
  Mark vectors in `packages/engine/src/marks.ts` are untouched.
- **Nav:** active item = page-lo wash (`--sidebar-accent`) + accent text or a ≤2px
  leading indicator (the plan picks one form and applies it consistently); never a
  left-border stripe >1px; hovers fade in place.
- **Kickers:** section eyebrows and uppercase micro-headers migrate to `Kicker`
  (including the theme editor's ad-hoc `text-xs font-semibold uppercase
  tracking-wide` pattern).
- **Data voice:** app ids, paths, timestamps, counts, and table figures migrate to
  `Meta`; `tabular-nums` where figures align.
- **Register sweep:** remove per-screen styling that contradicts the print register
  (resting decorative shadows, non-hairline borders, non-interactive accent color).
  Review bar: the One Accent Rule — rust/ochre only ever means interactive or
  active, ≤~10% of any screen.

## 6. Greenhouse showcase theme

`root/themes/greenhouse-green.css` is recreated from the new lodekit base, keeping
its one demonstration move: a green primary (moss `#4A7B5C` family; light + dark
variants contrast-checked by the §8 test approach), new fonts, and `--font-mono`.
`root/README.md` DoD checklist gains rows: theme sets `--font-mono`; the showcase
exercises `Kicker`/`Meta`.

## 7. Docs skin

`web/docs/src/styles/custom.css`: Starlight accent vars from rust (light) / ochre
(dark) families; `--sl-font` → Zen Kaku Gothic New; Starlight's mono var → Spline
Sans Mono; background vars tinted to the page/night families. Reading-calm
register — zero persuasion moves, no other structural changes (glossary CSS stays).
Exact Starlight variable names are verified at implementation time.

## 8. Verification

- **`theme-css.test.ts`:** expectations updated to the new values; parser
  round-trip tests extended for `fontMono` (present, absent, and edited-in cases).
- **Contrast regression test (new):** parses `lodekit.css` and asserts WCAG AA on
  the load-bearing pairs — foreground/background, primary/primary-foreground,
  muted-foreground/background, destructive pairs, both plates. This discharges
  DESIGN.md §2's "validated properly in the retheme slice" and guards future theme
  edits. Same check applied to the Greenhouse green primary.
- **Visual:** `pnpm dev` against `root/` — dashboard, Greenhouse, Welcome in both
  plates; theme editor round-trips the new default; scaffold smoke (new app renders
  in the identity with zero app-side changes).
- **Changelog:** entry under `## New` (user-visible retheme), same PR.

## 9. Deferrals

Filed as `defer`-labeled beads at execution time:

- Engine-served self-hosted identity fonts (offline purity; removes the Google
  request from the product).
- Deeper motion retuning of tw-animate internals, if the kept micro-motions grate
  against the register in practice.
- Any dashboard screen whose polish exceeds the chrome-pass bar.
