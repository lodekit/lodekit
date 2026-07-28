# Engine Package Rename (@lodekit/runtime → @lodekit/engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** Rename the product package `@lodekit/runtime` → `@lodekit/engine` (and `packages/runtime/` → `packages/engine/`), removing ADR-0005 survivor class 3 so "runtime" is no longer a Lodekit word anywhere in living code.

**Architecture:** Purely mechanical rename in three self-contained slices: (1) the package itself plus every workspace consumer of its name/path, (2) the manager's payload pipeline and its process-naming identifiers (approved scope: full identifier sweep, on-disk artifact names kept), (3) residual person-facing prose (AGENTS.md, checked-in root/ apps) plus the final residual-grep gate. Spec: `docs/specs/2026-07-16-events-canonical-model-design.md` §8 tier 3. Survivor policy: `docs/decisions/ADR-0005-engine-rename-survivor-policy.md`.

**Tech Stack:** pnpm workspaces, git mv, vitest, tsx (buildless — no build step to update).

## Global Constraints

- **Survivors (ADR-0005) — never change these:**
  - Generic English "at runtime" (e.g. `packages/skill/SKILL.md:117`, `prepare-bundle.mjs:104` "reads its tsconfig at runtime").
  - On-disk artifact names: `runtime.pid`, `runtime-YYYYMMDD.log`, `runtime.log(.old)` legacy regex in `manager/src/logs.js:26`, and every test literal that names those files (`logs.test.js`, tmpdir `runtime.pid` literals in `supervisor.test.js:22,169`, `paths.test.js:21,49`).
  - Historical records: everything under `docs/specs/`, `docs/plans/` (dated snapshots), `docs/decisions/ADR-*` — **never rewritten**, including their `@lodekit/runtime` mentions.
- **Scope decisions (approved by the person 2026-07-17):** bundle payload dir renames `Resources/platform/runtime/` → `platform/engine/`; manager gets the full identifier sweep (artifact names excluded); root/ apps' residual "runtime" prose is swept in this PR.
- The MCP package is untouched (HTTP-only by design — spec §8).
- CI: `.github/workflows/release.yml` has zero `runtime` references — nothing to change (spec's "CI workflows" touchpoint is empty in practice; verified by grep).
- No `docs/changelog.md` entry — internal work, nothing a Lodekit user can see or do.
- Branch `engine-package-rename`; PR title `chore: rename @lodekit/runtime to @lodekit/engine` (squash-merge; title is load-bearing).
- No `Co-Authored-By` trailers; bead IDs in commit messages.
- Welcome-app tagline recasts "runtime" as **platform** (ADR-0005: taglines use platform, "engine" names only the process).

---

### Task 1: Package + directory rename, workspace consumers, lockfile

**Files:**
- Rename: `packages/runtime/` → `packages/engine/` (git mv)
- Modify: `packages/engine/package.json:2`
- Modify: `package.json:7` (repo root)
- Modify: `packages/sdk/package.json:17`, `packages/sdk/src/client.ts:3-7`
- Modify: `packages/integration-tests/package.json:12`, `packages/integration-tests/tests/mcp.test.ts:6,7,10,31,160`
- Modify: `.gitignore:16,18,21`
- Modify (self-path comments): `packages/engine/src/internalSchema.ts:6,129`, `packages/engine/src/services/themes.ts:3`, `packages/engine/dashboard/src/components/nav.ts:1`, `packages/engine/dashboard/src/components/empty-stub.tsx:1`, `packages/engine/dashboard/src/lib/format.ts:2`, `packages/engine/dashboard/src/lib/table-query.ts:5`, `packages/engine/dashboard/src/routes/tasks.tsx:1`, `packages/engine/dashboard/src/routes/themes.tsx:1`
- Regenerate: `pnpm-lock.yaml` (via `pnpm install`)
- Test: existing suites — `pnpm -r test`, `pnpm -r check`

**Interfaces:**
- Consumes: nothing — first task.
- Produces: package `@lodekit/engine` at `packages/engine/` with unchanged subpath exports (`@lodekit/engine/server`, `/config`, `/db`, `/services/kv-store`, `/services/log-store`, `/services/tasks`, `/services/event-store`, `/services/settings`). Tasks 2–3 rely on the name `@lodekit/engine` and the path `packages/engine`.

**Acceptance Criteria:**
- `packages/runtime/` no longer exists; `packages/engine/package.json` has `"name": "@lodekit/engine"`; exports map otherwise byte-identical.
- `pnpm install` exits 0 and `pnpm-lock.yaml` has zero `packages/runtime` / `@lodekit/runtime` occurrences.
- `pnpm dev` (root script) filters `@lodekit/engine` and boots the engine.
- `pnpm -r test` and `pnpm -r check` green.
- No source file outside `docs/` and `manager/` still says `@lodekit/runtime` or `packages/runtime` (manager is Task 2).

- [ ] **Step 1: Move the directory with history**

```bash
git -C ~/Code/worktrees/lodekit/service mv packages/runtime packages/engine
```

- [ ] **Step 2: Rename the package**

`packages/engine/package.json:2`:
```diff
-  "name": "@lodekit/runtime",
+  "name": "@lodekit/engine",
```

- [ ] **Step 3: Update the root dev script**

`package.json:7`:
```diff
-    "dev": "LODEKIT_ROOT=$(pwd)/root LODEKIT_CACHE_DIR=$(pwd)/.cache pnpm --filter @lodekit/runtime start",
+    "dev": "LODEKIT_ROOT=$(pwd)/root LODEKIT_CACHE_DIR=$(pwd)/.cache pnpm --filter @lodekit/engine start",
```

- [ ] **Step 4: Update the SDK consumer**

`packages/sdk/package.json:17`: `"@lodekit/runtime": "workspace:*"` → `"@lodekit/engine": "workspace:*"` (keep devDependencies alphabetical — `@lodekit/engine` stays first).

`packages/sdk/src/client.ts:3-7` — all five type imports:
```diff
-import type { KvRoutes } from "@lodekit/runtime/services/kv-store";
-import type { LogRoutes } from "@lodekit/runtime/services/log-store";
-import type { TasksRoutes } from "@lodekit/runtime/services/tasks";
-import type { EventRoutes } from "@lodekit/runtime/services/event-store";
-import type { SettingsRoutes } from "@lodekit/runtime/services/settings";
+import type { KvRoutes } from "@lodekit/engine/services/kv-store";
+import type { LogRoutes } from "@lodekit/engine/services/log-store";
+import type { TasksRoutes } from "@lodekit/engine/services/tasks";
+import type { EventRoutes } from "@lodekit/engine/services/event-store";
+import type { SettingsRoutes } from "@lodekit/engine/services/settings";
```

- [ ] **Step 5: Update the integration-tests consumer**

`packages/integration-tests/package.json:12`: `"@lodekit/runtime": "workspace:*"` → `"@lodekit/engine": "workspace:*"` (keep the devDependencies keys sorted: `@lodekit/engine` before `@lodekit/mcp`).

`packages/integration-tests/tests/mcp.test.ts`:
```diff
-import { start, watcherShutdown } from "@lodekit/runtime/server";
-import { loadConfig } from "@lodekit/runtime/config";
+import { start, watcherShutdown } from "@lodekit/engine/server";
+import { loadConfig } from "@lodekit/engine/config";
 ...
-import { getSettingsDb, applySettingsManifest } from "@lodekit/runtime/services/settings";
+import { getSettingsDb, applySettingsManifest } from "@lodekit/engine/services/settings";
 ...
-  // Fully quiesce before removing the root (see packages/runtime/tests/watcher.test.ts):
+  // Fully quiesce before removing the root (see packages/engine/tests/watcher.test.ts):
 ...
-    const { getAppDb } = await import("@lodekit/runtime/db");
+    const { getAppDb } = await import("@lodekit/engine/db");
```

- [ ] **Step 6: Update .gitignore paths + comment**

`.gitignore:16,18,21`:
```diff
-# are ignored deliberately: this repo's runtime rebuilds them at dev/test time, so committing
+# are ignored deliberately: this repo's engine rebuilds them at dev/test time, so committing
-packages/runtime/tests/fixtures/start-app/src/routeTree.gen.ts
+packages/engine/tests/fixtures/start-app/src/routeTree.gen.ts
-packages/runtime/dashboard/src/routeTree.gen.ts
+packages/engine/dashboard/src/routeTree.gen.ts
```

- [ ] **Step 7: Update self-path comments inside the package**

Each is a path-in-comment; replace `packages/runtime` → `packages/engine` (and in `themes.ts:3` also the word "runtime" → "engine"):
- `packages/engine/src/internalSchema.ts:6` — `// --- app db (packages/engine/src/migrations/appDb.ts) ---`
- `packages/engine/src/internalSchema.ts:129` — `// --- events db (packages/engine/src/migrations/platform.ts) ---`
- `packages/engine/src/services/themes.ts:3` — `// engine (packages/engine/themes/, read-only); user themes live in the Lodekit`
- `packages/engine/dashboard/src/components/nav.ts:1` — `// packages/engine/dashboard/src/components/nav.ts`
- `packages/engine/dashboard/src/components/empty-stub.tsx:1` — `// packages/engine/dashboard/src/components/empty-stub.tsx`
- `packages/engine/dashboard/src/lib/format.ts:2` — `// Dependency-free on purpose: unit-tested from packages/engine/tests.`
- `packages/engine/dashboard/src/lib/table-query.ts:5` — `// from packages/engine/tests under the NodeNext tsc program.`
- `packages/engine/dashboard/src/routes/tasks.tsx:1` — `// packages/engine/dashboard/src/routes/tasks.tsx`
- `packages/engine/dashboard/src/routes/themes.tsx:1` — `// packages/engine/dashboard/src/routes/themes.tsx`

- [ ] **Step 8: Regenerate lockfile + relink**

```bash
cd ~/Code/worktrees/lodekit/service && pnpm install
grep -c 'packages/runtime\|@lodekit/runtime' pnpm-lock.yaml
```
Expected: `pnpm install` exits 0; grep prints `0` (exit code 1 — no matches).

- [ ] **Step 9: Run the full suite**

```bash
pnpm -r test && pnpm -r check
```
Expected: all green — engine (477 tests as of PR #105), sdk, ui, manager, integration-tests. Note: manager's `paths.test.js` still passes here because Task 2 hasn't changed `paths.js` yet — it still points at `packages/runtime`, which no longer exists on disk, but the unit test only asserts string composition. The dev-mode manager is broken between Task 1 and Task 2; that's why they land in one PR.

- [ ] **Step 10: Smoke-boot the engine**

```bash
LODEKIT_PORT=7797 pnpm dev &   # transient port; kill after check
sleep 20 && curl -sf http://127.0.0.1:7797/api/apps >/dev/null && echo BOOT-OK
```
Expected: `BOOT-OK`. Kill the dev process afterwards. (A stale Jul-14 dev engine may hold 7791 — unrelated; use the transient port.)

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore(engine): rename @lodekit/runtime to @lodekit/engine — package, consumers, lockfile (lk-qdw)"
```

---

### Task 2: Manager sweep — payload dir, identifiers, tests, README

**Files:**
- Modify: `manager/scripts/prepare-bundle.mjs:3,38,88,92,103-105,109,119,164`
- Modify: `manager/src/paths.js:7,27-28,41-42`
- Modify: `manager/src/main.js:11,28,31-33,44,46-47,67-68,141-142,147,182,225-226` (identifier + comment sites)
- Modify: `manager/src/supervisor.js:8,14,18,26,53,83,85,90,92,106,129`
- Rename: `manager/src/runtimeSettings.js` → `manager/src/engineSettings.js` (git mv; update lines 4-5,12,49,58,64,110,115)
- Modify: `manager/src/logs.js:67` (comment only — line 26's legacy regex is an artifact-name survivor)
- Modify: `manager/tests/paths.test.js:24-26,35,42-43`
- Modify: `manager/tests/supervisor.test.js` (all `spawnRuntime:` → `spawnEngine:`; `/Runtime exited/` → `/Engine exited/`; prose in lines 29,107,131; tmpdir `runtime.pid` literals at 22,169 **stay**)
- Rename: `manager/tests/runtime-settings.test.js` → `manager/tests/engine-settings.test.js` (import path, `createRuntimeSettings` → `createEngineSettings`, `describe("runtimeSettings")` → `describe("engineSettings")`, prose)
- Modify: `manager/README.md:5,12,19,25`
- Test: `pnpm --filter @lodekit/manager test`

**Interfaces:**
- Consumes: package `@lodekit/engine` at `packages/engine` (Task 1).
- Produces: `getPaths()` returns `engineDir` / `engineEntry` (replacing `runtimeDir` / `runtimeEntry`; packaged values under `Resources/platform/engine/`); `Supervisor` constructor takes `spawnEngine` (replacing `spawnRuntime`); `manager/src/engineSettings.js` exports `createEngineSettings` (replacing `createRuntimeSettings`). `pidFile` still `runtime.pid`; log basenames still `manager` / `runtime`.

**Acceptance Criteria:**
- `pnpm --filter @lodekit/manager test` green with the renamed identifiers.
- `grep -rn 'runtimeDir\|runtimeEntry\|spawnRuntime\|createRuntimeSettings\|runtimeSettings' manager/src manager/tests manager/scripts` → no hits.
- Packaged payload path is `platform/engine`; deploy filter is `@lodekit/engine`; the two sides (prepare-bundle writes, paths.js reads) agree.
- Artifact names unchanged: `runtime.pid`, `openDailyLogStream(..., "runtime")`, `logs.js:26` legacy regex, and all test literals naming those files.
- If the system Node is v24.x (matches the pinned 24.12.0 ABI): `pnpm --filter @lodekit/manager bundle` succeeds and produces `manager/build/platform/{engine,mcp,skill}`; otherwise this check is skipped and noted in the PR test plan.

- [ ] **Step 1: Update manager tests to the engine names (TDD — fail first)**

`manager/tests/paths.test.js`:
```diff
-    expect(p.runtimeDir).toBe("/Applications/Lodekit.app/Contents/Resources/platform/runtime");
-    expect(p.runtimeEntry).toBe(
-      "/Applications/Lodekit.app/Contents/Resources/platform/runtime/src/index.ts"
-    );
+    expect(p.engineDir).toBe("/Applications/Lodekit.app/Contents/Resources/platform/engine");
+    expect(p.engineEntry).toBe(
+      "/Applications/Lodekit.app/Contents/Resources/platform/engine/src/index.ts"
+    );
 ...
-  it("dev mode runs the workspace runtime against root/ on the system node", () => {
+  it("dev mode runs the workspace engine against root/ on the system node", () => {
 ...
-    expect(p.runtimeDir).toBe("/repo/packages/runtime");
-    expect(p.runtimeEntry).toBe("/repo/packages/runtime/src/index.ts");
+    expect(p.engineDir).toBe("/repo/packages/engine");
+    expect(p.engineEntry).toBe("/repo/packages/engine/src/index.ts");
```
(Lines 21 and 49 — `runtime.pid` expectations — unchanged.)

`manager/tests/supervisor.test.js`: replace every `spawnRuntime:` key with `spawnEngine:` (8 sites: lines 36,49,65,82,98,123,136,151,170); `expect(sup.errorMessage).toMatch(/Runtime exited/)` → `/Engine exited/` (line 71); prose renames: line 29 `"reaches running once the engine answers health checks"`, line 107 `"terminates a stale engine recorded in the pid file before starting"`, line 131 `"errors when the engine never becomes healthy"`. Lines 22 and 169 (`runtime.pid` literals) unchanged.

```bash
git -C ~/Code/worktrees/lodekit/service mv manager/tests/runtime-settings.test.js manager/tests/engine-settings.test.js
```
Then in `manager/tests/engine-settings.test.js`:
```diff
-import { createRuntimeSettings } from "../src/runtimeSettings.js";
+import { createEngineSettings } from "../src/engineSettings.js";
 ...
-  const rs = createRuntimeSettings({
+  const rs = createEngineSettings({
 ...
-describe("runtimeSettings", () => {
+describe("engineSettings", () => {
 ...
-  it("setStartAtLogin writes the setting through to the runtime (tray checkbox path)", async () => {
+  it("setStartAtLogin writes the setting through to the engine (tray checkbox path)", async () => {
```

- [ ] **Step 2: Run manager tests — expect failure**

```bash
pnpm --filter @lodekit/manager test
```
Expected: FAIL — `p.engineDir` undefined, `createEngineSettings` not exported, `spawnEngine` never called.

- [ ] **Step 3: Rename in manager/src**

`manager/src/paths.js`:
```diff
-// The dev/default path-mode switch (spec §7). Everything mode-dependent lives here;
-// main.js just spawns `nodeBin --import tsx runtimeEntry` with cwd runtimeDir.
+// The dev/default path-mode switch (spec §7). Everything mode-dependent lives here;
+// main.js just spawns `nodeBin --import tsx engineEntry` with cwd engineDir.
 ...
-      runtimeDir: path.join(platformDir, "runtime"),
-      runtimeEntry: path.join(platformDir, "runtime", "src", "index.ts"),
+      engineDir: path.join(platformDir, "engine"),
+      engineEntry: path.join(platformDir, "engine", "src", "index.ts"),
 ...
-    runtimeDir: path.join(repoRoot, "packages", "runtime"),
-    runtimeEntry: path.join(repoRoot, "packages", "runtime", "src", "index.ts"),
+    engineDir: path.join(repoRoot, "packages", "engine"),
+    engineEntry: path.join(repoRoot, "packages", "engine", "src", "index.ts"),
```
(Line 14 `pidFile: path.join(appSupportDir, "runtime.pid")` unchanged.)

```bash
git -C ~/Code/worktrees/lodekit/service mv manager/src/runtimeSettings.js manager/src/engineSettings.js
```
Then in `manager/src/engineSettings.js`:
```diff
-// Applies runtime-owned platform settings to the OS/tray (settings spec §9).
-// The runtime is the store; this module is the applier. All effects are
+// Applies engine-owned platform settings to the OS/tray (settings spec §9).
+// The engine is the store; this module is the applier. All effects are
 ...
-function createRuntimeSettings(deps) {
+function createEngineSettings(deps) {
 ...
-          log(`runtimeSettings: ${e.message}`);
+          log(`engineSettings: ${e.message}`);
 ...
-    // Write path for the tray's Launch at Login checkbox: the caller applies the
-    // OS change itself; this keeps the runtime's setting (dashboard) in step.
+    // Write path for the tray's Launch at Login checkbox: the caller applies the
+    // OS change itself; this keeps the engine's setting (dashboard) in step.
 ...
-  // ---- production defaults (node:http against the local runtime) ----
+  // ---- production defaults (node:http against the local engine) ----
 ...
-    req.on("error", (e) => log(`runtimeSettings SSE: ${e.message}`));
+    req.on("error", (e) => log(`engineSettings SSE: ${e.message}`));
 ...
-module.exports = { createRuntimeSettings };
+module.exports = { createEngineSettings };
```

`manager/src/supervisor.js` — identifiers `spawnRuntime` → `spawnEngine` (lines 14,26,90: constructor param, `this.spawnRuntime`, call site); user-visible strings:
```diff
-// Runtime lifecycle (spec §5): stopped → starting → running | error.
+// Engine lifecycle (spec §5): stopped → starting → running | error.
 ...
-    // The runtime builds its dashboard before it starts listening; a cold
+    // The engine builds its dashboard before it starts listening; a cold
 ...
-  // A pid file left behind by a crashed manager points at a runtime nobody
+  // A pid file left behind by a crashed manager points at an engine nobody
 ...
-    // (e.g. a dev runtime). Never kill what we didn't start (spec §5).
+    // (e.g. a dev engine). Never kill what we didn't start (spec §5).
-      this.setState("error", "Port 7777 already in use by another process (a dev runtime?)");
+      this.setState("error", "Port 7777 already in use by another process (a dev engine?)");
 ...
-      this.setState("error", `Failed to start runtime: ${e.message}`);
+      this.setState("error", `Failed to start engine: ${e.message}`);
 ...
-        this.setState("error", `Runtime exited unexpectedly (${signal ?? `code ${code}`})`);
+        this.setState("error", `Engine exited unexpectedly (${signal ?? `code ${code}`})`);
 ...
-        `Runtime did not become ready within ${this.startTimeoutMs / 1000}s`
+        `Engine did not become ready within ${this.startTimeoutMs / 1000}s`
```

`manager/src/main.js`:
```diff
-const { createRuntimeSettings } = require("./runtimeSettings");
+const { createEngineSettings } = require("./engineSettings");
 ...
-const runtimeLogStream = openDailyLogStream(paths.logsDir, "runtime");
+const engineLogStream = openDailyLogStream(paths.logsDir, "runtime"); // artifact name stays (ADR-0005)
 ...
-function spawnRuntime() {
-  const child = spawn(paths.nodeBin, ["--import", "tsx", paths.runtimeEntry], {
-    cwd: paths.runtimeDir, // bare `tsx` resolves from the runtime's node_modules
+function spawnEngine() {
+  const child = spawn(paths.nodeBin, ["--import", "tsx", paths.engineEntry], {
+    cwd: paths.engineDir, // bare `tsx` resolves from the engine's node_modules
 ...
-  child.stdout.pipe(stampLines()).pipe(runtimeLogStream, { end: false });
-  child.stderr.pipe(stampLines()).pipe(runtimeLogStream, { end: false });
+  child.stdout.pipe(stampLines()).pipe(engineLogStream, { end: false });
+  child.stderr.pipe(stampLines()).pipe(engineLogStream, { end: false });
 ...
-const supervisor = new Supervisor({ spawnRuntime, checkHealth, pidFile: paths.pidFile });
-const runtimeSettings = createRuntimeSettings({
+const supervisor = new Supervisor({ spawnEngine, checkHealth, pidFile: paths.pidFile });
+const engineSettings = createEngineSettings({
```
plus the remaining `runtimeSettings.` call sites (lines 147,225-226 → `engineSettings.`), comment sweeps: line 44 keeps `runtime.log` (artifact) but any "the runtime" prose → "the engine" (lines 141-142), line 182 `(runtimeSettings canSetLogin)` → `(engineSettings canSetLogin)`.

`manager/src/logs.js:67`: `// stream is forensic evidence, and evidence needs time. Sits between the runtime` → `... between the engine`. **Line 26 regex unchanged.**

- [ ] **Step 4: Update prepare-bundle**

`manager/scripts/prepare-bundle.mjs`:
```diff
-//   build/platform/{runtime,mcp,skill} — relocatable payload (pnpm deploy)
+//   build/platform/{engine,mcp,skill} — relocatable payload (pnpm deploy)
 ...
-// runtime's Vite/Tailwind resolution. Strip the whole npm_config_* family so every child
+// engine's Vite/Tailwind resolution. Strip the whole npm_config_* family so every child
 ...
-  // to the monorepo source (packages/runtime), which trips assertNoEscapingSymlinks below
+  // to the monorepo source (packages/engine), which trips assertNoEscapingSymlinks below
 ...
-    `pnpm --filter @lodekit/runtime --prod --config.hoist=false deploy "${path.join(platformDir, "runtime")}"`
+    `pnpm --filter @lodekit/engine --prod --config.hoist=false deploy "${path.join(platformDir, "engine")}"`
 ...
-  // extends at the local copy so the payload is self-contained (the runtime's
+  // extends at the local copy so the payload is self-contained (the engine's
 ...
-  for (const pkg of ["runtime", "mcp"]) {
+  for (const pkg of ["engine", "mcp"]) {
 ...
-    // tsconfig.json is JSONC (the runtime's has full-line `//` comments, added by the
+    // tsconfig.json is JSONC (the engine's has full-line `//` comments, added by the
 ...
-  for (const pkg of ["runtime", "mcp", "skill"]) {
+  for (const pkg of ["engine", "mcp", "skill"]) {
 ...
-    cwd: path.join(platformDir, "runtime"),
+    cwd: path.join(platformDir, "engine"),
```
(Line 104 "reads its tsconfig at runtime" — generic English, stays.)

- [ ] **Step 5: Update manager README prose**

`manager/README.md` lines 5,12,19,25: `runtime` → `engine` in each ("payload (engine, MCP server, skill)", "engine against `root/` (system Node)", "break engine builds", "supervises the engine").

- [ ] **Step 6: Run manager tests — expect pass**

```bash
pnpm --filter @lodekit/manager test
```
Expected: PASS (paths, supervisor, engine-settings, logs, settings, first-run).

- [ ] **Step 7: Grep gate for the manager**

```bash
grep -rn 'runtimeDir\|runtimeEntry\|spawnRuntime\|RuntimeSettings\|runtimeSettings\|runtimeLogStream' manager/
```
Expected: no output (exit 1).

- [ ] **Step 8: Bundle verification (conditional)**

```bash
node --version
```
If `v24.x`: run `pnpm --filter @lodekit/manager bundle` — expected exit 0, `ls manager/build/platform` prints `engine mcp root skill`, and the script's own asserts (native module inside `platform/engine`, no escaping symlinks, self-contained tsconfigs) pass. If not v24.x: skip (better-sqlite3 ABI mismatch by design — the bundle must be built on the pinned Node), and record the skip in the PR test plan.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore(manager): engine naming — payload dir platform/engine, identifier sweep, artifact names kept (lk-0nw)"
```

---

### Task 3: Residual prose — AGENTS.md, root/ apps — and the final residual grep

**Files:**
- Modify: `AGENTS.md:21,32,37,58,60,63,73` (`CLAUDE.md` is a symlink — no separate edit)
- Modify: `root/apps/welcome/src/routes/index.tsx:20,31`
- Modify: `root/apps/welcome/src/routes/__root.tsx:22`
- Modify: `root/apps/greenhouse/src/routes/__root.tsx:22`
- Modify: `root/apps/greenhouse/src/routes/shed.tsx:55`
- Test: residual grep allowlist (below) + `pnpm -r test` final run

**Interfaces:**
- Consumes: `@lodekit/engine` / `packages/engine` names (Task 1), `platform/engine` payload naming (Task 2).
- Produces: nothing downstream — final task.

**Acceptance Criteria:**
- AGENTS.md architecture and Build & Test sections say `packages/engine` / `@lodekit/engine`; payload tuple reads `engine/mcp/skill`; "Engine and MCP are buildless".
- Welcome app copy no longer calls Lodekit a "runtime" (tagline uses **platform**; rebuild sentence uses **engine**); the three root/-app comments say "engine".
- Repo-wide residual grep (below) returns only allowlisted survivor classes.
- Full suite green.

- [ ] **Step 1: AGENTS.md**

```diff
-- **`packages/runtime`** (`@lodekit/runtime`) — the product. The **engine** — a single
+- **`packages/engine`** (`@lodekit/engine`) — the product. The **engine** — a single
 ...
-  (`@lodekit/runtime/*`, `@lodekit/mcp/client`), never by relative reach-in.
+  (`@lodekit/engine/*`, `@lodekit/mcp/client`), never by relative reach-in.
 ...
-  Lodekit-local Node + the platform payload (runtime/mcp/skill via `pnpm deploy`) in
+  Lodekit-local Node + the platform payload (engine/mcp/skill via `pnpm deploy`) in
 ...
-  (`LODEKIT_ROOT=$(pwd)/root pnpm --filter @lodekit/runtime start`).
+  (`LODEKIT_ROOT=$(pwd)/root pnpm --filter @lodekit/engine start`).
 ...
-- `pnpm test` — runs `pnpm -r test`: `@lodekit/runtime`, `@lodekit/sdk`, `@lodekit/ui`,
+- `pnpm test` — runs `pnpm -r test`: `@lodekit/engine`, `@lodekit/sdk`, `@lodekit/ui`,
 ...
-  siblings by package specifier). Per-package: `pnpm --filter @lodekit/runtime test`.
+  siblings by package specifier). Per-package: `pnpm --filter @lodekit/engine test`.
 ...
-Runtime and MCP are **buildless** — `tsx`, no build step.
+Engine and MCP are **buildless** — `tsx`, no build step.
```

- [ ] **Step 2: root/ apps prose**

`root/apps/welcome/src/routes/index.tsx`:
```diff
-        Lodekit is a local, self-hosted runtime where you — working with an AI coding
+        Lodekit is a local, self-hosted platform where you — working with an AI coding
 ...
-            edit the source and the runtime rebuilds them on save.
+            edit the source and the engine rebuilds them on save.
```

`root/apps/welcome/src/routes/__root.tsx:22` and `root/apps/greenhouse/src/routes/__root.tsx:22` (identical comment):
```diff
-        {/* Theme before hydration — no dark-mode flash. Served by the runtime
+        {/* Theme before hydration — no dark-mode flash. Served by the engine
```

`root/apps/greenhouse/src/routes/shed.tsx:55`:
```diff
-// this call rides a bearer token the runtime injected — and transparently
+// this call rides a bearer token the engine injected — and transparently
```

- [ ] **Step 3: Residual grep gate (ADR-0005 allowlist)**

```bash
grep -rniw 'runtime' --exclude-dir=node_modules --exclude-dir=.git \
  --exclude-dir=docs --exclude-dir=.agents --exclude=pnpm-lock.yaml . \
  | grep -vi 'at runtime' \
  | grep -v 'runtime\.pid\|runtime\.log\|"runtime"\|runtime-\|(runtime|manager)'
```
Expected: no output. Every surviving hit must be one of ADR-0005's classes 1/2/4 — anything else is a miss; fix it before committing. (`docs/` and `.agents/` are excluded as historical records/vendored process; `web/` is included — PR 3 already swept it, this proves it stayed clean.)

- [ ] **Step 4: Final full suite**

```bash
pnpm -r test
```
Expected: green across all packages.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(docs): engine naming residue — AGENTS.md package refs, root apps prose (lk-7ho)"
```

---

## PR

Push `engine-package-rename`, raise the PR:
- Title: `chore: rename @lodekit/runtime to @lodekit/engine`
- Body: **Summary** (spec §8 tier 3 — the last rename slice; removes ADR-0005 survivor class 3; approved scope extensions: `platform/engine` bundle dir, manager identifier sweep, root/ prose), **Notes** (artifact names `runtime.pid`/`runtime*.log` deliberately kept per ADR-0005 class 2; CI workflows had no references; historical docs untouched; bundle verification run/skipped per Node version), **Test plan** (checkboxes from the acceptance criteria above).
- No changelog entry (internal). Merging is the person's call.
