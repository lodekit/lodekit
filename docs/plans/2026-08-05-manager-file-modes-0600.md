# Manager State Files 0600 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** The manager writes its settings file, engine pidfile, and daily log files with mode `0600` (user-only) instead of the default `0644` (world-readable). Closes [#97](https://github.com/lodekit/lodekit/issues/97).

**Architecture:** Pass `mode: 0o600` at the three file-creation sites in `manager/src` — the complete set of file-write sites in the package. Creation-only by decision: no `chmod` healing of pre-existing files, since Lodekit has no public installs yet (engineer's call, 2026-08-05). One test per site asserts the on-disk mode.

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
