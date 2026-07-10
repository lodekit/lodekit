# Base UI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap `@lodekit/ui`'s substrate from shadcn's Radix flavor (new-york-v4) to the Base UI flavor with the base-nova style, remove Storybook entirely, and adopt the base-only newcomers where they replace hand-rolled code.

**Architecture:** `packages/ui` vendors shadcn components as source (barrel export `src/index.ts`; consumers never import primitives). The migration regenerates all vendored files from the `base-nova` registry style (`https://ui.shadcn.com/r/styles/base-nova/<name>.json`), swaps `radix-ui` → `@base-ui/react`, and fixes the handful of Radix idioms at consumer sites (dashboard). Storybook (previously served at `/_ui/` by the runtime) is deleted; `/_ui/` becomes a placeholder page for a future theme editor.

**Tech Stack:** pnpm workspace (install from repo root ONLY — never inside `manager/`), tsx/buildless runtime, Tailwind v4, vitest, `@base-ui/react` 1.6.x, cmdk, vaul, sonner.

**Spec:** `docs/specs/2026-07-10-base-ui-migration-design.md` — read it first.

## Global Constraints

- **Lean standard:** vendor stock upstream artifacts verbatim; identity comes from tokens in `packages/ui/theme-tokens.css` only. Do NOT re-add local styling patches to component files. Imperfect-but-stock beats perfect-but-custom.
- **Surgical:** every changed line traces to the spec. Don't reformat or "improve" adjacent code.
- Work on the `base-ui` branch in this worktree; commit per task; do NOT merge/fold to master.
- No `Co-Authored-By` trailers in commits.
- `pnpm install` from the repo root only (a `manager/.npmrc` would otherwise rewrite the workspace to hoisted layout).
- Registry component sources are fetchable at `https://ui.shadcn.com/r/styles/base-nova/<name>.json` (JSON: `.files[0].content`); prefetched copies of button/tabs/collapsible/select/switch/accordion/popover/command/dialog/field/kbd/spinner/empty/combobox/input-group/button-group/sheet exist in the session scratchpad under `base-nova/` (see task text).
- The runtime dev server may already be running on port 7777 (the person's). For boot checks use `LODEKIT_PORT=7791` with `LODEKIT_CACHE_DIR`/`LODEKIT_STATE_DIR` pointed at a scratch dir. Wipe that cache dir before a boot whose CSS you want freshly built — the dashboard build is cached and does NOT rebuild on packages/ui changes.

---

### Task 1: Remove Storybook; `/_ui/` becomes a placeholder page

**Files:**
- Delete: `packages/ui/.storybook/` (whole dir), `packages/ui/storybook-static/` (whole dir), every `packages/ui/src/components/*.stories.tsx` (42 files)
- Modify: `packages/ui/package.json` (scripts + devDependencies)
- Modify: `packages/runtime/src/server.ts:60-130` (the `/_ui` static serving block)
- Test: `packages/runtime/tests/ui-serving.test.ts` (rewrite)
- Modify: `manager/scripts/prepare-bundle.mjs:76` and `:173`
- Modify: `packages/runtime/dashboard/src/components/nav.ts:4-6` (comment only)
- Modify: `roadmap.md:154` (ui.lodekit.com entry) + add theme-editor entry

**Interfaces:**
- Produces: `GET /_ui/` → 200 HTML placeholder page (any request under `/_ui/*` that is not `theme.css`/`theme.js`/`theme.json` also lands on it, 200 for `/_ui/` itself, 404 for other unknown `/_ui/x` paths). `GET /_ui` still 301 → `/_ui/`. Theme asset routes unchanged.
- The dashboard "Themes" nav entry (`nav.ts`, `href: "/_ui/"`) is NOT removed — it now lands on the placeholder.

- [ ] **Step 1: Rewrite the failing test first** — replace the two `/_ui static serving` tests in `packages/runtime/tests/ui-serving.test.ts` with placeholder expectations. Delete the `staticDir` fixture and `LODEKIT_UI_STATIC_DIR` env plumbing from `beforeEach`/`afterEach` (keep root/cache + settings-store setup). New tests:

```ts
describe("/_ui placeholder", () => {
  it("redirects /_ui to /_ui/ and serves the placeholder page", async () => {
    await listen(cfgFor(root, cache));
    const redirect = await fetch(base + "/_ui", { redirect: "manual" });
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get("location")).toBe("/_ui/");
    const home = await fetch(base + "/_ui/");
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("Themes");
  });

  it("keeps serving theme assets and 404s unknown /_ui paths", async () => {
    await listen(cfgFor(root, cache));
    expect((await fetch(base + "/_ui/theme.js")).status).toBe(200);
    expect((await fetch(base + "/_ui/theme.json")).status).toBe(200);
    expect((await fetch(base + "/_ui/theme.css")).status).toBe(200);
    expect((await fetch(base + "/_ui/assets/nope.js")).status).toBe(404);
  });
});
```

Keep any other pre-existing tests in the file (theme.css composition etc.) untouched.

- [ ] **Step 2: Run to verify the new tests fail** — `pnpm --filter @lodekit/runtime test -- ui-serving`. Expected: the first test fails (placeholder text not served; today `/_ui/` serves storybook-static or the "isn't built" 404 page).

- [ ] **Step 3: Rework `packages/runtime/src/server.ts`** — in the `/_ui` block (lines ~60-130): delete the `uiStaticDir` constant, the `LODEKIT_UI_STATIC_DIR` env read, the `serveStatic({... rewriteRequestPath ...})` middleware for `/_ui/*`, and the `uiNotBuiltPage()` helper (lines ~60-70, the `<body><h1>Lodekit</h1>…build-storybook…` HTML). Keep: the `/_ui` → `/_ui/` 301 redirect and the `theme.css`/`theme.js`/`theme.json` routes exactly as they are. Add in place of the static serving, styled minimally like the old not-built page (reuse its `<style>` shell):

```ts
// /_ui/ is the slot for the future theme editor / component visualizer
// (roadmap). Storybook previously lived here; the nav's "Themes" entry
// still points at this page.
const uiPlaceholderPage = () => `<!doctype html>
<html><head><meta charset="utf-8"><title>Lodekit — Themes</title>
<style>body{font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0}main{text-align:center}.muted{color:#666}</style></head>
<body><main><h1>Themes</h1><p class="muted">The theme editor lives here soon. Your theme overrides in <code>data/_ui/</code> already apply everywhere.</p></main></body></html>`;
```

Route: `.get("/_ui/", (c) => c.html(uiPlaceholderPage()))` and change the trailing `.all("/_ui/*", …)` fallback to return 404 with the same page body (unknown sub-paths). Adjust the copy freely if `data/_ui/` isn't where overrides live — check the theme.css route above it for the real path and name it truthfully, or drop that sentence.

- [ ] **Step 4: Run tests** — `pnpm --filter @lodekit/runtime test -- ui-serving`. Expected: PASS. Also run `pnpm --filter @lodekit/runtime test -- dashboard scaffold e2e` (they reference `/_ui/theme.js` — must still pass).

- [ ] **Step 5: Purge Storybook from `packages/ui`** —

```bash
git rm -r packages/ui/.storybook packages/ui/storybook-static 2>/dev/null; rm -rf packages/ui/storybook-static
git rm packages/ui/src/components/*.stories.tsx
```

In `packages/ui/package.json`: delete the `storybook` and `build-storybook` scripts and the `@storybook/react-vite` and `storybook` devDependencies. If `storybook-static` isn't tracked by git, plain `rm -rf` is fine — also check for a `files`/`publishConfig` mention of it (none expected).

- [ ] **Step 6: Purge from the manager bundle script** — `manager/scripts/prepare-bundle.mjs`: delete line 76 (`run(\`pnpm --filter @lodekit/ui build-storybook\`)`) and the payload assertion around line 173 that checks `…/@lodekit/ui/storybook-static/index.html` (remove the whole check entry, keeping the assertion list syntactically valid).

- [ ] **Step 7: Bookkeeping** — `nav.ts`: fix the comment (lines 4-6) that says Themes "is the static Storybook build at /_ui/" → say it's the placeholder slot for the future theme editor (full-page navigation, cannot render inside the router). `roadmap.md`: replace the line-154 entry (**ui.lodekit.com** — deploy the static Storybook build) with a **Theme editor / component visualizer** entry: custom-rolled dashboard surface replacing Storybook; the `/_ui/` placeholder page and the nav "Themes" entry are its slot; public deploy (ui.lodekit.com) folds into it if still wanted. Run `grep -rn -i storybook --include='*.{ts,tsx,js,mjs,json,md}' packages manager web root docs/specs/2026-07-10-base-ui-migration-design.md roadmap.md | grep -v node_modules | grep -v manager/out` — clean every remaining hit except historical docs (`docs/specs/2026-07-02-ui-library-design.md`, old plans) and the migration spec itself.

- [ ] **Step 8: Full check + commit** —

```bash
pnpm install                       # prunes removed devDeps; from repo root
pnpm --filter @lodekit/ui test     # ssr-smoke still green (untouched)
pnpm --filter @lodekit/runtime test
git add -A && git commit -m "feat(ui,runtime): remove storybook; /_ui/ serves the theme-editor placeholder"
```

---

### Task 2: Regenerate the component set as base-nova

**Files:**
- Modify: `packages/ui/components.json` (style)
- Rewrite (regenerated): all 42 files in `packages/ui/src/components/*.tsx`
- Create (regenerated): `packages/ui/src/components/{combobox,field,input-group,button-group,kbd,spinner,empty}.tsx` (+ any registry deps the CLI adds)
- Modify: `packages/ui/package.json` (deps), `packages/ui/theme.css`, `packages/ui/theme-tokens.css`, `packages/ui/src/index.ts` (barrel)
- Test: `packages/ui/tests/ssr-smoke.test.tsx` (replace with minimal interim smoke; Task 3 rebuilds full coverage)

**Interfaces:**
- Produces: `@lodekit/ui` barrel exporting the regenerated 42 + newcomers: `Combobox*`, `Field*`, `InputGroup*`, `ButtonGroup*`, `Kbd`, `KbdGroup`, `Spinner`, `Empty*`. Components are **stock base-nova**; consumers use Base UI idioms: `render={<a/>}` instead of `asChild`, `data-open`/`data-closed`/`data-inactive` instead of `data-[state=…]`. Known-verified API facts for later tasks: `Button` takes `render` (it wraps `@base-ui/react/button`); `TabsList` still has `variant="line"`; `Select`/`Switch` keep `onValueChange`/`onCheckedChange`; `CollapsibleContent`/`TabsContent` wrap Base UI `Panel` (support `keepMounted`).

- [ ] **Step 1: Point components.json at base-nova** — in `packages/ui/components.json` change `"style": "new-york"` → `"style": "base-nova"`. Leave aliases/tailwind config untouched.

- [ ] **Step 2: Regenerate via the CLI** — from `packages/ui/`:

```bash
pnpm dlx shadcn@latest add --overwrite --yes \
  accordion alert alert-dialog aspect-ratio avatar badge breadcrumb button card \
  checkbox collapsible command context-menu dialog drawer dropdown-menu hover-card \
  input input-otp label menubar navigation-menu pagination popover progress \
  radio-group resizable scroll-area select separator sheet sidebar skeleton slider \
  sonner switch table tabs textarea toggle toggle-group tooltip \
  combobox field input-group button-group kbd spinner empty
```

Do NOT use `--all` (it would pull chart/calendar, excluded by the ui-library spec). If the CLI writes anywhere other than `src/components/` or fails on the workspace shape, fall back per component: fetch `https://ui.shadcn.com/r/styles/base-nova/<name>.json`, write `.files[*].content` to `src/components/<name>.tsx`. Afterwards list `src/components/` — if the CLI added extra registry-dependency components (e.g. `input-group` pulled by command), keep them; they get exported in Step 6.

- [ ] **Step 3: Normalize imports to the package's relative style** — regenerated files import `@/lib/utils` / `@/components/<x>` (or `@/registry/base-nova/...` if hand-fetched). The existing convention is relative (`../lib/utils`, `./dialog`). Rewrite:

```bash
cd packages/ui/src/components
sed -i '' -e 's|@/registry/base-nova/lib/utils|../lib/utils|g; s|@/registry/base-nova/ui/|./|g; s|@/lib/utils|../lib/utils|g; s|@/components/|./|g' *.tsx
grep -rn "@/" . && echo "LEFTOVER ALIASES — fix by hand" || echo clean
```

Also delete any `IconPlaceholder` imports/usages the registry demo layer leaks into component files (`grep -n IconPlaceholder *.tsx`) — replace with the lucide icon the surrounding code renders (read the file; upstream uses a real lucide icon in the published variant, so hits are unlikely).

- [ ] **Step 4: Dependencies** — in `packages/ui/package.json`: remove `radix-ui`; ensure `@base-ui/react` is present (the CLI may have added it; else add `"@base-ui/react": "^1.6.0"`). Keep cmdk, vaul, sonner, input-otp, react-resizable-panels, lucide-react, cva/clsx/tailwind-merge, tw-animate-css. Then check what the style expects in CSS: the base-nova style item's css block imports `tw-animate-css` and `shadcn/tailwind.css` — add `"shadcn"` to dependencies (it ships that CSS), and in `packages/ui/theme.css` add `@import "shadcn/tailwind.css";` after the `tw-animate-css` import. Run `pnpm install` from the repo root. Verify the import resolves: `node -e "console.log(require.resolve('shadcn/tailwind.css', {paths:['packages/ui']}))"`.

- [ ] **Step 5: Re-audit our token-file additions against upstream** — read the newly resolved `shadcn/tailwind.css`. In `packages/ui/theme-tokens.css`: delete our `@utility no-scrollbar` block if that file defines `no-scrollbar` (it should — upstream components use it); keep it otherwise. Keep: cork-amber `:root`/`.dark` palettes, font variables, `color-scheme: light`/`dark` lines (delete only if shadcn/tailwind.css sets color-scheme itself), the `@theme inline` mapping, and the `@layer base` body/heading rules. In `packages/ui/theme.css` keep the Google-fonts import, `@import "./theme-tokens.css"`, `@import "@lodekit/ui/theme-overrides.css"`, `@source "./src"`. In `packages/ui/src/index.css`—n/a. In the dashboard's `packages/runtime/dashboard/src/index.css`: delete the button-cursor `@layer base` block ONLY if base-nova buttons carry `cursor: pointer` (check `shadcn/tailwind.css` and the regenerated button classes for a cursor rule; base-nova buttons use `select-none` but the cursor restore was a Tailwind-preflight gap — if unsure, KEEP it).

- [ ] **Step 6: Barrel** — append to `packages/ui/src/index.ts` (keep alphabetical placement):

```ts
export * from "./components/button-group";
export * from "./components/combobox";
export * from "./components/empty";
export * from "./components/field";
export * from "./components/input-group";
export * from "./components/kbd";
export * from "./components/spinner";
```

plus any other components Step 2 added. Every file in `src/components/` must be exported (spec: no unexported vendored code): `for f in packages/ui/src/components/*.tsx; do n=$(basename $f .tsx); grep -q "\"./components/$n\"" packages/ui/src/index.ts || echo "MISSING: $n"; done`.

- [ ] **Step 7: Interim smoke test** — replace the entire body of `packages/ui/tests/ssr-smoke.test.tsx` (it is written against Radix idioms and will not compile) with a minimal placeholder that keeps the package green until Task 3 rebuilds full coverage:

```tsx
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { Button, Card, CardContent, Input, Kbd, Spinner } from "../src";

// Interim smoke after the base-nova regeneration — Task 3 of the migration
// plan rebuilds full-coverage SSR smoke over every barrel export.
describe("SSR smoke (interim)", () => {
  it("core components render server-side", () => {
    expect(typeof window).toBe("undefined");
    const html = renderToString(
      <Card>
        <CardContent>
          <Button>Button Marker</Button>
          <Input placeholder="Input Marker" />
          <Kbd>⌘K</Kbd>
          <Spinner />
        </CardContent>
      </Card>
    );
    expect(html).toContain("Button Marker");
    expect(html).toContain("Input Marker");
  });
});
```

- [ ] **Step 8: Typecheck, test, commit** —

```bash
pnpm --filter @lodekit/ui check    # tsc --noEmit over src + tests
pnpm --filter @lodekit/ui test
git add -A && git commit -m "feat(ui): regenerate component set as base-nova (Base UI flavor) + base-only newcomers"
```

Expected: both green. The dashboard/apps are NOT expected to compile yet (Tasks 4-5 fix consumer sites); do not touch them here.

---

### Task 3: Rebuild full-coverage SSR smoke

**Files:**
- Test: `packages/ui/tests/ssr-smoke.test.tsx` (rewrite from the interim version)

**Interfaces:**
- Consumes: the regenerated barrel (Task 2). Read each regenerated component file for its real prop/composition API before using it — do NOT copy the old test's Radix idioms (`asChild`, `open` on Radix roots, `TooltipProvider` if base tooltips need none, `type="single" collapsible` on Accordion if Base UI uses `multiple`/`openMultiple`, etc.).
- Produces: a test that renders **every** component exported from `../src` under `renderToString` in plain Node (no window), asserting text markers where output is visible and `data-slot="…"` attributes where it isn't (same two-tier structure as the interim test; the pre-migration git version of this file — `git show 27be281:packages/ui/tests/ssr-smoke.test.tsx` — shows the marker/data-slot pattern and the portal-gating caveats to emulate).

- [ ] **Step 1: Inventory exports** — `grep -o 'export \* from "./components/[a-z-]*"' packages/ui/src/index.ts` then for each file list its exported names. Build the composite `<Smoke />` component by component, reading each regenerated source for required props/context (e.g. Base UI menus may require a Portal/Positioner chain — compose exactly what the shadcn wrapper exposes). Include the newcomers: Combobox, Field (+FieldLabel/FieldDescription/FieldError etc. per its exports), InputGroup, ButtonGroup, Kbd/KbdGroup, Spinner, Empty (+ its sub-exports).

- [ ] **Step 2: Write the test, run, iterate** — `pnpm --filter @lodekit/ui test`. Components whose content is portal-gated under SSR emit nothing — document them with a comment (as the old test did) and assert their trigger markers instead. Aim for: every export appears in the composite; every visible marker asserted; non-text components asserted via `data-slot`.

- [ ] **Step 3: Typecheck + commit** —

```bash
pnpm --filter @lodekit/ui check && pnpm --filter @lodekit/ui test
git add packages/ui/tests/ssr-smoke.test.tsx
git commit -m "test(ui): full-coverage SSR smoke over the base-nova set"
```

---

### Task 4: Fix dashboard consumer sites (Radix idioms + superseded hacks)

**Files:**
- Modify: `packages/runtime/dashboard/src/components/header.tsx:37-41`
- Modify: `packages/runtime/dashboard/src/components/services-menu.tsx:38-42`
- Modify: `packages/runtime/dashboard/src/routes/settings.tsx:236` (ServiceTabs TabsList), `:249-253` (TabsContent forceMount), `:454` (CollapsibleContent forceMount)
- Modify: `packages/runtime/dashboard/src/components/command-bar.tsx` (only if the regenerated Command API forces it)

**Interfaces:**
- Consumes: Task 2's barrel. `Button` and all Base UI triggers take `render={<element/>}` in place of `asChild` + child. Base UI panels: `keepMounted` keeps inactive panels mounted AND hidden (the browser `hidden` attribute) — the CSS-hide classNames become redundant; verify by reading the regenerated `tabs.tsx`/`collapsible.tsx` and `@base-ui/react` types (`node_modules/@base-ui/react`, Tabs.Panel / Collapsible.Panel props).

- [ ] **Step 1: `header.tsx`** — replace the asChild settings button:

```tsx
<Button variant="ghost" size="icon" aria-label="Settings"
  render={<Link to="/settings" />}>
  <Settings className="size-4" />
</Button>
```

(Base UI `render` merges props onto the element; children stay children. Verify against the regenerated button's `ButtonPrimitive.Props` type — if `render` must carry the children, move `<Settings/>` inside the Link.)

- [ ] **Step 2: `services-menu.tsx`** — same transform:

```tsx
<PopoverTrigger render={
  <Button variant="ghost" size="icon" aria-label="Services">
    <LayoutGrid className="size-4" />
  </Button>
} />
```

- [ ] **Step 3: `settings.tsx` keep-mounted patterns** — replace both forceMount+CSS-hide usages with Base UI's `keepMounted` (drafts must survive tab switches — that's what forceMount protected):

```tsx
<TabsContent key={t.name} value={t.name} keepMounted>
```

```tsx
<CollapsibleContent keepMounted>
```

Confirm the props exist on the regenerated wrappers (they pass `...props` through to `Tabs.Panel`/`Collapsible.Panel`); if a wrapper's Props type rejects `keepMounted`, extend nothing — read the Base UI docs comment in `node_modules/@base-ui/react` for the correct prop name and use that. Keep the explanatory comment above the TabsContent, updated to name `keepMounted`.

- [ ] **Step 4: `settings.tsx` ServiceTabs strip** — line ~236: `variant="line"` survives (base-nova has it). Remove OUR patch additions, keep the layout classes, and remove the now-stale comment block above it:

```tsx
<TabsList variant="line" className="max-w-full justify-start overflow-x-auto">
```

(If `no-scrollbar` still exists as a utility via `shadcn/tailwind.css` and the strip shows scroll chrome at boot-check time, adding `no-scrollbar` here is acceptable — it's the upstream utility, not a custom patch.)

- [ ] **Step 5: `command-bar.tsx`** — read the regenerated `command.tsx`. Known deltas: base-nova `CommandDialog` defaults `showCloseButton` to `false` and requires `children`; `CommandInput`/`CommandList`/`CommandGroup`/`CommandItem`/`CommandEmpty` keep their cmdk API (`onSelect` unchanged). Adjust imports/props only as the types demand; the ⌘K `<kbd>` swap happens in Task 5.

- [ ] **Step 6: Typecheck the dashboard** — the dashboard has no standalone tsc script; check via the runtime's: `pnpm --filter @lodekit/runtime check` if it exists (see `packages/runtime/package.json` scripts), else `pnpm dlx tsc --noEmit -p packages/runtime` (find the tsconfig covering `dashboard/`). All `@lodekit/ui` consumer errors in `dashboard/` must be gone. Greenhouse/Welcome (`root/apps`) use no Radix idioms (verified by grep) — leave untouched unless the boot check in Task 6 flags them.

- [ ] **Step 7: Boot check + commit** —

```bash
SCRATCH=${TMPDIR:-/tmp}/lk-verify; mkdir -p $SCRATCH; rm -rf $SCRATCH/lk-cache $SCRATCH/lk-state
LODEKIT_ROOT=$(pwd)/root LODEKIT_PORT=7791 LODEKIT_CACHE_DIR=$SCRATCH/lk-cache LODEKIT_STATE_DIR=$SCRATCH/lk-state \
  pnpm --filter @lodekit/runtime start &   # then poll http://127.0.0.1:7791/_dashboard/ until 200
curl -s http://127.0.0.1:7791/_dashboard/ | grep -qa Lodekit && echo dashboard-ok
curl -s http://127.0.0.1:7791/_dashboard/settings | grep -qa . && echo settings-ok
```

Kill the server; commit:

```bash
git add packages/runtime/dashboard && git commit -m "fix(dashboard): Base UI idioms — render prop, keepMounted panels, stock tab strip"
```

---

### Task 5: Adopt the newcomers where they replace hand-rolled code

**Files:**
- Modify: `packages/runtime/dashboard/src/components/command-bar.tsx` (Kbd)
- Modify: `packages/runtime/dashboard/src/components/empty-stub.tsx` → callers keep the `EmptyStub` name OR migrate to `Empty` directly (choose the smaller diff; see Step 2)
- Modify: `packages/runtime/dashboard/src/routes/settings.tsx` (Field for setting rows)

**Interfaces:**
- Consumes: `Kbd`, `Empty` (+its sub-exports e.g. `EmptyHeader`/`EmptyMedia`/`EmptyTitle`/`EmptyDescription` — read `packages/ui/src/components/empty.tsx` for real names), `Field` family (read `field.tsx`: exports include Field, FieldLabel, FieldDescription, FieldError and friends).
- **Combobox: explicitly NOT adopted** — every existing Select has ≤ a handful of static options (settings selects, secret-link picker); record nothing, change nothing.
- **Spinner: explicitly NOT adopted in dashboard code** — the dashboard has no hand-rolled loading spinner (Skeleton is the loading treatment and remains correct); Spinner is exported from the barrel (Task 2) for app authors, nothing more.

- [ ] **Step 1: Kbd in the command-bar trigger** — in `command-bar.tsx` replace the hand-rolled `<kbd className="pointer-events-none rounded border bg-muted px-1.5 font-mono text-[10px]">⌘K</kbd>` with `<Kbd>⌘K</Kbd>` (import from `@lodekit/ui`), dropping the bespoke classes (keep `pointer-events-none` if the stock Kbd lacks it and the button needs it).

- [ ] **Step 2: EmptyStub → Empty** — rewrite `empty-stub.tsx`'s body to compose the stock Empty family, preserving the exported `EmptyStub({ icon, title })` signature so callers don't change:

```tsx
import type { LucideIcon } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@lodekit/ui";

export function EmptyStub({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon"><Icon aria-hidden="true" /></EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>Nothing here yet.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
```

Adjust sub-component names/props to what `empty.tsx` actually exports.

- [ ] **Step 3: Field in settings rows** — find the row renderer in `settings.tsx` that lays out label + description + control + error for a setting (the component rendering `field.label` / `field.description` — read the file around the `SettingControl` usage). Recompose it with the Field family (`Field`, `FieldLabel`, `FieldDescription`, `FieldError`, and the content/control slot per `field.tsx`), keeping the existing behavior: the control on the right (or per Field's `orientation` prop), description under the label, the rejected-write error message where it currently renders. This is a replacement of hand-rolled flex/label markup with the stock composition — if Field's structure genuinely cannot express the current layout, scope down to wrapping label+description+error and leave the outer grid; note what was kept.

- [ ] **Step 4: Verify + commit** — dashboard typecheck as in Task 4 Step 6, then boot check (Task 4 Step 7 procedure, fresh cache): `/_dashboard/settings` renders, and visually-critical markup is present (`curl … | grep -a 'data-slot="field"'` as a cheap assertion if Field renders a data-slot).

```bash
git add packages/runtime/dashboard && git commit -m "feat(dashboard): adopt Kbd/Empty/Field from the base-nova set"
```

---

### Task 6: Full verification + docs bookkeeping

**Files:**
- Modify: `docs/specs/2026-07-02-ui-library-design.md` (status note), `roadmap.md` (superseded cosmetic nits)
- No production code except fixes the verification itself demands.

- [ ] **Step 1: Whole-workspace test run** — `pnpm install` (root), then `pnpm test` (runs runtime incl. runtime↔MCP integration, sdk, manager, ui). Expected: all green. Fix forward anything broken by the migration (typical suspects: dashboard-rendering runtime tests, scaffold tests asserting theme.js markup).

- [ ] **Step 2: Fresh-cache boot + CSS artifact check** — boot per Task 4 Step 7 with a wiped scratch cache. Assert against the built dashboard CSS (find the asset href in `/_dashboard/` HTML; use `grep -a`, the HTML trips binary detection):
  - contains `color-scheme:dark` and `color-scheme:light`
  - contains cork-amber `--primary` (`#ce6f26` light / `#e08a3c` dark)
  - contains NO `radix` artifacts: `grep -c 'data-\[state=' ` should be ~0 for dialog/tabs slots (base uses `data-open`/`data-inactive`); non-zero hits are fine only if a consumer legitimately kept one
  - `pnpm ls radix-ui --depth -1 -r` shows no workspace package depending on it
- [ ] **Step 3: Apps render through workers** — with the same boot: `curl -s http://127.0.0.1:7791/greenhouse/ | grep -qa . && echo greenhouse-ok`, same for `/welcome/`. Open pages listed in `root/readme.md` coverage checklist via curl and confirm 200 + non-empty HTML. Fix forward any component-API breakage in `root/apps` (none expected — no Radix idioms in them).
- [ ] **Step 4: Docs** — `docs/specs/2026-07-02-ui-library-design.md`: under the "Primitives: Radix, deliberately" bullet add a one-line status note: superseded 2026-07-10 by `docs/specs/2026-07-10-base-ui-migration-design.md` (upstream default flipped; migrated to base-nova). `roadmap.md`: re-check the "Dashboard cosmetic nits (UI revamp, 2026-07-10)" entry — drop the sub-items the migration made moot (re-verify each against the new stock components before dropping; the Service-Overrides `pr-1` border nit likely still stands, the tab-strip items likely don't).
- [ ] **Step 5: Final commit** —

```bash
git add -A && git commit -m "docs: base-ui migration bookkeeping — spec status, roadmap nits"
```

- [ ] **Step 6: Report** — summarize for the person: what changed visually (base-nova restyle: button sizes h-8, tighter radii `rounded-lg`, lighter scrims, new focus rings), what was dropped (Storybook), and the human browser pass checklist: dark/light toggle, ⌘K palette, settings tabs + Service Overrides drafts surviving tab switches, one sheet + one alert-dialog, Greenhouse walk. Folding to master is the person's call — leave everything on `base-ui`.
