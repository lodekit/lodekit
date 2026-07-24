# Landing Page v3 — Design

- **Date:** 2026-07-24
- **Session:** pair spec (brainstorm bead `lk-r21`)
- **Status:** draft, pending review
- **Predecessors:** `2026-07-18-landing-page-v2-design.md`, `2026-07-19-hero-demo-design.md`
- **Steering:** `docs/PRODUCT.md` (strategy, voice), `docs/DESIGN.md` (identity, motion doctrine)

## 1. Goal

Rework the landing page (`web/main`) so a visitor can answer for themselves: *is
Lodekit a tool I should try — does it fit how I already use AI?* The page **tells,
never sells**: every claim checkable, every comparison honest, limits stated plainly.

Constraints carried over from v2: no product screenshots yet (visualizations and
supporting content instead); primary CTA remains the launch-announcement email (one
email, nothing else); secondary CTA is the docs at `docs.lodekit.com` (not yet
deployed — see §8, the docs-link flag).

## 2. Decisions taken in brainstorm (with rationale)

1. **Hero goes resolution-led.** H1 states what Lodekit is; the complication moves
   below the fold into the problems section. Comprehension-first serves the page's
   goal (self-qualification) better than enemy-first. This amends PRODUCT.md §8 —
   amendment text in §9 of this spec; the edit lands on this branch before the PR.
2. **H1 is "Cloud batteries for your local apps."** — the person's wording, kept
   as-is; kicker and subhead carry the qualification that the apps are agent-built.
3. **The demo window is an illustration.** Generic theme and font (system stack, not
   Zen Kaku; neutral grays, not Lodekit tokens) so it reads as "an agent chat on a
   Mac", never as Lodekit product UI. Demo machinery is reused untouched.
4. **Problems section is a 4-beat set:** the choice (softened framing — the agent
   *does* offer paths; the missing piece is the background to weigh them), the gap
   in the middle, sprawl→lock-in merged as cause-and-consequence, and the graveyard
   (restored from PRODUCT.md's second enemy beat, which the new hero no longer carries).
5. **"Is it for me?" is a for-you / not-yet checklist** — two columns, profile-flavored
   bullets, honest limits ("not yet", not "no").
6. **"What is Lodekit" is a diagram spread** — one committed architecture print plus a
   static row of five facet cards. No tabs, no carousel.
7. **"How it goes" is an interactive stepper** — user-driven (below-the-fold calm:
   motion only as response), rail shows all four one-liners permanently, panels carry
   the greenhouse thread continuing the hero demo's story.
8. **Comparison = paths, not brands** — columns are ways to keep an agent-built app;
   brand names appear once as muted mono metadata under column heads. Every path gets
   its genuine strength ("good at" row is load-bearing for the telling posture).
9. **Manifesto = signed letter on the night plate + oscillation pairs** — the v2
   OscillationBand content survives inside the manifesto, ending on the gap.
10. **CTA band keeps "Give your apps a home."** with the one-email promise and the
    docs secondary link.
11. **LoopStrip and the five Pillar sections retire** — content absorbed by the
    stepper and the facet cards.

## 3. Page architecture

| # | Section | Component(s) | Replaces (v2) |
| --- | --- | --- | --- |
| 1 | Header | `Header` (+ Docs link, flagged) | Header |
| 2 | Hero | `Hero`, `NotifyForm`, `DemoWindow` + existing demo | Hero |
| 3 | Problems | `ProblemBeats`, `GapSpectrum` | — (new) |
| 4 | Is it for me? | `FitChecklist` | — (new) |
| 5 | What is Lodekit | `ArchitecturePrint`, `FacetCards` | Pillars 1, 2, 4, 5 |
| 6 | How it goes | `HowItGoes` (stepper) | LoopStrip + Pillar 3 |
| 7 | Ways to keep an agent-built app | `PathsTable` | — (new) |
| 8 | Manifesto | `ManifestoPlate` | OscillationBand |
| 9 | CTA band | `CtaBand`, `NotifyForm` | CtaBand |
| 10 | Under the hood | `DevLayer` (light edit) | DevLayer |
| 11 | Footer | `Footer` (+ Docs link, flagged) | Footer |

Section order is the qualification arc: problems resonate → visitor self-selects →
explanation rewards those who passed → comparison → why → close.

## 4. Visual design plan

Identity is pinned by `docs/DESIGN.md` (Sky in a Jar; print register; motion
doctrine) — this section allocates the axes DESIGN.md leaves free: composition,
illustration language, and the signature element.

**Anti-default note (hold this line during implementation).** The palette — warm
parchment with a rust accent — overlaps the most saturated AI-generated look (cream
paper + terracotta). Distinctiveness comes from the moves that look never makes:
woodblock-print discipline (hairline chrome, zero resting shadows), the mono
annotation layer, the mid-page indigo night plate, flat sky-family illustrations,
and a geometric Japanese sans where the template reaches for a serif. Any section
that could pass for a generic cream-and-terracotta SaaS page is a defect.

**Signature element — "the cloud inside the machine."** The architecture print
(§5.4) draws the engine's services as a small flat cloud held inside the machine's
hairline outline: the H1 literalized, and the jar-cloud mark's idea (a piece of sky,
kept at home) at architectural scale. This is the page's one committed image;
everything around it stays quiet. Boldness is spent here and nowhere else.

Global rules: section kickers in mono (existing `kicker` utility); hairline
separators; `max-w-6xl` container; one hero entrance; below the fold static except
user-driven stepper and form states; `prefers-reduced-motion` per DESIGN.md.

## 5. Sections in detail (with copy deck)

Copy below is the draft deck — final wording may be tuned at implementation review,
but tone, claims, and canonical terms are normative. Every claim in this deck is
currently true of the product; if implementation discovers otherwise, the copy
changes, not the truth.

### 5.1 Hero

Two-column (`1.15fr / 1fr`), entrance choreography unchanged from v2.

- **Kicker:** `THE LOCAL PLATFORM FOR AGENT-BUILT APPS`
- **H1:** Cloud batteries for your local apps.
- **Subhead:** Ask your agent for an app and it will build one. Lodekit gives it
  everything it needs from a cloud — on the computer you already own. One menubar
  app, your data in a folder. No accounts, no subscriptions, nobody else's computer.
- **Form:** `NotifyForm` verbatim from v2 (placeholder `you@example.com`, button
  "Notify me", note "One email when the alpha ships. Nothing else.")
- **Chip:** `macOS alpha · Coming soon`

**Demo window (`DemoWindow`).** A local shell component (~20 lines — no mockup
library; the frame is smaller than the fight with a library's styling). Replaces the
demo's current card shell; all machinery (`script.ts`, `timeline.ts`, prompt-kit
components, tests) reused untouched.

- Chrome: flat titlebar, three traffic-light dots, 1px border, 8px radius. Neutral
  grays — *not* Lodekit tokens — in two schemes following the site theme: generic
  mac-light grays by day, generic mac-dark grays by night (a fixed light window
  would glare on the night plate). Matte throughout; passes the Print Test.
- Window title (centered, generic): `Agent — greenhouse`. The v2 kicker-styled
  header label is removed.
- Interior: system font stack (`-apple-system, system-ui, sans-serif`), generic
  chat styling. Accent inside the illustration is **print blue** (#4B5D91) — reads
  as any chat app's blue while staying in the palette (DESIGN.md reserves print
  blue for illustration, which this window now is). No rust, no ochre, no Zen Kaku
  inside the frame.
- One flat cloud (cloud slate, low contrast) sits behind/above the window and
  drifts per the Only-Clouds-Drift rule (20–40s period, a few px, gone under
  reduced motion).

### 5.2 Problems

- **Kicker:** `THE PROBLEM` · **Headline:** The making got easy. The keeping didn't.

Four beats as a two-column print sheet (stacking on mobile), each a mono label +
two plain sentences. Labels, not numbers — the beats are a fork, not a sequence.

- **`THE CHOICE`** — Ask for an app and your agent will offer ways to build it — a
  single file, a framework, a host. Weighing them is a technical call, and it lands
  on you.
- **`THE GAP`** — The options run small to large with nothing in between: a file
  that can't remember anything, or containers, dependencies, and a stack you now
  operate.
- **`THE SPRAWL`** — A tool for an audience of one still ends up on third-party
  services — holding your private data, billing monthly, load-bearing. And once
  your data lives in their formats, leaving costs more than staying.
- **`THE GRAVEYARD`** — Kept local instead, the app has no home. It forgets
  everything between runs, breaks silently, and joins the folder of half-working
  things you stopped opening.

**`GapSpectrum`** (inline SVG, spans the section under the beats): a horizontal
hairline from "a single file" to "containers, dependencies, a stack to operate",
the middle marked as an empty interval (open bracket + mono label "the gap").
Deliberately unresolved here — the what-is section answers it. Ink/slate only;
no accent.

### 5.3 Is it for me?

- **Kicker:** `IS IT FOR ME?` (no headline — the kicker is the question)

Two columns under a shared hairline, stacking on mobile. Phosphor regular glyphs:
`check-circle` (for-you), `hourglass` (not-yet — temporal, not a refusal).

**It's for you if…**
- You ask agents for tools — or you're about to.
- You track real things — habits, house projects, money — in tools shaped almost right.
- You run a home server, and don't want one more thing to maintain.
- Your data staying yours is a requirement, not a preference.

**Not yet, if…**
- You need to share apps with other people, or work multi-user.
- You want a hosted URL on the open web.
- You're not on a Mac. (Windows and Linux are open questions — honestly.)

Closing line (small, slate): *That's the current truth. This page changes when it does.*

### 5.4 What is Lodekit

- **Kicker:** `WHAT IS LODEKIT` · **Headline:** One menubar app. A whole cloud inside.

Layout: `ArchitecturePrint` left (~60%), prose right; `FacetCards` full-width beneath.

**Prose:** Lodekit is one menubar app that runs a local engine. Your agent builds
apps against it; the engine runs them like real software — a real database, file
storage, secrets, scheduled tasks, gateways to the outside. Everything worth
keeping is files in one folder.

**`ArchitecturePrint`** — the signature print. Inline SVG, flat shapes, sky family
(print blue, cloud slate, clay rose, ochre warmth), themed via CSS custom
properties (`currentColor` + token vars) so the night plate version works. Composition:

- The machine as boundary: a hairline outline (laptop/desktop silhouette, near-sharp
  corners) — *your computer*.
- Menubar strip at top with the jar-cloud mark, labeled `manager` in mono data type.
- Center: the engine as a compartment holding **a small flat cloud** whose lobes are
  the five services, each labeled in mono: `database · files · secrets · schedule ·
  gateways`.
- Upper right: two or three browser-tab shapes labeled with app ids (`greenhouse`,
  `reading-log`), drawing hairline connections from the engine.
- Base: a folder shape labeled `~/Documents/Lodekit` in mono data type.
- Accessible: `<title>`, `<desc>`, plus visually-hidden prose equivalent.

**`FacetCards`** — five static cards (title + two lines, hairline borders, flat;
Phosphor regular icons):

| Card | Icon | Copy |
| --- | --- | --- |
| Batteries | `battery-charging` | A real database, file storage, secrets, schedules, gateways — local services of one engine. |
| The folder | `folder-simple` | Apps and data are files in `~/Documents/Lodekit`. Copy it and it's yours forever. |
| The dashboard | `squares-four` | Every app's state, data, and scheduled work — visible in one place. |
| Guardrails | `shield-check` | Apps run isolated and see only their own data. Secrets never enter app code. |
| One theme | `palette` | Every app shares one UI library and one theme. Ten apps feel like one product. |

### 5.5 How it goes

- **Kicker:** `HOW IT GOES` (no headline)

`HowItGoes`: an accessible tabs pattern (rail = tablist left, panel right; stacks
vertically on mobile). The rail permanently shows all four numbered one-liners — a
skimmer reads the whole loop without interacting. Numbers are earned here: order is
information. Selecting a step crossfades its panel (opacity only, `--ease-drift`,
200–300ms; instant under reduced motion). Step 01 selected by default. Each panel:
small flat print illustration + 2–3 sentences. The greenhouse thread continues the
hero demo's story.

| Step | Rail line | Panel copy | Panel illustration |
| --- | --- | --- | --- |
| 01 | Install one menubar app. | That's the setup. Lodekit brings everything it needs, down to its own Node. No terminal, nothing to configure. | menubar strip with jar-cloud mark |
| 02 | Ask your agent for the app you want. | "Something to manage my greenhouse from the weather forecast." Your agent scaffolds it and wires up the services it needs. | prompt line / speech shape |
| 03 | Use it in your browser a minute later. | `lodekit.localhost/greenhouse` — a URL on your machine. Want it different? Ask again; it rebuilds on save. | browser tab shape |
| 04 | Close the laptop. Come back next month. | Still running. The forecast check fired every morning, and the data is in your folder. That's the keeping. | moon + small cloud |

### 5.6 Ways to keep an agent-built app

- **Headline:** Ways to keep an agent-built app. (kicker: `LODEKIT VS`)

`PathsTable`: print table, hairline rules, mono data type in cells. Column heads
carry the path name; beneath each, brand examples once, in muted mono
(`Lovable · Replit · v0` under *hosted builder*; `Airtable · Notion · Glide` under
*no-code tool*; none under *single file* and *Lodekit*). The Lodekit column gets a
page-lo wash + hairline-strong border — quiet emphasis, no accent color. On mobile
the table becomes stacked per-path cards (same content, `overflow-x` never required).

| | single file | hosted builder | no-code tool | Lodekit |
| --- | --- | --- | --- | --- |
| good at | instant and free | zero setup, shareable | forms and tables, fast | apps that live at home |
| storage | none | theirs | theirs | yours — a real database, local |
| schedules | none | on a paid tier | included, up to a point | built-in, local |
| accounts | none | required | required | none |
| cost shape | free | subscription | subscription | your own hardware |
| still yours next year | the file, maybe | at the vendor's pleasure | behind an export button | a folder you can copy |

Honesty gate: each non-Lodekit cell must stay checkable as a general statement of
the class (not of a named product); the "good at" row is never weakened.

### 5.7 Manifesto

- **Kicker:** `WHY WE BUILT LODEKIT`

`ManifestoPlate`: the night plate (deep indigo surface, pale gold ink) — the page's
one drenched section. Letter at reading measure (~65ch), then the four oscillation
pairs, ending on the gap.

**Letter (draft):**

> Software finally comes in your size. For the first time, you can describe a tool
> and have it exist by lunch — shaped exactly to your life, no bigger than it needs
> to be.
>
> But the places it can live all belong to someone else. The platforms are rented,
> the data sits in silos, and the meter runs on things you made. The alternative —
> keeping it yourself — has meant becoming your own ops team.
>
> We think the tools you ask for should be yours. On your computer, in your folder,
> in formats you can read. Running whether or not anyone is selling you anything.
>
> So we built the home. When software is personal, it should live with you.
>
> — the Lodekit makers

**Pairs** (verbatim PRODUCT.md §5; is → could-be, two-column rows):

- Renting generic tools that fit almost → A set of small apps shaped exactly like your life
- Your data spread across silos you can't open → Your data in a folder you can copy
- A subscription per need → One platform, no meter
- Scripts that die when you look away → Apps that are still running, still yours, next year

### 5.8 CTA band

Ochre plate, as v2.

- **Headline:** Give your apps a home.
- **Sub:** The alpha ships soon, macOS first. One email the day it's ready — nothing else.
- **Form:** `NotifyForm` (id `cta`)
- **Secondary (flagged):** ghost link "Getting started →" to the docs.

### 5.9 Under the hood

- **Kicker:** `FOR THE CURIOUS`
- **Copy:** Under the hood: a single Node engine hosting TanStack Start apps in
  per-app workers. SQLite per app. shadcn/ui components under one shared theme.
  Agent-driven over MCP. Buildless — the platform owns the toolchain, down to its
  own pinned Node.
- **Link (flagged):** "Read the architecture →" to the docs.

Stack names live here and only here (PRODUCT.md §6: names one level below the
headline, never in it).

### 5.10 Header / Footer

Unchanged from v2 except: a "Docs" nav link in the header and a docs link in the
footer, both behind the docs flag (§8).

## 6. Component inventory

- **New:** `DemoWindow`, `ProblemBeats`, `GapSpectrum`, `FitChecklist`,
  `ArchitecturePrint`, `FacetCards`, `HowItGoes`, `PathsTable`, `ManifestoPlate`.
- **Reused untouched:** all of `demo/` (script, timeline, prompt-kit, tests),
  `NotifyForm`, `Header`, `Footer`, `Lockup`, `Base`, `ThemeToggle`.
- **Edited:** `Hero` (copy + DemoWindow + cloud), `CtaBand` (secondary link),
  `DevLayer` (link), `index.astro` (composition).
- **Retired:** `LoopStrip`, `Pillar`, `ServiceChips`, `OscillationBand`,
  `FileTreePrint` (folder story now lives in the architecture print and facet
  cards; if a plan task finds a natural home for the file-tree print inside a
  section, it may return — otherwise delete).
- **Interactivity budget:** `HowItGoes` is the only new interactive piece — plain
  Astro + a small vanilla tabs script (no new React island; the demo remains the
  page's only island). If implementation finds the vanilla pattern fighting
  accessibility requirements, a minimal island is acceptable — note it in the PR.

## 7. Accessibility & motion requirements

- Stepper: WAI-ARIA tabs pattern — `tablist`/`tab`/`tabpanel`, arrow-key
  navigation, all panels in the DOM (hidden, not unmounted), visible focus.
- SVG prints: `<title>` + `<desc>` + hidden prose equivalents; text in SVGs must
  meet AA contrast in both themes.
- `PathsTable`: real `<table>` with `<th scope>`; the mobile card variant keeps the
  same reading order.
- Demo window: sr-only transcript preserved; traffic-light dots are decorative
  (`aria-hidden`).
- Motion: hero entrance unchanged (≤800ms, hierarchy order); the drifting cloud and
  the demo are the only ambient/scripted motion; stepper crossfade is opacity-only;
  everything honors `prefers-reduced-motion` (drift stops, stepper switches
  instantly, demo shows rest state).
- All new text/background pairs re-checked for AA (notably: generic window grays in
  both schemes, print-blue accents inside the illustration, table wash).

## 8. The docs-link flag

`PUBLIC_DOCS_URL` (Astro public env var, empty by default). Every docs link —
header "Docs", CTA band "Getting started →", under-the-hood "Read the
architecture →", footer — renders only when the variable is set at build time.
Ship the page with it unset; set it when `docs.lodekit.com` is live. No dead links,
no second landing release.

## 9. PRODUCT.md §8 amendment

Applied on this branch (strategy lands in PRODUCT.md first, then flows outward).
The `Landing page` bullet of §8 changes to:

> - **Landing page:** hero = resolution-led — tagline-family headline with a
>   situation subhead; the complication (§4) moves below the fold as the problems
>   section. Arc: problems → fit check → what-is → how-it-goes → comparison →
>   manifesto → CTA. Oscillation pairs (§5) close the manifesto; stack names in the
>   developer layer only.

Nothing in §§1–7 changes: pillars, narrative, voice, and the canonical tagline are
untouched. The two enemy beats survive intact in the problems section (beats
`THE SPRAWL` + `THE GRAVEYARD`) per §4's "keep the complication factual".

## 10. Verification & definition of done

- `pnpm --filter @lodekit/web-main build` passes; no console errors.
- Existing demo tests (`script.test.ts`, `timeline.test.ts`) stay green, unmodified.
- New logic with a runnable check: the docs-flag rendering (build with/without
  `PUBLIC_DOCS_URL`) and the stepper's tab behavior (keyboard path exercised in the
  visual pass; a unit test only if logic is extracted).
- Visual pass per the craft flow: both themes × three breakpoints (mobile/tablet/
  desktop), every section inspected individually; states checked (form success,
  stepper focus/hover, reduced motion, table on mobile).
- Copy deck (§5) is implemented verbatim or the deviation is listed in the PR body.
- The anti-default line (§4) holds in the built page.
- Changelog: no entry — the landing page is not a Lodekit-user-visible product
  change (matches v2 precedent).

## 11. Out of scope

- Real email capture (NotifyForm stays mock — same as v2; wiring is its own slice).
- Docs site content/deploy (separate backlog item; this page only carries the flag).
- OG/social imagery refresh, favicon work (engine ships favicons; unchanged).
- Any dashboard/product-register surface.

## 12. Open questions (none blocking)

- Whether `FileTreePrint` returns inside a section (implementation may propose; not
  required).
- Exact generic grays for the demo window's two schemes — chosen at implementation
  against AA and the Print Test, not specced numerically here.
