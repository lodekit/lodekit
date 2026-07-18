# Landing Page v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** Replace the placeholder landing page with the full PRODUCT.md §8 landing — hero, five pillars, oscillation band, developer layer, mock email capture — rendered in DESIGN.md's woodblock-print identity.

**Architecture:** Static Astro page in `web/main`; all sections are server-rendered `.astro` components with zero hydration except the existing `ThemeToggle` React island and one inline vanilla script for the email mock. Identity flows through CSS custom properties in `globals.css` (parchment + night plates); the jar-cloud mark is imported from `@lodekit/engine/marks` (new one-line exports entry).

**Tech Stack:** Astro 7, Tailwind v4 (`@tailwindcss/vite`), React 19 (one island), `@fontsource` self-hosted fonts.

**Spec:** `docs/specs/2026-07-18-landing-page-v2-design.md` — the copy in that spec is the content contract; it is repeated verbatim in Task 8.

## Global Constraints

- **No external links anywhere** — no GitHub, no docs, no social. The only action is the email field, and it is a **visual mock**: no network call, nothing stored.
- **Motion:** one easing curve `--ease-drift: cubic-bezier(.22,1,.36,1)`; a single CSS-only hero entrance ≤800ms (80ms stagger, 450ms per element); ambient motion = cloud drift only (`linear` allowed only there); **nothing animates on scroll**; full `prefers-reduced-motion` fallback (opacity-only ~150ms, no drift).
- **Caps budget:** uppercase only in mono kickers/chips and the wordmark (via CSS `text-transform`, source text stays sentence case). Mono never sets running text.
- **Color:** DESIGN.md hex values only (§2). Committed plates (`.plate-night`, `.plate-ochre`) use fixed physical colors and do not flip with the theme. No gray-on-color: muted text on plates = `opacity-75` of the plate ink. Sky family never on interactive elements.
- **Contrast:** AA minimum; plum ink on ochre (#251B25/#DD9741 ≈ 6.9:1) is the only new pair — keep it.
- **Copy:** verbatim from the spec (trims for rhythm fine; rewrites not). Canonical terms per `docs/CONTEXT.md`. No open-source/licensing claims. No pricing language.
- **Verification:** `@lodekit/web-main` has no test suite (repo convention). Every task's check is `pnpm --filter @lodekit/web-main build` passing plus the stated dev-server smoke. Run dev with `pnpm --filter @lodekit/web-main dev` (serves on http://localhost:4321).
- **Commits:** conventional prefix, bead id in message, no `Co-Authored-By` trailers.
- **Note (plan-level refinement of the spec):** `NotifyForm` uses native `<input>`/`<button>` with brand classes (`.field`, `.btn-primary`) instead of the shadcn React `Input`/`Button` — DESIGN.md's exact state set (night-sheet hover crossfade, outline-not-ring focus) is cleaner as dedicated CSS than overriding cva defaults through class merges. The React primitives stay: `Button` is used by `ThemeToggle`; `input.tsx` remains as a kept scaffold primitive.

---

### Task 1: Foundation — mark export + dependencies

**Files:**
- Modify: `packages/engine/package.json` (exports map)
- Modify: `web/main/package.json` (dependencies)
- Modify: `web/main/astro.config.mjs` (ssr.noExternal)

**Interfaces:**
- Produces: `@lodekit/engine/marks` importable from `web/main` source (named exports `MARK_BODIES: Record<"a"|"b"|"c", string>`, `markFaviconSvg`, `emojiFaviconSvg`); fontsource CSS paths `@fontsource/zen-kaku-gothic-new/{400,500,700}.css`, `@fontsource/spline-sans-mono/{400,500}.css`.

**Acceptance Criteria:**
- `pnpm install` succeeds from repo root.
- `pnpm --filter @lodekit/web-main build` passes with a temporary import of `MARK_BODIES` proving resolution (removed again before commit).
- Engine tests still pass (`pnpm --filter @lodekit/engine test`) — the exports change is additive.

- [ ] **Step 1: Add the marks export to the engine**

In `packages/engine/package.json`, add one line to `exports` (after `"./config"`):

```json
    "./marks": "./src/marks.ts",
```

- [ ] **Step 2: Add web-main dependencies**

In `web/main/package.json`, add to `dependencies`:

```json
    "@fontsource/spline-sans-mono": "^5.0.0",
    "@fontsource/zen-kaku-gothic-new": "^5.0.0",
```

and add a `devDependencies` entry:

```json
    "@lodekit/engine": "workspace:*",
```

(keep existing devDependencies; JSON keys sorted like the file's current style).

- [ ] **Step 3: Teach Vite to compile the engine's TS source in SSR**

Replace `web/main/astro.config.mjs` contents with:

```js
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    // @lodekit/engine ships raw .ts (buildless); bundle it instead of
    // externalizing so the static build can compile marks.ts.
    ssr: { noExternal: ["@lodekit/engine"] },
  },
});
```

- [ ] **Step 4: Install and verify resolution**

Run: `pnpm install`
Expected: completes without errors (workspace link, two fontsource packages).

Temporarily add to the top of `web/main/src/pages/index.astro` frontmatter:

```ts
import { MARK_BODIES } from "@lodekit/engine/marks";
console.log(Object.keys(MARK_BODIES));
```

Run: `pnpm --filter @lodekit/web-main build`
Expected: build succeeds, log line `[ 'a', 'b', 'c' ]` appears during prerender. **Remove the two temporary lines.**

Run: `pnpm --filter @lodekit/engine test`
Expected: PASS (unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/package.json web/main/package.json web/main/astro.config.mjs pnpm-lock.yaml
git commit -m "feat(web-main): foundation for landing v2 — marks export, fonts, engine TS in SSR (<task-bead-id>)"
```

---

### Task 2: The retheme — globals.css, fonts, meta, favicon

**Files:**
- Modify: `web/main/src/styles/globals.css` (full rewrite)
- Modify: `web/main/src/layouts/Base.astro`
- Create: `web/main/public/favicon.svg`

**Interfaces:**
- Consumes: fontsource CSS paths from Task 1.
- Produces (used by every later task): shadcn-named theme tokens (`--background`, `--foreground`, `--primary`, `--border`, `--ring`, …) now carrying DESIGN.md values in light and `.dark`; brand utilities `bg-paper-hi`, `bg-paper-lo`, `text-parchment`, `border-hairline`, `bg-night`, `bg-night-hi`, `bg-night-lo`, `text-pale-gold`, `bg-ochre`, `text-print-blue`, `text-cloud-slate`, `text-clay-rose`, `text-slate-ink`, `text-rust`; classes `.kicker`, `.display`, `.headline`, `.prose-measure`, `.chip`, `.field`, `.btn-primary`, `.plate-night`, `.plate-ochre`, `.enter`, `.drift-x`, `.drift-y`; easing var `--ease-drift`; illustration vars `--ill-line`, `--ill-sky-deep`, `--ill-sky-soft`, `--ill-cloud`, `--ill-sun`, `--ill-ground`.

**Acceptance Criteria:**
- Build passes; dev serves the (old) placeholder page re-skinned: parchment page, plum ink text, rust button; toggling theme shows indigo page with pale-gold text, no flash on reload.
- Tab title reads `Lodekit — the local platform for agent-built apps`; favicon shows the jar-cloud mark (plum in light OS theme, pale gold in dark).

- [ ] **Step 1: Rewrite `web/main/src/styles/globals.css`**

```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

/*
 * Lodekit landing theme — "The Sky in a Jar" (docs/DESIGN.md).
 * Light = parchment plate; .dark = night plate. Physical colors
 * (--ink, --night, --ochre, --pale-gold, …) never flip; the shadcn-named
 * role tokens below them do.
 */
:root {
  /* physical palette (DESIGN.md §2) */
  --ink: #251b25;
  --paper: #ede7d8;
  --paper-hi: #f6f1e6;
  --paper-lo: #dcd3be;
  --slate-ink: #4f4f59;
  --hairline: #cdc4ae;
  --hairline-strong: #ab9f86;
  --rust: #935842;
  --rust-deep: #7c4636;
  --ochre: #dd9741;
  --ochre-bright: #e5a85c;
  --night: #121a44;
  --night-hi: #1b2452;
  --night-lo: #242e63;
  --pale-gold: #f3e0a5;
  --parchment: #c6bba8;
  --print-blue: #4b5d91;
  --cloud-slate: #8394a9;
  --clay-rose: #ab9184;

  /* role tokens — light plate */
  --background: var(--paper);
  --foreground: var(--ink);
  --card: var(--paper-hi);
  --card-foreground: var(--ink);
  --popover: var(--paper-hi);
  --popover-foreground: var(--ink);
  --primary: var(--rust);
  --primary-foreground: var(--paper-hi);
  --secondary: var(--paper-lo);
  --secondary-foreground: var(--ink);
  --muted: var(--paper-lo);
  --muted-foreground: var(--slate-ink);
  --accent: var(--paper-lo);
  --accent-foreground: var(--ink);
  --destructive: #a61e33;
  --destructive-foreground: var(--paper-hi);
  --border: var(--hairline);
  --input: var(--hairline);
  --ring: var(--rust);
  --radius: 5px;

  /* the one curve (DESIGN.md §5) */
  --ease-drift: cubic-bezier(0.22, 1, 0.36, 1);

  /* illustration plate — recolored wholesale by .dark below */
  --ill-line: var(--ink);
  --ill-sky-deep: var(--print-blue);
  --ill-sky-soft: var(--cloud-slate);
  --ill-cloud: var(--paper-hi);
  --ill-sun: var(--ochre);
  --ill-ground: var(--clay-rose);
}

.dark {
  --background: var(--night);
  --foreground: var(--pale-gold);
  --card: var(--night-hi);
  --card-foreground: var(--pale-gold);
  --popover: var(--night-hi);
  --popover-foreground: var(--pale-gold);
  --primary: var(--ochre);
  --primary-foreground: var(--night);
  --secondary: var(--night-lo);
  --secondary-foreground: var(--pale-gold);
  --muted: var(--night-lo);
  --muted-foreground: var(--parchment);
  --accent: var(--night-lo);
  --accent-foreground: var(--pale-gold);
  --destructive: #a61e33;
  --destructive-foreground: var(--pale-gold);
  --border: var(--night-lo);
  --input: var(--night-lo);
  --ring: var(--ochre);

  --ill-line: var(--pale-gold);
  --ill-sky-deep: var(--night-lo);
  --ill-sky-soft: var(--night-hi);
  --ill-cloud: var(--parchment);
  --ill-sun: var(--ochre);
  --ill-ground: var(--night-hi);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-ink: var(--ink);
  --color-paper: var(--paper);
  --color-paper-hi: var(--paper-hi);
  --color-paper-lo: var(--paper-lo);
  --color-slate-ink: var(--slate-ink);
  --color-hairline: var(--hairline);
  --color-hairline-strong: var(--hairline-strong);
  --color-rust: var(--rust);
  --color-rust-deep: var(--rust-deep);
  --color-ochre: var(--ochre);
  --color-ochre-bright: var(--ochre-bright);
  --color-night: var(--night);
  --color-night-hi: var(--night-hi);
  --color-night-lo: var(--night-lo);
  --color-pale-gold: var(--pale-gold);
  --color-parchment: var(--parchment);
  --color-print-blue: var(--print-blue);
  --color-cloud-slate: var(--cloud-slate);
  --color-clay-rose: var(--clay-rose);
  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);
  --font-sans: "Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", system-ui, sans-serif;
  --font-mono: "Spline Sans Mono", ui-monospace, monospace;
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background font-sans text-foreground;
    line-height: 1.6;
  }
  ::selection {
    background: var(--rust);
    color: var(--paper-hi);
  }
  .dark ::selection {
    background: var(--ochre);
    color: var(--night);
  }
}

@layer components {
  /* type scale (DESIGN.md §3) */
  .display {
    font-weight: 700;
    font-size: clamp(2.7rem, 6.4vw, 5rem);
    line-height: 1.05;
    letter-spacing: -0.022em;
    text-wrap: balance;
  }
  .headline {
    font-weight: 700;
    font-size: clamp(1.8rem, 3.6vw, 2.6rem);
    line-height: 1.15;
    letter-spacing: -0.015em;
    text-wrap: balance;
  }
  .kicker {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1.2;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .prose-measure {
    max-width: 65ch;
  }

  /* chips — mono kicker voice on a recessed wash (DESIGN.md §5) */
  .chip {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    background: var(--secondary);
    color: var(--secondary-foreground);
    border-radius: 3px;
    padding: 0.35em 0.7em;
  }

  /* form field (DESIGN.md §5 inputs) */
  .field {
    background: var(--card);
    color: var(--card-foreground);
    border: 1px solid var(--input);
    border-radius: 3px;
    padding: 0.6em 0.9em;
    font-size: 0.95rem;
    width: 100%;
    transition: border-color 200ms var(--ease-drift);
  }
  .field::placeholder {
    color: var(--muted-foreground);
  }
  .field:focus-visible {
    border-color: var(--foreground);
    outline: 2px solid var(--ring);
    outline-offset: 3px;
  }

  /* primary button — brand hover crossfades the night sheet (DESIGN.md §5) */
  .btn-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--primary);
    color: var(--primary-foreground);
    border-radius: 3px;
    padding: 0.85em 1.5em;
    font-size: 0.95rem;
    font-weight: 500;
    white-space: nowrap;
    transition:
      background-color 250ms var(--ease-drift),
      color 250ms var(--ease-drift),
      transform 100ms var(--ease-drift);
  }
  .btn-primary:hover {
    background: var(--night);
    color: var(--pale-gold);
  }
  .dark .btn-primary:hover {
    background: var(--pale-gold);
    color: var(--night);
  }
  .btn-primary:active {
    transform: translateY(1px);
  }
  .btn-primary:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 3px;
  }
  .btn-primary:disabled {
    opacity: 0.5;
    pointer-events: none;
  }
  /* on the ochre plate the night sheet still reads; keep as-is */

  /* committed plates — fixed physical colors, never flip with theme */
  .plate-night {
    background: var(--night);
    color: var(--pale-gold);
  }
  .plate-ochre {
    background: var(--ochre);
    color: var(--ink);
  }
  .plate-ochre .field {
    background: var(--paper-hi);
    color: var(--ink);
    border-color: var(--hairline-strong);
  }
  .plate-ochre .field::placeholder {
    color: var(--slate-ink);
  }
  .plate-ochre .btn-primary {
    background: var(--rust);
    color: var(--paper-hi);
  }
  .plate-ochre .btn-primary:hover {
    background: var(--night);
    color: var(--pale-gold);
  }
  .plate-ochre :focus-visible {
    outline-color: var(--ink);
  }
}

/* ——— motion (DESIGN.md §5): one entrance, and only clouds drift ——— */

@keyframes enter-up {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes enter-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.enter {
  animation: enter-up 450ms var(--ease-drift) both;
  animation-delay: var(--stagger, 0ms);
}

/* linear is permitted solely inside the cloud-drift loop (constant speed is the point) */
@keyframes drift-x {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(7px);
  }
}
@keyframes drift-y {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-5px);
  }
}
.drift-x {
  animation: drift-x 21s linear infinite alternate;
}
.drift-y {
  animation: drift-y 33s linear infinite alternate;
}

@media (prefers-reduced-motion: reduce) {
  .enter {
    animation: enter-fade 150ms var(--ease-drift) both;
    animation-delay: 0ms;
  }
  .drift-x,
  .drift-y {
    animation: none;
  }
}
```

- [ ] **Step 2: Update `web/main/src/layouts/Base.astro`**

```astro
---
import "../styles/globals.css";
import "@fontsource/zen-kaku-gothic-new/400.css";
import "@fontsource/zen-kaku-gothic-new/500.css";
import "@fontsource/zen-kaku-gothic-new/700.css";
import "@fontsource/spline-sans-mono/400.css";
import "@fontsource/spline-sans-mono/500.css";

const title = "Lodekit — the local platform for agent-built apps";
const description =
  "Everything your apps need from a cloud — database, files, secrets, scheduled tasks — on the one computer you already own. Your agent builds; Lodekit runs and keeps. Coming soon.";
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:type" content="website" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <script is:inline>
      // No-flash theme: set the .dark class before first paint.
      let stored;
      try {
        stored = localStorage.getItem("theme");
      } catch {
        stored = null;
      }
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const dark = stored ? stored === "dark" : prefersDark;
      document.documentElement.classList.toggle("dark", dark);
    </script>
  </head>
  <body class="min-h-screen bg-background text-foreground antialiased">
    <slot />
  </body>
</html>
```

(The no-flash script is byte-identical to the current one — do not touch it.)

- [ ] **Step 3: Create `web/main/public/favicon.svg`**

Body copied verbatim from `packages/engine/src/marks.ts` `MARK_BODIES.b` (knockout); colors per DESIGN.md §5 (plum ink, pale gold at night):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><!-- shapes generated from packages/engine/src/marks.ts (MARK_BODIES.b) — regenerate there, don't edit here --><style>svg{color:#251B25}@media(prefers-color-scheme:dark){svg{color:#F3E0A5}}</style><path fill="currentColor" d="M10.4 8.6 L9.9 4.6 C9.77 3.6 10.5 3 11.4 3 L20.6 3 C21.5 3 22.23 3.6 22.1 4.6 L21.6 8.6 Z"/><rect fill="currentColor" x="9" y="8.6" width="14" height="2.9" rx="1.45"/><path fill="currentColor" fill-rule="evenodd" d="M10 11.5 L22 11.5 C24.2 11.6 25.8 11.9 26.7 12.6 C27.9 13.5 28.5 14.8 28.5 16.5 L28.5 25.5 C28.5 28.8 26.3 30.5 22.7 30.5 L9.3 30.5 C5.7 30.5 3.5 28.8 3.5 25.5 L3.5 16.5 C3.5 14.8 4.1 13.5 5.3 12.6 C6.2 11.9 7.8 11.6 10 11.5 Z M21.733 20.031 C21.203 17.34 18.839 15.32 16 15.32 C13.746 15.32 11.788 16.599 10.813 18.471 C8.465 18.721 6.64 20.71 6.64 23.12 C6.64 25.702 8.738 27.8 11.32 27.8 L21.46 27.8 C23.613 27.8 25.36 26.053 25.36 23.9 C25.36 21.841 23.761 20.172 21.733 20.031 Z"/></svg>
```

- [ ] **Step 4: Build + smoke**

Run: `pnpm --filter @lodekit/web-main build`
Expected: PASS.

Run dev, open http://localhost:4321: placeholder page now parchment/plum; toggle → indigo/pale-gold, persists on reload without flash; tab shows new title + mark favicon.

- [ ] **Step 5: Commit**

```bash
git add web/main/src/styles/globals.css web/main/src/layouts/Base.astro web/main/public/favicon.svg
git commit -m "feat(web-main): retheme to the print identity — parchment/night plates, fonts, favicon (<task-bead-id>)"
```

---

### Task 3: Chrome — Lockup, Header, Footer

**Files:**
- Create: `web/main/src/components/Lockup.astro`
- Create: `web/main/src/components/Header.astro`
- Create: `web/main/src/components/Footer.astro`
- Modify: `web/main/src/components/ThemeToggle.tsx` (focus outline only)

**Interfaces:**
- Consumes: `MARK_BODIES` from `@lodekit/engine/marks` (Task 1); tokens/classes from Task 2.
- Produces: `<Lockup />` (optional prop `class`), `<Header />`, `<Footer />` — all static, no props required.

**Acceptance Criteria:**
- Header: lockup left (mark + LODEKIT wordmark, 0.22em tracking), theme toggle right, hairline bottom border.
- Footer: lockup + "macOS only, for now. · © 2026 Lodekit", hairline top border, **no links**.
- Toggle focus state is a 2px accent outline offset 3px (not a translucent ring).

- [ ] **Step 1: Create `web/main/src/components/Lockup.astro`**

```astro
---
import { MARK_BODIES } from "@lodekit/engine/marks";

interface Props {
  class?: string;
}
const { class: className = "" } = Astro.props;
---

<span class:list={["inline-flex items-center gap-[0.6em]", className]}>
  <svg viewBox="0 0 32 32" class="size-6 shrink-0" aria-hidden="true" set:html={MARK_BODIES.b} />
  <span class="text-[1.1rem] leading-none font-bold tracking-[0.22em] uppercase">Lodekit</span>
</span>
```

- [ ] **Step 2: Create `web/main/src/components/Header.astro`**

```astro
---
import Lockup from "./Lockup.astro";
import { ThemeToggle } from "./ThemeToggle";
---

<header class="border-b border-border">
  <div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
    <Lockup />
    <ThemeToggle client:load />
  </div>
</header>
```

- [ ] **Step 3: Create `web/main/src/components/Footer.astro`**

```astro
---
import Lockup from "./Lockup.astro";
---

<footer class="border-t border-border">
  <div
    class="mx-auto flex max-w-6xl flex-col items-start gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between"
  >
    <Lockup class="opacity-80" />
    <p class="text-sm text-muted-foreground">macOS only, for now. · © 2026 Lodekit</p>
  </div>
</footer>
```

- [ ] **Step 4: Fix the toggle's focus treatment**

In `web/main/src/components/ThemeToggle.tsx`, add a `className` to the `<Button>` (outline, not glow — DESIGN.md §5):

```tsx
    <Button
      variant="outline"
      size="icon"
      className="focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-ring"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
```

- [ ] **Step 5: Build + smoke**

Temporarily render `<Header />` and `<Footer />` in `index.astro` above/below the existing main (imports + two tags), run `pnpm --filter @lodekit/web-main build` (expected: PASS), check in dev: lockup renders with the jar-cloud mark, keyboard-focus on the toggle shows the outline. **Keep the temporary composition** — Task 8 replaces the page wholesale anyway.

- [ ] **Step 6: Commit**

```bash
git add web/main/src/components/Lockup.astro web/main/src/components/Header.astro web/main/src/components/Footer.astro web/main/src/components/ThemeToggle.tsx web/main/src/pages/index.astro
git commit -m "feat(web-main): chrome — lockup from engine marks, header, footer (<task-bead-id>)"
```

---

### Task 4: NotifyForm — the email mock

**Files:**
- Create: `web/main/src/components/NotifyForm.astro`

**Interfaces:**
- Consumes: `.field`, `.btn-primary` from Task 2.
- Produces: `<NotifyForm id="..." />` — `id: string` prop (unique per instance, used for the input's `id`/`label` pairing). Renders form + microcopy + hidden `role="status"` confirmation; one deduped inline script drives all instances.

**Acceptance Criteria:**
- Submit with a valid email: no network request (check dev tools), form + microcopy hide, confirmation "Noted. One email when the alpha ships." appears; reload resets.
- Submit empty/invalid: native browser validation blocks (input is `type="email" required`), nothing hides.
- The input has an associated `<label>` (sr-only); the confirmation is announced (`role="status"`).

- [ ] **Step 1: Create `web/main/src/components/NotifyForm.astro`**

```astro
---
interface Props {
  id: string;
}
const { id } = Astro.props;
---

<div data-notify-root>
  <form class="flex w-full max-w-md gap-2" data-notify-form>
    <label class="sr-only" for={`${id}-email`}>Email address</label>
    <input
      id={`${id}-email`}
      class="field flex-1"
      type="email"
      name="email"
      required
      placeholder="you@example.com"
      autocomplete="email"
    />
    <button class="btn-primary" type="submit">Notify me</button>
  </form>
  <p class="mt-3 text-sm opacity-75" data-notify-note>One email when the alpha ships. Nothing else.</p>
  <p class="mt-3 text-sm font-medium" role="status" data-notify-done hidden>
    Noted. One email when the alpha ships.
  </p>
</div>

<script>
  // Mock capture (spec: visual UI only) — no network call, nothing stored;
  // a reload resets. Real wiring is a later slice.
  document.querySelectorAll<HTMLElement>("[data-notify-root]").forEach((root) => {
    const form = root.querySelector<HTMLFormElement>("[data-notify-form]");
    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      form.hidden = true;
      root.querySelector<HTMLElement>("[data-notify-note]")!.hidden = true;
      root.querySelector<HTMLElement>("[data-notify-done]")!.hidden = false;
    });
  });
</script>
```

(Microcopy uses `opacity-75` of the inherited ink, not gray, so it stays legible on the ochre plate — never gray on color.)

- [ ] **Step 2: Build + smoke**

Temporarily add `<NotifyForm id="try" />` to `index.astro` (import + tag), `pnpm --filter @lodekit/web-main build` (expected: PASS). In dev: invalid email → native validation bubble; valid email + submit → confirmation swaps in, network tab silent; reload resets. Remove the temporary usage afterward or leave for Task 8's rewrite — either is fine since Task 8 replaces the file.

- [ ] **Step 3: Commit**

```bash
git add web/main/src/components/NotifyForm.astro web/main/src/pages/index.astro
git commit -m "feat(web-main): notify form — mock email capture with status announcement (<task-bead-id>)"
```

---

### Task 5: Hero — JarIllustration + Hero with entrance

**Files:**
- Create: `web/main/src/components/JarIllustration.astro`
- Create: `web/main/src/components/Hero.astro`

**Interfaces:**
- Consumes: `<NotifyForm id="hero" />` (Task 4); `.enter`/`--stagger`, `.drift-x`/`.drift-y`, `--ill-*` vars, `.display`, `.kicker`, `.chip` (Task 2).
- Produces: `<Hero />`, `<JarIllustration />` (no props).

**Acceptance Criteria:**
- Entrance: kicker → headline → subhead+tagline → form+chip → illustration, 80ms steps, each 450ms, total ≤800ms; runs once on load; below-fold sections never animate.
- Two escaped clouds drift on mismatched two-axis periods (21/33s and 27/17s); jar, sun, bands are static; reduced-motion stops drift and replaces entrance with 150ms fades.
- Illustration recolors correctly in dark mode (pale-gold linework on indigo); flat fills only, no gradients.
- Hero collapses to one column below `lg`; no horizontal overflow at 360px.

- [ ] **Step 1: Create `web/main/src/components/JarIllustration.astro`**

```astro
---
// The Sky in a Jar — flat woodblock-style composition (DESIGN.md §1).
// A new illustration, not the mark: the mark stays in the lockup/favicon.
// All fills are CSS vars so the night plate recolors the same geometry.
---

<svg
  viewBox="0 0 520 520"
  class="h-auto w-full max-w-[480px]"
  role="img"
  aria-labelledby="jar-ill-title"
>
  <title id="jar-ill-title">A piece of sky kept in a mason jar, clouds drifting around it.</title>

  <defs>
    <clipPath id="jar-glass">
      <path
        d="M170 150 C140 154 122 172 122 210 L122 408 C122 448 150 470 196 470 L304 470 C350 470 378 448 378 408 L378 210 C378 172 360 154 330 150 Z"
      ></path>
    </clipPath>
    <path
      id="jar-cloud-shape"
      d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"
    ></path>
  </defs>

  <!-- sun -->
  <circle cx="452" cy="96" r="36" fill="var(--ill-sun)"></circle>

  <!-- escaped clouds — the only things in this world that move -->
  <g class="drift-x">
    <g class="drift-y">
      <use href="#jar-cloud-shape" transform="translate(18 118) scale(3.4)" fill="var(--ill-sky-soft)"></use>
    </g>
  </g>
  <g class="drift-x" style="animation-duration: 27s;">
    <g class="drift-y" style="animation-duration: 17s;">
      <use href="#jar-cloud-shape" transform="translate(398 214) scale(2.3)" fill="var(--ill-sky-soft)"></use>
    </g>
  </g>

  <!-- ground -->
  <ellipse cx="250" cy="474" rx="152" ry="13" fill="var(--ill-ground)" opacity="0.55"></ellipse>
  <line x1="36" y1="488" x2="484" y2="488" stroke="var(--ill-line)" stroke-width="1" opacity="0.35"></line>

  <!-- the sky, kept -->
  <g clip-path="url(#jar-glass)">
    <rect x="122" y="150" width="256" height="112" fill="var(--ill-sky-deep)"></rect>
    <rect x="122" y="262" width="256" height="208" fill="var(--ill-sky-soft)"></rect>
    <use href="#jar-cloud-shape" transform="translate(166 262) scale(7)" fill="var(--ill-cloud)"></use>
  </g>

  <!-- jar outline over the sky -->
  <path
    d="M170 150 C140 154 122 172 122 210 L122 408 C122 448 150 470 196 470 L304 470 C350 470 378 448 378 408 L378 210 C378 172 360 154 330 150"
    fill="none"
    stroke="var(--ill-line)"
    stroke-width="3"
    stroke-linecap="round"
  ></path>

  <!-- lid -->
  <path
    d="M186 150 L180 108 C178 96 186 88 198 88 L302 88 C314 88 322 96 320 108 L314 150 Z"
    fill="var(--ill-line)"
  ></path>
  <rect x="172" y="146" width="156" height="22" rx="11" fill="var(--ill-line)"></rect>
</svg>
```

- [ ] **Step 2: Create `web/main/src/components/Hero.astro`**

```astro
---
import NotifyForm from "./NotifyForm.astro";
import JarIllustration from "./JarIllustration.astro";
---

<section class="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-16 md:py-24 lg:grid-cols-[1.15fr_1fr]">
  <div>
    <p class="kicker text-muted-foreground enter" style="--stagger: 0ms">
      The local platform for agent-built apps
    </p>
    <h1 class="display mt-5 enter" style="--stagger: 80ms">
      The making got easy. The&nbsp;keeping is still broken.
    </h1>
    <div class="enter" style="--stagger: 160ms">
      <p class="prose-measure mt-6 text-muted-foreground">
        Ask your agent for an app and it will build one. The hard part is keeping it — somewhere
        that isn't a subscription, a silo, or a folder that quietly dies. Lodekit runs your apps on
        the computer you already own, with everything they'd need from a cloud.
      </p>
      <p class="mt-4 text-lg font-medium">Cloud batteries, locally, easily.</p>
    </div>
    <div class="enter mt-8" style="--stagger: 240ms">
      <NotifyForm id="hero" />
      <span class="chip mt-6 inline-block">macOS alpha · Coming soon</span>
    </div>
  </div>
  <div class="enter" style="--stagger: 320ms">
    <JarIllustration />
  </div>
</section>
```

- [ ] **Step 3: Build + smoke**

Temporarily render `<Hero />` in `index.astro`. Run `pnpm --filter @lodekit/web-main build` (expected: PASS). In dev: entrance plays once in order (kicker first, art last, done well under a second); clouds drift barely; toggle dark → indigo plate, gold linework; System Settings → reduce motion (or DevTools emulation) → no drift, fades only; narrow to 360px → single column, no horizontal scrollbar.

- [ ] **Step 4: Commit**

```bash
git add web/main/src/components/JarIllustration.astro web/main/src/components/Hero.astro web/main/src/pages/index.astro
git commit -m "feat(web-main): hero — print split, jar illustration, orchestrated entrance (<task-bead-id>)"
```

---

### Task 6: LoopStrip, Pillar, ServiceChips, FileTreePrint

**Files:**
- Create: `web/main/src/components/LoopStrip.astro`
- Create: `web/main/src/components/Pillar.astro`
- Create: `web/main/src/components/ServiceChips.astro`
- Create: `web/main/src/components/FileTreePrint.astro`

**Interfaces:**
- Consumes: Task 2 classes/tokens.
- Produces: `<LoopStrip />`; `<Pillar kicker="…" headline="…" variant="paper"|"night"|"wash">` with default slot (prose) and named slot `proof`; `<ServiceChips />`; `<FileTreePrint />`.

**Acceptance Criteria:**
- `Pillar` renders kicker + `<h2 class="headline">` + prose column + optional proof column; `variant="night"` uses `.plate-night` (fixed indigo in both themes), `variant="wash"` uses `bg-secondary`.
- `ServiceChips` lists all six services with mono ids in **normal case** (data voice, not uppercase chips) and one-line glosses.
- `FileTreePrint` renders the three-line tree + caption in mono on a night-hi card (it only ever appears inside the night pillar).
- No scroll-triggered animation anywhere in these components.

- [ ] **Step 1: Create `web/main/src/components/LoopStrip.astro`**

```astro
<section class="border-y border-border bg-secondary/40">
  <ol class="mx-auto grid max-w-6xl grid-cols-1 gap-x-8 gap-y-4 px-6 py-10 sm:grid-cols-3">
    <li class="flex items-baseline gap-3">
      <span class="font-mono text-sm text-muted-foreground">01</span>
      <span>You describe the app.</span>
    </li>
    <li class="flex items-baseline gap-3">
      <span class="font-mono text-sm text-muted-foreground">02</span>
      <span>Your agent builds it.</span>
    </li>
    <li class="flex items-baseline gap-3">
      <span class="font-mono text-sm text-muted-foreground">03</span>
      <span>Lodekit runs it and keeps it.</span>
    </li>
  </ol>
</section>
```

- [ ] **Step 2: Create `web/main/src/components/Pillar.astro`**

```astro
---
interface Props {
  kicker: string;
  headline: string;
  variant?: "paper" | "night" | "wash";
}
const { kicker, headline, variant = "paper" } = Astro.props;
const plate = variant === "night" ? "plate-night" : variant === "wash" ? "bg-secondary/40" : "";
const kickerColor = variant === "night" ? "text-parchment" : "text-muted-foreground";
const hasProof = Astro.slots.has("proof");
---

<section class={plate}>
  <div
    class:list={[
      "mx-auto grid max-w-6xl gap-x-16 gap-y-10 px-6 py-16 md:py-20",
      hasProof && "lg:grid-cols-2",
    ]}
  >
    <div>
      <p class:list={["kicker", kickerColor]}>{kicker}</p>
      <h2 class="headline mt-4">{headline}</h2>
      <div class="prose-measure mt-5 space-y-4">
        <slot />
      </div>
    </div>
    {
      hasProof && (
        <div class="flex items-center">
          <slot name="proof" />
        </div>
      )
    }
  </div>
</section>
```

- [ ] **Step 3: Create `web/main/src/components/ServiceChips.astro`**

```astro
---
// Canonical service names (docs/CONTEXT.md service catalog) — data voice, never uppercased.
const services = [
  { id: "db-store", gloss: "a real relational database" },
  { id: "kv-store", gloss: "app memory" },
  { id: "file-store", gloss: "files that live as files" },
  { id: "secret-store", gloss: "credentials, encrypted" },
  { id: "tasks", gloss: "queued and scheduled work" },
  { id: "gateways", gloss: "a managed door to outside services" },
];
---

<dl class="grid w-full grid-cols-1 gap-x-10 sm:grid-cols-2">
  {
    services.map((s) => (
      <div class="flex items-baseline gap-3 border-b border-border py-3">
        <dt class="font-mono text-sm font-medium">{s.id}</dt>
        <dd class="text-sm text-muted-foreground">{s.gloss}</dd>
      </div>
    ))
  }
</dl>
```

- [ ] **Step 4: Create `web/main/src/components/FileTreePrint.astro`**

```astro
<figure class="w-full">
  <pre
    class="overflow-x-auto rounded-md border border-night-lo bg-night-hi p-6 font-mono text-sm leading-7 text-pale-gold"><code>Lodekit/
├── apps/        your apps — source, readable
├── data/        their data — one namespace per app
└── gateways/    the doors you've opened</code></pre>
  <figcaption class="mt-3 text-sm text-parchment">Backup = copy a folder.</figcaption>
</figure>
```

- [ ] **Step 5: Build + commit**

Run: `pnpm --filter @lodekit/web-main build`
Expected: PASS (components compile; composition happens in Task 8).

```bash
git add web/main/src/components/LoopStrip.astro web/main/src/components/Pillar.astro web/main/src/components/ServiceChips.astro web/main/src/components/FileTreePrint.astro
git commit -m "feat(web-main): loop strip and pillar building blocks (<task-bead-id>)"
```

---

### Task 7: OscillationBand, CtaBand, DevLayer

**Files:**
- Create: `web/main/src/components/OscillationBand.astro`
- Create: `web/main/src/components/CtaBand.astro`
- Create: `web/main/src/components/DevLayer.astro`

**Interfaces:**
- Consumes: `<NotifyForm id="cta" />` (Task 4); `.plate-ochre`, `.kicker`, `.headline` (Task 2).
- Produces: `<OscillationBand />`, `<CtaBand />`, `<DevLayer />` (no props).

**Acceptance Criteria:**
- Oscillation band: the four PRODUCT.md §5 pairs verbatim, two-column rows, hairline-divided, ending on the "still running next year" pair.
- CTA band: fixed ochre plate in both themes, plum ink text, headline "Give your apps a home.", NotifyForm with legible microcopy (no gray-on-color).
- DevLayer: sans body (mono only for the kicker), names TanStack Start / SQLite / shadcn/ui / MCP, no headline-register claims, no links.

- [ ] **Step 1: Create `web/main/src/components/OscillationBand.astro`**

```astro
---
// PRODUCT.md §5 what-is / what-could-be pairs — verbatim; end on the gap.
const pairs = [
  { is: "Renting generic tools that fit almost", could: "A set of small apps shaped exactly like your life" },
  { is: "Your data spread across silos you can't open", could: "Your data in a folder you can copy" },
  { is: "A subscription per need", could: "One platform, no meter" },
  { is: "Scripts that die when you look away", could: "Apps that are still running, still yours, next year" },
];
---

<section>
  <div class="mx-auto max-w-6xl px-6 py-16 md:py-20">
    <p class="kicker text-muted-foreground">What is · What could be</p>
    <div class="mt-8 divide-y divide-border border-y border-border">
      {
        pairs.map((p) => (
          <div class="grid gap-1 py-5 sm:grid-cols-2 sm:gap-10">
            <p class="text-muted-foreground">{p.is}</p>
            <p class="font-medium">{p.could}</p>
          </div>
        ))
      }
    </div>
  </div>
</section>
```

- [ ] **Step 2: Create `web/main/src/components/CtaBand.astro`**

```astro
---
import NotifyForm from "./NotifyForm.astro";
---

<section class="plate-ochre">
  <div class="mx-auto max-w-2xl px-6 py-16 text-center md:py-20">
    <h2 class="headline">Give your apps a home.</h2>
    <p class="mx-auto mt-4 max-w-prose">
      The alpha ships soon, macOS first. Leave an email and we'll send one note — the day it's
      ready.
    </p>
    <div class="mx-auto mt-8 flex max-w-md flex-col items-center [&_[data-notify-root]]:w-full">
      <NotifyForm id="cta" />
    </div>
  </div>
</section>
```

- [ ] **Step 3: Create `web/main/src/components/DevLayer.astro`**

```astro
<section class="border-t border-border">
  <div class="mx-auto max-w-6xl px-6 py-10">
    <p class="kicker text-muted-foreground">For the curious</p>
    <p class="prose-measure mt-3 text-sm text-muted-foreground">
      Under the hood: a single Node engine hosting TanStack Start apps in per-app workers. SQLite
      per app. shadcn/ui components under one shared theme. Agent-driven over MCP. Buildless — the
      platform owns the toolchain, down to its own pinned Node.
    </p>
  </div>
</section>
```

- [ ] **Step 4: Build + commit**

Run: `pnpm --filter @lodekit/web-main build`
Expected: PASS.

```bash
git add web/main/src/components/OscillationBand.astro web/main/src/components/CtaBand.astro web/main/src/components/DevLayer.astro
git commit -m "feat(web-main): oscillation band, ochre CTA band, developer layer (<task-bead-id>)"
```

---

### Task 8: Compose the page + full verification sweep

**Files:**
- Modify: `web/main/src/pages/index.astro` (full rewrite — placeholder markup and `githubUrl` deleted)

**Interfaces:**
- Consumes: every component from Tasks 3–7.

**Acceptance Criteria:** (= the spec's Verification section)
- Build passes; no console errors in dev.
- Band order: Header → Hero → LoopStrip → Pillar×5 (paper, night, paper, wash, paper) → OscillationBand → CtaBand → DevLayer → Footer.
- Entrance ≤800ms, once, hero-only; nothing animates on scroll anywhere.
- Theme toggle flips parchment↔night, persists, no flash; night pillar + ochre band fixed in both themes.
- Reduced motion: no drift, no translate — opacity fades only.
- Keyboard: toggle → hero email → Notify me → CTA email all reachable with visible focus; mock confirmation announced.
- No horizontal overflow at 360/768/1440; hero collapses below `lg`.
- Zero external links in rendered HTML.

- [ ] **Step 1: Rewrite `web/main/src/pages/index.astro`**

```astro
---
import Base from "../layouts/Base.astro";
import Header from "../components/Header.astro";
import Hero from "../components/Hero.astro";
import LoopStrip from "../components/LoopStrip.astro";
import Pillar from "../components/Pillar.astro";
import ServiceChips from "../components/ServiceChips.astro";
import FileTreePrint from "../components/FileTreePrint.astro";
import OscillationBand from "../components/OscillationBand.astro";
import CtaBand from "../components/CtaBand.astro";
import DevLayer from "../components/DevLayer.astro";
import Footer from "../components/Footer.astro";
---

<Base>
  <Header />
  <main>
    <Hero />
    <LoopStrip />

    <Pillar kicker="Cloud batteries" headline="Keep the batteries, drop the cloud.">
      <p>
        Everything apps need from a cloud — a real database, file storage, secrets, scheduled
        tasks, doors to outside services — provided locally by one engine. No accounts, no meters,
        nobody else's computer.
      </p>
      <ServiceChips slot="proof" />
    </Pillar>

    <Pillar kicker="Ownership" headline="Your data is a folder." variant="night">
      <p>
        Apps and data are files in one folder. Copy it and it's yours forever. No accounts to
        lose, no export buttons to hunt for — everything readable on disk.
      </p>
      <FileTreePrint slot="proof" />
    </Pillar>

    <Pillar kicker="No tooling" headline="Ask for an app. Use it a minute later.">
      <p>
        No terminal, no builds, no node_modules. One menubar app installs the platform — it
        provisions its own Node, builds apps on save, and serves them in your browser.
      </p>
      <div slot="proof" class="flex flex-wrap gap-3">
        <span class="chip">one install</span>
        <span class="chip">zero config</span>
        <span class="chip">builds on save</span>
      </div>
    </Pillar>

    <Pillar kicker="Guardrails" headline="Safe to let an agent build." variant="wash">
      <p>
        Guardrails, not vibes. Apps run in isolated workers, and each sees only its own data.
        Secrets never enter app code — apps reach outside services through managed gateways. When
        something breaks, it breaks visibly: the dashboard shows you exactly where.
      </p>
      <ul slot="proof" class="w-full divide-y divide-border border-y border-border text-sm">
        <li class="py-3">Apps run in isolated workers</li>
        <li class="py-3">Each app sees only its own data</li>
        <li class="py-3">Secrets stay out of app code</li>
        <li class="py-3">Failures surface in the dashboard</li>
      </ul>
    </Pillar>

    <Pillar kicker="Coherence" headline="Ten apps that feel like one.">
      <p>
        Every app shares one UI library and one theme — yours to change in one place. One
        dashboard shows every app's state, data, and scheduled work. Ten agent-built apps feel
        like one product, not ten codepens.
      </p>
    </Pillar>

    <OscillationBand />
    <CtaBand />
    <DevLayer />
  </main>
  <Footer />
</Base>
```

- [ ] **Step 2: Build**

Run: `pnpm --filter @lodekit/web-main build`
Expected: PASS.

Run: `grep -rE 'href="https?://' web/main/dist/ | grep -v 'fonts' || echo "no external links"`
Expected: `no external links` (fontsource is self-hosted, so really zero).

- [ ] **Step 3: Full manual sweep in dev**

Walk the spec's Verification list top to bottom (entrance, scroll calm, theme persistence + fixed plates, reduced motion, keyboard + status announcement, 360/768/1440 overflow, Print Test by eye). Fix what fails; re-check.

- [ ] **Step 4: Commit**

```bash
git add web/main/src/pages/index.astro
git commit -m "feat(web-main): landing page v2 — full landing in the print identity (<task-bead-id>)"
```

**Do not raise a PR** — the engineer smoke-tests first (session instruction).
