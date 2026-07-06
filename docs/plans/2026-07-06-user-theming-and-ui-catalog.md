# User Theming & UI Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/specs/2026-07-06-user-theming-and-ui-catalog-design.md`

**Goal:** (A) Person-editable theme override files — global `<root>/theme.css` and per-app
`apps/<id>/theme.css` — composed into every app/dashboard build with live rebuild on
change; then (B) a Storybook for `@lodekit/ui` served by the runtime at `/_ui/` that
previews every component under the live global theme and any app's composed theme.

**Architecture:** Slice A threads override files through the existing Vite alias
mechanism (`@lodekit/ui/theme-overrides.css` → per-build composed file, with a shipped
empty fallback) and extends the watcher with a second watch on the global file. Slice B
adds Storybook as devDeps of `packages/ui`, builds it statically, static-serves it from
the runtime, and injects themes at request time via a `/_ui/theme.css` endpoint plus a
Storybook toolbar app-picker — the static build is never rebuilt for theme changes.

**Tech Stack:** TypeScript, Hono, Vite 8 + `@tailwindcss/vite` (Tailwind v4), chokidar 4,
vitest, Storybook (react-vite framework), pnpm workspaces.

## Global Constraints

- Run every `pnpm` command from the **repo root** (`/…/lodekit/ui` worktree). NEVER run
  `pnpm install`/`add` with CWD inside `manager/` (its `.npmrc` rewrites the workspace —
  see CLAUDE.md).
- Work stays on the current `ui` branch. Commit directly to it; **never** fold into
  `master` (person's call). No merge commits. No `Co-Authored-By` trailers.
- The word **"catalog" must not appear in code**: no identifiers, routes, filenames,
  package scripts, or user-visible copy. Docs (`context.md`, `roadmap.md`, specs) may say
  "UI catalog". The route is `/_ui`.
- Runtime and `@lodekit/ui` stay **buildless** (raw TS via `tsx`); Storybook is a
  devDependency workbench + static-build tool, never a runtime dependency.
- Runtime tests: `pnpm --filter @lodekit/runtime test` (vitest; app-build tests take
  30–60s each — always pass `--` file filters while iterating, e.g.
  `pnpm --filter @lodekit/runtime test -- tests/build.test.ts`).
- If Node was switched, `better-sqlite3` may hit an ABI mismatch — fix with
  `pnpm rebuild better-sqlite3` (from repo root).
- Match existing code style; every changed line traces to this plan (Surgical Changes,
  CLAUDE.md).

---

## Slice A — user theming

### Task 1: Split `theme.css` into an import manifest (+ shipped empty overrides file)

CSS requires `@import` to precede all other statements, so the overrides import cannot be
appended after the token rules. Instead `theme.css` becomes a pure import manifest and its
rules move verbatim to `theme-tokens.css`. (This refines spec §2.2's "one trailing
@import" mechanically; intent unchanged.)

**Files:**
- Modify: `packages/ui/theme.css`
- Create: `packages/ui/theme-tokens.css`
- Create: `packages/ui/theme-overrides.css`

**Interfaces:**
- Produces: the bare specifier `@import "@lodekit/ui/theme-overrides.css"` inside
  `theme.css` — every consumer resolves it through whatever aliases `@lodekit/ui`;
  Task 2 redirects it per build, Task 4's Storybook config aliases it to the shipped
  empty file.

- [ ] **Step 1: Move the rules out of `theme.css`**

Create `packages/ui/theme-tokens.css` containing **everything currently in
`packages/ui/theme.css` below the `@source "./src";` line** — the `:root { … }` block,
the `@media (prefers-color-scheme: dark) { :root { … } }` block, the `@theme inline
{ … }` block, and the `@layer base { … }` block — moved **verbatim** (cut, not copied;
do not reformat).

- [ ] **Step 2: Rewrite `theme.css` as the manifest**

`packages/ui/theme.css` becomes exactly:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "./theme-tokens.css";
/* The person's theme overrides. Resolves to the empty file shipped beside this one;
   the runtime's build aliases redirect it to the composed global + per-app overrides. */
@import "@lodekit/ui/theme-overrides.css";

@source "./src";
```

- [ ] **Step 3: Create the shipped empty overrides file**

`packages/ui/theme-overrides.css`:

```css
/* Lodekit theme overrides — intentionally empty. The runtime replaces this import,
   per build, with the person's global + per-app token overrides. */
```

- [ ] **Step 4: Run the existing themed-build regression test**

Run: `pnpm --filter @lodekit/runtime test -- tests/build.test.ts`
Expected: PASS — in particular `builds an app importing @lodekit/ui, lucide-react, and
the theme` still finds `--primary` and `inline-flex` in the built CSS. (The runtime's
`@lodekit/ui` directory alias resolves the new bare import to the shipped empty file —
no runtime change needed yet.)

- [ ] **Step 5: Commit**

```bash
git add packages/ui/theme.css packages/ui/theme-tokens.css packages/ui/theme-overrides.css
git commit -m "refactor(ui): theme.css becomes an import manifest with an overridable theme-overrides.css"
```

---

### Task 2: Compose override files into app and dashboard builds

**Files:**
- Modify: `packages/runtime/src/build.ts` (`StartBuildTarget`, `buildStart`,
  `appAliases`, `runBuild`, `buildDashboard`)
- Test: `packages/runtime/tests/build.test.ts`, `packages/runtime/tests/dashboard.test.ts`

**Interfaces:**
- Consumes: Task 1's `@import "@lodekit/ui/theme-overrides.css"` in `theme.css`.
- Produces: `StartBuildTarget.themeOverrideFiles?: string[]` (absolute paths, cascade
  order — later wins); the composed file is written to `<outDir>/theme-overrides.css`
  on every build. `runBuild` passes `[<root>/theme.css, <appsDir>/<id>/theme.css]`;
  `buildDashboard` passes `[<root>/theme.css]`.

- [ ] **Step 1: Write the failing tests**

Append to the `describe("buildApp", …)` block in `packages/runtime/tests/build.test.ts`
(the `writeStartApp(…, { css: true })` helper already wires `index.css` →
`@lodekit/ui/theme.css`):

```ts
  it("applies a global theme override to an app build", async () => {
    fs.writeFileSync(path.join(root, "theme.css"), ":root { --primary: #ff3456; }\n");
    writeStartApp(
      "themed",
      `import { createFileRoute } from "@tanstack/react-router";\nimport { Button } from "@lodekit/ui";\nexport const Route = createFileRoute("/")({\n  component: () => <Button>hi</Button>,\n});\n`,
      { css: true }
    );
    const state = await buildApp(cfg, "themed");
    expect(state).toEqual({ status: "ready" });
    const assets = fs.readdirSync(path.join(cache, "themed", "client", "assets"));
    const cssFile = assets.find((f) => f.endsWith(".css"));
    const css = fs.readFileSync(path.join(cache, "themed", "client", "assets", cssFile!), "utf8");
    // hex chosen so minifiers can't shorten it (#ff3456 has no doubled-pair form)
    expect(css).toContain("ff3456");
  }, 60000);

  it("layers a per-app theme override after the global one", async () => {
    fs.writeFileSync(path.join(root, "theme.css"), ":root { --primary: #ff3456; }\n");
    writeStartApp(
      "themed",
      `import { createFileRoute } from "@tanstack/react-router";\nimport { Button } from "@lodekit/ui";\nexport const Route = createFileRoute("/")({\n  component: () => <Button>hi</Button>,\n});\n`,
      { css: true }
    );
    fs.writeFileSync(path.join(root, "apps", "themed", "theme.css"), ":root { --primary: #22cc78; }\n");
    const state = await buildApp(cfg, "themed");
    expect(state).toEqual({ status: "ready" });
    const assets = fs.readdirSync(path.join(cache, "themed", "client", "assets"));
    const cssFile = assets.find((f) => f.endsWith(".css"));
    const css = fs.readFileSync(path.join(cache, "themed", "client", "assets", cssFile!), "utf8");
    // the app value must be present; if the minifier kept both declarations, the
    // app's must come later (cascade order = later wins)
    expect(css).toContain("22cc78");
    const g = css.indexOf("ff3456");
    if (g !== -1) expect(css.indexOf("22cc78")).toBeGreaterThan(g);
  }, 60000);
```

Append inside the first `describe` of `packages/runtime/tests/dashboard.test.ts` (the one
that calls `buildDashboard` directly — reuse its `cfg`/root/cache setup exactly as the
existing test there does):

```ts
  it("applies the global theme override to the dashboard build", async () => {
    fs.writeFileSync(path.join(root, "theme.css"), ":root { --primary: #ff3456; }\n");
    const state = await buildDashboard(cfg);
    expect(state).toEqual({ status: "ready" });
    const assets = fs.readdirSync(path.join(cache, "_dashboard", "client", "assets"));
    const cssFile = assets.find((f) => f.endsWith(".css"));
    const css = fs.readFileSync(path.join(cache, "_dashboard", "client", "assets", cssFile!), "utf8");
    expect(css).toContain("ff3456");
  }, 60000);
```

(Adapt variable names to that file's harness — read it first; if its root/cache/cfg
variables are named differently, follow the file.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lodekit/runtime test -- tests/build.test.ts tests/dashboard.test.ts`
Expected: the three new tests FAIL (built CSS lacks `ff3456`/`22cc78`); all others pass.

- [ ] **Step 3: Implement composition in `build.ts`**

In `packages/runtime/src/build.ts`:

(a) Add to `StartBuildTarget`:

```ts
  // Person's theme override files (absolute), cascade order — later wins. Missing
  // files are skipped; the composed result replaces @lodekit/ui/theme-overrides.css.
  themeOverrideFiles?: string[];
```

(b) Replace the `appAliases` const with an array form (order matters: the exact
overrides entry must precede the `@lodekit/ui` directory entry, or the directory alias
would resolve the import to the shipped empty file):

```ts
const appAliases = (themeOverridesFile: string) => [
  { find: "@lodekit/ui/theme-overrides.css", replacement: themeOverridesFile },
  { find: "@lodekit/sdk", replacement: pkgDir("@lodekit/sdk") },
  { find: "@lodekit/ui", replacement: uiDir },
  { find: "lucide-react", replacement: lucideDir },
];
```

(c) At the top of `buildStart`, before `createBuilder`, compose the file (contents are
concatenated rather than `@import`ed so the composed file has no resolution needs of its
own; it sits at the outDir root, outside the `client/`/`server/` dirs that `emptyOutDir`
clears):

```ts
  const themeOverridesFile = path.join(t.outDir, "theme-overrides.css");
  fs.mkdirSync(t.outDir, { recursive: true });
  fs.writeFileSync(
    themeOverridesFile,
    (t.themeOverrideFiles ?? [])
      .filter((f) => fs.existsSync(f))
      .map((f) => `/* ${f} */\n${fs.readFileSync(f, "utf8")}`)
      .join("\n")
  );
```

and change the resolve line to `resolve: { alias: appAliases(themeOverridesFile) },`.

(d) In `runBuild`, add to the `buildStart({ … })` call:

```ts
      themeOverrideFiles: [
        path.join(cfg.root, "theme.css"),
        path.join(cfg.appsDir, appId, "theme.css"),
      ],
```

(e) In `buildDashboard`, add to its `buildStart({ … })` call:

```ts
      themeOverrideFiles: [path.join(cfg.root, "theme.css")],
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime test -- tests/build.test.ts tests/dashboard.test.ts`
Expected: PASS (all, including the three new tests).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/build.ts packages/runtime/tests/build.test.ts packages/runtime/tests/dashboard.test.ts
git commit -m "feat(runtime): compose global + per-app theme overrides into app and dashboard builds"
```

---

### Task 3: Watch the global theme file — rebuild everything on change

**Files:**
- Modify: `packages/runtime/src/watcher.ts`
- Test: `packages/runtime/tests/watcher.test.ts`

**Interfaces:**
- Consumes: `buildAll(cfg)`, `buildDashboard(cfg)` from `./build.js` (existing exports).
- Produces: `startWatcher(cfg)` now returns `{ close(): Promise<void> }` (was
  `FSWatcher`); `server.ts`'s `watcher.close()` call keeps compiling unchanged. A change
  to `apps/<id>/theme.css` already rebuilds that app via the existing appsDir watch — no
  code needed, covered by test.

- [ ] **Step 1: Write the failing test**

Add to `packages/runtime/tests/watcher.test.ts`. Its harness boots the real server
(`start(loadConfig())`) and has `collectEvents(base, until, timeoutMs)` plus a
`writeApp` helper without CSS support — extend the app it writes inline (write the two
extra files directly in the test):

```ts
  it("rebuilds apps and dashboard when the global theme.css changes", async () => {
    writeApp(
      "gt",
      `import { createFileRoute } from "@tanstack/react-router";\nimport { Button } from "@lodekit/ui";\nexport const Route = createFileRoute("/")({\n  component: () => <Button>gt</Button>,\n});\n`
    );
    // retrofit a theme.css import (writeApp's __root has no stylesheet link)
    fs.writeFileSync(
      path.join(root, "apps", "gt", "src", "index.css"),
      `@import "@lodekit/ui/theme.css";\n`
    );
    fs.writeFileSync(
      path.join(root, "apps", "gt", "src", "routes", "__root.tsx"),
      `import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";\nimport appCss from "../index.css?url";\n\nexport const Route = createRootRoute({\n  head: () => ({ meta: [{ title: "gt" }], links: [{ rel: "stylesheet", href: appCss }] }),\n  component: () => (\n    <html>\n      <head><HeadContent /></head>\n      <body><Outlet /><Scripts /></body>\n    </html>\n  ),\n});\n`
    );
    await collectEvents(base, `event: ready`, 90000); // initial build settles
    fs.writeFileSync(path.join(root, "theme.css"), ":root { --primary: #ff3456; }\n");
    await collectEvents(base, `event: ready`, 90000); // theme-triggered rebuild
    const assets = fs.readdirSync(path.join(cache, "gt", "client", "assets"));
    const cssFile = assets.find((f) => f.endsWith(".css"));
    const css = fs.readFileSync(path.join(cache, "gt", "client", "assets", cssFile!), "utf8");
    expect(css).toContain("ff3456");
  }, 180000);
```

(If the second `collectEvents` proves racy — the ready event for the *initial* build
arriving during the second collect — poll instead: loop up to 90s re-reading the built
CSS until it contains `ff3456`. Prefer the polling form if in doubt; it is
unambiguous.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lodekit/runtime test -- tests/watcher.test.ts`
Expected: the new test FAILS (built CSS never gains `ff3456` — nothing watches the
global file); existing tests pass.

- [ ] **Step 3: Implement the global-theme watch**

In `packages/runtime/src/watcher.ts`:

(a) Extend the build import: `import { buildAll, buildApp, buildDashboard, dropBuild } from "./build.js";`

(b) Change the signature to `export function startWatcher(cfg: Config): { close(): Promise<void> }`.

(c) Before the `return`, add a second chokidar instance (the existing `fs.mkdirSync(cfg.appsDir, { recursive: true })` already guarantees `cfg.root` exists):

```ts
  // The person's global theme file sits at the Lodekit root, outside appsDir — a
  // separate depth-0 watch (apps/ and data/ churn stays ignored) that rebuilds
  // everything, since every app and the dashboard composes it in.
  const globalTheme = path.join(cfg.root, "theme.css");
  let globalTimer: NodeJS.Timeout | undefined;
  const onGlobalTheme = () => {
    clearTimeout(globalTimer);
    globalTimer = setTimeout(() => {
      void buildAll(cfg);
      void buildDashboard(cfg);
    }, DEBOUNCE_MS);
  };
  const rootWatcher = chokidar.watch(cfg.root, {
    ignoreInitial: true,
    depth: 0,
    ignored: (p) => p !== cfg.root && p !== globalTheme,
  });
  rootWatcher.on("add", onGlobalTheme).on("change", onGlobalTheme).on("unlink", onGlobalTheme);
```

(d) Replace `return watcher;` with:

```ts
  return {
    close: async () => {
      await Promise.all([watcher.close(), rootWatcher.close()]);
    },
  };
```

(e) Check `packages/runtime/src/server.ts` still compiles — its
`void watcher.close();` works against the new return type. Do not change server.ts.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime test -- tests/watcher.test.ts`
Expected: PASS. Then the full runtime suite:
`pnpm --filter @lodekit/runtime test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/watcher.ts packages/runtime/tests/watcher.test.ts
git commit -m "feat(runtime): watch the global theme.css and rebuild all apps + dashboard on change"
```

---

## Slice B — UI catalog at `/_ui/`

### Task 4: Storybook scaffold in `packages/ui` + first story

**Files:**
- Modify: `packages/ui/package.json` (devDeps + scripts)
- Create: `packages/ui/.storybook/main.ts`
- Create: `packages/ui/.storybook/preview.tsx`
- Create: `packages/ui/src/components/button.stories.tsx`
- Modify: `.gitignore` (repo root)

**Interfaces:**
- Produces: `pnpm --filter @lodekit/ui storybook` (dev workbench, port 6006) and
  `pnpm --filter @lodekit/ui build-storybook` → `packages/ui/storybook-static/`
  (gitignored). Stories import components from `"@lodekit/ui"` (aliased in
  `.storybook/main.ts`). Task 5 extends preview + adds preview-head/manager files;
  Tasks 7/9 consume `storybook-static/`.

- [ ] **Step 1: Install Storybook devDependencies**

From the **repo root**:

```bash
pnpm --filter @lodekit/ui add -D storybook @storybook/react-vite vite@^8.0.0 tailwindcss@^4.0.0 @tailwindcss/vite@^4.0.0
```

(Latest Storybook major; it must accept `vite@^8` as a peer — the workspace is on Vite 8.
If the installed Storybook major's package layout differs from the imports below —
they're written for the consolidated `storybook/*` entrypoints of Storybook ≥9 — consult
`node_modules/storybook/package.json` `exports` and adjust import paths only.)

- [ ] **Step 2: Write `.storybook/main.ts`**

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

const uiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/components/*.stories.tsx"],
  async viteFinal(cfg) {
    cfg.plugins = [...(cfg.plugins ?? []), tailwindcss()];
    // Stories import "@lodekit/ui" and theme.css imports
    // "@lodekit/ui/theme-overrides.css" — both resolve into this package.
    const existing = cfg.resolve?.alias;
    const added = [{ find: "@lodekit/ui", replacement: uiRoot }];
    cfg.resolve = {
      ...cfg.resolve,
      alias: Array.isArray(existing)
        ? [...added, ...existing]
        : existing
          ? [...added, ...Object.entries(existing).map(([find, replacement]) => ({ find, replacement: replacement as string }))]
          : added,
    };
    return cfg;
  },
};
export default config;
```

- [ ] **Step 3: Write `.storybook/preview.tsx`** (minimal — Task 5 adds theming)

```tsx
import type { Preview } from "@storybook/react-vite";
import "../theme.css";

const preview: Preview = {};
export default preview;
```

- [ ] **Step 4: Write the exemplar story `src/components/button.stories.tsx`**

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@lodekit/ui";

const meta = {
  title: "Components/Button",
  component: Button,
  tags: ["autodocs"],
} satisfies Meta<typeof Button>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: "Button" } };

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button>Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm">Small</Button>
      <Button>Default</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

export const Disabled: Story = { args: { children: "Disabled", disabled: true } };
```

- [ ] **Step 5: Add package scripts and gitignore**

In `packages/ui/package.json` `"scripts"`, add:

```json
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
```

In the repo-root `.gitignore`, add the line:

```
packages/ui/storybook-static/
```

- [ ] **Step 6: Verify the static build**

Run: `pnpm --filter @lodekit/ui build-storybook`
Expected: exits 0; then verify:

```bash
test -f packages/ui/storybook-static/index.html && test -f packages/ui/storybook-static/index.json && echo OK
node -e "const i=require('./packages/ui/storybook-static/index.json'); const n=Object.keys(i.entries).length; if(n<2) throw new Error('too few stories'); console.log(n + ' stories')"
```

Expected: `OK` and a story count ≥ 2. Also confirm Tailwind ran: the built preview CSS
contains theme tokens:

```bash
grep -rl -- "--primary" packages/ui/storybook-static/assets | head -1
```

Expected: prints one CSS asset path.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/package.json packages/ui/.storybook packages/ui/src/components/button.stories.tsx .gitignore pnpm-lock.yaml
git commit -m "feat(ui): Storybook scaffold (react-vite + Tailwind v4) with Button stories"
```

---

### Task 5: Live theming in the Storybook — theme link + app picker

**Files:**
- Create: `packages/ui/.storybook/preview-head.html`
- Modify: `packages/ui/.storybook/preview.tsx`
- Create: `packages/ui/.storybook/manager.tsx`

**Interfaces:**
- Consumes: `GET /_ui/theme.css` and `GET /_ui/theme.css?app=<id>` (Task 7) and
  `GET /api/apps` → `[{ appId, name, … }]` (existing).
- Produces: a `themeApp` Storybook global; the preview `<link id="lodekit-theme">` whose
  `href` tracks it. In `storybook dev` (no runtime) the fetch fails and the link 404s —
  the picker hides and the stock theme applies, by design (spec §3.3).

- [ ] **Step 1: Write `preview-head.html`**

```html
<!-- Live theme overrides, served by the Lodekit runtime when the static build is
     mounted at /_ui/ (resolves to /_ui/theme.css). 404s harmlessly in storybook dev. -->
<link id="lodekit-theme" rel="stylesheet" href="theme.css">
```

- [ ] **Step 2: Extend `preview.tsx` with the global + decorator**

Replace `packages/ui/.storybook/preview.tsx` with:

```tsx
import React from "react";
import type { Preview } from "@storybook/react-vite";
import "../theme.css";

const preview: Preview = {
  initialGlobals: { themeApp: "" },
  decorators: [
    (Story, ctx) => {
      const link = document.getElementById("lodekit-theme") as HTMLLinkElement | null;
      if (link) {
        const app = typeof ctx.globals.themeApp === "string" ? ctx.globals.themeApp : "";
        const href = app ? `theme.css?app=${encodeURIComponent(app)}` : "theme.css";
        if (link.getAttribute("href") !== href) link.setAttribute("href", href);
      }
      return <Story />;
    },
  ],
};
export default preview;
```

- [ ] **Step 3: Write the manager app-picker `manager.tsx`**

```tsx
import React, { useEffect, useState } from "react";
import { addons, types, useGlobals } from "storybook/manager-api";

const TOOL_ID = "lodekit/app-theme";

// Served by the runtime at /_ui/, /api/apps lists the person's apps; pick one to
// preview components under that app's composed theme. In storybook dev the fetch
// fails and the picker stays hidden — stock theme only.
function AppPicker() {
  const [globals, updateGlobals] = useGlobals();
  const [apps, setApps] = useState<{ appId: string; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/apps")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setApps(Array.isArray(list) ? list : []))
      .catch(() => setApps([]));
  }, []);
  if (apps.length === 0) return null;
  const value = typeof globals.themeApp === "string" ? globals.themeApp : "";
  return (
    <select
      title="Preview with an app's theme"
      value={value}
      onChange={(e) => updateGlobals({ themeApp: e.target.value })}
      style={{ alignSelf: "center", marginLeft: 8 }}
    >
      <option value="">Theme: global</option>
      {apps.map((a) => (
        <option key={a.appId} value={a.appId}>
          Theme: {a.name}
        </option>
      ))}
    </select>
  );
}

addons.register(TOOL_ID, () => {
  addons.add(`${TOOL_ID}/tool`, {
    type: types.TOOL,
    title: "App theme",
    match: ({ tabId, viewMode }) => !tabId && (viewMode === "story" || viewMode === "docs"),
    render: () => <AppPicker />,
  });
});
```

(If the installed Storybook major exports the manager API from a different path than
`storybook/manager-api`, check `node_modules/storybook/package.json` `exports` and adjust
the import only.)

- [ ] **Step 4: Verify the static build still succeeds and embeds the link**

Run: `pnpm --filter @lodekit/ui build-storybook`
Expected: exits 0. Then:

```bash
grep -q 'id="lodekit-theme"' packages/ui/storybook-static/iframe.html && echo LINK-OK
```

Expected: `LINK-OK`. Full end-to-end behavior (picker + live CSS swap) is verified in
Task 7 against the running runtime.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/.storybook
git commit -m "feat(ui): Storybook live theming — runtime-served theme link + app-theme picker"
```

---### Task 6: Stories for every remaining component

**Files:**
- Create: `packages/ui/src/components/<name>.stories.tsx` for all 40 remaining
  components (every `.tsx` in `src/components/` except `button.tsx`).

**Interfaces:**
- Consumes: the barrel `"@lodekit/ui"` (import ONLY from it — never deep-import
  component files; that's the app contract the stories model) and the Task 4 CSF
  pattern.

- [ ] **Step 1: Write the stories, following the Button pattern**

Every file follows the exact shape of `button.stories.tsx`: `Meta` with
`title: "Components/<PascalName>"`, `tags: ["autodocs"]`, typed `StoryObj`, and a
`Default` story rendering a **realistic, self-contained example** (labels like "Email",
"Save", plausible list data — not "foo"). Rules:

1. Composite components render their full composition (e.g. Card: CardHeader +
   CardTitle + CardDescription + CardContent + CardFooter).
2. Overlay/trigger components get a `Default` story with their Trigger wired so the
   person can open them (e.g. `<Dialog><DialogTrigger asChild><Button>Open</Button></DialogTrigger><DialogContent>…`), and where the component supports it, an
   additional `Open` story using `defaultOpen` so a visible state exists without
   interaction.
3. Components with variants/sizes get a `Variants` (and `Sizes`) story like Button's.
4. Wrap wide/positioned components in a sized container div (`className="w-96"` or
   similar) so they render sensibly on the canvas.

Second exemplar — overlay pattern, `dialog.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@lodekit/ui";

const meta = {
  title: "Components/Dialog",
  component: Dialog,
  tags: ["autodocs"],
} satisfies Meta<typeof Dialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Edit profile</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>Make changes and save when you're done.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const Open: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>Make changes and save when you're done.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
```

Per-component notes (all other components: straightforward `Default` +
variants per the rules above):

| Component | Note |
|---|---|
| accordion, collapsible | `type="single" collapsible` / `defaultOpen`; 2–3 items |
| alert-dialog, sheet, drawer, popover, hover-card, tooltip | overlay pattern (Dialog exemplar); tooltip needs `TooltipProvider`; hover-card/tooltip have no `defaultOpen` `Open` story if unsupported — trigger-only is fine |
| command | render `Command` inline (not the dialog variant): CommandInput + CommandList with 2 groups |
| context-menu, dropdown-menu, menubar, navigation-menu | trigger pattern; menubar/navigation-menu render their bar inline |
| input-otp | `maxLength={6}` with `InputOTPGroup`/`InputOTPSlot` ×6 |
| resizable | `ResizablePanelGroup direction="horizontal"` + 2 panels + handle, inside `h-48 w-96` container |
| select, radio-group, checkbox, switch, slider, toggle, toggle-group | `Default` + a `Disabled` story; select gets 3–4 options |
| sidebar | wrap in `SidebarProvider`; render `Sidebar` + `SidebarContent` with a `SidebarMenu` of 3 items inside a `h-96` relative container |
| sonner | render `<Toaster />` plus a Button whose onClick calls `toast("Saved")` — import `toast` from `"@lodekit/ui"` if the barrel re-exports it, else from the story's own `sonner` import is NOT allowed (no deep deps) — check `src/index.ts`; if `toast` is not exported, render `<Toaster />` with a note-only story |
| table | full Table composition with 3 realistic rows |
| pagination, breadcrumb | full composition with 3 links |
| skeleton, separator, aspect-ratio, scroll-area, progress, avatar, badge, alert, card, input, textarea, label | simple `Default` (+ `Variants` where the component has a `variant` prop: badge, alert) |

Check each component's actual exports in `packages/ui/src/index.ts` before writing its
story; render only what the barrel exports.

- [ ] **Step 2: Build to verify all stories compile and render statically**

Run: `pnpm --filter @lodekit/ui build-storybook`
Expected: exits 0. Then:

```bash
node -e "
const i = require('./packages/ui/storybook-static/index.json');
const titles = new Set(Object.values(i.entries).map(e => e.title));
const fs = require('fs');
const comps = fs.readdirSync('./packages/ui/src/components').filter(f => f.endsWith('.tsx') && !f.endsWith('.stories.tsx'));
const missing = comps.filter(c => ![...titles].some(t => t.toLowerCase().replace(/[^a-z]/g,'') === ('components/' + c.replace('.tsx','')).toLowerCase().replace(/[^a-z]/g,'')));
if (missing.length) throw new Error('components without stories: ' + missing.join(', '));
console.log(titles.size + ' component story files cover all ' + comps.length + ' components');
"
```

Expected: prints coverage line; throws if any component lacks a story.

- [ ] **Step 3: Spot-check in the workbench** (skippable in headless execution — note it
  for the person if skipped)

Run: `pnpm --filter @lodekit/ui storybook` and eyeball a handful (button, dialog,
sidebar, table) in light + dark (OS setting). Stop the server after.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/*.stories.tsx
git commit -m "feat(ui): stories for every component"
```

---

### Task 7: Runtime serves `/_ui/` + the live `theme.css` endpoint

**Files:**
- Modify: `packages/runtime/src/build.ts` (export `uiDir`)
- Modify: `packages/runtime/src/server.ts`
- Test: `packages/runtime/tests/ui-serving.test.ts` (new)

**Interfaces:**
- Consumes: `uiDir` (the resolved `@lodekit/ui` package dir, already computed in
  build.ts), `isValidAppId`/`scanApps` from `./registry.js`, `serveStatic` (already
  imported in server.ts).
- Produces: `GET /_ui/` (static Storybook, or a 404 "not built" page),
  `GET /_ui/theme.css[?app=<id>]` (live composed overrides, `text/css`, `no-store`),
  `GET /_ui` → 301 `/_ui/`. Env override `LODEKIT_UI_STATIC_DIR` (tests; read per
  `createApp` call). Task 5's preview link depends on these URLs.

- [ ] **Step 1: Write the failing tests**

Create `packages/runtime/tests/ui-serving.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";
import type { Config } from "../src/config.js";

let root: string, cache: string, staticDir: string, server: Server, base: string;

function cfgFor(root: string, cache: string): Config {
  return {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: cache,
    port: 0,
    baseUrl: "http://lodekit.localhost:0",
  };
}

async function listen(cfg: Config): Promise<void> {
  server = createServer(cfg);
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-root-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-cache-"));
  staticDir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-ui-"));
  process.env.LODEKIT_UI_STATIC_DIR = staticDir;
});
afterEach(() => {
  delete process.env.LODEKIT_UI_STATIC_DIR;
  server?.close();
  for (const d of [root, cache, staticDir]) fs.rmSync(d, { recursive: true, force: true });
});

describe("/_ui static serving", () => {
  it("serves the built storybook and redirects /_ui to /_ui/", async () => {
    fs.writeFileSync(path.join(staticDir, "index.html"), "<!doctype html><title>ui</title>");
    fs.mkdirSync(path.join(staticDir, "assets"));
    fs.writeFileSync(path.join(staticDir, "assets", "a.js"), "// asset");
    await listen(cfgFor(root, cache));
    const redirect = await fetch(base + "/_ui", { redirect: "manual" });
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get("location")).toBe("/_ui/");
    const home = await fetch(base + "/_ui/");
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("<title>ui</title>");
    const asset = await fetch(base + "/_ui/assets/a.js");
    expect(asset.status).toBe(200);
  });

  it("serves a not-built page when the static build is missing", async () => {
    await listen(cfgFor(root, cache)); // staticDir exists but has no index.html
    const res = await fetch(base + "/_ui/");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("build-storybook");
  });
});

describe("/_ui/theme.css", () => {
  it("returns the global override file, text/css, no-store", async () => {
    fs.writeFileSync(path.join(root, "theme.css"), ":root { --primary: #ff3456; }\n");
    await listen(cfgFor(root, cache));
    const res = await fetch(base + "/_ui/theme.css");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain("#ff3456");
  });

  it("returns empty css when no global file exists", async () => {
    await listen(cfgFor(root, cache));
    const res = await fetch(base + "/_ui/theme.css");
    expect(res.status).toBe(200);
    expect((await res.text()).trim()).toBe("");
  });

  it("composes global + per-app overrides in cascade order", async () => {
    fs.writeFileSync(path.join(root, "theme.css"), ":root { --primary: #ff3456; }\n");
    const appDir = path.join(root, "apps", "demo");
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, "manifest.json"), JSON.stringify({ name: "Demo", appId: "demo" }));
    fs.writeFileSync(path.join(appDir, "theme.css"), ":root { --primary: #22cc78; }\n");
    await listen(cfgFor(root, cache));
    const css = await (await fetch(base + "/_ui/theme.css?app=demo")).text();
    expect(css.indexOf("#22cc78")).toBeGreaterThan(css.indexOf("#ff3456"));
  });

  it("rejects invalid and unknown app ids", async () => {
    await listen(cfgFor(root, cache));
    expect((await fetch(base + "/_ui/theme.css?app=..%2Fevil")).status).toBe(404);
    expect((await fetch(base + "/_ui/theme.css?app=nope")).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lodekit/runtime test -- tests/ui-serving.test.ts`
Expected: FAIL — `/_ui/...` currently falls through to appHost (404s without the
expected bodies/headers).

- [ ] **Step 3: Implement**

(a) In `packages/runtime/src/build.ts`, export the existing const:
`const uiDir = …` → `export const uiDir = …`.

(b) In `packages/runtime/src/server.ts`:

Imports: add `path`, `uiDir`, and registry helpers:

```ts
import path from "node:path";
import { isValidAppId, scanApps } from "./registry.js";
```

and extend the build import: `import { buildAll, buildDashboard, getDashboardState, uiDir } from "./build.js";`
(keep exactly the names already imported there plus `uiDir`).

Below `fallbackPage`, add:

```ts
const uiNotBuiltPage = () => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Lodekit</title>
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:640px;margin:15vh auto;padding:0 24px;color:#0a0a0a}.muted{color:#6b7280}code{background:#f4f4f5;padding:2px 6px;border-radius:6px}</style>
</head>
<body><h1>Lodekit</h1><p class="muted">The component preview isn't built. Run <code>pnpm --filter @lodekit/ui build-storybook</code> and reload.</p></body>
</html>
`;
```

Inside `createApp(cfg)`, before the `return new Hono()` chain:

```ts
  // Static Storybook build for /_ui — shipped inside the @lodekit/ui package
  // (storybook-static travels with it through pnpm deploy). Env override is for tests.
  const uiStaticDir = process.env.LODEKIT_UI_STATIC_DIR ?? path.join(uiDir, "storybook-static");
```

In the Hono chain, after the `.route("/api", …)` line and before the `_dashboard`
block, add:

```ts
    // Live theme overrides for the /_ui preview: global file, optionally composed
    // with one app's file (?app=<id>) — read per request, never cached, so theme
    // edits show on reload without rebuilding the static Storybook.
    .get("/_ui/theme.css", (c) => {
      const read = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "");
      let css = read(path.join(cfg.root, "theme.css"));
      const app = c.req.query("app");
      if (app !== undefined) {
        if (!isValidAppId(app) || !scanApps(cfg.appsDir).some((a) => a.appId === app)) {
          return c.text("unknown app", 404);
        }
        css += "\n" + read(path.join(cfg.appsDir, app, "theme.css"));
      }
      c.header("Cache-Control", "no-store");
      c.header("Content-Type", "text/css; charset=utf-8");
      return c.body(css);
    })
    .use("/_ui/*", serveStatic({
      root: uiStaticDir,
      rewriteRequestPath: (p) => p.replace(/^\/_ui/, "") || "/",
    }))
    .all("/_ui/*", (c) => c.html(uiNotBuiltPage(), 404))
    .get("/_ui", (c) => c.redirect("/_ui/", 301))
```

(`serveStatic` calls `next()` on a miss, landing on the `.all` not-built page — which
also keeps `/_ui/*` from ever reaching `appHost`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime test -- tests/ui-serving.test.ts`
Expected: PASS (all 7). Then the full suite: `pnpm --filter @lodekit/runtime test` —
Expected: PASS.

- [ ] **Step 5: End-to-end smoke against the real static build**

```bash
pnpm --filter @lodekit/ui build-storybook
LODEKIT_ROOT=$(pwd)/examples pnpm --filter @lodekit/runtime start &
sleep 20
curl -s http://localhost:7777/_ui/ | grep -qi storybook && echo UI-OK
curl -s "http://localhost:7777/_ui/theme.css?app=habit-tracker" -o /dev/null -w "%{http_code}\n"
kill %1
```

Expected: `UI-OK` and `200` (examples' habit-tracker exists; its css is empty — fine).
If the app id differs, `ls examples/apps` and use one that's there.

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/build.ts packages/runtime/src/server.ts packages/runtime/tests/ui-serving.test.ts
git commit -m "feat(runtime): serve the ui component preview at /_ui with live theme.css composition"
```

---

### Task 8: Dashboard link to `/_ui/`

**Files:**
- Modify: `packages/runtime/dashboard/src/routes/index.tsx`
- Test: `packages/runtime/tests/dashboard.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/runtime/tests/dashboard.test.ts`, in the serving describe (the one that
fetches `base + "/_dashboard/"`), add:

```ts
  it("links to the ui component preview", async () => {
    const html = await (await fetch(base + "/_dashboard/")).text();
    expect(html).toContain('href="/_ui/"');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lodekit/runtime test -- tests/dashboard.test.ts`
Expected: the new test FAILS (no such href); others pass.

- [ ] **Step 3: Add the link**

In `packages/runtime/dashboard/src/routes/index.tsx`, replace the header block

```tsx
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Lodekit</h1>
        <span className="text-muted-foreground">
          {apps ? `${apps.length} ${apps.length === 1 ? "app" : "apps"}` : ""}
        </span>
      </div>
```

with

```tsx
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Lodekit</h1>
        <div className="flex items-center gap-4">
          <a href="/_ui/" className="text-sm text-muted-foreground hover:underline">
            Components
          </a>
          <span className="text-muted-foreground">
            {apps ? `${apps.length} ${apps.length === 1 ? "app" : "apps"}` : ""}
          </span>
        </div>
      </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lodekit/runtime test -- tests/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/dashboard/src/routes/index.tsx packages/runtime/tests/dashboard.test.ts
git commit -m "feat(dashboard): link to the /_ui component preview"
```

---

### Task 9: Bundle the static Storybook into the packaged payload

**Files:**
- Modify: `manager/scripts/prepare-bundle.mjs`

**Interfaces:**
- Consumes: `pnpm --filter @lodekit/ui build-storybook` (Task 4) and the fact that
  `@lodekit/runtime`'s `pnpm deploy` copies its workspace dep `@lodekit/ui` wholesale
  (the ui package declares no `files` allowlist, so `storybook-static/` travels).
- Produces: payload contains
  `platform/runtime/node_modules/@lodekit/ui/storybook-static/index.html`, which the
  runtime's `uiDir`-relative resolution (Task 7) finds unchanged.

- [ ] **Step 1: Build the Storybook before deploying the payload**

In `manager/scripts/prepare-bundle.mjs`, at the top of `buildPayload()` (before the
`fs.rmSync(platformDir, …)` line), add:

```js
  // The /_ui preview ships as static files inside @lodekit/ui — build it before the
  // deploy below copies the package into the payload.
  run(`pnpm --filter @lodekit/ui build-storybook`);
```

- [ ] **Step 2: Add the payload assertion**

Below `assertSelfContainedTsconfigs()` (the function definition), add:

```js
// The /_ui preview must ship inside the payload's @lodekit/ui copy — a files/packing
// change in the ui package would silently drop it.
function assertUiPreviewInPayload() {
  const index = path.join(
    platformDir, "runtime", "node_modules", "@lodekit", "ui", "storybook-static", "index.html"
  );
  if (!fs.existsSync(index)) {
    throw new Error(`Payload is missing the built ui preview: ${index}`);
  }
}
```

and add `assertUiPreviewInPayload();` to the call sequence at the bottom, after
`assertSelfContainedTsconfigs();`.

- [ ] **Step 3: Verify**

Run: `node manager/scripts/prepare-bundle.mjs`
Expected: completes with `Bundle inputs ready: …`. **Caveat:** the script's own guard
requires Node v24.12.0. If the current Node differs, the guard exits with its
switch-Node message — that is the script working as designed; report it and have the
person (or CI) run the full `pnpm --filter @lodekit/manager make` on the pinned Node.
Do not weaken the guard.

- [ ] **Step 4: Commit**

```bash
git add manager/scripts/prepare-bundle.mjs
git commit -m "feat(manager): build and assert the /_ui preview into the payload"
```

---

### Task 10: Domain language + roadmap

**Files:**
- Modify: `context.md`
- Modify: `roadmap.md`

- [ ] **Step 1: Add terms to `context.md`**

After the **UI library** entry (~line 167), add two entries matching the file's
established format (bold term, definition paragraph, optional _Avoid_ line — read the
neighbors and mirror them):

```markdown
**Theme overrides**:
The person's styling surface: optional plain-CSS files redefining the UI library's
token variables — `theme.css` at the Lodekit root (global: all apps and the dashboard)
and `apps/<app-id>/theme.css` (one app, layered after the global file). Tokens are the
contract; arbitrary CSS is possible but unpromised.
_Avoid_: skins, custom CSS (the mechanism is token redefinition)

**UI catalog**:
The person-facing window onto the UI library: a statically built Storybook the runtime
serves at `/_ui/`, rendering every component under the live global theme or any app's
composed theme. Parallel to the service catalog ("what can my apps use?"). The term is
docs-only — code says `/_ui`.
_Avoid_: "catalog" in code, Storybook (as the product name — Storybook is the tool)
```

- [ ] **Step 2: Record deferrals in `roadmap.md`**

Read `roadmap.md` and add, in its existing style/sections:

- `ui.lodekit.com — deploy the UI catalog's static Storybook build publicly beside
  docs.lodekit.com (docs branch owns web deploys); the build is already
  deploy-agnostic.`
- `Dashboard theme picker — person-facing UI (presets/color pickers) writing the same
  theme-override token files.`

- [ ] **Step 3: Commit**

```bash
git add context.md roadmap.md
git commit -m "docs: theme overrides + UI catalog domain terms; roadmap deferrals"
```

---

### Task 11: Final verification (spec §5)

- [ ] **Step 1: Full test suite**

Run from repo root: `pnpm test`
Expected: all workspace packages green.

- [ ] **Step 2: Live theming walkthrough against examples**

```bash
pnpm --filter @lodekit/ui build-storybook
LODEKIT_ROOT=$(pwd)/examples pnpm dev
```

Then (curl or browser):
1. `echo ':root { --primary: #22cc78; }' > examples/theme.css` → within ~seconds the
   example apps and dashboard rebuild; their pages show the new primary color
   (`curl -s localhost:7777/_ui/theme.css` returns it immediately).
2. `echo ':root { --primary: #ff3456; }' > examples/apps/habit-tracker/theme.css` →
   only habit-tracker rebuilds; `/_ui/theme.css?app=habit-tracker` returns both values,
   app's last.
3. `/_dashboard/` shows the Components link; `/_ui/` loads the Storybook; the toolbar
   app picker lists the example apps and switching it restyles the preview.
4. Clean up: `rm examples/theme.css examples/apps/habit-tracker/theme.css` (do NOT
   commit theme files into examples/).

Anything not verifiable headlessly (step 3's visual check): state exactly what was and
wasn't verified when reporting.

- [ ] **Step 3: Leave the work on the `ui` branch**

Per CLAUDE.md: do not merge/rebase into `master`. Report completion; integration is the
person's call.
