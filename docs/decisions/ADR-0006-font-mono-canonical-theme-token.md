# ADR-0006 — `--font-mono` is a typed token of the canonical theme format

**Date:** 2026-07-19 · **Status:** accepted · **Provenance:** retheme spec
`docs/specs/2026-07-19-lodekit-retheme-design.md` (session bead lk-is3)

## Context

The "Sky in a Jar" identity (`docs/DESIGN.md`) is built on a Two-Voice Rule: one
sans (Zen Kaku Gothic New) speaks, one mono (Spline Sans Mono) annotates — kickers,
app ids, data, timestamps. The mono metadata layer is named the identity's most
portable gesture. The canonical theme format (theme-editor spec, 2026-07-16) typed
exactly two font tokens — `--font-ui` and `--font-display` — so the mono voice had
no themeable carrier: it would either be hardcoded in `@lodekit/ui` or absent.

## Decision

Extend the canonical theme format with a third typed font token, `--font-mono`,
end-to-end: parser model + serializer (`theme-css.ts`), theme-editor Typography
select + managed css2 import composition, `@theme inline` bridge in
`@lodekit/ui/theme.css` (Tailwind's `font-mono` utility resolves to it), format
docs, and tests. Themes that omit the token fall back to the baked-in Spline Sans
Mono stack in `theme-tokens.css` — parse/serialize round-trips never invent or
drop the line.

## Rationale

- The mono layer is identity-critical and person-facing; a token the theme editor
  can't see would make the "person's surface" (theming) silently incomplete.
- The format was days old at decision time — extending it before third-party themes
  accumulate is the cheapest it will ever be.
- Alternatives rejected: mono in the default theme only (editor round-trip risk,
  not editable), and no mono token (the portable gesture never ships).

## Consequences

- The typed-extras set is now `--font-ui`/`--font-display`/`--font-mono`/
  `--radius`/`--spacing`/`--icon-library`; parser, editor, and vendored themes must
  stay in lockstep with it.
- Every vendored and showcase theme sets all three fonts; user themes may omit
  `--font-mono` indefinitely (fallback is permanent API).
- The `font-mono` Tailwind utility is now theme-reactive in every app and the
  dashboard — agent-built apps inherit the mono voice with zero app-side wiring.
