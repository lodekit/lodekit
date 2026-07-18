# Landing page v2 (full landing) — design

Date: 2026-07-18
Package: `web/main` (`@lodekit/web-main`), one exports line in `packages/engine`
Status: approved, ready for plan
Supersedes: `2026-07-01-landing-page-v1-design.md` (the coming-soon placeholder;
its stack decisions — Astro, Tailwind v4 via `@tailwindcss/vite`, shadcn React
islands — carry forward unchanged).

## Goal

Replace the placeholder landing page with the real one: the full PRODUCT.md §8
landing — hero (complication → tagline), the five messaging pillars, the
oscillation band, the developer layer — rendered in DESIGN.md's woodblock-print
identity. Pre-alpha honesty throughout: **no external links anywhere** (no GitHub,
no docs, no social); the only action on the page is entering an email to receive
a single note when the release happens — and that capture is a **visual mock**
(no backend, no network call; wiring comes later).

Success = `pnpm --filter @lodekit/web-main build` passes and the page holds up
against DESIGN.md's Print Test and the verification checklist below.

## Decisions taken in brainstorming

- **Full landing, not a teaser.** The complete §8 recipe now; at launch only the
  CTA changes.
- **DESIGN.md wins over the awwwards reference skills.** The consulted skills
  (impeccable craft/quieter, awwwards-hero, awwwards-motion) contribute craft
  discipline — one focal point, viewport-scale type, ≤800ms entrance, 80–120ms
  stagger, transform/opacity-only animation, tight palette. Their motion
  doctrine (scroll reveals, spring easing, "zero static elements", kinetic text)
  is rejected: DESIGN.md §5 prohibits all of it by name. Below the fold is calm.
- **Hero direction A: the print split.** Enemy-led headline left, a woodblock
  jar-and-sky illustration right. Chosen over a centered "framed plate" and a
  typography-only broadside.
- **Email capture is enabled, with a client-side mock confirmation.** A disabled
  form reads as broken on a finished page. Submit swaps the form for a quiet
  confirmation via a few lines of inline vanilla JS; nothing is sent or stored;
  reload resets. The real backend is explicitly out of scope.
- **No open-source claim in the copy.** The alpha will also be the
  open-sourcing moment, but PRODUCT.md §3 lists OSS positioning as an open
  question, so the page says "coming soon" and stays silent on licensing until
  the strategy doc settles it. (Flagged for the reviewer — easy to add a line
  later if wanted.)
- **No changelog entry.** The landing site is not a platform change a Lodekit
  user sees in the product.

## Page architecture & copy

One page, eight bands. Register: landing — full voice, enemy-led, wry edge
allowed (PRODUCT.md §7). Canonical terms end-to-end. The copy below is the
content contract; trims for rhythm are fine at implementation, rewrites are not.

### 1. Header

Lockup left — the jar-cloud mark (knockout style, from `marks.ts`) beside the
LODEKIT wordmark (Zen Kaku Gothic New 700, uppercase, 0.22em tracking,
~1.25rem). Theme toggle right. No nav links.

### 2. Hero — the print split

Left column (~55%):

- Kicker (mono, uppercase): `THE LOCAL PLATFORM FOR AGENT-BUILT APPS`
- Headline (Display, sentence case):
  **The making got easy. The keeping is still broken.**
- Subhead (body, ≤65ch): *Ask your agent for an app and it will build one. The
  hard part is keeping it — somewhere that isn't a subscription, a silo, or a
  folder that quietly dies. Lodekit runs your apps on the computer you already
  own, with everything they'd need from a cloud.*
- Tagline line (title weight, its own line): **Cloud batteries, locally, easily.**
- Email capture (the sole CTA): input placeholder `you@example.com`, button
  **Notify me**; microcopy beneath: *One email when the alpha ships. Nothing
  else.*
- Status chip (mono kicker style): `MACOS ALPHA · COMING SOON`

Right column: the jar illustration (see Illustration section).

### 3. The loop strip

One hairline-ruled band, three steps, mono numerals:

`01` You describe the app. · `02` Your agent builds it. · `03` Lodekit runs it
and keeps it.

### 4. The five pillars (PRODUCT.md §6 order)

Each pillar: mono kicker + Headline + short prose + one proof element.

**Pillar 1 — kicker `CLOUD BATTERIES`** ("batteries" is allowed in marketing
prose; the chips below use the canonical service names)

- Headline: **Keep the batteries, drop the cloud.**
- Prose: *Everything apps need from a cloud — a real database, file storage,
  secrets, scheduled tasks, doors to outside services — provided locally by one
  engine. No accounts, no meters, nobody else's computer.*
- Proof: the service catalog as mono-labeled chips with one-line glosses —
  `db-store` a real relational database · `kv-store` app memory ·
  `file-store` files that live as files · `secret-store` credentials,
  encrypted · `tasks` queued and scheduled work · `gateways` a managed door to
  outside services.

**Pillar 2 — kicker `OWNERSHIP` — the night-plate section** (deep indigo
surface, pale gold ink, in both themes)

- Headline: **Your data is a folder.**
- Prose: *Apps and data are files in one folder. Copy it and it's yours
  forever. No accounts to lose, no export buttons to hunt for — everything
  readable on disk.*
- Proof: a small file-tree print (mono, data voice):

  ```
  Lodekit/
  ├── apps/        your apps — source, readable
  ├── data/        their data — one namespace per app
  └── gateways/    the doors you've opened
  ```

  Caption: *Backup = copy a folder.*

**Pillar 3 — kicker `NO TOOLING`**

- Headline: **Ask for an app. Use it a minute later.**
- Prose: *No terminal, no builds, no node_modules. One menubar app installs the
  platform — it provisions its own Node, builds apps on save, and serves them
  in your browser.*
- Proof: chip row — `one install` · `zero config` · `builds on save`.

**Pillar 4 — kicker `GUARDRAILS`**

- Headline: **Safe to let an agent build.**
- Prose: *Guardrails, not vibes. Apps run in isolated workers, and each sees
  only its own data. Secrets never enter app code — apps reach outside services
  through managed gateways. When something breaks, it breaks visibly: the
  dashboard shows you exactly where.*
- Proof: four-item list — isolated workers · scoped data · secrets stay out of
  app code · failures surface in the dashboard.

**Pillar 5 — kicker `COHERENCE`**

- Headline: **Ten apps that feel like one.**
- Prose: *Every app shares one UI library and one theme — yours to change in
  one place. One dashboard shows every app's state, data, and scheduled work.
  Ten agent-built apps feel like one product, not ten codepens.*

### 5. Oscillation band

Kicker: `WHAT IS · WHAT COULD BE`. The four §5 pairs as two-column rows,
verbatim, ending on the gap:

| What is | What could be |
| --- | --- |
| Renting generic tools that fit almost | A set of small apps shaped exactly like your life |
| Your data spread across silos you can't open | Your data in a folder you can copy |
| A subscription per need | One platform, no meter |
| Scripts that die when you look away | Apps that are still running, still yours, next year |

### 6. CTA band — the ochre drench

Ochre field (`#DD9741`), plum ink text — the page's one committed accent moment.

- Headline: **Give your apps a home.**
- Prose: *The alpha ships soon, macOS first. Leave an email and we'll send one
  note — the day it's ready.*
- The email capture repeated (same mock component).

### 7. Developer layer

One quiet strip above the footer, mono data voice, no headline-register claims:

- Kicker: `FOR THE CURIOUS`
- Copy: *Under the hood: a single Node engine hosting TanStack Start apps in
  per-app workers. SQLite per app. shadcn/ui components under one shared theme.
  Agent-driven over MCP. Buildless — the platform owns the toolchain, down to
  its own pinned Node.*

### 8. Footer

Lockup, then: *macOS only, for now.* · `© 2026 Lodekit`. No links.

## Visual system & theming

- **Retheme, not restyle.** `globals.css` drops the default shadcn grayscale
  and declares DESIGN.md's tokens: light = parchment plate (page `#EDE7D8`,
  page-hi/page-lo steps, plum ink `#251B25`, slate secondary, hairline
  `#CDC4AE`, rust accent `#935842`); `.dark` = night plate (indigo `#121A44`,
  night-hi/night-lo, pale gold ink `#F3E0A5`, parchment secondary, ochre accent
  `#DD9741`). Radius 3–5px. The shadcn `Button`/`Input` primitives stay and
  inherit tokens; internals are not forked.
- **Committed sections don't flip.** The pillar-2 indigo section and the ochre
  CTA band are fixed brand moments in both themes; the toggle flips the rest.
- **Theme mechanics unchanged.** `ThemeToggle` island + the no-flash inline
  script stay as-is.
- **Type.** Self-hosted `@fontsource` — Zen Kaku Gothic New 400/500/700,
  Spline Sans Mono 400/500, `font-display: swap`, no other weights. Scale per
  DESIGN.md §3 (Display clamp for hero only; body 65ch; mono kickers 0.12em).
  Caps budget: kickers/chips and the wordmark only.
- **Chrome is hairlines.** 1px rules do all framing; flat surfaces, no resting
  shadows anywhere on this page.
- **Accent discipline.** Rust/ochre on interactive surfaces only ever means:
  the CTA button, focus rings, and the two committed moments — plus ochre
  inside the illustration (DESIGN.md permits ochre in light-mode graphics).
  Sky family (print blue, cloud slate, clay rose) appears only inside the
  illustration and the file-tree print's accents.
- **Favicon + meta.** `public/favicon.svg` generated from `marks.ts` knockout
  body with brand colors (plum ink, pale gold under `prefers-color-scheme:
  dark`) — a checked-in static asset with a comment naming `marks.ts` as
  source. Title: `Lodekit — the local platform for agent-built apps`.
  Description: *Everything your apps need from a cloud — database, files,
  secrets, scheduled tasks — on the one computer you already own. Your agent
  builds; Lodekit runs and keeps. Coming soon.* Plus OpenGraph equivalents (no
  OG image in this slice).

## Hero illustration & motion

**The illustration** is a new hand-authored SVG composition — *not* the mark
redrawn (the mark appears only in the lockup and favicon). A large mason jar in
flat woodblock shapes: hairline ink outline, a piece of sky inside as flat
horizontal bands (print blue `#4B5D91` deepening upward), one cloud inside the
jar and one or two escaped beside it (cloud slate `#8394A9` with pale
highlights), an ochre sun disc, a clay-rose `#AB9184` ground shadow. Flat fills
only — no gradients (Print Test). All fills reference CSS variables so the
night plate recolors the same geometry (indigo bands, pale-gold linework, the
sun reads as a moon).

**Cloud drift** — the page's only ambient motion. Escaped clouds drift on
two-axis paths with mismatched periods (e.g. 20s x / 31s y) so the path doesn't
visibly repeat; a few pixels of travel; `linear` timing is permitted inside
this loop only. Removed entirely under `prefers-reduced-motion`.

**The entrance** — the single orchestrated moment, CSS-only: kicker → headline
→ subhead + tagline → email form → illustration; fade-up (opacity + ~12px
translateY), 90ms stagger, total ≤800ms, `--ease-drift`
(`cubic-bezier(.22,1,.36,1)`) the only curve. Nothing else animates on load,
and nothing animates on scroll.

**Interaction states** — complete set per DESIGN.md §5: primary button hover
crossfades the night sheet beneath the label (indigo + pale-gold text by day,
pale gold + indigo text by night; opacity fade ~250ms, never a slide); active
`translateY(1px)` ~100ms; `:focus-visible` = 2px accent outline offset 3px;
input focus = border resolves to ink + the accent outline; disabled = 50%
opacity, no motion. Reduced motion: transforms and drift stop; opacity-only
fades ~150ms remain.

**Email mock behavior.** The form is enabled. Submit is intercepted by a few
lines of inline vanilla JS: prevent default, swap the form for a quiet
confirmation — *Noted. One email when the alpha ships.* — with `role="status"`
so screen readers announce it. No network call, nothing stored, reload resets.
The input keeps `type="email"` + `required` so native validation gates the
mock like it will gate the real thing.

## Technical structure

Files touched:

- `packages/engine/package.json` — add `"./marks": "./src/marks.ts"` to
  exports (marks.ts is dependency-free; DESIGN.md: new consumers import from
  marks.ts, never redraw).
- `web/main/package.json` — add `@lodekit/engine: workspace:*` (dev),
  `@fontsource/zen-kaku-gothic-new`, `@fontsource/spline-sans-mono`.
- `web/main/src/styles/globals.css` — the retheme (both plates, type scale,
  `--ease-drift`, entrance keyframes, drift keyframes, reduced-motion block).
- `web/main/src/layouts/Base.astro` — fonts, new title/meta/OG, favicon link;
  no-flash script unchanged.
- `web/main/src/pages/index.astro` — composes the section components; the old
  placeholder markup and its `githubUrl` are deleted.
- `web/main/src/components/` — new static Astro components (no hydration):
  `Header.astro`, `Lockup.astro` (imports `MARK_BODIES` from
  `@lodekit/engine/marks`), `Hero.astro`, `JarIllustration.astro`,
  `NotifyForm.astro` (shared by hero + CTA band; inline script),
  `LoopStrip.astro`, `Pillar.astro` (parchment/night variants),
  `ServiceChips.astro`, `OscillationBand.astro`, `CtaBand.astro`,
  `DevLayer.astro`, `Footer.astro`. Exact decomposition may merge trivial
  ones; the boundaries above are the intent.
- `web/main/public/favicon.svg` — the generated mark favicon.
- Kept: `ThemeToggle.tsx` (the only island), `ui/button.tsx`, `ui/input.tsx`
  (restyled via tokens only).

JS budget: the ThemeToggle island + one inline form-mock script. Everything
else is static HTML/CSS.

## Verification

No test suite in `@lodekit/web-main` (matches repo convention). The checklist:

- `pnpm --filter @lodekit/web-main build` passes; no console errors in dev.
- Entrance: single sequence, ≤800ms, correct order; below the fold nothing
  animates on scroll.
- Theme: toggle flips parchment ↔ night and persists across reload without
  flash; the indigo section and ochre band hold in both themes.
- `prefers-reduced-motion`: no drift, no translateY — opacity fades only.
- Keyboard: tab reaches toggle → email → button with visible focus rings; the
  mock confirmation is announced (`role="status"`).
- Responsive: no horizontal overflow at 360 / 768 / 1440; hero split collapses
  to a single column below ~768px (illustration below the text, smaller).
- Contrast: DESIGN.md pre-checked pairs used as specified; new pair plum ink on
  ochre `#251B25`/`#DD9741` verified ≥4.5:1 before shipping.
- The Print Test, by eye: flat, matte, hairlines, no glow/gloss/gradient.

## Out of scope

- Real email capture (service or backend), and any storage of addresses.
- Deployment/hosting config; OG image asset.
- Docs site content/theming; any `@lodekit/ui` sharing with web surfaces.
- Open-source/licensing copy (blocked on PRODUCT.md §3; revisit at launch).
