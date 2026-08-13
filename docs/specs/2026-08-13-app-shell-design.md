# App shell — design

**Date:** 2026-08-13
**Status:** draft — pending approval
**Scope:** The dashboard's header-only chrome becomes a full app shell — a header row
plus a left icon rail, laid out as a bordered grid (reference: shadcn-ui-blocks
"card-grid-shell"). The shell is extracted into `@lodekit/ui` as an `AppShell`
component so lodekit apps render the same platform chrome inside their own documents,
under their own designated themes. The scaffold and both showcase apps adopt it.

## Goals

- One shell, two surfaces: the dashboard and every app render the same `AppShell`
  component; the only difference is the identity slot (Lodekit wordmark vs app
  icon + name) and how links navigate (SPA vs full-page).
- Header: Lodekit badge in the rail-width cell; identity, centered command bar, and
  an inert notification button in the wide cell.
- Left rail: the person's apps as icon buttons (tooltips for names), and a bottom
  cluster — Services (chevron-expandable inline, persisted) and Settings.
- Small screens: the rail collapses into a slide-out nav panel; the view pushes right
  when it opens (Claude-iOS-style), the command bar becomes a search button.
- Apps keep their designated theme: the shell lives inside the app document, so the
  existing `/_ui/theme.css?app=` link themes the chrome for free.
- Greenhouse's hand-rolled top nav is reworked to sit naturally inside the shell.

## Non-goals

- **No notification feature.** The bell renders and does nothing; behavior is future
  work (TODO line filed in this PR).
- **No enforcement.** The shell is convention: apps render it from their own
  `__root.tsx`. An app that omits it still works (decision below).
- **No desktop expand/collapse.** The rail is a fixed-width icon column; only the
  small-screen panel opens and closes.
- **No page redesigns.** Every dashboard route keeps today's content and column;
  apps keep their own pages. Only chrome changes.
- **No shadcn `Sidebar` primitive adoption.** Plain composition (decision below).
- **Theme-editor preview unchanged in intent:** the live app iframe will now show the
  app's shell too — accepted as a truthful preview. Revisit only if it grates.

## Decision record

- **Delivery: `@lodekit/ui` shell component**, rendered by each app's own
  `__root.tsx` — not an engine-injected wrapper, not an iframe host. Inside the app
  document the shell inherits the app's designated theme and icon library with zero
  plumbing; the dashboard uses the identical component. (Person, this session.)
- **Desktop rail is fixed** — icon-only, no expanded state, names on hover.
  (Person, this session.)
- **Services expand inline** — clicking the Services button (or its chevron) expands
  the seven service icons into the rail; the popover `ServicesMenu` is deleted.
  (Person, this session.)
- **App identity swap** — inside an app, the header identity slot shows the app's
  icon + name; the badge cell stays the Lodekit mark. Command bar and notification
  button are unchanged across surfaces. (Person, this session.)
- **Services-expanded persists in `localStorage`** — first dashboard use; sets the
  precedent for UI-only preferences. Key namespace `lodekit:shell:*`. (Person, this
  session.)
- **Empty-rail copy:** "Your apps live here." (Person, this session.)
- **Greenhouse nav reworked** as part of showcase adoption — a slim content-area tab
  row, not a second header bar. (Person, this session.)
- **Shell data comes from a new `GET /_ui/shell.json`**, not the dashboard's
  `/api/*`. Apps reach platform services only through the SDK (ARCHITECTURE
  invariant); the shell is chrome, and chrome already has a namespace — `/_ui/*`
  (theme.css, theme.js, theme.json, favicon.svg). One unprivileged endpoint serves
  exactly what the chrome needs. (Session; flagged for review.)
- **Small-screen open animation is a push, not an overlay** — the view slides right
  and recedes while the panel enters from the left, per the reference screenshot.
  Custom composition; the shadcn `Sidebar`/`Sheet` overlay mode doesn't do this,
  which (with the fixed desktop rail) is why the primitive isn't adopted — the third
  surface to decline it, after the theme editor and the data explorer. (Person, this
  session.)
- **Supersedes** the data-explorer spec's "no whole-dashboard shell change" ruling
  (2026-07-14) and the shell sections (§1–§2) of the dashboard UI revamp spec
  (2026-07-09). Specs are history; they are not edited.

## 1. Shell anatomy (≥ md)

A full-viewport grid, two columns by two rows, cells separated by `border` dividers —
no floating card header anymore; the header and rail are fixed and only the content
cell scrolls.

```
┌──────┬──────────────────────────────────────────────┐
│ badge│ identity        [ command bar ]          bell │  h-14, border-b
├──────┼──────────────────────────────────────────────┤
│ apps │                                              │
│  …   │                 content                      │
│      │                 (scrolls)                    │
│ ──── │                                              │
│ ⌃    │                                              │
│ srv  │                                              │
│ cog  │                                              │
└──────┴──────────────────────────────────────────────┘
  3.5rem rail, border-r
```

- **Badge cell** (top-left, rail-width): the Lodekit `Mark` (style from the effective
  `appearance.icon_style`), centered, linking to the dashboard home. On the
  dashboard it reads as the lockup split across the grid seam: mark in its cell,
  wordmark starting the next cell — same `size-6` mark, `0.6em`-equivalent gap to the
  seam, 80% opacity as a unit.
- **Header right cell**: three zones via the existing flex-spacer pattern.
  - *Identity, left-aligned:* dashboard mode — the `Lodekit` wordmark, unchanged
    typography (`--lk-font-wordmark`, `1.2rem`, `tracking-[0.22em]`, uppercase),
    linking to the dashboard home. App mode — the app's manifest icon (emoji) + app
    name in `--font-display` weight-medium, linking to the app's home (`/<appId>/`).
  - *Command bar, centered:* today's trigger + `CommandDialog`, moved into the shell
    (§3). ⌘K everywhere, dashboard and apps.
  - *Notification button, right-aligned:* ghost icon button, `Bell` icon,
    `aria-label="Notifications"`, no handler. Inert by design.
- **Rail** (left column, below the badge cell), styled with the `--sidebar-*` token
  family (its first consumer): three regions in a flex column.
  - *Apps* (top, `overflow-y-auto` when long): one icon button per app from the
    shell data, the manifest emoji centered in a square hit area, name in a
    `Tooltip` opening to the right, ordered as `/api/apps` orders (by name). The
    current app (app mode) gets the active treatment: sidebar-accent wash, no left
    border stripe (DESIGN.md nav ruling). Click navigates to `/<appId>/`
    (full-page; apps are separate documents even from the dashboard).
    - *Empty state:* three small muted dots stacked vertically, one `Tooltip` for
      the group, opening right: **"Your apps live here."** While shell data is
      still loading, the same dots render without the tooltip (loading and empty
      share geometry, only the affordance differs).
  - *Bottom cluster*, pinned with `mt-auto`:
    - A small chevron (`ChevronUp`, rotating to `ChevronDown` when expanded)
      directly above the Services button; both toggle the same expansion.
    - **Services button**: `LayoutGrid` icon, `aria-expanded`, tooltip "Services".
      Expanded, the seven service icons (Data, Tasks, Events, Secrets, Gateways,
      Logs, Themes — icons per the canonical map) appear inline above it, each with
      a right-opening tooltip, the active service washed like the active app. The
      popover `ServicesMenu` and the narrow under-header panel are deleted.
    - **Settings button**: `Settings` icon, tooltip, last item.
- **Content cell**: `overflow-y-auto`; hosts the surface's own content unchanged —
  the dashboard keeps its `main` column (`mx-auto max-w-[70rem] …`, including the
  data explorer's full-bleed arrangement) and the version-line footer moves to the
  bottom of this cell (dashboard only; the build defines don't exist in app builds).
  Apps render whatever they render today.

Focus, physics, motion: stock ring, theme-carried physics, no entrance choreography —
the shell is tokens-only composition per DESIGN.md's product-shell rules.

## 2. Small screens (< md)

The grid collapses to a single column; the rail disappears into a nav panel.

- **Header**: the badge cell is replaced by a panel-open icon button (`PanelLeft`,
  `aria-label="Open navigation"`). The identity slot hides (both modes). The command
  trigger becomes the bare search icon button, right-aligned; the notification
  button stays rightmost. Order: `[open] ──space── [search] [bell]`.
- **Panel open**: the panel (`--sidebar-*` surfaces, ~18rem) slides in from the left
  while the whole view — header and content — translates right and recedes slightly
  (small scale-down, radius on the revealed edge, dim scrim), matching the reference
  screenshot. 200–300ms, theme easing; `prefers-reduced-motion` replaces transforms
  with a plain fade. Body scroll locks; dialog semantics (focus trap, `Esc` closes);
  scrim tap and any navigation close it. State is ephemeral (`useState`), never
  persisted.
- **Panel content**, top to bottom:
  - The full lockup: badge + `Lodekit` wordmark (both modes — identity of the
    platform, not the app).
  - Apps as full rows: emoji + name, active app washed. Same empty state, inline
    text instead of a tooltip.
  - `Services` group label (a `Kicker`), then the seven services as rows — always
    expanded here; the rail's persisted toggle applies to the rail only.
  - A Settings row, separated by extra top margin, no group label.

## 3. `AppShell` in `@lodekit/ui`

New `packages/ui/src/components/app-shell.tsx` (exported from the index), plain
composition over existing primitives (`Tooltip`, `Button`, `Kbd`, `Kicker`, the
command set). No new dependencies — in particular **no react-query**; the ui package
stays framework-light.

```ts
type ShellApp = { appId: string; name: string; icon?: string };
type AppShellProps = {
  app?: ShellApp;                 // present → app mode; absent → dashboard mode
  apps?: ShellApp[];              // live override; absent → fetched from shell.json
  iconStyle?: "a" | "b" | "c";    // live override; absent → from shell.json
  renderLink?: RenderLink;        // SPA adapter; default renders plain <a>
  children: ReactNode;
};
```

- **Data**: when `apps`/`iconStyle` props are absent, the shell fetches
  `/_ui/shell.json` once on mount (client-side; SSR renders the loading rail). The
  dashboard passes both props from its existing react-query + SSE plumbing, so its
  chrome stays live; apps take the fetch-once default.
- **Links**: the shell addresses everything by absolute href — `/<appId>/` for apps,
  `/_dashboard/<page>` for services and settings. Default rendering is a plain
  `<a>` (correct in app documents: cross-document navigation). The dashboard passes
  a `renderLink` adapter that maps `/_dashboard/*` hrefs onto TanStack `Link`s so
  SPA navigation is preserved; app links stay full-page everywhere.
- **Command bar** moves into the shell module, rewritten off react-query to consume
  the shell's apps data. Same contents (Apps / Services / Settings), same ⌘K, same
  `CommandDialog`-wraps-`Command` structure — the base-nova mounting caveat and its
  regression test already live in this package and stay authoritative. Selection
  navigates via the same link/adapter mechanics as the rail.
- **Marks**: the `Mark` component (currently `dashboard/src/components/logo.tsx`)
  moves next to `marks.ts` in `@lodekit/ui`; the dashboard's `Logo`/`MARKS` become
  thin re-uses. The wordmark font (`--lk-font-wordmark` + its `@import`) moves from
  `dashboard/src/index.css` into the ui package's stylesheet so app documents get
  it too (the panel lockup needs it); the import-ordering caveat moves with it, and
  the dashboard's copy is deleted.
- **Services source of truth**: `SERVICES` and `SERVICE_ICONS` move from
  `dashboard/src/components/nav.ts` into the shell module (icons via
  `@lodekit/ui/icons`, hrefs absolute). The dashboard's settings page and anything
  else importing `nav.ts` re-import from `@lodekit/ui`; `nav.ts` is deleted. The
  `to`/`href` `ServiceEntry` duality dies — hrefs only, adapters decide.
- **Persistence**: `localStorage["lodekit:shell:services-expanded"]` (`"1"`/absent).
  Default collapsed. Initial render is collapsed for deterministic SSR markup; the
  stored value applies in a mount effect. Dashboard and apps share the origin, so
  the preference holds across the whole platform.

## 4. Engine: `GET /_ui/shell.json`

Beside the theme endpoints in `server.ts`, `no-store`:

```json
{ "apps": [{ "appId": "…", "name": "…", "icon": "…" }], "iconStyle": "b" }
```

`apps` from `scanApps(cfg.appsDir)` (name-sorted, `_dashboard` structurally absent),
`iconStyle` from the effective `appearance.icon_style` (default `b`). Read-only,
no params, same trust posture as `/_ui/theme.json`. The dashboard keeps using
`/api/apps` and `/api/settings` for its page content; only chrome reads this.

## 5. Dashboard adoption

- `routes/__root.tsx`: `<Header/>` + `<main>` are replaced by `<AppShell>` in
  dashboard mode wrapping the existing `main` column and the version footer. The
  shell receives `apps` (react-query `["apps"]`, SSE-invalidated), `iconStyle`
  (from the `["settings","_platform"]` query, live via SSE), and the TanStack
  `renderLink` adapter.
- Deleted: `components/header.tsx`, `components/services-menu.tsx`,
  `components/nav.ts`, and `components/command-bar.tsx` (superseded by the shell's).
  `logo.tsx` shrinks to the settings-page `MARKS` re-export over the ui `Mark`.
- Behavior deltas accepted: the header is always visible (no scroll-away desktop
  card); services live in the rail, not a popover.

## 6. App adoption: scaffold + showcase

- **Scaffold** (`scaffold.ts` `rootTsx`): the body becomes
  `<AppShell app={{ appId, name, icon }}><Outlet/></AppShell>` with the manifest
  values interpolated. New apps are born with the shell.
- **Welcome**: same one-line adoption in its `__root.tsx`.
- **Greenhouse**: adopts the shell, and its hand-rolled `<nav>` is reworked into a
  slim tab row at the top of the content area (Conservatory / Almanac / Potting
  Shed keep their names and icons) — the intended pattern for an app's own nav
  inside the shell, tokens-only. `root/README.md`'s coverage checklist gains the
  shell row (Definition of Done).
- An app that renders no shell keeps working; the contract is unchanged, the
  scaffold just makes the shell the default.

## 7. Documentation

- **ARCHITECTURE.md** — the `packages/ui` entry gains the shell (platform chrome
  component consumed by apps and dashboard); the engine's door description mentions
  `/_ui/shell.json` alongside the theme endpoints.
- **DEFINITIONS.md** — new term: **Shell** (the platform chrome — header, rail,
  nav panel — rendered by `AppShell` on the dashboard and inside apps).
- **DESIGN.md** — the product-shell section describes the shell anatomy in one
  breath (header + rail grid, sidebar tokens) and records the lockup ruling: in the
  shell header the lockup may split across the grid seam; the panel and marketing
  surfaces keep the joined lockup.
- **CHANGELOG.md** — New: platform app shell (header + icon rail) on the dashboard
  and, via `@lodekit/ui`, inside apps; `/_ui/shell.json`. Changed: services popover
  replaced by the rail's inline expansion; scaffolded apps include the shell.
- **TODO.md** — the inert notification button (wire it when notifications exist);
  theme-editor live preview now shows the app's shell (revisit if it reads noisy).
- **web/docs** — audit `guide/` pages that show an app `__root.tsx` or describe the
  dashboard header; update whichever exist to the shell.

## Rollout

One PR, phased commits, each green: shell.json + `AppShell` with render tests →
dashboard adoption → scaffold + showcase adoption → docs. No migration: existing
user apps are untouched until they add the component; the scaffold change only
affects newly created apps.

## Verification

- `pnpm test` green. New: ui render tests for `AppShell` (dashboard vs app mode,
  identity swap, empty/loading rail, services expand + localStorage persistence,
  panel a11y attributes); engine test for `/_ui/shell.json` (shape, icon-style
  default, no-store); scaffold snapshot updated.
- `pnpm e2e` green — dashboard key element still found (selectors updated if the
  old header was load-bearing), welcome and greenhouse render zero-console-error
  with the shell.
- Visual pass (Playwright MCP): desktop grid on dashboard + greenhouse (moss theme
  on the chrome), rail tooltips, services expand persisting across a reload, narrow
  viewport push animation and panel contents, reduced-motion fallback.
