# SQLite Seam (`openManagedDb`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** Every better-sqlite3 construction and type annotation in the engine flows through one seam module (`packages/engine/src/sqlite.ts`), so a future driver swap (node:sqlite, issue #143; Bun, #142) is a one-file change. Closes issue #141.

**Architecture:** A new `packages/engine/src/sqlite.ts` exports `ManagedDb` (today an alias for `Database.Database`), `openManagedDb(dbPath, { chain, foreignKeys? })` (private parent dir 0700 → open → WAL → optional foreign-key pragma → `applyMigrations`; throws on failure, so each caller keeps its own degrade policy), and `openReadonlyDb(dbPath)` (`{ readonly: true, fileMustExist: true }`, the connection-level readonly guarantee). The six read-write open/WAL/migrate copies, the two short-lived readonly constructions, and all `Database.Database` annotations are re-pointed to it. Pure refactor — zero behavior change.

**Tech Stack:** TypeScript (buildless, `tsx`), better-sqlite3, vitest.

## Global Constraints

- **Refactor only — no behavior change.** WAL on all six read-write stores; `foreign_keys` stays ON everywhere — better-sqlite3 11.x enables it by default (verified live), so all six stores already run with it; the seam pins it with an explicit pragma. Degrade-on-failure semantics and the exact stderr messages of the five init functions preserved verbatim.
- **Security floor (never simplify):** private dir mode `0o700` on every store directory (PR #195); the `/select` readonly guarantee stays connection-level, never SQL-parse-level (db-store spec §8/§9).
- better-sqlite3 remains the driver — the swap itself is issue #143, not this slice. No new dependencies.
- After each task: `pnpm --filter @lodekit/engine check` (tsc) and the named tests must pass.
- Commits: conventional prefix `refactor(engine):`, task bead ID appended, no `Co-Authored-By` trailers. `<bead-id>` below is substituted at dispatch.
- `docs/changelog.md`: internal refactor — append **nothing**.

## Current State (verified 2026-08-06)

Six read-write open/WAL/migrate copies:

| Site | File to open | Pragmas | Chain | On failure |
|---|---|---|---|---|
| `packages/engine/src/db.ts:18-22` | `<dataDir>/<appId>/db.sqlite` | WAL + foreign_keys | `APP_DB_CHAIN` | throws |
| `packages/engine/src/eventStore.ts:55-59` | `<dataDir>/_platform/events.sqlite` | WAL | `EVENTS_CHAIN` | degrade, `false` |
| `packages/engine/src/logStore.ts:50-53` | `<stateDir>/logs.sqlite` | WAL | `LOGS_CHAIN` | degrade, `false` |
| `packages/engine/src/secretsStore.ts:90-94` | `<dataDir>/_platform/secrets.sqlite` | WAL | `SECRETS_CHAIN` | degrade, `false` |
| `packages/engine/src/gatewaysStore.ts:55-59` | `<dataDir>/_platform/gateways.sqlite` | WAL | `GATEWAYS_CHAIN` | degrade, `false` |
| `packages/engine/src/services/settings.ts:140-144` | `<dataDir>/_platform/settings.sqlite` | WAL | `SETTINGS_CHAIN` | degrade, `false` |

Two short-lived readonly constructions: `packages/engine/src/services/db-store.ts:163` and `packages/engine/src/services/data-explorer.ts:70`, both `new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true })`.

Type-annotation-only importers of `better-sqlite3` (every usage is exactly `Database.Database`; no `Database.Statement` etc. anywhere): `migrations.ts`, `migrations/appDb.ts`, `services/tasks.ts`, `services/kv-store.ts`, `services/file-store.ts`, `services/secret-store.ts`, `services/gateways.ts` — plus annotations inside the eight files above.

**2026-08-06 amendment (post-Task-1):** the plan originally assumed SQLite's default `foreign_keys = OFF`; better-sqlite3 11.x in fact enables it per connection, so every store above already runs with FK ON. The seam therefore sets `foreign_keys = ON` unconditionally and has no `foreignKeys` option — the pragma column in the table reads as "WAL (+ FK ON like everything else)" for all six rows.

---

### Task 1: Seam module `sqlite.ts` + tests

**Files:**
- Create: `packages/engine/src/sqlite.ts`
- Test: `packages/engine/tests/sqlite.test.ts`

**Interfaces:**
- Consumes: `applyMigrations(db, chain)` and `type Migration` from `packages/engine/src/migrations.ts` (existing).
- Produces (Tasks 2–3 rely on these exact names):
  ```ts
  export type ManagedDb; // alias for Database.Database today
  export interface ManagedDbOptions { chain: Migration[] }
  export function openManagedDb(dbPath: string, opts: ManagedDbOptions): ManagedDb;
  export function openReadonlyDb(dbPath: string): ManagedDb;
  ```

**Acceptance Criteria:**
- `openManagedDb` creates the db file's parent directory recursively with mode `0o700`, opens read-write, sets `journal_mode = WAL`, sets `foreign_keys = ON` explicitly (better-sqlite3 already defaults it ON — the explicit pragma pins the contract for the #143 swap), and applies `opts.chain` via `applyMigrations`; it throws (never catches) on failure.
- `openReadonlyDb` opens `{ readonly: true, fileMustExist: true }`: throws on a missing file, and write statements on the handle throw.
- `pnpm --filter @lodekit/engine test tests/sqlite.test.ts` passes; `pnpm --filter @lodekit/engine check` clean.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/tests/sqlite.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Migration } from "../src/migrations.js";
import { openManagedDb, openReadonlyDb, type ManagedDb } from "../src/sqlite.js";

const CHAIN: Migration[] = [
  { name: "001-t", up: (db) => { db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)"); } },
];

let tmp: string | null = null;
const opened: ManagedDb[] = [];
const track = (db: ManagedDb): ManagedDb => { opened.push(db); return db; };

// A fresh <tmp>/nested/db.sqlite path — "nested" does not exist yet, so the
// helper's mkdir is what must create it.
const freshDbPath = () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-seam-"));
  return path.join(tmp, "nested", "db.sqlite");
};

afterEach(() => {
  for (const db of opened.splice(0)) { try { db.close(); } catch { /* already closed */ } }
  if (tmp) { fs.rmSync(tmp, { recursive: true, force: true }); tmp = null; }
});

describe("openManagedDb", () => {
  it("creates the parent directory (0700) and applies the chain", () => {
    const dbPath = freshDbPath();
    const db = track(openManagedDb(dbPath, { chain: CHAIN }));
    expect(fs.statSync(path.dirname(dbPath)).mode & 0o777).toBe(0o700);
    db.prepare("INSERT INTO t (v) VALUES (?)").run("x");
    expect(db.prepare("SELECT COUNT(*) AS c FROM _migrations").get()).toEqual({ c: 1 });
  });

  it("sets WAL journal mode", () => {
    const db = track(openManagedDb(freshDbPath(), { chain: CHAIN }));
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
  });

  it("enforces foreign keys", () => {
    const db = track(openManagedDb(freshDbPath(), { chain: CHAIN }));
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("does not reapply an already-applied chain", () => {
    const dbPath = freshDbPath();
    track(openManagedDb(dbPath, { chain: CHAIN })).close();
    const again = track(openManagedDb(dbPath, { chain: CHAIN }));
    expect(again.prepare("SELECT COUNT(*) AS c FROM _migrations").get()).toEqual({ c: 1 });
  });
});

describe("openReadonlyDb", () => {
  it("refuses a missing file", () => {
    expect(() => openReadonlyDb(freshDbPath())).toThrow();
  });

  it("rejects writes on the handle", () => {
    const dbPath = freshDbPath();
    track(openManagedDb(dbPath, { chain: CHAIN })).close();
    const ro = track(openReadonlyDb(dbPath));
    expect(() => ro.prepare("INSERT INTO t (v) VALUES ('y')").run()).toThrow(/readonly/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @lodekit/engine test tests/sqlite.test.ts`
Expected: FAIL — cannot resolve `../src/sqlite.js` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `packages/engine/src/sqlite.ts`:

```ts
// The engine's single door to the SQLite driver (issue #141): every connection —
// the read-write platform/app stores and the short-lived readonly opens — is
// constructed here, and callers name the handle type via ManagedDb. Swapping
// the driver (node:sqlite #143, Bun #142) is then a change to this file alone.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { applyMigrations, type Migration } from "./migrations.js";

export type ManagedDb = Database.Database;

export interface ManagedDbOptions {
  chain: Migration[];
}

// Opens (creating if needed) a read-write store: private parent dir (0700),
// WAL, foreign-key enforcement (explicit — pins the driver default every
// store already runs with), migrations applied at open — the one moment of
// application (migrations.ts). Throws on failure; degrade policy stays with
// each caller.
export function openManagedDb(dbPath: string, opts: ManagedDbOptions): ManagedDb {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  applyMigrations(db, opts.chain);
  return db;
}

// Short-lived readonly connection: the readonly guarantee is the connection's,
// not a SQL parse's (db-store spec §8/§9).
export function openReadonlyDb(dbPath: string): ManagedDb {
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @lodekit/engine test tests/sqlite.test.ts`
Expected: PASS (6 tests). Also run `pnpm --filter @lodekit/engine check` — expected clean.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/sqlite.ts packages/engine/tests/sqlite.test.ts
git commit -m "refactor(engine): add sqlite seam module (openManagedDb/openReadonlyDb) (<bead-id>)"
```

---

### Task 2: Convert the six read-write openers

**Files:**
- Modify: `packages/engine/src/db.ts`
- Modify: `packages/engine/src/eventStore.ts`
- Modify: `packages/engine/src/logStore.ts`
- Modify: `packages/engine/src/secretsStore.ts`
- Modify: `packages/engine/src/gatewaysStore.ts`
- Modify: `packages/engine/src/services/settings.ts`

**Interfaces:**
- Consumes: `openManagedDb`, `type ManagedDb` from `packages/engine/src/sqlite.ts` (Task 1).
- Produces: no new surface — every public signature in the six files keeps its name and shape; only the annotation spelling changes (`Database.Database` → `ManagedDb`).

**Acceptance Criteria:**
- All six open/WAL/migrate blocks replaced by a single `openManagedDb(...)` call each; try/catch degrade blocks and their stderr messages byte-identical.
- The six files no longer import `better-sqlite3` (value or type); no unused imports remain.
- `pnpm --filter @lodekit/engine check` clean; full `pnpm --filter @lodekit/engine test` green.

- [ ] **Step 1: Convert `db.ts`**

Replace the better-sqlite3 and `applyMigrations` imports (keep `fs`, `path`, `APP_DB_CHAIN` — `fs` is still used by `openDbs`):

```ts
// remove:
import Database from "better-sqlite3";
import { applyMigrations } from "./migrations.js";
// add:
import { openManagedDb, type ManagedDb } from "./sqlite.js";
```

Replace the open block in `getAppDb` (lines 18–22) — the helper's mkdir of `path.dirname(dbPath)` covers the old `fs.mkdirSync(appDataDir, ...)` exactly, and the helper sets `foreign_keys = ON` itself:

```ts
// before:
  fs.mkdirSync(appDataDir, { recursive: true, mode: 0o700 });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  applyMigrations(db, APP_DB_CHAIN);
// after:
  const db = openManagedDb(dbPath, { chain: APP_DB_CHAIN });
```

The `appDataDir` local is then only used to build `dbPath` — keep it. Replace the three `Database.Database` annotations (lines 11, 13, 30) with `ManagedDb`. Keep all existing comments.

- [ ] **Step 2: Convert `eventStore.ts`**

Imports — `fs` was only used for the mkdir, so it goes; keep `path`:

```ts
// remove:
import fs from "node:fs";
import Database from "better-sqlite3";
import { applyMigrations } from "./migrations.js";
// add:
import { openManagedDb, type ManagedDb } from "./sqlite.js";
```

Singleton annotation: `let db: Database.Database | null = null;` → `let db: ManagedDb | null = null;`.

Open block inside `initEventStore`'s `try` (lines 55–59):

```ts
// before:
    const dir = path.join(dataDir, "_platform");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    db = new Database(path.join(dir, "events.sqlite"));
    db.pragma("journal_mode = WAL");
    applyMigrations(db, EVENTS_CHAIN);
// after:
    db = openManagedDb(path.join(dataDir, "_platform", "events.sqlite"), { chain: EVENTS_CHAIN });
```

The `catch` block, its stderr message, and the `return false` stay byte-identical.

- [ ] **Step 3: Convert `logStore.ts`**

Same import change as Step 2 (drop `fs` — the mkdir was its only use; keep `path`). `let db: Database.Database | null` → `ManagedDb`. Open block (lines 50–53):

```ts
// before:
    fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    db = new Database(path.join(stateDir, "logs.sqlite"));
    db.pragma("journal_mode = WAL");
    applyMigrations(db, LOGS_CHAIN);
// after:
    db = openManagedDb(path.join(stateDir, "logs.sqlite"), { chain: LOGS_CHAIN });
```

- [ ] **Step 4: Convert `secretsStore.ts`**

Remove both driver imports (`import type Database` and `import BetterSqlite3`), the `fs` import (mkdir was its only use), and the `applyMigrations` import; add the seam import (path is `./sqlite.js`). Annotations at lines 80 and 110 → `ManagedDb`. Open block (lines 90–94):

```ts
// before:
    const dir = path.join(cfg.dataDir, "_platform");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    db = new BetterSqlite3(path.join(dir, "secrets.sqlite"));
    db.pragma("journal_mode = WAL");
    applyMigrations(db, SECRETS_CHAIN);
// after:
    db = openManagedDb(path.join(cfg.dataDir, "_platform", "secrets.sqlite"), { chain: SECRETS_CHAIN });
```

- [ ] **Step 5: Convert `gatewaysStore.ts`**

Identical pattern to Step 4: drop both driver imports, `fs`, `applyMigrations`; annotations at lines 45 and 75 → `ManagedDb`; open block (lines 55–59) becomes:

```ts
    db = openManagedDb(path.join(cfg.dataDir, "_platform", "gateways.sqlite"), { chain: GATEWAYS_CHAIN });
```

- [ ] **Step 6: Convert `services/settings.ts`**

Drop both driver imports and the `applyMigrations` import; **keep `fs` and `path`** (used at lines 91, 204, 239). Seam import path from `services/` is `../sqlite.js`. All eleven `Database.Database` annotations (lines 45, 52, 96, 102, 108, 113, 121, 128, 310, 323, 391) → `ManagedDb`. Open block (lines 140–144):

```ts
// before:
    const dir = path.join(dataDir, "_platform");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    platformDb = new BetterSqlite3(path.join(dir, "settings.sqlite"));
    platformDb.pragma("journal_mode = WAL");
    applyMigrations(platformDb, SETTINGS_CHAIN);
// after:
    platformDb = openManagedDb(path.join(dataDir, "_platform", "settings.sqlite"), { chain: SETTINGS_CHAIN });
```

- [ ] **Step 7: Verify**

```bash
pnpm --filter @lodekit/engine check
pnpm --filter @lodekit/engine test
grep -rln "better-sqlite3" packages/engine/src
```

Expected: tsc clean; full engine suite green (the existing `db.test.ts`, `eventStore.test.ts`, `platform-migrations.test.ts`, `secrets-*.test.ts`, `gateways-*.test.ts`, `platform-settings.test.ts` suites are the regression net). The grep lists exactly: `sqlite.ts`, `migrations.ts`, `migrations/appDb.ts`, and `services/{db-store,data-explorer,secret-store,gateways,tasks,kv-store,file-store}.ts` — i.e. the six converted files are gone from it.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/db.ts packages/engine/src/eventStore.ts packages/engine/src/logStore.ts packages/engine/src/secretsStore.ts packages/engine/src/gatewaysStore.ts packages/engine/src/services/settings.ts
git commit -m "refactor(engine): route the six read-write store openers through openManagedDb (<bead-id>)"
```

---

### Task 3: Readonly opens + remaining annotations; final sweep

**Files:**
- Modify: `packages/engine/src/services/db-store.ts`
- Modify: `packages/engine/src/services/data-explorer.ts`
- Modify: `packages/engine/src/migrations.ts`
- Modify: `packages/engine/src/migrations/appDb.ts`
- Modify: `packages/engine/src/services/tasks.ts`
- Modify: `packages/engine/src/services/kv-store.ts`
- Modify: `packages/engine/src/services/file-store.ts`
- Modify: `packages/engine/src/services/secret-store.ts`
- Modify: `packages/engine/src/services/gateways.ts`

**Interfaces:**
- Consumes: `openReadonlyDb`, `type ManagedDb` from `packages/engine/src/sqlite.ts` (Task 1).
- Produces: after this task, `src/sqlite.ts` is the only file in the engine that names `better-sqlite3`.

**Acceptance Criteria:**
- Both readonly constructions go through `openReadonlyDb`; the `/select` and data-explorer behavior (readonly connection, `fileMustExist`, close in `finally`) unchanged.
- `grep -rn "better-sqlite3" packages/engine/src --include="*.ts"` matches only `src/sqlite.ts`.
- `pnpm --filter @lodekit/engine check` clean; workspace `pnpm test` green.

- [ ] **Step 1: Convert `services/db-store.ts`**

```ts
// remove:
import type Database from "better-sqlite3";
import BetterSqlite3 from "better-sqlite3";
// add:
import { openReadonlyDb, type ManagedDb } from "../sqlite.js";
```

Annotations at lines 50 and 93: `Database.Database` → `ManagedDb`. The `/select` handler (line 163):

```ts
// before:
    const ro = new BetterSqlite3(c.var.dbPath, { readonly: true, fileMustExist: true });
// after:
    const ro = openReadonlyDb(c.var.dbPath);
```

The `fs.existsSync` 404 guard above it and the `finally { ro.close(); }` stay untouched.

- [ ] **Step 2: Convert `services/data-explorer.ts`**

```ts
// remove:
import BetterSqlite3 from "better-sqlite3";
// add:
import { openReadonlyDb } from "../sqlite.js";
```

Line 70: `const db = new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true });` → `const db = openReadonlyDb(dbPath);`.

- [ ] **Step 3: Re-point the seven annotation-only files**

In each file, replace `import type Database from "better-sqlite3";` with the seam type import, then replace every `Database.Database` with `ManagedDb`:

| File | Import to add | `Database.Database` sites |
|---|---|---|
| `packages/engine/src/migrations.ts` | `import type { ManagedDb } from "./sqlite.js";` | lines 9, 15 |
| `packages/engine/src/migrations/appDb.ts` | `import type { ManagedDb } from "../sqlite.js";` | line 8 |
| `packages/engine/src/services/tasks.ts` | `import type { ManagedDb } from "../sqlite.js";` | 17 sites (lines 67–396) |
| `packages/engine/src/services/kv-store.ts` | `import type { ManagedDb } from "../sqlite.js";` | 10 sites (lines 41–170) |
| `packages/engine/src/services/file-store.ts` | `import type { ManagedDb } from "../sqlite.js";` | lines 56, 87 |
| `packages/engine/src/services/secret-store.ts` | `import type { ManagedDb } from "../sqlite.js";` | lines 44, 107, 166, 179 |
| `packages/engine/src/services/gateways.ts` | `import type { ManagedDb } from "../sqlite.js";` | lines 42, 115, 311, 328, 335 |

Note on `migrations.ts`: this creates an import cycle with `sqlite.ts` that is **type-only on the migrations side** (`import type` is erased at compile), so no runtime require cycle exists under tsx. Do not "fix" it by moving code.

- [ ] **Step 4: Verify the sweep**

```bash
grep -rn "better-sqlite3" packages/engine/src --include="*.ts"
```

Expected: matches only in `packages/engine/src/sqlite.ts`.

```bash
pnpm --filter @lodekit/engine check
pnpm test
```

Expected: tsc clean; every workspace suite green (engine, sdk, ui, manager, integration-tests).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src
git commit -m "refactor(engine): readonly opens + ManagedDb annotations through the sqlite seam (<bead-id>)"
```

---

## Landing

Slice done = branch pushed + PR raised (person merges; never merge unattended):

- Branch: `sqlite-seam` (created from `master` at dispatch).
- PR title: `refactor(engine): centralize SQLite openers behind a sqlite.ts seam (#141)`
- Body: Summary (the seam + why: node:sqlite/Windows axis, issue #141), Notes (readonly opens and type annotations included by explicit scope decision; type-only cycle note; no changelog entry — internal), Test plan (new `tests/sqlite.test.ts`, engine suite, workspace `pnpm test`, grep sweep), `Closes #141`. No generated-with attribution.
