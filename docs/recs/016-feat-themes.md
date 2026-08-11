# 016-feat: Themes

**Status:** Active · **Last reviewed:** 2026-08-11

## Overview

Theming makes Lodekit's look the person's. A theme is a named, self-contained styling
unit — light and dark palettes, typography, icon set, radius, density — that the person
(or their agent) applies platform-wide or to a single app; the dashboard's theme editor
previews and edits themes against live components and real apps. The vendored default
theme carries the Cloud Captured identity, so a fresh install looks like Lodekit with
zero configuration while every app and the dashboard stay restylable as one product.

## Behavior

- A theme is one CSS file in a canonical format: typed tokens (UI, display, and mono
  font stacks, radius, spacing/density, icon library) plus the full shadcn color token
  set in a light and a dark block. Fonts load through the theme's own import lines, so
  switching themes switches fonts.
- Two tiers: vendored themes ship with the engine — the Cloud Captured `lodekit`
  default plus ports of Dracula, Catppuccin, Nord, and Rosé Pine (attribution kept;
  Nord and Rosé Pine select alternate icon sets, so that path is exercised by shipped
  themes) — read-only, updated by upgrades. User themes live in the Lodekit root's
  themes folder: agent-editable files whose filename slug (app-id grammar) is the
  identity, never colliding with vendored names.
- Selection lives in `root/themes/config.json` — a global choice plus per-app
  assignments. Resolution per target is app assignment → global → the `lodekit`
  default, falling back a step whenever a selection's file is missing; a malformed
  config degrades to defaults with a warning. The dashboard follows the global
  selection. The checked-in root assigns Greenhouse its own showcase theme.
- Delivery is serve-time: each app and the dashboard load one engine-served stylesheet
  resolved per request and never cached. The endpoint always answers with usable CSS —
  any failure degrades to the default theme — and the UI library's baked-in token
  defaults sit in a lower cascade layer so the served theme always wins. Theme changes
  never trigger app rebuilds.
- Editing a theme file or the config — by hand, agent, or editor — applies everywhere
  within a beat over SSE, no reload; icons flip live through the UI library's icon
  indirection, with the default set rendering until an alternate set loads.
- Light/dark mode is not a theme property: themes carry both palettes, and the
  appearance setting (012-feat-settings) picks which is live.
- The dashboard Themes page is the library: theme cards with use-everywhere, assign-to-
  app, and duplicate actions, plus rename/delete for user themes. Vendored themes open
  read-only with duplicate-to-edit.
- The editor previews light and dark, edits colors as roles that expand to individual
  tokens (a hand-authored theme that diverges from a role shows "mixed" rather than
  lying), and offers typography, icon-set, radius, and density controls. A component
  canvas restyles instantly; an App tab renders a real running app in an iframe against
  an in-memory preview draft — unsaved edits show live, never touch disk, and clear on
  restart. Saving an unedited theme reproduces its file byte-identically; unrecognized
  CSS is preserved verbatim and flagged.
- The retired override-file contract (a root-level and per-app token-override CSS) is
  ignored with a one-time startup warning naming the new location.

## Design Decisions

### 1. A theme is a CSS file, not a settings record

**Decision:** The theme artifact is one CSS file in a canonical, parseable format; the
engine stores and serves it as opaque content.
**Why:** Agents edit CSS the way they edit everything else; shadcn-ecosystem themes port
near-verbatim; files in the Lodekit root ride the person's backup (2026-07-16 theme
editor design).
**Tradeoff:** The editor needs a parser/serializer with strict fidelity guarantees
(byte-identical round-trip, verbatim preservation of unmodeled CSS) instead of a schema.

### 2. Serve-time delivery replaced build-time composition

**Decision:** Themes are resolved and served per request behind a never-cached
stylesheet link, with the library's defaults demoted into a cascade layer. This replaced
the original override-file model (2026-07-06 user theming design), where theme edits
recomposed files and rebuilt every app.
**Why:** Switching and editing become instant with no rebuild sweeps; deleting the
composition machinery shrank the engine's write surface; layered defaults make the
served theme win regardless of markup order.
**Tradeoff:** A blocking per-request stylesheet (negligible on loopback), and apps
scaffolded before the change needed a one-line link migration.

### 3. Whole switchable themes, not layered token overrides

**Decision:** Themes are complete and self-contained; per-app styling is assignment of a
whole theme, not a partial override layered over a global one.
**Why:** Self-contained themes are predictable ("this app looks exactly like that
theme"), portable, and let community ports stay verbatim.
**Tradeoff:** Changing one token means duplicating a theme; there is no inheritance.

### 4. Typed tokens carry typography, density, and the icon set in the CSS

**Decision:** The canonical format extends the color set with typed tokens — the three
font stacks including mono (006-arch-font-mono-theme-token), density as the spacing
unit, and the icon library — all riding in the one CSS file; the engine's only theme
parsing is extracting the icon token for clients.
**Why:** One artifact stays the whole truth; density and radius flow through existing
utility computation with zero component changes; icons switch per theme through name
indirection with a default-set fallback.
**Tradeoff:** Every new platform icon pays a per-alternate-set mapping tax, and unmapped
icons render but never switch sets.

### 5. Same-trust posture: no CSS sanitization

**Decision:** Theme CSS is treated as person/agent-authored local content served
same-origin — the same trust level as app code. Guards are name/slug validation before
any path use, vendored-write refusal, and a size cap; nothing inspects the CSS.
**Why:** A theme has strictly less power than the app JavaScript it styles; sanitization
would be theater on a single-person local tool.
**Tradeoff:** A hostile or broken theme can restyle surfaces deceptively; recovery is
editing or deleting a file.

### 6. The editor's component canvas replaced the Storybook catalog

**Decision:** The standalone Storybook-based UI catalog was retired; its reserved URL
redirects into the dashboard's Themes page, and the editor's curated component canvas is
the component visualizer.
**Why:** The canvas previews components under the exact draft being edited with zero
rebuilds; the static catalog was heavy to build, shipped per release, and duplicated the
preview job.
**Tradeoff:** No exhaustive per-component, per-variant reference surface remains — the
canvas is curated, not complete.

## Related

- **Recs:** 006-arch-font-mono-theme-token, 008-feat-dashboard, 012-feat-settings
- **Specs:** docs/specs/2026-07-06-user-theming-and-ui-catalog-design.md,
  docs/specs/2026-07-16-theme-editor-design.md,
  docs/specs/2026-07-19-lodekit-retheme-design.md
