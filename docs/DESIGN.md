---
name: Lodekit
description: The Sky in a Jar — plum ink, parchment, rust and gold in a woodblock-print register
colors:
  ink: "#251B25"
  paper: "#EDE7D8"
  paper-hi: "#F6F1E6"
  paper-lo: "#DCD3BE"
  slate: "#4F4F59"
  hairline: "#CDC4AE"
  hairline-strong: "#AB9F86"
  rust: "#935842"
  rust-deep: "#7C4636"
  ochre: "#DD9741"
  ochre-bright: "#E5A85C"
  night: "#121A44"
  night-hi: "#1B2452"
  night-lo: "#242E63"
  pale-gold: "#F3E0A5"
  parchment: "#C6BBA8"
  print-blue: "#4B5D91"
  cloud-slate: "#8394A9"
  clay-rose: "#AB9184"
typography:
  display:
    fontFamily: "'Zen Kaku Gothic New', 'Hiragino Kaku Gothic ProN', system-ui, sans-serif"
    fontSize: "clamp(2.7rem, 6.4vw, 5rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.022em"
  headline:
    fontFamily: "'Zen Kaku Gothic New', 'Hiragino Kaku Gothic ProN', system-ui, sans-serif"
    fontSize: "clamp(1.8rem, 3.6vw, 2.6rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  title:
    fontFamily: "'Zen Kaku Gothic New', 'Hiragino Kaku Gothic ProN', system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: 1.3
  body:
    fontFamily: "'Zen Kaku Gothic New', 'Hiragino Kaku Gothic ProN', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Spline Sans Mono', ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.12em"
rounded:
  sm: "3px"
  md: "5px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.rust}"
    textColor: "{colors.paper-hi}"
    rounded: "{rounded.sm}"
    padding: "0.85em 1.5em"
  button-primary-hover:
    backgroundColor: "{colors.rust-deep}"
    textColor: "{colors.paper-hi}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.85em 1.5em"
  card:
    backgroundColor: "{colors.paper-hi}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "24px"
  input:
    backgroundColor: "{colors.paper-hi}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.6em 0.9em"
  chip:
    backgroundColor: "{colors.paper-lo}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.35em 0.7em"
---

# Design System: Lodekit

## 1. Overview

**Creative North Star: "The Sky in a Jar"**

Lodekit's mark is a cloud captured in a mason jar: a piece of sky, kept safe at home.
The visual system renders that idea in the register of a woodblock print — flat inks
on aged parchment, hairline rules, one earthen accent — rather than in gloss,
gradient, or glassy chrome. Everything on screen should feel like it could plausibly
have been printed: deliberate, layered, matte, calm. The color is Hokusai's "Somber
Parchment" palette applied wholesale (chosen over an initial cool-sky derivation
after side-by-side exploration); the type, shape grammar, and component behavior are
adapted from the Orikata landing exercise. By day the print is plum ink on
parchment with a rust accent; by night it inverts to pale gold on deep indigo — a
night-sky plate.

The system serves three surfaces with one identity, two registers:

- **Brand register** — the landing site and marketing surfaces. Color commitment is
  allowed: an ochre band can own a moment, deep indigo can own a section, the sky
  family can illustrate. One orchestrated entrance is welcome.
- **Product register** — the dashboard and apps, expressed through `@lodekit/ui`
  tokens. Strictly restrained: parchment surfaces, plum ink text, the accent
  reserved for interaction. Identity comes through in temperature, type, and the
  mono metadata layer, never through decoration.
- **Docs** sit between: the brand's type and palette at reading calm, zero
  persuasion moves.

This system translates `docs/PRODUCT.md` §7 visually: *plain-spoken* → flat inks and
hairlines, no effects; *quietly confident* → committed type scale, sparse accent;
*warm underneath* → the parchment itself and the gold-on-indigo night; *honest to a
fault* → real content, no decorative fakery. The previous identities are fully
retired — cork amber/Fraunces/watercolor, and the interim cool-sky palette
(#F4F7FA paper, #18242F ink, persimmon accent) — never mix either in.

**The Print Test.** The one-sentence audit for any new surface: *if this screen could
not plausibly be a print — too glossy, too neon, too glassy, too animated — it's
off-brand.*

**Key Characteristics:**

- Flat plum ink on aged parchment; depth from paper levels and hairlines, not shadows
- One accent: rust by day, ochre by night — rare in product, committed on brand surfaces
- Night mode is a plate, not a dimming: pale gold ink on deep indigo
- A mono metadata layer (kickers, ids, data) beside one working sans
- Near-sharp corners (3–5px); 1px rules; matte everything
- Motion is drift, not bounce: one curve, a fixed duration ramp, honored
  `prefers-reduced-motion` — and at rest, only clouds drift (§5)

## 2. Colors

Ink, parchment, and pigment: Hokusai's Somber Parchment palette, assigned roles.
Hex is canonical; lineage per swatch — (H) verbatim from the Hokusai palette,
(L) Lodekit-derived (page surfaces lightened from Parchment, state variants).

### Primary

- **Rust** (#935842, H): the light-mode accent. Primary buttons, links, active
  states, focus rings. Text-safe on the page (≈4.7:1 — AA, with little margin;
  don't lighten it).
- **Rust Deep** (#7C4636, L): hover/pressed state of rust fills (product register).
- **Ochre** (#DD9741, H): the dark-mode accent (≈6.8:1 on night) and the brand
  drench band (with plum ink text). In light mode, graphics and illustration only.
- **Ochre Bright** (#E5A85C, L): dark-mode hover state of ochre fills.

### Neutral

- **Plum Ink** (#251B25, H): all text, the mark, icons, strong borders. A cool
  plum-black — print ink, not gray.
- **Slate** (#4F4F59, H): secondary/muted text on the page (≈6.6:1).
- **Page** (#EDE7D8, L): the light-mode surface — aged paper, lightened from
  Parchment. **Page High** (#F6F1E6, L): raised surfaces — cards, popovers,
  inputs. **Page Low** (#DCD3BE, L): recessed washes — muted fills, wells.
- **Hairline** (#CDC4AE, L): default 1px rules and borders. **Hairline Strong**
  (#AB9F86, L) where a rule must assert (table headers, section dividers).
- **Deep Indigo** (#121A44, H): the night — dark-mode surface and dark landing
  sections. **Night High** (#1B2452, L) cards / **Night Low** (#242E63, L)
  washes — dark-mode depth comes from these lightness steps, never from shadows.
- **Pale Gold** (#F3E0A5, H): dark-mode text ink (≈12.6:1 on night). Ink only —
  never a surface, never a background.
- **Parchment** (#C6BBA8, H): the source of the page family; dark-mode
  secondary/muted text.

### Tertiary

The sky family — illustration, decorative geometry, and charts only:

- **Print Blue** (#4B5D91, H): deep sky in illustration, chart series. Never on
  interactive elements or text.
- **Cloud Slate** (#8394A9, H): cloud bodies, large decorative shapes. Fails text
  contrast; never for copy or controls.
- **Clay Rose** (#AB9184, H): warm mid-tone for illustration depth.

Semantic starting points for product UI (validated properly in the retheme slice):
success #4A7B5C, warning ochre #DD9741 (collides with the dark-mode accent — in
dark, warning chips must lean on their glyph and label, which the never-color-alone
rule requires anyway; revisit in the retheme slice), destructive crimson #A61E33
(deliberately redder and cooler than rust so action and danger never blur), info
#3E5380 (a text-safe derivative of print blue). Chart series, fixed order: print
blue #4B5D91, ochre #DD9741, rust #935842, cloud slate #8394A9, plum #251B25
(dark mode brightens each).

**The One Accent Rule.** In the product register, the accent (rust by day, ochre by
night) appears on at most ~10% of any screen and only ever means "interactive or
active": the primary action, the selected state, the focus ring, the link. It never
decorates. Brand surfaces may exceed this deliberately — an ochre drench band, a
committed CTA moment — but always as a chosen move, never as seasoning.

**The Sky-Is-Decoration Rule.** The tertiary family (print blue, cloud slate, clay
rose) lives in illustrations, decorative geometry, and charts. None of it may color
a button, link, or body text.

**The Parchment Rule.** Surfaces are aged paper — the Page family by day, Deep
Indigo by night. Pale Gold is ink for the night plate, never a surface. The retired
cool-sky surfaces (#F4F7FA family) and Orikata's washi (#F4EFE3) are out — don't
reintroduce them.

## 3. Typography

**Display/Body Font:** Zen Kaku Gothic New (with Hiragino Kaku Gothic ProN,
system-ui fallbacks) — weights 400 / 500 / 700
**Label/Mono Font:** Spline Sans Mono (with ui-monospace fallback) — weights 400 / 500

**Character:** One calm geometric-humanist sans does all the speaking, from hero to
caption; a soft mono annotates it — kickers, app ids, data, timestamps. The pairing
is quiet, literate, and slightly technical, like captions on a print. Both families
are SIL OFL (Google Fonts); load only the weights above, `font-display: swap`.

### Hierarchy

- **Display** (700, clamp(2.7rem, 6.4vw, 5rem), 1.05, -0.022em): landing hero only.
  Sentence case — the hero speaks; it is not the wordmark.
- **Headline** (700, clamp(1.8rem, 3.6vw, 2.6rem), 1.15, -0.015em): landing section
  heads, docs page titles.
- **Title** (500 or 700, 1.125–1.375rem fixed, 1.3): product UI headings, card
  titles, dialog titles. Product type is a fixed rem scale (~1.2 ratio); fluid
  `clamp()` belongs to brand surfaces only.
- **Body** (400, 1rem, 1.6): reading text, `max-width: 65ch`. Compact UI text
  (labels, table cells, meta) may drop to 0.875rem/1.45 — never running paragraphs.
- **Label** (mono 500, 0.72–0.8125rem): two modes. *Kicker*: uppercase,
  letter-spacing 0.12em — section eyebrows, status chips. *Data*: normal case,
  letter-spacing 0.01em — app ids, paths, values, timestamps; `tabular-nums` for
  aligned figures.

### Named Rules

**The Two-Voice Rule.** Zen Kaku Gothic New speaks; Spline Sans Mono annotates.
There is no third family, and mono never sets running text.

**The Caps Budget Rule.** Uppercase exists in exactly two places: mono kickers and
the wordmark. Never all-caps body, never all-caps sans headings.

## 4. Elevation

Flat by default: this is a print, and prints have no shadows. Depth is conveyed by
paper levels (page → page-hi → page-lo) and hairline rules. Shadows exist only as
*response* — a hover-lift on clickable landing cards, and overlays (dialogs,
popovers, menus) that genuinely float above the page. All shadows are ink-tinted
(`rgba(37, 27, 37, …)`), soft and low-alpha, never pure black and never tight/dark.
Dark mode has no shadows at all: elevation is night → night-hi → night-lo lightness.

### Shadow Vocabulary

- **lift** (`box-shadow: 0 1px 2px rgba(37,27,37,.08), 0 14px 34px -22px rgba(37,27,37,.4)`):
  hover state of clickable cards on brand surfaces.
- **overlay** (`box-shadow: 0 2px 4px rgba(37,27,37,.08), 0 22px 44px -20px rgba(37,27,37,.42)`):
  dialogs, popovers, dropdown menus — both registers.

### Named Rules

**The Flat Paper Rule.** Surfaces are flat at rest. A shadow is always an answer to
something the user did (hover, open), never a resting decoration. If a card has a
shadow while nobody is touching it, it's off-brand.

## 5. Components

Component character: printed, not plastic. Near-sharp corners, hairline strokes,
matte fills, motion that settles like paper (the full doctrine below). In product,
components are stock shadcn/`@lodekit/ui` internals expressing identity through
tokens only — never fork or restyle component internals.

### Motion & interaction states

Motion is drift: a response that settles, never a bounce. The discipline is one
curve, one duration ramp, and a short list of named moves — nothing else animates.
The hover language is **fade**: hover states crossfade in place — nothing slides,
nothing sweeps (chosen over the sheet-slide and the subtle wash in side-by-side
exploration).

- **One curve.** `--ease-drift: cubic-bezier(.22, 1, .36, 1)` is the only easing.
  CSS keyword easings (`ease`, `ease-in`, `ease-out`, `ease-in-out`) and
  spring/bounce/elastic curves are prohibited; the `linear` keyword is permitted
  solely inside the cloud-drift loop, where constant speed is the point.
- **Duration ramp.** Feedback (press, toggle, color) 100–150ms · state changes
  (hover, tooltip, menu) 200–300ms · movement and overlays (lift, dialog, drawer)
  300–450ms on brand surfaces, 200–300ms in product · exits at ~75% of their
  entrance. Hover feedback must be *perceived* to start within ~150ms.
- **The entrance** (brand only): one orchestrated hero entrance per page —
  fade-up in hierarchy order (kicker → headline → subhead → CTAs → art), 80–120ms
  stagger steps, the whole sequence ≤800ms. Nothing else animates on load, and
  product surfaces never run entrance choreography — the person is mid-task.
- **Below the fold is calm.** No per-section scroll reveals, no parallax, no
  kinetic text splitting — a print doesn't animate as you turn the page. The
  fade-up-every-section pattern is rejected by name as the saturated default.
- **States are complete.** Every interactive element defines hover, active
  (`translateY(1px)` or equivalent, ~100ms), `:focus-visible` (the 2px accent
  outline, offset 3px), and disabled (50% opacity, no motion, no hover). Links
  and nav items hover by the accent underline fading in place (opacity 0→1,
  ~250ms, full width — it never slides). Loading in product is a page-lo skeleton
  wash with a slow opacity pulse — never a spinner parade.
- **Performance floor.** Animate `transform`, `opacity`, and `filter` only;
  scroll work goes through `IntersectionObserver` (fire once, unobserve); no
  scroll-jacking, no smooth-scroll hijack, no custom cursors, no preloaders.
- **Reduced motion.** Under `prefers-reduced-motion`, transforms and the cloud
  drift stop entirely; what remains is at most an opacity fade at ~150ms.

**The Only-Clouds-Drift Rule.** Nothing on a Lodekit surface moves at rest, with
one exception: illustration clouds may drift — two-axis paths, 20–40s periods, a
few pixels of travel, barely perceptible, gone under reduced motion. Clouds are
the one thing in this world that genuinely moves; nothing else earns ambient
motion.

### Buttons

- **Shape:** near-sharp (3px radius), padding 0.85em 1.5em, sans 500 at 0.95rem.
- **Primary:** rust fill (#935842), page-high text; dark mode is ochre fill
  (#DD9741) with deep-indigo text. Hover: brand surfaces crossfade a night sheet
  in beneath the label — deep indigo with pale-gold text by day, pale gold with
  indigo text by night (opacity fade, ~250ms ease-drift; it never slides);
  product simply deepens (rust-deep #7C4636 / ochre-bright #E5A85C). Active:
  `translateY(1px)`, ~100ms.
- **Focus:** 2px accent outline, offset 3px — an outline, never a glow.
- **Ghost:** transparent, ink text, 1.5px hairline border at `rgba(37,27,37,.35)`;
  hover: border resolves to ink — a fade, no movement.

### Cards / Containers

- **Corner Style:** 5px radius (8px for hero-scale panels).
- **Background:** page-hi on page; night-hi on night.
- **Border:** 1px hairline (#CDC4AE) — always present; the rule does the work.
- **Shadow Strategy:** flat at rest; *lift* on hover only when the card is a link.
- **Internal Padding:** 24px (16px compact).

### Inputs / Fields

- **Style:** page-hi fill, 1px hairline border, 3px radius, ink text, slate placeholder.
- **Focus:** border resolves to ink plus the 2px accent outline; no glow.
- **Error:** crimson (#A61E33) border and message — message text, never color alone.

### Chips / Badges

- **Style:** mono kicker type (0.72rem, uppercase, 0.12em) on page-lo fill or a
  bare hairline outline, 3px radius. Status chips pair a semantic color with a label
  or glyph, never color alone.

### Navigation

- **Landing header:** the lockup left; links in sans 500 at 0.95rem, ink; current or
  hover state marked by an accent 2px underline that fades in place (never a fill,
  never a slide).
- **Product sidebar/nav:** ink on page, active item = page-lo wash + accent
  text or leading indicator ≤2px tall (an underline or dot — never a left border
  stripe >1px).

### The Mark & Wordmark (signature)

- **The mark** is the jar-cloud, three styles — a "Solid", b "Knockout" (default),
  c "Outline" — with vector source of truth in `packages/engine/src/marks.ts`
  (32×32 viewBox, `currentColor` throughout). Never redraw, re-proportion, rotate,
  or gradient-fill it; new consumers import from marks.ts.
- **Mark color:** plum ink on the page, pale gold on night. The accent is permitted
  as a deliberate brand moment (hero, favicon flourish) — one color at a time,
  always flat.
- **The wordmark** is LODEKIT: Zen Kaku Gothic New 700, uppercase, letter-spacing
  0.22em, ~1.25rem — a label, not a headline. It sits in headers and footers;
  page heroes use Display sentence case instead.
- **The lockup:** mark beside wordmark, gap ≈0.6em, optically aligned to cap
  height; both in the same single color. Clear space around the lockup ≥ the width
  of the jar's lid; minimum mark size 16px.
- **Favicons:** the platform favicon is the mark (plum ink, flipping to pale gold
  via `prefers-color-scheme`); each app's favicon is its manifest emoji. Both ship
  from the engine — don't hand-author favicon files.

## 6. Do's and Don'ts

### Do:

- **Do** set all text as plum ink on the page (or pale gold on night) — text is
  printed, never gray-on-gray, never thin-light-on-image.
- **Do** reach for a hairline (1px, #CDC4AE) whenever structure is needed; rules are
  this system's chrome.
- **Do** use mono kickers (0.72rem, uppercase, 0.12em tracking) as the section
  eyebrow and metadata voice — it is the identity's most portable gesture.
- **Do** keep the accent rare in product (≤10%, interactive-only) and committed on
  brand surfaces when a section earns it.
- **Do** draw illustration from the sky family (print blue, cloud slate, clay rose,
  plus ochre for sun warmth) in flat print-like shapes — no gradients inside
  illustrations.
- **Do** meet WCAG AA minimum everywhere (4.5:1 text, 3:1 UI); the text-safe pairs
  in §2 are pre-checked — recheck anything new, and treat rust's ≈4.7:1 as a floor
  with no room to lighten.
- **Do** give every interactive element the complete state set — hover, active,
  focus-visible, disabled — on the §5 duration ramp (feedback perceived ≤150ms).
- **Do** honor `prefers-reduced-motion` and keep zoom enabled always.

### Don't:

- **Don't** use Pale Gold (#F3E0A5) as a background or surface — it is the night
  plate's text ink, nothing else.
- **Don't** put Print Blue (#4B5D91) on interactive elements or text — illustration
  and charts only.
- **Don't** resurrect the retired identities: no cork amber (#CE6F26 family), no
  Fraunces, no Hanken Grotesk, no watercolor — and no interim cool-sky palette
  (#F4F7FA paper, #18242F ink, #C03F16 persimmon accent) or Orikata washi #F4EFE3.
- **Don't** ship glassmorphism, neon, purple-blue gradients, glows, or heavy drop
  shadows — everything must pass the Print Test (§1).
- **Don't** use a `border-left`/`border-right` thicker than 1px as a colored accent
  stripe — active/warning states use a full hairline, a wash, or a leading glyph.
- **Don't** put the sky family on interactive elements, or gray/slate text on
  colored fills.
- **Don't** set all-caps outside the two budgeted places (mono kickers, wordmark),
  and don't let mono set running text.
- **Don't** use spring, bounce, or elastic easing, CSS keyword easings, or a
  second curve — `--ease-drift` is the only ease (`linear` only inside the
  cloud-drift loop).
- **Don't** slide, sweep, or wipe hover states — the hover language is fade, in
  place. And don't fade-up sections on scroll, split text into characters, add
  parallax, custom cursors, or preloaders — the hero entrance and the cloud drift
  are the only motion that isn't a response to the user.
- **Don't** visually hype: no starbursts, no gradient meshes, no "revolutionary"
  energy — PRODUCT.md's voice is *quietly confident*, and per its principles the
  imagery never mocks people (the enemy is systems: meters, silos, clouds-as-cages).
- **Don't** fork `@lodekit/ui` component internals for styling — identity flows
  through tokens only.
