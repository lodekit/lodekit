---
name: Lodekit
description: Cloud Captured — plum ink, parchment, persimmon and gold in a woodblock-print register
colors:
  ink: "#251B25"
  paper: "#F6F1E6"
  paper-hi: "#FCF9F0"
  paper-lo: "#DCD3BE"
  slate: "#4F4F59"
  hairline: "#CDC4AE"
  hairline-strong: "#AB9F86"
  persimmon: "#A93510"
  persimmon-deep: "#8A2B0D"
  ochre: "#DD9741"
  ochre-bright: "#E5A85C"
  gold: "#F0A73C"
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
    fontWeight: 500
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
    backgroundColor: "{colors.persimmon}"
    textColor: "{colors.paper-hi}"
    rounded: "{rounded.sm}"
    padding: "0.85em 1.5em"
  # Marketing-surface hover: the night sheet crossfades in beneath the label. The
  # Product register instead steps the fill's alpha (hover:bg-primary/80) — a
  # treatment no color token can express. See Foundations › Buttons.
  button-primary-hover:
    backgroundColor: "{colors.night}"
    textColor: "{colors.pale-gold}"
  button-ghost:
    backgroundColor: "color-mix(in srgb, currentColor 8%, transparent)"
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

# Design

One identity, two systems. **Foundations** (§1) is the shared token base: palette,
type, elevation, component character, the mark. **Marketing** (§2) is the register
for web-main and outward-facing surfaces. **Product** (§3) covers everything inside
the product: the dashboard, apps, web-docs, the manager. The product ships
**neutral by default** (the stock-shadcn `shadcn` theme); the identity applies
inside the product only through the selectable `lodekit` theme, so §1's rulings
bind Marketing surfaces always and product surfaces when that theme is active.

## 1. Foundations

### Overview

**Creative North Star: "Cloud Captured"**

Lodekit's mark is a cloud captured in a mason jar: a piece of sky, kept safe at
home. The visual system renders that idea as a woodblock print — flat inks on aged
parchment, hairline rules, one earthen accent — not as gloss, gradient, or glassy
chrome. Everything on screen should look like it could plausibly have been printed:
deliberate, layered, matte, calm. The color is Hokusai's "Somber Parchment" palette
applied wholesale (chosen over an initial cool-sky derivation after side-by-side
exploration); the type, shape grammar, and component behavior are adapted from the
Orikata landing exercise. By day the print is plum ink on parchment with a
persimmon accent. By night it inverts to pale gold on deep indigo with a gold
accent: a night-sky plate.

This system translates `docs/PRODUCT.md` §7 visually: *plain-spoken* → flat inks
and hairlines, no effects; *quietly confident* → committed type scale, sparse
accent; *warm underneath* → the parchment itself and the gold-on-indigo night;
*honest to a fault* → real content, no decorative fakery. The previous identities
are fully retired — cork amber/Fraunces/watercolor, and the interim cool-sky
palette (#F4F7FA paper, #18242F ink, #C03F16 accent) — never mix either in. The
retired cool-sky accent was also called persimmon; it is a different, hotter
orange-red and has nothing to do with the current accent, persimmon #A93510
(Colors).

**The Print Test.** The one-sentence audit for any new surface: *if this screen
could not plausibly be a print — too glossy, too neon, too glassy, too animated —
it's off-brand.*

**Key Characteristics:**

- Flat plum ink on aged parchment; depth from paper levels and hairlines, not
  shadows
- One accent: persimmon by day, gold by night. Rare in Product, committed on
  Marketing surfaces
- Night mode is a plate, not a dimming: pale gold ink on deep indigo
- A mono metadata layer (kickers, ids, data) beside one working sans
- Near-sharp corners (3–5px); 1px rules; matte everything
- Motion is drift, not bounce: one curve, a fixed duration ramp, honored
  `prefers-reduced-motion`. At rest, only clouds drift

### Colors

Ink, parchment, and pigment: Hokusai's Somber Parchment palette, assigned roles.
Hex is canonical. Lineage per swatch: (H) verbatim from the Hokusai palette, (L)
Lodekit-derived (page surfaces lightened from Parchment, accents and state
variants).

#### Primary

- **Persimmon** (#A93510, L): the light-mode accent. Primary buttons, links,
  active states, focus rings. Text-safe on the page (5.82:1 — AA with real
  margin).
- **Persimmon Deep** (#8A2B0D, L): the deepened persimmon (7.67:1 on the page),
  for hover and emphasis where a darker step is wanted. Reserved; no surface
  ships it today. The marketing hover is the night sheet, and Product steps
  alpha.
- **Gold** (#F0A73C, L): the dark-mode accent (8.19:1 on the night plate).
  Primary buttons, links, active states, focus rings on the night plate.
- **Ochre** (#DD9741, H): the marketing drench plate — an ochre band carrying
  plum ink text — and, in light mode, illustration and charts. Not an
  interactive color in either plate.
- **Ochre Bright** (#E5A85C, L): an illustration and chart value; its one
  surviving consumer is the dark-mode `--chart-2`.

#### Neutral

- **Plum Ink** (#251B25, H): all text, the mark, icons, strong borders. A cool
  plum-black: print ink, not gray.
- **Slate** (#4F4F59, H): secondary/muted text on the page (≈7.2:1).
- **Page** (#F6F1E6, L): the light-mode surface, aged paper lightened from
  Parchment. **Page High** (#FCF9F0, L): raised surfaces — cards, popovers,
  inputs. **Page Low** (#DCD3BE, L): recessed washes — muted fills, wells.
- **Hairline** (#CDC4AE, L): default 1px rules and borders. **Hairline Strong**
  (#AB9F86, L) where a rule must assert (table headers, section dividers).
- **Deep Indigo** (#121A44, H): the night — dark-mode surface and dark landing
  sections. **Night High** (#1B2452, L) cards / **Night Low** (#242E63, L)
  washes. Dark-mode depth comes from these lightness steps, never from shadows.
- **Pale Gold** (#F3E0A5, H): dark-mode text ink (≈12.6:1 on night). Ink only —
  never a surface, never a background.
- **Parchment** (#C6BBA8, H): the source of the page family; dark-mode
  secondary/muted text.

#### Tertiary

The sky family — illustration, decorative geometry, and charts only:

- **Print Blue** (#4B5D91, H): deep sky in illustration, chart series. Never on
  interactive elements or text.
- **Cloud Slate** (#8394A9, H): cloud bodies, large decorative shapes. Fails text
  contrast; never for copy or controls.
- **Clay Rose** (#AB9184, H): warm mid-tone for illustration depth.

Semantic starting points for product UI (the retheme slice validated destructive
via the theme-contrast gate; the rest remain starting points — the canonical token
set carries only `--destructive`): success #4A7B5C; warning ochre #DD9741 (it sits
close to gold, the dark-mode accent, so in dark mode warning chips must lean on
their glyph and label — the never-color-alone rule requires that anyway);
destructive crimson #A61E33 (deliberately redder and cooler than persimmon so
action and danger never blur); info #3E5380 (a text-safe derivative of print
blue). Chart series, fixed order: print blue #4B5D91, ochre #DD9741, persimmon
#A93510, cloud slate #8394A9, plum #251B25 (dark mode brightens each).

**The One Accent Rule.** On identity-dressed product surfaces (the `lodekit`
theme), the accent (persimmon by day, gold by night) appears on at most ~10% of
any screen and only ever means "interactive or active": the primary action, the
selected state, the focus ring, the link. It never decorates. Marketing surfaces
may exceed this deliberately — an ochre drench band, a committed CTA moment — but
always as a chosen move, never as seasoning.

**The Sky-Is-Decoration Rule.** The tertiary family (print blue, cloud slate,
clay rose) lives in illustrations, decorative geometry, and charts. None of it may
color a button, link, or body text.

**The Parchment Rule.** Surfaces are aged paper: the Page family by day, Deep
Indigo by night. Pale Gold is ink for the night plate, never a surface. The
retired cool-sky surfaces (#F4F7FA family) and Orikata's washi (#F4EFE3) are out;
don't reintroduce them.

### Typography

**Display/Body Font:** Zen Kaku Gothic New (with Hiragino Kaku Gothic ProN,
system-ui fallbacks) — weights 400 / 500 / 700
**Label/Mono Font:** Spline Sans Mono (with ui-monospace fallback) — weights 400 / 500
**Wordmark Font:** M PLUS 1 Code (with ui-monospace fallback) — weight 700, the
wordmark and nothing else (Mark & Wordmark)

**Character:** One calm geometric-humanist sans does all the speaking, from hero
to caption; a soft mono annotates it — kickers, app ids, data, timestamps. The
pairing is quiet, literate, and slightly technical, like captions on a print. All
three families are SIL OFL (Google Fonts); load only the weights above,
`font-display: swap`.

#### Hierarchy

- **Display** (700, clamp(2.7rem, 6.4vw, 5rem), 1.05, -0.022em): landing hero
  only. Sentence case — the hero speaks; it is not the wordmark.
- **Headline** (700, clamp(1.8rem, 3.6vw, 2.6rem), 1.15, -0.015em): landing
  section heads, docs page titles.
- **Title** (500 or 700, 1.125–1.375rem fixed, 1.3): product UI headings, card
  titles, dialog titles. Product type is a fixed rem scale (~1.2 ratio); fluid
  `clamp()` belongs to Marketing surfaces only.
- **Body** (500, 1rem, 1.6): reading text, `max-width: 65ch`. 500 is the
  identity's body weight: Marketing surfaces set it in their own styles, and in
  the product the `lodekit` theme carries it as `--font-weight-body: 500` (the
  neutral default is stock 400). **400 is the detailing weight**, used sparingly
  where text should recede: notes, secondary captions, long-form demo copy.
  Compact UI text (labels, table cells, meta) may drop to 0.875rem/1.45 — never
  running paragraphs.
- **Label** (mono, 0.72–0.8125rem): two modes. *Kicker* (500): uppercase,
  letter-spacing 0.12em — section eyebrows, status chips. *Data* (400): normal
  case, letter-spacing 0.01em — app ids, paths, values, timestamps;
  `tabular-nums` for aligned figures. The mono voice sets at 400 rather than
  inheriting the body's 500, because at 500 it reads as emphasis instead of
  annotation. Code, `kbd`, `samp`, and `pre` follow the data weight.

**The Two-Voice Rule.** Zen Kaku Gothic New speaks; Spline Sans Mono annotates.
There is no third family in copy or UI, and mono never sets running text. The
wordmark's M PLUS 1 Code is not a third voice: it sets the wordmark and appears
nowhere else (Mark & Wordmark).

**The Caps Budget Rule.** Uppercase exists in exactly two places: mono kickers and
the wordmark. Never all-caps body, never all-caps sans headings.

### Elevation

Flat by default: this is a print, and prints have no shadows. Depth comes from
paper levels (page → page-hi → page-lo) and hairline rules. Shadows exist only as
*response*: a hover-lift on clickable landing cards, and overlays (dialogs,
popovers, menus) that genuinely float above the page. All shadows are ink-tinted
(`rgba(37, 27, 37, …)`), soft and low-alpha, never pure black and never
tight/dark. Dark mode has no shadows at all; elevation is night → night-hi →
night-lo lightness. In the product this rides the theme format's `--shadow-*`
fields — the `lodekit` theme carries the Flat Paper scale; the neutral default
keeps stock shadcn shadows.

Shadow vocabulary:

- **lift**
  (`box-shadow: 0 1px 2px rgba(37,27,37,.08), 0 14px 34px -22px rgba(37,27,37,.4)`):
  hover state of clickable cards on Marketing surfaces.
- **overlay**
  (`box-shadow: 0 2px 4px rgba(37,27,37,.08), 0 22px 44px -20px rgba(37,27,37,.42)`):
  dialogs, popovers, dropdown menus — both registers.

**The Flat Paper Rule.** Surfaces are flat at rest. A shadow is always an answer
to something the user did (hover, open), never a resting decoration. If a card has
a shadow while nobody is touching it, it's off-brand.

### Motion & interaction states

Motion is drift: a response that settles, never a bounce. The discipline is one
curve, one duration ramp, and a short list of named moves; nothing else animates.
The hover language is **fade**: hover states crossfade in place — nothing slides,
nothing sweeps (chosen over the sheet-slide and the subtle wash in side-by-side
exploration). In the product the curve rides the theme format
(`--default-transition-timing-function`; the `lodekit` theme sets drift, the
neutral default keeps stock easing); Marketing surfaces set it directly.

- **One curve.** `--ease-drift: cubic-bezier(.22, 1, .36, 1)` is the only easing.
  CSS keyword easings (`ease`, `ease-in`, `ease-out`, `ease-in-out`) and
  spring/bounce/elastic curves are prohibited; the `linear` keyword is permitted
  solely inside the cloud-drift loop, where constant speed is the point.
- **Duration ramp.** Feedback (press, toggle, color) 100–150ms · state changes
  (hover, tooltip, menu) 200–300ms · movement and overlays (lift, dialog, drawer)
  300–450ms on Marketing surfaces, 200–300ms in Product · exits at ~75% of their
  entrance. Hover feedback must be *perceived* to start within ~150ms.
- **Below the fold is calm.** No per-section scroll reveals, no parallax, no
  kinetic text splitting. A print doesn't animate as you turn the page. The
  fade-up-every-section pattern is rejected by name as the saturated default.
- **States are complete.** Every interactive element defines hover, active
  (`translateY(1px)` or equivalent, ~100ms), `:focus-visible` (the accent focus
  edge — see *The Focus-Is-A-Border Rule*), and disabled (50% opacity, no motion,
  no hover). Links and nav items hover by the accent underline fading in place
  (opacity 0→1, ~250ms, full width; it never slides). Loading in Product is a
  page-lo skeleton wash with a slow opacity pulse, never a spinner parade.
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

**The Focus-Is-A-Border Rule (Marketing surfaces only).** In the product, focus
is the stock shadcn ring under every theme — including `lodekit` (ruling
2026-08-12: one focus story beats a themed one; revisit if the stock ring grates).
On Marketing surfaces, focus is an edge *on* the element, never a ring *around*
it, and the edge differs by what is focused. *Controls* (buttons,
inputs, tabs) wear the accent edge: `outline: none`, the border resolves to the
accent, and a `box-shadow: inset 0 0 0 2px` in the accent thickens that edge from
the inside, fading in on the feedback ramp (~150ms). Controls with no border of
their own still read, because an inset shadow draws against the element's own
edge. On an accent-filled control (the primary button) the accent edge vanishes
tone-on-tone, so its edge borrows the label's ink (`currentColor`) instead.
*Links* are never boxed: a ring around a line of text reads wrong, so a focused
link resolves its underline to the accent exactly as hover does (links outside
the underline vocabulary fall back to a 2px accent `text-decoration` underline).
Pointer focus (`:focus:not(:focus-visible)`) tints the border but withholds the
ring, painting a transparent inset shadow so the box never shifts between the two
states.

Both CSS `outline` and Tailwind's `ring-*` utilities paint *outside* the box, so
either one used for focus produces the floating ring this rule exists to forbid —
and on any control that also tints its own border, the accent gets drawn twice.
Never reintroduce them, and never fix a doubled focus ring by exempting the
component: the exemption is the bug repeating. Two consequences follow: a control
inside a bordered group (an input group, a combobox) delegates its edge to the
group, which wears the focus border so the ring cannot cut across the icons
sharing that box; and `aria-invalid` outranks focus, so a field in error keeps
the destructive edge rather than reading as merely active.

### Components

Component character: printed, not plastic. Near-sharp corners, hairline strokes,
matte fills, motion that settles like paper. These are the shared treatments; each
register's own moves live in §2 and §3.

#### Buttons

- **Shape:** near-sharp (3px radius), padding 0.85em 1.5em, sans 500 at 0.95rem.
- **Primary:** persimmon fill (#A93510), page-high text; dark mode is gold fill
  (#F0A73C) with deep-indigo text. Hover: Marketing surfaces crossfade a night
  sheet in beneath the label — deep indigo with pale-gold text by day, pale gold
  with indigo text by night (opacity fade, ~250ms ease-drift; it never slides).
  Product steps the fill's alpha instead (`hover:bg-primary/80`), because the
  theme format carries no deeper/brighter hover token. Active: `translateY(1px)`,
  ~100ms. Inside the ochre band the CTA differs by design — see §2.
- **Focus:** the accent focus edge — see *The Focus-Is-A-Border Rule*.
- **Ghost:** a wash of the button's own ink — `color-mix(in srgb, currentColor 8%,
  transparent)`, no border; hover deepens the wash to 14%, a fade with no
  movement. Deriving from `currentColor` means one rule serves every plate:
  parchment page, night plate, and the ochre band alike. Borderless, its focus
  edge is the inset ring drawing against the box (*The Focus-Is-A-Border Rule*
  anticipates this).

#### Cards / Containers

- **Corner Style:** 5px radius (8px for hero-scale panels).
- **Background:** page-hi on page; night-hi on night.
- **Border:** 1px hairline (#CDC4AE), always present; the rule does the work.
- **Shadow Strategy:** flat at rest; *lift* on hover only when the card is a link.
- **Internal Padding:** 24px (16px compact).

#### Inputs / Fields

- **Style:** page-hi fill, 1px hairline border, 3px radius, ink text, slate
  placeholder.
- **Focus:** the accent focus edge — see *The Focus-Is-A-Border Rule*.
- **Error:** crimson (#A61E33) border and message — message text, never color
  alone.

#### Chips / Badges

- **Style:** mono kicker type (0.72rem, uppercase, 0.12em) on page-lo fill or a
  bare hairline outline, 3px radius. Status chips pair a semantic color with a
  label or glyph, never color alone.

### The Mark & Wordmark (signature)

- **The mark** is the jar-cloud, three styles — a "Solid", b "Knockout" (default),
  c "Outline" — with vector source of truth in `packages/ui/src/marks.ts`
  (`@lodekit/ui/marks`; 32×32 viewBox, `currentColor` throughout). Never redraw,
  re-proportion, rotate, or gradient-fill it; new consumers import from marks.ts.
- **Mark color:** plum ink on the page, pale gold on night. The accent is
  permitted as a deliberate brand moment (hero, favicon flourish) — one color at
  a time, always flat.
- **The wordmark** is LODEKIT: M PLUS 1 Code 700, uppercase, letter-spacing
  0.22em, 1.2rem — a label, not a headline. It sits in headers and footers; page
  heroes use Display sentence case instead. Its typeface is **fixed above the
  theme format**: it is deliberately not one of the theme-editable font fields,
  so switching theme never changes the wordmark. It is therefore loaded per
  surface — `@fontsource` on the landing, the Google Fonts `@import` on the docs
  site, and the shared `@lodekit/ui` stylesheet (`theme.css`, which also defines
  `--lk-font-wordmark`) in product, where every shell surface renders the
  lockup. Zen Kaku Gothic New 700 still sets headings and page titles
  everywhere; only the wordmark uses M PLUS 1 Code. The docs site carries the
  lockup in its header via a `SiteTitle` component override, and nothing else of
  the brand (§3).
- **The lockup:** mark beside wordmark, gap ≈0.6em, mark 1.5rem, optically
  aligned to cap height; both in the same single color at 80% opacity, header
  and footer alike. Clear space around the lockup ≥ the width of the jar's lid;
  minimum mark size 16px. In the product shell's header the lockup may split
  across the grid seam — mark centered in the rail's badge cell, wordmark
  opening the header cell — reading as a unit with the same gap and opacity
  (ruling 2026-08-13); the shell's nav sheet and marketing surfaces keep the
  joined lockup.
- **Favicons:** the mark in plum ink, flipping to **paper** via
  `prefers-color-scheme` — one pair everywhere, brand sites and platform alike; a
  neutral cream reads better than a tint against dark browser chrome. This is
  the one place Pale Gold does *not* serve as the night ink: a favicon sits in
  the browser's chrome, not on our night plate. Each app's favicon is its
  manifest emoji. The platform and app favicons ship from the engine — don't
  hand-author those; the two brand-site files are generated copies of
  `MARK_BODIES.b` and stay byte-identical to it.

### Do's and Don'ts

- **Do** set all text as plum ink on the page (or pale gold on night). Text is
  printed: never gray-on-gray, never thin-light-on-image.
- **Do** reach for a hairline (1px, #CDC4AE) whenever structure is needed; rules
  are this system's chrome.
- **Do** use mono kickers (0.72rem, uppercase, 0.12em tracking) as the section
  eyebrow and metadata voice; it is the identity's most portable gesture.
- **Do** keep the accent rare in Product (≤10%, interactive-only) and committed
  on Marketing surfaces when a section earns it.
- **Do** draw illustration from the sky family (print blue, cloud slate, clay
  rose, plus ochre for sun warmth) in flat print-like shapes — no gradients
  inside illustrations.
- **Do** meet WCAG AA minimum everywhere (4.5:1 text, 3:1 UI); the text-safe
  pairs in Colors are pre-checked — recheck anything new.
- **Do** give every interactive element the complete state set — hover, active,
  focus-visible, disabled — on the duration ramp (feedback perceived ≤150ms).
- **Do** honor `prefers-reduced-motion` and keep zoom enabled always.

- **Don't** use Pale Gold (#F3E0A5) as a background or surface; it is the night
  plate's text ink, nothing else.
- **Don't** put Print Blue (#4B5D91) on interactive elements or text;
  illustration and charts only.
- **Don't** resurrect the retired identities: no cork amber (#CE6F26 family), no
  Fraunces, no Hanken Grotesk, no watercolor — and no interim cool-sky palette
  (#F4F7FA paper, #18242F ink, #C03F16 accent) or Orikata washi #F4EFE3. The
  cool-sky accent #C03F16 was also named persimmon; it is a distinct, hotter
  orange-red and this ban does not touch the current accent, persimmon #A93510.
- **Don't** ship glassmorphism, neon, purple-blue gradients, glows, or heavy drop
  shadows. Everything must pass the Print Test.
- **Don't** use a `border-left`/`border-right` thicker than 1px as a colored
  accent stripe; active/warning states use a full hairline, a wash, or a leading
  glyph.
- **Don't** put the sky family on interactive elements, or gray/slate text on
  colored fills.
- **Don't** set all-caps outside the two budgeted places (mono kickers, wordmark),
  and don't let mono set running text.

## 2. Marketing

The register for web-main and outward-facing surfaces. Color commitment is
allowed: an ochre band can own a moment, deep indigo can own a section, the sky
family can illustrate. One orchestrated entrance is welcome.

- **Iconography:** Phosphor, regular weight — quiet linear glyphs in the print
  register. One weight, `currentColor`, sized to the text they accompany; no
  second icon family on marketing surfaces.
- **The entrance:** one orchestrated hero entrance per page — fade-up in
  hierarchy order (kicker → headline → subhead → CTAs → art), 80–120ms stagger
  steps, the whole sequence ≤800ms. Nothing else animates on load.
- **Header navigation:** the lockup left; links in sans 500 at 0.95rem, ink;
  current or hover state marked by an accent 2px underline that fades in place
  (never a fill, never a slide).
- **The ochre band's CTA** — the one interaction state that resolves differently
  here than in Product, a deliberate choice that does not generalize: inside the
  ochre drench band the primary CTA is a plum-ink fill with pale-gold text, and
  its hover is the chip's small opacity fade (~0.7) rather than the night-sheet
  crossfade primary buttons use elsewhere, because persimmon on ochre clashes
  (2.7:1).

## 3. Product

Everything inside the product: the dashboard, apps built on the platform,
web-docs, and the manager. The product ships **neutral by default**: the default
theme is `shadcn` — stock shadcn/ui, neutral base, Geist — so a fresh Lodekit
reads as the ecosystem standard, not as a brand statement. Cloud Captured lives on
inside the product as the **`lodekit` theme**, one selection away in Themes, and
becomes the default candidate again once a toned-down revision exists. The only
identity always present in the product is the chrome above the theme format: the
mark, the wordmark, the favicons.

### The product shell (true under every theme)

- **One shell:** every product surface — the dashboard and each app — renders
  `@lodekit/ui`'s `AppShell` from its own document root: an `h-14` header row
  and a fixed `w-16` app icon rail on the `--sidebar-*` token family, content
  on `--background`, cells separated by hairline borders. Small screens get the
  Sidebar primitive's canonical sheet. The chrome wears whichever theme the
  surface resolves, so it is composition, never identity.
- **Tokens only:** components are stock shadcn/`@lodekit/ui` internals expressing
  the active theme through tokens — never fork or restyle component internals.
- **Physics are the theme's:** elevation, easing, and body weight resolve from
  the format's physics fields (`--shadow-*`,
  `--default-transition-timing-function`, `--font-weight-body`); themes that set
  nothing get stock shadcn physics.
- **Focus is the stock shadcn ring**, under every theme (ruling 2026-08-12 — see
  *The Focus-Is-A-Border Rule*, now Marketing-only).
- **Type and density:** the fixed rem scale (Foundations › Typography); no fluid
  `clamp()`. Product surfaces never run entrance choreography (the person is
  mid-task), and overlays sit on the shorter end of the duration ramp
  (200–300ms).
- **Icons:** the theme's `--icon-library` set, via `@lodekit/ui/icons`; lucide
  when a theme doesn't choose.
- **web-docs:** currently opts out of theming. The docs site runs stock
  Starlight styling, and the header lockup is the single piece of identity it
  carries. Reading calm beats brand presence there; don't retheme it ad hoc.
  A deliberate docs skin is future Product work.

### The lodekit theme (Cloud Captured as a product expression)

Carried entirely by the theme file (`packages/engine/themes/lodekit.css`):
parchment surfaces, plum ink, the persimmon/gold accent, Zen Kaku Gothic New +
Spline Sans Mono, near-sharp radius, and the identity physics — body 500, drift
easing, Flat Paper elevation (flat at rest, ink-tinted overlays, no night
shadows). When it is active, §1's product rulings apply:

- **The One Accent Rule** (≤10%, interactive-only).
- **Sidebar/nav:** ink on page, active item = page-lo wash + accent text or
  leading indicator ≤2px tall (an underline or dot — never a left border stripe
  >1px).
- **The mono metadata layer:** kickers and data set in the mono voice
  (`Kicker`/`Meta`).

The full treatment system beyond these rulings — and the toned-down revision that
could make `lodekit` the default again — is not yet designed; tracked in
`docs/TODO.md`.
