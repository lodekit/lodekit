# Manager State Files 0600 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** The manager writes its settings file, engine pidfile, and daily log files with mode `0600` (user-only) instead of the default `0644` (world-readable), and every directory the engine or manager creates is made `0700` (user-only) instead of the default `0755`. Closes [#97](https://github.com/lodekit/lodekit/issues/97).

**Architecture:** Task 1: pass `mode: 0o600` at the three file-creation sites in `manager/src` — the complete set of file-write sites in the package. Task 2 (added after Task 1 shipped as PR #195; same PR by the engineer's call): pass `mode: 0o700` at every `fs.mkdirSync` site in `packages/engine/src` and `manager/src` — a uniform "platform-created directories are private" rule covering the `~/Library` state/cache/log dirs and the Lodekit root trees. Creation-only by decision: no `chmod` healing of pre-existing files or dirs, since Lodekit has no public installs yet (engineer's call, 2026-08-05). Representative tests assert on-disk modes; a grep check enforces site completeness.

**Tech Stack:** Node `fs` (`writeFileSync` / `createWriteStream` `mode` option), vitest.

## Global Constraints

- Creation-only: `mode` at the write sites; **no** `chmod` of existing files.
- Surgical: only the three write sites, their three test files, and the changelog buffer change.
- Changelog entry in the same PR as the code (user-noticeable security hygiene → `## Fixed`).

---

### Task 1: Pass `mode: 0o600` at the three manager write sites

**Files:**
- Modify: `manager/src/settings.js:29`
- Modify: `manager/src/supervisor.js:111`
- Modify: `manager/src/logs.js:51`
- Test: `manager/tests/settings.test.js`
- Test: `manager/tests/supervisor.test.js`
- Test: `manager/tests/logs.test.js`
- Modify: `docs/changelog.md` (append under `## Fixed`)

**Interfaces:**
- Consumes: existing exports — `setIconStyle(file, style)` from `settings.js`, `Supervisor` from `supervisor.js`, `openDailyLogStream(logsDir, base, opts)` from `logs.js`. No signatures change.
- Produces: nothing new — behavior-only change (on-disk file mode).

**Acceptance Criteria:**
- `setIconStyle` creates the settings file with mode `0600`.
- `Supervisor.start()` creates the pidfile with mode `0600`.
- `openDailyLogStream` creates each dated log file with mode `0600`.
- Full `@lodekit/manager` suite passes.
- `docs/changelog.md` gains one `## Fixed` entry for this change.

- [ ] **Step 1: Write the three failing mode-assertion tests**

In `manager/tests/settings.test.js`, inside `describe("icon style settings", ...)`:

```js
  it("creates the settings file user-only (0600)", () => {
    const file = settingsFile();
    setIconStyle(file, "a");
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });
```

In `manager/tests/supervisor.test.js`, inside `describe("Supervisor", ...)` (same spawned-flag pattern as the first test in the file — `checkHealth` may only answer true after spawn, or the port-taken guard trips):

```js
  it("creates the pidfile user-only (0600)", async () => {
    const child = fakeChild();
    let spawned = false;
    const pidFile = tmpPidFile();
    const sup = new Supervisor({
      ...fastOpts,
      pidFile,
      spawnEngine: () => ((spawned = true), child),
      checkHealth: async () => spawned,
    });
    await sup.start();
    expect(fs.statSync(pidFile).mode & 0o777).toBe(0o600);
  });
```

In `manager/tests/logs.test.js`, inside `describe("dated log files", ...)`:

```js
  it("creates log files user-only (0600)", async () => {
    const dir = tmp();
    const stream = openDailyLogStream(dir, "runtime", { now: () => new Date("2026-07-07T10:00:00Z") });
    stream.write("hello\n");
    await end(stream);
    expect(fs.statSync(path.join(dir, "runtime-20260707.log")).mode & 0o777).toBe(0o600);
  });
```

- [ ] **Step 2: Run the manager suite to verify the three new tests fail**

Run: `pnpm --filter @lodekit/manager test`
Expected: exactly the three new tests FAIL with mode `420` (`0o644`) instead of `384` (`0o600`); everything else passes.

- [ ] **Step 3: Pass `mode: 0o600` at the three write sites**

`manager/src/settings.js:29`:

```js
  fs.writeFileSync(file, JSON.stringify(settings, null, 2), { mode: 0o600 });
```

`manager/src/supervisor.js:111`:

```js
      fs.writeFileSync(this.pidFile, String(child.pid), { mode: 0o600 });
```

`manager/src/logs.js:51`:

```js
      current = fs.createWriteStream(path.join(logsDir, `${base}-${s}.log`), { flags: "a", mode: 0o600 });
```

- [ ] **Step 4: Run the manager suite to verify everything passes**

Run: `pnpm --filter @lodekit/manager test`
Expected: PASS (all tests).

- [ ] **Step 5: Append the changelog entry**

In `docs/changelog.md`, append at the end of `## Fixed`:

```markdown
- **Manager files are now private to your user** — the menubar app's settings,
  pidfile, and logs are written user-only (`0600`); other accounts on the same
  Mac can no longer read them.
```

- [ ] **Step 6: Commit**

```bash
git add manager/src/settings.js manager/src/supervisor.js manager/src/logs.js \
  manager/tests/settings.test.js manager/tests/supervisor.test.js manager/tests/logs.test.js \
  docs/changelog.md
git commit -m "fix(manager): write settings/pidfile/log files 0600 (#97) (<task-bead-id>)"
```

---

### Task 2: Pass `mode: 0o700` at every engine and manager directory-creation site

**Files:**
- Modify (engine — 15 `fs.mkdirSync` sites):
  - `packages/engine/src/logStore.ts:50`
  - `packages/engine/src/keyProvider.ts:71`
  - `packages/engine/src/server.ts:107`
  - `packages/engine/src/watcher.ts:21`, `:96`, `:110`
  - `packages/engine/src/eventStore.ts:56`
  - `packages/engine/src/gatewaysStore.ts:56`
  - `packages/engine/src/secretsStore.ts:91`
  - `packages/engine/src/services/settings.ts:141`
  - `packages/engine/src/db.ts:18`
  - `packages/engine/src/services/file-store.ts:201`, `:302`
  - `packages/engine/src/services/themes.ts:57`
  - `packages/engine/src/scaffold.ts:119`
- Modify (manager — 5 `fs.mkdirSync` sites):
  - `manager/src/logs.js:42`
  - `manager/src/settings.js:28`
  - `manager/src/supervisor.js:110`
  - `manager/src/main.js:196`, `:197`
- Test: `packages/engine/tests/logStore.test.ts`, `packages/engine/tests/eventStore.test.ts`, `packages/engine/tests/db.test.ts`
- Test: `manager/tests/logs.test.js`, `manager/tests/settings.test.js`, `manager/tests/supervisor.test.js`
- Modify: `docs/changelog.md` (widen the Task 1 entry — same-PR own entry, see Step 5)

**Interfaces:**
- Consumes: existing exports only — `initLogStore(stateDir)` from `logStore.ts`, `initEventStore(dataDir)` from `eventStore.ts`, `getAppDb(dataDir, appId)` from `db.ts`, `openDailyLogStream`, `setIconStyle`, `Supervisor`. No signatures change.
- Produces: nothing new — behavior-only change (on-disk directory mode).

**Acceptance Criteria:**
- Every `fs.mkdirSync` call in `packages/engine/src` and `manager/src` passes `mode: 0o700` (grep check below returns zero lines).
- Representative mode assertions pass: engine stateDir (`logStore`), `data/_platform` (`eventStore`), per-app data dir (`db`); manager logs dir, settings dir, pidfile dir.
- Full `@lodekit/engine` and `@lodekit/manager` suites pass.
- The Task 1 changelog entry is widened to mention private directories (same-PR own entry — the append-only rule protects released/foreign entries; this edits this PR's own unmerged diff).

**Out of scope (noted, deliberate):** `manager/src/firstRun.js` `cpSync` copies showcase app folders with their source permissions (no `mode` option exists) — those land inside the `apps/` dir this task creates `0700`, so the boundary holds. Files inside sqlite stores are tracked separately (bead lk-8cac).

- [ ] **Step 1: Write the six failing mode-assertion tests**

In `packages/engine/tests/logStore.test.ts`, inside `describe("logStore", ...)` (the `beforeEach` already inits into an existing mkdtemp dir where `mode` cannot apply, so init again into a nested path that does not exist yet):

```ts
  it("creates the state dir user-only (0700)", () => {
    const nested = path.join(dir, "nested", "state");
    expect(initLogStore(nested)).toBe(true);
    expect(fs.statSync(nested).mode & 0o777).toBe(0o700);
  });
```

In `packages/engine/tests/eventStore.test.ts`, inside `describe("eventStore", ...)` (`_platform` is created fresh by the `beforeEach` `initEventStore`, so `mode` applies):

```ts
  it("creates data/_platform user-only (0700)", () => {
    expect(fs.statSync(path.join(dataDir, "_platform")).mode & 0o777).toBe(0o700);
  });
```

In `packages/engine/tests/db.test.ts`, inside `describe("db connection management", ...)`:

```ts
  it("creates the per-app data dir user-only (0700)", () => {
    getAppDb(dir, "demo");
    expect(fs.statSync(path.join(dir, "demo")).mode & 0o777).toBe(0o700);
  });
```

In `manager/tests/logs.test.js`, inside `describe("dated log files", ...)`:

```js
  it("creates the log directory user-only (0700)", async () => {
    const dir = path.join(tmp(), "nested");
    const stream = openDailyLogStream(dir, "manager", { now: () => new Date("2026-07-07T10:00:00Z") });
    await end(stream);
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
  });
```

In `manager/tests/settings.test.js`, inside `describe("icon style settings", ...)` (the shared `settingsFile()` helper returns a path whose parent already exists, so build a nested path by hand and register the root for cleanup):

```js
  it("creates the settings directory user-only (0700)", () => {
    const dir = tmp();
    dirs.push(dir);
    const file = path.join(dir, "nested", "settings.json");
    setIconStyle(file, "a");
    expect(fs.statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
  });
```

In `manager/tests/supervisor.test.js`, inside `describe("Supervisor", ...)` (nested pidfile path so the parent does not pre-exist; spawned-flag pattern as in the file's first test):

```js
  it("creates the pidfile directory user-only (0700)", async () => {
    const child = fakeChild();
    let spawned = false;
    const pidFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lodekit-sup-")), "nested", "runtime.pid");
    const sup = new Supervisor({
      ...fastOpts,
      pidFile,
      spawnEngine: () => ((spawned = true), child),
      checkHealth: async () => spawned,
    });
    await sup.start();
    expect(fs.statSync(path.dirname(pidFile)).mode & 0o777).toBe(0o700);
  });
```

- [ ] **Step 2: Run both suites to verify exactly the six new tests fail**

Run: `pnpm --filter @lodekit/engine test` and `pnpm --filter @lodekit/manager test`
Expected: exactly the six new tests FAIL with mode `493` (`0o755`) instead of `448` (`0o700`); everything else passes.

- [ ] **Step 3: Add `mode: 0o700` at all 20 mkdirSync sites**

Every site listed under **Files** has the exact shape `fs.mkdirSync(<arg>, { recursive: true })`. Change each to:

```js
fs.mkdirSync(<arg>, { recursive: true, mode: 0o700 });
```

`<arg>` stays exactly as it is at each site (`stateDir`, `cfg.appsDir`, `path.dirname(file)`, `dayDir`, …). No other change at any site.

- [ ] **Step 4: Verify site completeness with grep, then run both suites**

Run:

```bash
grep -rn "mkdirSync" packages/engine/src manager/src | grep -v "mode: 0o700"
```

Expected: no output (every mkdirSync call carries the mode).

Run: `pnpm --filter @lodekit/engine test` and `pnpm --filter @lodekit/manager test`
Expected: PASS (all tests).

- [ ] **Step 5: Widen the changelog entry**

In `docs/changelog.md`, replace the Task 1 entry (this PR's own unmerged entry — not a released or foreign one) with:

```markdown
- **Lodekit's files are now private to your user** — the menubar app's settings,
  pidfile, and logs are written user-only (`0600`), and every folder Lodekit
  creates (its state, caches, and logs under `~/Library`, and your Lodekit
  root's app and data folders) is created user-only (`0700`); other accounts
  on the same Mac can no longer read them.
```

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src manager/src packages/engine/tests \
  manager/tests/logs.test.js manager/tests/settings.test.js manager/tests/supervisor.test.js \
  docs/changelog.md
git commit -m "fix: create engine and manager directories 0700 (#97) (<task-bead-id>)"
```
