# Landing Page v1 (coming-soon) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a coming-soon landing page in `web/` on the intended shadcn/Tailwind stack: a centered hero + a disabled email-capture form + a footer, with a working light/dark theme toggle.

**Architecture:** Astro (static-by-default) with Tailwind v4 via `@tailwindcss/vite` and React islands via `@astrojs/react`. shadcn/ui primitives (`button`, `input`) are copied into the repo and rendered by Astro as static HTML (no client directive) — so the only JavaScript shipped is one `ThemeToggle` island. A no-flash inline `<head>` script sets the theme class before paint.

**Tech Stack:** Astro 4.16, `@astrojs/react`@^3 + React 18, Tailwind v4 (`@tailwindcss/vite`), shadcn/ui (new-york, neutral base, CSS variables), lucide-react.

## Global Constraints

- Package manager is **pnpm** with workspaces. Install into this package only with `pnpm --filter @lodekit/web add <pkg>` (add `-D` for dev deps). Never edit `web/package.json` deps by hand.
- **Astro 4.16** is the installed version — pin React integration to `@astrojs/react@^3` and `react@^18`/`react-dom@^18` (v4 of the integration requires Astro 5).
- Verification is **build + built-output grep**, not a unit runner. `web` has no test suite (matches the repo: only `@lodekit/runtime` has one). Build command: `pnpm --filter @lodekit/web build` (outputs static HTML/CSS to `web/dist/`).
- The email form is **disabled / visual only** — no submit handler, no network, no backend.
- The theme toggle is the **only** hydrated island. Everything else is static HTML.
- Commits go directly to the current branch (`web-landing`). **No `Co-Authored-By` trailers** (repo convention).
- Tagline copy, verbatim: `Build small local apps on a unified stack — no build tooling to manage.`

---

## File Structure

- `web/astro.config.mjs` — register React integration + Tailwind Vite plugin. (modify)
- `web/tsconfig.json` — add `@/*` path alias. (modify)
- `web/components.json` — shadcn config. (create)
- `web/src/styles/globals.css` — Tailwind v4 entry + shadcn theme tokens (light + dark). (create)
- `web/src/lib/utils.ts` — shadcn `cn` helper. (create)
- `web/src/components/ui/button.tsx`, `web/src/components/ui/input.tsx` — shadcn primitives (via CLI). (create)
- `web/src/layouts/Base.astro` — html/head shell, imports globals.css, holds the no-flash script. (create)
- `web/src/components/ThemeToggle.tsx` — the one React island. (create)
- `web/src/pages/index.astro` — the page (replaces the current bare placeholder). (modify)

> **Note on Base.astro:** the spec put the no-flash script "in `<head>` of the page." A tiny shared `Base.astro` layout is the idiomatic Astro home for the html/head shell and keeps the page focused; the script lives there. This is a small, intentional refinement over the spec's wording, same behavior.

---

## Task 1: Tailwind v4 + React foundation renders a styled page

**Files:**
- Modify: `web/astro.config.mjs`
- Modify: `web/tsconfig.json`
- Create: `web/src/styles/globals.css`
- Create: `web/src/lib/utils.ts`
- Create: `web/src/layouts/Base.astro`
- Modify: `web/src/pages/index.astro`

**Interfaces:**
- Produces: `Base.astro` default layout (imports `../styles/globals.css`, renders `<slot/>`, includes the no-flash `<head>` script); `cn(...inputs)` from `@/lib/utils`; Tailwind semantic classes (`bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`) backed by CSS variables.

- [ ] **Step 1: Install React + Tailwind v4 + cn deps**

```bash
pnpm --filter @lodekit/web add @astrojs/react@^3 react@^18 react-dom@^18 tailwindcss@^4 @tailwindcss/vite@^4 clsx tailwind-merge
pnpm --filter @lodekit/web add -D @types/react@^18 @types/react-dom@^18
```

- [ ] **Step 2: Wire the integrations into `web/astro.config.mjs`**

Replace the file's contents with:

```js
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
```

- [ ] **Step 3: Add the `@/*` path alias in `web/tsconfig.json`**

Replace the file's contents with:

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

- [ ] **Step 4: Create `web/src/styles/globals.css`** (Tailwind v4 entry + shadcn neutral tokens)

```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 0 0% 3.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 0 0% 3.9%;
  --primary: 0 0% 9%;
  --primary-foreground: 0 0% 98%;
  --secondary: 0 0% 96.1%;
  --secondary-foreground: 0 0% 9%;
  --muted: 0 0% 96.1%;
  --muted-foreground: 0 0% 45.1%;
  --accent: 0 0% 96.1%;
  --accent-foreground: 0 0% 9%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 0 0% 98%;
  --border: 0 0% 89.8%;
  --input: 0 0% 89.8%;
  --ring: 0 0% 3.9%;
  --radius: 0.5rem;
}

.dark {
  --background: 0 0% 3.9%;
  --foreground: 0 0% 98%;
  --card: 0 0% 3.9%;
  --card-foreground: 0 0% 98%;
  --popover: 0 0% 3.9%;
  --popover-foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 0 0% 9%;
  --secondary: 0 0% 14.9%;
  --secondary-foreground: 0 0% 98%;
  --muted: 0 0% 14.9%;
  --muted-foreground: 0 0% 63.9%;
  --accent: 0 0% 14.9%;
  --accent-foreground: 0 0% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 0 0% 98%;
  --border: 0 0% 14.9%;
  --input: 0 0% 14.9%;
  --ring: 0 0% 83.1%;
}

@theme inline {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));
  --color-popover: hsl(var(--popover));
  --color-popover-foreground: hsl(var(--popover-foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));
  --color-destructive: hsl(var(--destructive));
  --color-destructive-foreground: hsl(var(--destructive-foreground));
  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-ring: hsl(var(--ring));
  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 5: Create `web/src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 6: Create `web/src/layouts/Base.astro`** (shell + no-flash script)

```astro
---
import "../styles/globals.css";
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta
      name="description"
      content="Lodekit — build small local apps on a unified stack. Coming soon."
    />
    <title>Lodekit — Coming soon</title>
    <script is:inline>
      // No-flash theme: set the .dark class before first paint.
      const stored = localStorage.getItem("theme");
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

- [ ] **Step 7: Replace `web/src/pages/index.astro`** with a minimal styled page (proves Tailwind tokens work; hero/form/footer land in Task 2)

```astro
---
import Base from "../layouts/Base.astro";
---

<Base>
  <main class="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
    <h1 class="text-5xl font-semibold tracking-tight">Lodekit</h1>
    <p class="text-muted-foreground">Coming soon.</p>
  </main>
</Base>
```

- [ ] **Step 8: Build and verify the foundation renders with tokens**

```bash
pnpm --filter @lodekit/web build
```
Expected: build succeeds (exit 0), no TypeScript/Vite errors.

```bash
grep -q "Lodekit" web/dist/index.html && echo "html-ok"
grep -rq -- "--background" web/dist/_astro/*.css && echo "tokens-ok"
```
Expected: prints `html-ok` and `tokens-ok` (the theme tokens made it into the generated CSS).

- [ ] **Step 9: Commit**

```bash
git add web/package.json web/astro.config.mjs web/tsconfig.json web/src/styles/globals.css web/src/lib/utils.ts web/src/layouts/Base.astro web/src/pages/index.astro
git commit -m "feat(web): Tailwind v4 + React foundation with shadcn theme tokens"
```

> If `pnpm-lock.yaml` at the repo root changed, `git add` it too before committing.

---

## Task 2: Hero + disabled email form + footer, using shadcn primitives

**Files:**
- Create: `web/components.json`
- Create (via CLI): `web/src/components/ui/button.tsx`, `web/src/components/ui/input.tsx`
- Modify: `web/src/pages/index.astro`

**Interfaces:**
- Consumes: `Base.astro` (Task 1); `cn` from `@/lib/utils` (Task 1, used by the generated primitives).
- Produces: `Button` from `@/components/ui/button` (props include `variant`, `size`, `disabled`, standard button attrs) and `Input` from `@/components/ui/input` (standard input attrs) — both React components Astro renders to static HTML when used with no `client:*` directive.

- [ ] **Step 1: Create `web/components.json`** (so the shadcn CLI knows where to place files)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 2: Pull the `button` and `input` primitives via the shadcn CLI (non-interactive)**

```bash
pnpm dlx shadcn@latest add button input -y -c web
```
(`pnpm dlx` runs from the repo root; `-c web` points the CLI at the `web` package so it reads `web/components.json` and writes into `web/src`.)

Expected: creates `web/src/components/ui/button.tsx` and `web/src/components/ui/input.tsx`, and installs `class-variance-authority` + `@radix-ui/react-slot` into `web/package.json`.

Verify the files landed:
```bash
ls web/src/components/ui/button.tsx web/src/components/ui/input.tsx
```
Expected: both paths print (no "No such file").

> If the CLI cannot resolve the workspace/registry in this environment, fall back to copying the current `button` and `input` source from https://ui.shadcn.com/docs/components/button and `.../input` into those two paths, and run `pnpm --filter @lodekit/web add class-variance-authority @radix-ui/react-slot`. Stop and flag this at the review checkpoint if it happens — do not improvise component source.

- [ ] **Step 3: Build the hero + form + footer in `web/src/pages/index.astro`**

Replace the file's contents with:

```astro
---
import Base from "../layouts/Base.astro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const tagline = "Build small local apps on a unified stack — no build tooling to manage.";
// TODO(confirm): repo is not public yet / no git remote configured. Update this
// URL to the real repository before launch.
const githubUrl = "https://github.com/lodekit/lodekit";
---

<Base>
  <main class="relative flex min-h-screen flex-col items-center justify-center gap-8 px-6 text-center">
    <section class="flex flex-col items-center gap-4">
      <span
        class="rounded-full border border-border px-3 py-1 text-xs font-medium uppercase tracking-widest text-muted-foreground"
      >
        Coming soon
      </span>
      <h1 class="text-5xl font-semibold tracking-tight sm:text-6xl">Lodekit</h1>
      <p class="max-w-md text-balance text-lg text-muted-foreground">{tagline}</p>
    </section>

    <form class="flex w-full max-w-sm items-center gap-2" aria-label="Get notified (coming soon)">
      <Input type="email" placeholder="you@example.com" aria-label="Email address" disabled />
      <Button type="submit" disabled>Notify me</Button>
    </form>

    <footer class="text-sm text-muted-foreground">
      <a class="underline underline-offset-4 hover:text-foreground" href={githubUrl}>GitHub</a>
    </footer>
  </main>
</Base>
```

- [ ] **Step 4: Build and verify hero/form/footer are present in the static output**

```bash
pnpm --filter @lodekit/web build
```
Expected: build succeeds (exit 0).

```bash
grep -q 'placeholder="you@example.com"' web/dist/index.html && echo "input-ok"
grep -q "disabled" web/dist/index.html && echo "disabled-ok"
grep -q "Notify me" web/dist/index.html && echo "button-ok"
grep -q "github.com" web/dist/index.html && echo "footer-ok"
grep -q "astro-island" web/dist/index.html && echo "ISLAND-FOUND" || echo "no-island-ok"
```
Expected: prints `input-ok`, `disabled-ok`, `button-ok`, `footer-ok`, and `no-island-ok` (no hydrated JS yet — the form is static).

- [ ] **Step 5: Commit**

```bash
git add web/components.json web/package.json web/src/components/ui/button.tsx web/src/components/ui/input.tsx web/src/pages/index.astro
git commit -m "feat(web): coming-soon hero, disabled email form, footer"
```

> Add the root `pnpm-lock.yaml` to the commit if it changed.

---

## Task 3: Light/dark theme toggle island

**Files:**
- Create: `web/src/components/ThemeToggle.tsx`
- Modify: `web/src/pages/index.astro`

**Interfaces:**
- Consumes: `Button` from `@/components/ui/button` (Task 2); the `.dark` class + `localStorage["theme"]` contract established by the no-flash script in `Base.astro` (Task 1).
- Produces: `ThemeToggle` named export — a React island rendered with `client:load`.

- [ ] **Step 1: Install the icon dependency**

```bash
pnpm --filter @lodekit/web add lucide-react
```

- [ ] **Step 2: Create `web/src/components/ThemeToggle.tsx`**

```tsx
import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [dark, setDark] = React.useState(false);

  // Sync initial state from the class the no-flash script already set.
  React.useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <Button variant="outline" size="icon" onClick={toggle} aria-label="Toggle theme">
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
```

- [ ] **Step 3: Mount the toggle in `web/src/pages/index.astro`**

Add the import to the frontmatter (below the existing `Input` import):

```astro
import { ThemeToggle } from "@/components/ThemeToggle";
```

Add the toggle as the first child inside `<main>` (before the `<section>`):

```astro
    <div class="absolute right-4 top-4">
      <ThemeToggle client:load />
    </div>
```

- [ ] **Step 4: Build and verify the island is emitted**

```bash
pnpm --filter @lodekit/web build
```
Expected: build succeeds (exit 0).

```bash
grep -q "astro-island" web/dist/index.html && echo "island-ok"
grep -q "Toggle theme" web/dist/index.html && echo "toggle-ok"
```
Expected: prints `island-ok` and `toggle-ok` (the toggle now hydrates; the rest of the page stays static).

- [ ] **Step 5: Manual smoke check of the toggle**

```bash
pnpm --filter @lodekit/web dev
```
Then in a browser at the printed localhost URL:
- Page renders with no flash of the wrong theme on load.
- Clicking the top-right toggle flips light ↔ dark.
- Reload: the chosen theme persists (via `localStorage["theme"]`), still no flash.

Stop the dev server (Ctrl-C) when done.

- [ ] **Step 6: Commit**

```bash
git add web/package.json web/src/components/ThemeToggle.tsx web/src/pages/index.astro
git commit -m "feat(web): light/dark theme toggle island"
```

> Add the root `pnpm-lock.yaml` to the commit if it changed.

---

## Self-Review (author checklist — completed)

- **Spec coverage:** Stack decision → Task 1 (Tailwind v4 + React) + Task 2 (`components.json` + `shadcn add`). Hero/email/footer → Task 2. Light/dark toggle + no-flash script → Task 1 (script) + Task 3 (toggle). Verification (build + smoke) → each task's build/grep steps + Task 3 manual check. Out-of-scope items (backend, Starlight, extra sections) are not implemented. ✓
- **Placeholder scan:** No "TBD/implement later" steps; the single `TODO(confirm)` is a deliberate, flagged content placeholder (GitHub URL — no remote exists yet), not a missing implementation. ✓
- **Type/name consistency:** `cn` (Task 1) consumed by generated primitives (Task 2). `Button`/`Input` from `@/components/ui/*` used identically in Tasks 2 and 3. `.dark` class + `localStorage["theme"]` contract written by `Base.astro` (Task 1) and read/written by `ThemeToggle` (Task 3). ✓

## Open item for the executor

- **GitHub URL** (`githubUrl` in `index.astro`) is a best-guess placeholder — no git remote is configured on this repo. Confirm the real repository URL (or drop the footer link) before treating the page as launch-ready.
