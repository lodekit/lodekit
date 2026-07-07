# User Theming & UI Catalog — Design

**Date:** 2026-07-06
**Status:** Approved
**Role:** 0.x slice pair on the UI line opened by `2026-07-02-ui-library-design.md`:
(A) person-facing theming via token overrides, then (B) the UI catalog — a
platform-served Storybook at `/_ui/` that previews the UI library under those themes.
**Language:** Canonical terms per `context.md` (UI library, Lodekit root, dashboard,
cache, platform). This spec adds **UI catalog** to the domain language, parallel to the
service catalog. The word "catalog" stays out of code — the route is `/_ui`.

## 1. Purpose

The UI library shipped one theme so all apps look like one product. This pair makes that
theme *the person's*: they (via their agent) restyle everything globally or restyle a
single app, and they get a window — the UI catalog — where they see every component
rendered under exactly those themes. Slice A is the capability; slice B is the mirror.
A is built first because B previews what A defines.

### In scope

- **Slice A:** global and per-app theme override files, composed into every app build and
  the dashboard build; live rebuild on change via the watcher.
- **Slice B:** Storybook for `packages/ui` (stories for every vendored component), built
  statically, served by the runtime at `/_ui/` with live theme application (global view +
  per-app view); a dashboard link to it; bundled into the packaged payload.
- `context.md` gains the **UI catalog** term; `roadmap.md` records the deferrals below.

### Out of scope (deferred)

- **ui.lodekit.com** — hosting the same static Storybook build publicly as part of the
  docs/reference story. Nothing here blocks it: the build is static and theme-dumb; remote
  it would simply render the stock theme. Parked on the roadmap.
- A dashboard theme-picker UI (presets, color pickers). Tokens are agent-edited files.
- A person-facing dark/light toggle (system preference only, unchanged) — superseded
  2026-07-07: `appearance.theme` (settings spec §8) owns the mode; theming still owns the
  look.
- Policing override contents. Tokens are the documented contract; the files are plain CSS.
- The skill update that teaches theming (belongs to the skill slice).

## 2. Slice A — User theming (token overrides)

### 2.1 Files

Two optional plain-CSS files, layered by cascade order:

- **Global:** `<Lodekit root>/theme.css` — sibling of `apps/` and `data/`. Applies to all
  apps **and the dashboard** (cohesion invariant: Lodekit looks like its apps).
- **Per-app:** `apps/<app-id>/theme.css` — composed after the global file, so it wins
  where both set the same token. Applies only to that app.

The documented contract (taught later by the skill) is **redefining the shadcn variable
set** from the UI library's `theme.css` — `:root { --primary: … }`, dark values via
`prefers-color-scheme` blocks, `--radius`, `--font-sans`, and friends. Being plain CSS,
the files *can* carry arbitrary rules; nothing enforces tokens-only, but only tokens are
promised to keep working as the UI library evolves.

### 2.2 Mechanism — build-time composition, zero app changes

`packages/ui/theme.css` gains the import

```css
@import "@lodekit/ui/theme-overrides.css";
```

as its last `@import`, and the package ships an **empty** `theme-overrides.css` beside
it. (CSS requires `@import` to precede all other rules, so `theme.css` becomes a pure
import manifest — its token rules move verbatim to a sibling `theme-tokens.css` imported
just before the overrides.) Resolution then has
two paths:

- **Runtime builds** (`build.ts`): a higher-precedence alias points the exact specifier
  `@lodekit/ui/theme-overrides.css` at a per-target composed file, generated into the
  cache before each build — an `@import` of the global file and (for apps) the app's
  file, absolute paths, whichever exist; empty when neither does. The dashboard target
  composes the global file only. Vite applies aliases to CSS `@import` (established in
  the UI-library slice), and alias order gives the exact entry precedence over the
  `@lodekit/ui` directory alias.
- **Everywhere else** (Storybook dev, tests, any consumer without the runtime's
  aliases): the specifier falls through to the shipped empty file. Nothing breaks,
  nothing to configure.

Apps, the scaffold, and existing example apps need **zero changes** — they already import
`@lodekit/ui/theme.css`.

### 2.3 Live updates

- `apps/<app-id>/theme.css` already sits inside the watched tree — a change rebuilds that
  app through the existing debounced per-app path.
- The global file sits outside `appsDir`, so the watcher grows a second chokidar watch on
  `<Lodekit root>/theme.css` (add/change/unlink) that triggers a rebuild of **all apps and
  the dashboard**, debounced as one sweep.

### 2.4 Error handling

A broken per-app override surfaces as that app's normal `error` build state. A broken
global file errors every app the same way — the standard, visible failure surface, and a
one-line revert; no special machinery. The dashboard keeps its existing build-failure
fallback (never downs the runtime).

## 3. Slice B — UI catalog at `/_ui/` (Storybook, platform-only)

### 3.1 Storybook in `packages/ui`

- Storybook (React + Vite builder) as `devDependencies` of `@lodekit/ui`; config in
  `packages/ui/.storybook/`. It is a workbench and build tool — never a runtime
  dependency, never in the payload's `node_modules`.
- **Stories colocated:** `src/components/button.stories.tsx` beside each component — one
  story file per vendored component (all 41), covering the primary variants and states;
  autodocs enabled. Story writing is agent-generated in bulk, reviewed visually.
- Preview imports `../theme.css`; the Storybook Vite config adds `@tailwindcss/vite`
  (theme.css's `@source "./src"` already covers class scanning). The overrides import
  resolves to the shipped empty file (§2.2) — Storybook needs no alias work.
- Scripts: `storybook` (dev workbench) and `build-storybook` (static output,
  gitignored).

### 3.2 Serving and shipping

- The runtime serves the static build at `/_ui/` (underscore prefix, outside the app-id
  grammar, same pattern as `/_dashboard`). It **never builds** Storybook — far too slow
  for startup.
- **Dev:** the runtime static-serves `packages/ui/storybook-static` when present;
  otherwise `/_ui/` returns a minimal page saying the catalog isn't built and naming the
  command (`pnpm --filter @lodekit/ui build-storybook`).
- **Packaged:** the manager's `prepare-bundle` runs `build-storybook` and places the
  output in the payload; the runtime resolves the served directory the same way it finds
  its other payload assets.
- **Dashboard:** gains a link to `/_ui/`.

### 3.3 Theming from the start — live, no catalog rebuilds

The static catalog stays theme-dumb; the **runtime** supplies the theme:

- `.storybook/preview-head.html` carries
  `<link id="lodekit-theme" rel="stylesheet" href="theme.css">`. Relative to the preview
  iframe under `/_ui/`, that resolves to **`/_ui/theme.css`**, which the runtime answers
  with the live contents of the global override file (empty when absent), read per
  request — theme edits show on refresh, the catalog is never rebuilt.
- **Per-app view:** a Storybook toolbar dropdown ("App: global / habit-tracker / …"),
  populated from the existing `/api/apps`, swaps the link's `href` to
  **`/_ui/theme.css?app=<app-id>`** — the runtime responds with global + that app's
  overrides composed in cascade order. The `app` value is validated against the app-id
  grammar and the registry (no path material from the query string).
- In `storybook dev` (the workbench, no runtime), those URLs 404 and the link is inert —
  stock theme, which is correct there.

## 4. Testing (minimum, per guardrails)

- **Slice A, build integration:** fixture app plus override files — assert an overridden
  token value (e.g. a distinctive `--primary`) lands in the built CSS for (a) global-only,
  (b) global + per-app with the per-app value winning; and that the dashboard build picks
  up the global file. No-override builds stay green (empty-file fallback).
- **Slice A, watcher:** touching `<root>/theme.css` triggers the all-apps rebuild sweep;
  touching `apps/<id>/theme.css` rebuilds only that app (existing path, asserted).
- **Slice B, runtime:** with a stub `storybook-static` fixture, `/_ui/` serves its
  `index.html`; `/_ui/theme.css` returns the global file's contents; `?app=<id>` returns
  the composed CSS; an invalid `app` value is rejected. Without the static dir, `/_ui/`
  serves the not-built page.
- **Slice B, catalog build:** `build-storybook` completing against the real stories is a
  script-level smoke, **not** part of `pnpm test` (too slow for the suite).

## 5. Verification — what "done" proves

1. Editing `<root>/theme.css` restyles every example app *and* the dashboard on refresh;
   an `apps/<id>/theme.css` restyles only that app, overriding the global values.
2. `/_ui/` (linked from the dashboard) shows every UI-library component; the toolbar
   switches between the global theme and each app's composed theme, live.
3. `pnpm test` green; `pnpm --filter @lodekit/manager make` produces a payload whose
   `/_ui/` works offline.

## 6. Roadmap follow-ups (to record with this pair)

- **ui.lodekit.com** — deploy the same static Storybook build publicly with the docs
  (`docs.lodekit.com` line on the docs branch); a third one-site-per-subdomain deploy.
- Dashboard theme-picker UI on top of the same token files.
- Skill guidance for theming (tokens contract, file locations) — skill slice.

## 7. Assumptions (decided in brainstorm, 2026-07-06)

1. **Tokens, agent-edited** (over a dashboard picker or arbitrary-CSS guarantees): the
   shadcn variable set *is* the theming API; files are the interface, the agent is the UI.
2. **Build-time composition** (over response rewriting): apps are SSR'd in workers — the
   runtime can't cheaply inject a `<link>` into app HTML, and the watcher already gives
   rebuild-on-change. The catalog, which the runtime *does* serve directly, gets the
   live-stylesheet treatment instead.
3. **Global theme covers the dashboard** — invariant 7 (Lodekit looks like its apps).
4. **Storybook over lighter tools** (Ladle et al.): agent familiarity, autodocs, and the
   addon ecosystem outweigh payload size; the static build ships once, per release.
5. **Catalog prebuilt, runtime-served, theme injected at request time** — so one static
   artifact serves dev, the payload, and (later) ui.lodekit.com unchanged.
