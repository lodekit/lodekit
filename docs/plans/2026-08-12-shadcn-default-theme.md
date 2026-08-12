# Plan: shadcn neutral default theme

**Spec:** `docs/specs/2026-08-12-shadcn-default-theme-design.md`
**Branch/PR:** `shadcn-default-theme` / #208
**Order matters:** tasks 1→7; each task lands with tests green.

## Task 1 — Canonical format: physics fields

- [x] Extend the theme model in `packages/engine/dashboard/src/lib/theme-css.ts`,
      following the `--font-mono` optional-field precedent:
      `:root`-only typed fields `fontWeightBody` (`--font-weight-body`) and
      `easeDefault` (`--default-transition-timing-function`); per-plate optional
      shadow tokens `--shadow-2xs`, `--shadow-xs`, `--shadow-sm`, `--shadow`,
      `--shadow-md`, `--shadow-lg`, `--shadow-xl`, `--shadow-2xl` (allowed in
      `:root` and `.dark`, like the color set; `.dark` absent → inherits `:root`).
      Absent field → empty model value → no line serialized.
- [x] Extend `packages/engine/tests/theme-css.test.ts`: round-trip byte-identical
      for themes with none / some / all fields, per-plate shadow divergence, and
      edited-in cases; every existing vendored fixture still round-trips.

**Accept:** `pnpm --filter @lodekit/engine test` green; parse→save of an unedited
theme is byte-identical in all new cases.

## Task 2 — Base layer goes stock

Context: `packages/ui/theme-tokens.css` is the build-time base (standalone compile,
vitest render tests) plus the `@theme inline` bridge. It currently carries Cloud
Captured values and identity physics. Spec §2.

- [x] Flip the `@layer lodekit-tokens` token values (both plates) to the stock
      shadcn neutral hex set (same values Task 3 puts in `shadcn.css`); fonts to
      the Geist stacks; `--radius: 0.625rem`. Rewrite the header comment; keep the
      layer name.
- [x] Delete: `--lk-ease-drift` + the `--ease-drift` /
      `--default-transition-timing-function` aliases; `--lk-shadow-*` slots and the
      `@theme inline` shadow alias block; the entire focus rule set (single rule,
      pointer focus, `aria-invalid`, input-group delegation, forced-colors);
      `body { font-weight: 500 }` → `font-weight: var(--font-weight-body, 400)`.
      Keep `color-scheme`, `border-border outline-ring/50`, `h1–h4`, the mono-400
      rule (comment updated: load-bearing only under themes that raise body weight).
- [x] Runtime resolution: ensure served theme CSS can override the shadow scale and
      default easing at runtime — verify Tailwind v4 emits `var()` references; where
      it inlines (likely the easing token), add a thin passthrough in
      `theme-tokens.css` with the stock value as fallback. Add a test asserting the
      built CSS references the vars (extend an existing engine build test or a
      `@lodekit/ui` test that compiles `theme.css`).
- [x] Sweep every `ease-drift` utility and `--lk-*` consumer in `packages/ui/src`,
      `packages/engine/dashboard/src`, `root/apps` — migrate to stock equivalents
      (usually delete the class). `--lk-font-wordmark` in `dashboard/src/index.css`
      stays (chrome above the theme format). Delete `--lk-shadow-lift` unless the
      sweep finds a live consumer (then keep and note where).

**Accept:** `pnpm test` green (ui + engine); grep finds no `--lk-` outside
`--lk-font-wordmark`; dashboard renders neutral in dev with stock focus rings.

## Task 3 — The `shadcn` theme + default flip

- [x] Add `packages/engine/themes/shadcn.css`: header naming the source
      (ui.shadcn.com, MIT); one css2 `@import` (Geist 400/500/600, Geist Mono
      400/500); `--font-ui`/`--font-display` Geist stacks, `--font-mono` Geist Mono
      stack; `--radius: 0.625rem`, `--spacing: 0.25rem`, `--icon-library: lucide`;
      31 tokens in both plates, stock neutral oklch→hex. No physics fields.
- [x] `DEFAULT_THEME = "shadcn"` in `packages/engine/src/services/themes.ts`;
      `resolveThemeCss()` floor reads vendored `shadcn.css`; update stale comments
      in `themes.ts` / `server.ts`.
- [x] Update tests: `themes.test.ts` (six vendored themes; resolution and
      delete-while-selected fall back to `shadcn`), `themes-api.test.ts`,
      `ui-serving.test.ts` degrade paths.
- [x] `theme-contrast.test.ts`: gate `shadcn` (both plates, not `AA_EXEMPT`). If a
      stock pair fails, tune minimally toward the nearest AA-passing value and
      comment the deviation in the theme file.

**Accept:** `pnpm --filter @lodekit/engine test` green; `pnpm dev` → dashboard and
Welcome render neutral shadcn with Geist.

## Task 4 — `lodekit` and `greenhouse-green` carry their physics

- [ ] `packages/engine/themes/lodekit.css`: add `--font-weight-body: 500`,
      `--default-transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1)`;
      shadow set — light plate: 2xs/xs/sm/shadow `0 0 #0000`, md–2xl the ink
      overlay (`0 2px 4px rgba(37,27,37,.08), 0 22px 44px -20px rgba(37,27,37,.42)`);
      dark plate: all `0 0 #0000`.
- [ ] `root/themes/greenhouse-green.css`: same physics block (showcase exercises
      the new fields — Definition of Done). `root/README.md` checklist gains the
      row.
- [ ] Visual check (Playwright MCP or browser): switch global theme to `lodekit` —
      flat at rest, ink overlays on popovers, body 500, drift easing; focus is the
      stock ring (expected change).

**Accept:** round-trip and contrast tests green; lodekit's rendered look unchanged
except focus.

## Task 5 — Editor: Effects group + font catalog

- [ ] `packages/engine/dashboard/src/components/theme-editor/controls.tsx`: new
      **Effects** group — Elevation (Stock = fields absent / Flat = all
      `0 0 #0000` both plates), Easing (Stock = absent / Drift), Body weight
      (Normal = absent or 400 / Medium = 500). Diverged values display "Custom"
      (mirror the color-role "mixed" pattern); presets write exact values.
- [ ] `FONT_CATALOG` += Geist (`Geist:wght@400;500;600`) and Geist Mono
      (`Geist+Mono:wght@400;500`).
- [ ] Editor round-trip: opening and saving an unedited theme (incl. `lodekit`,
      `shadcn`) stays byte-identical.

**Accept:** engine tests green; editor smoke — presets apply, "Custom" shows for
lodekit's overlay shadows, fonts show as matched selections.

## Task 6 — Documentation

- [ ] `docs/DESIGN.md`: restructure §3 per spec §7 — product shell (theme-
      independent truths) / the lodekit theme (Cloud Captured as a selectable
      product expression) / default ruling (`shadcn` default; `lodekit` optional,
      future default candidate after a toned-down revision). §1 scope sentence;
      Focus-Is-A-Border rescoped to Marketing; fix stale claims (§1 body-500 via
      theme-tokens, §3 focus bullet, Elevation register note). Keep ~90-col wrap.
- [ ] `docs/DEFINITIONS.md`: Themes entry names `shadcn` as the default theme.
- [ ] `docs/ARCHITECTURE.md`: audit theming claims; update any default-theme line.
- [ ] `web/docs/src/content/docs/guide/theming.mdx`: rewrite to the current model
      (default theme, themes library + editor, `<root>/themes/*.css` +
      `config.json`, per-app selection, user themes; retired mechanism gone).
      Read `docs/PRODUCT.md` first (outward-facing prose).
- [ ] `docs/CHANGELOG.md`: New — neutral `shadcn` default theme; themes carry
      elevation/easing/body weight. Changed — `lodekit` optional; stock focus and
      elevation by default (visible for roots with no theme selection).
- [ ] `docs/TODO.md` append:
      `- [2026-08-12 · spec:shadcn-default-theme] Vendor the top ~10 theme fonts engine-served (Geist, Inter, FONT_CATALOG families); removes the Google request from themes; sharpens the self-hosted-fonts deferral.`

**Accept:** docs check of AGENTS.md satisfied in-PR;
`pnpm --filter @lodekit/web-docs build` green.

## Task 7 — Verification and close-out

- [ ] `pnpm test`, `pnpm e2e`, `pnpm --filter @lodekit/web-docs build` all green.
- [ ] Visual pass (`pnpm dev` + Playwright MCP): dashboard/Welcome neutral shadcn;
      Greenhouse moss Cloud Captured with flat elevation; global switch to
      `lodekit` restores the identity; editor Effects round-trip.
- [ ] Self-review the whole branch diff (correctness + security; themes endpoints
      are a validated-slug surface — confirm no path-handling changes).
- [ ] Close the Focus-Is-A-Border product-adoption backlog issue with a comment
      linking PR #208 (`gh issue list --search "focus"` to find it).
- [ ] Delete this plan file in the final commit; rewrite the PR body (Summary /
      Notes with plan permalink to the deletion commit's parent / Test plan);
      check the Definition of Done; flip PR #208 to ready.

**Accept:** PR #208 ready for review; merging stays the person's call.
