# 017-feat: Per-app favicons

**Status:** Active · **Last reviewed:** 2026-08-11

## Overview

Every Lodekit page shows a meaningful browser-tab icon instead of the generic globe.
Favicons are derived from two choices the person has already made — each app's manifest
emoji and the menubar mark style selected in Settings — so there is no chooser UI and
nothing new to configure. The person sees them in browser tabs; apps and the dashboard
carry them automatically.

## Behavior

- An app's browser tab shows the app's manifest emoji as its favicon. An app whose
  manifest declares no icon shows the package emoji — the same fallback the dashboard
  grid uses, so the tab and the grid always agree.
- The dashboard tab shows the Lodekit mark in the style the person selected in
  Settings → Appearance (Solid, Knockout, or Outline — the same setting that styles
  the menubar icon).
- Any page without an explicit icon link — error pages, building pages, apps
  scaffolded before this feature — falls back to the mark as the origin-wide default.
- The mark favicon follows the browser's light/dark scheme.
- Changing the mark style in Settings re-points the icon in already-open tabs live;
  editing an app's manifest emoji shows on the next reload.
- Newly scaffolded apps carry the icon link automatically; the showcase apps exercise
  it. Pre-existing apps opt in by re-scaffolding or adding the link themselves.
- Safari shows the generic globe — it does not render SVG favicons. Accepted.

## Design Decisions

### 1. Derived, not chosen

**Decision:** Favicons reuse the manifest emoji and the menubar mark style; no new
setting, no upload, no chooser.
**Why:** The person had already made both icon choices and Lodekit was ignoring them
in the browser (spec 2026-07-17-per-app-favicon). Two existing decisions beat a third
new one.
**Tradeoff:** An app cannot have a favicon that differs from its manifest emoji, and
non-emoji icons (images) are unsupported.

### 2. Serve-time SVG, no rasterization

**Decision:** Every favicon is an SVG document computed per request and never cached;
the emoji renders via SVG text, the mark from shared vector data.
**Why:** Zero native dependencies for a local-first tool, and serve-time computation
means settings and manifest changes need no build or invalidation step.
**Tradeoff:** Safari users get no favicon at all; avoiding that would require
server-side emoji rasterization, explicitly out of scope.

### 3. SVG behind the classic favicon path

**Decision:** The legacy `.ico` request is answered with the same SVG body under an
SVG content type.
**Why:** Browsers select favicons by content type, not extension — this one route
makes the mark the default for every page that never declared an icon link, with no
per-page work.
**Tradeoff:** Clients that genuinely require ICO bytes get nothing useful.

### 4. The manifest icon is untrusted text

**Decision:** The manifest's icon value is escaped before it is placed into served
SVG markup.
**Why:** The manifest is user-authored and the favicon URL is directly openable —
unescaped markup in the field would execute on the app's origin. The trust boundary
holds even for a decorative field.
**Tradeoff:** None worth naming; a markup-shaped "emoji" renders as text.

## Related

- **Recs:** 008-feat-dashboard, 012-feat-settings
- **Specs:** docs/specs/2026-07-17-per-app-favicon-design.md,
  docs/specs/2026-07-07-settings-design.md
