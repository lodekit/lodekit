# Per-app favicon — design

**Date:** 2026-07-17 · **Provenance:** GitHub issue #104 · **Session bead:** lk-irl

## Problem

Lodekit serves no favicon anywhere — dashboard tabs, app tabs, and error pages all show
the browser's generic globe. The user has already made two icon choices Lodekit ignores
in the browser: the menubar mark style (`appearance.icon_style`, a/b/c) and each app's
emoji (`manifest.json` `icon`).

## Decision

Favicons are **derived, not newly chosen** — no new UI. App pages use the app's manifest
emoji; the dashboard and everything else use the selected menubar mark. Delivery follows
the theme-service pattern from PR #100: serve-time routes + a static link in the app
scaffold.

## Behavior

| Page | Favicon | Mechanism |
|---|---|---|
| Dashboard | Menubar mark (selected style) | `<link rel="icon" href="/favicon.svg">` in dashboard `__root.tsx` |
| App with `icon` in manifest | The emoji | `<link rel="icon" href="/_ui/favicon.svg?app=<id>">` in app `__root.tsx` |
| App without `icon` | `📦` (matches dashboard grid fallback) | same route, fallback |
| Unknown `app` param | Menubar mark | same route, fallback |
| Pages with no icon link (error/building pages, pre-existing wild apps) | Menubar mark | browser's automatic `/favicon.ico` request |

## Routes (engine, `server.ts`)

All serve-time, computed per request, `Cache-Control: no-store`:

- `GET /favicon.svg` — the selected mark (`effectiveString("appearance.icon_style")`,
  default `b`) rendered as an SVG string.
- `GET /favicon.ico` — same SVG body, served with `image/svg+xml`. Browsers select
  favicons by content-type, not extension; this makes the mark the origin-wide default
  for any page without an explicit link.
- `GET /_ui/favicon.svg?app=<id>` — the app's manifest emoji rendered via the SVG
  `<text>` technique; fallbacks per the table above.

## Implementation shape

- **Shared mark data.** The a/b/c vector data currently exists only as JSX in
  `dashboard/src/components/logo.tsx`. Extract the raw path data to
  `packages/runtime/src/marks.ts`; both `logo.tsx` and the favicon route consume it.
  One source of truth, no duplicated vectors.
- **Theme-aware mark.** `currentColor` is meaningless in a favicon; the mark SVG embeds
  a small `prefers-color-scheme` style block (dark fill in light scheme, light fill in
  dark). Supported by Chromium for SVG favicons.
- **Security (trust boundary).** `manifest.json` `icon` is user-authored and is
  interpolated into SVG markup served on the app origin — unescaped, a value like
  `<script>…</script>` would be XSS when the SVG URL is opened directly. The value is
  XML-escaped before interpolation. Covered by a test.
- **Live apply.** The `/_ui/theme.js` head script already subscribes to `/api/events`
  for settings changes; it additionally re-points the icon `<link>` (with a
  cache-buster) when `appearance.icon_style` changes. Manifest-emoji edits are not
  live-applied — a reload picks them up.
- **Links.** Scaffold template (`scaffold.ts`) gains the per-app icon link beside the
  existing `theme.css` link; Greenhouse and Welcome `__root.tsx` get the same link
  (Greenhouse = definition-of-done exercise); dashboard `__root.tsx` gains the global
  link.

## Known gaps (accepted)

- **Safari** does not render SVG favicons — Safari users keep the generic globe.
  Avoiding that would require server-side emoji rasterization (native deps) for a
  local-first tool; explicitly out of scope.
- **Pre-existing user apps** (scaffolded before this change) have no per-app link and
  fall back to the mark favicon — the same retrofit limitation the theme link has.
  Re-scaffolding or manually adding the link opts them in.

## Testing

Runtime package tests (existing harness):

1. `/favicon.svg` reflects the stored `icon_style`; default `b` when unset.
2. `/_ui/favicon.svg?app=<id>`: manifest emoji present; no-icon app → `📦`; unknown
   app → mark.
3. Escaping: a manifest `icon` containing markup arrives XML-escaped in the SVG body.
4. `/favicon.ico` → 200, `image/svg+xml`.

## Rollout

- Changelog entry under `## New` (user-visible).
- `root/README.md` Greenhouse coverage checklist gains the favicon line.
- Closes issue #104.
