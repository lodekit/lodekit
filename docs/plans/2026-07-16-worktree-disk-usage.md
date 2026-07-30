# Worktree Disk-Usage Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** Reclaim ~17G across the lodekit worktrees via committed clean scripts (build leftovers) and a machine-level pnpm global virtual store (node_modules dedupe).

**Architecture:** One dependency-free `scripts/clean.mjs` at the repo root exposes `pnpm clean` (current worktree) and `pnpm clean:worktrees` (all worktrees via `git worktree list --porcelain`), deleting a fixed allowlist of build-output dirs. Separately, `enable-global-virtual-store` is turned on in the user-level pnpm config (never committed) and rolled out worktree-by-worktree with a validation gate on the first.

**Tech Stack:** Plain Node (`node:child_process`, `node:fs`) — the repo is buildless; pnpm ≥ 10.12.1 (machine has 10.30.3).

**Spec:** `docs/specs/2026-07-16-worktree-disk-usage-design.md`

## Global Constraints

- The clean allowlist is exactly: `manager/out`, `manager/dist`, `manager/build`, `web/main/dist`, `web/main/.astro`, `web/docs/dist`, `web/docs/.astro` (spec §Design 1).
- `node_modules` (anywhere) and `manager/.node-cache` MUST survive every clean run (spec §Design 1).
- The script deletes only allowlist entries joined to worktree roots from `git worktree list --porcelain` / `git rev-parse --show-toplevel` — no globs, no user-supplied paths (spec §Design 1, safety).
- Nothing global-virtual-store-related is committed to the repo — machine-level config only (spec §Decision).
- Global-virtual-store rollout beyond the runtime worktree is gated on `pnpm test` + `pnpm dev` boot passing in the runtime worktree (spec §Design 2 step 3).
- No changelog entry — internal tooling (spec §Out of scope).
- No `Co-Authored-By` trailers in commits (repo convention).
- All repo changes land on branch `chore/worktree-disk-usage`, raised as a PR at the end — never committed to `master`.

---

### Task 1: Clean script + root package.json wiring

**Files:**
- Create: `scripts/clean.mjs` (new dir — the repo root has no `scripts/` yet)
- Modify: `package.json:6-10` (root — add two entries to `scripts`)
- Commit also: `docs/specs/2026-07-16-worktree-disk-usage-design.md`, `docs/plans/2026-07-16-worktree-disk-usage.md` (written during brainstorming/planning, still uncommitted)

**Interfaces:**
- Consumes: nothing.
- Produces: `pnpm clean` (cleans the current worktree) and `pnpm clean:worktrees` (cleans all registered worktrees). Task 2 relies on `pnpm clean:worktrees` existing and printing per-worktree + total reclaimed sizes.

**Acceptance Criteria:**
- `pnpm clean` in the runtime worktree removes `manager/out`, `manager/dist`, `manager/build` (and any present web build dirs) and prints what it removed with sizes.
- `node_modules` (root and per-package) and `manager/.node-cache` still exist afterwards.
- `pnpm clean` run twice in a row succeeds (second run is a no-op).
- Both scripts appear in root `package.json`; changes committed on `chore/worktree-disk-usage`.

- [ ] **Step 1: Create the work branch**

```bash
cd ~/Code/worktrees/lodekit/runtime
git checkout -b chore/worktree-disk-usage
```

- [ ] **Step 2: Write `scripts/clean.mjs`**

```js
#!/usr/bin/env node
// Deletes known-disposable build outputs in the current worktree, or in all
// registered worktrees with --all. Fixed allowlist only — node_modules and
// manager/.node-cache are never touched.
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const DISPOSABLE = [
  'manager/out', // dead Electron Forge output — never regenerates
  'manager/dist',
  'manager/build',
  'web/main/dist',
  'web/main/.astro',
  'web/docs/dist',
  'web/docs/.astro',
];

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function worktreeRoots(all) {
  if (!all) return [git(['rev-parse', '--show-toplevel'])];
  return git(['worktree', 'list', '--porcelain'])
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length));
}

function dirKb(path) {
  try {
    return Number(execFileSync('du', ['-sk', path], { encoding: 'utf8' }).split('\t')[0]);
  } catch {
    return 0;
  }
}

const fmt = (kb) => (kb >= 1024 * 1024 ? `${(kb / 1024 / 1024).toFixed(1)}G` : `${Math.round(kb / 1024)}M`);

let totalKb = 0;
for (const root of worktreeRoots(process.argv.includes('--all'))) {
  let reclaimedKb = 0;
  for (const rel of DISPOSABLE) {
    const target = join(root, rel);
    if (!existsSync(target)) continue;
    const kb = dirKb(target);
    rmSync(target, { recursive: true, force: true });
    console.log(`  removed ${target} (${fmt(kb)})`);
    reclaimedKb += kb;
  }
  console.log(`${root}: reclaimed ${fmt(reclaimedKb)}`);
  totalKb += reclaimedKb;
}
console.log(`total: reclaimed ${fmt(totalKb)}`);
```

- [ ] **Step 3: Wire the root `package.json` scripts**

In the root `package.json`, extend the `scripts` block (after the `"test"` entry):

```json
  "scripts": {
    "dev": "LODEKIT_ROOT=$(pwd)/root LODEKIT_CACHE_DIR=$(pwd)/.cache pnpm --filter @lodekit/runtime start",
    "mcp": "pnpm --filter @lodekit/mcp start",
    "test": "pnpm -r test",
    "clean": "node scripts/clean.mjs",
    "clean:worktrees": "node scripts/clean.mjs --all"
  },
```

- [ ] **Step 4: Verify against the live runtime worktree (has ~3.3G of leftovers)**

```bash
du -sh manager/out manager/dist manager/build manager/.node-cache node_modules
pnpm clean
```

Expected: `removed .../manager/out (1.6G)`, `removed .../manager/dist (1.1G)`, `removed .../manager/build (603M)` lines (web dirs too if present), then a reclaimed total ≈ 3.3G.

```bash
ls manager/out manager/dist manager/build 2>&1
du -sh manager/.node-cache node_modules
```

Expected: three "No such file or directory" errors; `.node-cache` (~49M) and `node_modules` (~1.3G) intact.

- [ ] **Step 5: Verify idempotence**

```bash
pnpm clean
```

Expected: no `removed` lines, `reclaimed 0M`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/clean.mjs package.json docs/specs/2026-07-16-worktree-disk-usage-design.md docs/plans/2026-07-16-worktree-disk-usage.md
git commit -m "chore: add clean/clean:worktrees scripts for build leftovers (lk-p18)"
```

---

### Task 2: One-shot sweep across all worktrees

**Files:**
- No repo changes — operational task. Evidence recorded in the task bead on close.

**Interfaces:**
- Consumes: `pnpm clean:worktrees` from Task 1.
- Produces: reclaimed disk; before/after `du` numbers for the final report.

**Acceptance Criteria:**
- `pnpm clean:worktrees` runs over every worktree from `git worktree list` (including the main clone at `~/Code/github/lodekit`) and reports per-worktree reclaimed sizes.
- Leftover stub dirs `stack/`, `kv-store/`, `website/` (8K each, not registered worktrees) are removed.
- Before/after `du -sh ~/Code/worktrees/lodekit` captured; expected drop ≈ 12G (21G → ~9G).

- [ ] **Step 1: Capture the before number**

```bash
du -sh ~/Code/worktrees/lodekit
```

Expected: ~21G.

- [ ] **Step 2: Sweep**

```bash
cd ~/Code/worktrees/lodekit/runtime
pnpm clean:worktrees
```

Expected: per-worktree `reclaimed` lines — ≈3.3G for manager and infra (runtime was already cleaned in Task 1), ≈1.4G for ui, ≈1.1G for service, ≈0 for web and the main clone; total ≈ 9G.

- [ ] **Step 3: Remove the stub dirs (not worktrees — verify first)**

```bash
git worktree list | grep -E "stack|kv-store|website" ; ls ~/Code/worktrees/lodekit/stack ~/Code/worktrees/lodekit/kv-store ~/Code/worktrees/lodekit/website
```

Expected: no `git worktree list` matches (they are unregistered leftovers). Then:

```bash
rm -rf ~/Code/worktrees/lodekit/stack ~/Code/worktrees/lodekit/kv-store ~/Code/worktrees/lodekit/website
```

- [ ] **Step 4: Capture the after number**

```bash
du -sh ~/Code/worktrees/lodekit
```

Expected: ~9G. Record both numbers in the bead close reason.

---

### Task 3: Enable global virtual store + validate on the runtime worktree

**Files:**
- No repo changes — machine-level pnpm config + reinstall. MUST NOT create or modify any `.npmrc` inside the repo.

**Interfaces:**
- Consumes: nothing from earlier tasks (ordered after Task 2 only so `du` evidence stays interpretable).
- Produces: a validated machine-level `enable-global-virtual-store=true`; go/no-go for Task 4.

**Acceptance Criteria:**
- `pnpm config get enable-global-virtual-store` prints `true`; `git status` shows no new/modified `.npmrc` in the repo.
- After reinstall, the runtime worktree's `node_modules` resolves through symlinks into a shared location outside the repo, and its `du` footprint is far below the previous ~1.3G.
- `pnpm test` passes across the workspace and `pnpm dev` boots (runtime serves, then clean shutdown).
- On failure not fixable by a quick `packageExtensions` entry: rolled back (`pnpm config delete enable-global-virtual-store` + reinstall), findings filed as a `defer` bead — Task 4 is then skipped (spec §Design 2, failure stance).

- [ ] **Step 1: Enable machine-level**

```bash
pnpm config set --global enable-global-virtual-store true
pnpm config get enable-global-virtual-store
```

Expected: `true`.

- [ ] **Step 2: Confirm nothing leaked into the repo**

```bash
cd ~/Code/worktrees/lodekit/runtime && git status --short
```

Expected: no `.npmrc` anywhere in the output. If one appeared, delete it and use the global pnpm config file instead (`pnpm config set` wrote to the wrong location).

- [ ] **Step 3: Reinstall the runtime worktree from scratch**

```bash
/usr/bin/find . -name node_modules -maxdepth 3 -type d -prune -not -path "./root/*" | xargs rm -rf
pnpm install
```

Expected: install completes; output mentions the virtual store. (`/usr/bin/find` — the shell profile shadows `find`.)

- [ ] **Step 4: Verify the layout actually changed**

```bash
ls -la node_modules/.pnpm 2>/dev/null | head -3
readlink node_modules/.pnpm/* 2>/dev/null | head -3 || readlink node_modules/hono
du -sh node_modules
```

Expected: symlinks resolving under `~/.local/share/pnpm/` (or pnpm's data dir), not into the repo; `du` well under the previous 1.3G. If the layout is unchanged (real `.pnpm` dir, ~1.3G), the flag didn't take — stop and investigate before proceeding.

- [ ] **Step 5: Run the real checks**

```bash
pnpm test
```

Expected: all workspace suites pass (runtime, sdk, ui, manager, integration — exercises `better-sqlite3` native loading). Then:

```bash
timeout 20 pnpm dev ; test $? -eq 124 && echo "BOOT OK (ran until timeout)"
```

Expected: runtime boots and serves until the timeout kills it (`BOOT OK`). Any import-time `ERR_MODULE_NOT_FOUND` here is the documented ESM/hidden-hoisting caveat — identify the offending package, add a `packageExtensions` entry to `pnpm-workspace.yaml` declaring the missing dep, reinstall, retry once. If it's not a one-entry fix: roll back per the acceptance criteria and skip Task 4.

---

### Task 4: Roll out to the remaining worktrees + prune

**Files:**
- No repo changes — operational task across manager, infra, ui, service, web worktrees.

**Interfaces:**
- Consumes: validated global-virtual-store config from Task 3 (hard gate).
- Produces: final before/after disk numbers for the session report.

**Acceptance Criteria:**
- All five remaining worktrees reinstalled with symlinked node_modules; each worktree's install exits 0.
- `pnpm store prune` run once at the end.
- Final `du -sh ~/Code/worktrees/lodekit` captured; expected ≈ 3–4G or less (spec §Expected end state). Numbers recorded in the bead close reason.

- [ ] **Step 1: Reinstall each remaining worktree**

```bash
for wt in manager infra ui service web; do
  cd ~/Code/worktrees/lodekit/$wt
  /usr/bin/find . -name node_modules -maxdepth 3 -type d -prune -not -path "./root/*" | xargs rm -rf
  pnpm install || echo "INSTALL FAILED: $wt"
done
```

Expected: five clean installs, no `INSTALL FAILED` lines. (Older branches' lockfiles are fine — the flag is config-level, not lockfile-level.)

- [ ] **Step 2: Prune the content-addressable store**

```bash
pnpm store prune
```

Expected: removed-packages report; frees part of the 4.6G store.

- [ ] **Step 3: Capture the final number**

```bash
du -sh ~/Code/worktrees/lodekit
du -sh ~/.local/share/pnpm 2>/dev/null
```

Expected: worktrees ≈ 3–4G or less. Record final numbers (worktrees + pnpm data dir) in the bead close reason.

- [ ] **Step 4: Push the branch**

```bash
cd ~/Code/worktrees/lodekit/runtime && git push -u origin chore/worktree-disk-usage
```

PR raising happens at session close via finishing-a-development-branch (title `chore: add worktree clean scripts`, body with Summary / Notes / Test plan per convention).
