# web-main Theme Iteration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** Revise the landing-site (web/main) theme: default readable weight 500, lighter
light-mode paper scale, livelier accents (persimmon deep by day, bright gold by night),
an ink CTA on the ochre band, and a Dongle-700 wordmark.

**Architecture:** All color flows through the role tokens in
`web/main/src/styles/globals.css` (`:root` light plate, `.dark` night plate,
`@theme inline` Tailwind mapping), so the palette change is almost entirely one file.
Weight changes are a `body` default plus explicit `font-normal` on three detailing
spots. The wordmark font is a new `@fontsource` import plus one class change in
`Lockup.astro`.

**Tech Stack:** Astro 7, Tailwind CSS v4 (`@theme inline` tokens), @fontsource
self-hosted fonts, vitest.

## Global Constraints

- **Scope is web/main only.** `docs/DESIGN.md`, `@lodekit/ui`, and the engine themes are
  deliberately NOT touched in this slice — they follow in a later slice once the landing
  iteration settles visually (the person approved diverging from DESIGN.md here).
- **Decided values** (approved by the person, contrast pre-checked):
  - Light page `#F6F1E6` (old paper-hi) · cards/inputs `#FCF9F0` (new) · wash/chip
    `#DCD3BE` (unchanged) · hairlines unchanged.
  - Light accent: persimmon `#A93510` (5.8:1 on page, 6.2:1 on card) replaces rust
    `#935842`; deep variant `#8A2B0D`.
  - Dark accent: gold `#F0A73C` (8.2:1 on night, both directions) replaces ochre as
    `--primary`/`--ring`; the ochre plate (CTA band) keeps `#DD9741`.
  - CTA band (`plate-ochre`): button becomes ink fill / pale-gold text (ink on ochre
    6.8:1); hover crossfades to a **paper sheet** (paper-hi fill, ink text) — NOT the
    night sheet (person: ink→night "doesn't render well").
  - Weight: body default 500. Explicit 400 ("detailing") on exactly three spots: the
    notify-form note, the hero-demo conversation copy, the footer line.
  - Wordmark: Dongle 700 (Google font, via `@fontsource/dongle` ^5.3.0), uppercase and
    0.22em tracking kept; size compensated upward (Dongle renders small in its em box).
- **Surgical:** don't rename/delete unrelated tokens; `--ochre`/`--ochre-bright` stay
  (the plate uses them). `--rust`/`--rust-deep` are renamed to
  `--persimmon`/`--persimmon-deep` because their values change identity — grep confirms
  no component uses `rust` classes directly.
- **No changelog entry** — landing-site work is not a product-user-facing change
  (precedent: PR #113 appended nothing).
- **Motion/identity rules still apply:** hover = crossfade in place, `--ease-drift`
  only, no new animation.

---

### Task 1: Palette & role tokens (globals.css)

**Files:**
- Modify: `web/main/src/styles/globals.css:11-79` (physical palette + role tokens),
  `:101-125` (`@theme inline` mapping), `:135-142` (selection), `:242-271` (plate-ochre)

**Interfaces:**
- Consumes: nothing.
- Produces: CSS custom properties `--persimmon`, `--persimmon-deep`, `--gold` (replacing
  `--rust`, `--rust-deep`); Tailwind color utilities `persimmon`, `persimmon-deep`,
  `gold` (replacing `rust`, `rust-deep`). All role tokens (`--primary`, `--ring`, …)
  keep their names — components are untouched.

**Acceptance Criteria:**
- Light page background is `#F6F1E6`; cards/inputs/popovers are `#FCF9F0`; `--paper-lo`
  still `#DCD3BE`.
- Light `--primary`/`--ring` resolve to `#A93510`; dark `--primary`/`--ring` resolve to
  `#F0A73C`; the ochre plate still renders `#DD9741`.
- `.plate-ochre .btn-primary` is ink fill with pale-gold text; its hover is paper-hi
  fill with ink text (no night sheet inside the band).
- Light `::selection` is persimmon; dark `::selection` is gold.
- No occurrence of `--rust` or `--color-rust` remains in the repo's `web/main` tree.

- [ ] **Step 1: Update the physical palette in `:root`**

In `web/main/src/styles/globals.css`, replace the paper and accent entries of the
physical palette (lines 14–16 and 20–22) and add `--gold` after `--ochre-bright`:

```css
  --paper: #f6f1e6;
  --paper-hi: #fcf9f0;
  --paper-lo: #dcd3be;
```

```css
  --persimmon: #a93510;
  --persimmon-deep: #8a2b0d;
  --ochre: #dd9741;
  --ochre-bright: #e5a85c;
  --gold: #f0a73c;
```

- [ ] **Step 2: Point the role tokens at the new accents**

Light plate (`:root`): `--primary: var(--persimmon);` and `--ring: var(--persimmon);`
(replacing the two `var(--rust)` references).

Dark plate (`.dark`): `--primary: var(--gold);` and `--ring: var(--gold);` (replacing
the two `var(--ochre)` references). `--primary-foreground: var(--night)` stays.

- [ ] **Step 3: Update the `@theme inline` mapping**

Replace:

```css
  --color-rust: var(--rust);
  --color-rust-deep: var(--rust-deep);
```

with:

```css
  --color-persimmon: var(--persimmon);
  --color-persimmon-deep: var(--persimmon-deep);
```

and add `--color-gold: var(--gold);` after `--color-ochre-bright`.

- [ ] **Step 4: Update selection colors**

In `@layer base`, light `::selection` becomes persimmon; dark becomes gold:

```css
  ::selection {
    background: var(--persimmon);
    color: var(--paper-hi);
  }
  .dark ::selection {
    background: var(--gold);
    color: var(--night);
  }
```

- [ ] **Step 5: Rework the ochre-plate button**

Replace the `.plate-ochre .btn-primary` rules (and the stale comment
`/* on the ochre plate the night sheet still reads; keep as-is */` above the plate
block) with an ink button whose hover reveals the paper sheet:

```css
  /* on the ochre plate the button is print ink; hover reveals the paper sheet
     (the night sheet reads badly against the drench — person-reviewed) */
  .plate-ochre .btn-primary {
    background: var(--ink);
    color: var(--pale-gold);
  }
  .plate-ochre .btn-primary:hover {
    background: var(--paper-hi);
    color: var(--ink);
  }
```

`.plate-ochre .field` and `.plate-ochre :focus-visible` are untouched.

- [ ] **Step 6: Verify no stale references**

Run: `/usr/bin/grep -rn "rust" web/main/src` — expected: no matches.
Run: `pnpm --filter @lodekit/web-main build` — expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add web/main/src/styles/globals.css
git commit -m "feat(web-main): lighter paper scale, persimmon/gold accents, ink CTA on ochre band (lk-e09)"
```

---

### Task 2: Weight defaults — 500 body, 400 detailing

**Files:**
- Modify: `web/main/src/styles/globals.css:131-134` (body)
- Modify: `web/main/src/components/NotifyForm.astro:22`
- Modify: `web/main/src/components/Footer.astro:10`
- Modify: `web/main/src/components/demo/HeroDemo.tsx:186`

**Interfaces:**
- Consumes: nothing from Task 1 (independent styles; sequenced only to serialize edits
  to globals.css).
- Produces: nothing later tasks rely on.

**Acceptance Criteria:**
- `body` sets `font-weight: 500`; all paragraphs (hero, pillars, oscillation band, CTA
  band, dev layer) render at 500 without per-component classes.
- Exactly three spots render at 400 via `font-normal`: the notify-form note ("One email
  when the alpha ships. Nothing else."), the hero-demo conversation area, the footer
  line.
- Kickers, chips, and the demo's mono rows are unaffected (they set weight explicitly).

- [ ] **Step 1: Set the body default**

In `globals.css` `@layer base`:

```css
  body {
    @apply bg-background font-sans text-foreground;
    font-weight: 500;
    line-height: 1.6;
  }
```

- [ ] **Step 2: Pin the three detailing spots to 400**

`NotifyForm.astro` line 22:

```html
  <p class="mt-3 text-sm font-normal opacity-75" data-notify-note>One email when the alpha ships. Nothing else.</p>
```

`Footer.astro` line 10:

```html
    <p class="text-sm font-normal text-muted-foreground">macOS only, for now. · © 2026 Lodekit</p>
```

`HeroDemo.tsx` — add `font-normal` to the card root so the conversation copy (which has
no explicit weights) drops to 400 while the kicker/chip/suggestion keep their own:

```tsx
      className="flex h-[540px] flex-col overflow-hidden rounded-[8px] border border-border bg-card font-normal"
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @lodekit/web-main test` — expected: all vitest suites pass.
Run: `pnpm --filter @lodekit/web-main build` — expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add web/main/src/styles/globals.css web/main/src/components/NotifyForm.astro web/main/src/components/Footer.astro web/main/src/components/demo/HeroDemo.tsx
git commit -m "feat(web-main): 500 default text weight, 400 reserved for detailing (lk-ggx)"
```

---

### Task 3: Dongle 700 wordmark

**Files:**
- Modify: `web/main/package.json` (via pnpm add)
- Modify: `web/main/src/layouts/Base.astro:3-7` (font imports)
- Modify: `web/main/src/components/Lockup.astro:12`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing later tasks rely on.

**Acceptance Criteria:**
- `@fontsource/dongle` is a dependency; only the 700 weight css is imported.
- The wordmark ("Lodekit" in `Lockup.astro`, used by Header and Footer) renders in
  Dongle 700, uppercase, 0.22em tracking, sized to visually match the previous
  1.1rem Zen Kaku mark (Dongle's glyphs sit small in the em box — start at 1.75rem).
- The mark (SVG) and lockup gap/alignment are unchanged.

- [ ] **Step 1: Add the dependency**

Run: `pnpm --filter @lodekit/web-main add @fontsource/dongle`
Expected: `@fontsource/dongle` `^5.3.0` appears in `web/main/package.json`.

- [ ] **Step 2: Import the 700 weight**

In `Base.astro`, after the Zen Kaku imports:

```astro
import "@fontsource/dongle/700.css";
```

- [ ] **Step 3: Switch the wordmark font**

`Lockup.astro` line 12:

```html
  <span class="font-[Dongle] text-[1.75rem] leading-none font-bold tracking-[0.22em] uppercase">Lodekit</span>
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @lodekit/web-main build` — expected: clean build (the fontsource
import resolves).

- [ ] **Step 5: Commit**

```bash
git add web/main/package.json pnpm-lock.yaml web/main/src/layouts/Base.astro web/main/src/components/Lockup.astro
git commit -m "feat(web-main): Dongle 700 wordmark (lk-x7w)"
```

---

### Task 4: Full verify + visual pass handoff

**Files:**
- None created/modified (verification only; fixes fold back into the task that owns
  them).

**Interfaces:**
- Consumes: all prior tasks' output.
- Produces: a running dev server for the person's visual iteration.

**Acceptance Criteria:**
- `pnpm --filter @lodekit/web-main test` passes.
- `pnpm --filter @lodekit/web-main build` passes.
- Dev server runs; the person has been given the URL and the list of what changed to
  eyeball (page/card tones, persimmon CTAs, gold dark accent, ink CTA on the ochre
  band + paper-sheet hover, 500/400 weight split, Dongle wordmark size/tracking).

- [ ] **Step 1: Run the suite and build**

Run: `pnpm --filter @lodekit/web-main test && pnpm --filter @lodekit/web-main build`
Expected: PASS / clean build.

- [ ] **Step 2: Start the dev server for the visual pass**

Run: `pnpm --filter @lodekit/web-main dev` (background)
Expected: local URL reported to the person; iteration continues live (wordmark size
and tracking, emphasis spots that were `font-medium` and now equal the 500 default —
e.g. the hero tagline and the oscillation band's "could" column — are tuned here by
eye, not pre-decided).

---

## Out of scope (follow-up slice, after visual settle)

- `docs/DESIGN.md` revision (palette swatches, weight hierarchy, wordmark section).
- `@lodekit/ui` `theme-tokens.css` + `packages/engine/src/themes/lodekit.css` lockstep
  (the product-register identity), including the theme-contrast AA gate rerun.
- Real font metrics tuning of the Dongle lockup across Header/Footer if 1.75rem is off.
