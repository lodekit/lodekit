# Themes: library, per-app selection, and the theme editor — design

**Date:** 2026-07-16
**Status:** approved — stress-tested 2026-07-16 (see Stress Test Results)
**Scope:** GitHub issue #61 (theme editor / component visualizer), plus the theming-model
rework it forced: themes become named, self-contained, switchable entities delivered at
serve time, replacing the global+per-app override-file composition from the
[user theming spec](2026-07-06-user-theming-and-ui-catalog-design.md) §2. Ships the
runtime theme service and API, serve-time delivery, the icon indirection in
`@lodekit/ui`, 4–5 vendored themes, and the `/themes` dashboard surface (library +
editor + component visualizer).

## Product specification

- A **default theme** (`lodekit`, the cork-amber identity) applies across the platform —
  dashboard and all apps — with zero configuration.
- A **theme is self-contained**: light *and* dark palettes, typography (including font
  loading), icon library, radius, and density/spacing.
- The person can **view the available themes**: 4–5 vendored ports of popular open
  themes (Dracula, Catppuccin, …) plus their own.
- They can **switch the whole platform** to a theme, and **per app** select a different
  one.
- In the **theme editor** they preview a theme in light/dark mode. Vendored themes are
  read-only; **duplicate → edit → save / rename / delete** produces user themes, which
  are selectable exactly like vendored ones.

Light/dark **mode** is not part of this spec's scope changes: it remains the
`appearance.theme` setting resolved by `/_ui/theme.js` (settings spec §8). Themes carry
both palettes; mode picks which one is live.

## Non-goals

- Public ui.lodekit.com deploy of the component canvas (deferred; the canvas is built
  liftable).
- Self-hosted fonts (existing backlog item; themes keep using Google Fonts `@import`).
- Icon-name mapping coverage beyond the platform-used set (unmapped names fall back to
  Lucide).
- Theme import/export or sharing.

## 1. Theme model and format

A theme is **one CSS file in a canonical format** — CSS, not JSON, so agents edit themes
the way they edit everything else, and shadcn-ecosystem themes port near-verbatim:

```css
/* Dracula — ported from github.com/dracula (MIT) */
@import url("https://fonts.googleapis.com/css2?family=…");

:root {
  --font-ui: "…", ui-sans-serif, system-ui, sans-serif;
  --font-display: "…", Georgia, serif;
  --radius: 0.5rem;
  --spacing: 0.25rem;      /* density: Tailwind v4 derives all spacing utilities from it */
  --icon-library: lucide;  /* which vendored icon set the theme uses */

  /* full shadcn token set, light values: --background … --sidebar-ring, --chart-1..5 */
}
.dark {
  /* same color token set, dark values */
}
```

- **Density** is Tailwind v4's `--spacing` root variable — `p-*`/`m-*`/`gap-*` utilities
  compute `calc(var(--spacing) * n)`, so it is already runtime-overridable; no component
  changes.
- **`--icon-library`** rides in the CSS as a custom property so the theme file stays the
  single artifact; JS learns it via `/_ui/theme.json` (§2), never by parsing CSS
  client-side.
- Fonts a theme uses are loaded by the theme's own `@import` lines — a theme is
  self-contained; switching themes switches fonts.

**Two tiers:**

- **Vendored themes** ship in the runtime package (`packages/runtime/themes/*.css`):
  `lodekit` (cork amber; the Fraunces/Hanken Grotesk `@import` moves here from
  `@lodekit/ui`), plus ports of Dracula, Catppuccin (Latte/Mocha as its light/dark), and
  one or two more (Nord, Rosé Pine). Read-only, always present, updated by upgrades.
  Each port defines its own CVD-checked `--chart-1..5` series from its palette. At
  least one port ships a non-lucide `--icon-library`, so the alternate-icon-set path
  is exercised by a shipped theme, not only by tests.
- **User themes** live in `<Lodekit root>/themes/<slug>.css` — visible, agent-editable,
  created by duplicating any theme. The filename slug is the identity (same grammar as
  app ids); rename = rename the file. User slugs may not collide with vendored names.

**Selection** lives in `<root>/themes/config.json`, owned by the runtime theme service,
agent-editable like everything in the root:

```json
{ "global": "dracula", "apps": { "greenhouse": "lodekit" } }
```

Resolution per target: app assignment → global → `lodekit`. Missing file, missing key,
or an unresolvable name falls back one step (with a logged warning). The dashboard
follows the global selection. Service writes to `config.json` and theme files go
write-temp-then-atomic-rename, so the watcher and concurrent readers never observe torn
files; concurrency is last-write-wins (single-person local tool).

**Retired contract:** `<root>/theme.css` and `apps/<id>/theme.css` override composition.
The runtime logs a one-time startup warning when legacy files exist, naming the new
location; the files are otherwise ignored. This repo's `root/theme.css` and Greenhouse's
override convert into the new format in this slice.

## 2. Runtime: serve-time delivery, API, live updates

### Delivery

Apps and the dashboard each carry one blocking stylesheet link in `__root.tsx`, next to
the existing `theme.js` script tag (scaffold template + Greenhouse + Welcome +
dashboard):

```html
<link rel="stylesheet" href="/_ui/theme.css?app=<app-id>" />
```

`GET /_ui/theme.css` resolves the effective theme for the target (`?app` validated
against the app-id grammar and registry; absent → global, which is what the dashboard's
link uses) and serves that theme file, `Cache-Control: no-store`. The endpoint **always
answers 200 with usable CSS** — it is a blocking resource in every page load, so any
internal failure (missing file, resolver error) degrades to the `lodekit` theme, never
an error response. To make the served theme always win, the token defaults in
`@lodekit/ui/theme-tokens.css` move into a named `@layer` — layered declarations lose to
the unlayered served theme regardless of document order, so correctness never depends on
link position.

**Deleted:** the `@lodekit/ui/theme-overrides.css` Vite alias machinery in `build.ts`
(`themeOverrideFiles`, composed-file writing, the alias), theme-triggered rebuild sweeps
in the watcher, and the Google Fonts `@import` in `packages/ui/theme.css`. Theme changes
never trigger builds.

### Live apply

The watcher adds a depth-1 watch on `<root>/themes/` (theme CSS + `config.json`); any
add/change/unlink emits a `theme-change` event on the existing SSE bus. `theme.js` —
already subscribed to `/api/events` in every app — additionally listens for
`theme-change` and cache-busts the theme link (swaps `href` with a nonce). Switching,
reassigning, or editing a theme (by hand, agent, or editor) applies everywhere within a
beat, no reload. If SSE is transiently down, the next load is still correct (`no-store`).

`/_ui/theme.json` grows an `iconLibrary` field and accepts the same `?app=<id>` param;
the runtime extracts `--icon-library` from the effective theme (the only theme-CSS
parsing the runtime does) and `theme.js` stamps it as `data-icon-library` on `<html>`
(§3). `theme.js` learns its target by reading the theme link's `href` from the DOM — the
script tag itself stays identical everywhere.

### Theme API (dashboard-facing, scoped-API surface)

| Endpoint | Behavior |
|---|---|
| `GET /api/themes` | Library: `[{ name, vendored, iconLibrary }]` + current `config` |
| `GET /api/themes/:name` | Raw CSS |
| `PUT /api/themes/:name` | Create/update a **user** theme (body = CSS). Slug grammar, vendored-collision rejection, size cap |
| `POST /api/themes/:name/duplicate` `{to}` | Copy any theme to a new user slug |
| `POST /api/themes/:name/rename` `{to}` | User themes only; rewrites config references atomically |
| `DELETE /api/themes/:name` | User themes only; selections referencing it fall back |
| `PUT /api/themes/config` | Set global and/or per-app selection; validates theme names and app ids |
| `PUT /api/themes/preview` `{css}` | Single in-memory draft slot (same size cap as theme `PUT`); `GET /_ui/theme.css?preview=1` serves it. Never touches disk; cleared on restart. Empty slot → falls back to normal resolution (stale preview flags self-heal) |

The runtime treats theme CSS as opaque content (store, validate name/size, serve).
Trust boundary: theme CSS is person/agent-authored local content served same-origin —
the same trust level as app code — so no CSS sanitization beyond the size cap; the
API's guards are slug/name/app-id validation and vendored-write refusal.

## 3. `@lodekit/ui`: icon system and token plumbing

### Icon indirection

New subpath export **`@lodekit/ui/icons`**: named icon components with **Lucide's names
as the canonical vocabulary**, prop-compatible with lucide (`size`, `strokeWidth` where
applicable, `className`):

```tsx
import { Settings, Trash2 } from "@lodekit/ui/icons"; // was: from "lucide-react"
```

- **Active set:** a `useSyncExternalStore` hook observes `data-icon-library` on `<html>`
  (stamped by `theme.js`), so icons flip live on theme switch.
- **Vendored sets, v1:** Lucide (default, statically bundled — it is also the fallback),
  **Phosphor** and **Tabler** (both MIT, large coverage, visually distinct) as lazy
  per-set chunks via dynamic import — apps pay for alternates only when a theme selects
  them. Until a chunk resolves, the lucide glyph renders (same box, no layout shift).
- **Name mapping:** a generated per-set map translates canonical names (e.g. `Settings`
  → Phosphor `Gear`), produced by a committed dev-time script with its output checked
  in — never an install-time or runtime step. Coverage: every icon name actually used across `@lodekit/ui`, the
  dashboard, the scaffold, Greenhouse, and Welcome — a bounded list enforced by a scan
  test — plus best-effort identical-name auto-matches. **Unmapped name → lucide
  fallback**: exotic icons never break, they just don't switch.

**Migration:** every direct `lucide-react` import in `@lodekit/ui` components, the
dashboard, both bundled apps, and the scaffold template moves to `@lodekit/ui/icons`.
`lucide-react` leaves the app-facing contract (apps may still import it; they opt out of
icon theming).

### Token plumbing

- `theme-tokens.css` declarations wrap in the named `@layer` (§2) and gain `--spacing`
  and `--icon-library` defaults; the Google Fonts `@import` moves to the `lodekit`
  vendored theme.
- No component changes for density/radius — Tailwind v4 utilities already compute from
  `--spacing` / `--radius`.
- Charts already resolve `--chart-1..5` at render time; vendored themes restyle charts
  for free.

## 4. The `/themes` surface: library + editor

### Library view

Replaces the `EmptyStub` at `/themes`. A grid of theme cards — name, vendored badge,
swatch strip, light/dark mini-preview rendered from the parsed palette. Card actions:
**Use everywhere** (sets `config.global`), **Assign to app…** (menu of installed apps),
**Duplicate**, and for user themes **Rename / Delete**. A header strip shows current
state ("Global: Dracula · greenhouse → Lodekit") with inline unassign. Opening a card
enters the editor; vendored themes open read-only with a prominent "Duplicate to edit".

### Editor view (`/themes/$name`)

shadcn/create-style layout: controls in a large left sidebar, preview filling the rest.

- **Light/dark toggle** atop the sidebar: switches the preview *and* which palette the
  color controls edit. Radius, density, fonts, icons are shared across modes.
- **Color roles** — each a swatch row that expands to its underlying tokens:

  | Role | Writes |
  |---|---|
  | Brand | `--primary` (+fg), `--ring`, `--sidebar-primary` (+fg) |
  | Background | `--background`, `--foreground` |
  | Surface | `--card`, `--popover`, `--sidebar` (+ their fgs) |
  | Muted | `--muted` (+fg), `--secondary` (+fg), `--accent` (+fg), `--sidebar-accent` (+fg) |
  | Border | `--border`, `--input`, `--sidebar-border`, `--sidebar-ring` |
  | Destructive | `--destructive` |
  | Charts | `--chart-1..5` (five explicit swatches) |

  Editing a role writes its whole group (foregrounds auto-derived mode-appropriately);
  the expanded view edits tokens individually, so hand-authored themes that deviate from
  the role derivation still display and round-trip faithfully — a diverged role shows a
  "mixed" state instead of lying.
- **Typography:** two selects (`--font-ui`, `--font-display`) from a curated list (~a
  dozen Google families + system stacks); the editor manages the theme file's `@import`
  line to match.
- **Icons:** select among vendored sets, with a live glyph-row preview.
- **Radius** slider; **Density** select (Compact / Default / Comfortable → `--spacing`
  values).

### Preview pane, two tabs

- **Components** — a curated in-page composition of `@lodekit/ui` (sidebar/nav, cards,
  form fields, table, dialog trigger, charts, badges, icon row). Edits apply instantly
  as inline custom properties on the preview subtree — zero network. This canvas is the
  Storybook-successor component visualizer, built self-contained so a future
  ui.lodekit.com deploy can lift it.
- **App** — app picker + iframe. The editor `PUT`s the serialized draft to the preview
  slot and loads the app in the iframe with a `?lodekit-theme-preview=1` page param;
  `theme.js` detects it (persisting the flag in `sessionStorage` so SPA navigation keeps
  it), retargets the theme link to `?preview=1`, and re-busts it when a preview `PUT`
  emits its `theme-change` SSE — so unsaved edits render live against a real running
  app. Normal windows never carry the flag and are unaffected by draft updates.

### Save / dirty state

Save serializes the model to canonical CSS and `PUT`s it; the watcher/SSE path applies
it live. Unrecognized CSS found at parse time is preserved verbatim in a trailing block
(with a "contains custom CSS" notice in the editor). Dirty-state guard on navigation.
The **parser/serializer is a pure TS module** in the dashboard source with round-trip
unit tests — saving a cleanly-parsed theme with no edits produces a **byte-identical
file**; the runtime never parses theme CSS beyond the `--icon-library` extraction.

## 5. Edge cases and failure handling

- Selected theme deleted/renamed on disk → resolver falls back (app → global →
  `lodekit`), watcher emits `theme-change`, UI reflects it; warning logged. Stale config
  references are ignored at read, cleaned on next config write.
- Malformed `config.json` → default theme + logged warning; library view still works and
  rewrites it cleanly on next selection.
- Invalid CSS in a user theme → served as-is (browsers are tolerant; same trust level as
  app code). Editor parses best-effort and preserves what it can't model.
- API guards: slug grammar + length, vendored-name collisions rejected, vendored
  write/rename/delete refused, size cap on `PUT`, app-id validation on assignment.
- Legacy `theme.css` files → one-time startup warning naming the new location; the
  phase-1 changelog entry calls out the break explicitly.
- Apps scaffolded before this release lack the theme link in `__root.tsx` — they keep
  the default look and ignore theme switching until the link line is added (a one-line
  agent-assisted edit; the runtime cannot inject it into worker-SSR'd HTML). Named in
  the changelog entry alongside the legacy-file break.

## 6. Testing

- **Runtime (vitest):** theme service — resolution chain + fallbacks, CRUD validation,
  rename rewrites config, delete-while-selected; endpoint tests for
  `/_ui/theme.css?app=…`/`?preview=1` and `/api/themes*`; watcher → `theme-change` SSE;
  **path containment** — slug/app-id validation rejects traversal on every themes
  endpoint (`PUT`, `duplicate`, `rename`, `DELETE`, `?app`) before any path join.
- **Dashboard:** parser/serializer round-trip (canonical → model → identical file;
  custom CSS preserved; role "mixed" detection).
- **`@lodekit/ui`:** icon indirection — mapping lookup, unmapped-name lucide fallback,
  attribute-driven set switch; a scan test asserting no direct `lucide-react` imports
  remain in ui/dashboard/scaffold/bundled apps and every used name has alternate-set
  mappings.
- **Manual smoke:** switch themes globally + per-app in the browser, both modes, icons
  flip, density visibly changes, app iframe shows unsaved edits.

**Definition of done (Greenhouse):** Greenhouse imports icons from `@lodekit/ui/icons`
and the dev root ships a per-app assignment in `themes/config.json`, exercising per-app
selection; `root/README.md` checklist gains a theming entry.

## 7. Phasing

One spec, sequenced implementation; each phase lands green:

1. Runtime theme service + serve-time delivery + vendored `lodekit` theme + retire the
   override-file contract.
2. Icon indirection + platform-wide import migration.
3. Theme ports (Dracula, Catppuccin, Nord, Rosé Pine).
4. Library view (switching, assignment, duplicate/rename/delete).
5. Editor (controls, preview canvas, app iframe, save).

## 8. Deferrals (→ `defer`-labeled beads / issues)

- ui.lodekit.com public deploy of the component canvas.
- Self-hosted fonts (themes currently `@import` Google Fonts).
- Icon mapping coverage beyond the platform-used set.
- Theme import/export or sharing.

## Stress Test Results: theme library + editor (2026-07-16, lk-hmg)

### Resolved Decisions

- **CSS file as source of truth** — agreed. Agent-editability and near-verbatim shadcn
  ports outweigh parser cost; parser risk bounded by canonical format + verbatim
  preservation + round-trip tests.
- **Serve-time delivery (`no-store` + `@layer`)** — agreed. Cascade-layer behavior is
  bedrock CSS; localhost latency negligible; deleting build-time composition shrinks
  complexity and the write surface.
- **`config.json` last-write-wins** — agreed. Locks/CRDTs would be over-engineering for
  a single-person tool; watcher + SSE reconciles losers within a beat.
- **Icon indirection with both alternates (Phosphor + Tabler)** — kept as specified
  after explicit discussion of the recurring per-icon mapping tax (scan-test-enforced,
  two lookups per new platform icon) and the one-alternate option; the engineer chose
  to keep both.
- **Single in-memory preview slot** — agreed; multi-window clobber accepted (wrong
  preview, no data loss).
- **Security** — trust model holds: theme CSS is same-origin person/agent-authored
  local content with strictly less power than app JS; sanitization beyond the size cap
  would be theater. No control weakened; no new network exposure.
- **Legacy retirement, warning-only** — agreed. Auto-migrating partial overrides would
  bake defaults into a frozen fork — worse than the warning.
- **Density via Tailwind v4 `--spacing`** — assumption verified in-repo (v4.3;
  utilities emit `calc(var(--spacing) * n)`; Tailwind's default lives in
  `@layer theme` so the unlayered served value wins). Type scale intentionally
  unaffected.
- **5-phase sequencing** — agreed; no phase depends on a later one; maps to one plan,
  one epic, ~5 task beads.

### Changes Made

- `/_ui/theme.css` always answers 200 with usable CSS (blocking-resource guarantee).
- Config/theme writes are write-temp-then-atomic-rename.
- Preview `PUT` gets the theme-`PUT` size cap; empty preview slot falls back to normal
  resolution (stale flags self-heal).
- Icon name maps: committed dev-time script, output checked in; at least one vendored
  port ships a non-lucide `--icon-library`.
- Parser/serializer: unchanged parse→save is byte-identical.
- Path-containment validation is a tested invariant on every themes endpoint.
- Legacy break + pre-existing-app link migration named in the phase-1 changelog entry.
- Pre-2026-07 apps lack the theme link (§5 edge case; one-line agent-assisted fix).

### Deferred / Parking Lot

- Role-derivation contrast safety for auto-derived foregrounds — the "mixed" state
  already keeps divergent themes honest; revisit only if derived pairs prove illegible.
- Port licensing: keep the attribution header comment (as in the §1 example) in every
  vendored port.

### Confidence Assessment

- Overall: **High**.
- Areas of concern: parser/serializer round-trip fidelity under adversarial
  hand-authored CSS (mitigated by verbatim preservation); recurring icon-mapping tax
  accepted knowingly with both alternate sets.
