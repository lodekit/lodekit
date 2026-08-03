# Landing Page v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** Rebuild the landing page (`web/main`) per the approved v3 spec — new section architecture (problems → fit → what-is → how-it-goes → paths → manifesto → CTA), full visual language, download-led CTA with the email capture retired, and unflagged docs/GitHub links.

**Architecture:** Astro static site; every v3 section is its own `.astro` component composed by `index.astro`. Sections are wired in progressively (each task's commit builds and shows its section live), with v2 leftovers removed in the final recomposition task. The demo interior goes generic via a scoped CSS-token override (`.demo-window` re-points role tokens), so the demo machinery is untouched. The only client-side JS added is two tiny vanilla `<script>`s (tooltip, tabs) — the demo stays the page's only island.

**Tech Stack:** Astro 7, Tailwind v4 (CSS-first via `globals.css` `@theme inline`), React 19 (existing demo island only; `@phosphor-icons/react` renders static SVG server-side in `.astro` files — no client directive, no new dependency), vitest.

**Spec:** `docs/specs/2026-07-24-landing-page-v3-design.md` (all § references below). ADR-0007 covers the CTA decision.

## Global Constraints

- **Copy is normative:** every headline, beat, cell, and panel line comes verbatim from spec §5 — a deviation must be listed in the PR body.
- **No new dependencies.** Icons come from the existing `@phosphor-icons/react` (regular weight only, per DESIGN.md); the mark from `@lodekit/engine/marks` (`MARK_BODIES.b`, never redrawn).
- **No new islands.** The demo (`HeroDemo client:load`) stays the page's only island; new interactivity is vanilla `<script>` (spec §6).
- **Demo machinery untouched:** `script.ts`, `timeline.ts`, `prompt-kit/*`, and both test files must not change (spec §5.1); `HeroDemo.tsx`'s *shell markup* is the one sanctioned edit.
- **Motion doctrine:** `--ease-drift` is the only easing (`linear` only inside the cloud-drift loop); hover = fade in place; below the fold animates only as response; everything honors `prefers-reduced-motion` (DESIGN.md §5).
- **Only clouds drift:** the hero cloud (and the optional manifesto cloud) are the only ambient motion.
- **Focus = border, never a ring:** no `outline` or Tailwind `ring-*` for focus anywhere (DESIGN.md Focus-Is-A-Border).
- **AA floor:** every new text/background pair meets 4.5:1 (3:1 UI) in both themes; the disabled Download button is exempt (WCAG inactive-control exception) — its message is carried by adjacent static copy.
- **URLs:** docs `https://docs.lodekit.com` (same tab), GitHub `https://github.com/lodekit/lodekit` (`target="_blank" rel="noopener"`) — only ever imported from `src/lib/links.ts`.
- **Canonical terms** (`docs/CONTEXT.md`): app, agent, engine, service, gateway, manager — marketing may simplify, never rename.
- **Commits:** conventional prefixes, bead IDs in messages, no `Co-Authored-By` trailers.
- **Changelog:** no entry — the landing page is not a Lodekit-user-visible product change (spec §10).
- Build gate for every task: `pnpm --filter @lodekit/web-main build` exits 0, and `pnpm --filter @lodekit/web-main test` stays green.

---

### Task 1: PRODUCT.md §8 amendment

Strategy lands in PRODUCT.md first, then flows outward (spec §9).

**Files:**
- Modify: `docs/PRODUCT.md:295-297` (the `Landing page` bullet of §8)

**Interfaces:**
- Consumes: spec §9 amendment text.
- Produces: nothing code-facing; unblocks the page work narratively.

**Acceptance Criteria:**
- The §8 `Landing page` bullet matches spec §9 verbatim; nothing else in PRODUCT.md changes.

- [ ] **Step 1: Apply the amendment**

Replace the current bullet:

```markdown
- **Landing page:** hero = complication compression (§4) → tagline as resolution;
  section order follows the pillars (§6); oscillation pairs (§5) for the persuasion
  band; stack names in the developer layer only.
```

with:

```markdown
- **Landing page:** hero = resolution-led — tagline-family headline with a
  situation subhead; the complication (§4) moves below the fold as the problems
  section. Arc: problems → fit check → what-is → how-it-goes → comparison →
  manifesto → CTA. Oscillation pairs (§5) close the manifesto; stack names in the
  developer layer only.
```

- [ ] **Step 2: Verify the diff touches only that bullet**

Run: `git diff --stat docs/PRODUCT.md`
Expected: `1 file changed`, ~5 insertions / ~3 deletions.

- [ ] **Step 3: Commit**

```bash
git add docs/PRODUCT.md
git commit -m "docs: PRODUCT.md §8 — landing hero goes resolution-led (spec §9)"
```

---

### Task 2: Foundations — links module + visual-language CSS layer

**Files:**
- Create: `web/main/src/lib/links.ts`
- Modify: `web/main/src/styles/globals.css`

**Interfaces:**
- Produces: `DOCS_URL: string`, `GITHUB_URL: string` (named exports of `src/lib/links.ts`); CSS classes `.btn-ghost`, `.nav-link`, `.tooltip` (+ `[data-show]` state), `.plate-wash`; `[aria-disabled="true"]` skin on `.btn-primary`; global focus-border rules; `.dark .plate-night` correction. Later tasks use all of these by name.

**Acceptance Criteria:**
- `links.ts` exports the two canonical URLs and nothing else.
- Focus anywhere on the page is a border + 1px inset accent shadow — no outline rings (spec §4.2). The old `.btn-primary:focus-visible` outline block and `.plate-ochre :focus-visible` outline-color override are gone.
- `.btn-ghost`, `.nav-link`, `.tooltip`, `.plate-wash` exist per DESIGN.md §5 values; `.dark .plate-night` resolves to night-hi (spec §4.1).
- Build passes.

- [ ] **Step 1: Create the links module**

```ts
// web/main/src/lib/links.ts
// Canonical site links (spec §8) — the single source; never inline these URLs.
export const DOCS_URL = "https://docs.lodekit.com";
export const GITHUB_URL = "https://github.com/lodekit/lodekit";
```

- [ ] **Step 2: Replace the focus rules in `globals.css`**

Delete the `.btn-primary:focus-visible { … }` block and the
`.plate-ochre :focus-visible { outline-color: var(--ink); }` rule. Add to
`@layer base` (after the cursor rule):

```css
/* Focus-Is-A-Border (DESIGN.md §5): focus is an edge on the element, never a
   ring around it. Pointer focus tints the border but withholds the ring. */
:where(a, button, [role="button"], [role="tab"], input, select, textarea, summary):focus-visible {
  outline: none;
  border-color: var(--ring);
  box-shadow: inset 0 0 0 1px var(--ring);
}
:where(a, button, [role="button"], [role="tab"], input, select, textarea, summary):focus:not(:focus-visible) {
  outline: none;
  border-color: var(--ring);
  box-shadow: inset 0 0 0 1px transparent;
}
```

And scope the ochre plate's accent by token instead of by outline (add inside
`@layer components`, with the other `.plate-ochre` rules):

```css
.plate-ochre {
  --ring: var(--ink);
}
```

(Keep the existing `.plate-ochre { background: …; color: …; }` declarations —
merge, don't duplicate the selector.)

- [ ] **Step 3: Add the new component classes**

In `@layer components`:

```css
/* ghost button (DESIGN.md §5) — border resolves to full ink on hover, a fade */
.btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5em;
  background: transparent;
  color: var(--foreground);
  border: 1.5px solid color-mix(in srgb, var(--foreground) 35%, transparent);
  border-radius: 3px;
  padding: 0.85em 1.5em;
  font-size: 0.95rem;
  font-weight: 500;
  white-space: nowrap;
  transition:
    border-color 250ms var(--ease-drift),
    transform 100ms var(--ease-drift);
}
.btn-ghost:hover {
  border-color: var(--foreground);
}
.btn-ghost:active {
  transform: translateY(1px);
}
/* the ochre plate is ink-on-ochre in both themes — the ghost follows the plate,
   not the theme */
.plate-ochre .btn-ghost {
  color: var(--ink);
  border-color: color-mix(in srgb, var(--ink) 45%, transparent);
}
.plate-ochre .btn-ghost:hover {
  border-color: var(--ink);
}

/* nav / arrow links — accent underline fades in place (never slides) */
.nav-link {
  border-bottom: 2px solid transparent;
  transition: border-color 250ms var(--ease-drift);
}
.nav-link:hover,
.nav-link[aria-current="page"] {
  border-color: var(--ring);
}

/* tooltip — a print label, flat, no shadow (spec §5.11) */
.tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--popover);
  color: var(--popover-foreground);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0.35em 0.7em;
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity 200ms var(--ease-drift),
    visibility 0s 200ms;
}
.tooltip[data-show] {
  opacity: 1;
  visibility: visible;
  transition: opacity 200ms var(--ease-drift);
}

/* the one mid-page wash (spec §4.1) — role token, flips with the theme */
.plate-wash {
  background: var(--secondary);
}
```

- [ ] **Step 4: Disabled skin + night-plate dark correction**

The current `.btn-primary:disabled { pointer-events: none; }` rule stays (real
`disabled` elsewhere), but the Download button uses `aria-disabled` so the
tooltip keeps pointer events (spec §5.11). Add **after** all `.btn-primary` and
`.plate-ochre` hover rules (order is load-bearing — these must win ties):

```css
/* aria-disabled skin (spec §5.11): 50% opacity, no hover response, no motion */
.btn-primary[aria-disabled="true"],
.btn-primary[aria-disabled="true"]:hover,
.dark .btn-primary[aria-disabled="true"]:hover {
  background: var(--primary);
  color: var(--primary-foreground);
  opacity: 0.5;
  cursor: not-allowed;
}
.plate-ochre .btn-primary[aria-disabled="true"],
.plate-ochre .btn-primary[aria-disabled="true"]:hover {
  background: var(--ink);
  color: var(--pale-gold);
  opacity: 0.5;
}
.btn-primary[aria-disabled="true"]:active {
  transform: none;
}

/* in dark theme the page is already night — the manifesto plate steps to
   night-hi so it still reads as a plate (spec §4.1) */
.dark .plate-night {
  background: var(--night-hi);
}
```

And extend the reduced-motion block:

```css
@media (prefers-reduced-motion: reduce) {
  /* …existing rules… */
  .tooltip,
  .tooltip[data-show] {
    transition: none;
  }
}
```

- [ ] **Step 5: Build and commit**

Run: `pnpm --filter @lodekit/web-main build`
Expected: exit 0, no console errors.

```bash
git add web/main/src/lib/links.ts web/main/src/styles/globals.css
git commit -m "feat(web-main): links module + v3 visual-language CSS layer"
```

---

### Task 3: `DownloadCta` component

**Files:**
- Create: `web/main/src/components/DownloadCta.astro`

**Interfaces:**
- Consumes: `DOCS_URL` from `../lib/links`; `.btn-primary`, `.btn-ghost`, `.tooltip` from Task 2; `AppleLogoIcon` from `@phosphor-icons/react` (static render — no client directive).
- Produces: `<DownloadCta id="…" center? />` — `id: string` (unique per placement, prefixes the tooltip id), `center?: boolean` (CTA-band centering). Tasks 6 and 12 consume it.

**Acceptance Criteria:**
- Primary: `aria-disabled="true"` (NOT the `disabled` attribute), Apple logo + "Download", click no-ops, focusable.
- Tooltip "Coming soon!" (`role="tooltip"`, `aria-describedby`-linked) shows on hover **and** focus, hides on mouseleave/blur/Escape.
- Secondary: `.btn-ghost` anchor "Getting started" → `DOCS_URL`.
- Built HTML contains both controls with correct ARIA wiring (grep check below).

- [ ] **Step 1: Write the component**

```astro
---
// The CTA pair (spec §5.11, ADR-0007): a permanently disabled Download promise
// plus the live path — the docs. aria-disabled (not disabled) keeps the button
// focusable and hoverable so keyboard users reach the tooltip too.
import { AppleLogoIcon } from "@phosphor-icons/react";
import { DOCS_URL } from "../lib/links";

interface Props {
  id: string;
  center?: boolean;
}
const { id, center = false } = Astro.props;
---

<div class:list={["flex flex-wrap items-center gap-3", center && "justify-center"]} data-download-cta>
  <span class="relative inline-flex">
    <button
      type="button"
      class="btn-primary gap-2"
      aria-disabled="true"
      aria-describedby={`${id}-tip`}
      data-download-button
    >
      <AppleLogoIcon weight="regular" size={16} aria-hidden="true" />
      Download
    </button>
    <span class="tooltip" role="tooltip" id={`${id}-tip`}>Coming soon!</span>
  </span>
  <a class="btn-ghost" href={DOCS_URL}>Getting started</a>
</div>

<script>
  // Tooltip on hover AND focus; Escape dismisses (spec §5.11). Astro dedupes
  // this module script across the two placements.
  document.querySelectorAll<HTMLElement>("[data-download-cta]").forEach((root) => {
    const button = root.querySelector<HTMLButtonElement>("[data-download-button]")!;
    const tip = root.querySelector<HTMLElement>("[role='tooltip']")!;
    const show = () => tip.setAttribute("data-show", "");
    const hide = () => tip.removeAttribute("data-show");
    button.addEventListener("click", (e) => e.preventDefault());
    button.addEventListener("mouseenter", show);
    button.addEventListener("mouseleave", hide);
    button.addEventListener("focus", show);
    button.addEventListener("blur", hide);
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hide();
    });
  });
</script>
```

- [ ] **Step 2: Temporarily verify it renders (no permanent wiring yet)**

The component is wired into the hero in Task 6. To verify now, add
`<DownloadCta id="probe" />` under the `NotifyForm` line in
`src/components/Hero.astro` (with the import), build, check, then **revert the
Hero edit** before committing:

Run: `pnpm --filter @lodekit/web-main build && /usr/bin/grep -c 'aria-disabled="true"' web/main/dist/index.html`
Expected: build exit 0; grep prints `1`.

Run: `git checkout web/main/src/components/Hero.astro`

- [ ] **Step 3: Commit**

```bash
git add web/main/src/components/DownloadCta.astro
git commit -m "feat(web-main): DownloadCta — disabled download + getting-started pair (ADR-0007)"
```

---

### Task 4: Header + Footer links

**Files:**
- Modify: `web/main/src/components/Header.astro`
- Modify: `web/main/src/components/Footer.astro`
- Modify: `web/main/src/components/ThemeToggle.tsx` (focus classes only)

**Interfaces:**
- Consumes: `DOCS_URL`, `GITHUB_URL`, `.nav-link` (Task 2).

**Acceptance Criteria:**
- Header: Docs + GitHub text links before the theme toggle; hairline-strong bottom rule in light (`--border` in dark); no icons (spec §5.10).
- Footer: Docs · GitHub · "macOS only, for now." · © 2026 Lodekit, small 400-weight; hairline-strong top rule in light.
- GitHub opens `_blank` + `rel="noopener"`; Docs same tab.
- ThemeToggle focus is the border pattern, not an outline ring.

- [ ] **Step 1: Rewrite `Header.astro`**

```astro
---
import Lockup from "./Lockup.astro";
import { ThemeToggle } from "./ThemeToggle";
import { DOCS_URL, GITHUB_URL } from "../lib/links";
---

<header class="border-b border-hairline-strong dark:border-border">
  <div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
    <Lockup class="opacity-80" />
    <nav class="flex items-center gap-6" aria-label="Site">
      <a class="nav-link text-[0.95rem]" href={DOCS_URL}>Docs</a>
      <a class="nav-link text-[0.95rem]" href={GITHUB_URL} target="_blank" rel="noopener">GitHub</a>
      <ThemeToggle client:load />
    </nav>
  </div>
</header>
```

- [ ] **Step 2: Rewrite `Footer.astro`**

```astro
---
import Lockup from "./Lockup.astro";
import { DOCS_URL, GITHUB_URL } from "../lib/links";
---

<footer class="border-t border-hairline-strong dark:border-border">
  <div
    class="mx-auto flex max-w-6xl flex-col items-start gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between"
  >
    <Lockup class="opacity-80" />
    <p class="text-sm font-normal text-muted-foreground">
      <a class="nav-link" href={DOCS_URL}>Docs</a>
      · <a class="nav-link" href={GITHUB_URL} target="_blank" rel="noopener">GitHub</a>
      · macOS only, for now. · © 2026 Lodekit
    </p>
  </div>
</footer>
```

- [ ] **Step 3: Realign ThemeToggle focus**

In `ThemeToggle.tsx`, replace the Button `className` with the border pattern
(the ui Button's own ring utilities must be zeroed, then the inset edge drawn
explicitly — the global `:where()` rule loses to utility specificity here):

```tsx
className="[transition-timing-function:var(--ease-drift)] focus-visible:ring-0 focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring)]"
```

- [ ] **Step 4: Build, check, commit**

Run: `pnpm --filter @lodekit/web-main build && /usr/bin/grep -c 'rel="noopener"' web/main/dist/index.html`
Expected: build exit 0; grep ≥ `2` (header + footer).

```bash
git add web/main/src/components/Header.astro web/main/src/components/Footer.astro web/main/src/components/ThemeToggle.tsx
git commit -m "feat(web-main): header/footer docs + github links, focus realignment"
```

---

### Task 5: `DemoWindow` — generic window shell + scoped token override

**Files:**
- Create: `web/main/src/components/demo/DemoWindow.tsx` (the ~20-line shell component named by spec §6)
- Modify: `web/main/src/components/demo/HeroDemo.tsx` (swap its card shell for `DemoWindow` — lines 182–213 region)
- Modify: `web/main/src/styles/globals.css` (`.demo-window` scopes, cloud-drift keyframes)
- Do NOT touch: `demo/script.ts`, `demo/timeline.ts`, `demo/prompt-kit/*`, `demo/*.test.ts`

**Interfaces:**
- Consumes: role tokens already used by prompt-kit (`--card`, `--border`, `--secondary`, `--muted-foreground`, `--primary`, `--font-mono`…).
- Produces: `DemoWindow({ title, ref?, children })` React component; `.demo-window` CSS scope; `.cloud-drift` animation class (Task 6 uses the cloud class).

**Acceptance Criteria:**
- The demo reads as "an agent chat on a Mac": flat titlebar with three traffic-light dots (decorative, `aria-hidden`), centered generic title `Agent — greenhouse`, system font stack, generic grays in two schemes following the site theme, print-blue accent inside (lightened print-blue derivative in the dark scheme — flag in the PR notes per spec §12).
- No Lodekit tokens visible inside the frame: no persimmon, no ochre, no Zen Kaku (spec §5.1).
- Demo tests pass unmodified: `pnpm --filter @lodekit/web-main test`.

- [ ] **Step 1: Add the `.demo-window` token scopes to `globals.css`**

In `@layer components`. The interior styles itself entirely through role
tokens, so re-pointing them here re-skins the whole conversation without
touching prompt-kit (that's why this works — verified: prompt-kit uses only
`bg-secondary`, `border-border`, `text-primary`, `text-muted-foreground`,
`font-mono`, …):

```css
/* the demo window is an illustration (spec §5.1): generic mac grays, system
   font, print-blue accent — Lodekit tokens never enter the frame. Grays are
   implementation-owned (spec §12) against AA + the Print Test. */
.demo-window {
  --background: #ffffff;
  --card: #ffffff;
  --card-foreground: #1d1d1f;
  --foreground: #1d1d1f;
  --border: #d9d9de;
  --secondary: #f2f2f3;
  --secondary-foreground: #1d1d1f;
  --muted: #f2f2f3;
  --muted-foreground: #6e6e73;
  --primary: #4b5d91; /* print blue — DESIGN.md reserves it for illustration */
  --primary-foreground: #ffffff;
  --ring: #4b5d91;
  --font-sans: -apple-system, system-ui, sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, monospace;
  font-family: var(--font-sans);
  color: var(--foreground);
}
.dark .demo-window {
  --background: #202024;
  --card: #202024;
  --card-foreground: #ececf0;
  --foreground: #ececf0;
  --border: #3f3f46;
  --secondary: #2b2b31;
  --secondary-foreground: #ececf0;
  --muted: #2b2b31;
  --muted-foreground: #a3a3ad;
  --primary: #93a7d4; /* lightened print-blue derivative — AA on the dark pane */
  --primary-foreground: #202024;
  --ring: #93a7d4;
}
```

- [ ] **Step 2: Add the cloud-drift animation (used by Task 6)**

With the other keyframes in `globals.css` — `linear` is permitted only here
(DESIGN.md Only-Clouds-Drift):

```css
@keyframes cloud-drift {
  from {
    transform: translate(0, 0);
  }
  to {
    transform: translate(9px, -6px);
  }
}
.cloud-drift {
  animation: cloud-drift 32s linear infinite alternate;
}
```

And in the reduced-motion block: `.cloud-drift { animation: none; }`

- [ ] **Step 3: Write `DemoWindow.tsx`**

```tsx
// web/main/src/components/demo/DemoWindow.tsx
// The illustration frame (spec §5.1): a generic mac window, not Lodekit UI.
// The .demo-window CSS scope re-points every role token to generic grays.
import type { ReactNode, Ref } from "react";

export function DemoWindow({
  title,
  ref,
  children,
}: {
  title: string;
  ref?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <div
      ref={ref}
      className="demo-window flex h-[540px] flex-col overflow-hidden rounded-[8px] border border-border bg-card font-normal"
    >
      <div
        className="relative flex items-center justify-center border-b border-border bg-secondary px-4 py-2.5"
        aria-hidden="true"
      >
        <span className="absolute left-4 flex gap-1.5">
          <span className="size-3 rounded-full bg-[#ec6a5e]" />
          <span className="size-3 rounded-full bg-[#f4bf50]" />
          <span className="size-3 rounded-full bg-[#61c554]" />
        </span>
        <span className="text-[0.8125rem] text-muted-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Swap the shell in `HeroDemo.tsx`**

Replace the outer `<div ref={cardRef} …>` … `</div>` shell and the old kicker
header (the `border-b … Agent session — greenhouse` div) with the new frame —
the interior (`<div className="flex min-h-0 flex-1 flex-col">` onward) moves
inside unchanged, and the sr-only `<Transcript />` stays:

```tsx
import { DemoWindow } from "./DemoWindow";
// …
return (
  <DemoWindow title="Agent — greenhouse" ref={cardRef}>
    {/* …everything below the old header div stays exactly as-is… */}
    <Transcript />
  </DemoWindow>
);
```

(React 19 accepts `ref` as a regular prop — no `forwardRef` needed.)

- [ ] **Step 5: Test, build, commit**

Run: `pnpm --filter @lodekit/web-main test`
Expected: `script.test.ts` and `timeline.test.ts` PASS, unmodified (`git status` shows no changes under `demo/` except `HeroDemo.tsx` + the new `DemoWindow.tsx`).

Run: `pnpm --filter @lodekit/web-main build`
Expected: exit 0.

```bash
git add web/main/src/components/demo/DemoWindow.tsx web/main/src/components/demo/HeroDemo.tsx web/main/src/styles/globals.css
git commit -m "feat(web-main): DemoWindow — generic mac shell via scoped token override"
```

---

### Task 6: Hero recomposition

**Files:**
- Modify: `web/main/src/components/Hero.astro` (full rewrite below)

**Interfaces:**
- Consumes: `DownloadCta` (Task 3), `.cloud-drift` (Task 5), existing `HeroDemo`, `.enter`/`--stagger` entrance utilities.

**Acceptance Criteria:**
- Copy verbatim from spec §5.1 (kicker, H1 "Cloud batteries for your local apps.", subhead, chip).
- CTA row replaces `NotifyForm`; chip sits beneath the row (the static coming-soon signal).
- One flat cloud (cloud slate, low contrast) drifts behind the window's upper edge; gone under reduced motion.
- Entrance choreography unchanged (kicker → H1 → subhead → CTAs → art, ≤800ms).

- [ ] **Step 1: Rewrite `Hero.astro`**

```astro
---
import DownloadCta from "./DownloadCta.astro";
import HeroDemo from "./demo/HeroDemo";
---

<section class="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-16 md:py-24 lg:grid-cols-[1.15fr_1fr]">
  <div>
    <p class="kicker text-muted-foreground enter" style="--stagger: 0ms">
      The local platform for agent-built apps
    </p>
    <h1 class="display mt-5 enter" style="--stagger: 80ms">
      Cloud batteries for your local&nbsp;apps.
    </h1>
    <p class="prose-measure mt-6 text-muted-foreground enter" style="--stagger: 160ms">
      Ask your agent for an app and it will build one. Lodekit gives it everything it needs from a
      cloud — on the computer you already own. One menubar app, your data in a folder. No accounts,
      no subscriptions, nobody else's computer.
    </p>
    <div class="enter mt-8" style="--stagger: 240ms">
      <DownloadCta id="hero" />
      <span class="chip mt-6 inline-block">macOS alpha · Coming soon</span>
    </div>
  </div>
  <div class="enter relative" style="--stagger: 320ms">
    <svg
      class="cloud-drift absolute -top-10 right-4 w-36 text-cloud-slate opacity-50"
      viewBox="0 0 120 60"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        d="M28 52a16 16 0 0 1-2-31.9A22 22 0 0 1 68 14a18 18 0 0 1 24.4 12.7A14 14 0 0 1 90 52Z"
      />
    </svg>
    <HeroDemo client:load />
  </div>
</section>
```

(The cloud is painted before the window in source order, so the opaque window
covers the overlap — it reads as *behind*.)

- [ ] **Step 2: Build, check, commit**

Run: `pnpm --filter @lodekit/web-main build && /usr/bin/grep -c "Cloud batteries for your local" web/main/dist/index.html`
Expected: build exit 0; grep ≥ `1`. `NotifyForm` no longer referenced by Hero.

```bash
git add web/main/src/components/Hero.astro
git commit -m "feat(web-main): hero v3 — resolution-led copy, download CTA, drifting cloud"
```

---

### Task 7: Problems section — `ProblemBeats` + `GapSpectrum`

**Files:**
- Create: `web/main/src/components/ProblemBeats.astro`
- Create: `web/main/src/components/GapSpectrum.astro`
- Modify: `web/main/src/pages/index.astro` (wire in after `<Hero />`, before `<LoopStrip />`)

**Interfaces:**
- Produces: `<ProblemBeats />` — self-contained section (includes GapSpectrum).

**Acceptance Criteria:**
- Kicker `THE PROBLEM`, headline "The making got easy. The keeping didn't.", four beats verbatim (spec §5.2), 2×2 grid stacking to one column on mobile.
- No accent color anywhere in the section — ink and slate only.
- GapSpectrum: interrupted hairline with an empty middle interval labeled "the gap" in mono; `role="img"` + `<title>`/`<desc>` + sr-only prose.

- [ ] **Step 1: Write `GapSpectrum.astro`**

```astro
---
// The gap, drawn (spec §5.2): a spectrum with an empty middle. Ink/slate only —
// deliberately unresolved here; the what-is section answers it.
---

<figure class="mt-14">
  <svg viewBox="0 0 800 96" class="w-full text-muted-foreground" role="img">
    <title>The gap between the ways to keep an app</title>
    <desc>A horizontal spectrum from “a single file” to “containers, dependencies, a stack to
      operate”, with an empty interval in the middle labeled “the gap”.</desc>
    <!-- left segment + endpoint tick -->
    <line x1="16" y1="48" x2="300" y2="48" stroke="currentColor" stroke-width="1" />
    <line x1="16" y1="42" x2="16" y2="54" stroke="currentColor" stroke-width="1" />
    <!-- right segment + endpoint tick -->
    <line x1="500" y1="48" x2="784" y2="48" stroke="currentColor" stroke-width="1" />
    <line x1="784" y1="42" x2="784" y2="54" stroke="currentColor" stroke-width="1" />
    <!-- open-interval brackets facing the void -->
    <path d="M300 40 v16 M300 40 h6 M300 56 h6" stroke="currentColor" stroke-width="1" fill="none" />
    <path d="M500 40 v16 M500 40 h-6 M500 56 h-6" stroke="currentColor" stroke-width="1" fill="none" />
    <text x="400" y="52" text-anchor="middle" class="font-mono font-normal" font-size="13" fill="currentColor" letter-spacing="0.01em">the gap</text>
    <text x="16" y="82" text-anchor="start" class="font-mono font-normal" font-size="13" fill="currentColor" letter-spacing="0.01em">a single file</text>
    <text x="784" y="82" text-anchor="end" class="font-mono font-normal" font-size="13" fill="currentColor" letter-spacing="0.01em">containers, dependencies, a stack to operate</text>
  </svg>
  <p class="sr-only">
    The options run from a single file at one end to containers, dependencies, and a stack to
    operate at the other — with an empty gap in the middle.
  </p>
</figure>
```

- [ ] **Step 2: Write `ProblemBeats.astro`**

```astro
---
import GapSpectrum from "./GapSpectrum.astro";

// Labels, not numbers — the beats are a fork, not a sequence (spec §5.2).
const beats = [
  {
    label: "The choice",
    copy: "Ask for an app and your agent will offer ways to build it — a single file, a framework, a host. Weighing them is a technical call, and it lands on you.",
  },
  {
    label: "The gap",
    copy: "The options run small to large with nothing in between: a file that can't remember anything, or containers, dependencies, and a stack you now operate.",
  },
  {
    label: "The sprawl",
    copy: "A tool for an audience of one still ends up on third-party services — holding your private data, billing monthly, load-bearing. And once your data lives in their formats, leaving costs more than staying.",
  },
  {
    label: "The graveyard",
    copy: "Kept local instead, the app has no home. It forgets everything between runs, breaks silently, and joins the folder of half-working things you stopped opening.",
  },
];
---

<section class="border-t border-hairline-strong dark:border-border">
  <div class="mx-auto max-w-6xl px-6 py-16 md:py-24">
    <p class="kicker text-muted-foreground">The problem</p>
    <h2 class="headline mt-4">The making got easy. The keeping didn't.</h2>
    <div class="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2">
      {
        beats.map((beat) => (
          <div>
            <h3 class="kicker">{beat.label}</h3>
            <p class="prose-measure mt-3 text-muted-foreground">{beat.copy}</p>
          </div>
        ))
      }
    </div>
    <GapSpectrum />
  </div>
</section>
```

- [ ] **Step 3: Wire into `index.astro`**

Import `ProblemBeats` and place `<ProblemBeats />` directly after `<Hero />`
(v2 sections stay below for now; Task 15 removes them).

- [ ] **Step 4: Build, check, commit**

Run: `pnpm --filter @lodekit/web-main build && /usr/bin/grep -c "The making got easy" web/main/dist/index.html`
Expected: build exit 0; grep ≥ `1`.

```bash
git add web/main/src/components/ProblemBeats.astro web/main/src/components/GapSpectrum.astro web/main/src/pages/index.astro
git commit -m "feat(web-main): problems section — four beats + gap spectrum"
```

---

### Task 8: `FitChecklist`

**Files:**
- Create: `web/main/src/components/FitChecklist.astro`
- Modify: `web/main/src/pages/index.astro` (wire after `<ProblemBeats />`)

**Interfaces:**
- Consumes: `CheckCircleIcon`, `HourglassIcon` from `@phosphor-icons/react` (static render).

**Acceptance Criteria:**
- Kicker `IS IT FOR ME?` and no headline; two columns under a shared hairline, stacking on mobile; bullets verbatim (spec §5.3).
- Icons in ink (`currentColor` inherits foreground) — not green/red.
- Closing line small, slate, 400 weight.

- [ ] **Step 1: Write the component**

```astro
---
import { CheckCircleIcon, HourglassIcon } from "@phosphor-icons/react";

const forYou = [
  "You ask agents for tools — or you're about to.",
  "You track real things — habits, house projects, money — in tools shaped almost right.",
  "You run a home server, and don't want one more thing to maintain.",
  "Your data staying yours is a requirement, not a preference.",
];
const notYet = [
  "You need to share apps with other people, or work multi-user.",
  "You want a hosted URL on the open web.",
  "You're not on a Mac. (Windows and Linux are open questions — honestly.)",
];
---

<section class="border-t border-hairline-strong dark:border-border">
  <div class="mx-auto max-w-6xl px-6 py-16 md:py-24">
    <p class="kicker text-muted-foreground">Is it for me?</p>
    <div class="mt-8 grid gap-x-12 gap-y-10 border-t border-border pt-8 md:grid-cols-2">
      <div>
        <h3 class="text-[1.125rem] font-bold">It's for you if…</h3>
        <ul class="mt-5 space-y-4">
          {
            forYou.map((line) => (
              <li class="flex gap-3">
                <CheckCircleIcon weight="regular" size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))
          }
        </ul>
      </div>
      <div>
        <h3 class="text-[1.125rem] font-bold">Not yet, if…</h3>
        <ul class="mt-5 space-y-4">
          {
            notYet.map((line) => (
              <li class="flex gap-3">
                <HourglassIcon weight="regular" size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))
          }
        </ul>
      </div>
    </div>
    <p class="mt-10 text-sm font-normal text-muted-foreground">
      That's the current truth. This page changes when it does.
    </p>
  </div>
</section>
```

- [ ] **Step 2: Wire, build, commit**

Wire `<FitChecklist />` after `<ProblemBeats />` in `index.astro`.

Run: `pnpm --filter @lodekit/web-main build && /usr/bin/grep -c "Not yet, if" web/main/dist/index.html`
Expected: build exit 0; grep ≥ `1`.

```bash
git add web/main/src/components/FitChecklist.astro web/main/src/pages/index.astro
git commit -m "feat(web-main): fit checklist — for-you / not-yet columns"
```

---

### Task 9: `ArchitecturePrint` — the signature SVG

**Files:**
- Create: `web/main/src/components/ArchitecturePrint.astro`

**Interfaces:**
- Consumes: `MARK_BODIES` from `@lodekit/engine/marks` (the Lockup precedent — never redraw the mark).
- Produces: `<ArchitecturePrint />` — a self-contained `<figure>`; Task 10 places it.

**Acceptance Criteria:**
- Composition per spec §5.4: machine hairline outline; menubar strip with the jar-cloud mark + `manager` label; engine compartment holding a five-lobed flat cloud with the service labels `database · files · secrets · schedule · gateways`; two browser-tab shapes (`greenhouse`, `reading-log`) with hairline connections; folder labeled `~/Documents/Lodekit`.
- Flat sky-family fills (print blue, cloud slate, clay rose, ochre warmth); strokes/text in `currentColor` so both themes work; mono labels in data voice.
- `<title>` + `<desc>` + visually-hidden prose equivalent.

- [ ] **Step 1: Write the component**

The geometry below is the committed composition; an implementer may refine
shape coordinates, but the elements, labels, palette, and accessibility
structure are fixed. All labels use the mono data voice (400, normal case).

```astro
---
// The signature print (spec §4, §5.4): the cloud inside the machine — the H1
// literalized. The page's one committed image; everything around it stays quiet.
import { MARK_BODIES } from "@lodekit/engine/marks";
---

<figure>
  <svg viewBox="0 0 560 400" class="w-full" role="img">
    <title>Lodekit architecture</title>
    <desc>Your computer, drawn as a hairline outline. The menubar holds the Lodekit manager. Inside,
      the engine holds a small cloud of five services — database, files, secrets, schedule,
      gateways. Apps appear as browser tabs connected to the engine, and everything is kept in one
      folder.</desc>

    <!-- the machine: your computer, as boundary -->
    <rect x="24" y="20" width="512" height="312" rx="6" fill="none" stroke="currentColor" stroke-width="1" />
    <path d="M8 348 h544" stroke="currentColor" stroke-width="1" />
    <path d="M232 332 v8 h96 v-8" fill="none" stroke="currentColor" stroke-width="1" />

    <!-- menubar strip with the jar-cloud mark + manager label -->
    <line x1="24" y1="52" x2="536" y2="52" stroke="currentColor" stroke-width="1" />
    <svg x="484" y="26" width="22" height="22" viewBox="0 0 32 32" set:html={MARK_BODIES.b} />
    <text x="476" y="41" text-anchor="end" class="font-mono font-normal" font-size="11" fill="currentColor" letter-spacing="0.01em">manager</text>

    <!-- the engine compartment holding the cloud of services -->
    <rect x="112" y="120" width="248" height="152" rx="4" fill="none" stroke="currentColor" stroke-width="1" />
    <text x="124" y="141" class="font-mono font-normal" font-size="11" fill="currentColor" letter-spacing="0.01em">engine</text>
    <!-- five-lobed flat cloud: body cloud-slate, underside print-blue, one clay-rose lobe -->
    <g>
      <path
        d="M156 232a20 20 0 0 1 2-39.8A26 26 0 0 1 206 174a22 22 0 0 1 34 2a20 20 0 0 1 32 4a18 18 0 0 1 26 16a17 17 0 0 1-6 36Z"
        fill="var(--color-cloud-slate)"
      />
      <path d="M156 232 h136 a17 17 0 0 0 6-8 H160 a20 20 0 0 1-4 8Z" fill="var(--color-print-blue)" />
      <circle cx="240" cy="180" r="10" fill="var(--color-clay-rose)" />
    </g>
    <text x="236" y="256" text-anchor="middle" class="font-mono font-normal" font-size="11" fill="currentColor" letter-spacing="0.01em">database · files · secrets · schedule · gateways</text>

    <!-- apps: browser tabs, connected by hairlines -->
    <g>
      <path d="M392 96 h104 a4 4 0 0 1 4 4 v28 h-112 v-28 a4 4 0 0 1 4-4Z" fill="none" stroke="currentColor" stroke-width="1" />
      <circle cx="400" cy="112" r="3" fill="var(--color-ochre)" />
      <text x="410" y="116" class="font-mono font-normal" font-size="11" fill="currentColor" letter-spacing="0.01em">greenhouse</text>
      <path d="M412 156 h100 a4 4 0 0 1 4 4 v28 h-108 v-28 a4 4 0 0 1 4-4Z" fill="none" stroke="currentColor" stroke-width="1" />
      <circle cx="420" cy="172" r="3" fill="var(--color-print-blue)" />
      <text x="430" y="176" class="font-mono font-normal" font-size="11" fill="currentColor" letter-spacing="0.01em">reading-log</text>
      <path d="M360 180 h48 M360 200 q20 0 28-24" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="0.55" />
    </g>

    <!-- the folder: everything worth keeping -->
    <g>
      <path d="M84 296 h20 l6 7 h34 a3 3 0 0 1 3 3 v14 a3 3 0 0 1-3 3 h-60 a3 3 0 0 1-3-3 v-21 a3 3 0 0 1 3-3Z" fill="none" stroke="currentColor" stroke-width="1" />
      <text x="158" y="314" class="font-mono font-normal" font-size="11" fill="currentColor" letter-spacing="0.01em">~/Documents/Lodekit</text>
      <path d="M136 272 q-16 14-22 24" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="0.55" />
    </g>
  </svg>
  <p class="sr-only">
    Lodekit runs on your computer: one menubar manager, an engine holding five local services —
    database, files, secrets, schedule, gateways — apps served to your browser, and everything
    stored as files in ~/Documents/Lodekit.
  </p>
</figure>
```

- [ ] **Step 2: Build (component unwired — type/import check only) and commit**

Astro only compiles referenced files, so add a temporary import + placement in
`index.astro` (e.g. `<ArchitecturePrint />` after `<FitChecklist />`), run the
build, verify, then leave it — Task 10 wraps it into the section (it will
replace this bare placement).

Run: `pnpm --filter @lodekit/web-main build`
Expected: exit 0; the print renders in the page flow.

```bash
git add web/main/src/components/ArchitecturePrint.astro web/main/src/pages/index.astro
git commit -m "feat(web-main): architecture print — the cloud inside the machine"
```

---

### Task 10: What-is section — `WhatIs` + `FacetCards`

**Files:**
- Create: `web/main/src/components/WhatIs.astro`
- Create: `web/main/src/components/FacetCards.astro`
- Modify: `web/main/src/pages/index.astro` (replace the bare `<ArchitecturePrint />` with `<WhatIs />`)

**Interfaces:**
- Consumes: `ArchitecturePrint` (Task 9); `BatteryChargingIcon`, `FolderSimpleIcon`, `SquaresFourIcon`, `ShieldCheckIcon`, `PaletteIcon` from `@phosphor-icons/react`.
- Produces: `<WhatIs />` self-contained section. (`WhatIs` is a composition wrapper not named in the spec inventory — a composition detail, note in PR.)

**Acceptance Criteria:**
- Kicker `WHAT IS LODEKIT`, headline "One menubar app. A whole cloud inside.", prose verbatim (spec §5.4); print left ~60%, prose right; cards full-width beneath.
- Cards: page-hi fill, hairline border, 5px radius, flat, **no hover lift** (not links); five across on desktop, wrapping below; copy verbatim; `~/Documents/Lodekit` in mono.

- [ ] **Step 1: Write `FacetCards.astro`**

Cards are written out explicitly (not mapped) so the folder card can carry
inline mono markup:

```astro
---
import {
  BatteryChargingIcon,
  FolderSimpleIcon,
  PaletteIcon,
  ShieldCheckIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
---

<ul class="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
  <li class="rounded-[5px] border border-border bg-card p-6">
    <BatteryChargingIcon weight="regular" size={20} aria-hidden="true" />
    <h3 class="mt-3 text-[1.125rem] font-medium">Batteries</h3>
    <p class="mt-2 text-sm text-muted-foreground">
      A real database, file storage, secrets, schedules, gateways — local services of one engine.
    </p>
  </li>
  <li class="rounded-[5px] border border-border bg-card p-6">
    <FolderSimpleIcon weight="regular" size={20} aria-hidden="true" />
    <h3 class="mt-3 text-[1.125rem] font-medium">The folder</h3>
    <p class="mt-2 text-sm text-muted-foreground">
      Apps and data are files in <code class="font-mono text-[0.8125rem] font-normal">~/Documents/Lodekit</code>.
      Copy it and it's yours forever.
    </p>
  </li>
  <li class="rounded-[5px] border border-border bg-card p-6">
    <SquaresFourIcon weight="regular" size={20} aria-hidden="true" />
    <h3 class="mt-3 text-[1.125rem] font-medium">The dashboard</h3>
    <p class="mt-2 text-sm text-muted-foreground">
      Every app's state, data, and scheduled work — visible in one place.
    </p>
  </li>
  <li class="rounded-[5px] border border-border bg-card p-6">
    <ShieldCheckIcon weight="regular" size={20} aria-hidden="true" />
    <h3 class="mt-3 text-[1.125rem] font-medium">Guardrails</h3>
    <p class="mt-2 text-sm text-muted-foreground">
      Apps run isolated and see only their own data. Secrets never enter app code.
    </p>
  </li>
  <li class="rounded-[5px] border border-border bg-card p-6">
    <PaletteIcon weight="regular" size={20} aria-hidden="true" />
    <h3 class="mt-3 text-[1.125rem] font-medium">One theme</h3>
    <p class="mt-2 text-sm text-muted-foreground">
      Every app shares one UI library and one theme. Ten apps feel like one product.
    </p>
  </li>
</ul>
```

- [ ] **Step 2: Write `WhatIs.astro`**

```astro
---
import ArchitecturePrint from "./ArchitecturePrint.astro";
import FacetCards from "./FacetCards.astro";
---

<section class="border-t border-hairline-strong dark:border-border">
  <div class="mx-auto max-w-6xl px-6 py-16 md:py-24">
    <p class="kicker text-muted-foreground">What is Lodekit</p>
    <h2 class="headline mt-4">One menubar app. A whole cloud inside.</h2>
    <div class="mt-12 grid items-center gap-12 lg:grid-cols-[3fr_2fr]">
      <ArchitecturePrint />
      <p class="prose-measure text-muted-foreground">
        Lodekit is one menubar app that runs a local engine. Your agent builds apps against it; the
        engine runs them like real software — a real database, file storage, secrets, scheduled
        tasks, gateways to the outside. Everything worth keeping is files in one folder.
      </p>
    </div>
    <FacetCards />
  </div>
</section>
```

- [ ] **Step 3: Rewire, build, commit**

In `index.astro`: remove the bare `<ArchitecturePrint />` + import from Task 9,
add `<WhatIs />` after `<FitChecklist />`.

Run: `pnpm --filter @lodekit/web-main build && /usr/bin/grep -c "A whole cloud inside" web/main/dist/index.html`
Expected: build exit 0; grep ≥ `1`.

```bash
git add web/main/src/components/WhatIs.astro web/main/src/components/FacetCards.astro web/main/src/pages/index.astro
git commit -m "feat(web-main): what-is section — architecture print + facet cards"
```

---

### Task 11: `HowItGoes` — the stepper on the wash

**Files:**
- Create: `web/main/src/lib/tabs.ts`
- Create: `web/main/src/lib/tabs.test.ts`
- Create: `web/main/src/components/HowItGoes.astro`
- Modify: `web/main/src/pages/index.astro` (wire after `<WhatIs />`)

**Interfaces:**
- Consumes: `.plate-wash` (Task 2).
- Produces: `nextTabIndex(current: number, key: string, count: number): number | null` in `src/lib/tabs.ts` (pure, unit-tested — the spec §10 runnable check).

**Acceptance Criteria:**
- WAI-ARIA tabs: `tablist`/`tab`/`tabpanel`, roving tabindex, arrow keys both axes + Home/End with wrap, all panels in the DOM (hidden, not unmounted).
- Rail shows all four numbered one-liners permanently; step 01 selected by default; panel switch is opacity-only fade (instant under reduced motion).
- Section sits on `.plate-wash`; panel is a page-hi card, 8px radius; active tab = accent text + 2px accent underline.
- Copy and illustrations per spec §5.5 table, verbatim.

- [ ] **Step 1: Write the failing test**

```ts
// web/main/src/lib/tabs.test.ts
import { describe, expect, it } from "vitest";
import { nextTabIndex } from "./tabs";

describe("nextTabIndex", () => {
  it("advances and wraps forward on ArrowDown/ArrowRight", () => {
    expect(nextTabIndex(0, "ArrowDown", 4)).toBe(1);
    expect(nextTabIndex(3, "ArrowRight", 4)).toBe(0);
  });
  it("retreats and wraps backward on ArrowUp/ArrowLeft", () => {
    expect(nextTabIndex(2, "ArrowUp", 4)).toBe(1);
    expect(nextTabIndex(0, "ArrowLeft", 4)).toBe(3);
  });
  it("jumps to the ends on Home/End", () => {
    expect(nextTabIndex(2, "Home", 4)).toBe(0);
    expect(nextTabIndex(1, "End", 4)).toBe(3);
  });
  it("returns null for keys it doesn't own", () => {
    expect(nextTabIndex(1, "Enter", 4)).toBeNull();
    expect(nextTabIndex(1, "Tab", 4)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @lodekit/web-main test`
Expected: FAIL — `Cannot find module './tabs'` (or equivalent).

- [ ] **Step 3: Implement `tabs.ts`**

```ts
// web/main/src/lib/tabs.ts
// Keyboard model for a WAI-ARIA tablist. Both axes are handled because the
// rail is vertical on desktop and stacks horizontally-ish on mobile.
export function nextTabIndex(current: number, key: string, count: number): number | null {
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowUp":
    case "ArrowLeft":
      return (current + count - 1) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lodekit/web-main test`
Expected: PASS (tabs + both demo test files).

- [ ] **Step 5: Write `HowItGoes.astro`**

```astro
---
// The loop, user-driven (spec §5.5). The rail always shows all four one-liners;
// numbers are earned here — order is information.
import { MARK_BODIES } from "@lodekit/engine/marks";

const steps = [
  {
    line: "Install one menubar app.",
    copy: "That's the setup. Lodekit brings everything it needs, down to its own Node. No terminal, nothing to configure.",
  },
  {
    line: "Ask your agent for the app you want.",
    copy: "“Something to manage my greenhouse from the weather forecast.” Your agent scaffolds it and wires up the services it needs.",
  },
  {
    line: "Use it in your browser a minute later.",
    copy: "lodekit.localhost/greenhouse — a URL on your machine. Want it different? Ask again; it rebuilds on save.",
  },
  {
    line: "Close the laptop. Come back next month.",
    copy: "Still running. The forecast check fired every morning, and the data is in your folder. That's the keeping.",
  },
];
---

<section class="plate-wash">
  <div class="mx-auto max-w-6xl px-6 py-16 md:py-24">
    <p class="kicker text-muted-foreground">How it goes</p>
    <div class="mt-10 grid gap-10 md:grid-cols-[2fr_3fr]" data-tabs>
      <div role="tablist" aria-label="How it goes" aria-orientation="vertical" class="flex flex-col items-start gap-5">
        {
          steps.map((step, i) => (
            <button
              type="button"
              role="tab"
              id={`hig-tab-${i}`}
              aria-selected={i === 0 ? "true" : "false"}
              aria-controls={`hig-panel-${i}`}
              tabindex={i === 0 ? 0 : -1}
              class="flex items-baseline gap-3 border-b-2 border-transparent pb-1 text-left transition-colors duration-250 [transition-timing-function:var(--ease-drift)] aria-selected:border-ring aria-selected:text-primary"
            >
              <span class="font-mono text-[0.8125rem] font-normal tracking-[0.01em]">{String(i + 1).padStart(2, "0")}</span>
              <span>{step.line}</span>
            </button>
          ))
        }
      </div>
      <div>
        {
          steps.map((step, i) => (
            <div
              role="tabpanel"
              id={`hig-panel-${i}`}
              aria-labelledby={`hig-tab-${i}`}
              hidden={i !== 0}
              class="hig-panel rounded-[8px] border border-border bg-card p-8"
            >
              <svg viewBox="0 0 120 48" class="h-12 text-muted-foreground" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1">
                {i === 0 && (
                  <>
                    <rect x="4" y="14" width="112" height="14" rx="2" />
                    {/* the jar-cloud mark in the menubar — imported, never redrawn */}
                    <svg x="98" y="16" width="10" height="10" viewBox="0 0 32 32" set:html={MARK_BODIES.b} />
                  </>
                )}
                {i === 1 && <path d="M12 10 h72 a4 4 0 0 1 4 4 v14 a4 4 0 0 1-4 4 H32 l-10 8 v-8 h-10 a4 4 0 0 1-4-4 V14 a4 4 0 0 1 4-4Z" />}
                {i === 2 && (
                  <>
                    <rect x="8" y="8" width="104" height="32" rx="3" />
                    <path d="M8 18 h104" />
                    <circle cx="16" cy="13" r="1.5" fill="currentColor" stroke="none" />
                  </>
                )}
                {i === 3 && (
                  <>
                    <path d="M78 12 a12 12 0 1 0 10 18 a10 10 0 0 1-10-18Z" />
                    <path d="M28 32 a8 8 0 0 1 1-15.9 A10 10 0 0 1 48 14 a8 8 0 0 1 6 14Z" fill="var(--color-cloud-slate)" stroke="none" />
                  </>
                )}
              </svg>
              <p class="prose-measure mt-5">
                {i === 2 ? (
                  <>
                    <span class="font-mono text-[0.8125rem] font-normal">lodekit.localhost/greenhouse</span>
                    {" — a URL on your machine. Want it different? Ask again; it rebuilds on save."}
                  </>
                ) : (
                  step.copy
                )}
              </p>
            </div>
          ))
        }
      </div>
    </div>
  </div>
</section>

<style>
  /* opacity-only crossfade: replays whenever a hidden panel is shown */
  .hig-panel:not([hidden]) {
    animation: hig-fade 250ms var(--ease-drift);
  }
  @keyframes hig-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .hig-panel:not([hidden]) {
      animation: none;
    }
  }
</style>

<script>
  import { nextTabIndex } from "../lib/tabs";

  document.querySelectorAll<HTMLElement>("[data-tabs]").forEach((root) => {
    const tabs = [...root.querySelectorAll<HTMLButtonElement>("[role='tab']")];
    const panels = [...root.querySelectorAll<HTMLElement>("[role='tabpanel']")];

    function select(index: number, focus = false) {
      tabs.forEach((tab, i) => {
        tab.setAttribute("aria-selected", String(i === index));
        tab.tabIndex = i === index ? 0 : -1;
      });
      panels.forEach((panel, i) => {
        panel.hidden = i !== index;
      });
      if (focus) tabs[index].focus();
    }

    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => select(i));
      tab.addEventListener("keydown", (e) => {
        const next = nextTabIndex(i, e.key, tabs.length);
        if (next !== null) {
          e.preventDefault();
          select(next, true);
        }
      });
    });
  });
</script>
```

(Step 03's copy renders its URL in the mono data voice — the map-with-exception
keeps the deck verbatim while honoring the type allocation.)

- [ ] **Step 6: Wire, build, commit**

Wire `<HowItGoes />` after `<WhatIs />` in `index.astro`.

Run: `pnpm --filter @lodekit/web-main build && /usr/bin/grep -c 'role="tablist"' web/main/dist/index.html`
Expected: build exit 0; grep = `1`.

```bash
git add web/main/src/lib/tabs.ts web/main/src/lib/tabs.test.ts web/main/src/components/HowItGoes.astro web/main/src/pages/index.astro
git commit -m "feat(web-main): how-it-goes stepper — ARIA tabs on the mid wash"
```

---

### Task 12: `PathsTable`

**Files:**
- Create: `web/main/src/components/PathsTable.astro`
- Modify: `web/main/src/pages/index.astro` (wire after `<HowItGoes />`)

**Acceptance Criteria:**
- Real `<table>` with `<th scope="col">`/`<th scope="row">`; header rules hairline-strong; Lodekit column washed (page-lo) with hairline-strong side borders; brand exemplars once, muted mono, under *hosted builder* and *no-code tool* only.
- Cells verbatim from spec §5.6; data-like values in mono data voice.
- Mobile (`< md`): stacked per-path cards, same content and reading order; no horizontal scroll. Section has **no top rule** (it follows the wash — surface change separates).

- [ ] **Step 1: Write the component**

```astro
---
// Paths, not brands (spec §5.6). Data defined once; rendered twice (table ≥ md,
// stacked cards below). The honesty gate: every non-Lodekit cell stays checkable
// as a statement of the class; "good at" is never weakened.
const rows = ["good at", "storage", "schedules", "accounts", "cost shape", "still yours next year"];
const paths = [
  {
    name: "single file",
    brands: "",
    cells: ["instant and free", "none", "none", "none", "free", "the file, maybe"],
  },
  {
    name: "hosted builder",
    brands: "Lovable · Replit · v0",
    cells: [
      "zero setup, shareable",
      "theirs",
      "on a paid tier",
      "required",
      "subscription",
      "at the vendor's pleasure",
    ],
  },
  {
    name: "no-code tool",
    brands: "Airtable · Notion · Glide",
    cells: [
      "forms and tables, fast",
      "theirs",
      "included, up to a point",
      "required",
      "subscription",
      "behind an export button",
    ],
  },
  {
    name: "Lodekit",
    brands: "",
    cells: [
      "apps that live at home",
      "yours — a real database, local",
      "built-in, local",
      "none",
      "your own hardware",
      "a folder you can copy",
    ],
  },
];
---

<section>
  <div class="mx-auto max-w-6xl px-6 py-16 md:py-24">
    <p class="kicker text-muted-foreground">Lodekit vs</p>
    <h2 class="headline mt-4">Ways to keep an agent-built app.</h2>

    <!-- table (md and up) -->
    <table class="mt-12 hidden w-full border-collapse text-left md:table">
      <thead>
        <tr class="border-b border-hairline-strong dark:border-border">
          <td></td>
          {
            paths.map((path) => (
              <th
                scope="col"
                class:list={[
                  "px-4 py-3 align-top",
                  path.name === "Lodekit" && "border-x border-hairline-strong bg-secondary dark:border-border",
                ]}
              >
                {path.name}
                <span class="block min-h-4 font-mono text-xs font-normal tracking-[0.01em] text-muted-foreground">
                  {path.brands}
                </span>
              </th>
            ))
          }
        </tr>
      </thead>
      <tbody>
        {
          rows.map((label, r) => (
            <tr class="border-b border-border">
              <th scope="row" class="py-3 pr-4 font-medium">
                {label}
              </th>
              {paths.map((path) => (
                <td
                  class:list={[
                    "px-4 py-3 font-mono text-[0.8125rem] font-normal tracking-[0.01em] text-muted-foreground",
                    path.name === "Lodekit" &&
                      "border-x border-hairline-strong bg-secondary text-foreground dark:border-border",
                  ]}
                >
                  {path.cells[r]}
                </td>
              ))}
            </tr>
          ))
        }
      </tbody>
    </table>

    <!-- stacked cards (below md) — same content, same order -->
    <div class="mt-12 space-y-4 md:hidden">
      {
        paths.map((path) => (
          <div
            class:list={[
              "rounded-[5px] border p-6",
              path.name === "Lodekit" ? "border-hairline-strong bg-secondary dark:border-border" : "border-border bg-card",
            ]}
          >
            <h3 class="text-[1.125rem] font-medium">{path.name}</h3>
            {path.brands && (
              <p class="mt-1 font-mono text-xs font-normal tracking-[0.01em] text-muted-foreground">{path.brands}</p>
            )}
            <dl class="mt-4 space-y-2">
              {rows.map((label, r) => (
                <div class="flex justify-between gap-4">
                  <dt class="font-medium">{label}</dt>
                  <dd class="text-right font-mono text-[0.8125rem] font-normal tracking-[0.01em] text-muted-foreground">
                    {path.cells[r]}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))
      }
    </div>
  </div>
</section>
```

- [ ] **Step 2: Wire, build, commit**

Wire `<PathsTable />` after `<HowItGoes />` in `index.astro`.

Run: `pnpm --filter @lodekit/web-main build && /usr/bin/grep -c "at the vendor" web/main/dist/index.html`
Expected: build exit 0; grep = `2` (table + card variants).

```bash
git add web/main/src/components/PathsTable.astro web/main/src/pages/index.astro
git commit -m "feat(web-main): paths table — ways to keep an agent-built app"
```

---

### Task 13: `ManifestoPlate`

**Files:**
- Create: `web/main/src/components/ManifestoPlate.astro`
- Modify: `web/main/src/pages/index.astro` (wire after `<PathsTable />`, before the v2 `<OscillationBand />` — which it will replace in Task 15)

**Acceptance Criteria:**
- Night plate (night-hi in dark theme via Task 2's rule); kicker in parchment; letter verbatim at ~65ch in pale gold; signature line in gold; four pairs verbatim, two-column rows with night-lo rules — *is* in parchment, *could-be* in pale gold.
- Optional corner cloud included (drifting, night-lo) with a code comment noting the visual pass may drop it (spec §12).

- [ ] **Step 1: Write the component**

```astro
---
// The why, as a signed letter on the night plate (spec §5.7) — the page's one
// drenched dark moment. Pairs oscillate is → could-be and end on the gap.
const pairs = [
  ["Renting generic tools that fit almost", "A set of small apps shaped exactly like your life"],
  ["Your data spread across silos you can't open", "Your data in a folder you can copy"],
  ["A subscription per need", "One platform, no meter"],
  ["Scripts that die when you look away", "Apps that are still running, still yours, next year"],
];
---

<section class="plate-night relative overflow-hidden">
  <!-- optional flourish (spec §12): drop in the visual pass if it competes with the hero cloud -->
  <svg
    class="cloud-drift absolute top-10 right-8 w-28 text-night-lo"
    viewBox="0 0 120 60"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M28 52a16 16 0 0 1-2-31.9A22 22 0 0 1 68 14a18 18 0 0 1 24.4 12.7A14 14 0 0 1 90 52Z" />
  </svg>
  <div class="relative mx-auto max-w-6xl px-6 py-16 md:py-20">
    <p class="kicker text-parchment">Why we built Lodekit</p>
    <div class="prose-measure mt-8 space-y-5">
      <p>
        Software finally comes in your size. For the first time, you can describe a tool and have
        it exist by lunch — shaped exactly to your life, no bigger than it needs to be.
      </p>
      <p>
        But the places it can live all belong to someone else. The platforms are rented, the data
        sits in silos, and the meter runs on things you made. The alternative — keeping it
        yourself — has meant becoming your own ops team.
      </p>
      <p>
        We think the tools you ask for should be yours. On your computer, in your folder, in
        formats you can read. Running whether or not anyone is selling you anything.
      </p>
      <p>So we built the home. When software is personal, it should live with you.</p>
      <p class="text-gold">— the Lodekit makers</p>
    </div>
    <dl class="mt-16">
      {
        pairs.map(([is, couldBe]) => (
          <div class="grid gap-2 border-t border-night-lo py-5 md:grid-cols-2 md:gap-8">
            <dt class="text-parchment">{is}</dt>
            <dd class="text-pale-gold">{couldBe}</dd>
          </div>
        ))
      }
    </dl>
  </div>
</section>
```

- [ ] **Step 2: Wire, build, commit**

Run: `pnpm --filter @lodekit/web-main build && /usr/bin/grep -c "the Lodekit makers" web/main/dist/index.html`
Expected: build exit 0; grep ≥ `1`.

```bash
git add web/main/src/components/ManifestoPlate.astro web/main/src/pages/index.astro
git commit -m "feat(web-main): manifesto plate — signed letter + oscillation pairs"
```

---

### Task 14: `CtaBand` + `DevLayer` edits

**Files:**
- Modify: `web/main/src/components/CtaBand.astro` (full rewrite below)
- Modify: `web/main/src/components/DevLayer.astro` (full rewrite below)

**Interfaces:**
- Consumes: `DownloadCta` (Task 3), `DOCS_URL`/`GITHUB_URL`, `.nav-link`.

**Acceptance Criteria:**
- CTA band: headline + new sub-line verbatim (spec §5.8), centered `DownloadCta`; no email form, nothing else on the plate.
- DevLayer: copy unchanged, paragraph at 400 weight; two arrow links (docs, GitHub); **no top rule** (follows the ochre plate).

- [ ] **Step 1: Rewrite `CtaBand.astro`**

```astro
---
import DownloadCta from "./DownloadCta.astro";
---

<section class="plate-ochre">
  <div class="mx-auto max-w-2xl px-6 py-16 text-center md:py-20">
    <h2 class="headline">Give your apps a home.</h2>
    <p class="mx-auto mt-4 max-w-prose">
      The alpha ships soon, macOS first. The docs are ready when you are.
    </p>
    <div class="mt-8">
      <DownloadCta id="cta" center />
    </div>
  </div>
</section>
```

- [ ] **Step 2: Rewrite `DevLayer.astro`**

```astro
---
import { DOCS_URL, GITHUB_URL } from "../lib/links";
---

<section>
  <div class="mx-auto max-w-6xl px-6 py-10">
    <p class="kicker text-muted-foreground">For the curious</p>
    <p class="prose-measure mt-3 text-[0.9375rem] font-normal text-muted-foreground">
      Under the hood: a single Node engine hosting TanStack Start apps in per-app workers. SQLite
      per app. shadcn/ui components under one shared theme. Agent-driven over MCP. Buildless — the
      platform owns the toolchain, down to its own pinned Node.
    </p>
    <div class="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
      <a class="nav-link" href={DOCS_URL}>Read the architecture →</a>
      <a class="nav-link" href={GITHUB_URL} target="_blank" rel="noopener">Source on GitHub →</a>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Build, check, commit**

Run: `pnpm --filter @lodekit/web-main build && /usr/bin/grep -c "docs are ready when you are" web/main/dist/index.html`
Expected: build exit 0; grep = `1`; `aria-disabled` now appears twice in dist.

```bash
git add web/main/src/components/CtaBand.astro web/main/src/components/DevLayer.astro
git commit -m "feat(web-main): CTA band + dev layer — download pair, docs/github links"
```

---

### Task 15: Final recomposition + retirements

**Files:**
- Modify: `web/main/src/pages/index.astro` (final composition below)
- Delete: `web/main/src/components/NotifyForm.astro`, `LoopStrip.astro`, `Pillar.astro`, `ServiceChips.astro`, `OscillationBand.astro`, `FileTreePrint.astro`
- Modify: `web/main/src/styles/globals.css` (remove now-unused `.field` rules)

**Acceptance Criteria:**
- `index.astro` composes exactly the §3 architecture order; v2 sections gone.
- The six retired component files are deleted; no references remain (`grep` = 0).
- `.field` and `.plate-ochre .field*` rules removed from `globals.css` (NotifyForm was their only consumer).
- Build passes; all tests green.

- [ ] **Step 1: Final `index.astro`**

```astro
---
import Base from "../layouts/Base.astro";
import Header from "../components/Header.astro";
import Hero from "../components/Hero.astro";
import ProblemBeats from "../components/ProblemBeats.astro";
import FitChecklist from "../components/FitChecklist.astro";
import WhatIs from "../components/WhatIs.astro";
import HowItGoes from "../components/HowItGoes.astro";
import PathsTable from "../components/PathsTable.astro";
import ManifestoPlate from "../components/ManifestoPlate.astro";
import CtaBand from "../components/CtaBand.astro";
import DevLayer from "../components/DevLayer.astro";
import Footer from "../components/Footer.astro";
---

<Base>
  <Header />
  <main>
    <Hero />
    <ProblemBeats />
    <FitChecklist />
    <WhatIs />
    <HowItGoes />
    <PathsTable />
    <ManifestoPlate />
    <CtaBand />
    <DevLayer />
  </main>
  <Footer />
</Base>
```

- [ ] **Step 2: Delete the retired components**

```bash
git rm web/main/src/components/NotifyForm.astro web/main/src/components/LoopStrip.astro web/main/src/components/Pillar.astro web/main/src/components/ServiceChips.astro web/main/src/components/OscillationBand.astro web/main/src/components/FileTreePrint.astro
```

- [ ] **Step 3: Remove dead CSS**

In `globals.css`, delete the `.field`, `.field::placeholder`,
`.field:focus-visible`, `.plate-ochre .field`, `.plate-ochre .field::placeholder`,
and `.plate-ochre .field:focus-visible` blocks (NotifyForm was their only
consumer). Leave everything else.

- [ ] **Step 4: Verify no dangling references**

Run: `/usr/bin/grep -rn "NotifyForm\|LoopStrip\|Pillar\|ServiceChips\|OscillationBand\|FileTreePrint" web/main/src ; echo "exit: $?"`
Expected: no matches, `exit: 1`.

- [ ] **Step 5: Build, test, commit**

Run: `pnpm --filter @lodekit/web-main build && pnpm --filter @lodekit/web-main test`
Expected: both exit 0.

```bash
git add -A web/main/src
git commit -m "feat(web-main): v3 recomposition — retire v2 sections and email capture"
```

---

### Task 16: Verification sweep + PR prep

**Files:**
- None created; read-only checks + PR body.

**Acceptance Criteria:**
- Every spec §10 machine-checkable item verified with evidence; the human visual-pass checklist is written into the PR body's Test plan.

- [ ] **Step 1: Full build + tests**

Run: `pnpm --filter @lodekit/web-main build && pnpm --filter @lodekit/web-main test`
Expected: exit 0; demo tests unmodified (`git log --oneline -- web/main/src/components/demo/script.test.ts web/main/src/components/demo/timeline.test.ts` shows no commits from this branch).

- [ ] **Step 2: Built-page assertions**

```bash
cd web/main
/usr/bin/grep -c 'aria-disabled="true"' dist/index.html          # expect 2
/usr/bin/grep -c 'role="tooltip"' dist/index.html                # expect 2
/usr/bin/grep -c 'https://docs.lodekit.com' dist/index.html      # expect ≥ 5 (header, hero, band, dev layer, footer)
/usr/bin/grep -c 'github.com/lodekit/lodekit' dist/index.html    # expect ≥ 3 (header, dev layer, footer)
/usr/bin/grep -c 'rel="noopener"' dist/index.html                # expect ≥ 3
/usr/bin/grep -c 'role="tablist"' dist/index.html                # expect 1
/usr/bin/grep -c 'type="email"' dist/index.html                  # expect 0
```

- [ ] **Step 3: Write the PR body**

Sections per repo convention — **Summary** (v3 rebuild: sections, visual layer,
download CTA per ADR-0007, unflagged links), **Notes** (dark-scheme demo accent
is a lightened print-blue derivative; `WhatIs` wrapper is a composition detail;
manifesto corner cloud is droppable; any copy deviations listed here), **Test
plan** with the machine checks above plus the human visual pass:

```markdown
- [ ] Both themes × mobile/tablet/desktop, every section inspected
- [ ] Tooltip: hover, keyboard focus, Escape; touch fallback (chip/sub-line visible)
- [ ] Disabled Download: no navigation, announced disabled (VoiceOver spot check)
- [ ] Stepper: arrow keys + Home/End wrap, panels crossfade, reduced-motion instant
- [ ] Focus edges ring-free in both themes (tab through the whole page)
- [ ] Reduced motion: clouds stop, entrance fades, demo rests
- [ ] Paths table on mobile: stacked cards, no horizontal scroll
- [ ] Manifesto plate distinct from the page in dark theme (night-hi)
- [ ] AA spot checks: wash-band text, demo window grays (both schemes), tooltip, table wash
- [ ] The anti-default line (§4) holds — nothing reads as generic cream-and-terracotta SaaS
```

- [ ] **Step 4: Push the branch and raise the PR** (merging is the person's call — raise and stop.)

```bash
git push -u origin HEAD
gh pr create --title "feat(web-main): landing page v3 — telling sections, visual layer, download CTA" --body-file <the PR body>
```
