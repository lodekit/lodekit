# Themes: Library, Per-App Selection, and the Theme Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Spec:** `docs/specs/2026-07-16-theme-editor-design.md` (approved, stress-tested — read it first; section references below are to that spec).

**Goal:** Themes become named, self-contained, switchable CSS files delivered at serve time — with a runtime theme service + API, icon indirection in `@lodekit/ui`, 4 vendored theme ports, and a `/themes` dashboard surface (library + editor + component visualizer) — replacing the build-time override-file composition.

**Architecture:** A runtime theme service (modeled on `services/settings.ts`) resolves app → global → `lodekit` from `<root>/themes/config.json` and serves one theme CSS file per request at `GET /_ui/theme.css` (`no-store`, always 200). `@lodekit/ui` token defaults move into a named `@layer` so the unlayered served theme always wins. Icons go through a new `@lodekit/ui/icons` subpath keyed by `data-icon-library` on `<html>`. The dashboard `/themes` route grows a library grid and a `/themes/$name` editor whose parser/serializer is a pure dependency-free TS module.

**Tech Stack:** Hono, chokidar, vitest (existing); `@phosphor-icons/react`, `@tabler/icons-react` (new, `packages/ui` only); TanStack Router + React Query (dashboard, existing).

## Global Constraints

- pnpm workspace; runtime stays **buildless** (`tsx`) — no build steps added anywhere.
- Theme slug grammar = **app-id grammar** — reuse the same validator `server.ts` already imports (`isValidAppId`); validate **before any path join**, on every endpoint.
- Theme size cap: `THEME_MAX_BYTES = 512 * 1024` (applies to `PUT /api/themes/:name` **and** `PUT /api/themes/preview`).
- Named layer for token defaults: `@layer lodekit-tokens`.
- `GET /_ui/theme.css` **always answers 200 with usable CSS** — any internal failure degrades to the `lodekit` theme (spec §2).
- All `config.json` / theme-file writes: **write-temp-then-atomic-rename** (spec §1).
- Canonical icon vocabulary = Lucide names; both spellings used in the repo (`X` and `XIcon`) are exported and map to the same canonical icon.
- Commits: conventional prefix, bead ID in the message, **no `Co-Authored-By` trailer**.
- `docs/changelog.md` is **append-only**; entries land in the same PR as the code (tasks 5, 8, 10, 13 append).
- Surgical changes: match existing style (dashboard/UI component files have no semicolons; runtime/tests do).
- Every task: run its package tests before committing (`pnpm --filter @lodekit/runtime test`, `pnpm --filter @lodekit/ui test`); full `pnpm test` at each phase boundary (tasks 5, 7, 8, 13, 14).

## File Structure (whole plan)

```
packages/runtime/themes/                    # NEW vendored themes (task 1, 8)
  lodekit.css  dracula.css  catppuccin.css  nord.css  rose-pine.css
packages/runtime/src/services/themes.ts     # NEW theme service + Hono router (task 2, 3)
packages/runtime/src/server.ts              # MODIFY /_ui/theme.{css,js,json} (task 3, 4)
packages/runtime/src/routes.ts              # MODIFY mount /api/themes (task 3)
packages/runtime/src/watcher.ts             # MODIFY themes/ watch, drop theme rebuilds (task 4)
packages/runtime/src/build.ts               # MODIFY delete override machinery (task 5)
packages/runtime/src/scaffold.ts            # MODIFY template theme link (task 5)
packages/runtime/tests/themes.test.ts       # NEW service tests (task 2)
packages/runtime/tests/themes-api.test.ts   # NEW endpoint tests (task 3)
packages/runtime/tests/theme-css.test.ts    # NEW parser round-trip tests (task 9)
packages/ui/theme-tokens.css                # MODIFY @layer + new defaults (task 1)
packages/ui/theme.css                       # MODIFY drop fonts + overrides import (task 1, 5)
packages/ui/icons/index.ts                  # NEW subpath entry (root-level, task 6)
packages/ui/src/icons/                      # NEW indirection impl + generated maps (task 6)
packages/ui/scripts/generate-icon-maps.mjs  # NEW committed dev-time generator (task 6)
packages/ui/tests/icons.test.tsx            # NEW (task 6)
packages/ui/tests/icon-coverage.test.ts     # NEW scan test (task 7)
packages/runtime/dashboard/src/lib/theme-css.ts    # NEW pure parser/serializer (task 9)
packages/runtime/dashboard/src/lib/themes-api.ts   # NEW typed fetchers (task 10)
packages/runtime/dashboard/src/routes/themes.tsx   # MODIFY library view (task 10)
packages/runtime/dashboard/src/routes/themes_.$name.tsx  # NEW editor (task 11-13)
packages/runtime/dashboard/src/components/theme-editor/  # NEW editor pieces (task 11-13)
  controls.tsx  canvas.tsx  role-row.tsx
root/themes/config.json + root/themes/greenhouse-green.css  # NEW (task 5)
root/theme.css + root/apps/greenhouse/theme.css              # DELETE (task 5)
```

Task dependency graph: `1 → 2 → 3 → 4 → 5` (phase 1); `6 → 7`, `6 → 8`; `9 → 10 → 11 → 12`, `11 → 13`; `14` after `5, 7, 8, 13`.

---

### Task 1: Vendored `lodekit` theme + `@lodekit/ui` token plumbing

**Files:**
- Create: `packages/runtime/themes/lodekit.css`
- Modify: `packages/ui/theme-tokens.css` (wrap tokens in `@layer lodekit-tokens`, add `--spacing`/`--icon-library` defaults)
- Modify: `packages/ui/theme.css` (remove the Google Fonts `@import` — first line)

**Interfaces:**
- Consumes: current token values in `packages/ui/theme-tokens.css` (`:root` lines 4-44, `.dark` lines 46-79).
- Produces: `packages/runtime/themes/lodekit.css` — **the canonical theme format reference** every later task (service, ports, parser) builds against; `@layer lodekit-tokens` semantics relied on by task 3's delivery.

**Acceptance Criteria:**
- `packages/runtime/themes/lodekit.css` exists, self-contained: fonts `@import`, `:root` with `color-scheme`, `--font-ui`, `--font-display`, `--radius`, `--spacing`, `--icon-library`, full shadcn token set; `.dark` with `color-scheme` + full dark set — values byte-equal to today's `theme-tokens.css`.
- `theme-tokens.css` `:root`/`.dark` blocks are inside `@layer lodekit-tokens`; `@theme inline` and `@layer base` blocks unchanged and outside it; `:root` gains `--spacing: 0.25rem;` and `--icon-library: lucide;`.
- Google Fonts `@import` no longer in `packages/ui/theme.css`.
- `pnpm --filter @lodekit/ui test` passes.

- [ ] **Step 1: Create `packages/runtime/themes/lodekit.css`**

Copy the token values from `packages/ui/theme-tokens.css` verbatim (do not retype — copy the `:root` body lines 5-44 and `.dark` body lines 47-79), assembling this exact structure (this file defines the canonical format from spec §1):

```css
/* Lodekit — cork amber, the platform default (DESIGN.md). Canonical theme format:
   one @import block, :root (light) + .dark, full shadcn token set, plus
   --font-ui/--font-display/--radius/--spacing/--icon-library. */
@import url("https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,400..600,100&family=Hanken+Grotesk:wght@400;500&display=swap");

:root {
  color-scheme: light;
  --font-ui: "Hanken Grotesk", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  --font-display: "Fraunces", Georgia, serif;
  --radius: 0.625rem;
  --spacing: 0.25rem;
  --icon-library: lucide;
  --background: #f7fafd;
  /* … every remaining :root token from theme-tokens.css, same order:
     --foreground, --card, --card-foreground, --popover, --popover-foreground,
     --primary, --primary-foreground, --secondary, --secondary-foreground,
     --muted, --muted-foreground, --accent, --accent-foreground, --destructive,
     --border, --input, --ring, --chart-1..5, --sidebar, --sidebar-foreground,
     --sidebar-primary, --sidebar-primary-foreground, --sidebar-accent,
     --sidebar-accent-foreground, --sidebar-border, --sidebar-ring */
}

.dark {
  color-scheme: dark;
  /* … every .dark token from theme-tokens.css, same order */
}
```

- [ ] **Step 2: Wrap `theme-tokens.css` tokens in the named layer + add new defaults**

In `packages/ui/theme-tokens.css`: wrap the existing `:root { … }` and `.dark { … }` blocks (only those two) in `@layer lodekit-tokens { … }`, and add to `:root` after `--radius`:

```css
  --spacing: 0.25rem;
  --icon-library: lucide;
```

Leave `@theme inline` and `@layer base` untouched, outside the new layer. (Cascade rationale, spec §2: layered declarations lose to the unlayered served theme regardless of order; `lodekit-tokens` is declared after Tailwind's layers so it still beats Tailwind's own `@layer theme` defaults like `--spacing`.)

- [ ] **Step 3: Remove the Google Fonts `@import` from `packages/ui/theme.css`** (line 1 — it now lives in `lodekit.css`). Do not touch the `theme-overrides.css` import yet (task 5 removes it).

- [ ] **Step 4: Verify**

Run: `pnpm --filter @lodekit/ui test` — Expected: all 4 existing test files PASS (SSR smoke unaffected by layering).

- [ ] **Step 5: Commit** — `feat(ui): layer token defaults, vendored lodekit theme (<bead-id>)`

---

### Task 2: Runtime theme service (`services/themes.ts`)

**Files:**
- Create: `packages/runtime/src/services/themes.ts`
- Test: `packages/runtime/tests/themes.test.ts`

**Interfaces:**
- Consumes: `Config` from `../config.js`; `isValidAppId` (same module `server.ts` imports it from); `emitEvent`/`PLATFORM_NS` from `../events.js`; `lodekit.css` from task 1 (resolved package-relative).
- Produces (exact exports, used by tasks 3-5):

```ts
export const THEME_MAX_BYTES = 512 * 1024;
export const DEFAULT_THEME = "lodekit";
export interface ThemeInfo { name: string; vendored: boolean; iconLibrary: string }
export interface ThemesConfig { global?: string; apps?: Record<string, string> }
export class ThemeError extends Error { constructor(message: string, public status: 400 | 404 | 409 = 400) }
export function vendoredThemesDir(): string          // package themes/ dir via import.meta.url
export function userThemesDir(cfg: Config): string   // path.join(cfg.root, "themes")
export function isVendoredTheme(name: string): boolean
export function listThemes(cfg: Config): ThemeInfo[] // vendored first, then user, alpha
export function readThemeCss(cfg: Config, name: string): string | null
export function readThemesConfig(cfg: Config): ThemesConfig   // malformed/missing → {} (+ one logged warning)
export function writeThemesConfig(cfg: Config, config: ThemesConfig): void  // validates, atomic write
export function resolveThemeName(cfg: Config, appId?: string): string  // app → global → DEFAULT_THEME; skips names whose file is missing (logged warning)
export function resolveThemeCss(cfg: Config, appId?: string): string  // NEVER throws: falls back to vendored lodekit.css content
export function extractIconLibrary(css: string): string  // /--icon-library:\s*([a-z-]+)/ first match, else "lucide"
export function putUserTheme(cfg: Config, name: string, css: string): void
export function duplicateTheme(cfg: Config, from: string, to: string): void
export function renameUserTheme(cfg: Config, from: string, to: string): void  // rewrites config refs atomically
export function deleteUserTheme(cfg: Config, name: string): void
export function setPreviewCss(css: string | null): void   // module-level slot
export function getPreviewCss(): string | null
export function warnLegacyThemeFiles(cfg: Config): void   // one-time startup warning (spec §1 retired contract)
```

**Acceptance Criteria:**
- Resolution chain app → global → `lodekit` with per-step fallback on missing file/key/name (logged warning); `resolveThemeCss` never throws.
- CRUD validation: slug grammar via `isValidAppId`-equivalent check **before any path join**; vendored-collision rejection (`409`); vendored write/rename/delete refused; size cap enforced.
- `renameUserTheme` rewrites `config.json` references in the same operation; all writes temp-then-rename.
- Malformed `config.json` → `{}` + warning, next `writeThemesConfig` rewrites it cleanly.
- Path-containment test passes: names like `../evil`, `a/b`, `.`, `` (empty) are rejected by every mutating function.
- `pnpm --filter @lodekit/runtime test` passes.

- [ ] **Step 1: Write the failing tests** (`packages/runtime/tests/themes.test.ts`)

Follow the temp-root pattern from `tests/settings-api.test.ts` (no server needed here — pure service):

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  listThemes, readThemeCss, readThemesConfig, writeThemesConfig, resolveThemeName,
  resolveThemeCss, extractIconLibrary, putUserTheme, duplicateTheme, renameUserTheme,
  deleteUserTheme, ThemeError, DEFAULT_THEME, THEME_MAX_BYTES,
} from "../src/services/themes.js";
import type { Config } from "../src/config.js";

let root: string; let cfg: Config;
const themesDir = () => path.join(root, "themes");

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-themes-"));
  cfg = { root, appsDir: path.join(root, "apps"), dataDir: path.join(root, "data"),
    cacheDir: path.join(root, ".cache"), stateDir: path.join(root, ".state"),
    port: 0, baseUrl: "http://lodekit.localhost:0", secretsKeyProvider: "file",
    gatewaysDir: path.join(root, "gateways") };
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("theme service", () => {
  it("lists vendored themes including lodekit", () => {
    const names = listThemes(cfg).map((t) => t.name);
    expect(names).toContain("lodekit");
    expect(listThemes(cfg).find((t) => t.name === "lodekit")?.vendored).toBe(true);
  });
  it("resolves app → global → default with fallbacks", () => {
    expect(resolveThemeName(cfg)).toBe(DEFAULT_THEME);
    putUserTheme(cfg, "mine", ":root { --primary: red; }");
    writeThemesConfig(cfg, { global: "mine" });
    expect(resolveThemeName(cfg)).toBe("mine");
    writeThemesConfig(cfg, { global: "mine", apps: { books: "lodekit" } });
    expect(resolveThemeName(cfg, "books")).toBe("lodekit");
    fs.rmSync(path.join(themesDir(), "mine.css"));      // selected theme vanishes on disk
    expect(resolveThemeName(cfg)).toBe(DEFAULT_THEME);  // falls back, no throw
  });
  it("resolveThemeCss never throws and always returns lodekit content at worst", () => {
    const css = resolveThemeCss(cfg);
    expect(css).toContain("--icon-library");
  });
  it("survives malformed config.json", () => {
    fs.mkdirSync(themesDir(), { recursive: true });
    fs.writeFileSync(path.join(themesDir(), "config.json"), "{nope");
    expect(readThemesConfig(cfg)).toEqual({});
    expect(resolveThemeName(cfg)).toBe(DEFAULT_THEME);
  });
  it("refuses vendored writes, renames, deletes and name collisions", () => {
    expect(() => putUserTheme(cfg, "lodekit", ":root{}")).toThrow(ThemeError);
    expect(() => renameUserTheme(cfg, "lodekit", "x")).toThrow(ThemeError);
    expect(() => deleteUserTheme(cfg, "lodekit")).toThrow(ThemeError);
    putUserTheme(cfg, "mine", ":root{}");
    expect(() => renameUserTheme(cfg, "mine", "lodekit")).toThrow(ThemeError);
  });
  it("rejects path traversal on every mutating call", () => {
    for (const bad of ["../evil", "a/b", ".", "", "UPPER", "has space"]) {
      expect(() => putUserTheme(cfg, bad, ":root{}")).toThrow(ThemeError);
      expect(() => duplicateTheme(cfg, "lodekit", bad)).toThrow(ThemeError);
      expect(() => deleteUserTheme(cfg, bad)).toThrow(ThemeError);
    }
    expect(fs.existsSync(path.join(root, "evil.css"))).toBe(false);
  });
  it("enforces the size cap", () => {
    expect(() => putUserTheme(cfg, "big", "x".repeat(THEME_MAX_BYTES + 1))).toThrow(ThemeError);
  });
  it("rename rewrites config references", () => {
    putUserTheme(cfg, "mine", ":root{}");
    writeThemesConfig(cfg, { global: "mine", apps: { books: "mine" } });
    renameUserTheme(cfg, "mine", "yours");
    expect(readThemesConfig(cfg)).toEqual({ global: "yours", apps: { books: "yours" } });
    expect(readThemeCss(cfg, "yours")).toBe(":root{}");
    expect(readThemeCss(cfg, "mine")).toBeNull();
  });
  it("delete-while-selected falls back on read", () => {
    putUserTheme(cfg, "mine", ":root{}");
    writeThemesConfig(cfg, { global: "mine" });
    deleteUserTheme(cfg, "mine");
    expect(resolveThemeName(cfg)).toBe(DEFAULT_THEME);
  });
  it("extracts --icon-library with lucide default", () => {
    expect(extractIconLibrary(":root { --icon-library: tabler; }")).toBe("tabler");
    expect(extractIconLibrary(":root { color: red; }")).toBe("lucide");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @lodekit/runtime test -- themes` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `packages/runtime/src/services/themes.ts`**

Follow the `services/settings.ts` module shape (header comment, typed errors, exported functions). Key implementation notes — everything else is straightforward from the interface block above:

```ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "../config.js";

const VALID_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;  // same grammar as app ids
export function vendoredThemesDir(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "themes");
}
function assertValidName(name: string): void {
  if (!VALID_NAME.test(name)) throw new ThemeError(`invalid theme name: ${JSON.stringify(name)}`);
}
function atomicWrite(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}
```

- If the app-id validator (`isValidAppId`) uses the identical grammar, import and reuse it instead of `VALID_NAME` — check its source first; the theme grammar must equal the app-id grammar (spec §1).
- `resolveThemeCss`: `readThemeCss(cfg, resolveThemeName(cfg, appId))`, and if that returns null (race: file deleted between resolve and read), fall through to `fs.readFileSync(path.join(vendoredThemesDir(), "lodekit.css"), "utf8")` — wrap the whole body in try/catch returning the lodekit read as last resort.
- One-time warning flags: module-level `let warnedLegacy = false; let warnedConfig = false`.
- `warnLegacyThemeFiles`: checks `cfg.root/theme.css` and `cfg.appsDir/*/theme.css`; logs one `console.warn` naming `<root>/themes/<name>.css` + `config.json` as the new location.
- Preview slot: `let previewCss: string | null = null;` with the two accessors.

- [ ] **Step 4: Run tests** — `pnpm --filter @lodekit/runtime test -- themes` — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(runtime): theme service — resolution, CRUD, config (<bead-id>)`

---

### Task 3: HTTP surface — `/_ui/theme.css|json` rewrite + `/api/themes*`

**Files:**
- Modify: `packages/runtime/src/services/themes.ts` (add the Hono router)
- Modify: `packages/runtime/src/server.ts:83-96` (theme.css handler), `:106-109` (theme.json handler)
- Modify: `packages/runtime/src/routes.ts` (mount `/themes`)
- Test: `packages/runtime/tests/themes-api.test.ts`; update `packages/runtime/tests/ui-serving.test.ts` expectations

**Interfaces:**
- Consumes: every task-2 export; `scanApps`/`isValidAppId` as `server.ts` already uses them; `emitEvent` for preview-`PUT` SSE.
- Produces: `export const themesRoutes: (cfg: Config) => Hono` mounted at `/api/themes`; response shapes the dashboard (task 10) consumes:
  - `GET /api/themes` → `{ themes: ThemeInfo[], config: ThemesConfig }`
  - `GET /api/themes/:name` → raw CSS (`text/css`)
  - `PUT /api/themes/:name` body = raw CSS → `204`; errors `{ error: string }` with 400/404/409
  - `POST /api/themes/:name/duplicate` / `.../rename` body `{ to: string }` → `204`
  - `DELETE /api/themes/:name` → `204`
  - `PUT /api/themes/config` body = `ThemesConfig` → `204` (validates names + app ids)
  - `PUT /api/themes/preview` body = raw CSS → `204`, emits `theme-change`

**Acceptance Criteria:**
- `GET /_ui/theme.css` serves the resolved whole theme (no more override composition): `?app=<id>` validated (unknown → still 200 with global resolution — blocking resource, spec §2 always-200; log the warning), `?preview=1` serves the draft or falls back to normal resolution when empty.
- `GET /_ui/theme.json` returns `{ theme, iconLibrary }`, accepts `?app` and `?preview=1`.
- All 8 `/api/themes*` endpoints behave per the table in spec §2 with the guards from spec §5.
- Preview `PUT` enforces `THEME_MAX_BYTES` and emits a `theme-change` event.
- `pnpm --filter @lodekit/runtime test` passes.

- [ ] **Step 1: Write failing endpoint tests** (`packages/runtime/tests/themes-api.test.ts`)

Copy the server-boot skeleton from `tests/settings-api.test.ts` (createServer + port 0 + `base`). Cases (one `it` each):

```ts
it("serves the resolved theme with always-200 semantics", async () => {
  let r = await fetch(base + "/_ui/theme.css");
  expect(r.status).toBe(200);
  expect(await r.text()).toContain("--icon-library");     // lodekit default
  r = await fetch(base + "/_ui/theme.css?app=not-an-app");  // unknown app: still 200, global
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("no-store");
});
it("theme.json carries iconLibrary", async () => {
  const t = await (await fetch(base + "/_ui/theme.json")).json();
  expect(t).toEqual({ theme: "system", iconLibrary: "lucide" });
});
it("lists themes with config", async () => { /* GET /api/themes → {themes, config} */ });
it("user theme CRUD lifecycle", async () => {
  // PUT mine → 204; GET raw css back; duplicate mine→mine2; rename mine2→mine3;
  // DELETE mine3 → 204; GET /api/themes/mine3 → 404
});
it("refuses vendored writes and traversal names", async () => {
  expect((await fetch(base + "/api/themes/lodekit", { method: "PUT", body: ":root{}" })).status).toBe(409);
  expect((await fetch(base + "/api/themes/" + encodeURIComponent("../evil"), { method: "PUT", body: ":root{}" })).status).toBe(400);
});
it("caps body size on theme and preview PUT", async () => { /* 413 or 400 for THEME_MAX_BYTES+1 */ });
it("config PUT validates names and app ids", async () => { /* bad name → 400; good → 204 and GET reflects it */ });
it("preview slot serves and self-heals", async () => {
  await fetch(base + "/api/themes/preview", { method: "PUT", body: ":root { --primary: hotpink; }" });
  expect(await (await fetch(base + "/_ui/theme.css?preview=1")).text()).toContain("hotpink");
  // empty slot (fresh server) → falls back: assert non-preview content served, status 200
});
```

- [ ] **Step 2: Run to verify failure** — Expected: FAIL (404s — routes missing).

- [ ] **Step 3: Implement the router** in `services/themes.ts` (settings.ts style: own `.onError` mapping `ThemeError.status`), register static paths **before** `/:name`:

```ts
export const themesRoutes = (cfg: Config) =>
  new Hono()
    .onError((err, c) => {
      if (err instanceof ThemeError) return c.json({ error: err.message }, err.status);
      throw err;
    })
    .get("/", (c) => c.json({ themes: listThemes(cfg), config: readThemesConfig(cfg) }))
    .put("/config", async (c) => { writeThemesConfig(cfg, await c.req.json()); return c.body(null, 204); })
    .put("/preview", async (c) => {
      const css = await c.req.text();
      if (Buffer.byteLength(css) > THEME_MAX_BYTES) throw new ThemeError("theme too large", 400);
      setPreviewCss(css);
      emitEvent({ ns: PLATFORM_NS, source: PLATFORM_NS, type: "theme-change" });
      return c.body(null, 204);
    })
    .get("/:name", (c) => { /* readThemeCss; null → 404; text/css */ })
    .put("/:name", async (c) => { putUserTheme(cfg, c.req.param("name"), await c.req.text()); return c.body(null, 204); })
    .post("/:name/duplicate", async (c) => { duplicateTheme(cfg, c.req.param("name"), (await c.req.json()).to); return c.body(null, 204); })
    .post("/:name/rename", async (c) => { renameUserTheme(cfg, c.req.param("name"), (await c.req.json()).to); return c.body(null, 204); })
    .delete("/:name", (c) => { deleteUserTheme(cfg, c.req.param("name")); return c.body(null, 204); });
```

Mount in `routes.ts` next to the settings mounts: `.route("/themes", themesRoutes(cfg))`.

- [ ] **Step 4: Rewrite the `/_ui/theme.css` handler** (`server.ts:83-96`) — replace the composition body entirely:

```ts
    .get("/_ui/theme.css", (c) => {
      c.header("Cache-Control", "no-store");
      c.header("Content-Type", "text/css; charset=utf-8");
      if (c.req.query("preview") === "1") {
        const draft = getPreviewCss();
        if (draft !== null) return c.body(draft);
      }
      const app = c.req.query("app");
      const appId = app !== undefined && isValidAppId(app) && scanApps(cfg.appsDir).some((a) => a.appId === app) ? app : undefined;
      return c.body(resolveThemeCss(cfg, appId));
    })
```

And `/_ui/theme.json` (`:106-109`):

```ts
    .get("/_ui/theme.json", (c) => {
      c.header("Cache-Control", "no-store");
      const preview = c.req.query("preview") === "1" ? getPreviewCss() : null;
      const app = c.req.query("app");
      const appId = app !== undefined && isValidAppId(app) ? app : undefined;
      const css = preview ?? resolveThemeCss(cfg, appId);
      return c.json({ theme: effectiveString("appearance.theme"), iconLibrary: extractIconLibrary(css) });
    })
```

Also call `warnLegacyThemeFiles(cfg)` once inside `start(cfg)` (near `startWatcher`, server.ts ~line 181).

- [ ] **Step 5: Update `tests/ui-serving.test.ts`** — its theme.css assertions currently expect the composed override; update them to expect resolved-whole-theme semantics (serving `lodekit.css` content by default).

- [ ] **Step 6: Run tests** — `pnpm --filter @lodekit/runtime test` — Expected: PASS.

- [ ] **Step 7: Commit** — `feat(runtime): serve-time theme delivery + /api/themes surface (<bead-id>)`

---

### Task 4: Watcher `themes/` watch + `theme-change` SSE + new `theme.js`

**Files:**
- Modify: `packages/runtime/src/watcher.ts:91-108` (replace global-theme watcher block)
- Modify: `packages/runtime/src/server.ts:49-64` (`themeResolverJs`)
- Test: update `packages/runtime/tests/watcher.test.ts` (replace the two theme-rebuild tests), extend `tests/themes-api.test.ts`

**Interfaces:**
- Consumes: `emitEvent`/`PLATFORM_NS` (`../events.js`), existing chokidar setup pattern; SSE envelope `{type, payload}` filtered client-side.
- Produces: SSE `type: "theme-change"` on any add/change/unlink under `<root>/themes/` (depth 1, 150ms debounce) — the event tasks 5/10/13 rely on; the new `theme.js` behavior every surface loads.

**Acceptance Criteria:**
- Editing/adding/removing `<root>/themes/*.css` or `config.json` emits `theme-change` and triggers **no build**.
- The old `root/theme.css` full-rebuild path is gone (watcher no longer watches it; the watcher test asserting `buildAll` on theme change is replaced by one asserting `theme-change` emission).
- `theme.js` (served): keeps mode logic; cache-busts the theme link on `theme-change`; stamps `data-icon-library` on `<html>` from `theme.json`; honors `?lodekit-theme-preview=1` via `sessionStorage` and retargets the link to `?preview=1` (spec §2, §4).
- `pnpm --filter @lodekit/runtime test` passes.

- [ ] **Step 1: Update watcher tests first** — in `tests/watcher.test.ts`: delete/replace the test at ~line 154 ("root theme.css → buildAll") and ~185 ("apps/<id>/theme.css rebuilds that app") with:

```ts
it("emits theme-change when a themes/ file changes, without rebuilding", async () => {
  // arrange: subscribe to the event bus (same helper the sse tests use), touch
  // <root>/themes/anything.css, expect one debounced theme-change event and
  // assert the build spy was NOT called.
});
it("emits theme-change when themes/config.json changes", async () => { /* same via config.json */ });
```

(Use the same spy/subscription mechanics those existing tests already use — keep their arrange/teardown style.)

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Replace watcher block** (`watcher.ts:91-108`) — the global-theme watcher becomes:

```ts
  // Themes: <root>/themes/ (theme CSS + config.json). Any change emits a
  // theme-change event on the bus — serve-time delivery means no rebuilds.
  const themesDir = path.join(cfg.root, "themes");
  fs.mkdirSync(themesDir, { recursive: true });
  let themesTimer: NodeJS.Timeout | undefined;
  const themesWatcher = chokidar.watch(themesDir, { ignoreInitial: true, depth: 1 });
  themesWatcher.on("all", () => {
    clearTimeout(themesTimer);
    themesTimer = setTimeout(() => {
      emitEvent({ ns: PLATFORM_NS, source: PLATFORM_NS, type: "theme-change" });
    }, 150);
  });
```

Add the watcher + timer to `close()` teardown like the existing three. Also note: per-app `apps/<id>/theme.css` files are now ignored content (legacy) — the apps watcher will still rebuild the app when one changes, which is harmless; do not special-case it.

- [ ] **Step 4: Rewrite `themeResolverJs`** (`server.ts:49-64`) — full replacement:

```ts
const themeResolverJs = (mode: string) => `(() => {
  let mode = ${JSON.stringify(mode)};
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const apply = () => document.documentElement.classList.toggle("dark", mode === "dark" || (mode === "system" && mq.matches));
  apply();
  mq.addEventListener("change", apply);

  const link = document.querySelector('link[href^="/_ui/theme.css"]');
  const KEY = "lodekit-theme-preview";
  try { if (new URLSearchParams(location.search).has(KEY)) sessionStorage.setItem(KEY, "1"); } catch {}
  let preview = false;
  try { preview = sessionStorage.getItem(KEY) === "1"; } catch {}
  const baseQuery = preview ? "?preview=1" : (link ? new URL(link.href, location.origin).search : "");
  const themeHref = (bust) => "/_ui/theme.css" + baseQuery + (bust ? (baseQuery ? "&" : "?") + "v=" + bust : "");
  if (link && preview) link.href = themeHref();

  const sync = () => {
    fetch("/_ui/theme.json" + baseQuery).then((r) => r.json()).then((t) => {
      mode = t.theme; apply();
      if (t.iconLibrary) document.documentElement.setAttribute("data-icon-library", t.iconLibrary);
    }).catch(() => {});
  };
  sync();

  if (typeof EventSource !== "undefined") {
    const es = new EventSource("/api/events");
    es.addEventListener("event", (e) => {
      const d = JSON.parse(e.data);
      if (d.type === "settings-change" && d.payload?.key === "appearance.theme") { sync(); return; }
      if (d.type !== "theme-change") return;
      if (link) link.href = themeHref(Date.now());
      sync();
    });
  }
})();
`;
```

- [ ] **Step 5: Extend `themes-api.test.ts`** with a `theme.js` content check: response contains `theme-change` and `data-icon-library` (string assertions, same style as `ui-serving.test.ts`'s existing `'"dark"'` check).

- [ ] **Step 6: Run tests** — `pnpm --filter @lodekit/runtime test` — Expected: PASS.

- [ ] **Step 7: Commit** — `feat(runtime): theme-change SSE + live theme.js apply (<bead-id>)`

---

### Task 5: Delivery migration — links, build decoupling, root conversion, changelog

**Files:**
- Modify: `packages/runtime/dashboard/src/routes/__root.tsx`, `root/apps/greenhouse/src/routes/__root.tsx`, `root/apps/welcome/src/routes/__root.tsx`, `packages/runtime/src/scaffold.ts` (rootTsx template)
- Modify: `packages/runtime/src/build.ts` (delete override machinery), `packages/ui/theme.css` (drop overrides import)
- Delete: `packages/ui/theme-overrides.css`, `root/theme.css`, `root/apps/greenhouse/theme.css`
- Create: `root/themes/greenhouse-green.css`, `root/themes/config.json`
- Modify: `docs/changelog.md` (append), `packages/runtime/tests/build.test.ts` if it references override files

**Interfaces:**
- Consumes: task 3's `/_ui/theme.css?app=` contract; task 4's `theme.js`.
- Produces: every surface carries `<link rel="stylesheet" href="/_ui/theme.css…">`; the dev root exercises per-app selection (spec §6 DoD).

**Acceptance Criteria:**
- Dashboard `__root.tsx` `head.links` gains `{ rel: "stylesheet", href: "/_ui/theme.css" }` (after the `appCss` link); greenhouse gets `href: "/_ui/theme.css?app=greenhouse"`, welcome `?app=welcome`; the scaffold template interpolates `?app=${appId}` (pass the appId into `rootTsx` — it currently only takes `name`).
- `build.ts`: `buildStart` composition (lines 249-257), the `theme-overrides.css` alias entry (line 240), `themeOverrideFiles` field (lines 193-194) and both call sites (lines 67-70, 160) are gone; `appAliases` keeps its other load-bearing entries.
- `packages/ui/theme.css` no longer imports `@lodekit/ui/theme-overrides.css`; the empty file is deleted.
- `root/theme.css` and `root/apps/greenhouse/theme.css` are deleted; `root/themes/greenhouse-green.css` is a full self-contained theme (duplicate of `lodekit.css` with greenhouse's green `--primary`/`--ring` values from the old override and `--radius: 0.75rem` from the old root file); `root/themes/config.json` = `{ "apps": { "greenhouse": "greenhouse-green" } }`.
- `docs/changelog.md` `## New` entry describing self-contained themes; the same entry **explicitly names the break**: legacy `theme.css` override files are ignored (startup warning points to `themes/`), and apps scaffolded before this release need the one-line theme `<link>` added to `__root.tsx` to follow theme switching.
- Full `pnpm test` passes (phase boundary).

- [ ] **Step 1: Add the theme links.** In each `__root.tsx` `head()`, extend `links`; e.g. greenhouse:

```tsx
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: "/_ui/theme.css?app=greenhouse" },
    ],
```

In `scaffold.ts`, change the `rootTsx` builder signature to take the app id and emit `href: "/_ui/theme.css?app=${appId}"` in the generated template (the template already interpolates `${name}` — same mechanism).

- [ ] **Step 2: Delete the build machinery** per the enumerated lines in Acceptance Criteria. `appAliases` becomes a constant list (no parameter). Remove the `themeOverrideFiles` doc comment with the field.

- [ ] **Step 3: Drop the overrides import** (last `@import` in `packages/ui/theme.css`) and `git rm packages/ui/theme-overrides.css`.

- [ ] **Step 4: Convert the dev root.** Create `root/themes/greenhouse-green.css` by copying `packages/runtime/themes/lodekit.css` and substituting exactly: `--radius: 0.75rem;`, light `--primary: oklch(0.6 0.17 150); --primary-foreground: oklch(0.985 0 0); --ring: oklch(0.68 0.13 150);`, dark `--primary: oklch(0.72 0.17 150); --primary-foreground: oklch(0.22 0.05 150); --ring: oklch(0.58 0.11 150);` (also mirror into the `--sidebar-primary`/`--sidebar-ring` slots). Header comment: per-app showcase theme. Create `root/themes/config.json`. `git rm root/theme.css root/apps/greenhouse/theme.css`.

- [ ] **Step 5: Append the changelog entry** (`## New`, after the existing entries — append-only).

- [ ] **Step 6: Run everything** — `pnpm test` — Expected: all packages PASS. Then a manual smoke: `pnpm dev`, open the dashboard and greenhouse, confirm greenhouse renders green primary from the served theme, edit `root/themes/greenhouse-green.css` and watch it apply live without a rebuild.

- [ ] **Step 7: Commit** — `feat(runtime): serve-time theme links, retire override composition (<bead-id>)`

---

### Task 6: `@lodekit/ui/icons` — indirection, sets, generated maps

**Files:**
- Create: `packages/ui/icons/index.ts` (subpath entry: `export * from "../src/icons/index"`)
- Create: `packages/ui/src/icons/index.ts`, `src/icons/create-icon.tsx`, `src/icons/use-icon-library.ts`, `src/icons/sets.ts`
- Create: `packages/ui/scripts/generate-icon-maps.mjs` + generated `src/icons/generated/names.ts`, `generated/phosphor.ts`, `generated/tabler.ts` (all committed)
- Modify: `packages/ui/package.json` (add `@phosphor-icons/react`, `@tabler/icons-react` deps)
- Test: `packages/ui/tests/icons.test.tsx`

**Interfaces:**
- Consumes: `data-icon-library` attribute on `<html>` (stamped by task 4's `theme.js`; absent → lucide).
- Produces: named exports for **every icon name in the repo inventory** (49 names, both `X`/`XIcon` spellings where used), each a component accepting `{ size?, strokeWidth?, absoluteStrokeWidth?, className?, ...svg props }` (lucide-compatible); `useIconLibrary(): "lucide" | "phosphor" | "tabler"`; re-export `type LucideIcon` as `type IconComponent` (and keep `LucideIcon` as an alias for migration ease).

**Acceptance Criteria:**
- `import { Settings } from "@lodekit/ui/icons"` renders the lucide glyph by default; with `data-icon-library="phosphor"` on `<html>` it renders the mapped Phosphor glyph once the lazy chunk resolves, lucide until then (same box → no layout shift).
- Unmapped canonical name → lucide fallback, never a crash (spec §3).
- Maps are produced by the committed `generate-icon-maps.mjs` (scans the repo for `@lodekit/ui/icons` + `lucide-react` imports, auto-matches identical names, applies a curated override table for the rest); output files committed; running the script is idempotent.
- Set switch is live: flipping the attribute re-renders via `useSyncExternalStore` (MutationObserver on `<html>` `data-icon-library`).
- `pnpm --filter @lodekit/ui test` passes.

- [ ] **Step 1: Install deps** — `pnpm --filter @lodekit/ui add @phosphor-icons/react @tabler/icons-react`

- [ ] **Step 2: Write failing tests** (`packages/ui/tests/icons.test.tsx`, `// @vitest-environment happy-dom`, `createRoot` + `act` style like `data-table.test.tsx`):

```tsx
// 1. default renders lucide: mount <Settings />, assert an <svg> present.
// 2. unmapped fallback: a name absent from the phosphor map still renders under
//    data-icon-library="phosphor" (assert svg present, no throw).
// 3. attribute switch: render, then documentElement.setAttribute("data-icon-library","tabler"),
//    await act(async () => {}); assert the rendered svg changed (compare outerHTML before/after).
// 4. map coverage (node-env test in same file is fine via dynamic import):
//    every name in generated/names.ts has an entry in phosphor + tabler maps OR is
//    explicitly listed in the generator's knownUnmapped list.
```

- [ ] **Step 3: Implement.** Core pieces:

```ts
// src/icons/use-icon-library.ts
import { useSyncExternalStore } from "react"

export type IconLibrary = "lucide" | "phosphor" | "tabler"

function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-icon-library"] })
  return () => mo.disconnect()
}
const snapshot = (): IconLibrary => {
  const v = document.documentElement.getAttribute("data-icon-library")
  return v === "phosphor" || v === "tabler" ? v : "lucide"
}
export const useIconLibrary = () =>
  useSyncExternalStore(subscribe, snapshot, () => "lucide" as IconLibrary)
```

```ts
// src/icons/sets.ts — lazy per-set chunks with a subscriber store so components
// re-render when a chunk resolves.
import type { ComponentType } from "react"
type IconMap = Record<string, ComponentType<any>>
const loaded = new Map<string, IconMap>()
const loading = new Set<string>()
const subs = new Set<() => void>()

export function getSet(lib: "phosphor" | "tabler"): IconMap | undefined {
  if (loaded.has(lib)) return loaded.get(lib)
  if (!loading.has(lib)) {
    loading.add(lib)
    const load = lib === "phosphor" ? import("./generated/phosphor") : import("./generated/tabler")
    load.then((m) => { loaded.set(lib, m.default); subs.forEach((cb) => cb()) }).catch(() => {})
  }
  return undefined
}
export function subscribeSets(cb: () => void) { subs.add(cb); return () => subs.delete(cb) }
export const setsVersion = () => loaded.size
```

```tsx
// src/icons/create-icon.tsx
import { useSyncExternalStore, type ComponentType } from "react"
import { useIconLibrary } from "./use-icon-library"
import { getSet, subscribeSets, setsVersion } from "./sets"

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string
  strokeWidth?: number | string
  absoluteStrokeWidth?: boolean
}
export function createIcon(name: string, Lucide: ComponentType<IconProps>) {
  function Icon(props: IconProps) {
    const lib = useIconLibrary()
    useSyncExternalStore(subscribeSets, setsVersion, setsVersion)
    if (lib !== "lucide") {
      const Alt = getSet(lib)?.[name]
      if (Alt) {
        const { size = 24, strokeWidth, absoluteStrokeWidth: _a, ...rest } = props
        return lib === "tabler"
          ? <Alt size={size} stroke={strokeWidth} {...rest} />
          : <Alt size={size} {...rest} />   // phosphor: discrete weights, default regular
      }
    }
    return <Lucide {...props} />   // default set AND fallback while a chunk loads / unmapped
  }
  Icon.displayName = name
  return Icon
}
```

`src/icons/index.ts` re-exports the generated name list: `export const Settings = createIcon("Settings", LucideSettings)` per name (generated section), plus `export type { LucideIcon } from "lucide-react"`. `*Icon`-suffixed spellings are additional `export const SettingsIcon = Settings`-style aliases only for the spellings actually in the inventory.

- [ ] **Step 4: Write the generator** (`scripts/generate-icon-maps.mjs`): scans `packages/ui/src`, `packages/runtime/dashboard/src`, `packages/runtime/src/scaffold.ts`, `root/apps` for icon imports from `lucide-react`/`@lodekit/ui/icons`; canonicalizes (`XIcon` → `X` when both exist in lucide, else keep); auto-matches names against the installed `@phosphor-icons/react` and `@tabler/icons-react` export lists (Tabler prefixes `Icon`, e.g. `IconSettings`; Phosphor uses different nouns — curated `OVERRIDES` table in the script for non-identical names, e.g. `Settings → GearSix`, `Trash2 → Trash`, `Zap → Lightning`); writes the three generated files with a `/* generated by scripts/generate-icon-maps.mjs — do not edit */` header. Run it: `node packages/ui/scripts/generate-icon-maps.mjs`, commit outputs.

- [ ] **Step 5: Run tests** — `pnpm --filter @lodekit/ui test` — Expected: PASS.

- [ ] **Step 6: Commit** — `feat(ui): @lodekit/ui/icons indirection with phosphor/tabler sets (<bead-id>)`

---

### Task 7: Icon import migration + scan test

**Files:**
- Modify: all 18 `packages/ui/src/components/*.tsx` lucide importers (→ relative `"../icons"`), all 19 `packages/runtime/dashboard/src/**` lucide importers (→ `"@lodekit/ui/icons"`), `packages/runtime/dashboard/src/components/empty-stub.tsx` (`type LucideIcon` → from `@lodekit/ui/icons`)
- Test: `packages/ui/tests/icon-coverage.test.ts`

**Interfaces:**
- Consumes: task 6's exports (every name in the inventory must exist there — the migration fails to typecheck otherwise, which is the point).
- Produces: a repo where `lucide-react` appears only inside `packages/ui/src/icons/` (and `web/main`, which is out of scope — the Astro landing site is not themed).

**Acceptance Criteria:**
- Scan test passes: no `from "lucide-react"` outside `packages/ui/src/icons/` in `packages/ui/src`, `packages/runtime/dashboard/src`, `packages/runtime/src/scaffold.ts`, `root/apps`; every canonical name used has entries in both alternate maps or is in the generator's `knownUnmapped` allowlist.
- `pnpm --filter @lodekit/ui test`, `pnpm --filter @lodekit/runtime test`, and `pnpm --filter @lodekit/runtime check` (tsc) pass. Full `pnpm test` passes (phase boundary).

- [ ] **Step 1: Write the scan test** (`packages/ui/tests/icon-coverage.test.ts`, node env — pure `fs` walk):

```ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import phosphor from "../src/icons/generated/phosphor";
import tabler from "../src/icons/generated/tabler";
import { CANONICAL_NAMES, KNOWN_UNMAPPED } from "../src/icons/generated/names";

const ROOTS = ["src", "../runtime/dashboard/src", "../runtime/src/scaffold.ts", "../../root/apps"]
  .map((p) => path.resolve(__dirname, "..", p));

it("no direct lucide-react imports remain outside the icons module", () => { /* walk .ts/.tsx, skip src/icons/, assert !/from "lucide-react"/ */ });
it("every canonical name maps in both alternate sets", () => {
  for (const name of CANONICAL_NAMES) {
    if (KNOWN_UNMAPPED.includes(name)) continue;
    expect(phosphor[name], `phosphor: ${name}`).toBeDefined();
    expect(tabler[name], `tabler: ${name}`).toBeDefined();
  }
});
```

- [ ] **Step 2: Run to verify failure** (37 files still import lucide directly).

- [ ] **Step 3: Migrate mechanically.** UI components: `from "lucide-react"` → `from "../icons"`. Dashboard: → `from "@lodekit/ui/icons"`. Keep icon JSX usage untouched — the components are prop-compatible. `type LucideIcon` imports move too (re-exported by the icons module).

- [ ] **Step 4: Run** — scan test + both package test suites + `pnpm --filter @lodekit/runtime check`; then full `pnpm test`. Expected: PASS. Also `pnpm dev` smoke: dashboard renders identically (lucide is still the active set).

- [ ] **Step 5: Commit** — `feat(ui,dashboard): migrate icon imports to @lodekit/ui/icons (<bead-id>)`

---

### Task 8: Vendored theme ports (Dracula, Catppuccin, Nord, Rosé Pine)

**Files:**
- Create: `packages/runtime/themes/dracula.css`, `catppuccin.css`, `nord.css`, `rose-pine.css`
- Modify: `docs/changelog.md` (append)
- Test: extend `packages/runtime/tests/themes.test.ts` (vendored listing + each file parses for `--icon-library`)

**Interfaces:**
- Consumes: the canonical format from task 1; icon sets from task 6.
- Produces: 5 vendored themes total; **at least one non-lucide** `--icon-library` (stress-test decision): `nord.css` → `tabler`, `rose-pine.css` → `phosphor`.

**Acceptance Criteria:**
- Each port: MIT attribution header comment (`/* Dracula — ported from github.com/dracula (MIT) */` style), fonts `@import` (or system stacks), full token set both modes, own CVD-checked `--chart-1..5`, `--spacing`/`--radius`/`--icon-library` present.
- Palette anchors (from the upstream published palettes — derive the full token set from these, surfaces = the elevated/overlay steps of each palette):
  - **Dracula** dark: bg `#282a36`, fg `#f8f8f2`, primary `#bd93f9` (purple), surfaces `#343746`/`#44475a`, muted-fg `#6272a4`, destructive `#ff5555`, charts from purple/pink/cyan/green/orange (`#bd93f9 #ff79c6 #8be9fd #50fa7b #ffb86c`). Light = official Alucard: bg `#f8f8f2`, fg `#1f1f1f`, primary `#644ac9`.
  - **Catppuccin**: light = Latte (base `#eff1f5`, text `#4c4f69`, primary mauve `#8839ef`), dark = Mocha (base `#1e1e2e`, text `#cdd6f4`, primary mauve `#cba6f7`); charts from mauve/blue/green/peach/pink.
  - **Nord**: dark = Polar Night (bg `#2e3440`, surfaces `#3b4252`/`#434c5e`, fg `#eceff4`, primary `#88c0d0`), light = Snow Storm inverted (bg `#eceff4`, fg `#2e3440`, primary `#5e81ac`); charts from frost + aurora (`#5e81ac #88c0d0 #a3be8c #ebcb8b #b48ead`).
  - **Rosé Pine**: dark = main (base `#191724`, text `#e0def4`, primary rose `#ebbcba`), light = Dawn (base `#faf4ed`, text `#575279`, primary `#d7827e`); charts rose/foam/pine/gold/iris.
- Chart series per theme pass a CVD sanity check (5 hues distinguishable under deuteranopia — verify with an online simulator or the `dataviz` palette rules; adjust lightness spacing if two collapse).
- Foreground/background pairs meet WCAG AA for body text (4.5:1) in both modes.
- Changelog `## New` entry: vendored themes + switchable icon sets.
- `pnpm --filter @lodekit/runtime test` passes; full `pnpm test` passes (phase boundary).

- [ ] **Step 1: Extend `themes.test.ts`**: `listThemes` returns the 5 vendored names; each vendored CSS contains `:root`, `.dark`, `--chart-5`, `--icon-library`; `extractIconLibrary` returns `tabler` for nord and `phosphor` for rose-pine.
- [ ] **Step 2: Verify failure, then write the four CSS files** per the anchors above (full token set each — copy `lodekit.css` structure, substitute every value; keep upstream token names in a comment next to non-obvious mappings).
- [ ] **Step 3: Manual verification**: `pnpm dev`, `PUT /api/themes/config {"global":"dracula"}` via curl (or edit `root/themes/config.json`), eyeball dashboard + greenhouse in both modes; repeat for each port; confirm nord flips icons to tabler.
- [ ] **Step 4: Append changelog entry; run `pnpm test`.** Expected: PASS.
- [ ] **Step 5: Commit** — `feat(runtime): vendored theme ports — dracula, catppuccin, nord, rose-pine (<bead-id>)`

---

### Task 9: Theme CSS parser/serializer (pure module)

**Files:**
- Create: `packages/runtime/dashboard/src/lib/theme-css.ts`
- Test: `packages/runtime/tests/theme-css.test.ts` (imports `../dashboard/src/lib/theme-css.js` — the established cross-boundary pattern, like `table-query.test.ts`)

**Interfaces:**
- Consumes: nothing (dependency-free on purpose — header comment says so, like `table-query.ts`).
- Produces (exact exports, consumed by tasks 10-13):

```ts
export interface ThemeModel {
  imports: string[];                     // @import statements, verbatim
  fontUi: string; fontDisplay: string;
  radius: string; spacing: string; iconLibrary: string;
  light: Record<string, string>;         // token → value (no leading --), insertion-ordered
  dark: Record<string, string>;
  custom: string;                        // unrecognized CSS, preserved verbatim ("" if none)
}
export function parseTheme(css: string): ThemeModel;
export function serializeTheme(model: ThemeModel): string;   // canonical format (task 1 file layout)
export const COLOR_TOKENS: readonly string[];                // canonical token order
export interface Role { key: string; label: string; tokens: string[] }
export const ROLES: readonly Role[];    // exactly the spec §4 table (Brand/Background/Surface/Muted/Border/Destructive/Charts)
export function roleValue(model: ThemeModel, mode: "light" | "dark", role: Role): string | "mixed";
export function applyRole(model: ThemeModel, mode: "light" | "dark", role: Role, color: string): ThemeModel;  // writes group, derives foregrounds
export function readableForeground(hex: string): string;    // luminance > 0.5 ? dark fg : light fg
```

**Acceptance Criteria:**
- **Round-trip:** `serializeTheme(parseTheme(css)) === css` byte-identical for every vendored theme file (test reads them from `packages/runtime/themes/*.css`); `parseTheme(serializeTheme(m))` deep-equals `m`.
- Unrecognized CSS (extra selectors, media queries) survives verbatim in `custom` and re-serializes in a trailing block.
- `roleValue` returns the shared color when all tokens in the role's primary group agree, `"mixed"` otherwise; `applyRole` writes the whole group with mode-appropriate auto-derived foregrounds; non-hex values (oklch etc.) display fine and read as `"mixed"` when diverged — never coerced.
- `pnpm --filter @lodekit/runtime test` passes.

- [ ] **Step 1: Write the failing round-trip tests** — vendored-file fixtures + hand cases:

```ts
it("round-trips every vendored theme byte-identically", () => {
  const dir = path.resolve(__dirname, "../themes");
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".css"))) {
    const css = fs.readFileSync(path.join(dir, f), "utf8");
    expect(serializeTheme(parseTheme(css)), f).toBe(css);
  }
});
it("preserves custom CSS verbatim", () => { /* input with a @media block → parse → serialize → contains it byte-equal */ });
it("detects mixed roles and applies role writes with derived foregrounds", () => { /* applyRole Brand '#ff0000' → primary/ring/sidebar-primary set, primary-foreground = readableForeground */ });
```

- [ ] **Step 2: Verify failure. Step 3: Implement** — regex/scanner-based (no CSS lib): split top-level statements; `@import …;` lines → `imports`; `:root { … }` / `.dark { … }` blocks → declaration maps (custom-property lines + `color-scheme` which the serializer always re-emits, spec-canonical); known non-token keys (`--font-ui`, `--font-display`, `--radius`, `--spacing`, `--icon-library`) lift into the typed fields; anything else (unknown at top level, unknown selectors) accumulates into `custom`. Serializer emits exactly the task-1 layout (comment lines within `:root`/`.dark` bodies are not modeled: they land in `custom`… **no** — header/body comments must round-trip: keep a `headerComment` capture: leading `/* … */` before the first statement is stored and re-emitted verbatim; body comments inside token blocks are attached to the following declaration as a prefix string in a parallel `commentBefore` map. This is the fiddly part — the vendored-file round-trip test is the arbiter).
- [ ] **Step 4: Run** — Expected: PASS. **Step 5: Commit** — `feat(dashboard): theme CSS parser/serializer with byte-identical round-trip (<bead-id>)`

---

### Task 10: Library view (`/themes`)

**Files:**
- Create: `packages/runtime/dashboard/src/lib/themes-api.ts` (typed fetchers, `data-api.ts` style)
- Modify: `packages/runtime/dashboard/src/routes/themes.tsx` (replace the EmptyStub)
- Create: `packages/runtime/dashboard/src/components/theme-card.tsx`

**Interfaces:**
- Consumes: task 3 API shapes; task 9 `parseTheme` (swatch strips + mini-preview from the parsed palette); `useSSEEvent` from `../components/sse`; `fetchApps` from `lib/data-api.ts` (app list for Assign menu); `@lodekit/ui` components (`Card`, `Badge`, `DropdownMenu`, `Dialog`, `Button`, `Input`, `Skeleton`).
- Produces: `themes-api.ts` fetchers reused by the editor (task 11/13):

```ts
export interface ThemesIndex { themes: { name: string; vendored: boolean; iconLibrary: string }[]; config: { global?: string; apps?: Record<string, string> } }
export const fetchThemes: () => Promise<ThemesIndex>;
export const fetchThemeCss: (name: string) => Promise<string>;
export const putThemeCss: (name: string, css: string) => Promise<void>;   // throws Error(message) on !ok
export const putThemesConfig: (config: ThemesIndex["config"]) => Promise<void>;
export const duplicateTheme: (name: string, to: string) => Promise<void>;
export const renameTheme: (name: string, to: string) => Promise<void>;
export const deleteTheme: (name: string) => Promise<void>;
export const putPreview: (css: string) => Promise<void>;
```

**Acceptance Criteria:**
- `/themes` shows a card grid: name, vendored badge, swatch strip (5 swatches: primary/background/secondary/accent/destructive from the parsed light palette), light/dark mini-preview (two small stacked chips using parsed `background`+`foreground`+`primary` per mode).
- Header strip shows current state (`Global: <name> · <app> → <name>` per assignment) with inline unassign; **Use everywhere** sets `config.global`; **Assign to app…** menu lists installed apps; **Duplicate** prompts for a slug (Dialog + Input, validated client-side with the same grammar regex); user themes also get **Rename**/**Delete** (Delete confirms via AlertDialog).
- Card click navigates to `/themes/$name`; SSE `theme-change` invalidates the queries so external edits appear live.
- Route uses the gateways.tsx idiom exactly (useQuery + Skeleton + SSE invalidation).
- Runtime dashboard builds (`pnpm dev` + open `/themes` — actions verified manually against a live runtime; parser behavior is already unit-tested).

- [ ] **Step 1: Write `themes-api.ts`** (typed fetchers above — plain `fetch`, `if (!res.ok) throw new Error((await res.json()).error ?? res.statusText)`).
- [ ] **Step 2: Build the library route** — model on `gateways.tsx` (quoted pattern in the codebase): `useQuery(["themes"])` for the index + one `useQuery(["theme-css", name])` per card for swatches; mutations via plain handlers calling the fetchers then `invalidateQueries({ queryKey: ["themes"] })`; `useSSEEvent("event", …)` filtering `theme-change`.
- [ ] **Step 3: Manual verification** — `pnpm dev`: switch global theme (page + apps restyle within a beat), assign greenhouse, duplicate lodekit → edit slug collision → see 409 surfaced, rename, delete-while-assigned (falls back visibly).
- [ ] **Step 4: Append changelog entry** (`## New`: theme library — switch, assign, duplicate).
- [ ] **Step 5: Commit** — `feat(dashboard): theme library view (<bead-id>)`

---

### Task 11: Editor route — controls + inline preview application

**Files:**
- Create: `packages/runtime/dashboard/src/routes/themes_.$name.tsx` (full-width route, no shared `/themes` layout — mirrors `gateways_.$providerId.tsx` naming)
- Create: `packages/runtime/dashboard/src/components/theme-editor/controls.tsx`, `role-row.tsx`

**Interfaces:**
- Consumes: task 9 model + `ROLES`/`roleValue`/`applyRole`/`serializeTheme`; task 10 fetchers.
- Produces: editor state contract used by tasks 12-13: the route holds `const [model, setModel] = useState<ThemeModel>` + `const [mode, setMode] = useState<"light" | "dark">` + `dirty` flag; preview subtree receives the model as inline custom properties: `<div style={cssVarsFor(model, mode)}>` where `cssVarsFor` returns `{ "--background": …, …all tokens, "--radius": …, "--spacing": … }`.

**Acceptance Criteria:**
- shadcn/create-style layout: large left sidebar (controls), preview filling the rest (spec §4).
- Light/dark toggle switches both the preview vars and which palette the color controls edit; radius/density/fonts/icons are mode-shared.
- Color roles per the spec §4 table: swatch row per role (native `<input type="color">` is acceptable v1), expandable (Collapsible) to per-token rows; diverged role shows "Mixed" (Badge) instead of a lying swatch; editing a role calls `applyRole`; editing an expanded token writes just that token.
- Typography: two Selects over a curated list (~12 entries: Fraunces, Hanken Grotesk, Inter, Lora, Source Serif 4, IBM Plex Sans, IBM Plex Mono, Space Grotesk, Nunito, Merriweather, `system-ui` stack, `Georgia` serif stack); changing them rewrites the model's `imports` Google-Fonts line to cover exactly the selected Google families (system stacks need no import).
- Icons: Select over `lucide | phosphor | tabler` with a glyph row (a few icons rendered via `@lodekit/ui/icons` under a local `data-icon-library` — set the attribute on a wrapper is NOT how the hook reads it (it reads `<html>`), so the glyph preview renders the three sets by importing the maps directly — document this in a comment).
- Radius: Slider 0–1.5rem step 0.125; Density: Select Compact/Default/Comfortable → `--spacing` 0.2rem/0.25rem/0.3rem.
- Vendored themes open read-only: controls disabled, prominent "Duplicate to edit" button (calls duplicate → navigates to the copy).
- Inline preview vars apply with zero network on every model change.

- [ ] **Step 1: Route skeleton** — load CSS (`useQuery(["theme-css", name])`), `parseTheme` into state once loaded; `vendored` flag from the index query.
- [ ] **Step 2: Controls sidebar** (role rows, expand, typography/icons/radius/density) wired to `setModel` + `dirty = true`.
- [ ] **Step 3: Temporary preview pane** — a plain `<div style={cssVarsFor(model, mode)}>` with a Card + Button + Input sample (replaced by task 12's canvas).
- [ ] **Step 4: Manual verification** — edit lodekit-duplicate: role write updates all grouped tokens; mixed detection on greenhouse-green (its sidebar-primary diverges only if you make it so — craft a quick check); toggle modes.
- [ ] **Step 5: Commit** — `feat(dashboard): theme editor controls (<bead-id>)`

---

### Task 12: Component canvas (the visualizer)

**Files:**
- Create: `packages/runtime/dashboard/src/components/theme-editor/canvas.tsx`
- Modify: `themes_.$name.tsx` (Tabs: Components | App; Components renders the canvas)

**Interfaces:**
- Consumes: task 11's inline-vars contract (`cssVarsFor(model, mode)` on the canvas root).
- Produces: `<ThemeCanvas />` — self-contained (no fetches, no router links), so a future ui.lodekit.com deploy can lift it (spec non-goal kept liftable).

**Acceptance Criteria:**
- Curated composition in one scrollable pane: a mini sidebar/nav strip, stat cards, form fields (Input, Select, Checkbox, Switch, Slider), a small Table, Badges row, Buttons row (all variants), a Dialog trigger (opens within the subtree), one `ChartContainer` line chart + one bar chart fed static data (exercises `--chart-1..5`), an icon row (a dozen `@lodekit/ui/icons` glyphs).
- Everything inside the canvas renders from the preview vars — visually restyles instantly on every control edit, both modes.
- The `.dark` palette previews by applying the dark map's vars (mode toggle swaps which map `cssVarsFor` reads — no `.dark` class dependency inside the canvas; charts resolve `--chart-*` at render so they follow along).

- [ ] **Step 1: Build `canvas.tsx`** from `@lodekit/ui` primitives only (import list from the barrel; static sample data inline).
- [ ] **Step 2: Wire the Components tab; manual verification** — every section restyles live while dragging the radius slider / picking Brand color.
- [ ] **Step 3: Commit** — `feat(dashboard): component canvas preview (<bead-id>)`

---

### Task 13: App-iframe preview, save, dirty guard

**Files:**
- Modify: `themes_.$name.tsx` (App tab, save flow, dirty guard)
- Modify: `docs/changelog.md` (append)

**Interfaces:**
- Consumes: `putPreview`/`putThemeCss` (task 10), `serializeTheme` (task 9), task 4's `theme.js` preview contract (`?lodekit-theme-preview=1` page param + `?preview=1` retarget + `theme-change` re-bust).
- Produces: the complete editor per spec §4.

**Acceptance Criteria:**
- **App tab:** app picker (Select over `fetchApps`) + `<iframe src={`/${appId}/?lodekit-theme-preview=1`}>`; every model change debounce-`PUT`s (300ms) the serialized draft to the preview slot — the iframe restyles via SSE without reload; normal windows stay unaffected.
- **Save:** serializes the model and `PUT`s to `/api/themes/:name`; on success clears `dirty`, invalidates queries; failure surfaces the API error (`sonner` toast — already a `@lodekit/ui` component).
- **Custom-CSS notice:** when `model.custom !== ""`, show a persistent notice ("contains custom CSS — preserved on save") near the save button.
- **Dirty guard:** TanStack Router `useBlocker` on navigation when `dirty` (confirm dialog), plus `beforeunload` handler.
- Changelog `## New` entry: the theme editor (edit colors/fonts/icons/radius/density, live app preview).
- Full `pnpm test` passes (phase boundary).

- [ ] **Step 1: App tab + preview PUTs. Step 2: Save + toast + custom-CSS notice. Step 3: Dirty guard (useBlocker + beforeunload).**
- [ ] **Step 4: Manual verification** — edit unsaved → iframe follows live; open the same app in a normal tab → unaffected; save → both follow; navigate away dirty → blocked; runtime restart with stale preview tab → falls back to the real theme (self-heal).
- [ ] **Step 5: Append changelog; run `pnpm test`.** Expected: PASS.
- [ ] **Step 6: Commit** — `feat(dashboard): theme editor — app preview, save, dirty guard (<bead-id>)`

---

### Task 14: Greenhouse DoD + docs closure

**Files:**
- Modify: `root/apps/greenhouse/src/routes/__root.tsx` (nav icons via `@lodekit/ui/icons`)
- Modify: `root/README.md` (DoD table row)

**Interfaces:**
- Consumes: `@lodekit/ui/icons` (task 6); per-app assignment already shipped in task 5's `root/themes/config.json`.
- Produces: DoD closure per spec §6.

**Acceptance Criteria:**
- Greenhouse nav renders icons imported from `@lodekit/ui/icons` — use already-inventoried names (`LayoutGrid` for Conservatory, `ScrollText` for Almanac, `Settings` for Potting Shed) so the mapped set doesn't grow; if a better-fitting new name is chosen instead, re-run the generator and commit the updated maps (the scan test enforces coverage either way).
- `root/README.md` DoD table gains: `| themes: per-app selection + \`@lodekit/ui/icons\` | greenhouse-green assignment in \`themes/config.json\`; nav icons |`.
- Manual smoke (spec §6, full pass): switch themes globally + per-app in the browser, both modes, icons flip on nord/rose-pine, density visibly changes, app iframe shows unsaved edits.
- Full `pnpm test` green.

- [ ] **Step 1: Add nav icons; Step 2: README row; Step 3: run the §6 manual smoke checklist end-to-end; Step 4: `pnpm test`.**
- [ ] **Step 5: Commit** — `feat(showcase): greenhouse exercises themes + icon indirection (<bead-id>)`

---

## Execution notes

- **PR shape:** one PR per phase (tasks 1-5, 6-7, 8, 9-13, 14 folds into the phase-5 PR or ships alone) — each lands green per spec §7. Branch per phase off this worktree's branch.
- **Deferrals:** anything descoped mid-execution → `defer`-labeled bead (stamped, provenance = this plan), listed in the PR body.
- **Out of scope (spec §Non-goals + stress-test):** ui.lodekit.com deploy, self-hosted fonts, mapping coverage beyond the platform-used set, theme import/export, `web/main`'s lone lucide import.
