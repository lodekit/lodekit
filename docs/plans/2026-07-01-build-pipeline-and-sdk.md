# Lodekit Build Pipeline + Minimal SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut Lodekit's app contract over from buildless HTML/JS to Vite-bundled React + TypeScript, driven programmatically, and ship a typed `@lodekit/sdk`.

**Architecture:** The runtime gains a `build.ts` module wrapping the Vite JS API. On startup and on every debounced file change it builds each app from `apps/<slug>/` into `<cacheDir>/<slug>/` (outside `LODEKIT_ROOT`), tracks per-app build state, and broadcasts `building`/`ready`/`error` over the existing SSE stream. `appHost` serves the static built output (no asset injection); apps `import { db, store } from "@lodekit/sdk"` and `react`, resolved by Vite aliases into the runtime's shared `node_modules`. This is a full cut-over: no dual-mode host, no buildless fallback, both example apps rewritten.

**Tech Stack:** pnpm workspaces, Node + `tsx` (buildless runtime), Vite + `@vitejs/plugin-react` + `@tailwindcss/vite`, React 18 + TypeScript, Express, `better-sqlite3`, vitest.

## Global Constraints

Every task's requirements implicitly include this section. Values copied verbatim from the spec and the existing codebase.

- **Buildless runtime & SDK:** the runtime and `@lodekit/sdk` ship raw `.ts`, run/transpiled without a build step (runtime via `tsx`; SDK transpiled into each app by that app's Vite build). Do **not** add a build step to either.
- **ESM + NodeNext:** all packages are `"type": "module"` and extend `tsconfig.base.json` (`module`/`moduleResolution` = `NodeNext`). Local imports in **runtime/mcp Node code** use explicit `.js` extensions (e.g. `import { x } from "./build.js"`). App **source** built by Vite uses idiomatic extensionless imports (e.g. `import App from "./App"`).
- **Slug safety:** slug must match `^[a-z0-9-]+$` (`isValidSlug` in `registry.ts`); every filesystem path must resolve within its root (now including `cacheDir`). Preserve the `/<slug>` → `/<slug>/` redirect.
- **Cut-over, not dual-mode:** there is exactly one serving path — static built output from `cacheDir`. No buildless fallback. The injected `window.lodekit` global and `/_lodekit/sdk.js` are removed.
- **Manifest filename:** `lodekit.json` is renamed to `manifest.json` everywhere.
- **Type errors do not gate builds:** Vite/esbuild transpiles without type-checking; no per-app `tsc`.
- **Build failures never crash the runtime:** they set the app's state to `error` and serve a build-failed page.
- **Conventions:** trunk-based; commit directly (no feature branches). **Do not add `Co-Authored-By` trailers** to commit messages.
- **Toolchain deps live in `packages/runtime`** and resolve from the workspace install.

---

## File Structure

**New files**

- `packages/sdk/package.json` — `@lodekit/sdk` manifest (buildless, `main`/`types` → `src/index.ts`).
- `packages/sdk/tsconfig.json` — extends base; `lib: ["ES2022","DOM"]`, `types: []`.
- `packages/sdk/vitest.config.ts` — node env, `include: ["tests/**/*.test.ts"]`.
- `packages/sdk/src/index.ts` — typed HTTP client exposing `db` + `store`.
- `packages/sdk/tests/sdk.test.ts` — unit tests (mocked `fetch` + `window.location`).
- `packages/runtime/src/build.ts` — Vite build orchestration + per-app build-state map + SSE emission.
- `packages/runtime/tests/build.test.ts` — build a fixture app; assert output + state.

**Modified files**

- `packages/runtime/src/config.ts` (+ `cacheDir`), `tests/config.test.ts`.
- `packages/runtime/src/registry.ts` (manifest rename), `tests/registry.test.ts`.
- `packages/runtime/src/appHost.ts` (serve from `cacheDir`, building/error pages, no injection), `tests/appHost.test.ts`.
- `packages/runtime/src/watcher.ts` (debounced rebuild + SSE), `tests/watcher.test.ts`.
- `packages/runtime/src/server.ts` (`buildAll` on startup, `appHost(cfg)`).
- `packages/runtime/src/scaffold.ts` (new contract stub), `tests/scaffold.test.ts`.
- `packages/runtime/public/dashboard/index.html` (per-app build state), `tests/dashboard.test.ts`.
- `packages/runtime/tests/assets.test.ts` (drop the `sdk.js` assertion), `tests/e2e.test.ts` (bundled contract).
- `packages/runtime/package.json` (toolchain deps + `@lodekit/sdk`).
- `package.json` (root: `dev` script sets `LODEKIT_CACHE_DIR`), `.gitignore` (`.cache/`).
- `examples/apps/expense-tracker/*`, `examples/apps/habit-tracker/*` (rewritten to React/TS).

**Deleted files**

- `packages/runtime/public/_lodekit/sdk.js` (the injected global is retired).

> **Note:** `packages/runtime/public/_lodekit/design-system.css` is **kept** — the server-owned dashboard still links it. Only the *injection into apps* is removed, not the file or its static mount.

---

### Task 1: `@lodekit/sdk` package

Standalone typed HTTP client. No dependency on the runtime; derives the app's API base from `window.location`, exactly as the POC SDK did (computed per call so it is trivially testable). Replaces the injected `window.lodekit`.

**Files:**
- Create: `packages/sdk/package.json`
- Create: `packages/sdk/tsconfig.json`
- Create: `packages/sdk/vitest.config.ts`
- Create: `packages/sdk/src/index.ts`
- Test: `packages/sdk/tests/sdk.test.ts`

**Interfaces:**
- Consumes: the unchanged runtime API — `POST /api/apps/:slug/db/query` → `{ rows }`, `POST …/db/exec` → `{ changes, lastInsertRowid }`, `GET …/store/:key` → `{ value }`, `PUT …/store/:key` (body `{ value }`).
- Produces: `export const db = { query<Row = unknown>(sql, params?): Promise<Row[]>, exec(sql, params?): Promise<DbExecResult> }`, `export const store = { get<T = unknown>(key): Promise<T | null>, set(key, value): Promise<void> }`, `export interface DbExecResult { changes: number; lastInsertRowid: number | bigint }`.

- [ ] **Step 1: Create the package manifest**

`packages/sdk/package.json`:

```json
{
  "name": "@lodekit/sdk",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create the tsconfig and vitest config**

`packages/sdk/tsconfig.json` (DOM lib for `window`/`fetch`; drop the base's `node` types):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM"],
    "types": []
  },
  "include": ["src", "tests"]
}
```

`packages/sdk/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
```

- [ ] **Step 3: Install so the workspace picks up the new package**

Run: `pnpm install`
Expected: completes cleanly; `packages/sdk` is now a workspace member (matches `packages/*` in `pnpm-workspace.yaml`).

- [ ] **Step 4: Write the failing tests**

`packages/sdk/tests/sdk.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db, store } from "../src/index.js";

const fetchMock = vi.fn();

beforeEach(() => {
  (globalThis as unknown as { window: unknown }).window = {
    location: { pathname: "/notes/" },
  };
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  fetchMock.mockReset();
});
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("@lodekit/sdk db", () => {
  it("query posts sql to the app-scoped endpoint and returns rows", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ rows: [{ id: 1 }] }) });
    const rows = await db.query("SELECT 1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/apps/notes/db/query");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ sql: "SELECT 1", params: [] });
    expect(rows).toEqual([{ id: 1 }]);
  });

  it("exec returns changes + lastInsertRowid", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ changes: 1, lastInsertRowid: 7 }) });
    expect(await db.exec("INSERT INTO t VALUES (1)")).toEqual({ changes: 1, lastInsertRowid: 7 });
  });

  it("throws the server error message on a non-ok response", async () => {
    fetchMock.mockResolvedValue({ ok: false, statusText: "Bad Request", json: async () => ({ error: "no such table" }) });
    await expect(db.query("SELECT * FROM nope")).rejects.toThrow("no such table");
  });
});

describe("@lodekit/sdk store", () => {
  it("get returns the parsed value", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ value: "USD" }) });
    expect(await store.get("currency")).toBe("USD");
  });

  it("get returns null when the value is null", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ value: null }) });
    expect(await store.get("missing")).toBeNull();
  });

  it("set PUTs the JSON-wrapped value", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await store.set("currency", "EUR");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/apps/notes/store/currency");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ value: "EUR" });
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `pnpm --filter @lodekit/sdk test`
Expected: FAIL — `Cannot find module '../src/index.js'` (implementation not written yet).

- [ ] **Step 6: Write the implementation**

`packages/sdk/src/index.ts`:

```ts
export interface DbExecResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

function apiBase(): string {
  const slug = window.location.pathname.split("/").filter(Boolean)[0] ?? "";
  return `/api/apps/${slug}`;
}

async function jpost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiBase() + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? res.statusText);
  return data as T;
}

export const db = {
  async query<Row = unknown>(sql: string, params: unknown[] = []): Promise<Row[]> {
    const { rows } = await jpost<{ rows: Row[] }>("/db/query", { sql, params });
    return rows;
  },
  async exec(sql: string, params: unknown[] = []): Promise<DbExecResult> {
    return jpost<DbExecResult>("/db/exec", { sql, params });
  },
};

export const store = {
  async get<T = unknown>(key: string): Promise<T | null> {
    const res = await fetch(`${apiBase()}/store/${encodeURIComponent(key)}`);
    if (!res.ok) throw new Error(res.statusText);
    const { value } = await res.json();
    return (value ?? null) as T | null;
  },
  async set(key: string, value: unknown): Promise<void> {
    const res = await fetch(`${apiBase()}/store/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    if (!res.ok) throw new Error(res.statusText);
  },
};
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @lodekit/sdk test`
Expected: PASS (6 tests).

- [ ] **Step 8: Commit**

```bash
git add packages/sdk pnpm-lock.yaml
git commit -m "feat(sdk): add typed @lodekit/sdk HTTP client (db + store)"
```

---

### Task 2: `cacheDir` config

Add the regenerable, out-of-root build cache directory. In dev it is a gitignored `.cache/` at the repo root (set via `LODEKIT_CACHE_DIR` in the root `dev` script); the production default is under the user's home cache dir, never inside `LODEKIT_ROOT`.

**Files:**
- Modify: `packages/runtime/src/config.ts`
- Modify: `package.json` (root `dev` script)
- Modify: `.gitignore`
- Test: `packages/runtime/tests/config.test.ts`

**Interfaces:**
- Produces: `Config` gains `cacheDir: string`. `loadConfig()` sets `cacheDir` from `LODEKIT_CACHE_DIR` (resolved) or defaults to `path.join(os.homedir(), ".cache", "lodekit")`.

- [ ] **Step 1: Write the failing test**

Add to `packages/runtime/tests/config.test.ts`, inside the existing `describe("loadConfig", …)` block:

```ts
  it("uses LODEKIT_CACHE_DIR when set, resolved to an absolute path", () => {
    process.env.LODEKIT_ROOT = "/tmp/lodekit-test";
    process.env.LODEKIT_CACHE_DIR = "/tmp/lodekit-cache";
    expect(loadConfig().cacheDir).toBe("/tmp/lodekit-cache");
  });

  it("defaults cacheDir under the home cache dir, outside the root", () => {
    process.env.LODEKIT_ROOT = "/tmp/lodekit-test";
    delete process.env.LODEKIT_CACHE_DIR;
    const cfg = loadConfig();
    expect(cfg.cacheDir).toBe(path.join(os.homedir(), ".cache", "lodekit"));
    expect(cfg.cacheDir.startsWith(cfg.root)).toBe(false);
  });
```

Also add `import os from "node:os";` at the top of the test file, and add `delete process.env.LODEKIT_CACHE_DIR;` to the existing `beforeEach`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @lodekit/runtime test config`
Expected: FAIL — `cfg.cacheDir` is `undefined`.

- [ ] **Step 3: Implement `cacheDir`**

Edit `packages/runtime/src/config.ts`:

```ts
import os from "node:os";
import path from "node:path";

export interface Config {
  root: string;
  appsDir: string;
  dataDir: string;
  cacheDir: string;
  port: number;
  baseUrl: string;
}

export function loadConfig(): Config {
  const root = process.env.LODEKIT_ROOT
    ? path.resolve(process.env.LODEKIT_ROOT)
    : path.join(os.homedir(), "Documents", "Lodekit");
  const port = Number(process.env.LODEKIT_PORT ?? 7777);
  const cacheDir = process.env.LODEKIT_CACHE_DIR
    ? path.resolve(process.env.LODEKIT_CACHE_DIR)
    : path.join(os.homedir(), ".cache", "lodekit");
  return {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir,
    port,
    baseUrl: `http://lodekit.localhost:${port}`,
  };
}
```

- [ ] **Step 4: Point the dev script at a repo-root `.cache/`**

Edit the `dev` script in the root `package.json`:

```json
    "dev": "LODEKIT_ROOT=$(pwd)/examples LODEKIT_CACHE_DIR=$(pwd)/.cache pnpm --filter @lodekit/runtime start",
```

- [ ] **Step 5: Gitignore the cache**

Add to `.gitignore` (after the existing `examples/data/` line):

```
.cache/
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime test config`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/runtime/src/config.ts packages/runtime/tests/config.test.ts package.json .gitignore
git commit -m "feat(runtime): add out-of-root cacheDir to config"
```

---

### Task 3: `build.ts` — Vite build orchestration

New module wrapping the Vite JS API. Builds one app into `<cacheDir>/<slug>/`, tracks per-app state (`building` → `ready` | `error`), and broadcasts the state over SSE. Resolves `react`, `react-dom`, and `@lodekit/sdk` via `resolve.alias` pointing at the runtime's shared `node_modules`. Not wired into the server yet — unit-tested against fixtures.

**Files:**
- Modify: `packages/runtime/package.json` (add toolchain deps + `@lodekit/sdk`)
- Create: `packages/runtime/src/build.ts`
- Test: `packages/runtime/tests/build.test.ts`

**Interfaces:**
- Consumes: `Config` (`appsDir`, `cacheDir`) from `./config.js`; `broadcast` from `./sse.js`; `scanApps` from `./registry.js`.
- Produces:
  - `export type BuildState = { status: "building" } | { status: "ready" } | { status: "error"; message: string }`
  - `export function getBuildState(slug: string): BuildState | undefined`
  - `export async function buildApp(cfg: Config, slug: string): Promise<BuildState>`
  - `export async function buildAll(cfg: Config): Promise<void>`
  - `export function dropBuild(cfg: Config, slug: string): void`
  - SSE events emitted: `broadcast("building", { slug })`, `broadcast("ready", { slug })`, `broadcast("error", { slug, message })`.

- [ ] **Step 1: Add toolchain dependencies to the runtime package**

Edit `packages/runtime/package.json` `dependencies` (keep existing entries; add these):

```json
    "@lodekit/sdk": "workspace:*",
    "@tailwindcss/vite": "^4.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "tailwindcss": "^4.0.0",
    "vite": "^6.0.0"
```

And add to `devDependencies`:

```json
    "@types/react": "^18.3.1",
    "@types/react-dom": "^18.3.1"
```

- [ ] **Step 2: Allowlist native install scripts and install**

`@tailwindcss/vite` v4 pulls native modules (`@tailwindcss/oxide`, `lightningcss`). Add them to the root `package.json` `pnpm.onlyBuiltDependencies` allowlist (keep existing entries):

```json
  "pnpm": {
    "onlyBuiltDependencies": ["better-sqlite3", "esbuild", "electron", "@tailwindcss/oxide", "lightningcss"]
  }
```

Run: `pnpm install`
Expected: completes cleanly; `react`, `vite`, `@tailwindcss/vite`, and `@lodekit/sdk` resolve into the runtime's `node_modules`.

- [ ] **Step 3: Write the failing test**

`packages/runtime/tests/build.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp, getBuildState } from "../src/build.js";
import type { Config } from "../src/config.js";

let root: string, cache: string, cfg: Config;

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

function writeApp(slug: string, appTsx: string) {
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
  fs.writeFileSync(
    path.join(dir, "main.tsx"),
    `import { createRoot } from "react-dom/client";\nimport App from "./App";\ncreateRoot(document.getElementById("root")!).render(<App />);\n`
  );
  fs.writeFileSync(path.join(dir, "App.tsx"), appTsx);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-root-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-cache-"));
  cfg = cfgFor(root, cache);
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
});

describe("buildApp", () => {
  it("builds a fixture app to cacheDir and marks it ready", async () => {
    writeApp("demo", `import { db } from "@lodekit/sdk";\nexport default function App() { return <h1>demo {typeof db}</h1>; }\n`);
    const state = await buildApp(cfg, "demo");
    expect(state).toEqual({ status: "ready" });
    expect(getBuildState("demo")).toEqual({ status: "ready" });
    const outDir = path.join(cache, "demo");
    expect(fs.existsSync(path.join(outDir, "index.html"))).toBe(true);
    const assets = fs.readdirSync(path.join(outDir, "assets"));
    expect(assets.some((f) => /\.js$/.test(f))).toBe(true);
  }, 30000);

  it("marks a broken app as error without throwing", async () => {
    writeApp("broken", `export default function App() { return <h1>oops</h1>  // missing brace\n`);
    const state = await buildApp(cfg, "broken");
    expect(state.status).toBe("error");
    if (state.status === "error") expect(state.message.length).toBeGreaterThan(0);
    expect(getBuildState("broken")?.status).toBe("error");
  }, 30000);
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @lodekit/runtime test build`
Expected: FAIL — `Cannot find module '../src/build.js'`.

- [ ] **Step 5: Write the implementation**

`packages/runtime/src/build.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import type { Config } from "./config.js";
import { broadcast } from "./sse.js";
import { scanApps } from "./registry.js";

const require = createRequire(import.meta.url);
// Point Vite at the runtime's copy of each package so apps (which have no
// node_modules) resolve bare imports into Lodekit's shared install.
const pkgDir = (id: string) => path.dirname(require.resolve(`${id}/package.json`));

export type BuildState =
  | { status: "building" }
  | { status: "ready" }
  | { status: "error"; message: string };

const states = new Map<string, BuildState>();

export function getBuildState(slug: string): BuildState | undefined {
  return states.get(slug);
}

function setState(slug: string, state: BuildState): void {
  states.set(slug, state);
  broadcast(
    state.status,
    state.status === "error" ? { slug, message: state.message } : { slug }
  );
}

function appOutDir(cfg: Config, slug: string): string {
  return path.join(cfg.cacheDir, slug);
}

export async function buildApp(cfg: Config, slug: string): Promise<BuildState> {
  const appDir = path.join(cfg.appsDir, slug);
  setState(slug, { status: "building" });
  try {
    await build({
      root: appDir,
      logLevel: "silent",
      plugins: [react(), tailwind()],
      resolve: {
        alias: {
          react: pkgDir("react"),
          "react-dom": pkgDir("react-dom"),
          "@lodekit/sdk": pkgDir("@lodekit/sdk"),
        },
      },
      build: { outDir: appOutDir(cfg, slug), emptyOutDir: true },
    });
    setState(slug, { status: "ready" });
  } catch (e) {
    setState(slug, { status: "error", message: e instanceof Error ? e.message : String(e) });
  }
  return states.get(slug)!;
}

export async function buildAll(cfg: Config): Promise<void> {
  for (const app of scanApps(cfg.appsDir)) {
    await buildApp(cfg, app.slug);
  }
}

export function dropBuild(cfg: Config, slug: string): void {
  states.delete(slug);
  fs.rmSync(appOutDir(cfg, slug), { recursive: true, force: true });
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @lodekit/runtime test build`
Expected: PASS (2 tests). The `ready` case produces `<cache>/demo/index.html` and a hashed `assets/*.js`; the `broken` case yields `error`.

- [ ] **Step 7: Commit**

```bash
git add packages/runtime/src/build.ts packages/runtime/tests/build.test.ts packages/runtime/package.json package.json pnpm-lock.yaml
git commit -m "feat(runtime): add Vite build orchestration (build.ts) + toolchain deps"
```

---

### Task 4: Rename `lodekit.json` → `manifest.json`

Pure rename across the source of truth (`registry.ts`) and the still-buildless serving/scaffold code and their tests, plus the two example manifest files. Serving is still buildless after this task; all existing tests stay green.

**Files:**
- Modify: `packages/runtime/src/registry.ts`, `tests/registry.test.ts`
- Modify: `packages/runtime/src/appHost.ts`, `tests/appHost.test.ts`
- Modify: `packages/runtime/src/scaffold.ts`, `tests/scaffold.test.ts`
- Rename: `examples/apps/expense-tracker/lodekit.json` → `manifest.json`
- Rename: `examples/apps/habit-tracker/lodekit.json` → `manifest.json`

**Interfaces:**
- Produces: `scanApps` and `appHost` recognize an app by the presence of `manifest.json` (no signature change).

- [ ] **Step 1: Update `registry.ts`**

In `packages/runtime/src/registry.ts`, change the manifest filename:

```ts
    const manifestPath = path.join(appsDir, entry.name, "manifest.json");
```

- [ ] **Step 2: Update `registry.test.ts`**

In `packages/runtime/tests/registry.test.ts`, replace both `"lodekit.json"` occurrences (in `writeApp` and the malformed-manifest test) with `"manifest.json"`.

- [ ] **Step 3: Update the current `appHost.ts`**

In `packages/runtime/src/appHost.ts`, change the existence check:

```ts
    if (!fs.existsSync(path.join(appDir, "manifest.json"))) return next();
```

- [ ] **Step 4: Update `appHost.test.ts`**

In `packages/runtime/tests/appHost.test.ts`, change the fixture write from `"lodekit.json"` to `"manifest.json"`.

- [ ] **Step 5: Update `scaffold.ts` (buildless stub, filename only)**

In `packages/runtime/src/scaffold.ts`, change the manifest write path and the returned `files` list entry from `"lodekit.json"` to `"manifest.json"`:

```ts
  fs.writeFileSync(path.join(appDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
```
```ts
    files: ["manifest.json", "index.html", "app.js"],
```

- [ ] **Step 6: Update `scaffold.test.ts`**

In `packages/runtime/tests/scaffold.test.ts`, change the manifest read path from `"lodekit.json"` to `"manifest.json"`.

- [ ] **Step 7: Rename the example manifest files**

```bash
git mv examples/apps/expense-tracker/lodekit.json examples/apps/expense-tracker/manifest.json
git mv examples/apps/habit-tracker/lodekit.json examples/apps/habit-tracker/manifest.json
```

- [ ] **Step 8: Run the full runtime suite to verify green**

Run: `pnpm --filter @lodekit/runtime test`
Expected: PASS — the rename is transparent; no behavior change.

- [ ] **Step 9: Commit**

```bash
git add packages/runtime/src packages/runtime/tests examples/apps
git commit -m "refactor: rename lodekit.json to manifest.json"
```

---

### Task 5: Serving cut-over — appHost, server, watcher, example apps

The mandated single cut-over. `appHost` serves static built output from `cacheDir` (no injection, building/error pages); `start()` builds every app on boot; the watcher does debounced per-app rebuilds and emits `building`/`ready`/`error`; both example apps are rewritten to React/TS; the affected tests are rewritten. After this task there is exactly one serving path.

**Files:**
- Modify: `packages/runtime/src/appHost.ts`, `tests/appHost.test.ts`
- Modify: `packages/runtime/src/server.ts`
- Modify: `packages/runtime/src/watcher.ts`, `tests/watcher.test.ts`
- Modify: `packages/runtime/tests/assets.test.ts`
- Modify: `packages/runtime/tests/e2e.test.ts`
- Delete: `packages/runtime/public/_lodekit/sdk.js`
- Rewrite: `examples/apps/expense-tracker/{index.html,src/main.tsx,src/App.tsx,src/index.css}` (remove `app.js`)
- Rewrite: `examples/apps/habit-tracker/{index.html,src/main.tsx,src/App.tsx,src/index.css}` (remove `app.js`)

**Interfaces:**
- Consumes: `getBuildState`, `buildApp`, `buildAll`, `dropBuild` from `./build.js`; `Config`.
- Produces: `appHost(cfg: Config): RequestHandler` (signature change from `appHost(appsDir: string)`); `start()` runs `buildAll` after `listen`.

- [ ] **Step 1: Rewrite `appHost.ts` to serve built output**

Replace the entire contents of `packages/runtime/src/appHost.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import type { RequestHandler } from "express";
import type { Config } from "./config.js";
import { isValidSlug } from "./registry.js";
import { getBuildState } from "./build.js";

const page = (title: string, body: string, sse: boolean) => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:640px;margin:15vh auto;padding:0 24px;color:#0a0a0a}.muted{color:#6b7280}pre{white-space:pre-wrap;background:#f4f4f5;padding:16px;border-radius:10px;overflow:auto}</style>
</head>
<body>${body}${sse ? `<script>new EventSource("/api/events").addEventListener("ready",(e)=>{try{if(JSON.parse(e.data).slug===${JSON.stringify(title)})location.reload()}catch{}})</script>` : ""}</body>
</html>
`;

const buildingPage = (slug: string) =>
  page(slug, `<h1>Building…</h1><p class="muted">${slug} is compiling. This page reloads when it's ready.</p>`, true);

const errorPage = (slug: string, message: string) =>
  page(slug, `<h1>Build failed</h1><p class="muted">${slug} could not be built.</p><pre>${message.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!))}</pre>`, true);

export function appHost(cfg: Config): RequestHandler {
  return (req, res, next) => {
    const segments = req.path.split("/").filter(Boolean);
    const slug = segments[0];
    if (!slug || !isValidSlug(slug)) return next();
    if (!fs.existsSync(path.join(cfg.appsDir, slug, "manifest.json"))) return next();

    // Redirect /<slug> -> /<slug>/ so the app's relative asset URLs resolve under the app.
    if (segments.length === 1 && !req.path.endsWith("/")) {
      res.redirect(301, req.path + "/");
      return;
    }

    const state = getBuildState(slug);
    if (state?.status === "error") {
      res.status(200).type("html").send(errorPage(slug, state.message));
      return;
    }

    const outDir = path.resolve(cfg.cacheDir, slug);
    if (!fs.existsSync(path.join(outDir, "index.html"))) {
      res.status(200).type("html").send(buildingPage(slug));
      return;
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(req.path);
    } catch (e) {
      if (e instanceof URIError) { res.status(400).end(); return; }
      throw e;
    }
    const rest = decoded.split("/").filter(Boolean).slice(1).join("/") || "index.html";
    const filePath = path.resolve(outDir, rest);
    if (filePath !== outDir && !filePath.startsWith(outDir + path.sep)) {
      res.status(403).end();
      return;
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.status(404).end();
      return;
    }
    res.sendFile(filePath);
  };
}
```

- [ ] **Step 2: Wire `buildAll` and the new `appHost` into `server.ts`**

Edit `packages/runtime/src/server.ts` — import `buildAll`, pass `cfg` to `appHost`, and kick off the initial build after `listen` (non-blocking, so the server serves building pages meanwhile). Keep the `/_lodekit` static mount (the dashboard still uses `design-system.css`):

```ts
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import type { Config } from "./config.js";
import { apiRouter } from "./routes.js";
import { appHost } from "./appHost.js";
import { startWatcher } from "./watcher.js";
import { buildAll } from "./build.js";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

export function createServer(cfg: Config): express.Express {
  const app = express();
  app.use("/_lodekit", express.static(path.join(PUBLIC, "_lodekit")));
  app.use("/api", apiRouter(cfg));
  app.get("/", (_req, res) => res.sendFile(path.join(PUBLIC, "dashboard", "index.html")));
  app.use(appHost(cfg));
  return app;
}

export function start(cfg: Config): Server {
  const app = createServer(cfg);
  startWatcher(cfg);
  const server = app.listen(cfg.port, () => {
    console.log(`Lodekit running at ${cfg.baseUrl}`);
  });
  void buildAll(cfg);
  return server;
}
```

- [ ] **Step 3: Rewrite `watcher.ts` for debounced rebuilds + SSE**

Replace the entire contents of `packages/runtime/src/watcher.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import type { Config } from "./config.js";
import { broadcast } from "./sse.js";
import { scanApps } from "./registry.js";
import { buildApp, dropBuild } from "./build.js";

const DEBOUNCE_MS = 150;

export function startWatcher(cfg: Config): FSWatcher {
  fs.mkdirSync(cfg.appsDir, { recursive: true });
  const timers = new Map<string, NodeJS.Timeout>();

  const slugOf = (p: string): string | undefined => {
    const rel = path.relative(cfg.appsDir, p);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return undefined;
    return rel.split(path.sep)[0] || undefined;
  };

  const notify = () => broadcast("apps-changed", scanApps(cfg.appsDir));

  const rebuild = (slug: string) => {
    clearTimeout(timers.get(slug));
    timers.set(
      slug,
      setTimeout(() => {
        timers.delete(slug);
        void buildApp(cfg, slug);
      }, DEBOUNCE_MS)
    );
  };

  const onChange = (p: string) => {
    notify();
    const slug = slugOf(p);
    if (slug) rebuild(slug);
  };

  const watcher = chokidar.watch(cfg.appsDir, { ignoreInitial: true, depth: 2 });
  watcher
    .on("add", onChange)
    .on("change", onChange)
    .on("unlink", onChange)
    .on("addDir", onChange)
    .on("unlinkDir", (p) => {
      notify();
      const rel = path.relative(cfg.appsDir, p);
      if (rel && !rel.includes(path.sep)) dropBuild(cfg, rel); // top-level app folder removed
    });
  return watcher;
}
```

- [ ] **Step 4: Rewrite the example apps to the bundled contract**

Delete the buildless files and write the new contract. Expense tracker:

```bash
git rm examples/apps/expense-tracker/app.js examples/apps/habit-tracker/app.js
```

`examples/apps/expense-tracker/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Expense Tracker</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

`examples/apps/expense-tracker/src/main.tsx`:

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

`examples/apps/expense-tracker/src/index.css`:

```css
@import "tailwindcss";
```

`examples/apps/expense-tracker/src/App.tsx`:

```tsx
import { useEffect, useState } from "react";
import { db, store } from "@lodekit/sdk";

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
      <p className="text-gray-500">
        Total: <strong>{currency} {total.toFixed(2)}</strong>
      </p>
      <div className="my-5 flex flex-wrap gap-2">
        <input className="w-28 rounded border border-gray-300 px-2 py-1" type="number" step="0.01"
          placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select className="rounded border border-gray-300 px-2 py-1" value={category}
          onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input className="min-w-36 flex-1 rounded border border-gray-300 px-2 py-1"
          placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="rounded bg-zinc-900 px-4 py-1 text-white" onClick={add}>Add</button>
      </div>
      <table className="w-full text-left text-sm">
        <thead><tr className="text-gray-500"><th>Date</th><th>Category</th><th>Note</th><th>Amount</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-gray-100">
              <td>{r.created_at}</td><td>{r.category}</td><td>{r.note}</td>
              <td>{currency} {r.amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

Habit tracker — `examples/apps/habit-tracker/index.html` (same shape, title "Habit Tracker"):

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Habit Tracker</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

`examples/apps/habit-tracker/src/main.tsx`:

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

`examples/apps/habit-tracker/src/index.css`:

```css
@import "tailwindcss";
```

`examples/apps/habit-tracker/src/App.tsx`:

```tsx
import { useEffect, useState } from "react";
import { db } from "@lodekit/sdk";

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
      <p className="text-gray-500">
        <strong>{habits.length ? `${doneToday} of ${habits.length} done today` : "No habits yet"}</strong>
      </p>
      <div className="my-5 flex flex-wrap gap-2">
        <input className="w-16 rounded border border-gray-300 px-2 py-1" placeholder="🎯" maxLength={2}
          value={icon} onChange={(e) => setIcon(e.target.value)} />
        <input className="min-w-40 flex-1 rounded border border-gray-300 px-2 py-1" placeholder="New habit (e.g. Meditate)"
          value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="rounded bg-zinc-900 px-4 py-1 text-white" onClick={add}>Add</button>
      </div>
      <div className="grid gap-3">
        {habits.map((h) => {
          const days = byHabit.get(h.id) ?? [];
          const done = days.includes(today());
          const s = streak(days);
          return (
            <div key={h.id} className="flex items-center justify-between rounded border border-gray-200 p-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">{h.icon || "✅"}</span>
                <div>
                  <div><strong>{h.name}</strong></div>
                  <div className="text-gray-500">{s > 0 ? `🔥 ${s} ${s === 1 ? "day" : "days"}` : "No streak yet"}</div>
                </div>
              </div>
              <button className={`rounded bg-zinc-900 px-4 py-1 text-white ${done ? "opacity-60" : ""}`}
                onClick={() => toggle(h.id, done)}>{done ? "Undo" : "Done"}</button>
            </div>
          );
        })}
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Delete the retired injected SDK global**

```bash
git rm packages/runtime/public/_lodekit/sdk.js
```

- [ ] **Step 6: Rewrite `appHost.test.ts` against built output**

Replace the entire contents of `packages/runtime/tests/appHost.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";
import { buildApp, dropBuild } from "../src/build.js";
import type { Config } from "../src/config.js";

let root: string, cache: string, cfg: Config, server: Server, base: string;

function writeApp(slug: string, appTsx: string) {
  const src = path.join(root, "apps", slug, "src");
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(root, "apps", slug, "manifest.json"), JSON.stringify({ name: slug, slug }));
  fs.writeFileSync(
    path.join(root, "apps", slug, "index.html"),
    `<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`
  );
  fs.writeFileSync(path.join(src, "main.tsx"),
    `import { createRoot } from "react-dom/client";\nimport App from "./App";\ncreateRoot(document.getElementById("root")!).render(<App />);\n`);
  fs.writeFileSync(path.join(src, "App.tsx"), appTsx);
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-root-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-cache-"));
  cfg = {
    root, appsDir: path.join(root, "apps"), dataDir: path.join(root, "data"),
    cacheDir: cache, port: 0, baseUrl: "http://lodekit.localhost:0",
  };
  await new Promise<void>((r) => { server = createServer(cfg).listen(0, () => r()); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterEach(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
});

describe("appHost", () => {
  it("serves the built index.html and a hashed asset once built", async () => {
    writeApp("built", `export default function App() { return <h1>hello built</h1>; }`);
    await buildApp(cfg, "built");
    const html = await (await fetch(base + "/built/")).text();
    expect(html).toContain("<div id=\"root\">");
    expect(html).toContain("/assets/");
    expect(html).not.toContain("/_lodekit/sdk.js");
    const assetMatch = html.match(/\/assets\/[\w.-]+\.js/);
    expect(assetMatch).toBeTruthy();
    expect((await fetch(base + "/built" + assetMatch![0])).status).toBe(200);
  }, 30000);

  it("redirects /<slug> to /<slug>/", async () => {
    writeApp("redir", `export default function App() { return <h1>r</h1>; }`);
    await buildApp(cfg, "redir");
    const res = await fetch(base + "/redir", { redirect: "manual" });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/redir/");
  }, 30000);

  it("serves a building page when there is no built output yet", async () => {
    writeApp("pending", `export default function App() { return <h1>p</h1>; }`);
    const html = await (await fetch(base + "/pending/")).text();
    expect(html).toContain("Building");
  });

  it("serves a build-failed page when the app is in error state", async () => {
    writeApp("bad", `export default function App() { return <h1>x</h1>  // missing brace\n`);
    await buildApp(cfg, "bad");
    const res = await fetch(base + "/bad/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Build failed");
  }, 30000);

  it("blocks path traversal out of the cache dir", async () => {
    writeApp("safe", `export default function App() { return <h1>s</h1>; }`);
    await buildApp(cfg, "safe");
    expect((await fetch(base + "/safe/..%2f..%2fpackage.json")).status).toBe(403);
    dropBuild(cfg, "safe");
  }, 30000);
});
```

- [ ] **Step 7: Update `assets.test.ts` (drop the retired sdk.js assertion)**

In `packages/runtime/tests/assets.test.ts`, delete the entire `it("serves the sdk and exposes window.lodekit", …)` test. Keep the `it("serves the design system css", …)` test unchanged (the dashboard still uses it).

- [ ] **Step 8: Rewrite `watcher.test.ts` for build events**

Replace the entire contents of `packages/runtime/tests/watcher.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { start } from "../src/server.js";
import { loadConfig } from "../src/config.js";

let root: string, cache: string, server: Server, base: string;

async function collectEvents(base: string, until: string, timeoutMs: number): Promise<string> {
  const res = await fetch(base + "/api/events");
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value);
    if (buf.includes(until)) break;
  }
  await reader.cancel();
  return buf;
}

function writeApp(slug: string, appTsx: string) {
  const src = path.join(root, "apps", slug, "src");
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(root, "apps", slug, "manifest.json"), JSON.stringify({ name: slug, slug }));
  fs.writeFileSync(path.join(root, "apps", slug, "index.html"),
    `<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`);
  fs.writeFileSync(path.join(src, "main.tsx"),
    `import { createRoot } from "react-dom/client";\nimport App from "./App";\ncreateRoot(document.getElementById("root")!).render(<App />);\n`);
  fs.writeFileSync(path.join(src, "App.tsx"), appTsx);
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-root-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-cache-"));
  process.env.LODEKIT_ROOT = root;
  process.env.LODEKIT_CACHE_DIR = cache;
  process.env.LODEKIT_PORT = "0";
  server = start(loadConfig());
  await new Promise<void>((r) => server.once("listening", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterEach(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
  delete process.env.LODEKIT_ROOT;
  delete process.env.LODEKIT_CACHE_DIR;
  delete process.env.LODEKIT_PORT;
});

describe("watcher", () => {
  it("emits building then ready when a valid app appears", async () => {
    const done = collectEvents(base, '"slug":"wgood"', 30000);
    // give the SSE reader a tick to attach before writing files
    await new Promise((r) => setTimeout(r, 100));
    writeApp("wgood", `export default function App() { return <h1>ok</h1>; }`);
    const buf = await done;
    expect(buf).toContain("event: building");
    // wait for the ready event specifically
    const ready = await collectEvents(base, "event: ready", 30000);
    expect(ready).toContain("event: ready");
  }, 40000);

  it("emits an error event for a broken app", async () => {
    await new Promise((r) => setTimeout(r, 100));
    writeApp("wbad", `export default function App() { return <h1>x</h1>  // missing brace\n`);
    const buf = await collectEvents(base, "event: error", 30000);
    expect(buf).toContain("event: error");
  }, 40000);
});
```

- [ ] **Step 9: Rewrite `e2e.test.ts` for the bundled contract**

Replace the entire contents of `packages/runtime/tests/e2e.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import { start } from "../src/server.js";
import { loadConfig } from "../src/config.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

let root: string, cache: string, server: Server, base: string;

function copyDir(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

async function waitReady(base: string, slug: string, timeoutMs: number) {
  const res = await fetch(base + "/api/events");
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value);
    if (buf.includes("event: ready") && buf.includes(`"slug":"${slug}"`)) break;
  }
  await reader.cancel();
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-root-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-cache-"));
  copyDir(
    path.join(__dirname, "../../../examples/apps/expense-tracker"),
    path.join(root, "apps", "expense-tracker")
  );
  process.env.LODEKIT_ROOT = root;
  process.env.LODEKIT_CACHE_DIR = cache;
  process.env.LODEKIT_PORT = "0";
  server = start(loadConfig());
  await new Promise<void>((r) => server.once("listening", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  await waitReady(base, "expense-tracker", 40000);
});
afterEach(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
  delete process.env.LODEKIT_ROOT;
  delete process.env.LODEKIT_CACHE_DIR;
  delete process.env.LODEKIT_PORT;
});

describe("expense tracker e2e (bundled)", () => {
  it("serves the bundled index.html and a hashed asset", async () => {
    const list = await (await fetch(base + "/api/apps")).json();
    expect(list.map((a: { slug: string }) => a.slug)).toContain("expense-tracker");
    const html = await (await fetch(base + "/expense-tracker/")).text();
    expect(html).toContain("<div id=\"root\">");
    const asset = html.match(/\/assets\/[\w.-]+\.js/);
    expect(asset).toBeTruthy();
    expect((await fetch(base + "/expense-tracker" + asset![0])).status).toBe(200);
  }, 45000);

  it("round-trips an expense through the API", async () => {
    await fetch(base + "/api/apps/expense-tracker/db/exec", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY, amount REAL, category TEXT, note TEXT, created_at TEXT)" }),
    });
    await fetch(base + "/api/apps/expense-tracker/db/exec", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "INSERT INTO expenses (amount, category, note, created_at) VALUES (?,?,?,?)", params: [12.5, "food", "lunch", "2026-06-30"] }),
    });
    const q = await (await fetch(base + "/api/apps/expense-tracker/db/query", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "SELECT SUM(amount) AS total FROM expenses" }),
    })).json();
    expect(q.rows[0].total).toBe(12.5);
  }, 45000);
});
```

- [ ] **Step 10: Run the full runtime suite**

Run: `pnpm --filter @lodekit/runtime test`
Expected: PASS — appHost serves built output + building/error pages; watcher emits `building`/`ready`/`error`; e2e builds and serves the migrated expense tracker and round-trips the DB. (`api.test.ts`, `db.test.ts`, `registry.test.ts`, `scaffold.test.ts`, `config.test.ts`, `build.test.ts`, `mcp.test.ts` remain green.)

- [ ] **Step 11: Commit**

```bash
git add packages/runtime examples/apps
git commit -m "feat(runtime): cut over to Vite-built app contract; migrate example apps"
```

---

### Task 6: Dashboard per-app build state

Show each app's build state (`building` / `ready` / `error`) driven off the SSE stream, alongside the existing live grid.

**Files:**
- Modify: `packages/runtime/public/dashboard/index.html`
- Test: `packages/runtime/tests/dashboard.test.ts`

**Interfaces:**
- Consumes: SSE events `building`/`ready`/`error` (payload `{ slug }`, plus `message` on error) and `apps-changed`, from the runtime.

- [ ] **Step 1: Write the failing test**

Replace the second `it(…)` in `packages/runtime/tests/dashboard.test.ts` with one that also asserts build-state wiring:

```ts
  it("subscribes to live updates, build state, and has an empty state", () => {
    expect(html).toContain("/api/events");
    expect(html).toContain("Ask Claude to build a tool with Lodekit");
    expect(html).toContain("building");
    expect(html).toContain("ready");
    expect(html).toContain("error");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @lodekit/runtime test dashboard`
Expected: FAIL — the dashboard html does not yet reference `building`/`ready`/`error`.

- [ ] **Step 3: Add build-state rendering to the dashboard**

Edit `packages/runtime/public/dashboard/index.html`. In the card markup inside the `for` loop, add a status element (insert after the description `<div>`):

```js
          '<div class="lk-muted" style="font-size:12px" id="status-' + a.slug + '">' + statusText(a.slug) + "</div>" +
```

Then add, before `render();`, a state map + helpers, and after the existing `es.addEventListener("apps-changed", render);` line, the build-state listeners:

```js
    const states = {};
    function statusText(slug) {
      const s = states[slug];
      if (!s) return "";
      if (s.status === "building") return "building…";
      if (s.status === "ready") return "ready";
      return "error: " + (s.message || "");
    }
    function applyState(slug) {
      const el = document.getElementById("status-" + slug);
      if (el) el.textContent = statusText(slug);
    }
    for (const ev of ["building", "ready", "error"]) {
      es.addEventListener(ev, (e) => {
        const d = JSON.parse(e.data);
        states[d.slug] = { status: ev, message: d.message };
        applyState(d.slug);
      });
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @lodekit/runtime test dashboard`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/public/dashboard/index.html packages/runtime/tests/dashboard.test.ts
git commit -m "feat(dashboard): show per-app build state over SSE"
```

---

### Task 7: Scaffold the new contract

`scaffoldApp` writes the bundled contract: `manifest.json` + `index.html` (Vite entry) + `src/main.tsx` (React root) + `src/App.tsx` (imports `@lodekit/sdk`) + `src/index.css` (Tailwind). The old `index.html` + `app.js` globals stub is removed. The MCP `lodekit_scaffold` tool needs no change — it POSTs to `/api/apps`, which calls this function.

**Files:**
- Modify: `packages/runtime/src/scaffold.ts`
- Test: `packages/runtime/tests/scaffold.test.ts`

**Interfaces:**
- Consumes: `Config`, `ScaffoldInput { slug, name, description?, icon? }` (unchanged).
- Produces: `scaffoldApp(cfg, input)` returns `{ slug, appDir, url, files: ["manifest.json", "index.html", "src/main.tsx", "src/App.tsx", "src/index.css"] }`.

- [ ] **Step 1: Rewrite the scaffold tests**

Replace the two `it(…)` blocks in `packages/runtime/tests/scaffold.test.ts`:

```ts
  it("creates the bundled contract and returns the app url", () => {
    const out = scaffoldApp(cfg, { slug: "notes", name: "Notes", description: "Jot things" });
    const d = path.join(cfg.appsDir, "notes");
    expect(out.url).toBe("http://lodekit.localhost:7777/notes");
    expect(out.files).toEqual(["manifest.json", "index.html", "src/main.tsx", "src/App.tsx", "src/index.css"]);
    const manifest = JSON.parse(fs.readFileSync(path.join(d, "manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ name: "Notes", slug: "notes", icon: "📦", description: "Jot things" });
    expect(fs.readFileSync(path.join(d, "index.html"), "utf8")).toContain('src="/src/main.tsx"');
    expect(fs.readFileSync(path.join(d, "src", "main.tsx"), "utf8")).toContain("createRoot");
    expect(fs.readFileSync(path.join(d, "src", "App.tsx"), "utf8")).toContain('from "@lodekit/sdk"');
    expect(fs.readFileSync(path.join(d, "src", "index.css"), "utf8")).toContain("tailwindcss");
  });

  it("does not overwrite an existing App.tsx", () => {
    const src = path.join(cfg.appsDir, "keep", "src");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, "App.tsx"), "ORIGINAL");
    scaffoldApp(cfg, { slug: "keep", name: "Keep" });
    expect(fs.readFileSync(path.join(src, "App.tsx"), "utf8")).toBe("ORIGINAL");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @lodekit/runtime test scaffold`
Expected: FAIL — the scaffold still writes `app.js` and `files` still lists the old set.

- [ ] **Step 3: Rewrite `scaffold.ts`**

Replace the entire contents of `packages/runtime/src/scaffold.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import type { Config } from "./config.js";

export interface ScaffoldInput {
  slug: string;
  name: string;
  description?: string;
  icon?: string;
}

const indexHtml = (name: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name}</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
`;

const mainTsx = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
`;

const appTsx = (name: string) => `import { db, store } from "@lodekit/sdk";

export default function App() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">${name}</h1>
      <p className="text-gray-500">Edit src/App.tsx to build this tool.</p>
    </main>
  );
}
`;

const indexCss = `@import "tailwindcss";
`;

function writeIfAbsent(filePath: string, contents: string): void {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, contents);
}

export function scaffoldApp(cfg: Config, input: ScaffoldInput) {
  const appDir = path.join(cfg.appsDir, input.slug);
  const srcDir = path.join(appDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  const manifest = {
    name: input.name,
    slug: input.slug,
    icon: input.icon ?? "📦",
    description: input.description ?? "",
  };
  fs.writeFileSync(path.join(appDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  writeIfAbsent(path.join(appDir, "index.html"), indexHtml(manifest.name));
  writeIfAbsent(path.join(srcDir, "main.tsx"), mainTsx);
  writeIfAbsent(path.join(srcDir, "App.tsx"), appTsx(manifest.name));
  writeIfAbsent(path.join(srcDir, "index.css"), indexCss);
  return {
    slug: input.slug,
    appDir,
    url: `${cfg.baseUrl}/${input.slug}`,
    files: ["manifest.json", "index.html", "src/main.tsx", "src/App.tsx", "src/index.css"],
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime test scaffold`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/scaffold.ts packages/runtime/tests/scaffold.test.ts
git commit -m "feat(scaffold): write the bundled React/TS app contract"
```

---

### Task 8: Full verification + roadmap update

Prove the end-to-end acceptance criteria from spec §10 and record the deferred items from spec §11.

**Files:**
- Modify: `roadmap.md`

- [ ] **Step 1: Clean install proves the workspace resolves**

Run: `pnpm install`
Expected: resolves cleanly, including `packages/sdk` and the runtime's toolchain deps. (If Node was switched: `pnpm rebuild better-sqlite3`.)

- [ ] **Step 2: Run every package's test suite**

Run: `pnpm -r test`
Expected: PASS — `@lodekit/sdk` (6) and `@lodekit/runtime` (build/appHost/watcher/e2e + migrated suites) all green.

- [ ] **Step 3: Manually verify dev end-to-end**

Run: `pnpm dev`
Then, in a browser at `http://lodekit.localhost:7777`:
- Both example apps appear in the grid and show `ready`.
- Open `/expense-tracker/`, add an expense, reload → it persists.
- Open `/habit-tracker/`, add a habit and check it in, reload → the streak persists.
- Edit `examples/apps/expense-tracker/src/App.tsx` (e.g. change the heading) → the dashboard shows `building…` then `ready`; reload the app shows the change.
- Introduce a syntax error in that file → the dashboard shows `error: …` and `/expense-tracker/` serves the "Build failed" page. Revert the error → back to `ready`.

Confirm: no `node_modules` or `package.json` under `examples/apps/`; built output exists only under the repo-root `.cache/` (outside `LODEKIT_ROOT`).

Stop the dev server when done.

- [ ] **Step 4: Append the roadmap additions from spec §11**

Add to `roadmap.md`, under the appropriate sections, the items the spec deferred. Under "Next major step" (or a new subsection), append:

```markdown
- **tRPC + Zod** — reconsider as the SDK↔runtime transport/validation layer once an
  app-facing *procedure* surface (integrations, jobs) exists to make end-to-end typing pay off.
- **Per-app type-checking** — gate builds (or surface warnings) via `tsc`; the build slice
  transpiles without type-checking.
- **Persistence, per-app (inside the data folder):** blob storage, real encrypted secrets,
  cache with TTLs, schemas/migrations, and data initialization/fixtures.
- **Integrations** — gateways, outbound connections, rate limiting.
- **Workflows** — job queue, durable execution, scheduler/poller.
- **Settings** — apps register settings surfaced and editable in the dashboard.
- **Business-logic structure** — app-folder conventions that keep app logic from sprawling.
```

(`@lodekit/ui` and TanStack are already tracked under "Next major step"; leave them as-is.)

- [ ] **Step 5: Commit**

```bash
git add roadmap.md
git commit -m "docs: record build-pipeline follow-ups on the roadmap"
```

---

## Self-Review notes (for the executor)

- **`resolve.alias` to package directories:** `build.ts` aliases `react`, `react-dom`, and `@lodekit/sdk` to their package directories (via `require.resolve(".../package.json")`). This is the standard Vite recipe for "use this copy," and subpaths (`react-dom/client`, `react/jsx-runtime`) resolve through each package's `exports`. If a subpath fails to resolve in practice, add explicit alias entries for the exact ids.
- **Build-state map is a module singleton** (like the SSE client set). Tests use unique slugs per case so stale `error` state never leaks; `appHost` reads the filesystem for `ready`/`building` and only relies on in-memory state for `error`.
- **Build timing:** Vite builds take a few seconds; tests that build set 30–45s timeouts. `start()` kicks `buildAll` *after* `listen` (non-blocking), so boot is instant and apps serve building pages until ready.
- **`@lodekit/sdk` main → `src/index.ts`:** the SDK is buildless; Vite/esbuild transpiles the raw TS into each app's bundle and types flow from source.
- **Dashboard `design-system.css` is retained** — only the injection of `sdk.js` into apps is removed. If you prefer to fully retire `/_lodekit`, that is a separate, larger change (relocating the dashboard's own styles) and is out of scope here.
```
