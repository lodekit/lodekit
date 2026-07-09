# Dashboard UI revamp

**Date:** 2026-07-09
**Status:** Approved design
**Scope:** `packages/runtime/dashboard` (all routes), one section-name change in
`packages/runtime/src/platformSettings.ts`, one vocabulary entry in `context.md`.

The dashboard grew organically — each page hand-rolls its own header and
back-links, the apps page doubles as navigation hub, and settings affordances
(blue modified dot, text Reset button, ghost Advanced toggle) accreted without a
system. This revamp introduces a proper app shell, consolidated navigation, and
a cleaned-up settings page. No runtime API changes except the Engine rename.

## 1. App shell

One shared shell rendered by `__root.tsx`; every route renders inside it.
Shared components live in a new `dashboard/src/components/` directory.

- One column, centered: `max-width` ~`56rem` (today's `max-w-4xl`), `min-width`
  ~`20rem`.
- Zones top to bottom: **header**, **content** (`<Outlet/>`), **footer**.
- Footer: the existing version line (`lodekit v0.1.0 <commit>`), faint
  (`text-muted-foreground`), unchanged.

### Header (desktop, ≥ 768px)

Floating: top margin, rounded corners, `bg-card`, border, subtle shadow,
content-width. Left to right:

1. **Logo** — links to `/` (the default content state).
2. flex spacer
3. **Command bar trigger**
4. flex spacer
5. **Services menu**
6. **Settings button** — ghost icon button (`Settings` icon), navigates to
   `/settings`.

### Header (narrow, < 768px)

Sticky at the top, full-width, no margin or rounding, border-bottom only. Same
elements, but the command bar trigger collapses to a magnifier icon button, and
the services menu opens a full-width panel expanding from the header's bottom
edge downward (see §3).

## 2. Header components

### Logo

The jar-cloud marks (source: `menubar-icons/svg`, `running` variation only) are
copied into the repo as three inline React components under
`dashboard/src/components/logo/` — variants `a` (solid), `b` (knockout), `c`
(outline) — with every `#000` fill/stroke converted to `currentColor`. Rendered
in `text-primary` so a custom theme's brand color carries through.

Which variant shows is driven by the **effective `appearance.icon_style`
setting** (the existing platform setting; default `b`), fetched from
`/api/settings` and kept live via the `settings-change` SSE event. The logo does
not change with runtime state — always the `running` mark.

### Command bar

shadcn `Command` in a dialog (the `CommandDialog` pattern from `@lodekit/ui`).

- **Trigger:** a button styled as a search input — magnifier icon, "Search…"
  placeholder, `⌘K` kbd hint right-aligned. Opens on click, focus, or the
  global ⌘K / Ctrl-K shortcut.
- **Contents (navigation only, two groups):**
  - **Apps** — each installed app (icon + name), selecting opens `/{appId}/`.
  - **Pages** — Data, Tasks, Events, Secrets, Logs, Themes, Settings, with the
    same icons as the services menu.
- Per-app actions and command-style verbs are out of scope for this revamp.

### Services menu

Gmail-style app grid. Trigger: grid icon button (`LayoutGrid`).

- **Desktop:** a `Popover` anchored bottom-end containing a 3×2 grid of
  icon-above-label tiles.
- **Entries and icons (lucide):**
  | Entry   | Icon         | Target                              |
  |---------|--------------|-------------------------------------|
  | Data    | `Database`   | `/data` (stub)                      |
  | Tasks   | `ListChecks` | `/tasks` (stub)                     |
  | Events  | `Zap`        | `/events`                           |
  | Secrets | `KeyRound`   | `/secrets`                          |
  | Logs    | `ScrollText` | `/logs`                             |
  | Themes  | `Palette`    | `/_ui/` — **full-page navigation**  |

  Themes navigates the whole browser tab: `/_ui/` is the static Storybook
  build and cannot render inside the SPA.
- All entries except Themes navigate within CONTENT (router links).
- **Narrow:** instead of the Popover, the same tile grid renders in a
  full-width panel attached to the sticky header's bottom edge, expanding
  downward over the content. One implementation of the grid, two containers.

## 3. Content pages

### Apps list (`/`, default state)

- Grid stays: 3 columns → 2 → 1 as width shrinks (1 per row below the narrow
  threshold).
- Card = app icon, title, description. **The whole card is a link** to
  `/{appId}/` (hover state as today).
- **All status badges are kept:** build state (`building…` / `ready` /
  `error`), `server error`, and the "N secrets needed" nudge (required visible
  by the secret-store spec §9). The secrets badge remains its own link to the
  app's settings section; it stops propagation so it doesn't trigger the card
  link. Badges must remain valid markup inside a card-as-link (no nested
  `<a>` — the card uses a click-handler or overlay-link pattern).
- **Removed:** the per-card Data / Tasks / Settings / Logs links, the inline
  `StorePanel` and `TasksPanel` expanders (deleted, not relocated), the "N
  apps" count, and the old header link row (Components / Settings / Secrets /
  Logs / Events) — the shell replaces all of it.

### Stub routes

`/data` and `/tasks`: centered empty state — section icon, section name, and a
one-liner ("Nothing here yet."). Registered in the router so the services menu
and command bar link to them normally. They will later host what the inline
panels did (KV browsing, task runs).

### Existing pages (`/events`, `/logs`, `/secrets`)

Content unchanged. Each drops its hand-rolled title-bar links ("← Apps",
"Dashboard") and keeps its `h1` + content — the shell now owns navigation.

### SSE consolidation

Today `index.tsx` and `settings.tsx` each open their own `EventSource`, and the
shell needs live data too (command bar app list, logo icon-style). A single
`EventSource` is lifted into a shell-level provider that translates bus events
into React Query invalidations (`apps`, `settings`, `secrets`, `kv`, `tasks`,
build/server state). Pages consume queries only. One SSE connection for the
dashboard's own pages (the theme resolver script, `/_ui/theme.js`, still opens its
own — consolidating that is remaining roadmap scope; also serves the roadmap's
"SSE connection budget" concern).

## 4. Settings page

### Layout

Inside CONTENT: a floating left sidebar (bordered, rounded card look matching
the floating header) + settings panels on the right. On narrow viewports the
sidebar collapses to a horizontal, scrollable section picker above the content.

Sidebar structure (current `?section=` search-param navigation is kept):

- `SETTINGS` heading — small caps, muted, a location marker, not a link
- General
- Appearance
- **Apps** section label → one entry per app (icon + name)
- **Services** section label → Store, Files, Tasks, Events, Logs, **Engine**

### Engine rename

The platform-settings section currently emitted as `"App hosting"` is renamed
to **`Engine`** at the source (`platformSettings.ts` section strings), so API
payloads, sidebar, and card titles all agree. **Vocabulary note:** "Engine" is
the person-facing name for the runtime (the app-hosting service); recorded in
`context.md`.

### Setting rows

- **Reset** is an icon button (`RotateCcw`) to the **left of the field
  control**. At default (unmodified): faint (`text-muted-foreground/40` range)
  and disabled. When modified: full opacity, enabled, tooltip "Reset to
  default".
- The blue "modified" dot is **removed** — the reset icon's state carries that
  signal.
- **Saved feedback:** on a successful write, a small check icon fades in beside
  the control and fades out after ~1.5 s (CSS transition; no toast). Write
  errors keep the current inline destructive text.
- **Advanced:** each settings card ends with a single Accordion item labeled
  `Advanced · N` (N = advanced field count), replacing the ghost-button
  Collapsible. Cards with no advanced fields render no accordion.
- Field controls, drift badges ("was reset to default"), the app secrets card,
  and service overrides keep current behavior, restyled into the new row.

## 5. Out of scope

- Real Data and Tasks pages (stubs only).
- Command-bar actions beyond navigation.
- Any runtime/API changes beyond the Engine section-name string.
- Storybook/`/_ui/` theming work.

## 6. Testing

- Existing dashboard tests (`dashboard.test.ts`, `dashboardFallback.test.ts`,
  `ui-serving.test.ts`) must stay green; the Engine rename updates any test
  fixture that asserts the `"App hosting"` section string.
- Smoke-level checks for the new surface: shell renders all routes, stub
  routes respond, command dialog opens, services grid links resolve.
- Human browser smoke on `pnpm dev` (desktop + narrow viewport) before folding.
