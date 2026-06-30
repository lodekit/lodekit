# Monorepo Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the single-package Lodekit POC into a pnpm-workspace monorepo with `packages/{runtime,mcp,skill}`, a non-workspace `examples/` tree, and two live shells (`web/` Astro landing, `desktop/` Electron Forge), preserving all POC behavior.

**Architecture:** Existing code moves into scoped `@lodekit/*` packages under `packages/`. The runtime stays buildless (`tsx`) and is decoupled from the MCP (HTTP) — the only intra-workspace runtime edge is `desktop → runtime`, and desktop spawns the runtime as a **child Node process** (so `better-sqlite3` never loads inside Electron). Sample apps become a self-contained Lodekit root under `examples/`, served via `LODEKIT_ROOT=./examples`.

**Tech Stack:** pnpm workspaces, TypeScript (NodeNext, strict), tsx, vitest, Express, better-sqlite3, chokidar, Astro, Electron Forge.

**Reference spec:** `docs/specs/2026-06-30-monorepo-migration-design.md`

## Global Constraints

- **Package manager:** pnpm. Remove `package-lock.json`; commit `pnpm-lock.yaml`.
- **Scope/naming:** all packages named `@lodekit/*`, all `private: true`.
- **TS config:** `tsconfig.base.json` carries `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`, `strict: true`, `esModuleInterop: true`, `skipLibCheck: true`, `noEmit: true`. Each package's `tsconfig.json` extends it.
- **Workspace membership:** `packages/*`, `web`, `desktop`. **`examples` is NOT a workspace member** (no `node_modules` under it, ever).
- **Decoupling:** `@lodekit/mcp` MUST NOT declare a dependency on `@lodekit/runtime`.
- **Buildless dev:** runtime and MCP run via `tsx`; no build step is added this pass.
- **No behavior changes:** this is a structural migration. No runtime feature, endpoint, or contract changes ride along.
- **Commits:** trunk-based to `master`; no `Co-Authored-By` trailers.

---

### Task 1: pnpm workspace root + `@lodekit/runtime`

Establish the workspace and move the server into `packages/runtime`. This is the foundation task — the workspace needs at least one package, and the shared tsconfig lands here.

**Files:**
- Create: `pnpm-workspace.yaml`, `tsconfig.base.json`, `packages/runtime/package.json`, `packages/runtime/tsconfig.json`
- Modify: root `package.json` (becomes workspace root), `.gitignore`
- Move: `src/` → `packages/runtime/src/`, `public/` → `packages/runtime/public/`, `vitest.config.ts` → `packages/runtime/vitest.config.ts`, and all tests except `mcp.test.ts` → `packages/runtime/tests/`
- Delete: `package-lock.json`, root `tsconfig.json` (replaced by `tsconfig.base.json` + per-package)

**Interfaces:**
- Produces: workspace name `@lodekit/runtime` with scripts `start` (`tsx src/index.ts`) and `test` (`vitest run`); shared `tsconfig.base.json` at repo root for other packages to extend.

- [ ] **Step 1: Move runtime source, public assets, and tests with git**

```bash
mkdir -p packages/runtime/tests
git mv src packages/runtime/src
git mv public packages/runtime/public
git mv vitest.config.ts packages/runtime/vitest.config.ts
for f in api appHost assets config dashboard db e2e registry scaffold watcher; do
  git mv "tests/$f.test.ts" "packages/runtime/tests/$f.test.ts"
done
```

(`tests/mcp.test.ts` is intentionally left behind for Task 2.)

- [ ] **Step 2: Create the shared TypeScript base config**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true
  }
}
```

- [ ] **Step 3: Create the runtime package manifest and tsconfig**

Create `packages/runtime/package.json`:

```json
{
  "name": "@lodekit/runtime",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "better-sqlite3": "^11.8.1",
    "chokidar": "^4.0.3",
    "express": "^4.21.2",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/express": "^4.17.21",
    "@types/node": "^22.10.5",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3",
    "vitest": "^3.0.0"
  }
}
```

Create `packages/runtime/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: Create workspace manifest and convert root package.json**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - 'web'
  - 'desktop'
```

Replace root `package.json` with the workspace-root version:

```json
{
  "name": "lodekit-monorepo",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "LODEKIT_ROOT=./examples pnpm --filter @lodekit/runtime start",
    "mcp": "pnpm --filter @lodekit/mcp start",
    "test": "pnpm -r test"
  }
}
```

Delete the now-replaced root tsconfig and npm lockfile:

```bash
git rm tsconfig.json package-lock.json
```

- [ ] **Step 5: Update `.gitignore`**

Add these lines to `.gitignore` (keep existing entries):

```
.DS_Store
data/
examples/data/
desktop/out/
desktop/.vite/
pnpm-debug.log*
```

- [ ] **Step 6: Install with pnpm and run the runtime test suite**

Run:

```bash
pnpm install
pnpm --filter @lodekit/runtime test
```

Expected: pnpm creates `pnpm-lock.yaml` and links `@lodekit/runtime`; vitest runs the 10 moved test files and all pass (same suite as before the move — `e2e`, `api`, `db`, `watcher`, etc.).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: pnpm workspace + move server to @lodekit/runtime"
```

---

### Task 2: `@lodekit/mcp`

Move the MCP server into its own package, with its own test. No dependency on the runtime (HTTP-only coupling).

**Files:**
- Create: `packages/mcp/package.json`, `packages/mcp/tsconfig.json`
- Move: `mcp/` → `packages/mcp/` (contains `index.ts`, `README.md`), `tests/mcp.test.ts` → `packages/mcp/tests/mcp.test.ts`
- Delete: empty `tests/` directory

**Interfaces:**
- Consumes: nothing from other workspace packages (talks to a running server via `LODEKIT_BASE_URL`).
- Produces: workspace name `@lodekit/mcp` with scripts `start` (`tsx index.ts`) and `test` (`vitest run`).

- [ ] **Step 1: Move the MCP source and its test**

```bash
git mv mcp packages/mcp
mkdir -p packages/mcp/tests
git mv tests/mcp.test.ts packages/mcp/tests/mcp.test.ts
rmdir tests
```

- [ ] **Step 2: Check the moved test's import paths**

Open `packages/mcp/tests/mcp.test.ts`. It previously imported from `../mcp/index.ts` (test in `tests/`, source in `mcp/`). Now both sit under `packages/mcp/`, so the import becomes `../index.ts`. Update the import specifier accordingly (e.g. change `from "../mcp/index.js"` to `from "../index.js"`). If the test imported via a different relative depth, adjust to point at `packages/mcp/index.ts`.

- [ ] **Step 3: Create the MCP package manifest and tsconfig**

Create `packages/mcp/package.json`:

```json
{
  "name": "@lodekit/mcp",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.5",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3",
    "vitest": "^3.0.0"
  }
}
```

Create `packages/mcp/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["index.ts", "tests"]
}
```

- [ ] **Step 4: Install and run the MCP test**

Run:

```bash
pnpm install
pnpm --filter @lodekit/mcp test
```

Expected: `@lodekit/mcp` links; `mcp.test.ts` passes at its new path with the corrected import.

- [ ] **Step 5: Verify the decoupling constraint**

Run:

```bash
grep -r "@lodekit/runtime" packages/mcp/package.json
```

Expected: no output (the MCP must not depend on the runtime).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move MCP server to @lodekit/mcp"
```

---

### Task 3: `@lodekit/skill`

Move the Claude skill into a content-only workspace package.

**Files:**
- Create: `packages/skill/package.json`
- Move: `skill/SKILL.md` → `packages/skill/SKILL.md`
- Delete: empty `skill/` directory

**Interfaces:**
- Produces: workspace name `@lodekit/skill` (content only; no scripts, no build).

- [ ] **Step 1: Move the skill content**

```bash
mkdir -p packages/skill
git mv skill/SKILL.md packages/skill/SKILL.md
rmdir skill
```

- [ ] **Step 2: Create the skill package manifest**

Create `packages/skill/package.json`:

```json
{
  "name": "@lodekit/skill",
  "version": "0.0.1",
  "private": true
}
```

- [ ] **Step 3: Verify the workspace recognizes all three packages**

Run:

```bash
pnpm install
pnpm -r list --depth -1 2>/dev/null | grep -E "@lodekit/(runtime|mcp|skill)"
```

Expected: all three of `@lodekit/runtime`, `@lodekit/mcp`, `@lodekit/skill` are listed as workspace projects.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: move Claude skill to @lodekit/skill"
```

---

### Task 4: Relocate sample apps to `examples/` as a Lodekit root

Move the two sample apps so the runtime serves them from a self-contained example root, decoupling the repo root from being a Lodekit data root.

**Files:**
- Move: `apps/` → `examples/apps/`
- Move (if present): `data/` → `examples/data/` (gitignored content; only move tracked files)
- Create: `examples/.gitignore`

**Interfaces:**
- Consumes: `@lodekit/runtime`'s `LODEKIT_ROOT` env (set to `./examples` by the root `dev` script from Task 1).
- Produces: a Lodekit root at `examples/` with `examples/apps/{expense-tracker,habit-tracker}/`.

- [ ] **Step 1: Move the sample apps**

```bash
mkdir -p examples
git mv apps examples/apps
```

- [ ] **Step 2: Handle the data directory**

`data/` is runtime-generated and gitignored (Task 1 added `data/` and `examples/data/`). Remove any stray root `data/` so the runtime regenerates it under `examples/`:

```bash
rm -rf data
```

Create `examples/.gitignore` (belt-and-suspenders so example DBs never get committed):

```
data/
```

- [ ] **Step 3: Start the runtime against the example root and verify both apps register**

In one terminal:

```bash
pnpm dev
```

Expected log: `Lodekit running at http://lodekit.localhost:7777`.

In a second terminal, query the registry:

```bash
curl -s http://127.0.0.1:7777/api/apps
```

Expected: a JSON array containing entries with `"slug":"expense-tracker"` and `"slug":"habit-tracker"`. Stop the dev server (Ctrl-C) when confirmed.

- [ ] **Step 4: Verify an expense round-trips against the relocated app**

With `pnpm dev` running, exercise both storage paths through the API (proves `examples/data/` provisions correctly):

```bash
curl -s -X POST http://127.0.0.1:7777/api/apps/expense-tracker/db/exec \
  -H 'Content-Type: application/json' \
  -d '{"sql":"CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY, amount REAL, category TEXT, note TEXT, created_at TEXT)"}'
curl -s -X POST http://127.0.0.1:7777/api/apps/expense-tracker/db/exec \
  -H 'Content-Type: application/json' \
  -d '{"sql":"INSERT INTO expenses (amount, category) VALUES (?, ?)","params":[9.5,"coffee"]}'
curl -s -X POST http://127.0.0.1:7777/api/apps/expense-tracker/db/query \
  -H 'Content-Type: application/json' \
  -d '{"sql":"SELECT amount, category FROM expenses"}'
```

Expected: the final query returns `{"rows":[{"amount":9.5,"category":"coffee"}]}`. Confirm `examples/data/expense-tracker/db.sqlite` now exists. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: relocate sample apps to examples/ Lodekit root"
```

---

### Task 5: `web/` — Astro landing placeholder

Stand up a running Astro site as the third deliverable.

**Files:**
- Create: `web/package.json`, `web/astro.config.mjs`, `web/tsconfig.json`, `web/src/pages/index.astro`

**Interfaces:**
- Produces: workspace name `@lodekit/web` with scripts `dev` and `build` (Astro).

- [ ] **Step 1: Create the Astro package manifest**

Create `web/package.json`:

```json
{
  "name": "@lodekit/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview"
  },
  "dependencies": {
    "astro": "^4.16.0"
  }
}
```

- [ ] **Step 2: Create the Astro config and tsconfig**

Create `web/astro.config.mjs`:

```js
import { defineConfig } from "astro/config";

export default defineConfig({});
```

Create `web/tsconfig.json`:

```json
{
  "extends": "astro/tsconfigs/strict"
}
```

- [ ] **Step 3: Create the landing placeholder page**

Create `web/src/pages/index.astro`:

```astro
---
const tagline = "Build small local apps on a unified stack — no build tooling to manage.";
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lodekit</title>
  </head>
  <body>
    <main>
      <h1>Lodekit</h1>
      <p>{tagline}</p>
    </main>
  </body>
</html>
```

- [ ] **Step 4: Install and build the site**

Run:

```bash
pnpm install
pnpm --filter @lodekit/web build
```

Expected: `@lodekit/web` links; Astro builds with no errors and emits `web/dist/index.html`.

- [ ] **Step 5: Verify the dev server renders**

Run:

```bash
pnpm --filter @lodekit/web dev
```

Expected: Astro serves on its dev port (printed in output); opening it shows the "Lodekit" heading and tagline. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: web/ Astro landing placeholder"
```

---

### Task 6: `desktop/` — Electron Forge shell

Stand up an Electron Forge app whose main process spawns the runtime as a child Node process and opens a window at the dashboard.

**Files:**
- Create: `desktop/package.json`, `desktop/forge.config.js`, `desktop/src/main.js`

**Interfaces:**
- Consumes: a running `@lodekit/runtime` started via `pnpm --filter @lodekit/runtime start` with `LODEKIT_ROOT` set to the repo's `examples/`.
- Produces: workspace name `@lodekit/desktop` with a `start` script (`electron-forge start`).

- [ ] **Step 1: Create the desktop package manifest**

Create `desktop/package.json`:

```json
{
  "name": "@lodekit/desktop",
  "version": "0.0.1",
  "private": true,
  "main": "src/main.js",
  "scripts": {
    "start": "electron-forge start"
  },
  "dependencies": {
    "@lodekit/runtime": "workspace:*"
  },
  "devDependencies": {
    "@electron-forge/cli": "^7.6.0",
    "electron": "^33.2.0"
  }
}
```

(The `@lodekit/runtime` workspace dependency records the dependency-graph edge and guarantees install ordering. The dev shell launches the runtime via `pnpm` rather than importing it, so `better-sqlite3` loads in the child's Node, never inside Electron — per spec §8.)

- [ ] **Step 2: Create the Forge config**

Create `desktop/forge.config.js`:

```js
module.exports = {
  packagerConfig: {},
  makers: [],
};
```

- [ ] **Step 3: Write the main process — spawn runtime, wait for ready, open window**

Create `desktop/src/main.js`:

```js
const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const PORT = 7777;
const DASHBOARD_URL = `http://lodekit.localhost:${PORT}`;
const REPO_ROOT = path.resolve(__dirname, "..", "..");

let runtime;

function startRuntime() {
  runtime = spawn(
    "pnpm",
    ["--filter", "@lodekit/runtime", "start"],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, LODEKIT_ROOT: path.join(REPO_ROOT, "examples") },
      stdio: "inherit",
    }
  );
  runtime.on("error", (err) => {
    console.error("Failed to start runtime. Is Node/pnpm on PATH?", err);
    app.quit();
  });
}

function waitForServer(retries = 50) {
  return new Promise((resolve, reject) => {
    const attempt = (left) => {
      const req = http.get(
        { host: "127.0.0.1", port: PORT, path: "/api/apps" },
        (res) => {
          res.resume();
          resolve();
        }
      );
      req.on("error", () => {
        if (left <= 0) return reject(new Error("runtime did not become ready"));
        setTimeout(() => attempt(left - 1), 200);
      });
    };
    attempt(retries);
  });
}

async function createWindow() {
  const win = new BrowserWindow({ width: 1100, height: 800 });
  await waitForServer();
  win.loadURL(DASHBOARD_URL);
}

app.whenReady().then(() => {
  startRuntime();
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("quit", () => {
  if (runtime) runtime.kill();
});
```

(Readiness is polled against `127.0.0.1` — Node doesn't resolve `*.localhost` — while the window loads `lodekit.localhost`, which Chromium resolves to loopback. The child is killed on `quit` so no orphan server survives.)

- [ ] **Step 4: Install dependencies**

Run:

```bash
pnpm install
```

Expected: `@lodekit/desktop` links with Electron and Forge installed; `@lodekit/runtime` resolves via `workspace:*`.

- [ ] **Step 5: Launch the shell and verify it serves a sample app (manual)**

Run:

```bash
pnpm --filter @lodekit/desktop start
```

Expected: Electron Forge boots, the runtime child logs `Lodekit running at http://lodekit.localhost:7777`, and the window displays the Lodekit dashboard listing both sample apps. Clicking `expense-tracker` opens the working app. Close the window; confirm the terminal shows the runtime child exited (no orphaned process on port 7777 — verify with `lsof -i :7777` returning nothing).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: desktop/ Electron Forge shell spawning the runtime"
```

---

## Self-Review

**Spec coverage:**
- §3 target layout → Tasks 1–6 create every directory (`packages/{runtime,mcp,skill}`, `web/`, `desktop/`, `examples/`). ✓
- §4 workspace wiring (pnpm globs, `examples` excluded, `@lodekit/*` private, MCP-not-depending-on-runtime, shared tsconfig) → Task 1 Steps 2/4/5, Task 2 Step 5, `pnpm-workspace.yaml`. ✓
- §5 package migrations → Tasks 1, 2, 3, 4 one-to-one. ✓
- §6 build/run model (root scripts, co-located tests, `pnpm -r test`) → Task 1 Step 4 scripts; tests moved with their packages. ✓
- §8/§9 desktop child-process spawn + better-sqlite3 mitigation → Task 6 Step 3 (spawn via pnpm, ready-poll, kill-on-quit). ✓
- §10 verification (1 install, 2 `-r test`, 3 examples served + round-trip, 4 web renders, 5 desktop boots) → Task 1 Step 6, Task 4 Steps 3–4, Task 5 Step 5, Task 6 Step 5. ✓
- §7 deferred subsystems → correctly absent from this plan (no sdk/ui/vite/starlight/packaging tasks). ✓

**Placeholder scan:** No TBD/TODO; every package manifest, config, and source file is given in full; every verification step has an exact command and expected output. ✓

**Type/name consistency:** Package names `@lodekit/{runtime,mcp,skill,web,desktop}` are identical across `pnpm-workspace.yaml`, manifests, filter commands, and the `workspace:*` dep. Port `7777`, `LODEKIT_ROOT=./examples`, and `/api/apps` are consistent across Tasks 4 and 6. ✓

**Note for executor:** dependency versions (Astro `^4.16.0`, Electron `^33.2.0`, Forge `^7.6.0`) are floors; if `pnpm install` resolves newer compatible majors, that's acceptable — verify the build/boot steps still pass. The existing runtime/mcp versions are copied verbatim from the pre-migration `package.json` and must not change (no-behavior-change constraint).
