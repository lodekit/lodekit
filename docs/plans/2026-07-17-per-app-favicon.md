# Per-App Favicon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** Serve favicons derived from existing choices — the selected menubar mark everywhere by default, the app's manifest emoji on app pages (spec: `docs/specs/2026-07-17-per-app-favicon-design.md`, closes issue #104).

**Architecture:** Three serve-time routes in the engine (`/favicon.svg`, `/favicon.ico`, `/_ui/favicon.svg?app=<id>`), following the theme-service pattern from PR #100. Mark vector data moves to a shared `src/marks.ts` consumed by both the dashboard logo and the favicon routes. Static `<link rel="icon">` tags go into the dashboard root, the app scaffold template, and the two checked-in apps.

**Tech Stack:** Hono routes (buildless tsx runtime), vitest, TanStack Start dashboard (vite build).

## Global Constraints

- Branch: `per-app-favicon` (already created; spec committed on it). All work lands via PR — never push to `master`.
- No `Co-Authored-By` trailers in commits; bead IDs go in commit messages.
- Trust boundary: manifest `icon` is user-authored — it MUST be XML-escaped before interpolation into SVG (spec "Security"). Never weaken this.
- All favicon routes: `Cache-Control: no-store`, `Content-Type: image/svg+xml`.
- Fallback chain (spec table): app with icon → emoji; app without icon → `📦`; unknown/missing app → mark; unknown stored style → `b`.
- Run tests from `packages/runtime`: `pnpm --filter @lodekit/runtime test` (or `npx vitest run tests/favicon.test.ts` inside the package).

---

### Task 1: Shared mark data module + favicon SVG builders

**Files:**
- Create: `packages/runtime/src/marks.ts`
- Modify: `packages/runtime/dashboard/src/components/logo.tsx` (whole file replaced below)
- Test: `packages/runtime/tests/favicon.test.ts` (unit half; Task 2 appends HTTP tests)

**Interfaces:**
- Consumes: nothing new.
- Produces (Task 2 relies on these exact exports from `src/marks.ts`):
  - `type MarkStyle = "a" | "b" | "c"`
  - `MARK_BODIES: Record<MarkStyle, string>` — inner SVG markup, 32×32 viewBox, `currentColor`
  - `markFaviconSvg(style: string): string` — complete SVG document; unknown style falls back to `"b"`
  - `emojiFaviconSvg(icon: string): string` — complete SVG document; XML-escapes the input
- The dashboard `logo.tsx` keeps exporting `MARKS` (record of components taking `{ className }`) and `Logo` — `settings.tsx` consumes `MARKS` unchanged.

**Acceptance Criteria:**
- `MARK_BODIES` is the only place the jar-cloud vector data exists (logo.tsx JSX paths deleted, rendered from the shared strings).
- `markFaviconSvg("nope")` returns the `b` mark; output embeds a `prefers-color-scheme: dark` style block.
- `emojiFaviconSvg('<script>alert(1)</script>')` contains no `<script` and does contain `&lt;script`.
- `pnpm --filter @lodekit/runtime test` and `pnpm --filter @lodekit/runtime check` pass.

- [ ] **Step 1: Write the failing unit tests**

Create `packages/runtime/tests/favicon.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { MARK_BODIES, markFaviconSvg, emojiFaviconSvg } from "../src/marks.js";

describe("favicon svg builders", () => {
  it("renders the requested mark and falls back to b on unknown styles", () => {
    expect(markFaviconSvg("c")).toContain(MARK_BODIES.c);
    expect(markFaviconSvg("nope")).toContain(MARK_BODIES.b);
    expect(markFaviconSvg("b")).toContain("prefers-color-scheme");
    expect(markFaviconSvg("b")).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  });

  it("renders the emoji via the text technique", () => {
    expect(emojiFaviconSvg("🪴")).toContain("🪴");
    expect(emojiFaviconSvg("🪴")).toContain("<text");
  });

  it("XML-escapes user-authored icon text (manifest is a trust boundary)", () => {
    const svg = emojiFaviconSvg('<script>alert(1)</script>"\'&');
    expect(svg).not.toContain("<script");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&quot;");
    expect(svg).toContain("&#39;");
    expect(svg).toContain("&amp;");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/runtime && npx vitest run tests/favicon.test.ts`
Expected: FAIL — `Cannot find module '../src/marks.js'`

- [ ] **Step 3: Create `packages/runtime/src/marks.ts`**

The three bodies are the exact vectors from today's `logo.tsx` (JSX attributes converted to kebab-case). Complete file:

```ts
// jar-cloud mark vector data (running variation) — the single source of truth,
// consumed by the dashboard logo (dashboard/src/components/logo.tsx) and the
// engine's favicon routes (server.ts). Inner markup for a 32×32 viewBox; every
// fill/stroke is currentColor so the consumer chooses the color.

export type MarkStyle = "a" | "b" | "c";

export const isMarkStyle = (s: string): s is MarkStyle => s === "a" || s === "b" || s === "c";

const lid = `<path fill="currentColor" d="M10.4 8.6 L9.9 4.6 C9.77 3.6 10.5 3 11.4 3 L20.6 3 C21.5 3 22.23 3.6 22.1 4.6 L21.6 8.6 Z"/><rect fill="currentColor" x="9" y="8.6" width="14" height="2.9" rx="1.45"/>`;
const jarOutline = `<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M10 11.5 C7.8 11.6 6.2 11.9 5.3 12.6 C4.1 13.5 3.5 14.8 3.5 16.5 L3.5 25.5 C3.5 28.8 5.7 30.5 9.3 30.5 L22.7 30.5 C26.3 30.5 28.5 28.8 28.5 25.5 L28.5 16.5 C28.5 14.8 27.9 13.5 26.7 12.6 C25.8 11.9 24.2 11.6 22 11.5"/>`;
const cloud = `M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z`;

export const MARK_BODIES: Record<MarkStyle, string> = {
  // "Solid": outline jar, solid cork + cloud
  a: `${lid}${jarOutline}<path fill="currentColor" transform="translate(6.64 12.2) scale(0.78)" d="${cloud}"/>`,
  // "Knockout": solid jar, cloud as negative space
  b: `${lid}<path fill="currentColor" fill-rule="evenodd" d="M10 11.5 L22 11.5 C24.2 11.6 25.8 11.9 26.7 12.6 C27.9 13.5 28.5 14.8 28.5 16.5 L28.5 25.5 C28.5 28.8 26.3 30.5 22.7 30.5 L9.3 30.5 C5.7 30.5 3.5 28.8 3.5 25.5 L3.5 16.5 C3.5 14.8 4.1 13.5 5.3 12.6 C6.2 11.9 7.8 11.6 10 11.5 Z M21.733 20.031 C21.203 17.34 18.839 15.32 16 15.32 C13.746 15.32 11.788 16.599 10.813 18.471 C8.465 18.721 6.64 20.71 6.64 23.12 C6.64 25.702 8.738 27.8 11.32 27.8 L21.46 27.8 C23.613 27.8 25.36 26.053 25.36 23.9 C25.36 21.841 23.761 20.172 21.733 20.031 Z"/>`,
  // "Outline": outline jar + outline cloud
  c: `${lid}${jarOutline}<path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" transform="translate(7.6 13.4) scale(0.7)" d="${cloud}"/>`,
};

const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// Favicon builders: self-contained SVG documents (favicons load no page CSS).
// The mark keeps currentColor and picks its fill from an embedded
// prefers-color-scheme block (Chromium honors media queries in SVG favicons).
export function markFaviconSvg(style: string): string {
  const body = MARK_BODIES[isMarkStyle(style) ? style : "b"];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><style>svg{color:#18181b}@media(prefers-color-scheme:dark){svg{color:#fafafa}}</style>${body}</svg>`;
}

// The manifest icon is user-authored — XML-escape it so markup in the field
// renders as text instead of executing when the SVG URL is opened directly.
export function emojiFaviconSvg(icon: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${escapeXml(icon)}</text></svg>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/runtime && npx vitest run tests/favicon.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Refactor `logo.tsx` to consume `MARK_BODIES`**

Replace the whole of `packages/runtime/dashboard/src/components/logo.tsx` with:

```tsx
import { useQuery } from "@tanstack/react-query";
import { MARK_BODIES, type MarkStyle } from "../../../src/marks";

type SvgProps = { className?: string };

// jar-cloud marks (running variation) — vector data lives in src/marks.ts,
// shared with the engine's favicon routes. fills/strokes are currentColor so
// the theme's --primary carries through. dangerouslySetInnerHTML is safe here:
// MARK_BODIES is a compile-time constant in our own module, never user input.
function Mark({ style, className }: { style: MarkStyle } & SvgProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: MARK_BODIES[style] }}
    />
  );
}

// Exported for the settings page: the icon_style select shows each option
// with its actual mark.
export const MARKS = {
  a: (p: SvgProps) => <Mark style="a" {...p} />,
  b: (p: SvgProps) => <Mark style="b" {...p} />,
  c: (p: SvgProps) => <Mark style="c" {...p} />,
} as const;

// Tracks the effective appearance.icon_style setting (live via the settings SSE component).
// Always the "running" mark — the logo does not reflect runtime state.
export function Logo({ className }: SvgProps) {
  const q = useQuery<{ settings: { key: string; effective: unknown }[] }>({
    queryKey: ["settings", "_platform"],
    queryFn: async () => (await fetch("/api/settings")).json(),
  });
  const style = q.data?.settings.find((s) => s.key === "appearance.icon_style")?.effective;
  return <Mark style={style === "a" || style === "c" ? style : "b"} className={className} />;
}
```

Note: the import is `../../../src/marks` (no `.js` — vite resolves TS extensionless; the dashboard build's rootDir is `packages/runtime/dashboard` but vite builds handle out-of-root relative imports).

- [ ] **Step 6: Verify the dashboard still builds and the suite passes**

Run: `cd packages/runtime && pnpm check && pnpm test`
Expected: tsc clean; all vitest suites PASS (the `e2e.test.ts` suite builds the dashboard — it exercises the new out-of-root import; if it does not, run `LODEKIT_ROOT=$(pwd)/../../root pnpm --filter @lodekit/runtime start` from the repo root and confirm the dashboard renders the logo at `http://127.0.0.1:<port>/_dashboard/`).

- [ ] **Step 7: Commit**

```bash
git add packages/runtime/src/marks.ts packages/runtime/dashboard/src/components/logo.tsx packages/runtime/tests/favicon.test.ts
git commit -m "feat(runtime): shared jar-cloud mark data + favicon SVG builders [lk-rxe]"
```

---

### Task 2: Favicon routes in the engine

**Files:**
- Modify: `packages/runtime/src/server.ts` (imports ~line 35; routes inserted after the `/_ui/theme.json` route, before the `/_ui/` redirect at ~line 138)
- Test: `packages/runtime/tests/favicon.test.ts` (append HTTP suite)

**Interfaces:**
- Consumes (from Task 1): `markFaviconSvg(style)`, `emojiFaviconSvg(icon)` from `./marks.js`.
- Consumes (existing): `effectiveString("appearance.icon_style")` from `./services/settings.js` (already imported in server.ts for `appearance.theme`); `scanApps`, `isValidAppId` from `./registry.js` (already imported — used by the theme.css route).
- Produces: `GET /favicon.svg`, `GET /favicon.ico`, `GET /_ui/favicon.svg?app=<id>` — all 200, `image/svg+xml`, `no-store`.

**Acceptance Criteria:**
- `/favicon.svg` reflects the stored `icon_style`; default `b` when unset.
- `/favicon.ico` → 200 with `image/svg+xml` (same body as `/favicon.svg`).
- `/_ui/favicon.svg?app=<id>`: manifest emoji; no-icon app → `📦`; unknown app or missing param → mark.
- A manifest `icon` containing markup arrives XML-escaped in the response body.

- [ ] **Step 1: Append the failing HTTP tests**

Append to `packages/runtime/tests/favicon.test.ts` (add the new imports to the top of the file):

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createAdaptorServer } from "@hono/node-server";
import { beforeEach, afterEach } from "vitest";
import { createApp } from "../src/server.js";
import {
  initSettingsStore, setPlatformValue, invalidateSettingsCache, closeSettingsStoreForTest,
} from "../src/services/settings.js";
import type { Config } from "../src/config.js";

describe("favicon routes", () => {
  let root: string, server: Server, base: string;

  const writeManifest = (appId: string, manifest: object) => {
    const dir = path.join(root, "apps", appId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  };

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-favicon-"));
    const cfg: Config = {
      root,
      appsDir: path.join(root, "apps"),
      dataDir: path.join(root, "data"),
      cacheDir: path.join(root, ".cache"),
      stateDir: path.join(root, ".state"),
      port: 0,
      baseUrl: "http://lodekit.localhost:0",
      secretsKeyProvider: "file",
      gatewaysDir: path.join(root, "gateways"),
    };
    writeManifest("plants", { name: "Plants", appId: "plants", icon: "🪴" });
    writeManifest("noicon", { name: "NoIcon", appId: "noicon" });
    writeManifest("evil", { name: "Evil", appId: "evil", icon: '<script>alert(1)</script>' });
    initSettingsStore(cfg.dataDir);
    invalidateSettingsCache();
    await new Promise<void>((resolve) => {
      server = (createAdaptorServer({ fetch: createApp(cfg).fetch }) as Server).listen(0, () => resolve());
    });
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  });

  afterEach(() => {
    server.close();
    closeSettingsStoreForTest();
    invalidateSettingsCache();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("serves the default mark (style b) at /favicon.svg", async () => {
    const res = await fetch(base + "/favicon.svg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain(MARK_BODIES.b);
  });

  it("reflects the stored icon_style setting", async () => {
    setPlatformValue("appearance.icon_style", "c");
    invalidateSettingsCache();
    expect(await (await fetch(base + "/favicon.svg")).text()).toContain(MARK_BODIES.c);
  });

  it("serves the same SVG at /favicon.ico for linkless pages", async () => {
    const res = await fetch(base + "/favicon.ico");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(await res.text()).toContain(MARK_BODIES.b);
  });

  it("serves the app emoji at /_ui/favicon.svg?app=<id>", async () => {
    const res = await fetch(base + "/_ui/favicon.svg?app=plants");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(await res.text()).toContain("🪴");
  });

  it("falls back to 📦 for an app without an icon", async () => {
    expect(await (await fetch(base + "/_ui/favicon.svg?app=noicon")).text()).toContain("📦");
  });

  it("falls back to the mark for an unknown app and a missing param", async () => {
    expect(await (await fetch(base + "/_ui/favicon.svg?app=ghost")).text()).toContain(MARK_BODIES.b);
    expect(await (await fetch(base + "/_ui/favicon.svg")).text()).toContain(MARK_BODIES.b);
  });

  it("XML-escapes a user-authored manifest icon (XSS guard)", async () => {
    const body = await (await fetch(base + "/_ui/favicon.svg?app=evil")).text();
    expect(body).not.toContain("<script");
    expect(body).toContain("&lt;script&gt;");
  });
});
```

- [ ] **Step 2: Run tests to verify the new suite fails**

Run: `cd packages/runtime && npx vitest run tests/favicon.test.ts`
Expected: unit suite PASS; "favicon routes" suite FAIL (404s — routes don't exist; `/favicon.svg` currently falls through to appHost).

- [ ] **Step 3: Add the routes to `server.ts`**

Add to the imports (line ~35 area):

```ts
import { markFaviconSvg, emojiFaviconSvg } from "./marks.js";
```

Insert these routes in the chain in `createApp`, right after the `.get("/_ui/theme.json", …)` block and before the `.get("/_ui/", …)` redirect:

```ts
    // Favicons (spec: docs/specs/2026-07-17-per-app-favicon-design.md). All
    // serve-time and never cached, like theme delivery. /favicon.ico serves
    // SVG — browsers select by content-type, and it makes the mark the
    // origin-wide default for pages without an explicit icon link.
    .get("/favicon.svg", (c) => {
      c.header("Cache-Control", "no-store");
      c.header("Content-Type", "image/svg+xml");
      return c.body(markFaviconSvg(effectiveString("appearance.icon_style")));
    })
    .get("/favicon.ico", (c) => {
      c.header("Cache-Control", "no-store");
      c.header("Content-Type", "image/svg+xml");
      return c.body(markFaviconSvg(effectiveString("appearance.icon_style")));
    })
    // Per-app favicon: the manifest emoji (user-authored — emojiFaviconSvg
    // escapes it). Unknown app → the mark, same as everywhere else.
    .get("/_ui/favicon.svg", (c) => {
      c.header("Cache-Control", "no-store");
      c.header("Content-Type", "image/svg+xml");
      const app = c.req.query("app");
      const manifest =
        app !== undefined && isValidAppId(app)
          ? scanApps(cfg.appsDir).find((a) => a.appId === app)
          : undefined;
      return c.body(
        manifest
          ? emojiFaviconSvg(manifest.icon ?? "📦")
          : markFaviconSvg(effectiveString("appearance.icon_style"))
      );
    })
```

(`effectiveString`, `scanApps`, `isValidAppId` are already imported in server.ts.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/runtime && npx vitest run tests/favicon.test.ts`
Expected: PASS (all suites)

- [ ] **Step 5: Run the whole runtime suite + typecheck**

Run: `cd packages/runtime && pnpm check && pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/server.ts packages/runtime/tests/favicon.test.ts
git commit -m "feat(runtime): favicon routes — mark default + per-app emoji [lk-wfg]"
```

---

### Task 3: Icon links + live apply

**Files:**
- Modify: `packages/runtime/src/scaffold.ts:32-35` (rootTsx template links array)
- Modify: `packages/runtime/dashboard/src/routes/__root.tsx:18-21` (links array)
- Modify: `root/apps/greenhouse/src/routes/__root.tsx:7-10` (links array)
- Modify: `root/apps/welcome/src/routes/__root.tsx:7-10` (links array)
- Modify: `packages/runtime/src/server.ts:49-89` (`themeResolverJs`)

**Interfaces:**
- Consumes (from Task 2): the three favicon routes.
- Produces: every scaffolded app, both checked-in apps, and the dashboard declare `<link rel="icon">`; icon_style changes re-apply live on open pages.

**Acceptance Criteria:**
- Scaffold template emits `{ rel: "icon", href: "/_ui/favicon.svg?app=${appId}" }`; dashboard root emits `{ rel: "icon", href: "/favicon.svg" }`; Greenhouse and Welcome emit their per-app link.
- `themeResolverJs` busts the icon link on a global `appearance.icon_style` value-set/value-cleared event.
- Runtime suite still green (`scaffold.test.ts` covers the template; the resolver script is exercised by loading any page).

- [ ] **Step 1: Add the link to the scaffold template**

In `packages/runtime/src/scaffold.ts`, the `rootTsx` links array becomes:

```ts
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: "/_ui/theme.css?app=${appId}" },
      { rel: "icon", href: "/_ui/favicon.svg?app=${appId}" },
    ],
```

- [ ] **Step 2: Add the link to the dashboard root**

In `packages/runtime/dashboard/src/routes/__root.tsx`, the links array becomes:

```tsx
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: "/_ui/theme.css" },
      { rel: "icon", href: "/favicon.svg" },
    ],
```

- [ ] **Step 3: Add the links to Greenhouse and Welcome**

`root/apps/greenhouse/src/routes/__root.tsx`:

```tsx
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: "/_ui/theme.css?app=greenhouse" },
      { rel: "icon", href: "/_ui/favicon.svg?app=greenhouse" },
    ],
```

`root/apps/welcome/src/routes/__root.tsx`:

```tsx
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: "/_ui/theme.css?app=welcome" },
      { rel: "icon", href: "/_ui/favicon.svg?app=welcome" },
    ],
```

- [ ] **Step 4: Live apply in `themeResolverJs`**

In `packages/runtime/src/server.ts`, inside the `themeResolverJs` template string:

After the line `const link = document.querySelector('link[href^="/_ui/theme.css"]');` add:

```js
  const icon = document.querySelector('link[rel="icon"]');
  const iconBase = icon ? icon.getAttribute("href") : null;
```

Inside the `es.addEventListener("event", …)` handler, insert a new branch immediately before the existing `appearance.theme` branch:

```js
      if (
        d.component === "settings" &&
        (d.type === "value-set" || d.type === "value-cleared") &&
        d.app === null &&
        d.payload?.key === "appearance.icon_style"
      ) {
        if (icon && iconBase) icon.href = iconBase + (iconBase.includes("?") ? "&" : "?") + "v=" + Date.now();
        return;
      }
```

- [ ] **Step 5: Verify**

Run: `cd packages/runtime && pnpm check && pnpm test`
Expected: PASS (scaffold tests cover the template; no test asserts the exact links arrays elsewhere).

Manual smoke (from repo root): `pnpm dev`, open `http://127.0.0.1:<port>/_dashboard/` → tab shows the jar-cloud mark; open the Greenhouse app → tab shows 🪴; flip "Menu bar icon" in dashboard Settings → dashboard tab favicon swaps without reload.

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/scaffold.ts packages/runtime/dashboard/src/routes/__root.tsx root/apps/greenhouse/src/routes/__root.tsx root/apps/welcome/src/routes/__root.tsx packages/runtime/src/server.ts
git commit -m "feat(runtime): favicon links in dashboard, scaffold, showcase apps + live apply [lk-3ti]"
```

---

### Task 4: Rollout docs + full verification

**Files:**
- Modify: `docs/changelog.md` (append under `## New` — append-only)
- Modify: `root/README.md` (definition-of-done table, new row)

**Interfaces:**
- Consumes: Tasks 1–3 landed.
- Produces: user-facing changelog entry; Greenhouse coverage row; whole workspace green.

**Acceptance Criteria:**
- Changelog gains exactly one entry under `## New`; no existing lines reworded or removed.
- `root/README.md` table gains a favicon row referencing Greenhouse.
- `pnpm test` (workspace, from repo root) passes.

- [ ] **Step 1: Append the changelog entry**

In `docs/changelog.md`, append at the end of the `## New` section (before `## Fixed`):

```markdown
- **Favicons** — browser tabs now show your chosen menubar icon on the
  dashboard (and anywhere without its own icon), and each app's emoji on that
  app's pages. Changing the menubar icon in Settings updates open tabs live.
```

- [ ] **Step 2: Add the Greenhouse coverage row**

In `root/README.md`, append to the definition-of-done table:

```markdown
| per-app favicon (`/_ui/favicon.svg?app=…`) | Greenhouse tab shows 🪴 (manifest `icon` → favicon) |
```

- [ ] **Step 3: Full workspace verification**

Run from the repo root: `pnpm test`
Expected: all workspace suites PASS (`@lodekit/runtime`, `@lodekit/sdk`, `@lodekit/ui`, `@lodekit/manager`, `@lodekit/integration-tests`).

- [ ] **Step 4: Commit**

```bash
git add docs/changelog.md root/README.md
git commit -m "docs: changelog + greenhouse coverage for per-app favicon [lk-sdl]"
```

---

## After the tasks

Finishing the branch (PR raise) happens via the finishing-a-development-branch flow — PR title `feat(runtime): per-app favicon — app emoji + menubar mark default`, body with Summary/Notes/Test plan, `Closes #104`, bead IDs. Merging is the person's call.
