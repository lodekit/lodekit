# Hero animated prompt-UI demo — design

**Date:** 2026-07-19 · **Session bead:** lk-08a · **Status:** approved

Replace the hero's jar illustration (`JarIllustration.astro`) with a scripted, animated
chat demo built on [prompt-kit](https://www.prompt-kit.com/): the landing visitor watches,
from the chat's point of view, a person ask an agent for a greenhouse app, choose Lodekit
over a single file or a cloud app, and receive a running app — the product story told as
a demo instead of an emblem.

## Decisions taken (with the partner)

1. **Play once, then rest.** DESIGN.md's Only-Clouds-Drift rule prohibits ambient motion
   at rest. Resolution chosen: the demo plays one full cycle after the hero entrance —
   a deliberate, partner-approved *extension of the orchestrated entrance* — then rests
   forever on its final frame. No autonomous looping; DESIGN.md is not amended. The
   `/clear` reset beat becomes the user-triggered **replay** affordance.
2. **Vendor + trim prompt-kit.** prompt-kit is a shadcn-registry library (copy-in, MIT).
   We vendor only the components the script needs, trimmed of the markdown pipeline,
   `use-stick-to-bottom`, and any animation library — CSS on `--ease-drift` instead.
   Zero new npm dependencies except the `ui/textarea.tsx` shadcn primitive (built on
   the already-installed `radix-ui`).

## 1. Placement & lifecycle

- The demo replaces `<JarIllustration />` in `Hero.astro`'s right grid column, same
  entrance slot (`--stagger: 320ms`). The jar-cloud **mark** stays in lockup/favicon;
  only the hero illustration retires.
- It renders as a print-register chat card: page-hi surface, 1px hairline border, 8px
  radius (hero-scale panel), mono kicker title strip (`AGENT SESSION — GREENHOUSE`)
  above a hairline rule, conversation area, prompt input at bottom. Fixed height
  (~540px); content scrolls inside the card, script-driven — the hero never reflows.
- **Lifecycle:** entrance fade-up → one scripted cycle (~35–40s) → rest on the final
  frame (completed conversation, resting cursor, nothing moving).
- **Replay:** a subtle mono chip in the title strip. Clicking it plays the `/clear`
  beat (input types `/clear`, submits, conversation fades clear) and re-runs the cycle.
  The loop exists but is always user-triggered.
- **Visibility:** IntersectionObserver pauses the timeline off-screen, resumes on
  return.
- **Reduced motion:** no cycle — the completed conversation renders statically; the
  replay chip is hidden (it would be a no-op).
- **SSR/no-JS:** initial React state is the final frame, so the island server-renders
  the completed conversation. On mount, when motion is allowed, it resets and plays.
  (A brief final-frame flash on hydration is acceptable — masked by the entrance fade.)

## 2. Storyboard & script

Voice per PRODUCT.md §7 (plain-spoken, wry at systems, never at people); the three
options are §4's two enemies plus the third path. Copy is final-draft:

| # | Beat | Content |
|---|------|---------|
| 1 | The ask | Input types itself: *"Build me something to manage my greenhouse based on my local weather forecast."* → posts as user message. |
| 2 | The fork | Agent streams: *"I can build that a few ways:"* + three stacked option chips — **Single file** *"works until it needs to remember anything. No storage, no schedule."* / **Cloud app** *"an account, a subscription, your data on someone else's computer."* / **Lodekit** *"runs on your Mac. Real database, scheduled tasks, yours forever."* |
| 3 | The pick | Reading-time hold; Lodekit chip shows a scripted press state (rust accent); user message posts: *"Lodekit."* |
| 4 | The skill | Reasoning-style collapsed row, slow opacity pulse: `Using skill: Building with Lodekit`. |
| 5–7 | The tools | Three tool rows in sequence, mono, captioned `MCP · lodekit`, loader → done check: `scaffold_app` *(Scaffolding new Lodekit app "greenhouse")*, `create_database` *(Creating the greenhouse database)*, `create_gateway` *(Connecting a gateway to the weather forecast)*. Tool names to be confirmed against the real `@lodekit/mcp` tool list at implementation — the demo shows real names ("honest to a fault"). |
| 8 | The landing | Agent streams: *"Your app is ready at `http://lodekit.local/greenhouse` — it checks the forecast every morning and takes it from there."* URL styled as a link, visual only. Rest frame. |
| R | Replay | Input types `/clear`, submits, conversation fades clear, cycle restarts at beat 1. |

Pacing: generous holds after beats 2 (persuasion moment) and 8. Full cycle ≈ 35–40s.

## 3. Component architecture

All under `web/main/src`:

```
components/
  demo/
    HeroDemo.tsx          island root: composition + lifecycle (entrance, IO pause, replay)
    script.ts             the storyboard as data: beats, copy, offsets/durations;
                          derives the final frame for SSR/reduced-motion
    timeline.ts           tiny pausable scheduler: fires beat actions at offsets;
                          pause/resume/reset/skip-to-end
    prompt-kit/           vendored + trimmed (MIT; provenance header w/ upstream commit)
      message.tsx           no Markdown, no Avatar — role + plain children
      prompt-input.tsx      textarea + send affordance; display-only
      tool.tsx              static row (never expands; collapsible dropped): name,
                            caption, running|done state
      reasoning.tsx         collapsed pulse row only
      loader.tsx            as-is (pure)
      response-stream.tsx   as-is (pure; streams agent messages)
      prompt-suggestion.tsx chip via existing ui/button variants
  ui/textarea.tsx         the one new shadcn primitive
```

- `script.ts` is the single source of truth for beats; `timeline.ts` is a dumb clock;
  React state accumulates rendered items + the input's typewriter text. Entering
  elements animate with CSS only (fade-up on `--ease-drift`).
- `Hero.astro` swaps `<JarIllustration />` for `<HeroDemo client:load />`.
- **Non-interactive by construction:** everything inside the card is
  `pointer-events: none` and unfocusable except the replay chip. Beat 3's "click" is a
  scripted press state. The URL is a link-styled span, not an anchor.
- **Scroll:** fixed-height conversation; script scrolls the container to bottom on
  append (`scroll-behavior: smooth`). No page-level scroll effects.

## 4. Visual treatment & motion

- **Print register, both plates.** User messages: right-aligned page-lo wash, 5px
  radius, ink. Agent messages: no bubble — ink on the card, like print. Tool rows/URL:
  mono data voice, slate captions; done = check glyph + ink (never color alone).
  Option chips: hairline outline; the scripted Lodekit press uses the rust accent
  (depicts interaction — on-vocabulary). Dark mode inherits the night plate via
  tokens (night-hi card, pale gold ink, ochre accent). No shadows at rest; the whole
  card must pass the Print Test.
- **Motion:** `--ease-drift` only; durations on the DESIGN.md ramp (entrances
  300–450ms, feedback ~100ms); typewriter ≈ 35ms/char. The reasoning row's activity
  cue is the established slow opacity pulse — not a background sweep (which would need
  `linear` outside its one permitted home). Only `transform`/`opacity` animate.

## 5. Accessibility

- Animated playback region is `aria-hidden`; a visually-hidden static transcript of
  the final conversation is always present for screen readers (same content the SSR
  frame gives no-JS visitors).
- Replay chip: real `<button>`, system focus-visible outline, `aria-label="Replay demo"`.
  Nothing else in the card is focusable.
- `prefers-reduced-motion` honored fully (static frame, no cycle, chip hidden).

## 6. Testing

- **Unit (vitest, new `test` script in `@lodekit/web-main`, joins `pnpm -r test`):**
  `timeline.ts` — beats fire in order, pause/resume accounting, reset, skip-to-end;
  `script.ts` — invariants (monotonic offsets, final-frame derivation matches the
  beat list).
- **Build:** `pnpm --filter @lodekit/web-main build`.
- **Manual verify:** full cycle in dev, light + dark plates, reduced-motion, replay,
  off-screen pause.

## Out of scope

- No DESIGN.md amendment (decision 1 records the entrance-extension framing here).
- No real chat interactivity, no real agent/MCP wiring — the demo is a movie.
- No changes to hero copy, layout grid, or the NotifyForm column.
