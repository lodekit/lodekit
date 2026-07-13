# Data Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/_dashboard/data` placeholder with a read-only, per-app data store explorer (relational tables, key-value, files, app events, overview with storage insights), per `docs/specs/2026-07-14-data-explorer-design.md` (GitHub issue #60).

**Architecture:** One new read-only runtime endpoint (`GET /api/apps/:appId/data/summary`) plus an additive `source=` filter on `/api/events/history`; everything else is dashboard UI that compiles grid state into parameterized SQL against the existing `POST /db-store/select` door and reuses the existing kv/file/event list endpoints. The `/data` route becomes a full-bleed layout route with an explorer-local sidebar.

**Tech Stack:** Hono + zod + better-sqlite3 (runtime); TanStack Start/Router + React Query + `@lodekit/ui` (`useDataTable`/`DataTable*` manual mode, chart kit/recharts) on the dashboard. **No new dependencies.**

## Global Constraints

- Read-only everywhere: never `INSERT/UPDATE/DELETE`, never open app DBs writable in new code (use `new BetterSqlite3(path, { readonly: true, fileMustExist: true })`).
- No new package dependencies (explicitly not `@tanstack/react-virtual`, JSON viewers, date libs — use `Intl`).
- Internal tables (`_`-prefixed, `sqlite_`-prefixed) must never appear in the UI or be queryable through it.
- Explorer events views/counts filter `ns = appId AND source = appId` (excludes `_platform` ns and platform-sourced change-feed records).
- Repo conventions: no `Co-Authored-By` trailers; commit directly on the current `service` branch; do NOT push or merge to master.
- `tsconfig` is NodeNext: files under `packages/runtime/tests/` must use `.js` suffixes on relative imports. Dashboard client files (under `dashboard/src/`) use suffix-less imports (bundler-resolved) and are NOT part of the `tsc --noEmit` program — but any dashboard file imported from `tests/` IS pulled into it, so `dashboard/src/lib/table-query.ts` and `dashboard/src/lib/format.ts` must remain dependency-free (no imports at all).
- All runtime commands from the repo root `/Users/sesv/Code/worktrees/lodekit/service`. Test runner: `pnpm --filter @lodekit/runtime test <file>` (vitest), typecheck: `pnpm --filter @lodekit/runtime check`.
- The dashboard build regenerates `dashboard/src/routeTree.gen.ts` (untracked, generated). After adding route files, run the dashboard build test to regenerate + verify: `pnpm --filter @lodekit/runtime test tests/dashboard.test.ts`.

## File Map

**Runtime (create):**
- `packages/runtime/src/services/data-explorer.ts` — summary service + routes (`CATALOG_NAME = "data"`).
- `packages/runtime/tests/data-explorer.test.ts` — unit tests (summary, heuristics, event source filter/count).
- `packages/runtime/tests/data-api.test.ts` — HTTP tests (`/data/summary`, `/events/history?source=`).

**Runtime (modify):**
- `packages/runtime/src/eventStore.ts` — `source` filter in `queryEvents`, new `countEvents`.
- `packages/runtime/src/routes.ts` — mount data routes; `source` param on `/events/history`.

**Dashboard (create):**
- `dashboard/src/lib/table-query.ts` — pure SQL compiler (dependency-free).
- `dashboard/src/lib/format.ts` — bytes/relative-time/number helpers (dependency-free).
- `dashboard/src/lib/data-api.ts` — typed fetchers for all explorer endpoints.
- `dashboard/src/components/data/explorer-sidebar.tsx` — app selector + store nav.
- `dashboard/src/components/data/detail-sheet.tsx` — generic record detail panel.
- `dashboard/src/components/data/table-toolbar.tsx` — search/filter-chips/sort-rules/refresh toolbar.
- `dashboard/src/routes/data/index.tsx` — redirect to first app / empty state.
- `dashboard/src/routes/data/$appId/index.tsx` — Overview.
- `dashboard/src/routes/data/$appId/tables/$table.tsx` — table browser.
- `dashboard/src/routes/data/$appId/kv.tsx`, `files.tsx`, `events.tsx`, `storage.tsx`.

**Dashboard (modify):**
- `dashboard/src/routes/data.tsx` — placeholder → layout route (sidebar + outlet, `fullBleed`).
- `dashboard/src/routes/__root.tsx` — honor `staticData.fullBleed`.
- `dashboard/src/components/sse.tsx` — `db-store-change`/`file-store-change` invalidations.

**Tests (create):** `packages/runtime/tests/table-query.test.ts` — compiler units.

**Docs (modify):** `web/docs/src/content/docs/guide/dashboard.mdx` (Data section), `docs/changelog.md` (buffer entry), `defer.md` (session deferrals).

(All `dashboard/…` paths above are under `packages/runtime/dashboard/…`.)

---

### Task 1: Event store `source` filter + `countEvents`

**Files:**
- Modify: `packages/runtime/src/eventStore.ts` (queryEvents ~line 88, EventQuery ~line 25)
- Modify: `packages/runtime/src/routes.ts` (`/events/history`, ~line 84)
- Create: `packages/runtime/tests/data-explorer.test.ts`

**Interfaces:**
- Consumes: existing `EventQuery`, `queryEvents`, `initEventStore`, `insertEvent`, `closeEventStoreForTest` from `src/eventStore.ts`.
- Produces: `EventQuery.source?: string`; `countEvents(opts?: { ns?: string; source?: string }): number`; `GET /api/events/history` accepts optional `source` (exact match, `NS_RE`-validated). Task 2 calls `countEvents` and `queryEvents({ ns, source, limit })`; Task 9 calls the history endpoint with `ns=&source=`.

- [ ] **Step 1: Write the failing tests**

Create `packages/runtime/tests/data-explorer.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initEventStore, insertEvent, queryEvents, countEvents, closeEventStoreForTest } from "../src/eventStore.js";

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-dataex-"));
  initEventStore(dataDir);
});
afterEach(() => {
  closeEventStoreForTest();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("event source filter", () => {
  it("queryEvents filters by exact source", () => {
    insertEvent({ ns: "plants", source: "plants", type: "watered" });
    insertEvent({ ns: "plants", source: "_platform", type: "kv-store-change" });
    const all = queryEvents({ ns: "plants" });
    expect(all.records).toHaveLength(2);
    const appOnly = queryEvents({ ns: "plants", source: "plants" });
    expect(appOnly.records).toHaveLength(1);
    expect(appOnly.records[0].type).toBe("watered");
  });

  it("countEvents counts with ns+source filters", () => {
    insertEvent({ ns: "plants", source: "plants", type: "watered" });
    insertEvent({ ns: "plants", source: "plants", type: "fed" });
    insertEvent({ ns: "plants", source: "_platform", type: "kv-store-change" });
    insertEvent({ ns: "other", source: "other", type: "x" });
    expect(countEvents({ ns: "plants", source: "plants" })).toBe(2);
    expect(countEvents({ ns: "plants" })).toBe(3);
    expect(countEvents()).toBe(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lodekit/runtime test tests/data-explorer.test.ts`
Expected: FAIL — `countEvents` is not exported (SyntaxError/undefined), and the source-filter assertion fails.

- [ ] **Step 3: Implement in `eventStore.ts`**

Add to the `EventQuery` interface (after `type?: string;`):

```ts
  source?: string;
```

In `queryEvents`, after the `if (opts.type) …` line add:

```ts
  if (opts.source) { where.push("source = ?"); params.push(opts.source); }
```

Add after `queryEvents` (before `sweepEventStore`):

```ts
export function countEvents(opts: { ns?: string; source?: string } = {}): number {
  if (!db) return 0;
  const where: string[] = ["(expires_at IS NULL OR expires_at > ?)"];
  const params: unknown[] = [Date.now()];
  if (opts.ns) { where.push("ns = ?"); params.push(opts.ns); }
  if (opts.source) { where.push("source = ?"); params.push(opts.source); }
  try {
    return (db.prepare(`SELECT COUNT(*) AS c FROM events WHERE ${where.join(" AND ")}`).get(...params) as { c: number }).c;
  } catch (e) {
    process.stderr.write(`[events] event count failed: ${e}\n`);
    return 0;
  }
}
```

- [ ] **Step 4: Extend the history route in `routes.ts`**

Replace the `/events/history` route (lines 84–91) with:

```ts
    .get(
      "/events/history",
      zValidator(
        "query",
        eventsQuery.extend({ ns: z.string().regex(NS_RE).optional(), source: z.string().regex(NS_RE).optional() }),
        validationHook
      ),
      (c) => {
        const { ns, source, type, after, before, limit } = c.req.valid("query");
        return c.json(queryEvents({ ns, source, type, after, before, limit }));
      }
    )
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime test tests/data-explorer.test.ts tests/eventStore.test.ts tests/event-api.test.ts`
Expected: all PASS (existing event tests must stay green — the new filter is additive).

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/eventStore.ts packages/runtime/src/routes.ts packages/runtime/tests/data-explorer.test.ts
git commit -m "feat(runtime): events history source filter + countEvents (#60)"
```

---

### Task 2: `data-explorer` summary service + mount

**Files:**
- Create: `packages/runtime/src/services/data-explorer.ts`
- Modify: `packages/runtime/src/routes.ts` (imports + mount)
- Modify: `packages/runtime/tests/data-explorer.test.ts` (append)
- Create: `packages/runtime/tests/data-api.test.ts`

**Interfaces:**
- Consumes: `userSchema`, `withDbStore`, `DbEnv` from `./db-store.js`; `countEvents`, `queryEvents` from `../eventStore.js`; `getAppDb` (tests only).
- Produces (Tasks 4–5 consume the JSON shape over HTTP):

```ts
export const CATALOG_NAME = "data";
export interface RecentItem { store: "table" | "kv" | "file" | "event"; label: string; detail?: string; at: number }
export interface DataSummary {
  tables: { name: string; rows: number; sizeBytes: number | null }[];
  kv: { count: number };
  files: { count: number; totalBytes: number };
  events: { count: number };
  dbFileBytes: number;
  recent: RecentItem[];
}
export function heuristicTsColumn(columns: { name: string }[]): string | null;
export function parseTsValue(v: unknown): number | null;
export function buildSummary(dbPath: string, appId: string): DataSummary;
export const dataRoutes: Hono<DbEnv>; // GET /summary
```

- Route: `GET /api/apps/:appId/data/summary` → `DataSummary` (200 for any valid app id, zeros when no db file; 400 invalid app id via `withDbStore`). Note (spec nuance, intended): events count/recents are real even when the app has no `db.sqlite` — events live in the platform store.

- [ ] **Step 1: Write the failing unit tests**

Append to `packages/runtime/tests/data-explorer.test.ts`:

```ts
import { getAppDb, closeAllDbsForTest } from "../src/db.js";
import { buildSummary, heuristicTsColumn, parseTsValue } from "../src/services/data-explorer.js";
```

(If `closeAllDbsForTest` does not exist in `src/db.ts`, check that file for the exported test-teardown helper the other suites use — e.g. grep `ForTest` in `src/db.ts` and `tests/kv-store.test.ts` — and use that; if there is none, omit the import and the teardown call.)

```ts
describe("summary heuristics", () => {
  it("heuristicTsColumn picks by priority, case-insensitive", () => {
    expect(heuristicTsColumn([{ name: "id" }, { name: "createdAt" }, { name: "ts" }])).toBe("createdAt");
    expect(heuristicTsColumn([{ name: "TS" }])).toBe("TS");
    expect(heuristicTsColumn([{ name: "id" }, { name: "title" }])).toBeNull();
  });

  it("parseTsValue handles epoch ms, epoch s, ISO text, junk", () => {
    expect(parseTsValue(1760400000000)).toBe(1760400000000);          // ms
    expect(parseTsValue(1760400000)).toBe(1760400000000);             // s -> ms
    expect(parseTsValue("2026-07-14T10:00:00Z")).toBe(Date.parse("2026-07-14T10:00:00Z"));
    expect(parseTsValue("banana")).toBeNull();
    expect(parseTsValue(42)).toBeNull();                              // too small to be an epoch
    expect(parseTsValue(null)).toBeNull();
  });
});

describe("buildSummary", () => {
  it("returns zeros (but real event count) when the app has no db", () => {
    insertEvent({ ns: "ghost", source: "ghost", type: "boo" });
    const s = buildSummary(path.join(dataDir, "ghost", "db.sqlite"), "ghost");
    expect(s.tables).toEqual([]);
    expect(s.kv.count).toBe(0);
    expect(s.files.count).toBe(0);
    expect(s.dbFileBytes).toBe(0);
    expect(s.events.count).toBe(1);
    expect(s.recent.map((r) => r.store)).toEqual(["event"]);
  });

  it("counts user tables, kv, files; merges heuristic recents; hides internals", () => {
    const db = getAppDb(dataDir, "plants");
    db.exec(`
      CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT, created_at INTEGER);
      CREATE TABLE plain (id INTEGER PRIMARY KEY, name TEXT);
      INSERT INTO notes (body, created_at) VALUES ('old', 1700000000000), ('new', 1760400000000);
      INSERT INTO plain (name) VALUES ('x'), ('y'), ('z');
    `);
    const now = Date.now();
    db.prepare("INSERT INTO _kv (key, value, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, NULL)")
      .run("cursor", "1", now - 5000, now - 5000);
    db.prepare(
      "INSERT INTO _files (slug, path, title, content_type, size, hash, metadata, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)"
    ).run("photo", "2026-07-14/photo-abc.jpg", "Photo", "image/jpeg", 2048, "h", null, now - 1000, now - 1000);
    insertEvent({ ns: "plants", source: "plants", type: "watered" });
    insertEvent({ ns: "plants", source: "_platform", type: "kv-store-change" });

    const s = buildSummary(path.join(dataDir, "plants", "db.sqlite"), "plants");
    expect(s.tables.map((t) => ({ name: t.name, rows: t.rows }))).toEqual([
      { name: "notes", rows: 2 },
      { name: "plain", rows: 3 },
    ]);
    for (const t of s.tables) expect(t.sizeBytes === null || t.sizeBytes > 0).toBe(true); // dbstat may be absent
    expect(s.kv.count).toBe(1);
    expect(s.files).toEqual({ count: 1, totalBytes: 2048 });
    expect(s.events.count).toBe(1); // platform-sourced change-feed excluded
    expect(s.dbFileBytes).toBeGreaterThan(0);
    // recent: newest-first; `plain` (no ts column) contributes nothing
    expect(s.recent.some((r) => r.store === "table" && r.label === "plain")).toBe(false);
    expect(s.recent.some((r) => r.store === "table" && r.label === "notes")).toBe(true);
    expect(s.recent.some((r) => r.store === "kv" && r.label === "cursor")).toBe(true);
    expect(s.recent.some((r) => r.store === "file" && r.label === "Photo")).toBe(true);
    expect(s.recent.some((r) => r.store === "event" && r.label === "watered")).toBe(true);
    const ats = s.recent.map((r) => r.at);
    expect([...ats].sort((a, b) => b - a)).toEqual(ats);
    expect(s.recent.length).toBeLessThanOrEqual(10);
  });
});
```

Add matching teardown so the plants db handle doesn't leak across tests (in the existing `afterEach`, before `fs.rmSync`): call the db-closing test helper found above (or skip if none exists — tmpdir removal still works on POSIX).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @lodekit/runtime test tests/data-explorer.test.ts`
Expected: FAIL — `src/services/data-explorer.ts` does not exist.

- [ ] **Step 3: Implement `packages/runtime/src/services/data-explorer.ts`**

```ts
// The data explorer's read side (spec 2026-07-14-data-explorer §2.1): one
// summary endpoint aggregating counts/sizes/recents across an app's stores.
// Strictly read-only — a short-lived readonly connection, like /select.
import fs from "node:fs";
import BetterSqlite3 from "better-sqlite3";
import { Hono } from "hono";
import { userSchema, type DbEnv } from "./db-store.js";
import { countEvents, queryEvents } from "../eventStore.js";

export const CATALOG_NAME = "data";

export interface RecentItem { store: "table" | "kv" | "file" | "event"; label: string; detail?: string; at: number }
export interface DataSummary {
  tables: { name: string; rows: number; sizeBytes: number | null }[];
  kv: { count: number };
  files: { count: number; totalBytes: number };
  events: { count: number };
  dbFileBytes: number;
  recent: RecentItem[];
}

const RECENT_PER_SOURCE = 5;
const RECENT_TOTAL = 10;
// Priority order; matched case-insensitively against column names.
const TS_COLUMNS = ["created_at", "createdat", "created", "inserted_at", "timestamp", "ts"];

export function heuristicTsColumn(columns: { name: string }[]): string | null {
  for (const want of TS_COLUMNS) {
    const hit = columns.find((c) => c.name.toLowerCase() === want);
    if (hit) return hit.name;
  }
  return null;
}

// Epoch numbers: >1e11 reads as ms, >1e8 as seconds; anything smaller is not a
// plausible timestamp. Strings go through Date.parse (ISO et al).
export function parseTsValue(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v > 1e11) return Math.floor(v);
    if (v > 1e8) return Math.floor(v * 1000);
    return null;
  }
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;

export function buildSummary(dbPath: string, appId: string): DataSummary {
  const eventsCount = countEvents({ ns: appId, source: appId });
  const recent: RecentItem[] = queryEvents({ ns: appId, source: appId, limit: RECENT_PER_SOURCE }).records.map(
    (r) => ({ store: "event" as const, label: r.type, at: r.ts })
  );
  const top = (items: RecentItem[]) => items.sort((a, b) => b.at - a.at).slice(0, RECENT_TOTAL);

  if (!fs.existsSync(dbPath)) {
    return {
      tables: [], kv: { count: 0 }, files: { count: 0, totalBytes: 0 },
      events: { count: eventsCount }, dbFileBytes: 0, recent: top(recent),
    };
  }

  const db = new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true });
  try {
    const now = Date.now();
    const schema = userSchema(db);

    // dbstat is a compile-time vtab; when absent, sizes degrade to null and the
    // UI falls back to the whole-file size.
    let sizes: Map<string, number> | null;
    try {
      sizes = new Map(
        (db.prepare("SELECT name, SUM(pgsize) AS s FROM dbstat GROUP BY name").all() as { name: string; s: number }[])
          .map((r) => [r.name, r.s])
      );
    } catch {
      sizes = null;
    }

    const tables = schema.tables.map((t) => ({
      name: t.name,
      rows: (db.prepare(`SELECT COUNT(*) AS c FROM ${quoteIdent(t.name)}`).get() as { c: number }).c,
      sizeBytes: sizes?.get(t.name) ?? null,
    }));

    const kvCount = (db.prepare("SELECT COUNT(*) AS c FROM _kv WHERE expires_at IS NULL OR expires_at > ?").get(now) as { c: number }).c;
    const f = db
      .prepare("SELECT COUNT(*) AS c, COALESCE(SUM(size), 0) AS b FROM _files WHERE expires_at IS NULL OR expires_at > ?")
      .get(now) as { c: number; b: number };

    for (const t of schema.tables) {
      const col = heuristicTsColumn(t.columns as { name: string }[]);
      if (!col) continue;
      const rows = db
        .prepare(`SELECT ${quoteIdent(col)} AS t FROM ${quoteIdent(t.name)} ORDER BY ${quoteIdent(col)} DESC LIMIT ?`)
        .all(RECENT_PER_SOURCE) as { t: unknown }[];
      for (const r of rows) {
        const at = parseTsValue(r.t);
        if (at != null) recent.push({ store: "table", label: t.name, detail: "row", at });
      }
    }
    recent.push(
      ...(db
        .prepare("SELECT key, created_at AS c FROM _kv WHERE expires_at IS NULL OR expires_at > ? ORDER BY created_at DESC LIMIT ?")
        .all(now, RECENT_PER_SOURCE) as { key: string; c: number }[]
      ).map((r) => ({ store: "kv" as const, label: r.key, at: r.c }))
    );
    recent.push(
      ...(db
        .prepare("SELECT slug, title, created_at AS c FROM _files WHERE expires_at IS NULL OR expires_at > ? ORDER BY created_at DESC LIMIT ?")
        .all(now, RECENT_PER_SOURCE) as { slug: string; title: string | null; c: number }[]
      ).map((r) => ({ store: "file" as const, label: r.title ?? r.slug, at: r.c }))
    );

    return {
      tables, kv: { count: kvCount }, files: { count: f.c, totalBytes: f.b },
      events: { count: eventsCount }, dbFileBytes: fs.statSync(dbPath).size, recent: top(recent),
    };
  } finally {
    db.close();
  }
}

// Chained style is normative; onError mirrors the other services (400 { error }).
export const dataRoutes = new Hono<DbEnv>()
  .onError((err, c) => c.json({ error: err instanceof Error ? err.message : String(err) }, 400))
  .get("/summary", (c) => c.json(buildSummary(c.var.dbPath, c.var.appId)));

export type DataRoutes = typeof dataRoutes;
```

- [ ] **Step 4: Mount in `routes.ts`**

Add import (with the other service imports):

```ts
import { dataRoutes, CATALOG_NAME as DATA } from "./services/data-explorer.js";
```

Add mount right after the db-store mount (`.route(\`/apps/:appId/${DB}\`, dbRoutes)`):

```ts
    .use(`/apps/:appId/${DATA}/*`, withDbStore(cfg))
    .route(`/apps/:appId/${DATA}`, dataRoutes)
```

(`withDbStore` already validates the app id and provides `dbPath`/`appId` — reuse it; add `withDbStore` to the existing db-store import if not already imported in `routes.ts` — it is, line 12.)

- [ ] **Step 5: Run unit tests**

Run: `pnpm --filter @lodekit/runtime test tests/data-explorer.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing HTTP tests**

Create `packages/runtime/tests/data-api.test.ts` (conventions copied from `tests/db-api.test.ts`):

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";
import type { Config } from "../src/config.js";
import { getAppDb } from "../src/db.js";
import { initEventStore, insertEvent, closeEventStoreForTest } from "../src/eventStore.js";

let root: string, server: Server, base: string;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-dataapi-"));
  const cfg: Config = {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: path.join(root, ".cache"),
    stateDir: path.join(root, ".state"),
    port: 0,
    baseUrl: "http://lodekit.localhost:0", secretsKeyProvider: "file",
    gatewaysDir: path.join(root, "gateways"),
  };
  initEventStore(cfg.dataDir);
  await new Promise<void>((resolve) => {
    server = createServer(cfg).listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterEach(() => {
  server.close();
  closeEventStoreForTest();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("GET /api/apps/:appId/data/summary", () => {
  it("400s an invalid app id", async () => {
    const r = await fetch(`${base}/api/apps/Bad_Id/data/summary`);
    expect(r.status).toBe(400);
  });

  it("returns zeros for a valid app with no db", async () => {
    const r = await fetch(`${base}/api/apps/ghost/data/summary`);
    expect(r.status).toBe(200);
    const s = await r.json();
    expect(s.tables).toEqual([]);
    expect(s.kv.count).toBe(0);
    expect(s.dbFileBytes).toBe(0);
  });

  it("reports tables/kv/recent for a populated app", async () => {
    const db = getAppDb(path.join(root, "data"), "plants");
    db.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, created_at INTEGER); INSERT INTO notes (created_at) VALUES (1760400000000);");
    db.prepare("INSERT INTO _kv (key, value, created_at, updated_at, expires_at) VALUES ('k','1',1,1,NULL)").run();
    const r = await fetch(`${base}/api/apps/plants/data/summary`);
    expect(r.status).toBe(200);
    const s = await r.json();
    expect(s.tables).toHaveLength(1);
    expect(s.tables[0]).toMatchObject({ name: "notes", rows: 1 });
    expect(s.kv.count).toBe(1);
    expect(s.recent.some((x: { store: string }) => x.store === "table")).toBe(true);
  });
});

describe("GET /api/events/history?source=", () => {
  it("filters by source", async () => {
    insertEvent({ ns: "plants", source: "plants", type: "watered" });
    insertEvent({ ns: "plants", source: "_platform", type: "kv-store-change" });
    const r = await fetch(`${base}/api/events/history?ns=plants&source=plants`);
    const d = await r.json();
    expect(d.records).toHaveLength(1);
    expect(d.records[0].type).toBe("watered");
  });

  it("rejects a malformed source", async () => {
    const r = await fetch(`${base}/api/events/history?source=Not%20Valid`);
    expect(r.status).toBe(400);
  });
});
```

- [ ] **Step 7: Run HTTP tests**

Run: `pnpm --filter @lodekit/runtime test tests/data-api.test.ts`
Expected: PASS (mount + route landed in Steps 3–4; if the summary route 404s, the mount chain position is wrong).

- [ ] **Step 8: Typecheck + full runtime suite, then commit**

Run: `pnpm --filter @lodekit/runtime check && pnpm --filter @lodekit/runtime test`
Expected: clean.

```bash
git add packages/runtime/src/services/data-explorer.ts packages/runtime/src/routes.ts packages/runtime/tests/data-explorer.test.ts packages/runtime/tests/data-api.test.ts
git commit -m "feat(runtime): per-app data summary endpoint for the explorer (#60)"
```

---

### Task 3: Dashboard pure libs — SQL compiler + formatters

**Files:**
- Create: `packages/runtime/dashboard/src/lib/table-query.ts` (NO imports — it's pulled into the NodeNext tsc program by its test)
- Create: `packages/runtime/dashboard/src/lib/format.ts` (NO imports)
- Create: `packages/runtime/tests/table-query.test.ts`

**Interfaces (produced; Tasks 4–6 consume):**

```ts
// table-query.ts
export type FilterOp = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains" | "isnull" | "notnull";
export interface FilterRule { column: string; op: FilterOp; value: string }
export interface SortRule { column: string; desc: boolean }
export interface QueryColumn { name: string; type: string }
export interface RowsQueryInput {
  table: string; columns: QueryColumn[]; filters: FilterRule[]; sorts: SortRule[];
  search: string; limit: number; offset: number;
}
export const OP_LABELS: Record<FilterOp, string>;
export function buildRowsQuery(i: RowsQueryInput): { sql: string; params: (string | number | null)[] };
export function buildCountQuery(i: Omit<RowsQueryInput, "sorts" | "limit" | "offset">): { sql: string; params: (string | number | null)[] };

// format.ts
export function formatBytes(n: number): string;
export function relativeTime(ts: number, now?: number): string;
export function formatCount(n: number): string;
export function formatTs(ts: number): string;
```

- [ ] **Step 1: Write the failing tests**

Create `packages/runtime/tests/table-query.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildRowsQuery, buildCountQuery } from "../dashboard/src/lib/table-query.js";
import { formatBytes, relativeTime } from "../dashboard/src/lib/format.js";

const COLS = [
  { name: "id", type: "INTEGER" },
  { name: "name", type: "TEXT" },
  { name: "note", type: "text" },
  { name: 'we"ird', type: "TEXT" },
  { name: "score", type: "REAL" },
];
const base = { table: "plants", columns: COLS, filters: [], sorts: [], search: "", limit: 50, offset: 0 };

describe("buildRowsQuery", () => {
  it("bare query selects * with limit/offset params", () => {
    const q = buildRowsQuery(base);
    expect(q.sql).toBe('SELECT * FROM "plants" LIMIT ? OFFSET ?');
    expect(q.params).toEqual([50, 0]);
  });

  it("rejects a column not in the schema", () => {
    expect(() => buildRowsQuery({ ...base, filters: [{ column: "evil", op: "eq", value: "1" }] })).toThrow();
    expect(() => buildRowsQuery({ ...base, sorts: [{ column: "evil", desc: false }] })).toThrow();
  });

  it("escapes quoted identifiers", () => {
    const q = buildRowsQuery({ ...base, sorts: [{ column: 'we"ird', desc: false }] });
    expect(q.sql).toContain('ORDER BY "we""ird" ASC');
  });

  it("compiles each operator; numeric values coerce on numeric columns", () => {
    const q = buildRowsQuery({
      ...base,
      filters: [
        { column: "id", op: "gte", value: "5" },
        { column: "name", op: "ne", value: "fern" },
        { column: "score", op: "lt", value: "1.5" },
        { column: "note", op: "isnull", value: "" },
      ],
    });
    expect(q.sql).toBe(
      'SELECT * FROM "plants" WHERE "id" >= ? AND "name" <> ? AND "score" < ? AND "note" IS NULL LIMIT ? OFFSET ?'
    );
    expect(q.params).toEqual([5, "fern", 1.5, 50, 0]);
  });

  it("contains uses escaped LIKE", () => {
    const q = buildRowsQuery({ ...base, filters: [{ column: "name", op: "contains", value: "50%_x" }] });
    expect(q.sql).toContain(`"name" LIKE ? ESCAPE '\\'`);
    expect(q.params[0]).toBe("%50\\%\\_x%");
  });

  it("search ORs LIKE across TEXT-affinity columns only", () => {
    const q = buildRowsQuery({ ...base, search: "fern" });
    expect(q.sql).toBe(
      `SELECT * FROM "plants" WHERE ("name" LIKE ? ESCAPE '\\' OR "note" LIKE ? ESCAPE '\\' OR "we""ird" LIKE ? ESCAPE '\\') LIMIT ? OFFSET ?`
    );
    expect(q.params).toEqual(["%fern%", "%fern%", "%fern%", 50, 0]);
  });

  it("search with no TEXT columns is a no-op", () => {
    const q = buildRowsQuery({ ...base, columns: [{ name: "id", type: "INTEGER" }], search: "x" });
    expect(q.sql).toBe('SELECT * FROM "plants" LIMIT ? OFFSET ?');
  });

  it("multi-sort preserves precedence order", () => {
    const q = buildRowsQuery({ ...base, sorts: [{ column: "score", desc: true }, { column: "id", desc: false }] });
    expect(q.sql).toContain('ORDER BY "score" DESC, "id" ASC');
  });
});

describe("buildCountQuery", () => {
  it("counts with the same WHERE, no order/limit", () => {
    const q = buildCountQuery({ table: "plants", columns: COLS, filters: [{ column: "id", op: "gt", value: "1" }], search: "" });
    expect(q.sql).toBe('SELECT COUNT(*) AS n FROM "plants" WHERE "id" > ?');
    expect(q.params).toEqual([1]);
  });
});

describe("format", () => {
  it("formatBytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(15_728_640)).toBe("15 MB");
  });
  it("relativeTime", () => {
    const now = 1_760_400_000_000;
    expect(relativeTime(now - 30_000, now)).toMatch(/second/);
    expect(relativeTime(now - 5 * 60_000, now)).toMatch(/minute/);
    expect(relativeTime(now - 3 * 3_600_000, now)).toMatch(/hour/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @lodekit/runtime test tests/table-query.test.ts`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement `dashboard/src/lib/table-query.ts`**

```ts
// Compiles explorer grid state into parameterized SQL for the runtime's
// read-only /db-store/select door. Identifiers are only accepted when present
// in the server-reported schema and are always quote-escaped; values always
// travel as bound params. Dependency-free on purpose: this file is unit-tested
// from packages/runtime/tests under the NodeNext tsc program.

export type FilterOp = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains" | "isnull" | "notnull";
export interface FilterRule { column: string; op: FilterOp; value: string }
export interface SortRule { column: string; desc: boolean }
export interface QueryColumn { name: string; type: string }
export interface RowsQueryInput {
  table: string;
  columns: QueryColumn[];
  filters: FilterRule[];
  sorts: SortRule[];
  search: string;
  limit: number;
  offset: number;
}

export const OP_LABELS: Record<FilterOp, string> = {
  eq: "=", ne: "≠", gt: ">", gte: "≥", lt: "<", lte: "≤",
  contains: "contains", isnull: "is null", notnull: "is not null",
};

const OP_SQL: Record<Exclude<FilterOp, "contains" | "isnull" | "notnull">, string> = {
  eq: "=", ne: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=",
};

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const escapeLike = (v: string) => v.replace(/[\\%_]/g, (m) => "\\" + m);
const NUMERIC = /INT|REAL|FLOA|DOUB|NUM|DEC/i;
const TEXTUAL = /CHAR|CLOB|TEXT/i;

function resolve(columns: QueryColumn[], name: string): QueryColumn {
  const col = columns.find((c) => c.name === name);
  if (!col) throw new Error(`unknown column: ${name}`);
  return col;
}

function coerce(col: QueryColumn, value: string): string | number {
  if (NUMERIC.test(col.type)) {
    const n = Number(value);
    if (Number.isFinite(n) && value.trim() !== "") return n;
  }
  return value;
}

function whereClause(i: { columns: QueryColumn[]; filters: FilterRule[]; search: string }): { where: string; params: (string | number | null)[] } {
  const parts: string[] = [];
  const params: (string | number | null)[] = [];
  for (const f of i.filters) {
    const col = resolve(i.columns, f.column);
    if (f.op === "isnull") parts.push(`${quote(col.name)} IS NULL`);
    else if (f.op === "notnull") parts.push(`${quote(col.name)} IS NOT NULL`);
    else if (f.op === "contains") {
      parts.push(`${quote(col.name)} LIKE ? ESCAPE '\\'`);
      params.push(`%${escapeLike(f.value)}%`);
    } else {
      parts.push(`${quote(col.name)} ${OP_SQL[f.op]} ?`);
      params.push(coerce(col, f.value));
    }
  }
  if (i.search) {
    const text = i.columns.filter((c) => TEXTUAL.test(c.type));
    if (text.length > 0) {
      parts.push(`(${text.map((c) => `${quote(c.name)} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
      for (const _ of text) params.push(`%${escapeLike(i.search)}%`);
    }
  }
  return { where: parts.length ? ` WHERE ${parts.join(" AND ")}` : "", params };
}

export function buildRowsQuery(i: RowsQueryInput): { sql: string; params: (string | number | null)[] } {
  const { where, params } = whereClause(i);
  let order = "";
  if (i.sorts.length > 0) {
    order = ` ORDER BY ${i.sorts.map((s) => `${quote(resolve(i.columns, s.column).name)} ${s.desc ? "DESC" : "ASC"}`).join(", ")}`;
  }
  return { sql: `SELECT * FROM ${quote(i.table)}${where}${order} LIMIT ? OFFSET ?`, params: [...params, i.limit, i.offset] };
}

export function buildCountQuery(i: Omit<RowsQueryInput, "sorts" | "limit" | "offset">): { sql: string; params: (string | number | null)[] } {
  const { where, params } = whereClause(i);
  return { sql: `SELECT COUNT(*) AS n FROM ${quote(i.table)}${where}`, params };
}
```

- [ ] **Step 4: Implement `dashboard/src/lib/format.ts`**

```ts
// Display formatting helpers (Intl only — no date/number libraries).
// Dependency-free on purpose: unit-tested from packages/runtime/tests.

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "–";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n;
  let i = -1;
  do { v /= 1024; i++; } while (v >= 1024 && i < units.length - 1);
  return `${v >= 10 ? String(Math.round(v)) : v.toFixed(1)} ${units[i]}`;
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function relativeTime(ts: number, now: number = Date.now()): string {
  const s = Math.round((ts - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(s, "second");
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}

export const formatCount = (n: number): string => new Intl.NumberFormat().format(n);
export const formatTs = (ts: number): string => new Date(ts).toLocaleString();
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @lodekit/runtime test tests/table-query.test.ts && pnpm --filter @lodekit/runtime check`
Expected: PASS, clean typecheck (this proves the NodeNext import of the two dashboard files works).

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/dashboard/src/lib/table-query.ts packages/runtime/dashboard/src/lib/format.ts packages/runtime/tests/table-query.test.ts
git commit -m "feat(dashboard): explorer SQL compiler + format helpers (#60)"
```

---

### Task 4: Explorer shell — fetchers, full-bleed layout, sidebar, index redirect, storage stub

**Files:**
- Create: `packages/runtime/dashboard/src/lib/data-api.ts`
- Create: `packages/runtime/dashboard/src/components/data/explorer-sidebar.tsx`
- Modify: `packages/runtime/dashboard/src/routes/data.tsx` (placeholder → layout)
- Modify: `packages/runtime/dashboard/src/routes/__root.tsx` (fullBleed)
- Create: `packages/runtime/dashboard/src/routes/data/index.tsx`
- Create: `packages/runtime/dashboard/src/routes/data/$appId/index.tsx` (placeholder body; Task 5 fills it)
- Create: `packages/runtime/dashboard/src/routes/data/$appId/tables/$table.tsx` (placeholder body; Task 6 fills it)
- Create: `packages/runtime/dashboard/src/routes/data/$appId/kv.tsx`, `files.tsx`, `events.tsx` (placeholder bodies; Tasks 7–9 fill them)
- Create: `packages/runtime/dashboard/src/routes/data/$appId/storage.tsx` (final)

**Interfaces:**
- Consumes: `/api/apps`, `/db-store/schema`, Task 2's `/data/summary`, Task 3 types.
- Produces: `lib/data-api.ts` fetchers + client-side types used by Tasks 5–9 (exact code below); route tree paths `/data/$appId/...`; query keys — apps: `["apps"]`, schema: `["data", appId, "schema"]`, summary: `["data", appId, "summary"]`, rows: `["data", appId, "rows", table, state]`, kv: `["kv", appId, ...]`, files: `["data", appId, "files", ...]`.

- [ ] **Step 1: Create `dashboard/src/lib/data-api.ts`**

```ts
// Typed fetchers for the data explorer. Raw fetch + React Query is the
// dashboard idiom — no client SDK.

export interface AppManifest { appId: string; name: string; icon?: string; description?: string }
export interface SchemaColumn { name: string; type: string; notNull: boolean; default: unknown; pk: boolean }
export interface SchemaTable { name: string; columns: SchemaColumn[]; indexes: string[] }
export interface DataSummary {
  tables: { name: string; rows: number; sizeBytes: number | null }[];
  kv: { count: number };
  files: { count: number; totalBytes: number };
  events: { count: number };
  dbFileBytes: number;
  recent: { store: "table" | "kv" | "file" | "event"; label: string; detail?: string; at: number }[];
}
export interface KvEntry { key: string; value: unknown; createdAt: number; updatedAt: number; expiresAt: number | null }
export interface FileStat {
  slug: string; title: string | null; contentType: string; size: number; hash: string;
  metadata: Record<string, unknown> | null; createdAt: number; updatedAt: number; expiresAt: number | null;
  url: string; path: string;
}
export interface EventRecord { id: number; ts: number; ns: string; source: string; type: string; payload: Record<string, unknown> | null }

async function json<T>(r: Response): Promise<T> {
  const body: unknown = await r.json().catch(() => null);
  if (!r.ok) throw new Error((body as { error?: string } | null)?.error ?? `HTTP ${r.status}`);
  return body as T;
}

export const fetchApps = (): Promise<AppManifest[]> => fetch("/api/apps").then((r) => json<AppManifest[]>(r));

export const fetchSchema = (appId: string): Promise<{ tables: SchemaTable[] }> =>
  fetch(`/api/apps/${appId}/db-store/schema`).then((r) => json<{ tables: SchemaTable[] }>(r));

export const fetchSummary = (appId: string): Promise<DataSummary> =>
  fetch(`/api/apps/${appId}/data/summary`).then((r) => json<DataSummary>(r));

// 404 = "no database for this app yet" — surfaces as an empty result, not an error.
export async function selectRows(appId: string, q: { sql: string; params: (string | number | null)[] }): Promise<Record<string, unknown>[]> {
  const r = await fetch(`/api/apps/${appId}/db-store/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(q),
  });
  if (r.status === 404) return [];
  return (await json<{ rows: Record<string, unknown>[] }>(r)).rows;
}

export function fetchKv(appId: string, opts: { prefix?: string; cursor?: string; limit?: number } = {}): Promise<{ entries: KvEntry[]; nextCursor: string | null }> {
  const q = new URLSearchParams();
  if (opts.prefix) q.set("prefix", opts.prefix);
  if (opts.cursor) q.set("cursor", opts.cursor);
  q.set("limit", String(opts.limit ?? 50));
  return fetch(`/api/apps/${appId}/kv-store?${q}`).then((r) => json<{ entries: KvEntry[]; nextCursor: string | null }>(r));
}

export function fetchFiles(appId: string, opts: { prefix?: string; cursor?: string; limit?: number } = {}): Promise<{ entries: FileStat[]; nextCursor: string | null }> {
  const q = new URLSearchParams();
  if (opts.prefix) q.set("prefix", opts.prefix);
  if (opts.cursor) q.set("cursor", opts.cursor);
  q.set("limit", String(opts.limit ?? 50));
  return fetch(`/api/apps/${appId}/file-store?${q}`).then((r) => json<{ entries: FileStat[]; nextCursor: string | null }>(r));
}

// App events only: ns = source = appId (design §2.2).
export function fetchAppEvents(appId: string, opts: { type?: string; before?: number; limit?: number } = {}): Promise<{ records: EventRecord[]; next: number | null }> {
  const q = new URLSearchParams({ ns: appId, source: appId, limit: String(opts.limit ?? 50) });
  if (opts.type) q.set("type", opts.type);
  if (opts.before != null) q.set("before", String(opts.before));
  return fetch(`/api/events/history?${q}`).then((r) => json<{ records: EventRecord[]; next: number | null }>(r));
}
```

- [ ] **Step 2: `__root.tsx` honors `fullBleed`**

Add `useMatches` to the router import and a module augmentation; make `<main>` conditional. Full new file:

```tsx
import { HeadContent, Outlet, Scripts, createRootRoute, useMatches } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import appCss from "../index.css?url";
import { SSEProvider } from "../components/sse";
import { Header } from "../components/header";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    fullBleed?: boolean;
  }
}

const queryClient = new QueryClient();

// Injected by the runtime's dashboard build (build.ts defines) — never present in app builds.
declare const __LODEKIT_VERSION__: string;
declare const __LODEKIT_COMMIT__: string | null;

const versionLine = `lodekit v${__LODEKIT_VERSION__}${__LODEKIT_COMMIT__ ? ` ${__LODEKIT_COMMIT__}` : ""}`;

function Main() {
  const fullBleed = useMatches().some((m) => m.staticData?.fullBleed);
  return (
    <main className={fullBleed ? "w-full min-w-80 flex-1" : "mx-auto w-full min-w-80 max-w-[70rem] flex-1 px-4 py-6 md:px-8"}>
      <Outlet />
    </main>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: "Lodekit" }],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: () => (
    <html lang="en">
      <head>
        <HeadContent />
        {/* Theme before hydration — no dark-mode flash. Served by the runtime
            from the effective appearance.theme setting; system mode keeps the
            OS media query (settings spec §8). */}
        <script src="/_ui/theme.js" />
      </head>
      <body className="flex min-h-screen flex-col">
        <QueryClientProvider client={queryClient}>
          <SSEProvider>
            <Header />
            <Main />
          </SSEProvider>
        </QueryClientProvider>
        <footer className="text-muted-foreground py-4 text-center text-xs">{versionLine}</footer>
        <Scripts />
      </body>
    </html>
  ),
});
```

- [ ] **Step 3: Create `components/data/explorer-sidebar.tsx`**

```tsx
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Badge, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, Skeleton, cn } from "@lodekit/ui";
import { Database, Folder, KeyRound, LayoutDashboard, Table2, Zap, HardDrive, type LucideIcon } from "lucide-react";
import { fetchApps, fetchSchema } from "../../lib/data-api";

const itemClass =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground";
const activeClass = "bg-accent text-accent-foreground";

function NavItem({ to, params, icon: Icon, label, exact, badge }: {
  to: string; params: Record<string, string>; icon: LucideIcon; label: string; exact?: boolean; badge?: string;
}) {
  return (
    <Link to={to} params={params} className={itemClass} activeProps={{ className: cn(itemClass, activeClass) }} activeOptions={{ exact: exact ?? false }}>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
      {badge && <Badge variant="secondary" className="ml-auto">{badge}</Badge>}
    </Link>
  );
}

export function ExplorerSidebar() {
  const { appId } = useParams({ strict: false }) as { appId?: string };
  const navigate = useNavigate();
  const apps = useQuery({ queryKey: ["apps"], queryFn: fetchApps });
  const schema = useQuery({
    queryKey: ["data", appId, "schema"],
    queryFn: () => fetchSchema(appId!),
    enabled: !!appId,
  });

  return (
    <aside className="w-56 shrink-0 border-r px-3 py-4">
      {apps.data ? (
        <Select
          value={appId ?? ""}
          onValueChange={(v) => { if (v) void navigate({ to: "/data/$appId", params: { appId: v } }); }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select an app" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {apps.data.map((a) => (
                <SelectItem key={a.appId} value={a.appId}>{a.name}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : (
        <Skeleton className="h-9 w-full" />
      )}
      {appId && (
        <nav className="mt-4 flex flex-col gap-0.5">
          <NavItem to="/data/$appId" params={{ appId }} icon={LayoutDashboard} label="Overview" exact />
          <div className="text-muted-foreground/70 mt-3 mb-1 flex items-center gap-2 px-2 text-xs font-medium uppercase tracking-wide">
            <Database className="size-3.5" aria-hidden="true" /> Tables
          </div>
          {schema.isLoading && <Skeleton className="mx-2 h-16" />}
          {schema.data?.tables.length === 0 && <p className="text-muted-foreground px-2 py-1 text-xs">No tables yet.</p>}
          {schema.data?.tables.map((t) => (
            <Link
              key={t.name}
              to="/data/$appId/tables/$table"
              params={{ appId, table: t.name }}
              className={cn(itemClass, "pl-4")}
              activeProps={{ className: cn(itemClass, "pl-4", activeClass) }}
            >
              <Table2 className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate font-mono text-xs">{t.name}</span>
            </Link>
          ))}
          <div className="mt-3 flex flex-col gap-0.5">
            <NavItem to="/data/$appId/kv" params={{ appId }} icon={KeyRound} label="Key-value" />
            <NavItem to="/data/$appId/files" params={{ appId }} icon={Folder} label="Files" />
            <NavItem to="/data/$appId/events" params={{ appId }} icon={Zap} label="Events" />
            <NavItem to="/data/$appId/storage" params={{ appId }} icon={HardDrive} label="Storage" badge="Soon" />
          </div>
        </nav>
      )}
    </aside>
  );
}
```

(If `cn` is not exported from `@lodekit/ui`'s index, import nothing and inline template strings instead — check `packages/ui/src/index.ts` for a `cn`/utils export first.)

- [ ] **Step 4: Replace `routes/data.tsx` with the layout route**

```tsx
import { Navigate, Outlet, createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchApps } from "../lib/data-api";
import { ExplorerSidebar } from "../components/data/explorer-sidebar";

export const Route = createFileRoute("/data")({
  staticData: { fullBleed: true },
  component: DataLayout,
});

function DataLayout() {
  const { appId } = useParams({ strict: false }) as { appId?: string };
  const apps = useQuery({ queryKey: ["apps"], queryFn: fetchApps });
  // Unknown app id (deleted app, stale link) → back to the explorer root.
  if (appId && apps.data && !apps.data.some((a) => a.appId === appId)) {
    return <Navigate to="/data" replace />;
  }
  return (
    <div className="flex min-h-full">
      <ExplorerSidebar />
      <div className="min-w-0 flex-1 px-4 py-6 md:px-8">
        <Outlet />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `routes/data/index.tsx` (redirect / empty state)**

```tsx
import { Navigate, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Database } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle, Skeleton } from "@lodekit/ui";
import { fetchApps } from "../../lib/data-api";

export const Route = createFileRoute("/data/")({
  component: DataIndex,
});

function DataIndex() {
  const apps = useQuery({ queryKey: ["apps"], queryFn: fetchApps });
  if (!apps.data) return <Skeleton className="h-32" />;
  if (apps.data.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Database aria-hidden="true" /></EmptyMedia>
          <EmptyTitle role="heading" aria-level={1}>Data</EmptyTitle>
          <EmptyDescription>No apps yet — ask your agent to build one, then explore its data here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return <Navigate to="/data/$appId" params={{ appId: apps.data[0].appId }} replace />;
}
```

- [ ] **Step 6: Create `routes/data/$appId/storage.tsx` (final) and placeholder bodies for the other views**

`storage.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { HardDrive } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@lodekit/ui";

export const Route = createFileRoute("/data/$appId/storage")({
  component: () => (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon"><HardDrive aria-hidden="true" /></EmptyMedia>
        <EmptyTitle role="heading" aria-level={1}>Storage</EmptyTitle>
        <EmptyDescription>Coming soon — a breakdown of this app's disk usage over time.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  ),
});
```

Placeholders (each replaced by its own later task — keep bodies minimal). `routes/data/$appId/index.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/data/$appId/")({
  component: () => <p className="text-muted-foreground text-sm">Overview</p>,
});
```

`routes/data/$appId/tables/$table.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/data/$appId/tables/$table")({
  component: () => <p className="text-muted-foreground text-sm">Table</p>,
});
```

`routes/data/$appId/kv.tsx` / `files.tsx` / `events.tsx` — same shape with paths `/data/$appId/kv`, `/data/$appId/files`, `/data/$appId/events` and bodies `Key-value` / `Files` / `Events`.

- [ ] **Step 7: Regenerate route tree + verify the dashboard builds**

Run: `pnpm --filter @lodekit/runtime test tests/dashboard.test.ts`
Expected: PASS (the Start build regenerates `routeTree.gen.ts` and compiles the new routes; a type error in any route fails here).

Then: `pnpm --filter @lodekit/runtime check` — expected clean (route files aren't in the tsc program, but the modified libs are via tests).

- [ ] **Step 8: Manual smoke**

Run: `pnpm dev` (root). Open `http://localhost:7777/_dashboard/data` (check the port in the dev output).
Expected: full-bleed page, sidebar with app selector; picking `greenhouse` shows Overview/Tables(list)/Key-value/Files/Events/Storage(Soon); navigation works; other dashboard pages still center-constrained. Stop the server.

- [ ] **Step 9: Commit**

```bash
git add packages/runtime/dashboard/src/lib/data-api.ts packages/runtime/dashboard/src/components/data/explorer-sidebar.tsx packages/runtime/dashboard/src/routes/data.tsx packages/runtime/dashboard/src/routes/__root.tsx packages/runtime/dashboard/src/routes/data
git commit -m "feat(dashboard): data explorer shell — sidebar layout, routes, storage stub (#60)"
```

---

### Task 5: Overview view

**Files:**
- Modify: `packages/runtime/dashboard/src/routes/data/$appId/index.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `fetchSummary`, `DataSummary` (Task 4); `formatBytes`, `formatCount`, `relativeTime` (Task 3); `@lodekit/ui` chart kit; recharts (already a `@lodekit/ui` dependency — import from `"recharts"` exactly as `root/apps/greenhouse/src/routes/almanac.tsx` does).
- Produces: nothing downstream.

- [ ] **Step 1: Implement the overview**

Replace `routes/data/$appId/index.tsx`:

```tsx
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Badge, Card, CardContent, CardHeader, CardTitle,
  ChartContainer, ChartTooltip, ChartTooltipContent, Skeleton,
  type ChartConfig,
} from "@lodekit/ui";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { fetchSummary, type DataSummary } from "../../../lib/data-api";
import { formatBytes, formatCount, relativeTime } from "../../../lib/format";

export const Route = createFileRoute("/data/$appId/")({
  component: Overview,
});

const objectsConfig = { count: { label: "Objects", color: "var(--chart-1)" } } satisfies ChartConfig;
const sizeConfig = { size: { label: "Size", color: "var(--chart-2)" } } satisfies ChartConfig;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-1"><CardTitle className="text-muted-foreground text-xs font-medium">{label}</CardTitle></CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </CardContent>
    </Card>
  );
}

const STORE_VIEW: Record<DataSummary["recent"][number]["store"], { label: string; to: string }> = {
  table: { label: "table", to: "/data/$appId/tables/$table" },
  kv: { label: "kv", to: "/data/$appId/kv" },
  file: { label: "file", to: "/data/$appId/files" },
  event: { label: "event", to: "/data/$appId/events" },
};

function Overview() {
  const { appId } = Route.useParams();
  const q = useQuery({ queryKey: ["data", appId, "summary"], queryFn: () => fetchSummary(appId) });

  if (q.isError) return <p className="text-destructive text-sm">Failed to load summary: {(q.error as Error).message}</p>;
  if (!q.data) return <Skeleton className="h-64" />;
  const s = q.data;
  const totalRows = s.tables.reduce((n, t) => n + t.rows, 0);
  const objects = [
    { store: "Tables", count: totalRows },
    { store: "Key-value", count: s.kv.count },
    { store: "Files", count: s.files.count },
    { store: "Events", count: s.events.count },
  ];
  const sized = s.tables.filter((t) => t.sizeBytes != null);
  const sizes = sized.map((t) => ({ table: t.name, size: t.sizeBytes! })).sort((a, b) => b.size - a.size).slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Table rows" value={formatCount(totalRows)} hint={`${s.tables.length} table${s.tables.length === 1 ? "" : "s"}`} />
        <Stat label="Key-value entries" value={formatCount(s.kv.count)} />
        <Stat label="Files" value={formatCount(s.files.count)} hint={formatBytes(s.files.totalBytes)} />
        <Stat label="Events" value={formatCount(s.events.count)} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Objects per store</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={objectsConfig} className="aspect-[2/1] w-full">
              <BarChart data={objects} layout="vertical" margin={{ left: 8, right: 8 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="store" width={80} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Estimated size per table
              <span className="text-muted-foreground ml-2 font-normal">db file {formatBytes(s.dbFileBytes)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sizes.length > 0 ? (
              <ChartContainer config={sizeConfig} className="aspect-[2/1] w-full">
                <BarChart data={sizes} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="table" width={100} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatBytes(Number(v))} />} />
                  <Bar dataKey="size" fill="var(--color-size)" radius={4} />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-muted-foreground text-sm">
                {s.tables.length === 0 ? "No tables yet." : "Per-table sizes unavailable in this build."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {s.tables.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium">Tables</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {s.tables.map((t) => (
              <Link key={t.name} to="/data/$appId/tables/$table" params={{ appId, table: t.name }}>
                <Card className="hover:bg-accent/50 transition-colors">
                  <CardContent className="pt-4">
                    <p className="truncate font-mono text-sm">{t.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatCount(t.rows)} rows{t.sizeBytes != null ? ` · ${formatBytes(t.sizeBytes)}` : ""}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-medium">Recent activity</h2>
        {s.recent.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing stored yet.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {s.recent.map((r, i) => (
              <Link
                key={i}
                to={STORE_VIEW[r.store].to}
                params={r.store === "table" ? { appId, table: r.label } : { appId }}
                className="hover:bg-accent/50 flex items-center gap-3 px-3 py-2 text-sm"
              >
                <Badge variant="secondary" className="w-14 justify-center">{STORE_VIEW[r.store].label}</Badge>
                <span className="min-w-0 truncate font-mono text-xs">{r.label}</span>
                {r.detail && <span className="text-muted-foreground text-xs">{r.detail}</span>}
                <span className="text-muted-foreground ml-auto shrink-0 text-xs">{relativeTime(r.at)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build + smoke**

Run: `pnpm --filter @lodekit/runtime test tests/dashboard.test.ts`
Expected: PASS.
Then `pnpm dev`, open `/_dashboard/data`, pick greenhouse: stat cards populated, both charts render (size chart may show the fallback line), table shortcuts navigate, recent list shows mixed stores with relative times. Stop the server.

- [ ] **Step 3: Commit**

```bash
git add packages/runtime/dashboard/src/routes/data/\$appId/index.tsx
git commit -m "feat(dashboard): data explorer overview — stats, charts, recent activity (#60)"
```

---

### Task 6: Table browser

**Files:**
- Create: `packages/runtime/dashboard/src/components/data/detail-sheet.tsx`
- Create: `packages/runtime/dashboard/src/components/data/table-toolbar.tsx`
- Modify: `packages/runtime/dashboard/src/routes/data/$appId/tables/$table.tsx` (replace placeholder)
- Modify: `packages/runtime/src/build.ts` (alias allowlist, ~lines 24–25 and 241–242)

**Interfaces:**
- Consumes: Task 3 compiler (`buildRowsQuery`, `buildCountQuery`, `FilterRule`, `SortRule`, `OP_LABELS`, `FilterOp`), Task 4 fetchers (`fetchSchema`, `selectRows`, `SchemaColumn`), `useDataTable`/`DataTableColumnHeader`/`DataTablePagination`/`flexRender`-equivalents from `@lodekit/ui` + `@tanstack/react-table` types re-exported by it.
- Produces: `DetailSheet` (`{ open, title, fields: { label: string; value: unknown }[], onClose }`) and `TableToolbar` (props in code below) — `DetailSheet` is reused by Tasks 7–8.

- [ ] **Step 0: Alias `@tanstack/react-table` for the dashboard build**

The table browser imports `flexRender` from `@tanstack/react-table`, which is `@lodekit/ui`'s dependency, not the runtime's — like `lucide-react`/`recharts` it must be aliased in `packages/runtime/src/build.ts` or the dashboard build can't resolve it. Next to the existing lines 24–25 add:

```ts
const reactTableDir = path.dirname(uiRequire.resolve("@tanstack/react-table/package.json"));
```

And in the alias array next to lines 241–242 add:

```ts
  { find: "@tanstack/react-table", replacement: reactTableDir },
```

(Match the comment style of the existing block — extend the comment at line 20 to mention `@tanstack/react-table`.)

- [ ] **Step 1: Create `components/data/detail-sheet.tsx`**

```tsx
import { useState } from "react";
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle } from "@lodekit/ui";
import { Check, Copy } from "lucide-react";

export interface DetailField { label: string; value: unknown }

function display(value: unknown): { text: string; pre: boolean } {
  if (value === null || value === undefined) return { text: "NULL", pre: false };
  if (typeof value === "string") {
    try {
      return { text: JSON.stringify(JSON.parse(value), null, 2), pre: true };
    } catch {
      return { text: value, pre: value.length > 80 };
    }
  }
  if (typeof value === "object") return { text: JSON.stringify(value, null, 2), pre: true };
  return { text: String(value), pre: false };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-6 shrink-0"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      <span className="sr-only">Copy value</span>
    </Button>
  );
}

export function DetailSheet({ open, title, fields, onClose }: {
  open: boolean; title: string; fields: DetailField[]; onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="truncate font-mono text-sm">{title}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-6">
          {fields.map((f) => {
            const d = display(f.value);
            return (
              <div key={f.label}>
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground font-mono text-xs">{f.label}</p>
                  {f.value != null && <CopyButton text={d.text} />}
                </div>
                {d.pre ? (
                  <pre className="bg-muted mt-1 overflow-x-auto rounded p-2 text-xs whitespace-pre-wrap break-all">{d.text}</pre>
                ) : (
                  <p className={`text-sm break-all ${f.value == null ? "text-muted-foreground/60 italic" : ""}`}>{d.text}</p>
                )}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Create `components/data/table-toolbar.tsx`**

```tsx
import { useState } from "react";
import {
  Badge, Button, Input, Popover, PopoverContent, PopoverTrigger,
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "@lodekit/ui";
import { ArrowDown, ArrowUp, ArrowUpDown, ListFilter, RefreshCw, X } from "lucide-react";
import { OP_LABELS, type FilterOp, type FilterRule, type SortRule } from "../../lib/table-query";

const OPS = Object.keys(OP_LABELS) as FilterOp[];
const NO_VALUE: FilterOp[] = ["isnull", "notnull"];

export function TableToolbar({ columns, filters, onFiltersChange, sorts, onSortsChange, search, onSearchChange, onRefresh, refreshing }: {
  columns: { name: string }[];
  filters: FilterRule[];
  onFiltersChange: (f: FilterRule[]) => void;
  sorts: SortRule[];
  onSortsChange: (s: SortRule[]) => void;
  search: string;
  onSearchChange: (s: string) => void;
  onRefresh: () => void;
  refreshing?: boolean;
}) {
  const [draft, setDraft] = useState<{ column: string; op: FilterOp; value: string }>({ column: "", op: "eq", value: "" });
  const unsorted = columns.filter((c) => !sorts.some((s) => s.column === c.name));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 w-56"
        />

        <Popover>
          <PopoverTrigger
            render={
              <Button variant="outline" size="sm" className="h-8 border-dashed">
                <ListFilter /> Add filter
              </Button>
            }
          />
          <PopoverContent align="start" className="w-72 p-3">
            <div className="flex flex-col gap-2">
              <Select value={draft.column} onValueChange={(v) => v && setDraft((d) => ({ ...d, column: v }))}>
                <SelectTrigger className="h-8 w-full"><SelectValue placeholder="Column" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {columns.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select value={draft.op} onValueChange={(v) => v && setDraft((d) => ({ ...d, op: v as FilterOp }))}>
                <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {OPS.map((op) => <SelectItem key={op} value={op}>{OP_LABELS[op]}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {!NO_VALUE.includes(draft.op) && (
                <Input
                  placeholder="Value"
                  value={draft.value}
                  onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
                  className="h-8"
                />
              )}
              <Button
                size="sm"
                disabled={!draft.column}
                onClick={() => {
                  onFiltersChange([...filters, { column: draft.column, op: draft.op, value: NO_VALUE.includes(draft.op) ? "" : draft.value }]);
                  setDraft({ column: "", op: "eq", value: "" });
                }}
              >
                Add
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger
            render={
              <Button variant={sorts.length > 0 ? "secondary" : "outline"} size="sm" className="h-8">
                <ArrowUpDown /> {sorts.length > 0 ? `Sorted by ${sorts.length} rule${sorts.length === 1 ? "" : "s"}` : "Sort"}
              </Button>
            }
          />
          <PopoverContent align="start" className="w-72 p-3">
            <div className="flex flex-col gap-2">
              {sorts.length === 0 && <p className="text-muted-foreground text-xs">No sort rules. Order of addition sets precedence.</p>}
              {sorts.map((s, i) => (
                <div key={s.column} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground w-4 text-xs tabular-nums">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{s.column}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={() => onSortsChange(sorts.map((r) => (r.column === s.column ? { ...r, desc: !r.desc } : r)))}
                  >
                    {s.desc ? <ArrowDown /> : <ArrowUp />} {s.desc ? "desc" : "asc"}
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => onSortsChange(sorts.filter((r) => r.column !== s.column))}>
                    <X /><span className="sr-only">Remove sort on {s.column}</span>
                  </Button>
                </div>
              ))}
              {unsorted.length > 0 && (
                <Select value="" onValueChange={(v) => { if (v) onSortsChange([...sorts, { column: v, desc: false }]); }}>
                  <SelectTrigger className="h-8 w-full"><SelectValue placeholder="Add a column to sort by" /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {unsorted.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <Button variant="outline" size="sm" className="ml-auto h-8" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={refreshing ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map((f, i) => (
            <Badge key={i} variant="secondary" className="gap-1 font-mono text-xs font-normal">
              {f.column} {OP_LABELS[f.op]} {NO_VALUE.includes(f.op) ? "" : f.value}
              <button onClick={() => onFiltersChange(filters.filter((_, j) => j !== i))} aria-label={`Remove filter on ${f.column}`}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Implement the table browser route**

Replace `routes/data/$appId/tables/$table.tsx`:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { flexRender } from "@tanstack/react-table";
import {
  Button, DataTableColumnHeader, DataTablePagination, Skeleton,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  useDataTable, type ColumnDef, type PaginationState, type SortingState,
} from "@lodekit/ui";
import { KeyRound } from "lucide-react";
import { fetchSchema, selectRows } from "../../../../lib/data-api";
import { buildCountQuery, buildRowsQuery, type FilterRule, type SortRule } from "../../../../lib/table-query";
import { TableToolbar } from "../../../../components/data/table-toolbar";
import { DetailSheet } from "../../../../components/data/detail-sheet";

export const Route = createFileRoute("/data/$appId/tables/$table")({
  component: TableBrowser,
});

type Row = Record<string, unknown>;

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground/60 italic">NULL</span>;
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return <span className="block max-w-64 truncate font-mono text-xs">{text}</span>;
}

function TableBrowser() {
  const { appId, table } = Route.useParams();
  const schemaQ = useQuery({ queryKey: ["data", appId, "schema"], queryFn: () => fetchSchema(appId) });
  const tbl = schemaQ.data?.tables.find((t) => t.name === table);

  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [sorts, setSorts] = useState<SortRule[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });
  const [detailRow, setDetailRow] = useState<Row | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPagination((p) => ({ ...p, pageIndex: 0 }));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  // State resets when the table param changes (sidebar navigation).
  useEffect(() => {
    setFilters([]); setSorts([]); setSearch(""); setDebouncedSearch("");
    setPagination({ pageIndex: 0, pageSize: 50 });
    setDetailRow(null);
  }, [appId, table]);

  const queryColumns = useMemo(() => (tbl?.columns ?? []).map((c) => ({ name: c.name, type: c.type })), [tbl]);

  const rowsQ = useQuery({
    queryKey: ["data", appId, "rows", table, { filters, sorts, search: debouncedSearch, pagination }],
    enabled: !!tbl,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const input = {
        table, columns: queryColumns, filters, sorts, search: debouncedSearch,
        limit: pagination.pageSize, offset: pagination.pageIndex * pagination.pageSize,
      };
      const [rows, count] = await Promise.all([
        selectRows(appId, buildRowsQuery(input)),
        selectRows(appId, buildCountQuery(input)),
      ]);
      return { rows, total: Number((count[0] as { n?: unknown } | undefined)?.n ?? 0) };
    },
  });

  const sorting: SortingState = useMemo(() => sorts.map((s) => ({ id: s.column, desc: s.desc })), [sorts]);
  const columns = useMemo<ColumnDef<Row>[]>(
    () =>
      (tbl?.columns ?? []).map((c) => ({
        id: c.name,
        accessorFn: (row: Row) => row[c.name],
        header: ({ column }) => (
          <div className="flex items-center gap-1.5">
            <DataTableColumnHeader column={column} title={c.name} />
            {c.pk && <KeyRound className="text-muted-foreground size-3" aria-label="primary key" />}
            <span className="text-muted-foreground text-[10px] font-normal lowercase">{c.type}</span>
          </div>
        ),
        cell: ({ getValue }) => <CellValue value={getValue()} />,
        enableSorting: true,
        enableHiding: true,
      })),
    [tbl]
  );

  const dt = useDataTable<Row>({
    data: rowsQ.data?.rows ?? [],
    columns,
    manual: true,
    rowCount: rowsQ.data?.total ?? 0,
    state: { sorting, pagination },
    onSortingChange: (u) => {
      const next = typeof u === "function" ? u(sorting) : u;
      setSorts(next.map((r) => ({ column: r.id, desc: r.desc })));
      setPagination((p) => ({ ...p, pageIndex: 0 }));
    },
    onPaginationChange: (u) => setPagination((p) => (typeof u === "function" ? u(p) : u)),
    getRowId: (_row, i) => String(i),
  });

  if (schemaQ.isError) return <p className="text-destructive text-sm">Failed to load schema: {(schemaQ.error as Error).message}</p>;
  if (!schemaQ.data) return <Skeleton className="h-64" />;
  if (!tbl) {
    return (
      <div className="text-sm">
        <p className="text-destructive">Table “{table}” no longer exists.</p>
        <Button variant="outline" size="sm" className="mt-3" render={<Link to="/data/$appId" params={{ appId }}>Back to overview</Link>} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-mono text-lg font-semibold">{table}</h1>
      <TableToolbar
        columns={queryColumns}
        filters={filters}
        onFiltersChange={(f) => { setFilters(f); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
        sorts={sorts}
        onSortsChange={(s) => { setSorts(s); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => void rowsQ.refetch()}
        refreshing={rowsQ.isFetching}
      />
      {rowsQ.isError ? (
        <p className="text-destructive text-sm">Query failed: {(rowsQ.error as Error).message}</p>
      ) : !rowsQ.data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          {/* Mirrors @lodekit/ui DataTable's body, adding row click-through. */}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                {dt.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((h) => (
                      <TableHead key={h.id} colSpan={h.colSpan}>
                        {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {dt.getRowModel().rows.length ? (
                  dt.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} className="cursor-pointer" onClick={() => setDetailRow(row.original)}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={dt.getVisibleLeafColumns().length} className="h-24 text-center">
                      No rows.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DataTablePagination table={dt} pageSizeOptions={[25, 50, 100]} />
        </>
      )}
      <DetailSheet
        open={detailRow != null}
        title={`${table} row`}
        fields={detailRow ? tbl.columns.map((c) => ({ label: c.name, value: detailRow[c.name] })) : []}
        onClose={() => setDetailRow(null)}
      />
    </div>
  );
}
```

(If `Button`'s `render` prop composition with `Link` fails to typecheck, wrap instead: `<Link …><Button …>Back to overview</Button></Link>`.)

- [ ] **Step 4: Build + smoke**

Run: `pnpm --filter @lodekit/runtime test tests/dashboard.test.ts`
Expected: PASS.
`pnpm dev` → greenhouse → a table: rows render with types in headers and pk icon; add a filter chip (e.g. `id ≥ 2`), add two sort rules and flip one, search text, page through, change page size, refresh; click a row → detail sheet with pretty JSON + copy. Verify NULLs render dimmed. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/build.ts packages/runtime/dashboard/src/components/data/detail-sheet.tsx packages/runtime/dashboard/src/components/data/table-toolbar.tsx "packages/runtime/dashboard/src/routes/data/\$appId/tables/\$table.tsx"
git commit -m "feat(dashboard): data explorer table browser — filters, multi-sort, search, pagination (#60)"
```

---

### Task 7: Key-value view

**Files:**
- Modify: `packages/runtime/dashboard/src/routes/data/$appId/kv.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `fetchKv`, `KvEntry` (Task 4); `DetailSheet` (Task 6); `formatTs`, `relativeTime` (Task 3).

- [ ] **Step 1: Implement**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Button, Input, Skeleton,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@lodekit/ui";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { fetchKv, type KvEntry } from "../../../lib/data-api";
import { formatTs, relativeTime } from "../../../lib/format";
import { DetailSheet } from "../../../components/data/detail-sheet";

export const Route = createFileRoute("/data/$appId/kv")({
  component: KvView,
});

const PAGE = 50;

function KvView() {
  const { appId } = Route.useParams();
  const [prefix, setPrefix] = useState("");
  const [debounced, setDebounced] = useState("");
  // Cursor stack: [ ] = first page; push nextCursor to advance, pop to go back.
  const [cursors, setCursors] = useState<string[]>([]);
  const [detail, setDetail] = useState<KvEntry | null>(null);
  const cursor = cursors[cursors.length - 1];

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(prefix); setCursors([]); }, 250);
    return () => clearTimeout(t);
  }, [prefix]);
  useEffect(() => { setPrefix(""); setDebounced(""); setCursors([]); setDetail(null); }, [appId]);

  const q = useQuery({
    queryKey: ["kv", appId, debounced, cursor ?? ""],
    placeholderData: keepPreviousData,
    queryFn: () => fetchKv(appId, { prefix: debounced || undefined, cursor, limit: PAGE }),
  });

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg font-semibold">Key-value</h1>
      <div className="flex items-center gap-2">
        <Input placeholder="Key prefix…" value={prefix} onChange={(e) => setPrefix(e.target.value)} className="h-8 w-56" />
        <Button variant="outline" size="sm" className="ml-auto h-8" onClick={() => void q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={q.isFetching ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>
      {q.isError ? (
        <p className="text-destructive text-sm">Failed to load entries: {(q.error as Error).message}</p>
      ) : !q.data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.entries.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="h-24 text-center">No entries.</TableCell></TableRow>
                ) : (
                  q.data.entries.map((e) => (
                    <TableRow key={e.key} className="cursor-pointer" onClick={() => setDetail(e)}>
                      <TableCell className="font-mono text-xs">{e.key}</TableCell>
                      <TableCell><span className="block max-w-80 truncate font-mono text-xs">{JSON.stringify(e.value)}</span></TableCell>
                      <TableCell className="text-muted-foreground text-xs">{relativeTime(e.createdAt)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{relativeTime(e.updatedAt)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{e.expiresAt ? formatTs(e.expiresAt) : "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" disabled={cursors.length === 0} onClick={() => setCursors((c) => c.slice(0, -1))}>
              <ChevronLeft /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={q.data.nextCursor == null}
              onClick={() => q.data.nextCursor != null && setCursors((c) => [...c, q.data.nextCursor!])}
            >
              Next <ChevronRight />
            </Button>
          </div>
        </>
      )}
      <DetailSheet
        open={detail != null}
        title={detail?.key ?? ""}
        fields={detail ? [
          { label: "key", value: detail.key },
          { label: "value", value: detail.value },
          { label: "createdAt", value: formatTs(detail.createdAt) },
          { label: "updatedAt", value: formatTs(detail.updatedAt) },
          { label: "expiresAt", value: detail.expiresAt ? formatTs(detail.expiresAt) : null },
        ] : []}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Build + smoke, commit**

Run: `pnpm --filter @lodekit/runtime test tests/dashboard.test.ts` — PASS.
Smoke: greenhouse → Key-value: entries list, prefix search narrows, prev/next work, row detail shows pretty JSON. (KV live-invalidates via the existing `["kv", ns]` SSE hook — the query key starts with `["kv", appId]` so it participates.)

```bash
git add "packages/runtime/dashboard/src/routes/data/\$appId/kv.tsx"
git commit -m "feat(dashboard): data explorer key-value view (#60)"
```

---

### Task 8: Files view

**Files:**
- Modify: `packages/runtime/dashboard/src/routes/data/$appId/files.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `fetchFiles`, `FileStat` (Task 4); `DetailSheet` (Task 6); `formatBytes`, `formatTs`, `relativeTime` (Task 3).

- [ ] **Step 1: Implement**

Same skeleton as Task 7 (prefix input, cursor stack, refresh, `keepPreviousData`), with these differences — full component:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Button, Input, Skeleton,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@lodekit/ui";
import {
  ChevronLeft, ChevronRight, ExternalLink, File, FileArchive, FileAudio, FileImage, FileText, FileVideo, RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { fetchFiles, type FileStat } from "../../../lib/data-api";
import { formatBytes, formatTs, relativeTime } from "../../../lib/format";
import { DetailSheet } from "../../../components/data/detail-sheet";

export const Route = createFileRoute("/data/$appId/files")({
  component: FilesView,
});

const PAGE = 50;

function mimeIcon(contentType: string): LucideIcon {
  if (contentType.startsWith("image/")) return FileImage;
  if (contentType.startsWith("video/")) return FileVideo;
  if (contentType.startsWith("audio/")) return FileAudio;
  if (contentType.startsWith("text/") || contentType.includes("json") || contentType.includes("xml")) return FileText;
  if (contentType.includes("zip") || contentType.includes("tar") || contentType.includes("compress")) return FileArchive;
  return File;
}

function FilesView() {
  const { appId } = Route.useParams();
  const [prefix, setPrefix] = useState("");
  const [debounced, setDebounced] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const [detail, setDetail] = useState<FileStat | null>(null);
  const cursor = cursors[cursors.length - 1];

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(prefix); setCursors([]); }, 250);
    return () => clearTimeout(t);
  }, [prefix]);
  useEffect(() => { setPrefix(""); setDebounced(""); setCursors([]); setDetail(null); }, [appId]);

  const q = useQuery({
    queryKey: ["data", appId, "files", debounced, cursor ?? ""],
    placeholderData: keepPreviousData,
    queryFn: () => fetchFiles(appId, { prefix: debounced || undefined, cursor, limit: PAGE }),
  });

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg font-semibold">Files</h1>
      <div className="flex items-center gap-2">
        <Input placeholder="Slug prefix…" value={prefix} onChange={(e) => setPrefix(e.target.value)} className="h-8 w-56" />
        <Button variant="outline" size="sm" className="ml-auto h-8" onClick={() => void q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={q.isFetching ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>
      {q.isError ? (
        <p className="text-destructive text-sm">Failed to load files: {(q.error as Error).message}</p>
      ) : !q.data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.entries.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center">No files.</TableCell></TableRow>
                ) : (
                  q.data.entries.map((f) => {
                    const Icon = mimeIcon(f.contentType);
                    return (
                      <TableRow key={f.slug} className="cursor-pointer" onClick={() => setDetail(f)}>
                        <TableCell>
                          <span className="flex items-center gap-2">
                            <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                            <span className="min-w-0">
                              <span className="block truncate text-sm">{f.title ?? f.slug}</span>
                              {f.title && <span className="text-muted-foreground block truncate font-mono text-xs">{f.slug}</span>}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">{f.contentType}</TableCell>
                        <TableCell className="text-xs tabular-nums">{formatBytes(f.size)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{relativeTime(f.createdAt)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{f.expiresAt ? formatTs(f.expiresAt) : "—"}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <a href={f.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                            <ExternalLink className="size-4" /><span className="sr-only">Open raw file</span>
                          </a>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" disabled={cursors.length === 0} onClick={() => setCursors((c) => c.slice(0, -1))}>
              <ChevronLeft /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={q.data.nextCursor == null}
              onClick={() => q.data.nextCursor != null && setCursors((c) => [...c, q.data.nextCursor!])}
            >
              Next <ChevronRight />
            </Button>
          </div>
        </>
      )}
      <DetailSheet
        open={detail != null}
        title={detail?.title ?? detail?.slug ?? ""}
        fields={detail ? [
          { label: "slug", value: detail.slug },
          { label: "title", value: detail.title },
          { label: "contentType", value: detail.contentType },
          { label: "size", value: formatBytes(detail.size) },
          { label: "hash", value: detail.hash },
          { label: "metadata", value: detail.metadata },
          { label: "createdAt", value: formatTs(detail.createdAt) },
          { label: "updatedAt", value: formatTs(detail.updatedAt) },
          { label: "expiresAt", value: detail.expiresAt ? formatTs(detail.expiresAt) : null },
          { label: "url", value: detail.url },
        ] : []}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Build + smoke, commit**

Run: `pnpm --filter @lodekit/runtime test tests/dashboard.test.ts` — PASS.
Smoke: greenhouse → Files: mime icons, humanized sizes, external-link opens the sandboxed raw file, detail shows metadata JSON.

```bash
git add "packages/runtime/dashboard/src/routes/data/\$appId/files.tsx"
git commit -m "feat(dashboard): data explorer files view (#60)"
```

---

### Task 9: Events view

**Files:**
- Modify: `packages/runtime/dashboard/src/routes/data/$appId/events.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `fetchAppEvents`, `EventRecord` (Task 4); `relativeTime`, `formatTs` (Task 3). No SSE live tail (design §4) — refresh button + load-more only.

- [ ] **Step 1: Implement**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, Button, Input, Skeleton } from "@lodekit/ui";
import { RefreshCw } from "lucide-react";
import { fetchAppEvents, type EventRecord } from "../../../lib/data-api";
import { formatTs } from "../../../lib/format";

export const Route = createFileRoute("/data/$appId/events")({
  component: EventsView,
});

function EventRow({ r }: { r: EventRecord }) {
  const [open, setOpen] = useState(false);
  const hasPayload = r.payload && Object.keys(r.payload).length > 0;
  return (
    <div className="border-b py-1.5 text-sm last:border-b-0">
      <button className="flex w-full items-baseline gap-2 text-left" onClick={() => hasPayload && setOpen((o) => !o)}>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{formatTs(r.ts)}</span>
        <Badge variant="secondary">{r.type}</Badge>
        <span className="text-muted-foreground truncate text-xs">{hasPayload ? JSON.stringify(r.payload) : ""}</span>
      </button>
      {open && hasPayload && (
        <pre className="bg-muted mt-1 overflow-auto rounded p-2 text-xs">{JSON.stringify(r.payload, null, 2)}</pre>
      )}
    </div>
  );
}

function EventsView() {
  const { appId } = Route.useParams();
  const [type, setType] = useState("");
  const [debounced, setDebounced] = useState("");
  const [records, setRecords] = useState<EventRecord[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(type), 250);
    return () => clearTimeout(t);
  }, [type]);
  useEffect(() => { setType(""); setDebounced(""); }, [appId]);

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const before = reset ? undefined : (next ?? undefined);
      const d = await fetchAppEvents(appId, { type: debounced || undefined, before });
      setRecords((rs) => (reset ? d.records : [...(rs ?? []), ...d.records]));
      setNext(d.next);
    } catch (e) {
      setError((e as Error).message);
      if (reset) setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setRecords(null);
    setNext(null);
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, debounced]);

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg font-semibold">Events</h1>
      <div className="flex items-center gap-2">
        <Input placeholder="Type (exact)…" value={type} onChange={(e) => setType(e.target.value)} className="h-8 w-56" />
        <Button variant="outline" size="sm" className="ml-auto h-8" onClick={() => void load(true)} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>
      {error && <p className="text-destructive text-sm">Failed to load events: {error}</p>}
      {records === null ? (
        <Skeleton className="h-64" />
      ) : records.length === 0 ? (
        <p className="text-muted-foreground text-sm">No events from this app yet.</p>
      ) : (
        <div className="rounded-md border px-3">
          {records.map((r) => <EventRow key={r.id} r={r} />)}
          {next != null && (
            <Button variant="outline" size="sm" className="my-3" onClick={() => void load(false)} disabled={loading}>
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
```

(If the project has no eslint config that recognizes the disable comment, drop the comment line — it's advisory.)

- [ ] **Step 2: Build + smoke, commit**

Run: `pnpm --filter @lodekit/runtime test tests/dashboard.test.ts` — PASS.
Smoke: greenhouse → Events: only app-emitted events appear (no `kv-store-change`/`db-store-change` noise), type filter works, load-more pages, refresh picks up new events.

```bash
git add "packages/runtime/dashboard/src/routes/data/\$appId/events.tsx"
git commit -m "feat(dashboard): data explorer events view — app events only (#60)"
```

---

### Task 10: SSE invalidations, docs, changelog, deferrals, final verification

**Files:**
- Modify: `packages/runtime/dashboard/src/components/sse.tsx` (~line 39)
- Modify: `web/docs/src/content/docs/guide/dashboard.mdx`
- Modify: `docs/changelog.md`, `defer.md`
- Modify: `docs/specs/2026-07-14-data-explorer-design.md` (one-line correction)

**Interfaces:** none new.

- [ ] **Step 1: SSE invalidations**

In `sse.tsx`, after the `kv-store-change` line (line 39), add:

```ts
        if (d.type === "db-store-change" || d.type === "file-store-change") {
          void queryClient.invalidateQueries({ queryKey: ["data", d.ns, "summary"] });
        }
        if (d.type === "db-store-change") void queryClient.invalidateQueries({ queryKey: ["data", d.ns, "schema"] });
        if (d.type === "file-store-change") void queryClient.invalidateQueries({ queryKey: ["data", d.ns, "files"] });
```

(Table **rows** keys — `["data", ns, "rows", …]` — are deliberately NOT invalidated: rows refresh only via the explicit button, per design §2.3.)

- [ ] **Step 2: Docs — `guide/dashboard.mdx`**

Add a `## Data` section (place it right after the `## Home` section, matching the sidebar order users see). Content:

```mdx
## Data

**Data** is the explorer for everything your apps have stored. Pick an app and
you get an overview — how many rows, keys, files, and events it holds, small
charts of where the space goes, and a feed of what was added recently. From
there, browse each store directly: any table (with filtering, multi-column
sorting, search, and paging), the key-value entries, uploaded files with their
metadata, and the app's own events. Everything is read-only — looking never
changes your data — and a refresh button picks up whatever your apps wrote in
the meantime. A per-app storage breakdown is coming soon.
```

- [ ] **Step 3: Changelog buffer + deferrals + spec correction**

Read `docs/changelog.md` first and follow its existing buffer structure (entries under a `## New` heading; create the heading if the buffer is empty). Append:

```md
- **Data explorer.** The dashboard's Data page is now a real explorer: pick an
  app and browse its tables (filter, multi-column sort, search, paging),
  key-value entries, files, and events — read-only, with storage insights and
  recent activity on the overview.
```

Append to `defer.md` under a new dated header (append-only — do not touch existing entries):

```md
## 2026-07-14 — data explorer (spec docs/specs/2026-07-14-data-explorer-design.md, issue #60)

- Storage panel behind the "Soon" badge: persisted per-app storage metrics + models, trends over time.
- Data explorer events view: live tail (global /events page has it; explorer is refresh-only v1).
- Table browser: URL-persisted grid state (filters/sort/page survive reload/share).
- Files view: thumbnails/media previews.
- SQL editor (read-only query console) in the explorer.
```

Spec correction (keeps spec/impl honest): in `docs/specs/2026-07-14-data-explorer-design.md` §2.1, change the line
`- **No db file yet:** all zeros/empty — the endpoint never 404s for a valid app.`
to
`- **No db file yet:** tables/kv/files zero out (the endpoint never 404s for a valid app); the events count and event recents stay real — they live in the platform event store, not the app db.`

- [ ] **Step 4: Full verification**

Run: `pnpm test` (repo root — runtime + sdk + manager suites) and `pnpm --filter @lodekit/runtime check`.
Expected: all green.
Final smoke (`pnpm dev`): walk every explorer view once with the greenhouse app; verify `/logs`, `/events`, `/gateways`, `/settings` pages still render normally (layout regression check); write a KV key via greenhouse (or `curl -X PUT localhost:<port>/api/apps/greenhouse/kv-store/smoke -H 'Content-Type: application/json' -d '{"value":1}'`) and watch the KV view + overview update live (SSE), while a table view only updates on Refresh.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/dashboard/src/components/sse.tsx web/docs/src/content/docs/guide/dashboard.mdx docs/changelog.md defer.md docs/specs/2026-07-14-data-explorer-design.md
git commit -m "feat(dashboard): data explorer live invalidations + docs + changelog (#60)"
```
