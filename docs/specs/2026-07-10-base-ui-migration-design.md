# @lodekit/ui Base UI migration — design

**Date:** 2026-07-10
**Status:** Approved
**Fits:** executes the revisit clause written into the ui-library spec
(`docs/specs/2026-07-02-ui-library-design.md`): *"Primitives: Radix, deliberately …
Revisit if/when upstream shadcn migrates."* Upstream migrated: as of July 2026 the
shadcn CLI defaults new projects to Base UI (`@base-ui/react`, ex-Radix + MUI team,
stable 1.6.x), with new-project adoption running 2:1 over Radix. The barrel
(`@lodekit/ui`) was designed as insulation for exactly this swap. Also removes
Storybook (the `/_ui/` "Themes" surface) in favor of a future custom theme
editor/component visualizer (roadmap).

## 1. Purpose and scope

Swap the substrate of `@lodekit/ui` from shadcn's Radix flavor (new-york-v4 style,
`radix-ui` primitives) to shadcn's Base UI flavor with the upstream-default
**base-nova** style (`@base-ui/react` primitives). Apps and the dashboard keep
importing components from the barrel; the swap is internal to `packages/ui` plus a
handful of consumer-site idiom fixes.

**Guiding principle (the person's call):** lean standard. Vendor stock upstream
artifacts; identity comes from tokens only (cork-amber palette, Fraunces/Hanken
fonts in `theme-tokens.css`). It's fine to be imperfect now — component and theming
iteration continues after; what we don't do is customize component internals and
drift off the upstream track.

**In scope:** regenerate all 42 vendored components as base-nova; export the
base-only newcomers; adopt newcomers in the dashboard where they replace hand-rolled
equivalents; fix the (four) consumer-site Radix idioms; remove Storybook entirely,
leaving the "Themes" nav placeholder; docs/roadmap bookkeeping.

**Not in scope:** any redesign beyond what the substrate swap forces; the theme
editor/component visualizer (roadmap); adopting heavy-dependency components the
ui-library spec excluded (chart/calendar remain out); changing the person-theming
(`theme-overrides.css`) mechanism.

## 2. Decisions

- **Style: base-nova** — the upstream default (neutral, Lucide, closest in spirit to
  the classic look). There is no base-flavor new-york-v4, so the migration inherently
  restyles component internals (radii, spacing, focus/scrim treatments); accepted.
  Rejected: hand-porting our current classes onto Base UI primitives (maximum visual
  stability, permanent manual drift) and picking a designer style (Luma/Rhea/…) —
  can revisit by regenerating later; the style choice is not load-bearing for app code.
- **Mechanics: CLI regeneration in place** — update `packages/ui/components.json` to
  the base/nova registry and regenerate via the shadcn CLI (the pipeline that produced
  the current set). Fallback per component: fetch `r/styles/base-nova/<name>.json`
  and place files by hand. Rejected: a bespoke registry-fetch script as the primary
  path (reinvents the CLI), and shadcn's in-place Radix→Base migration skill (it
  preserves the new-york-v4 styling we're leaving).
- **Local patches die.** The blurred scrim, `no-scrollbar` utility + usages, and the
  ServiceTabs underline containment (`pb-[5px]`) were hand-chased upstream design;
  base-nova ships its own opinions. Delete ours wherever upstream now has one; keep
  only what upstream demonstrably lacks (checked at implementation: `color-scheme`
  declarations, the button-cursor restore, fonts/palette).
- **Newcomer adoption is replacement, not redesign** — a newcomer lands in dashboard
  code only where it replaces something hand-rolled (§5).
- **Storybook is removed, not parked** — deps, config, stories, static build, and the
  runtime's expectation of a built Storybook at `/_ui/` all go. The "Themes" nav entry
  survives pointing at a small placeholder page. Rejected: keeping Storybook until the
  replacement exists (unmaintained 41-story surface on a freshly-swapped component set
  is negative value).

## 3. Component set

- **Regenerated 1:1 (the current 42):** accordion, alert, alert-dialog, aspect-ratio, avatar,
  badge, breadcrumb, button, card, checkbox, collapsible, command, context-menu,
  dialog, drawer, dropdown-menu, hover-card, input, input-otp, label, menubar,
  navigation-menu, pagination, popover, progress, radio-group, resizable,
  scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch,
  table, tabs, textarea, toggle, toggle-group, tooltip.
- **New exports (base-only):** combobox, field, input-group, button-group, kbd,
  spinner, empty — plus any registry dependencies the CLI pulls in (e.g. command
  depends on input-group in base-nova). Everything vendored is exported from the
  barrel; no unexported vendored code.
- **Dependencies:** `radix-ui` removed; `@base-ui/react` added. cmdk, vaul, sonner,
  input-otp, react-resizable-panels, lucide-react, cva/clsx/tailwind-merge stay.
  The style's CSS contract is adopted as upstream specifies (the base-nova style item
  imports `tw-animate-css` and `shadcn/tailwind.css`; the latter is **vendored** as
  `packages/ui/shadcn-tailwind.css` — post-review decision: a prod `shadcn` dependency
  would drag its ~25-30MB CLI tree into the pnpm-deploy packaged payload. Refresh the
  vendored file whenever components are regenerated). next-themes rides along as a stock sonner.tsx dependency.

## 4. Theming and CSS

- `theme.css` is updated to the base-nova style item's import set; `@source "./src"`
  and the `theme-overrides.css` person-override hook are unchanged.
- `theme-tokens.css` keeps the cork-amber palette, fonts, and radius; token
  *names* are unchanged upstream (verified: the style item declares no new cssVars).
  Our additions are re-audited against upstream: the `no-scrollbar` `@utility` is
  deleted if `shadcn/tailwind.css` provides it, `color-scheme` light/dark stays
  unless upstream now covers it, the button-cursor restore stays (Tailwind v4
  preflight gap, independent of flavor).
- The `_ui` runtime asset routes (`theme.js`, `theme.css`, override composition) are
  untouched except `/_ui/` index (§6).

## 5. Consumer-site changes

- **Idiom fixes (known, counted):** 2 `asChild` usages → Base UI's `render` prop;
  2 `data-[state=…]` classNames in `settings.tsx` (forceMount-and-hide patterns for
  TabsContent/CollapsibleContent) → the base equivalents (`data-*` attributes /
  keep-mounted API, per what base-nova tabs/collapsible actually expose).
- **ServiceTabs:** `variant="line"` and the overflow classes were new-york-v4
  idioms. The strip adopts stock base-nova tabs; per the guiding principle we do not
  recreate the line look if base-nova lacks it.
- **Newcomer adoption:** **Field** for settings field rows (label + description +
  control + error is its job); **Kbd** for the ⌘K hint in the header search trigger;
  **Spinner**/**Empty** where dashboard pages hand-roll loading/empty states;
  **Combobox** only if an existing select is long enough to want filtering.
  Greenhouse/Welcome apps: barrel imports unchanged; touched only if a regenerated
  component's API forces it.
- **Skill:** `packages/skill` gets a Base UI idiom note only if it currently
  documents Radix idioms (checked at implementation; earlier grep suggests it
  doesn't).

## 6. Storybook removal

- Delete from `packages/ui`: `.storybook/`, all `src/components/*.stories.tsx`,
  `storybook-static/`, the `storybook`/`build-storybook` scripts, and the Storybook
  devDependencies.
- Runtime: `/_ui/` index stops serving/expecting a static Storybook build and serves
  a small styled placeholder page instead (theme editor coming soon); the existing
  "isn't built" fallback copy in `server.ts` is replaced by that placeholder. All
  other `/_ui/*` asset routes unchanged.
- Dashboard: the "Themes" `SERVICES` entry in `nav.ts` stays, still `href: "/_ui/"`,
  now landing on the placeholder.
- Roadmap: add *custom theme editor / component visualizer* (replaces Storybook as
  the component-viewing surface; the placeholder page and nav entry are its slot);
  drop/adjust roadmap notes that assume Storybook.

## 7. Verification

- **SSR smoke test carries the component-level load** (Storybook is gone): extend
  `tests/ssr-smoke.test.tsx` to render every barrel export server-side, so the whole
  vendored set is exercised through our actual toolchain.
- `pnpm -r test` green (runtime incl. MCP integration, sdk, manager, ui).
- Boot the runtime against `root/`: dashboard pages render, compiled CSS contains
  the expected base-nova artifacts and none of the deleted local patches.
- Greenhouse + Welcome build and render through their worker hosts (barrel imports,
  SSR path — the realistic Base UI risk surface).
- Human browser pass (flagged, not automated): dark/light, ⌘K palette, settings
  tabs + Service Overrides, one sheet and one alert-dialog, Greenhouse walk.

## 8. Risks

- **Variant/prop gaps** (e.g. no line tabs, changed CommandDialog internals):
  accepted by principle — adopt stock; fix-forward in later iteration.
- **Base UI behavior differences** (portals, focus management, keep-mounted
  semantics) surfacing in the forceMount patterns and worker-hosted SSR: covered by
  §7's app render pass; the settings drafts-survive-tab-switch behavior must be
  re-verified explicitly.
- **CLI vs workspace shape:** the CLI worked for the original vendoring; if it
  fights the buildless workspace now, fall back to registry JSONs per component.
- **Agent familiarity flips, not breaks:** training-data Radix-isms (`asChild`,
  `data-[state=…]`) written by agents into future app code will silently no-op on
  Base UI components — same class of risk as staying on Radix while the ecosystem
  moves; mitigated by the skill note (§5) if warranted.
