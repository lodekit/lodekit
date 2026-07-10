# Lodekit UI Library (`@lodekit/ui`) — Design

**Date:** 2026-07-02
**Status:** Draft, pending review
**Role:** Slice-spec 1 of the v0.1 line (umbrella spec
`2026-07-02-product-overview-design.md`, §4.2): theme + core components + alias into the
toolchain + dashboard restyle.
**Language:** Canonical terms per `context.md` (UI library, stack, app contract, dashboard,
cache).

## 1. Purpose

One theme imported everywhere is what makes ten agent-built apps look like one product
instead of ten codepens (umbrella §2.4). This slice ships the **UI library**: a themed
shadcn component library apps import as `@lodekit/ui`, resolved by the shared toolchain the
same way as `react` and the SDK — and restyles the **dashboard** with it, so Lodekit itself
looks like its apps (cohesion invariant 7).

### In scope

- `packages/ui` (`@lodekit/ui`): vendored shadcn components + one shared theme, buildless.
- Toolchain aliases so apps resolve `@lodekit/ui` (and `lucide-react` icons) with no
  per-app dependencies.
- Dashboard rebuilt as a React app on the shared toolchain, styled with `@lodekit/ui`.
- Scaffold starter updated to import the UI library and theme.
- Example apps (habit-tracker, expense-tracker) migrated.

### Out of scope (deferred)

- Heavy-dependency shadcn components — chart (recharts), calendar/date-picker
  (react-day-picker + date-fns), carousel (embla), form (react-hook-form + zod). Each
  deserves its own deliberate arrival (charts with a dataviz story, form with a validation
  story) later in 0.x, consistent with umbrella §4.1. Rich-text and media components
  likewise.
- A person-facing dark/light toggle (system preference only for now).
- The skill rewrite that mandates the UI library (slice 3).
- A bespoke Lodekit visual identity — v0.1 ships shadcn's stock look on a neutral base;
  the *mechanism* (one theme, one import) is the deliverable, the values can iterate.

## 2. Package shape (`packages/ui`)

Buildless raw TypeScript/TSX, mirroring `@lodekit/sdk`: `main`/`types` point at
`src/index.ts`, no build step, bundled into each app (and the dashboard) by the shared
toolchain. Workspace member via the existing `packages/*` glob.

```
packages/ui/
  package.json          # main/types → src/index.ts
  theme.css             # the single stylesheet apps import (see §3)
  src/
    index.ts            # barrel: export { Button } … — the one import surface
    lib/utils.ts        # cn() (clsx + tailwind-merge)
    components/*.tsx    # vendored shadcn components
```

- **Vendored source, shadcn model.** Components are generated with the shadcn CLI and
  committed as source — upstream-tracked but ours to edit. No runtime "shadcn dependency";
  the real dependencies (`radix-ui` primitives, `class-variance-authority`, `clsx`,
  `tailwind-merge`, `lucide-react`) are declared on `@lodekit/ui` and resolve through its
  own `node_modules` when Vite bundles the aliased source.
- **Primitives: Radix, deliberately.** Stock shadcn builds on Radix, which is what the
  shadcn CLI generates and what agents' training data overwhelmingly assumes — zero
  translation work, maximum agent familiarity. Radix's maintenance has slowed while Base UI
  (ex-Radix + MUI people) gathers momentum, but Radix is stable, and the barrel insulates
  the bet: apps import `Button` from `@lodekit/ui`, never a primitive, so a later Radix →
  Base UI migration is an internal per-component change in `packages/ui` that touches no
  app. Revisit if/when upstream shadcn migrates. **Superseded 2026-07-10:** upstream
  shadcn flipped its default to Base UI; migrated per
  `docs/specs/2026-07-10-base-ui-migration-design.md` (base-nova set over `@base-ui/react`).
- **Core set (v0.1) — every shadcn component that rides on the base dependencies** (Radix
  primitives, cva, clsx/tailwind-merge, or a small single-purpose lib), so agents reaching
  for any common shadcn name find it. Concretely: Accordion, Alert, AlertDialog,
  AspectRatio, Avatar, Badge, Breadcrumb, Button, Card, Checkbox, Collapsible, Command
  (cmdk), ContextMenu, Dialog, Drawer (vaul), DropdownMenu, HoverCard, Input, InputOTP
  (input-otp), Label, Menubar, NavigationMenu, Pagination, Popover, Progress, RadioGroup,
  Resizable (react-resizable-panels), ScrollArea, Select, Separator, Sheet, Sidebar,
  Skeleton, Slider, Sonner (sonner), Switch, Table, Tabs, Textarea, Toggle, ToggleGroup,
  Tooltip. The parenthesized small libs are acceptable one-time additions to the shared
  install; the heavy-dependency components are deferred (§1). Upstream's data-table,
  combobox, and date-picker are composition *patterns* (TanStack Table; Popover + Command;
  Calendar + Popover), not components — they belong to the skill, not the package. All
  components re-export from the barrel; apps never deep-import component files.
- **Icons:** apps import icons from `lucide-react` directly (aliased, §4). Not re-exported
  through the barrel — lucide names collide with component names (`Table`, `Badge`).
  Additional icon libraries later are additive: one more alias + one shared-install
  dependency each, no Lodekit icon abstraction to outgrow. Lucide itself stays a permanent
  base dependency either way — the vendored components use it internally (Select's
  chevron, Dialog's ×).

## 3. Theme (`theme.css`)

Tailwind v4 is CSS-first, so the theme is one stylesheet at the package root. An app's
`src/index.css` becomes a single line:

```css
@import "@lodekit/ui/theme.css";
```

`theme.css` owns the rest:

```css
@import "tailwindcss";
@source "./src";          /* UI-library source sits outside the app root; Tailwind must
                             be told to scan it, else component classes get purged */
/* shadcn CSS variables: light + dark blocks, mapped via @theme */
```

- Replaces the bare `@import "tailwindcss"` in app CSS — Tailwind's automatic content
  detection still covers the app's own source (Vite root = app dir); the `@source`
  directive (resolved relative to `theme.css`) covers the vendored components.
- **Tokens:** the standard shadcn variable set (`--background`, `--primary`, `--radius`,
  …) on a neutral base palette. System font stack — no webfonts, nothing fetched; local is
  the point.
- **Dark mode:** automatic via `prefers-color-scheme`. No toggle, no `.dark`-class
  plumbing at v0.1.
- Apps that keep a plain `@import "tailwindcss"` still build — the theme is opt-in by
  import; the scaffold and the skill make it the default path.

## 4. Toolchain integration

`build.ts` grows two aliases beside `react`, `react-dom`, and `@lodekit/sdk`:

- `@lodekit/ui` → the package dir (barrel + `theme.css` both resolve through it; Vite
  applies aliases to CSS `@import` too).
- `lucide-react` → Lodekit's shared copy, so `import { Plus } from "lucide-react"` works
  in dependency-free apps.

The existing `react`/`react-dom` aliases already guarantee a **single React instance**
across app code and UI-library components (Radix context would break otherwise) — worth a
test, not new machinery. The runtime declares `@lodekit/ui` as a workspace dependency so
`require.resolve` finds it.

## 5. Dashboard restyle

The dashboard stops being a hand-rolled vanilla page (`public/dashboard/index.html` +
`design-system.css`) and becomes a React + TypeScript app on the same stack as apps:

- **Source:** `packages/runtime/dashboard/` (`index.html` + `src/`). Not an app — no
  manifest, no registry entry, no slug, no data namespace. Same toolchain, same
  `@lodekit/ui` imports.
- **Build:** at runtime startup, before `listen`, via the same Vite config factory
  `runBuild` uses (`buildDashboard(cfg)`), with `base: "/_dashboard/"` and output to
  `cacheDir/_dashboard`. The underscore prefix sits outside the slug grammar
  (`^[a-z0-9-]+$`), so neither the cache dir nor the URL space can ever collide with an
  app. Dashboard build state does not enter the app build-state map or SSE stream.
- **Serving:** `/_dashboard` static-serves the built output; `/` sends its `index.html`.
  The `public/dashboard` page and the `/_lodekit` mount with `design-system.css` (its only
  content) are removed.
- **Behavior preserved:** app grid with icon/name/description, live build state and
  registry changes over the existing SSE events, app count, empty state — now rendered
  with Card/Badge/Skeleton instead of `innerHTML` string-building. React's default
  escaping closes the dashboard half of the roadmap's rendering-hardening item.
- **Dev iteration:** dashboard source is not watched; restarting the runtime rebuilds it.
  Acceptable for v0.1 — runtime development already works restart-wise.
- **Startup cost:** one extra Vite build (~1s) on every start, always run (no freshness
  check). Simple and correct; a mtime-based skip is a later optimization (roadmap).

## 6. Scaffold

The starter emitted by `scaffold.ts` demonstrates the stack it should teach:

- `src/index.css` → `@import "@lodekit/ui/theme.css";`
- `src/App.tsx` → imports at least one component from `@lodekit/ui` (e.g. Button or Card)
  so a fresh app renders themed from its first build.
- Storage imports (`db`, `store`) untouched — the kv-store v2 slice (slice 2) owns that
  surface.

## 7. Error handling

- **Dashboard build failure never downs the runtime** (cohesion invariant 8). If
  `buildDashboard` fails at startup, the runtime logs the error, serves a minimal inline
  fallback page at `/` showing the build error, and keeps hosting apps and the API.
- **App builds are unchanged:** a broken `@lodekit/ui` import in an app surfaces as that
  app's `error` build state, exactly like any other build failure.

## 8. Testing (minimum, per guardrails)

- **Build integration** (`build.test.ts`): a fixture app importing a component from
  `@lodekit/ui`, an icon from `lucide-react`, and `theme.css` reaches `ready`; the test
  asserts the built CSS contains both a theme token (e.g. `--primary`, proving `theme.css`
  was bundled) and a component-internal utility class (e.g. `inline-flex`, proving `@source`
  scanning generated classes from the vendored component source).
- **Dashboard** (`dashboard.test.ts`): after startup, `/` serves the built dashboard HTML
  and its `/_dashboard/` assets resolve; the build-failure fallback path renders instead
  of crashing.
- **Scaffold** (`scaffold.test.ts`): starter references `@lodekit/ui/theme.css` and builds.
- **Examples:** both example apps migrated and passing the existing e2e test.
- No unit tests for vendored shadcn component internals — upstream-vetted; the build
  integration test is the smoke.

## 9. Verification — what "done" proves

1. A scaffolded app builds and renders shadcn-themed with zero per-app dependencies.
2. The dashboard and the example apps visibly share one theme (light and dark).
3. `pnpm test` green; `pnpm dev` serves dashboard + migrated examples.

## 10. Roadmap follow-ups (to record on `roadmap.md` with this slice)

- Dashboard rendering-hardening (Security section) largely resolved by the React rewrite;
  the stale reference to `examples/apps/*/app.js` (pre-bundled-contract files that no
  longer exist) should be pruned when touched.
- Dashboard startup-build freshness skip (mtime/hash) if the ~1s cost starts to matter.
- Watch dashboard source in dev for rebuild-on-change, if restart friction grows.

## 11. Assumptions (decided in-session, confirmed on review)

Brainstormed autonomously, then reviewed 2026-07-02: confirmed as listed, with the core
set expanded to all base-dependency shadcn components and the Radix-vs-Base-UI rationale
recorded (§2):

1. **Dashboard as a runtime-built React app** (over: vanilla page sharing only theme CSS —
   drifts; committed prebuilt output — build artifacts in git). Dogfoods the toolchain and
   makes invariant 7 real.
2. **Dark mode by system preference only**, no toggle.
3. **Icons via a `lucide-react` alias** rather than barrel re-export (name collisions) or
   omission (agents will reach for icons immediately).
4. **Stock shadcn look on a neutral base, system fonts** — theme values provisional; the
   distinctive Lodekit identity is later 0.x design work.
