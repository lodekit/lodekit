# Landing page v1 (coming-soon) — design

Date: 2026-07-01
Package: `web` (`@lodekit/web`)
Status: approved, ready for plan

## Goal

Ship the first visible version of the Lodekit landing page: a **coming-soon
placeholder** at `lodekit.com`, built on the intended long-term stack so future
pages build on a real foundation rather than throwaway markup. Success = the page
builds, renders, and the light/dark toggle works and persists.

## Stack decision

Astro, extended with the shadcn/Tailwind ecosystem. Confirmed choices:

- **Astro** (already scaffolded, `web/`). Chosen for framework consistency with the
  future **Starlight** docs site (a separate deployment at `docs.lodekit.com`, a
  separate package) and for static-by-default delivery with opt-in interactivity.
  The landing and docs are **two deployments / two packages**, not one build.
- **Tailwind v4** via `@tailwindcss/vite` (not the v3-only `@astrojs/tailwind`
  integration). This is what current shadcn + Tailark expect; choosing it avoids
  fighting the tooling later.
- **shadcn/ui** — React components copied into the repo via its CLI. Rendered in
  Astro as React islands via `@astrojs/react`.
- **Tailark** — marketing blocks built on shadcn/Tailwind. Used by **adapting a
  block's markup**, not installing a package: Tailark authors for React/Next, so
  Next-isms (`next/link`, `next/image`) are stripped down to plain Astro markup.

Non-goal for shared design: `@lodekit/ui` is for the **apps and dashboard**, not
the landing/docs. Any future `web`↔`docs` design sharing is out of scope here.

## Scope (v1)

Single page, `web/src/pages/index.astro`, centered layout with three regions:

1. **Hero** — "Lodekit" wordmark, a "Coming soon" badge, and the existing tagline
   ("Build small local apps on a unified stack — no build tooling to manage.").
   Adapted from a Tailark hero block.
2. **Email capture** — shadcn `Input` + `Button`, **disabled / visual only**. No
   handler, no backend, no network call. Placeholder for a future notify list.
3. **Footer** — small, with a GitHub link.

### Interactivity — exactly one island

- **`ThemeToggle`** — React island (`client:load`) that toggles `.dark` on
  `<html>` and persists the choice to `localStorage`.
- A tiny **inline no-flash script** in `<head>` reads the stored/`prefers-color-scheme`
  value and sets the class before paint, so there's no light→dark flash on load.
- This toggle is the **only** JavaScript shipped. Hero, email input (disabled), and
  footer are static HTML.

## Files touched

- `web/package.json` — add `@astrojs/react`, `react`, `react-dom`, `tailwindcss`,
  `@tailwindcss/vite`; add shadcn's `button` + `input` deps as pulled by its CLI.
- `web/astro.config.mjs` — register the React integration and the Tailwind Vite plugin.
- `web/tsconfig.json` — `@/*` path alias (shadcn requirement).
- `web/components.json` — shadcn config (generated).
- `web/src/styles/globals.css` — Tailwind v4 entry + shadcn theme CSS variables
  (light + dark).
- `web/src/lib/utils.ts` — shadcn `cn` helper (generated).
- `web/src/components/ui/{button,input}.tsx` — shadcn primitives (generated).
- `web/src/components/ThemeToggle.tsx` — the one island.
- `web/src/pages/index.astro` — the page (replaces the current bare placeholder),
  including the no-flash `<head>` script.

## Verification

- `pnpm --filter @lodekit/web build` succeeds.
- `pnpm --filter @lodekit/web dev` renders hero + disabled email form + footer.
- Theme toggle flips light/dark and the choice survives a reload.
- No flash of the wrong theme on initial paint.
- No formal unit-test suite for `web` (matches the repo: `@lodekit/runtime` is the
  only suite). Verification here is a build + manual smoke check.

## Out of scope

- Real email/notify backend.
- Starlight docs, `docs.lodekit.com`, and any `web`↔`docs` shared design layer.
- Additional marketing sections (features, pricing, etc.).
- Deployment/hosting config.
