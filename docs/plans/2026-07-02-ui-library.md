# @lodekit/ui (UI Library) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `packages/ui` (`@lodekit/ui`) — vendored themed shadcn components + one shared theme — aliased into the shared toolchain, and rebuild the dashboard as a React app styled with it.

**Architecture:** `@lodekit/ui` is a buildless raw-TSX workspace package (like `@lodekit/sdk`): a barrel export, ~41 vendored shadcn components on Radix, and a `theme.css` (Tailwind v4 CSS-first, neutral base, system-preference dark mode) that apps import as their entire stylesheet. `build.ts` gains `@lodekit/ui` and `lucide-react` aliases plus a `buildDashboard()` that compiles `packages/runtime/dashboard/` (a React app, not an app-contract app) into `cacheDir/_dashboard` at startup, served at `/` and `/_dashboard`.

**Tech Stack:** pnpm workspaces, Vite (JS API) + `@vitejs/plugin-react` + `@tailwindcss/vite` (Tailwind v4), React 18, shadcn CLI (vendored source), Radix primitives, vitest.

**Spec:** `docs/specs/2026-07-02-ui-library-design.md` — normative for scope and decisions.

## Global Constraints

- Canonical domain language per `context.md`: **app** (never *tool*), **agent** (never *Claude* generically), **dashboard**, **cache**. User-facing copy must follow it.
- `@lodekit/ui` and the runtime stay **buildless** — no build step in any `packages/*` member; apps and the dashboard are built by the runtime via the Vite JS API.
- Apps carry **no dependencies**; every bare import an app may use must be aliased in `build.ts`.
- Package manager is **pnpm**; run installs from the repo root. `packages/ui` is auto-covered by the `packages/*` workspace glob.
- Commits: conventional prefixes (`feat:`, `docs:`, `test:`), **no `Co-Authored-By` trailers**.
- Platform is macOS (darwin): `sed -i ''` syntax.
- Tests: `pnpm --filter @lodekit/runtime test` (vitest); UI package check: `pnpm --filter @lodekit/ui check` (tsc, added by Task 1).
- Vite builds in tests need generous timeouts (existing tests use 30000 ms; dashboard build uses 60000 ms).

## File Structure

```
packages/ui/                        # NEW package (@lodekit/ui)
  package.json                      # main/types → src/index.ts; deps added by shadcn CLI
  tsconfig.json                     # noEmit check config; @/* paths for the CLI
  components.json                   # shadcn CLI config (Tailwind v4, neutral, new-york)
  theme.css                         # the one stylesheet apps import
  src/index.ts                      # barrel — the only import surface
  src/lib/utils.ts                  # cn() (CLI-generated)
  src/hooks/use-mobile.ts           # CLI-generated (sidebar dependency)
  src/components/*.tsx              # 41 vendored shadcn components
packages/runtime/
  src/build.ts                      # MODIFY: aliases, shared vite-options factory, buildDashboard()
  src/server.ts                     # MODIFY: dashboard serving, async start()
  src/index.ts                      # MODIFY: void start()
  src/scaffold.ts                   # MODIFY: starter imports @lodekit/ui
  dashboard/                        # NEW: dashboard React app source
    index.html
    src/main.tsx
    src/App.tsx
    src/index.css
  public/                           # DELETE (vanilla dashboard + design-system.css)
  package.json                      # MODIFY: add @lodekit/ui workspace dep
  tests/build.test.ts               # MODIFY: ui-import fixture test
  tests/dashboard.test.ts           # REWRITE: buildDashboard + serving tests
  tests/scaffold.test.ts            # MODIFY: starter assertions
  tests/e2e.test.ts, tests/mcp.test.ts  # MODIFY: `await start(...)`
examples/apps/habit-tracker/src/{App.tsx,index.css}    # MODIFY: migrate
examples/apps/expense-tracker/src/{App.tsx,index.css}  # MODIFY: migrate
roadmap.md                          # MODIFY: follow-ups per spec §10
```

---

### Task 1: Scaffold the `packages/ui` package and theme

**Files:**
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/components.json`, `packages/ui/theme.css`

**Interfaces:**
- Produces: workspace member `@lodekit/ui` with `theme.css` at its root; Task 2 generates components into `src/`; Task 3 aliases the package by name.

- [ ] **Step 1: Write `packages/ui/package.json`**

React is a peer (the toolchain aliases one shared copy); types + tsc are dev-only. The shadcn CLI adds runtime deps in Task 2.

```json
{
  "name": "@lodekit/ui",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "check": "tsc --noEmit"
  },
  "peerDependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.1",
    "@types/react-dom": "^18.3.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "typescript": "^5.7.3"
  }
}
```

- [ ] **Step 2: Write `packages/ui/tsconfig.json`**

The `@/*` path mapping exists for the shadcn CLI's alias resolution (Task 2 rewrites generated imports to relative, but the CLI needs it to place files).

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `packages/ui/components.json`**

Tailwind v4 signals: empty `config`, css → `theme.css`. `aliases.ui` → `@/components` puts components at `src/components/*.tsx` (flat, matching the spec's tree).

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "theme.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "ui": "@/components",
    "lib": "@/lib",
    "utils": "@/lib/utils",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 4: Write `packages/ui/theme.css`**

Hand-written (we skip `shadcn init` — it wants a framework project; the token block below is upstream shadcn's stock **neutral** theme). Deliberate deviations from stock, per spec §3: `@source "./src"` (component source lives outside any app root); dark tokens under `@media (prefers-color-scheme: dark)` instead of a `.dark` class, and **no** `@custom-variant dark` line — Tailwind v4's default `dark:` variant is already the media query, so the components' `dark:` utilities line up with the token switch; `--font-sans` is a system stack (nothing fetched — local is the point).

```css
@import "tailwindcss";
@import "tw-animate-css";

@source "./src";

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: oklch(0.145 0 0);
    --foreground: oklch(0.985 0 0);
    --card: oklch(0.205 0 0);
    --card-foreground: oklch(0.985 0 0);
    --popover: oklch(0.205 0 0);
    --popover-foreground: oklch(0.985 0 0);
    --primary: oklch(0.922 0 0);
    --primary-foreground: oklch(0.205 0 0);
    --secondary: oklch(0.269 0 0);
    --secondary-foreground: oklch(0.985 0 0);
    --muted: oklch(0.269 0 0);
    --muted-foreground: oklch(0.708 0 0);
    --accent: oklch(0.269 0 0);
    --accent-foreground: oklch(0.985 0 0);
    --destructive: oklch(0.704 0.191 22.216);
    --border: oklch(1 0 0 / 10%);
    --input: oklch(1 0 0 / 15%);
    --ring: oklch(0.556 0 0);
    --chart-1: oklch(0.488 0.243 264.376);
    --chart-2: oklch(0.696 0.17 162.48);
    --chart-3: oklch(0.769 0.188 70.08);
    --chart-4: oklch(0.627 0.265 303.9);
    --chart-5: oklch(0.645 0.246 16.439);
    --sidebar: oklch(0.205 0 0);
    --sidebar-foreground: oklch(0.985 0 0);
    --sidebar-primary: oklch(0.488 0.243 264.376);
    --sidebar-primary-foreground: oklch(0.985 0 0);
    --sidebar-accent: oklch(0.269 0 0);
    --sidebar-accent-foreground: oklch(0.985 0 0);
    --sidebar-border: oklch(1 0 0 / 10%);
    --sidebar-ring: oklch(0.556 0 0);
  }
}

@theme inline {
  --font-sans: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 5: Install and verify the workspace picked the package up**

Run: `pnpm install` (repo root)
Then: `pnpm --filter @lodekit/ui exec pwd`
Expected: prints `.../packages/ui` (member resolved). `tw-animate-css` is not installed yet — the CLI adds it in Task 2; `check` would fail (no `src/`) — that's expected until Task 2.

- [ ] **Step 6: Commit**

```bash
git add packages/ui pnpm-lock.yaml
git commit -m "feat(ui): scaffold @lodekit/ui package with shared theme.css (neutral, system dark mode)"
```

---

### Task 2: Vendor the shadcn components and build the barrel

**Files:**
- Create: `packages/ui/src/components/*.tsx` (41 files), `packages/ui/src/lib/utils.ts`, `packages/ui/src/hooks/use-mobile.ts`, `packages/ui/src/index.ts`
- Modify: `packages/ui/package.json` (deps added by the CLI), `packages/ui/theme.css` (revert if CLI touches it)

**Interfaces:**
- Produces: barrel `@lodekit/ui` exporting all components (`import { Button, Card, ... } from "@lodekit/ui"`). Later tasks import: `Button`, `Badge`, `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `Input`, `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`, `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow`, `Skeleton`.

- [ ] **Step 1: Generate the components with the shadcn CLI**

From `packages/ui/` (the CLI reads `components.json`, writes into `src/`, and `pnpm add`s each component's deps — expect `radix-ui`/`@radix-ui/react-*`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `cmdk`, `vaul`, `sonner`, `input-otp`, `react-resizable-panels`, `tw-animate-css`):

```bash
cd packages/ui
pnpm dlx shadcn@latest add accordion alert alert-dialog aspect-ratio avatar badge breadcrumb button card checkbox collapsible command context-menu dialog drawer dropdown-menu hover-card input input-otp label menubar navigation-menu pagination popover progress radio-group resizable scroll-area select separator sheet sidebar skeleton slider sonner switch table tabs textarea toggle toggle-group tooltip
```

Expected: 41 files under `src/components/`, plus `src/lib/utils.ts` and `src/hooks/use-mobile.ts` (pulled in by sidebar). If the CLI balks at the bare package ("framework not detected" or similar), re-run with `--yes`; if it still refuses, stop and surface it — don't hand-copy 41 files silently.

If the CLI modified `theme.css` (some versions merge token blocks), `git diff theme.css` and revert anything that conflicts with Task 1's file (keep our `@source` + media-query dark structure): `git checkout -- theme.css` if the diff is only re-added stock blocks.

- [ ] **Step 2: Rewrite `@/` imports to relative (aliases don't exist inside the bundled package)**

Generated files import `@/lib/utils` etc.; when Vite bundles this source into an app, tsconfig paths don't apply. Rewrite:

```bash
cd packages/ui
LC_ALL=C find src/components -name '*.tsx' -exec sed -i '' \
  -e 's|"@/lib/|"../lib/|g' \
  -e 's|"@/hooks/|"../hooks/|g' \
  -e 's|"@/components/|"./|g' {} +
grep -rn '"@/' src && echo "LEFTOVERS — fix by hand" || echo "clean"
```

Expected: `clean`.

- [ ] **Step 3: Detach `sonner` from next-themes**

Stock `sonner.tsx` imports `useTheme` from `next-themes` (a Next.js-ecosystem dep we don't want). Edit `src/components/sonner.tsx`: delete the `next-themes` import and the `useTheme()` call, and pass the literal theme:

```tsx
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
```

(If the generated file's prop/style body differs, keep its body — the required change is only: no `next-themes`, `theme="system"` literal.) If the CLI added `next-themes` to `package.json`, remove it: `pnpm remove next-themes`.

- [ ] **Step 4: Write the barrel `packages/ui/src/index.ts`**

One `export *` per component file, alphabetical (star-exports are collision-free across the stock set; if `tsc` or Vite ever reports an ambiguous re-export, switch that file to explicit named exports):

```ts
export * from "./components/accordion";
export * from "./components/alert";
export * from "./components/alert-dialog";
export * from "./components/aspect-ratio";
export * from "./components/avatar";
export * from "./components/badge";
export * from "./components/breadcrumb";
export * from "./components/button";
export * from "./components/card";
export * from "./components/checkbox";
export * from "./components/collapsible";
export * from "./components/command";
export * from "./components/context-menu";
export * from "./components/dialog";
export * from "./components/drawer";
export * from "./components/dropdown-menu";
export * from "./components/hover-card";
export * from "./components/input";
export * from "./components/input-otp";
export * from "./components/label";
export * from "./components/menubar";
export * from "./components/navigation-menu";
export * from "./components/pagination";
export * from "./components/popover";
export * from "./components/progress";
export * from "./components/radio-group";
export * from "./components/resizable";
export * from "./components/scroll-area";
export * from "./components/select";
export * from "./components/separator";
export * from "./components/sheet";
export * from "./components/sidebar";
export * from "./components/skeleton";
export * from "./components/slider";
export * from "./components/sonner";
export * from "./components/switch";
export * from "./components/table";
export * from "./components/tabs";
export * from "./components/textarea";
export * from "./components/toggle";
export * from "./components/toggle-group";
export * from "./components/tooltip";
export { cn } from "./lib/utils";
```

(If a listed component's file name differs on disk, match the file; if the CLI emitted extra hooks/files, leave them — they're internal.)

- [ ] **Step 5: Type-check the package**

Run: `pnpm --filter @lodekit/ui check`
Expected: exit 0. Fix any errors mechanically (missing rewrite, leftover `next-themes` import) — do not restructure components.

- [ ] **Step 6: Commit**

```bash
git add packages/ui pnpm-lock.yaml
git commit -m "feat(ui): vendor shadcn core set (41 components) with barrel export"
```

---

### Task 3: Alias `@lodekit/ui` and `lucide-react` into the toolchain (TDD)

**Files:**
- Modify: `packages/runtime/src/build.ts`, `packages/runtime/package.json`
- Test: `packages/runtime/tests/build.test.ts`

**Interfaces:**
- Consumes: `@lodekit/ui` barrel + `theme.css` (Tasks 1–2).
- Produces: apps (and the dashboard) can bare-import `@lodekit/ui` and `lucide-react`; `pkgDir(id)` pattern extended in `build.ts` for Task 4's factory.

- [ ] **Step 1: Write the failing test in `packages/runtime/tests/build.test.ts`**

Add below the existing `writeApp` helper (note: existing `writeApp` doesn't wire CSS; this fixture needs its own files):

```ts
function writeUiApp(slug: string) {
  const dir = path.join(root, "apps", slug, "src");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(root, "apps", slug, "manifest.json"),
    JSON.stringify({ name: slug, slug })
  );
  fs.writeFileSync(
    path.join(root, "apps", slug, "index.html"),
    `<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`
  );
  fs.writeFileSync(path.join(dir, "index.css"), `@import "@lodekit/ui/theme.css";\n`);
  fs.writeFileSync(
    path.join(dir, "main.tsx"),
    `import { createRoot } from "react-dom/client";\nimport "./index.css";\nimport App from "./App";\ncreateRoot(document.getElementById("root")!).render(<App />);\n`
  );
  fs.writeFileSync(
    path.join(dir, "App.tsx"),
    `import { Button, Card, CardContent } from "@lodekit/ui";\nimport { Plus } from "lucide-react";\nexport default function App() {\n  return <Card><CardContent><Button><Plus /> Add</Button></CardContent></Card>;\n}\n`
  );
}
```

And in the `describe("buildApp", ...)` block:

```ts
it("builds an app importing @lodekit/ui, lucide-react, and the theme", async () => {
  writeUiApp("themed");
  const state = await buildApp(cfg, "themed");
  expect(state).toEqual({ status: "ready" });
  const assets = fs.readdirSync(path.join(cache, "themed", "assets"));
  const cssFile = assets.find((f) => f.endsWith(".css"));
  expect(cssFile).toBeTruthy();
  const css = fs.readFileSync(path.join(cache, "themed", "assets", cssFile!), "utf8");
  expect(css).toContain("--primary");
}, 60000);
```

The `--primary` assertion proves `theme.css` was bundled AND `@source` scanning generated component classes into real CSS.

- [ ] **Step 2: Run it — must fail**

Run: `pnpm --filter @lodekit/runtime test -- tests/build.test.ts`
Expected: the new test FAILS with `status: "error"` (Vite can't resolve `@lodekit/ui`). Existing tests stay green.

- [ ] **Step 3: Add the aliases in `packages/runtime/src/build.ts`**

Replace the alias block inside `runBuild`'s `build({...})` call and add the lucide resolution next to `pkgDir` at module level:

```ts
const pkgDir = (id: string) => path.dirname(require.resolve(`${id}/package.json`));
// lucide-react is @lodekit/ui's dependency, not the runtime's — resolve the exact copy
// the vendored components themselves use, so apps and components share one icon set.
const uiDir = pkgDir("@lodekit/ui");
const uiRequire = createRequire(path.join(uiDir, "package.json"));
const lucideDir = path.dirname(uiRequire.resolve("lucide-react/package.json"));
```

and in the Vite config:

```ts
      resolve: {
        alias: {
          react: pkgDir("react"),
          "react-dom": pkgDir("react-dom"),
          "@lodekit/sdk": pkgDir("@lodekit/sdk"),
          "@lodekit/ui": uiDir,
          "lucide-react": lucideDir,
        },
      },
```

Add to `packages/runtime/package.json` dependencies: `"@lodekit/ui": "workspace:*"` (keep alphabetical order with `@lodekit/sdk`), then run `pnpm install`.

- [ ] **Step 4: Run the test — must pass**

Run: `pnpm --filter @lodekit/runtime test -- tests/build.test.ts`
Expected: all PASS (new test included).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/build.ts packages/runtime/package.json packages/runtime/tests/build.test.ts pnpm-lock.yaml
git commit -m "feat(runtime): alias @lodekit/ui and lucide-react into the shared toolchain"
```

---

### Task 4: Dashboard app source + `buildDashboard()` (TDD)

**Files:**
- Create: `packages/runtime/dashboard/index.html`, `packages/runtime/dashboard/src/main.tsx`, `packages/runtime/dashboard/src/App.tsx`, `packages/runtime/dashboard/src/index.css`
- Modify: `packages/runtime/src/build.ts`
- Test: `packages/runtime/tests/dashboard.test.ts` (replace file — the old one asserts the vanilla page deleted in Task 5)

**Interfaces:**
- Consumes: aliases from Task 3; `/api/apps` returns `{slug,name,icon?,description?}[]`; SSE `/api/events` emits `apps-changed`, and `building`/`ready`/`error` with `{slug, message?}` payloads (existing runtime surface, unchanged).
- Produces: `buildDashboard(cfg: Config): Promise<DashboardState>` and `getDashboardState(): DashboardState | undefined` exported from `build.ts`, where `type DashboardState = { status: "ready" } | { status: "error"; message: string }`. Output lands in `path.join(cfg.cacheDir, "_dashboard")` with asset URLs under `/_dashboard/`. Task 5 serves it.

- [ ] **Step 1: Write the dashboard app source**

`packages/runtime/dashboard/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Lodekit</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

`packages/runtime/dashboard/src/index.css`:

```css
@import "@lodekit/ui/theme.css";
```

`packages/runtime/dashboard/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

`packages/runtime/dashboard/src/App.tsx` — preserves current behavior (grid, live build state, count, empty state) with `@lodekit/ui`; copy per `context.md` (*app*, *agent*):

```tsx
import { useEffect, useState } from "react";
import {
  Badge,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@lodekit/ui";

interface AppInfo {
  slug: string;
  name: string;
  icon?: string;
  description?: string;
}

type BuildStatus =
  | { status: "building" }
  | { status: "ready" }
  | { status: "error"; message?: string };

function StateBadge({ state }: { state: BuildStatus | undefined }) {
  if (!state) return null;
  if (state.status === "building") return <Badge variant="outline">building…</Badge>;
  if (state.status === "ready") return <Badge variant="secondary">ready</Badge>;
  return <Badge variant="destructive">error: {state.message ?? ""}</Badge>;
}

export default function App() {
  const [apps, setApps] = useState<AppInfo[] | null>(null);
  const [states, setStates] = useState<Record<string, BuildStatus>>({});

  async function load() {
    setApps(await (await fetch("/api/apps")).json());
  }

  useEffect(() => {
    void load();
    const es = new EventSource("/api/events");
    es.addEventListener("apps-changed", () => void load());
    for (const ev of ["building", "ready", "error"] as const) {
      es.addEventListener(ev, (e) => {
        const d = JSON.parse((e as MessageEvent).data) as { slug: string; message?: string };
        setStates((s) => ({ ...s, [d.slug]: { status: ev, message: d.message } }));
      });
    }
    return () => es.close();
  }, []);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Lodekit</h1>
        <span className="text-muted-foreground">
          {apps ? `${apps.length} ${apps.length === 1 ? "app" : "apps"}` : ""}
        </span>
      </div>
      {apps === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : apps.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No apps yet</CardTitle>
            <CardDescription>Ask your agent to build an app with Lodekit.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((a) => (
            <a key={a.slug} href={`/${a.slug}/`} className="block">
              <Card className="h-full transition-colors hover:bg-accent/50">
                <CardHeader>
                  <div className="text-3xl">{a.icon || "📦"}</div>
                  <CardTitle>{a.name}</CardTitle>
                  <CardDescription>{a.description || ""}</CardDescription>
                  <StateBadge state={states[a.slug]} />
                </CardHeader>
              </Card>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Write the failing test — replace `packages/runtime/tests/dashboard.test.ts` entirely**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDashboard } from "../src/build.js";
import type { Config } from "../src/config.js";

let root: string, cache: string, cfg: Config;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-root-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-cache-"));
  cfg = {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: cache,
    port: 0,
    baseUrl: "http://lodekit.localhost:0",
  };
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
});

describe("buildDashboard", () => {
  it("builds the dashboard into cacheDir/_dashboard with /_dashboard/ asset urls", async () => {
    const state = await buildDashboard(cfg);
    expect(state).toEqual({ status: "ready" });
    const out = path.join(cache, "_dashboard");
    const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
    expect(html).toContain("/_dashboard/assets/");
    const assets = fs.readdirSync(path.join(out, "assets"));
    expect(assets.some((f) => f.endsWith(".js"))).toBe(true);
    expect(assets.some((f) => f.endsWith(".css"))).toBe(true);
  }, 60000);
});
```

- [ ] **Step 3: Run it — must fail**

Run: `pnpm --filter @lodekit/runtime test -- tests/dashboard.test.ts`
Expected: FAIL — `buildDashboard` is not exported.

- [ ] **Step 4: Implement in `packages/runtime/src/build.ts`**

Extract the Vite options into a factory shared by app builds and the dashboard build, and add the dashboard entry points. Add imports `import { fileURLToPath } from "node:url";` at top. Full shape of the changed parts:

```ts
const DASHBOARD_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "dashboard"
);

function viteOptions(rootDir: string, outDir: string, base = "/") {
  return {
    root: fs.realpathSync(rootDir),
    base,
    logLevel: "silent" as const,
    plugins: [react(), tailwind()],
    resolve: {
      alias: {
        react: pkgDir("react"),
        "react-dom": pkgDir("react-dom"),
        "@lodekit/sdk": pkgDir("@lodekit/sdk"),
        "@lodekit/ui": uiDir,
        "lucide-react": lucideDir,
      },
    },
    build: { outDir, emptyOutDir: true },
  };
}
```

`runBuild` shrinks to use it (behavior unchanged — the realpath comment moves to the factory):

```ts
async function runBuild(cfg: Config, slug: string): Promise<BuildState> {
  setState(slug, { status: "building" });
  try {
    await build(viteOptions(path.join(cfg.appsDir, slug), appOutDir(cfg, slug)));
    setState(slug, { status: "ready" });
  } catch (e) {
    setState(slug, { status: "error", message: e instanceof Error ? e.message : String(e) });
  }
  return states.get(slug)!;
}
```

And the dashboard build — module state, never throws, not part of the app SSE stream:

```ts
export type DashboardState = { status: "ready" } | { status: "error"; message: string };

let dashboardState: DashboardState | undefined;

export function getDashboardState(): DashboardState | undefined {
  return dashboardState;
}

// Builds Lodekit's own dashboard through the same pipeline apps use. `_dashboard` sits
// outside the slug grammar, so it can never collide with an app's cache entry or URL.
export async function buildDashboard(cfg: Config): Promise<DashboardState> {
  try {
    await build(viteOptions(DASHBOARD_ROOT, path.join(cfg.cacheDir, "_dashboard"), "/_dashboard/"));
    dashboardState = { status: "ready" };
  } catch (e) {
    dashboardState = { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
  return dashboardState;
}
```

- [ ] **Step 5: Run the tests — must pass**

Run: `pnpm --filter @lodekit/runtime test -- tests/dashboard.test.ts tests/build.test.ts`
Expected: all PASS (build.test.ts proves the factory refactor didn't change app builds).

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/dashboard packages/runtime/src/build.ts packages/runtime/tests/dashboard.test.ts
git commit -m "feat(runtime): dashboard as a React app built by the shared pipeline"
```

---

### Task 5: Serve the built dashboard; retire the vanilla page (TDD)

**Files:**
- Modify: `packages/runtime/src/server.ts`, `packages/runtime/src/index.ts`, `packages/runtime/tests/e2e.test.ts`, `packages/runtime/tests/mcp.test.ts`
- Delete: `packages/runtime/public/` (vanilla dashboard + `design-system.css`; `grep` confirms no other consumers)
- Test: `packages/runtime/tests/dashboard.test.ts` (extend)

**Interfaces:**
- Consumes: `buildDashboard`, `getDashboardState` (Task 4).
- Produces: `start(cfg: Config): Promise<Server>` (was sync) — resolves after the dashboard build AND `listening`; callers `await start(...)` and must not also wait for `"listening"`. `createServer(cfg)` stays sync: `/` and `/_dashboard` serve from the cache at request time, so tests can pre-build then boot.

- [ ] **Step 1: Extend `packages/runtime/tests/dashboard.test.ts` with serving tests**

Add imports `import type { Server } from "node:http";` and `import { createServer } from "../src/server.js";`, then:

```ts
describe("dashboard serving", () => {
  let server: Server, base: string;

  async function boot() {
    await new Promise<void>((resolve) => {
      server = createServer(cfg).listen(0, () => resolve());
    });
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  }
  afterEach(() => server?.close());

  it("serves the built dashboard at / and its assets under /_dashboard/", async () => {
    await buildDashboard(cfg);
    await boot();
    const home = await fetch(base + "/");
    expect(home.status).toBe(200);
    const html = await home.text();
    expect(html).toContain('<div id="root">');
    const assetPath = html.match(/\/_dashboard\/assets\/[^"]+\.js/)?.[0];
    expect(assetPath).toBeTruthy();
    const asset = await fetch(base + assetPath!);
    expect(asset.status).toBe(200);
  }, 60000);

  it("serves a fallback page at / when the dashboard output is missing", async () => {
    await boot(); // no buildDashboard — cache is empty
    const res = await fetch(base + "/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Lodekit");
    expect(html).toContain("dashboard");
  });
});
```

- [ ] **Step 2: Run it — must fail**

Run: `pnpm --filter @lodekit/runtime test -- tests/dashboard.test.ts`
Expected: first serving test FAILS (`/` still sends the deleted-in-this-task vanilla page; `/_dashboard` 404s).

- [ ] **Step 3: Rewrite `packages/runtime/src/server.ts`**

Full new content (drops `PUBLIC`/`fileURLToPath`, adds dashboard serving, async `start` that resolves after build + listening; the fallback page never crashes the runtime — spec §7):

```ts
import express from "express";
import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import type { Config } from "./config.js";
import { apiRouter } from "./routes.js";
import { appHost } from "./appHost.js";
import { startWatcher } from "./watcher.js";
import { buildAll, buildDashboard, getDashboardState } from "./build.js";

const escapeHtml = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

const fallbackPage = (message?: string) => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Lodekit</title>
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:640px;margin:15vh auto;padding:0 24px;color:#0a0a0a}.muted{color:#6b7280}pre{white-space:pre-wrap;background:#f4f4f5;padding:16px;border-radius:10px;overflow:auto}</style>
</head>
<body><h1>Lodekit</h1><p class="muted">The dashboard isn't available${message ? " — its build failed" : " yet"}. Apps and the API are still running.</p>${message ? `<pre>${escapeHtml(message)}</pre>` : ""}</body>
</html>
`;

export function createServer(cfg: Config): express.Express {
  const app = express();
  const dashOut = path.join(cfg.cacheDir, "_dashboard");
  app.use("/api", apiRouter(cfg));
  app.use("/_dashboard", express.static(dashOut));
  app.get("/", (_req, res) => {
    const state = getDashboardState();
    const index = path.join(dashOut, "index.html");
    if (state?.status === "error" || !fs.existsSync(index)) {
      res
        .status(200)
        .type("html")
        .send(fallbackPage(state?.status === "error" ? state.message : undefined));
      return;
    }
    res.sendFile(index);
  });
  app.use(appHost(cfg));
  return app;
}

export async function start(cfg: Config): Promise<Server> {
  const app = createServer(cfg);
  await buildDashboard(cfg); // never throws; failures surface as the fallback page
  const watcher = startWatcher(cfg);
  const server = app.listen(cfg.port, () => {
    console.log(`Lodekit running at ${cfg.baseUrl}`);
  });
  server.on("close", () => { void watcher.close(); });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  void buildAll(cfg);
  return server;
}
```

- [ ] **Step 4: Update `start()` callers**

`packages/runtime/src/index.ts`:

```ts
import { loadConfig } from "./config.js";
import { start } from "./server.js";

void start(loadConfig());
```

`packages/runtime/tests/e2e.test.ts` and `packages/runtime/tests/mcp.test.ts` — replace the two boot lines in each:

```ts
server = start(loadConfig());
await new Promise<void>((r) => server.once("listening", () => r()));
```

with:

```ts
server = await start(loadConfig());
```

(Adjust surrounding timeout if the suite's `beforeAll` has one — the dashboard build adds ~1–5 s; set the hook timeout to 60000 if not already.)

- [ ] **Step 5: Delete the vanilla dashboard**

```bash
git rm -r packages/runtime/public
```

- [ ] **Step 6: Run the full runtime suite — must pass**

Run: `pnpm --filter @lodekit/runtime test`
Expected: all PASS (api/e2e/mcp/appHost suites confirm nothing else needed `public/` or sync `start`).

- [ ] **Step 7: Commit**

```bash
git add -A packages/runtime
git commit -m "feat(runtime): serve the built dashboard at / with build-failure fallback; drop vanilla page"
```

---

### Task 6: Scaffold starter on the UI library (TDD)

**Files:**
- Modify: `packages/runtime/src/scaffold.ts`
- Test: `packages/runtime/tests/scaffold.test.ts`

**Interfaces:**
- Consumes: `@lodekit/ui` barrel (Button, Card, CardContent, CardHeader, CardTitle) and `theme.css`.
- Produces: scaffolded apps that render themed from their first build. Storage imports (`db`, `store`) intentionally untouched (spec §6 — slice 2 owns them).

- [ ] **Step 1: Update the assertions in `packages/runtime/tests/scaffold.test.ts`**

In the first test, replace:

```ts
expect(fs.readFileSync(path.join(d, "src", "index.css"), "utf8")).toContain("tailwindcss");
```

with:

```ts
expect(fs.readFileSync(path.join(d, "src", "App.tsx"), "utf8")).toContain('from "@lodekit/ui"');
expect(fs.readFileSync(path.join(d, "src", "index.css"), "utf8")).toContain('@import "@lodekit/ui/theme.css"');
```

- [ ] **Step 2: Run it — must fail**

Run: `pnpm --filter @lodekit/runtime test -- tests/scaffold.test.ts`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Update `packages/runtime/src/scaffold.ts`**

Replace `appTsx` and `indexCss` (copy fix: "app", not "tool" — `context.md`):

```ts
const appTsx = (name: string) => `import { db, store } from "@lodekit/sdk";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@lodekit/ui";

export default function App() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <Card>
        <CardHeader>
          <CardTitle>${name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-muted-foreground">Edit src/App.tsx to build this app.</p>
          <Button>Get started</Button>
        </CardContent>
      </Card>
    </main>
  );
}
`;

const indexCss = `@import "@lodekit/ui/theme.css";
`;
```

- [ ] **Step 4: Run scaffold + e2e tests — must pass**

Run: `pnpm --filter @lodekit/runtime test -- tests/scaffold.test.ts tests/e2e.test.ts`
Expected: PASS (e2e scaffolds and builds a starter app end-to-end, proving the new starter compiles).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/scaffold.ts packages/runtime/tests/scaffold.test.ts
git commit -m "feat(runtime): scaffold starter imports @lodekit/ui and the shared theme"
```

---

### Task 7: Migrate habit-tracker to `@lodekit/ui`

**Files:**
- Modify: `examples/apps/habit-tracker/src/App.tsx`, `examples/apps/habit-tracker/src/index.css`

**Interfaces:**
- Consumes: `Badge, Button, Card, CardContent, Input` from `@lodekit/ui`. Logic (SDK calls, streaks) unchanged.

- [ ] **Step 1: Replace `examples/apps/habit-tracker/src/index.css`**

```css
@import "@lodekit/ui/theme.css";
```

- [ ] **Step 2: Replace `examples/apps/habit-tracker/src/App.tsx`**

Same logic, themed markup (only the returned JSX and imports change):

```tsx
import { useEffect, useState } from "react";
import { db } from "@lodekit/sdk";
import { Badge, Button, Card, CardContent, Input } from "@lodekit/ui";

interface Habit { id: number; name: string; icon: string; created_at: string }
interface Checkin { habit_id: number; day: string }

const today = () => new Date().toISOString().slice(0, 10);
const dayOffset = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

function streak(days: string[]): number {
  const set = new Set(days);
  let count = 0;
  for (let n = set.has(today()) ? 0 : -1; ; n--) {
    if (set.has(dayOffset(n))) count++;
    else break;
  }
  return count;
}

export default function App() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");

  async function load() {
    await db.exec("CREATE TABLE IF NOT EXISTS habits (id INTEGER PRIMARY KEY, name TEXT, icon TEXT, created_at TEXT)");
    await db.exec("CREATE TABLE IF NOT EXISTS checkins (id INTEGER PRIMARY KEY, habit_id INTEGER, day TEXT, UNIQUE(habit_id, day))");
    setHabits(await db.query<Habit>("SELECT * FROM habits ORDER BY id ASC"));
    setCheckins(await db.query<Checkin>("SELECT habit_id, day FROM checkins"));
  }

  useEffect(() => {
    void load();
  }, []);

  async function add() {
    const n = name.trim();
    if (!n) return;
    await db.exec("INSERT INTO habits (name, icon, created_at) VALUES (?,?,?)", [n, icon.trim() || "✅", today()]);
    setName("");
    setIcon("");
    await load();
  }

  async function toggle(habitId: number, done: boolean) {
    if (done) await db.exec("DELETE FROM checkins WHERE habit_id = ? AND day = ?", [habitId, today()]);
    else await db.exec("INSERT OR IGNORE INTO checkins (habit_id, day) VALUES (?,?)", [habitId, today()]);
    await load();
  }

  const byHabit = new Map<number, string[]>();
  for (const c of checkins) byHabit.set(c.habit_id, [...(byHabit.get(c.habit_id) ?? []), c.day]);
  const doneToday = habits.filter((h) => (byHabit.get(h.id) ?? []).includes(today())).length;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Habit Tracker</h1>
      <p className="text-muted-foreground">
        <strong>{habits.length ? `${doneToday} of ${habits.length} done today` : "No habits yet"}</strong>
      </p>
      <div className="my-5 flex flex-wrap gap-2">
        <Input className="w-16" placeholder="🎯" maxLength={2}
          value={icon} onChange={(e) => setIcon(e.target.value)} />
        <Input className="min-w-40 flex-1" placeholder="New habit (e.g. Meditate)"
          value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button onClick={add}>Add</Button>
      </div>
      <div className="grid gap-3">
        {habits.map((h) => {
          const days = byHabit.get(h.id) ?? [];
          const done = days.includes(today());
          const s = streak(days);
          return (
            <Card key={h.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{h.icon || "✅"}</span>
                  <div>
                    <div><strong>{h.name}</strong></div>
                    <div className="text-muted-foreground">
                      {s > 0 ? <Badge variant="secondary">🔥 {s} {s === 1 ? "day" : "days"}</Badge> : "No streak yet"}
                    </div>
                  </div>
                </div>
                <Button variant={done ? "secondary" : "default"} onClick={() => toggle(h.id, done)}>
                  {done ? "Undo" : "Done"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify against the running runtime**

```bash
CACHE=$(mktemp -d)
LODEKIT_ROOT=$(pwd)/examples LODEKIT_CACHE_DIR=$CACHE LODEKIT_PORT=7899 pnpm --filter @lodekit/runtime start &
sleep 20
curl -fsS http://127.0.0.1:7899/habit-tracker/ | grep -q '<div id="root">' && echo HABIT-OK
kill %1
```

Expected: `HABIT-OK` (the app built `ready` and serves its built index — a build error would serve the error page, which has no root div).

- [ ] **Step 4: Commit**

```bash
git add examples/apps/habit-tracker
git commit -m "feat(examples): migrate habit-tracker to @lodekit/ui"
```

---

### Task 8: Migrate expense-tracker to `@lodekit/ui`

**Files:**
- Modify: `examples/apps/expense-tracker/src/App.tsx`, `examples/apps/expense-tracker/src/index.css`

**Interfaces:**
- Consumes: `Button, Input, Select*, Table*` from `@lodekit/ui`. Logic (SDK calls, totals) unchanged.

- [ ] **Step 1: Replace `examples/apps/expense-tracker/src/index.css`**

```css
@import "@lodekit/ui/theme.css";
```

- [ ] **Step 2: Replace `examples/apps/expense-tracker/src/App.tsx`**

```tsx
import { useEffect, useState } from "react";
import { db, store } from "@lodekit/sdk";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lodekit/ui";

interface Expense {
  id: number;
  amount: number;
  category: string;
  note: string;
  created_at: string;
}

const CATEGORIES = ["Food", "Transport", "Bills", "Other"];

export default function App() {
  const [rows, setRows] = useState<Expense[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [note, setNote] = useState("");

  async function load() {
    await db.exec(
      "CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY, amount REAL, category TEXT, note TEXT, created_at TEXT)"
    );
    if ((await store.get("currency")) === null) await store.set("currency", "USD");
    setCurrency((await store.get<string>("currency")) ?? "USD");
    setRows(await db.query<Expense>("SELECT * FROM expenses ORDER BY id DESC"));
  }

  useEffect(() => {
    void load();
  }, []);

  async function add() {
    const value = parseFloat(amount);
    if (!value) return;
    await db.exec(
      "INSERT INTO expenses (amount, category, note, created_at) VALUES (?,?,?,?)",
      [value, category, note, new Date().toISOString().slice(0, 10)]
    );
    setAmount("");
    setNote("");
    await load();
  }

  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Expense Tracker</h1>
      <p className="text-muted-foreground">
        Total: <strong>{currency} {total.toFixed(2)}</strong>
      </p>
      <div className="my-5 flex flex-wrap gap-2">
        <Input className="w-28" type="number" step="0.01"
          placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input className="min-w-36 flex-1"
          placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button onClick={add}>Add</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Note</TableHead>
            <TableHead>Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.created_at}</TableCell>
              <TableCell>{r.category}</TableCell>
              <TableCell>{r.note}</TableCell>
              <TableCell>{currency} {r.amount.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  );
}
```

- [ ] **Step 3: Verify both examples + dashboard against the running runtime**

```bash
CACHE=$(mktemp -d)
LODEKIT_ROOT=$(pwd)/examples LODEKIT_CACHE_DIR=$CACHE LODEKIT_PORT=7899 pnpm --filter @lodekit/runtime start &
sleep 20
curl -fsS http://127.0.0.1:7899/expense-tracker/ | grep -q '<div id="root">' && echo EXPENSE-OK
curl -fsS http://127.0.0.1:7899/ | grep -q '/_dashboard/assets/' && echo DASHBOARD-OK
kill %1
```

Expected: `EXPENSE-OK` and `DASHBOARD-OK`.

- [ ] **Step 4: Commit**

```bash
git add examples/apps/expense-tracker
git commit -m "feat(examples): migrate expense-tracker to @lodekit/ui"
```

---

### Task 9: Roadmap follow-ups and full verification

**Files:**
- Modify: `roadmap.md`

**Interfaces:** none — bookkeeping per spec §10 and final gate per spec §9.

- [ ] **Step 1: Update `roadmap.md`**

In **Security → Harden app/dashboard rendering**: the referenced `examples/apps/*/app.js` files no longer exist (pre-bundled-contract) and the dashboard is now React (escapes by default). Replace that bullet's body with:

```markdown
- **Harden app/dashboard rendering** — the dashboard is React now (escapes by default;
  resolved by the @lodekit/ui slice). Remaining: apps are user-trusted local code, but
  before any multi-user or shared exposure, audit app-side rendering guidance in the skill.
```

Add to **Other deferred items**:

```markdown
- **Dashboard startup-build freshness skip** — `buildDashboard` runs on every start
  (~1s). Skip via mtime/hash comparison if startup cost starts to matter.
- **Watch dashboard source in dev** — dashboard source isn't watched; runtime restart
  rebuilds it. Add rebuild-on-change if restart friction grows.
```

- [ ] **Step 2: Full test suite**

Run: `pnpm test` (repo root) and `pnpm --filter @lodekit/ui check`
Expected: all green.

- [ ] **Step 3: Manual smoke (spec §9: one theme, light and dark)**

Run `pnpm dev`, open `http://lodekit.localhost:7777` — dashboard shows both example apps as themed cards with live build badges; open each app; toggle macOS appearance (System Settings → Appearance) and confirm dashboard + apps follow. Report what was seen; screenshots optional.

- [ ] **Step 4: Commit**

```bash
git add roadmap.md
git commit -m "docs: roadmap follow-ups from the @lodekit/ui slice"
```
