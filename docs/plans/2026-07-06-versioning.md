# Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Product semver at 0.1.0 in lockstep across the workspace, with a dashboard footer showing `lodekit v0.1.0 <short commit hash>`.

**Architecture:** A runtime `buildInfo` module resolves `{ version, commit }` once (own `package.json`; commit from a bundle-time `build-info.json` stamp, falling back to git, else `null`). The dashboard — a separate process (app worker) — receives the values as Vite defines injected only into its build target; `prepare-bundle.mjs` writes the stamp into each deployed payload package. No HTTP surface.

**Tech Stack:** Node (`fs`, `child_process`), Vite `define`, TanStack Start dashboard, vitest.

**Spec:** `docs/specs/2026-07-06-versioning-design.md`

## Global Constraints

- Versions are **lockstep**: root + all 7 packages (`@lodekit/runtime`, `@lodekit/mcp`, `@lodekit/sdk`, `@lodekit/skill`, `@lodekit/ui`, `@lodekit/web`, `@lodekit/manager`) → `0.1.0`, bumped together from now on.
- Footer renders the `package.json` value **verbatim** (`v0.1.0`, never trimmed to `v0.1`).
- Commit resolution order: **stamp file → git → `null`**. Build info is diagnostics — resolution failure must never crash anything.
- Defines `__LODEKIT_VERSION__` / `__LODEKIT_COMMIT__` go to the **dashboard build target only**, never user-app builds.
- No HTTP version endpoint (spec §8).
- House rules: no `Co-Authored-By` trailers; commit directly to `master`; touch only what the task names.

---

### Task 1: Lockstep version bump to 0.1.0

The MCP server constructor at `packages/mcp/index.ts:20` currently hardcodes `version: "0.0.1"` — that contradicts spec §2 ("each process reads its *own* `package.json`"), so this task also switches it to read its own manifest.

**Files:**
- Modify: `package.json` (root, `"version": "0.0.0"` → `"0.1.0"`)
- Modify: `packages/runtime/package.json`, `packages/mcp/package.json`, `packages/sdk/package.json`, `packages/skill/package.json`, `packages/ui/package.json`, `web/package.json`, `manager/package.json` (each `"version": "0.0.1"` → `"0.1.0"`)
- Modify: `packages/mcp/index.ts:20`
- Regenerate: `pnpm-lock.yaml`

**Interfaces:**
- Produces: every workspace `package.json` reads `"version": "0.1.0"` — Task 2's `getBuildInfo()` test reads the runtime's value dynamically, so it depends on the *field*, not this literal.

- [ ] **Step 1: Bump all eight version fields**

In each of the 8 files listed above, change the `"version"` value to `"0.1.0"`. (Root goes from `0.0.0`, the seven packages from `0.0.1`.)

- [ ] **Step 2: MCP server reports its own package version**

In `packages/mcp/index.ts`, add to the `node:` imports at the top:

```ts
import fs from "node:fs";
```

and replace line 20:

```ts
const server = new McpServer({ name: "lodekit", version: "0.0.1" });
```

with:

```ts
const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const server = new McpServer({ name: "lodekit", version: pkg.version });
```

(`index.ts` sits at the package root, so `./package.json` is correct both in the repo and in the deployed payload.)

- [ ] **Step 3: Verify the bump is complete and sync the lockfile**

Run from the **repo root** (never from inside `manager/` — its `.npmrc` would rewrite the workspace layout):

```bash
grep -c '"version": "0.1.0"' package.json packages/*/package.json web/package.json manager/package.json
pnpm install --lockfile-only
```

Expected: each file reports `1`; `pnpm install --lockfile-only` exits clean (lockfile may or may not change — workspace deps use `workspace:*`).

- [ ] **Step 4: Smoke the MCP entry still parses**

```bash
pnpm --filter @lodekit/mcp exec tsx --eval "import fs from 'node:fs'; const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', 'file://' + process.cwd() + '/'), 'utf8')); console.log(pkg.version)"
```

Expected output: `0.1.0`. (The MCP entry starts a stdio server on import, so we verify the read pattern, not the import.)

- [ ] **Step 5: Commit**

```bash
git add package.json packages/runtime/package.json packages/mcp/package.json packages/sdk/package.json packages/skill/package.json packages/ui/package.json web/package.json manager/package.json packages/mcp/index.ts pnpm-lock.yaml
git commit -m "chore: lockstep product version 0.1.0; MCP server reports its own package version"
```

---

### Task 2: Runtime `buildInfo` module

**Files:**
- Create: `packages/runtime/src/buildInfo.ts`
- Test: `packages/runtime/tests/buildInfo.test.ts`

**Interfaces:**
- Produces:
  - `interface BuildInfo { version: string; commit: string | null }`
  - `resolveBuildInfo(pkgDir: string): BuildInfo` — pure resolution for a given package dir (exported for tests).
  - `getBuildInfo(): BuildInfo` — cached resolution for the runtime's own package dir. Task 3 imports this in `build.ts` and in `dashboard.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `packages/runtime/tests/buildInfo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBuildInfo, getBuildInfo } from "../src/buildInfo.js";

const RUNTIME_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// A minimal package dir outside the repo: os.tmpdir() is not inside a git work tree,
// so git resolution fails there by construction.
function tmpPkg(version = "9.9.9"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-buildinfo-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x", version }));
  return dir;
}

describe("resolveBuildInfo", () => {
  it("reads the version from the package's own package.json", () => {
    expect(resolveBuildInfo(tmpPkg("1.2.3")).version).toBe("1.2.3");
  });

  it("prefers the build-info.json stamp for the commit", () => {
    const dir = tmpPkg();
    fs.writeFileSync(path.join(dir, "build-info.json"), JSON.stringify({ commit: "stamped1" }));
    expect(resolveBuildInfo(dir).commit).toBe("stamped1");
  });

  it("falls back to git when no stamp exists", () => {
    const expected = execSync("git rev-parse --short HEAD", { cwd: RUNTIME_DIR, encoding: "utf8" }).trim();
    expect(resolveBuildInfo(RUNTIME_DIR).commit).toBe(expected);
  });

  it("returns a null commit when neither stamp nor git resolves", () => {
    expect(resolveBuildInfo(tmpPkg()).commit).toBeNull();
  });
});

describe("getBuildInfo", () => {
  it("reports the runtime's own version", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(RUNTIME_DIR, "package.json"), "utf8"));
    expect(getBuildInfo()).toEqual({ version: pkg.version, commit: expect.any(String) });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @lodekit/runtime exec vitest run tests/buildInfo.test.ts
```

Expected: FAIL — cannot resolve `../src/buildInfo.js`.

- [ ] **Step 3: Implement the module**

Create `packages/runtime/src/buildInfo.ts`:

```ts
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// What am I running? Version from this package's own package.json; commit from the
// bundle-time build-info.json stamp (packaged), falling back to git (dev), else null.
// Diagnostics only — resolution failure must never crash the runtime (spec §3).
export interface BuildInfo {
  version: string;
  commit: string | null;
}

export function resolveBuildInfo(pkgDir: string): BuildInfo {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
  return { version: pkg.version, commit: resolveCommit(pkgDir) };
}

function resolveCommit(pkgDir: string): string | null {
  // The stamp wins over git — it describes what was actually bundled.
  try {
    const stamp = JSON.parse(fs.readFileSync(path.join(pkgDir, "build-info.json"), "utf8"));
    if (typeof stamp.commit === "string") return stamp.commit;
  } catch {
    // No stamp — dev checkout; ask git.
  }
  const git = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: pkgDir, encoding: "utf8" });
  return git.status === 0 ? git.stdout.trim() : null;
}

const PKG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let cached: BuildInfo | undefined;

export function getBuildInfo(): BuildInfo {
  return (cached ??= resolveBuildInfo(PKG_DIR));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @lodekit/runtime exec vitest run tests/buildInfo.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/buildInfo.ts packages/runtime/tests/buildInfo.test.ts
git commit -m "feat(runtime): buildInfo module — version from own package.json, commit from stamp -> git -> null"
```

---

### Task 3: Dashboard defines + footer

**Files:**
- Modify: `packages/runtime/src/build.ts` (`StartBuildTarget` ~line 124, `buildStart`'s `define:` ~line 183, `buildDashboard` ~line 107)
- Modify: `packages/runtime/dashboard/src/routes/__root.tsx`
- Test: `packages/runtime/tests/dashboard.test.ts` (extend the existing SSR test at ~line 61)

**Interfaces:**
- Consumes: `getBuildInfo(): { version: string; commit: string | null }` from `../src/buildInfo.js` (Task 2).
- Produces: `StartBuildTarget.defines?: Record<string, string>` (extra Vite defines, dashboard passes them, app builds don't); globals `__LODEKIT_VERSION__: string` / `__LODEKIT_COMMIT__: string | null` inside the dashboard bundle.

- [ ] **Step 1: Extend the SSR test with the failing footer assertion**

In `packages/runtime/tests/dashboard.test.ts`, add to the imports:

```ts
import { getBuildInfo } from "../src/buildInfo.js";
```

and inside the existing test `"serves the SSR'd dashboard at /_dashboard/ and its built assets under /_dashboard/_build/"`, after `expect(html).toContain("Lodekit");` add:

```ts
    const { version, commit } = getBuildInfo();
    expect(html).toContain(`lodekit v${version} ${commit}`);
```

(In the test environment the runtime dir is a git checkout with no stamp, so `commit` is the real short hash — the footer must contain both.)

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @lodekit/runtime exec vitest run tests/dashboard.test.ts
```

Expected: the SSR test FAILS on the new `toContain` (no footer yet); the other tests in the file still pass.

- [ ] **Step 3: Thread defines through the build pipeline**

In `packages/runtime/src/build.ts`:

Add the import:

```ts
import { getBuildInfo } from "./buildInfo.js";
```

Extend `StartBuildTarget`:

```ts
export interface StartBuildTarget {
  rootDir: string;
  outDir: string;   // cache/<app-id> — client/ and server/ land inside
  urlBase: string;  // no trailing slash
  appId: string;    // __LODEKIT_APP_ID__ define value
  defines?: Record<string, string>; // extra Vite defines — dashboard-only today (spec §5)
}
```

In `buildStart`, spread them into the existing `define:`:

```ts
    define: { __LODEKIT_APP_ID__: JSON.stringify(t.appId), ...t.defines },
```

In `buildDashboard`, pass version + commit (JSON-stringified — `JSON.stringify(null)` emits the literal `null`):

```ts
export async function buildDashboard(cfg: Config): Promise<DashboardState> {
  try {
    const info = getBuildInfo();
    await buildStart({
      rootDir: DASHBOARD_ROOT,
      outDir: path.join(cfg.cacheDir, "_dashboard"),
      urlBase: "/_dashboard",
      appId: "_dashboard",
      defines: {
        __LODEKIT_VERSION__: JSON.stringify(info.version),
        __LODEKIT_COMMIT__: JSON.stringify(info.commit),
      },
    });
```

(The `catch`/state handling around it is untouched.)

- [ ] **Step 4: Render the footer in the dashboard root**

In `packages/runtime/dashboard/src/routes/__root.tsx`, after the imports add the ambient declarations (mirroring how the SDK declares `__LODEKIT_APP_ID__` inline) and the footer line — one string, one text node, so the SSR HTML carries it verbatim with no JSX text-node comment separators:

```ts
// Injected by the runtime's dashboard build (build.ts defines) — never present in app builds.
declare const __LODEKIT_VERSION__: string;
declare const __LODEKIT_COMMIT__: string | null;

const versionLine = `lodekit v${__LODEKIT_VERSION__}${__LODEKIT_COMMIT__ ? ` ${__LODEKIT_COMMIT__}` : ""}`;
```

and in the component, between `</QueryClientProvider>` and `<Scripts />`:

```tsx
        <footer className="text-muted-foreground py-4 text-center text-xs">{versionLine}</footer>
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @lodekit/runtime exec vitest run tests/dashboard.test.ts
```

Expected: all tests in the file PASS, including the footer assertion.

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/build.ts packages/runtime/dashboard/src/routes/__root.tsx packages/runtime/tests/dashboard.test.ts
git commit -m "feat(dashboard): version footer — __LODEKIT_VERSION__/__LODEKIT_COMMIT__ defines on the dashboard build target only"
```

---

### Task 4: Bundle-time commit stamp

**Files:**
- Modify: `manager/scripts/prepare-bundle.mjs` (end of `buildPayload()`, after the tsconfig-vendoring loop ~line 106)

**Interfaces:**
- Consumes: the `build-info.json` shape Task 2 reads — `{ "commit": "<short hash>" }`.
- Produces: `build/platform/{runtime,mcp,skill}/build-info.json` in the packaged payload.

- [ ] **Step 1: Write the stamp into each payload package**

At the end of `buildPayload()` in `manager/scripts/prepare-bundle.mjs` (after the `for (const pkg of ["runtime", "mcp"])` tsconfig loop closes), add:

```js
  // Stamp the bundled commit into each payload package (versioning spec §3) — the
  // payload has no .git, so this is how buildInfo resolves the commit when packaged.
  const commit = execSync("git rev-parse --short HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  for (const pkg of ["runtime", "mcp", "skill"]) {
    fs.writeFileSync(
      path.join(platformDir, pkg, "build-info.json"),
      JSON.stringify({ commit }, null, 2) + "\n"
    );
  }
```

(`execSync`, `fs`, `path`, `repoRoot`, `platformDir` are all already in scope in that file.)

- [ ] **Step 2: Verify the script parses and the full suite is green**

```bash
node --check manager/scripts/prepare-bundle.mjs
pnpm test
```

Expected: `node --check` silent/exit 0; `pnpm test` all green (runtime, sdk, manager).

A full `pnpm --filter @lodekit/manager make` requires the pinned bundle Node version, so the packaged-footer check (dashboard footer shows the stamped hash inside `Lodekit.app`) joins the person's cumulative packaged-smoke checklist rather than this task.

- [ ] **Step 3: Commit**

```bash
git add manager/scripts/prepare-bundle.mjs
git commit -m "feat(manager): stamp build-info.json (short commit) into each payload package at bundle time"
```
