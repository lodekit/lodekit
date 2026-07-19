# Hero Demo Adjustments — Round 1

**Goal:** Ten partner-requested adjustments to the shipped hero demo (plan
`2026-07-19-hero-demo.md`), headlined by a direction change: the demo becomes an
**illustration-register night window** — a macOS-style window on a fixed night plate in
both modes, muted interior, with a subtle Grainient halo marking it as artwork, not
product UI.

**Executor note:** implemented inline by the orchestrating session (not
subagent-per-task) — tight iteration round, full context already loaded, partner
smoke-test follows immediately. Per-concern commits preserved.

**Decisions taken with the partner (2026-07-19):**
- Items 4–7 direction: **night window + halo** (over whole-hero night plate). Window
  interior is a fixed night plate in BOTH modes; hero page surface stays parchment in
  light mode — the dark window carries the light-mode contrast (item 6).
- **Grainient** (react-bits, vendored @ f88bb89, MIT; new dep `ogl`) renders as an
  extremely subtle sky-family halo behind the window — a partner-approved, scoped
  **exception to DESIGN.md's no-ambient-animation rule**, recorded in the spec addendum.
  Absent under reduced motion.

## The ten items → changes

1. Placeholder text → `Ask me anything…` (HeroDemo → PromptInputDisplay).
2. **First-paint flicker fix:** SSR shows the completed frame; hydration blanked it at
   +900ms. Fix: (a) inline `is:inline` script in Hero.astro adds `demo-boot` class on
   `<html>` when motion is allowed (with a 3s self-removal failsafe); CSS
   `html.demo-boot .demo-veil { visibility: hidden }` veils the conversation+input
   region only (window chrome still paints); (b) the island resets to EMPTY immediately
   on mount (not at +900ms; the entrance delay now only gates playback start) and
   removes `demo-boot` after the empty state commits (double rAF); (c) the replay
   control renders only when hydrated — kills both the motion-user replay flash and the
   reduced-motion one-frame chip flash. No-JS keeps the full SSR frame (inline script
   requires JS; a JS-less replay button was dead weight anyway).
3. Replay quieter: bare mono kicker text (`0.65rem`, cloud-slate, tiny RotateCcw), no
   chip fill/border; hover fades to parchment; pale-gold focus outline.
4. Illustration register via one CSS block — `.demo-window` overrides the shadcn role
   vars to fixed physical night values (pattern: `.plate-night`), so every vendored
   component recolors without edits:
   `--background/--card: night-hi · --foreground/--card-foreground/--secondary-foreground: parchment · --secondary/--muted/--border/--input: night-lo · --muted-foreground: cloud-slate · --primary/--ring: pale-gold · --primary-foreground: night`.
   Pale gold appears as ink only (labels, borders, outline) — never a fill. Send button
   drops `bg-primary` for `bg-secondary text-secondary-foreground` (muted).
5. Window chrome: titlebar = three flat 10px dots (clay-rose / parchment / cloud-slate
   at 70% — traffic-light *positions*, our pigments), mono kicker title, quiet replay
   right, `border-b border-border`. Card: `rounded-[8px]`, `demo-window` class.
6. Covered by the direction decision (dark window on parchment hero).
7. `demo/Grainient.tsx` vendored (provenance header), `ogl` added to deps. Halo:
   absolutely positioned `-inset-*` layer behind the window (`z-0`, window `z-10`),
   sky-family colors (print-blue / cloud-slate / clay-rose), low saturation/contrast,
   `timeSpeed ≈ 0.1`, static grain; container blurred + low opacity + mount fade-in;
   wrapped in a minimal error boundary (WebGL may fail; the demo must not die with it);
   not mounted when `reduced`.
8. `PromptSuggestion` gains `icon?: ReactNode` and `emphasis?: boolean`. Icons:
   FileText (Single file), Cloud (Cloud app), jar mark via
   `MARK_BODIES.b` from `@lodekit/engine/marks` (32×32 svg, `currentColor`) for
   Lodekit. Emphasis (Lodekit only): pale-gold label + pale-gold-tinted border —
   the interior's one warm note; press state unchanged semantics.
9. Placeholder only before the first message: `state.items.length === 0 ? PLACEHOLDER : ""`;
   `PromptInputDisplay` renders the placeholder span only when non-empty. (Restores
   naturally after `/clear` on replay.)
10. Copy (script.ts + spec table): `Creating the greenhouse database on your computer` ·
    `Connecting a secure gateway to the weather forecast`. (Tests assert tool names, not
    captions — unaffected.)

## Files

- `web/main/src/components/demo/script.ts` — item 10 captions.
- `web/main/src/components/demo/HeroDemo.tsx` — items 1,2,3,5,7,8,9 wiring.
- `web/main/src/components/demo/prompt-kit/prompt-input.tsx` — placeholder gating, muted send.
- `web/main/src/components/demo/prompt-kit/prompt-suggestion.tsx` — icon/emphasis props.
- `web/main/src/components/demo/Grainient.tsx` — new, vendored.
- `web/main/src/components/Hero.astro` — inline boot script.
- `web/main/src/styles/globals.css` — `.demo-window` vars, `.demo-veil`, halo styles.
- `web/main/package.json` (+lockfile) — `ogl`.
- `docs/specs/2026-07-19-hero-demo-design.md` — addendum (direction, Grainient
  exception, copy).

## Checks

Per-concern commits; after each: `tsc --noEmit`. End of round: full
`pnpm --filter @lodekit/web-main test` + `build`, headless captures (light + dark +
reduced-motion + rest frame) before handing to the partner's smoke test.
