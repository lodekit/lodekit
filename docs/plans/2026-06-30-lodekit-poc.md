# Lodekit POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Lodekit POC — a single Node server that hosts buildless local apps with auto-injected storage + design system, a live dashboard, and an MCP server so Claude can scaffold/list/open/inspect apps — proven end-to-end by an expense-tracker tool.

**Architecture:** One Express process serves: static app files at `/<slug>` (injecting design-system CSS + client SDK into `index.html`), a per-app scoped backend API (SQL + KV over `better-sqlite3`), a live dashboard at `/`, and an SSE stream fed by a `chokidar` watcher on `apps/`. A separate stdio MCP server is a thin HTTP client to that server. Apps are plain HTML/JS folders; the filesystem (`apps/*/lodekit.json`) is the registry.

**Tech Stack:** Node 20+ (built-in `fetch`), TypeScript run via `tsx` (no build), Express 4, `better-sqlite3`, `chokidar`, `@modelcontextprotocol/sdk` + `zod` for the MCP, `vitest` for tests. Browser assets are plain JS/CSS.

## Global Constraints

- **Runtime:** Node ≥ 20. Project is ESM (`"type": "module"`).
- **No build step:** server/MCP run via `tsx`; never add a bundler/compile step in the POC.
- **Buildless apps:** app code is plain HTML + vanilla JS + CSS. No per-app `node_modules`.
- **Naming:** brand "Lodekit" in prose/UI; `lodekit` for identifiers, paths, slugs, env. Manifest filename is `lodekit.json`. SDK global is `window.lodekit`. MCP tools are prefixed `lodekit_`.
- **Slug rule:** `^[a-z0-9-]+$`; the manifest `slug` MUST equal its folder name.
- **Defaults:** root `~/Documents/Lodekit` (override `LODEKIT_ROOT`); port `7777` (override `LODEKIT_PORT`); base URL `http://lodekit.localhost:${port}`.
- **Layout:** `apps/<slug>/` (code), `data/<slug>/db.sqlite` (data) — separate sibling trees.
- **Scoping/trust boundary:** every per-app endpoint validates `:slug` against the slug rule and opens only that app's DB file. Tests MUST set `LODEKIT_ROOT` to a temp dir and use port `0` (ephemeral).
- **Commits:** trunk-based on `master`; no `Co-Authored-By` trailers.

---

### Task 1: Project scaffold + config

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore` (update), `vitest.config.ts`
- Create: `src/config.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Produces: `interface Config { root: string; appsDir: string; dataDir: string; port: number; baseUrl: string }` and `loadConfig(): Config` in `src/config.ts`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "lodekit",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "mcp": "tsx mcp/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "better-sqlite3": "^11.8.1",
    "chokidar": "^4.0.3",
    "express": "^4.21.2",
    "@modelcontextprotocol/sdk": "^1.12.0",
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

- [ ] **Step 2: Create `tsconfig.json`**

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
  },
  "include": ["src", "mcp", "tests"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
```

- [ ] **Step 4: Update `.gitignore`**

Append these lines:

```
node_modules/
*.log
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: completes, `node_modules/` populated, `better-sqlite3` builds successfully.

- [ ] **Step 6: Write the failing test** — `tests/config.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  beforeEach(() => {
    delete process.env.LODEKIT_ROOT;
    delete process.env.LODEKIT_PORT;
  });

  it("derives apps/data dirs and base url from root + port", () => {
    process.env.LODEKIT_ROOT = "/tmp/lodekit-test";
    process.env.LODEKIT_PORT = "9999";
    const cfg = loadConfig();
    expect(cfg.appsDir).toBe(path.join("/tmp/lodekit-test", "apps"));
    expect(cfg.dataDir).toBe(path.join("/tmp/lodekit-test", "data"));
    expect(cfg.port).toBe(9999);
    expect(cfg.baseUrl).toBe("http://lodekit.localhost:9999");
  });

  it("defaults port to 7777", () => {
    process.env.LODEKIT_ROOT = "/tmp/lodekit-test";
    expect(loadConfig().port).toBe(7777);
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- tests/config.test.ts`
Expected: FAIL — cannot find module `../src/config.js`.

- [ ] **Step 8: Implement `src/config.ts`**

```ts
import os from "node:os";
import path from "node:path";

export interface Config {
  root: string;
  appsDir: string;
  dataDir: string;
  port: number;
  baseUrl: string;
}

export function loadConfig(): Config {
  const root = process.env.LODEKIT_ROOT
    ? path.resolve(process.env.LODEKIT_ROOT)
    : path.join(os.homedir(), "Documents", "Lodekit");
  const port = Number(process.env.LODEKIT_PORT ?? 7777);
  return {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    port,
    baseUrl: `http://lodekit.localhost:${port}`,
  };
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- tests/config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/config.ts tests/config.test.ts
git commit -m "feat: project scaffold and config loader"
```

---

### Task 2: App registry (filesystem scan)

**Files:**
- Create: `src/registry.ts`
- Test: `tests/registry.test.ts`

**Interfaces:**
- Produces: `interface AppManifest { name: string; slug: string; icon?: string; description?: string }`, `scanApps(appsDir: string): AppManifest[]` (sorted by name; skips dirs without a valid `lodekit.json` or where `slug !== folder name`), `isValidSlug(slug: string): boolean`.

- [ ] **Step 1: Write the failing test** — `tests/registry.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanApps, isValidSlug } from "../src/registry.js";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

function writeApp(slug: string, manifest: object) {
  const d = path.join(dir, slug);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, "lodekit.json"), JSON.stringify(manifest));
}

describe("scanApps", () => {
  it("returns [] when dir missing", () => {
    expect(scanApps(path.join(dir, "nope"))).toEqual([]);
  });

  it("lists valid apps sorted by name", () => {
    writeApp("zebra", { name: "Zebra", slug: "zebra" });
    writeApp("apple", { name: "Apple", slug: "apple", icon: "🍎" });
    const apps = scanApps(dir);
    expect(apps.map((a) => a.slug)).toEqual(["apple", "zebra"]);
    expect(apps[0].icon).toBe("🍎");
  });

  it("skips dirs whose manifest slug != folder name", () => {
    writeApp("mismatch", { name: "X", slug: "other" });
    expect(scanApps(dir)).toEqual([]);
  });

  it("skips malformed manifests", () => {
    const d = path.join(dir, "broken");
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, "lodekit.json"), "{not json");
    expect(scanApps(dir)).toEqual([]);
  });
});

describe("isValidSlug", () => {
  it("accepts lowercase/digits/dashes, rejects others", () => {
    expect(isValidSlug("tax-2024")).toBe(true);
    expect(isValidSlug("Bad Slug")).toBe(false);
    expect(isValidSlug("../x")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/registry.test.ts`
Expected: FAIL — cannot find module `../src/registry.js`.

- [ ] **Step 3: Implement `src/registry.ts`**

```ts
import fs from "node:fs";
import path from "node:path";

export interface AppManifest {
  name: string;
  slug: string;
  icon?: string;
  description?: string;
}

const SLUG_RE = /^[a-z0-9-]+$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

export function scanApps(appsDir: string): AppManifest[] {
  if (!fs.existsSync(appsDir)) return [];
  const apps: AppManifest[] = [];
  for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(appsDir, entry.name, "lodekit.json");
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as AppManifest;
      if (!isValidSlug(m.slug) || m.slug !== entry.name) continue;
      apps.push({ name: m.name, slug: m.slug, icon: m.icon, description: m.description });
    } catch {
      // skip malformed manifest
    }
  }
  return apps.sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/registry.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/registry.ts tests/registry.test.ts
git commit -m "feat: filesystem app registry"
```

---

### Task 3: Per-app DB service (SQL + KV + schema)

**Files:**
- Create: `src/db.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Produces (all consume a `Database` from `better-sqlite3`):
  - `getAppDb(dataDir: string, slug: string): Database.Database` — lazily creates `dataDir/<slug>/db.sqlite`, ensures `_lodekit_store(key,value)` table, caches by slug.
  - `query(db, sql, params?): unknown[]`
  - `exec(db, sql, params?): { changes: number; lastInsertRowid: number | bigint }`
  - `storeGet(db, key): unknown` (parsed JSON or `null`)
  - `storeSet(db, key, value): void`
  - `schema(db): { table: string; columns: { name: string; type: string }[]; sample: unknown[] }[]` (excludes `sqlite_%` and `_lodekit_store`).

- [ ] **Step 1: Write the failing test** — `tests/db.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAppDb, query, exec, storeGet, storeSet, schema } from "../src/db.js";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("db service", () => {
  it("creates the db file and runs exec + query round-trip", () => {
    const db = getAppDb(dir, "demo");
    expect(fs.existsSync(path.join(dir, "demo", "db.sqlite"))).toBe(true);
    exec(db, "CREATE TABLE items (id INTEGER PRIMARY KEY, n TEXT)");
    const r = exec(db, "INSERT INTO items (n) VALUES (?)", ["hello"]);
    expect(r.changes).toBe(1);
    expect(query(db, "SELECT n FROM items")).toEqual([{ n: "hello" }]);
  });

  it("stores and reads JSON KV values", () => {
    const db = getAppDb(dir, "kv");
    expect(storeGet(db, "missing")).toBeNull();
    storeSet(db, "cfg", { currency: "USD" });
    expect(storeGet(db, "cfg")).toEqual({ currency: "USD" });
    storeSet(db, "cfg", { currency: "EUR" });
    expect(storeGet(db, "cfg")).toEqual({ currency: "EUR" });
  });

  it("reports schema excluding internal tables", () => {
    const db = getAppDb(dir, "sc");
    exec(db, "CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
    exec(db, "INSERT INTO t (v) VALUES ('x')");
    const s = schema(db);
    expect(s.map((x) => x.table)).toEqual(["t"]);
    expect(s[0].columns.map((c) => c.name)).toEqual(["id", "v"]);
    expect(s[0].sample).toEqual([{ id: 1, v: "x" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/db.test.ts`
Expected: FAIL — cannot find module `../src/db.js`.

- [ ] **Step 3: Implement `src/db.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const connections = new Map<string, Database.Database>();

export function getAppDb(dataDir: string, slug: string): Database.Database {
  const cached = connections.get(slug);
  if (cached) return cached;
  const appDataDir = path.join(dataDir, slug);
  fs.mkdirSync(appDataDir, { recursive: true });
  const db = new Database(path.join(appDataDir, "db.sqlite"));
  db.pragma("journal_mode = WAL");
  db.exec("CREATE TABLE IF NOT EXISTS _lodekit_store (key TEXT PRIMARY KEY, value TEXT)");
  connections.set(slug, db);
  return db;
}

export function query(db: Database.Database, sql: string, params: unknown[] = []): unknown[] {
  return db.prepare(sql).all(...(params as never[]));
}

export function exec(db: Database.Database, sql: string, params: unknown[] = []) {
  const info = db.prepare(sql).run(...(params as never[]));
  return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
}

export function storeGet(db: Database.Database, key: string): unknown {
  const row = db.prepare("SELECT value FROM _lodekit_store WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row ? JSON.parse(row.value) : null;
}

export function storeSet(db: Database.Database, key: string, value: unknown): void {
  db.prepare(
    "INSERT INTO _lodekit_store (key, value) VALUES (?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, JSON.stringify(value));
}

export function schema(db: Database.Database) {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' " +
        "AND name NOT LIKE 'sqlite_%' AND name != '_lodekit_store'"
    )
    .all() as { name: string }[];
  return tables.map((t) => ({
    table: t.name,
    columns: (db.prepare(`PRAGMA table_info("${t.name}")`).all() as { name: string; type: string }[])
      .map((c) => ({ name: c.name, type: c.type })),
    sample: db.prepare(`SELECT * FROM "${t.name}" LIMIT 5`).all(),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/db.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/db.ts tests/db.test.ts
git commit -m "feat: per-app sqlite db service with KV and schema"
```

---

### Task 4: Scaffold service

**Files:**
- Create: `src/scaffold.ts`
- Test: `tests/scaffold.test.ts`

**Interfaces:**
- Consumes: `Config` from `src/config.ts`.
- Produces: `interface ScaffoldInput { slug: string; name: string; description?: string; icon?: string }` and `scaffoldApp(cfg: Config, input: ScaffoldInput): { slug: string; appDir: string; url: string; files: string[] }`. Writes `lodekit.json` (always) plus stub `index.html`/`app.js` (only if absent). `icon` defaults to `"📦"`, `description` to `""`.

- [ ] **Step 1: Write the failing test** — `tests/scaffold.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scaffoldApp } from "../src/scaffold.js";
import type { Config } from "../src/config.js";

let root: string;
let cfg: Config;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-"));
  cfg = {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    port: 7777,
    baseUrl: "http://lodekit.localhost:7777",
  };
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("scaffoldApp", () => {
  it("creates manifest + stub files and returns the app url", () => {
    const out = scaffoldApp(cfg, { slug: "notes", name: "Notes", description: "Jot things" });
    const d = path.join(cfg.appsDir, "notes");
    expect(out.url).toBe("http://lodekit.localhost:7777/notes");
    const manifest = JSON.parse(fs.readFileSync(path.join(d, "lodekit.json"), "utf8"));
    expect(manifest).toMatchObject({ name: "Notes", slug: "notes", icon: "📦", description: "Jot things" });
    expect(fs.existsSync(path.join(d, "index.html"))).toBe(true);
    expect(fs.readFileSync(path.join(d, "index.html"), "utf8")).toContain("Notes");
    expect(fs.existsSync(path.join(d, "app.js"))).toBe(true);
  });

  it("does not overwrite an existing index.html", () => {
    const d = path.join(cfg.appsDir, "keep");
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "index.html"), "ORIGINAL");
    scaffoldApp(cfg, { slug: "keep", name: "Keep" });
    expect(fs.readFileSync(path.join(d, "index.html"), "utf8")).toBe("ORIGINAL");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/scaffold.test.ts`
Expected: FAIL — cannot find module `../src/scaffold.js`.

- [ ] **Step 3: Implement `src/scaffold.ts`**

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

const stubHtml = (name: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name}</title>
</head>
<body>
  <main class="lk-container">
    <h1 class="lk-h1">${name}</h1>
    <p class="lk-muted">Edit app.js to build this tool.</p>
  </main>
  <script src="app.js"></script>
</body>
</html>
`;

const stubJs = `// window.lodekit: db.query(sql,params), db.exec(sql,params), store.get(key), store.set(key,value)
console.log("Lodekit app ready", window.lodekit);
`;

export function scaffoldApp(cfg: Config, input: ScaffoldInput) {
  const appDir = path.join(cfg.appsDir, input.slug);
  fs.mkdirSync(appDir, { recursive: true });
  const manifest = {
    name: input.name,
    slug: input.slug,
    icon: input.icon ?? "📦",
    description: input.description ?? "",
  };
  fs.writeFileSync(path.join(appDir, "lodekit.json"), JSON.stringify(manifest, null, 2) + "\n");
  const indexPath = path.join(appDir, "index.html");
  if (!fs.existsSync(indexPath)) fs.writeFileSync(indexPath, stubHtml(manifest.name));
  const jsPath = path.join(appDir, "app.js");
  if (!fs.existsSync(jsPath)) fs.writeFileSync(jsPath, stubJs);
  return {
    slug: input.slug,
    appDir,
    url: `${cfg.baseUrl}/${input.slug}`,
    files: ["lodekit.json", "index.html", "app.js"],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/scaffold.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scaffold.ts tests/scaffold.test.ts
git commit -m "feat: app scaffold service"
```

---

### Task 5: SSE hub + API router + server factory

**Files:**
- Create: `src/sse.ts`, `src/routes.ts`, `src/server.ts`
- Test: `tests/api.test.ts`

**Interfaces:**
- Produces:
  - `src/sse.ts`: `addClient(res: Response): void`, `broadcast(event: string, data: unknown): void`.
  - `src/routes.ts`: `apiRouter(cfg: Config): express.Router` mounting the endpoints below under `/api`.
  - `src/server.ts`: `createServer(cfg: Config): express.Express` (no listen — for tests).
- Endpoints (all JSON): `GET /api/apps`, `POST /api/apps` (`{slug,name,description,icon}`→201 scaffold result), `POST /api/apps/:slug/db/query` (`{sql,params}`→`{rows}`), `POST /api/apps/:slug/db/exec` (`{sql,params}`→`{changes,lastInsertRowid}`), `GET /api/apps/:slug/db/schema`→`{schema}`, `GET /api/apps/:slug/store/:key`→`{value}`, `PUT /api/apps/:slug/store/:key` (`{value}`→`{ok:true}`), `GET /api/events` (SSE).

- [ ] **Step 1: Write the failing test** — `tests/api.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";
import type { Config } from "../src/config.js";

let root: string, server: Server, base: string;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-"));
  const cfg: Config = {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    port: 0,
    baseUrl: "http://lodekit.localhost:0",
  };
  await new Promise<void>((resolve) => {
    server = createServer(cfg).listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterEach(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
});

async function jpost(p: string, body: unknown) {
  const r = await fetch(base + p, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

describe("API", () => {
  it("scaffolds, lists, and round-trips app data", async () => {
    const created = await jpost("/api/apps", { slug: "exp", name: "Exp" });
    expect(created.status).toBe(201);

    const list = await (await fetch(base + "/api/apps")).json();
    expect(list.map((a: { slug: string }) => a.slug)).toContain("exp");

    await jpost("/api/apps/exp/db/exec", {
      sql: "CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)",
    });
    const ins = await jpost("/api/apps/exp/db/exec", {
      sql: "INSERT INTO t (v) VALUES (?)",
      params: ["hi"],
    });
    expect(ins.body.changes).toBe(1);
    const q = await jpost("/api/apps/exp/db/query", { sql: "SELECT v FROM t" });
    expect(q.body.rows).toEqual([{ v: "hi" }]);
  });

  it("stores KV via PUT/GET", async () => {
    await fetch(base + "/api/apps/exp/store/cfg", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: { currency: "USD" } }),
    });
    const got = await (await fetch(base + "/api/apps/exp/store/cfg")).json();
    expect(got.value).toEqual({ currency: "USD" });
  });

  it("rejects invalid slugs", async () => {
    const r = await jpost("/api/apps/Bad Slug/db/query", { sql: "SELECT 1" });
    expect(r.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/api.test.ts`
Expected: FAIL — cannot find module `../src/server.js`.

- [ ] **Step 3: Implement `src/sse.ts`**

```ts
import type { Response } from "express";

const clients = new Set<Response>();

export function addClient(res: Response): void {
  clients.add(res);
  res.on("close", () => clients.delete(res));
}

export function broadcast(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}
```

- [ ] **Step 4: Implement `src/routes.ts`**

```ts
import express, { type Request, type Response, type NextFunction } from "express";
import type Database from "better-sqlite3";
import type { Config } from "./config.js";
import { scanApps, isValidSlug } from "./registry.js";
import * as dbsvc from "./db.js";
import { scaffoldApp } from "./scaffold.js";
import { addClient } from "./sse.js";

interface DbRequest extends Request {
  db?: Database.Database;
}

export function apiRouter(cfg: Config): express.Router {
  const r = express.Router();
  r.use(express.json());

  r.get("/apps", (_req, res) => {
    res.json(scanApps(cfg.appsDir));
  });

  r.post("/apps", (req, res) => {
    const { slug, name, description, icon } = req.body ?? {};
    if (!isValidSlug(slug ?? "") || !name) {
      res.status(400).json({ error: "invalid slug or missing name" });
      return;
    }
    res.status(201).json(scaffoldApp(cfg, { slug, name, description, icon }));
  });

  const withDb = (req: DbRequest, res: Response, next: NextFunction) => {
    if (!isValidSlug(req.params.slug)) {
      res.status(400).json({ error: "invalid slug" });
      return;
    }
    req.db = dbsvc.getAppDb(cfg.dataDir, req.params.slug);
    next();
  };

  r.post("/apps/:slug/db/query", withDb, (req: DbRequest, res) => {
    try {
      res.json({ rows: dbsvc.query(req.db!, req.body.sql, req.body.params ?? []) });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  r.post("/apps/:slug/db/exec", withDb, (req: DbRequest, res) => {
    try {
      res.json(dbsvc.exec(req.db!, req.body.sql, req.body.params ?? []));
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  r.get("/apps/:slug/db/schema", withDb, (req: DbRequest, res) => {
    res.json({ schema: dbsvc.schema(req.db!) });
  });

  r.get("/apps/:slug/store/:key", withDb, (req: DbRequest, res) => {
    res.json({ value: dbsvc.storeGet(req.db!, req.params.key) });
  });

  r.put("/apps/:slug/store/:key", withDb, (req: DbRequest, res) => {
    dbsvc.storeSet(req.db!, req.params.key, req.body.value);
    res.json({ ok: true });
  });

  r.get("/events", (_req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    res.write(": connected\n\n");
    addClient(res);
  });

  return r;
}
```

- [ ] **Step 5: Implement `src/server.ts`** (app-host + dashboard wired in later tasks; minimal now)

```ts
import express from "express";
import type { Config } from "./config.js";
import { apiRouter } from "./routes.js";

export function createServer(cfg: Config): express.Express {
  const app = express();
  app.use("/api", apiRouter(cfg));
  return app;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/api.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/sse.ts src/routes.ts src/server.ts tests/api.test.ts
git commit -m "feat: api router, sse hub, and server factory"
```

---

### Task 6: App host middleware (static serve + auto-injection)

**Files:**
- Create: `src/appHost.ts`
- Modify: `src/server.ts` (mount appHost after `/api`)
- Test: `tests/appHost.test.ts`

**Interfaces:**
- Produces: `appHost(appsDir: string): express.RequestHandler`. For a request whose first path segment is a valid slug with a `lodekit.json`, serves files from `apps/<slug>/` (default `index.html`); injects `<link>`+`<script>` before `</head>` in `index.html` responses; blocks path traversal (403); 404 for missing files; calls `next()` for non-app paths (`/`, `/api/...`, `/_lodekit/...`).
- Consumes: `isValidSlug` from `src/registry.ts`.

- [ ] **Step 1: Write the failing test** — `tests/appHost.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";
import type { Config } from "../src/config.js";

let root: string, server: Server, base: string;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-"));
  const appDir = path.join(root, "apps", "demo");
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, "lodekit.json"), JSON.stringify({ name: "Demo", slug: "demo" }));
  fs.writeFileSync(path.join(appDir, "index.html"), "<html><head></head><body>hi</body></html>");
  fs.writeFileSync(path.join(appDir, "app.js"), "console.log(1)");
  const cfg: Config = {
    root, appsDir: path.join(root, "apps"), dataDir: path.join(root, "data"),
    port: 0, baseUrl: "http://lodekit.localhost:0",
  };
  await new Promise<void>((r) => { server = createServer(cfg).listen(0, () => r()); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterEach(() => { server.close(); fs.rmSync(root, { recursive: true, force: true }); });

describe("appHost", () => {
  it("serves index.html with injected design-system + sdk tags", async () => {
    const html = await (await fetch(base + "/demo")).text();
    expect(html).toContain('href="/_lodekit/design-system.css"');
    expect(html).toContain('src="/_lodekit/sdk.js"');
    expect(html).toContain("<body>hi</body>");
  });

  it("serves other app files without injection", async () => {
    const js = await (await fetch(base + "/demo/app.js")).text();
    expect(js).toBe("console.log(1)");
  });

  it("404s a missing file inside a real app", async () => {
    expect((await fetch(base + "/demo/nope.txt")).status).toBe(404);
  });

  it("blocks path traversal", async () => {
    expect((await fetch(base + "/demo/..%2f..%2fpackage.json")).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/appHost.test.ts`
Expected: FAIL — injected tags absent (appHost not mounted).

- [ ] **Step 3: Implement `src/appHost.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import type { RequestHandler } from "express";
import { isValidSlug } from "./registry.js";

const INJECT =
  '\n<link rel="stylesheet" href="/_lodekit/design-system.css">' +
  '\n<script src="/_lodekit/sdk.js"></script>\n';

export function appHost(appsDir: string): RequestHandler {
  return (req, res, next) => {
    const segments = req.path.split("/").filter(Boolean);
    const slug = segments[0];
    if (!slug || !isValidSlug(slug)) return next();
    const appDir = path.resolve(appsDir, slug);
    if (!fs.existsSync(path.join(appDir, "lodekit.json"))) return next();

    const rest = segments.slice(1).join("/") || "index.html";
    const filePath = path.resolve(appDir, rest);
    if (filePath !== appDir && !filePath.startsWith(appDir + path.sep)) {
      res.status(403).end();
      return;
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.status(404).end();
      return;
    }
    if (filePath.endsWith("index.html")) {
      const raw = fs.readFileSync(filePath, "utf8");
      const html = raw.includes("</head>")
        ? raw.replace("</head>", INJECT + "</head>")
        : INJECT + raw;
      res.type("html").send(html);
      return;
    }
    res.sendFile(filePath);
  };
}
```

- [ ] **Step 4: Modify `src/server.ts`** to mount appHost after `/api`

```ts
import express from "express";
import type { Config } from "./config.js";
import { apiRouter } from "./routes.js";
import { appHost } from "./appHost.js";

export function createServer(cfg: Config): express.Express {
  const app = express();
  app.use("/api", apiRouter(cfg));
  app.use(appHost(cfg.appsDir));
  return app;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/appHost.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/appHost.ts src/server.ts tests/appHost.test.ts
git commit -m "feat: app host middleware with asset injection"
```

---

### Task 7: Browser assets — design system CSS + client SDK

**Files:**
- Create: `public/_lodekit/design-system.css`, `public/_lodekit/sdk.js`
- Modify: `src/server.ts` (serve `/_lodekit` static; serve `public/dashboard/index.html` at `/` — placeholder file created here, filled in Task 8)
- Test: `tests/assets.test.ts`

**Interfaces:**
- Produces: static files at `/_lodekit/design-system.css` and `/_lodekit/sdk.js`. The SDK defines `window.lodekit` with `db.query/exec`, `store.get/set`, `secrets.get` (throws). It derives the app slug from `location.pathname`'s first segment and calls `/api/apps/<slug>/...`.

- [ ] **Step 1: Write the failing test** — `tests/assets.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";
import type { Config } from "../src/config.js";

let root: string, server: Server, base: string;
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-"));
  const cfg: Config = {
    root, appsDir: path.join(root, "apps"), dataDir: path.join(root, "data"),
    port: 0, baseUrl: "http://lodekit.localhost:0",
  };
  await new Promise<void>((r) => { server = createServer(cfg).listen(0, () => r()); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterEach(() => { server.close(); fs.rmSync(root, { recursive: true, force: true }); });

describe("static assets", () => {
  it("serves the design system css", async () => {
    const r = await fetch(base + "/_lodekit/design-system.css");
    expect(r.status).toBe(200);
    expect((await r.text())).toContain(".lk-container");
  });
  it("serves the sdk and exposes window.lodekit", async () => {
    const js = await (await fetch(base + "/_lodekit/sdk.js")).text();
    expect(js).toContain("window.lodekit");
    expect(js).toContain("/api/apps/");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/assets.test.ts`
Expected: FAIL — 404 for `/_lodekit/...`.

- [ ] **Step 3: Create `public/_lodekit/design-system.css`** (shadcn-styled tokens + minimal components)

```css
:root {
  --lk-bg: #ffffff; --lk-fg: #0a0a0a; --lk-muted: #6b7280; --lk-border: #e5e7eb;
  --lk-primary: #18181b; --lk-primary-fg: #fafafa; --lk-radius: 10px;
  --lk-card: #ffffff; --lk-accent: #f4f4f5;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--lk-bg); color: var(--lk-fg); }
.lk-container { max-width: 760px; margin: 0 auto; padding: 40px 24px; }
.lk-h1 { font-size: 28px; font-weight: 650; letter-spacing: -0.02em; margin: 0 0 4px; }
.lk-muted { color: var(--lk-muted); }
.lk-card { background: var(--lk-card); border: 1px solid var(--lk-border);
  border-radius: var(--lk-radius); padding: 20px; }
.lk-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
.lk-row { display: flex; gap: 12px; align-items: center; }
.lk-input, .lk-select { width: 100%; padding: 9px 12px; border: 1px solid var(--lk-border);
  border-radius: 8px; font: inherit; background: var(--lk-bg); color: var(--lk-fg); }
.lk-input:focus, .lk-select:focus { outline: 2px solid var(--lk-primary); outline-offset: 1px; }
.lk-btn { padding: 9px 16px; border: none; border-radius: 8px; font: inherit; font-weight: 550;
  background: var(--lk-primary); color: var(--lk-primary-fg); cursor: pointer; }
.lk-btn:hover { opacity: 0.9; }
.lk-table { width: 100%; border-collapse: collapse; }
.lk-table th, .lk-table td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--lk-border); }
.lk-table th { color: var(--lk-muted); font-weight: 550; font-size: 13px; }
a.lk-cardlink { text-decoration: none; color: inherit; }
a.lk-cardlink:hover .lk-card { border-color: var(--lk-primary); }
```

- [ ] **Step 4: Create `public/_lodekit/sdk.js`**

```js
(function () {
  var slug = location.pathname.split("/").filter(Boolean)[0] || "";
  var base = "/api/apps/" + slug;
  async function jpost(p, body) {
    var r = await fetch(base + p, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    var data = await r.json();
    if (!r.ok) throw new Error(data && data.error ? data.error : r.statusText);
    return data;
  }
  window.lodekit = {
    db: {
      query: async function (sql, params) {
        return (await jpost("/db/query", { sql: sql, params: params || [] })).rows;
      },
      exec: async function (sql, params) {
        return jpost("/db/exec", { sql: sql, params: params || [] });
      },
    },
    store: {
      get: async function (key) {
        var r = await fetch(base + "/store/" + encodeURIComponent(key));
        return (await r.json()).value;
      },
      set: async function (key, value) {
        await fetch(base + "/store/" + encodeURIComponent(key), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: value }),
        });
      },
    },
    secrets: {
      get: async function () {
        throw new Error("lodekit.secrets is not implemented in the POC");
      },
    },
  };
})();
```

- [ ] **Step 5: Create placeholder `public/dashboard/index.html`** (filled in Task 8)

```html
<!doctype html><html><head><meta charset="utf-8"><title>Lodekit</title></head><body></body></html>
```

- [ ] **Step 6: Modify `src/server.ts`** to serve assets + dashboard

```ts
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.js";
import { apiRouter } from "./routes.js";
import { appHost } from "./appHost.js";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

export function createServer(cfg: Config): express.Express {
  const app = express();
  app.use("/_lodekit", express.static(path.join(PUBLIC, "_lodekit")));
  app.use("/api", apiRouter(cfg));
  app.get("/", (_req, res) => res.sendFile(path.join(PUBLIC, "dashboard", "index.html")));
  app.use(appHost(cfg.appsDir));
  return app;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- tests/assets.test.ts`
Expected: PASS (2 tests). Re-run full suite `npm test` — all prior tests still PASS.

- [ ] **Step 8: Commit**

```bash
git add public/_lodekit/design-system.css public/_lodekit/sdk.js public/dashboard/index.html src/server.ts tests/assets.test.ts
git commit -m "feat: design system css, client sdk, asset serving"
```

---

### Task 8: Dashboard page (app grid + live SSE)

**Files:**
- Modify: `public/dashboard/index.html`
- Test: `tests/dashboard.test.ts`

**Interfaces:**
- Consumes: `GET /api/apps` (list) and `GET /api/events` (SSE `apps-changed`).
- Produces: a self-contained HTML page that renders one `.lk-card` per app (linking to `/<slug>`), shows an empty state when none, and re-fetches the list on each SSE `apps-changed` event.

- [ ] **Step 1: Write the failing test** — `tests/dashboard.test.ts`

```ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("dashboard html", () => {
  const html = fs.readFileSync(
    path.join(process.cwd(), "public", "dashboard", "index.html"),
    "utf8"
  );
  it("links the design system and fetches the app list", () => {
    expect(html).toContain("/_lodekit/design-system.css");
    expect(html).toContain("/api/apps");
  });
  it("subscribes to live updates and has an empty state", () => {
    expect(html).toContain("/api/events");
    expect(html).toContain("Ask Claude to build a tool with Lodekit");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/dashboard.test.ts`
Expected: FAIL — placeholder dashboard lacks these strings.

- [ ] **Step 3: Implement `public/dashboard/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Lodekit</title>
  <link rel="stylesheet" href="/_lodekit/design-system.css">
</head>
<body>
  <main class="lk-container">
    <div class="lk-row" style="justify-content: space-between; margin-bottom: 24px;">
      <h1 class="lk-h1">Lodekit</h1>
      <span class="lk-muted" id="count"></span>
    </div>
    <div id="apps" class="lk-grid"></div>
    <div id="empty" class="lk-card" style="display:none;">
      <p class="lk-muted">No tools yet. Ask Claude to build a tool with Lodekit.</p>
    </div>
  </main>
  <script>
    async function render() {
      const apps = await (await fetch("/api/apps")).json();
      const grid = document.getElementById("apps");
      const empty = document.getElementById("empty");
      document.getElementById("count").textContent =
        apps.length + (apps.length === 1 ? " tool" : " tools");
      grid.innerHTML = "";
      empty.style.display = apps.length ? "none" : "block";
      for (const a of apps) {
        const link = document.createElement("a");
        link.className = "lk-cardlink";
        link.href = "/" + a.slug;
        link.innerHTML =
          '<div class="lk-card">' +
          '<div style="font-size:28px">' + (a.icon || "📦") + "</div>" +
          '<div style="font-weight:600;margin-top:8px">' + a.name + "</div>" +
          '<div class="lk-muted" style="font-size:13px">' + (a.description || "") + "</div>" +
          "</div>";
        grid.appendChild(link);
      }
    }
    render();
    const es = new EventSource("/api/events");
    es.addEventListener("apps-changed", render);
  </script>
</body>
</html>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/dashboard.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add public/dashboard/index.html tests/dashboard.test.ts
git commit -m "feat: live dashboard page"
```

---

### Task 9: Watcher + entrypoint (`npm start`)

**Files:**
- Create: `src/watcher.ts`, `src/index.ts`
- Modify: `src/server.ts` (add `start(cfg)` that wires the watcher + listens)
- Test: `tests/watcher.test.ts`

**Interfaces:**
- Produces: `startWatcher(cfg: Config): FSWatcher` (chokidar on `appsDir`, ensures it exists, broadcasts SSE `apps-changed` with the current app list on any add/change/unlink). `start(cfg: Config): Server` in `src/server.ts`. `src/index.ts` calls `start(loadConfig())`.
- Consumes: `broadcast` from `src/sse.ts`, `scanApps` from `src/registry.ts`.

- [ ] **Step 1: Write the failing test** — `tests/watcher.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { start } from "../src/server.js";
import { loadConfig } from "../src/config.js";

let root: string, server: Server, base: string;
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-"));
  process.env.LODEKIT_ROOT = root;
  process.env.LODEKIT_PORT = "0";
  server = start(loadConfig());
  await new Promise<void>((r) => server.once("listening", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterEach(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.LODEKIT_ROOT;
  delete process.env.LODEKIT_PORT;
});

describe("watcher", () => {
  it("emits an SSE apps-changed event when an app folder appears", async () => {
    const received: string[] = [];
    const res = await fetch(base + "/api/events");
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    const pump = (async () => {
      for (let i = 0; i < 50; i++) {
        const { value, done } = await reader.read();
        if (done) break;
        received.push(dec.decode(value));
        if (received.join("").includes("apps-changed")) break;
      }
    })();

    const appDir = path.join(root, "apps", "live");
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, "lodekit.json"), JSON.stringify({ name: "Live", slug: "live" }));

    await pump;
    reader.cancel();
    expect(received.join("")).toContain("apps-changed");
  }, 10000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/watcher.test.ts`
Expected: FAIL — `start` not exported.

- [ ] **Step 3: Implement `src/watcher.ts`**

```ts
import fs from "node:fs";
import chokidar, { type FSWatcher } from "chokidar";
import type { Config } from "./config.js";
import { broadcast } from "./sse.js";
import { scanApps } from "./registry.js";

export function startWatcher(cfg: Config): FSWatcher {
  fs.mkdirSync(cfg.appsDir, { recursive: true });
  const notify = () => broadcast("apps-changed", scanApps(cfg.appsDir));
  const watcher = chokidar.watch(cfg.appsDir, { ignoreInitial: true, depth: 2 });
  watcher
    .on("add", notify)
    .on("change", notify)
    .on("unlink", notify)
    .on("addDir", notify)
    .on("unlinkDir", notify);
  return watcher;
}
```

- [ ] **Step 4: Add `start` to `src/server.ts`** (append; keep `createServer`)

```ts
import { startWatcher } from "./watcher.js";
import type { Server } from "node:http";

export function start(cfg: Config): Server {
  const app = createServer(cfg);
  startWatcher(cfg);
  return app.listen(cfg.port, () => {
    console.log(`Lodekit running at ${cfg.baseUrl}`);
  });
}
```

- [ ] **Step 5: Implement `src/index.ts`**

```ts
import { loadConfig } from "./config.js";
import { start } from "./server.js";

start(loadConfig());
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/watcher.test.ts`
Expected: PASS (1 test). Then `npm test` — full suite PASS.

- [ ] **Step 7: Manual boot check**

Run: `LODEKIT_ROOT=/tmp/lodekit-demo npm start`
Expected: prints `Lodekit running at http://lodekit.localhost:7777`. Open `http://lodekit.localhost:7777/` in Chrome → empty-state dashboard. Stop with Ctrl-C.

- [ ] **Step 8: Commit**

```bash
git add src/watcher.ts src/index.ts src/server.ts tests/watcher.test.ts
git commit -m "feat: folder watcher and server entrypoint"
```

---

### Task 10: MCP server (thin HTTP client)

**Files:**
- Create: `mcp/index.ts`, `mcp/README.md`
- Test: `tests/mcp.test.ts` (tests the underlying HTTP calls the tools make; the stdio transport itself is exercised manually)

**Interfaces:**
- Produces an MCP stdio server exposing four tools that call the running Lodekit server at `LODEKIT_BASE_URL` (default `http://lodekit.localhost:7777`):
  - `lodekit_scaffold({ slug, name, description?, icon? })` → POST `/api/apps`; returns the created paths + URL as text.
  - `lodekit_list_apps({})` → GET `/api/apps`; returns the list as text.
  - `lodekit_open_app({ slug })` → spawns the platform "open" command on `${base}/${slug}`; returns the URL.
  - `lodekit_inspect_db({ slug })` → GET `/api/apps/:slug/db/schema`; returns schema + samples as text.
- The HTTP-calling logic lives in exported helpers so it is unit-testable without stdio.

- [ ] **Step 1: Write the failing test** — `tests/mcp.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { start } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { scaffold, listApps, inspectDb } from "../mcp/index.js";

let root: string, server: Server, base: string;
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-"));
  process.env.LODEKIT_ROOT = root;
  process.env.LODEKIT_PORT = "0";
  server = start(loadConfig());
  await new Promise<void>((r) => server.once("listening", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterEach(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.LODEKIT_ROOT;
  delete process.env.LODEKIT_PORT;
});

describe("mcp tool helpers", () => {
  it("scaffolds, lists, and inspects an app via http", async () => {
    const created = await scaffold(base, { slug: "books", name: "Books" });
    expect(created.url).toContain("/books");

    const list = await listApps(base);
    expect(list.map((a: { slug: string }) => a.slug)).toContain("books");

    await fetch(base + "/api/apps/books/db/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "CREATE TABLE b (id INTEGER PRIMARY KEY, title TEXT)" }),
    });
    const schema = await inspectDb(base, "books");
    expect(schema.schema.map((t: { table: string }) => t.table)).toContain("b");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/mcp.test.ts`
Expected: FAIL — cannot find module `../mcp/index.js`.

- [ ] **Step 3: Implement `mcp/index.ts`**

```ts
import { spawn } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = process.env.LODEKIT_BASE_URL ?? "http://lodekit.localhost:7777";

export async function scaffold(
  base: string,
  input: { slug: string; name: string; description?: string; icon?: string }
) {
  const r = await fetch(base + "/api/apps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`scaffold failed: ${r.status}`);
  return r.json();
}

export async function listApps(base: string) {
  const r = await fetch(base + "/api/apps");
  return r.json();
}

export async function inspectDb(base: string, slug: string) {
  const r = await fetch(`${base}/api/apps/${slug}/db/schema`);
  if (!r.ok) throw new Error(`inspect failed: ${r.status}`);
  return r.json();
}

function openInBrowser(url: string) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
}

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

const server = new McpServer({ name: "lodekit", version: "0.0.1" });

server.tool(
  "lodekit_scaffold",
  { slug: z.string(), name: z.string(), description: z.string().optional(), icon: z.string().optional() },
  async (args) => text(await scaffold(BASE, args))
);

server.tool("lodekit_list_apps", {}, async () => text(await listApps(BASE)));

server.tool("lodekit_open_app", { slug: z.string() }, async ({ slug }) => {
  const url = `${BASE}/${slug}`;
  openInBrowser(url);
  return text({ opened: url });
});

server.tool("lodekit_inspect_db", { slug: z.string() }, async ({ slug }) =>
  text(await inspectDb(BASE, slug))
);

// Only connect stdio when run directly (not when imported by tests).
if (process.argv[1] && process.argv[1].endsWith("index.ts")) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

- [ ] **Step 4: Create `mcp/README.md`** (how to wire into Claude Code)

```markdown
# Lodekit MCP

Start the Lodekit server first (`npm start`), then register this MCP server with Claude Code:

    claude mcp add lodekit -- npx tsx /ABSOLUTE/PATH/TO/lodekit/mcp/index.ts

Tools: `lodekit_scaffold`, `lodekit_list_apps`, `lodekit_open_app`, `lodekit_inspect_db`.
Override the server URL with `LODEKIT_BASE_URL` (default `http://lodekit.localhost:7777`).
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/mcp.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add mcp/index.ts mcp/README.md tests/mcp.test.ts
git commit -m "feat: mcp server with scaffold/list/open/inspect tools"
```

---

### Task 11: Lodekit build Skill

**Files:**
- Create: `skill/SKILL.md`

**Interfaces:**
- Produces a markdown skill teaching Claude the contract, the SDK API, the design-system classes, and the workflow (scaffold via MCP, then write `index.html` + `app.js`). No tests — content task; verified by the Task 12 end-to-end build.

- [ ] **Step 1: Create `skill/SKILL.md`**

````markdown
---
name: lodekit-builder
description: Use when building a local tool/app "with Lodekit" — scaffolds via the Lodekit MCP, then writes a single-page app using the Lodekit client SDK and design system.
---

# Building Lodekit Apps

Lodekit hosts small single-page tools. You write plain HTML + vanilla JS; Lodekit
auto-injects the design system and a client SDK. Data is per-app SQLite via the SDK.

## Workflow

1. Call MCP tool `lodekit_scaffold({ slug, name, description, icon })`. `slug` must match
   `^[a-z0-9-]+$`. This creates `apps/<slug>/` with `lodekit.json` + stub `index.html`/`app.js`
   and returns the app URL.
2. Write `apps/<slug>/index.html` and `apps/<slug>/app.js` with the real tool. Do NOT add
   `<link>`/`<script>` for the design system or SDK — Lodekit injects them.
3. Use design-system classes for a consistent look (below).
4. Use `window.lodekit` for storage. Create tables on load with `db.exec`.
5. Call `lodekit_open_app({ slug })` to open it; `lodekit_inspect_db({ slug })` to check data.

## Client SDK (`window.lodekit`)

- `await lodekit.db.query(sql, params?)` → array of row objects.
- `await lodekit.db.exec(sql, params?)` → `{ changes, lastInsertRowid }`.
- `await lodekit.store.get(key)` → JSON value or `null`.
- `await lodekit.store.set(key, value)` → persists JSON.
- `lodekit.secrets.get(name)` — not implemented in the POC; do not use.

## Design system classes

`lk-container` (page wrapper), `lk-h1`, `lk-muted`, `lk-card`, `lk-grid`, `lk-row`,
`lk-input`, `lk-select`, `lk-btn`, `lk-table`. Prefer these over custom CSS so tools
look consistent. App-specific tweaks go in an optional `app.css`.

## Example `app.js`

```js
async function init() {
  await lodekit.db.exec(
    "CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, body TEXT, created_at TEXT)"
  );
  await render();
}
async function render() {
  const notes = await lodekit.db.query("SELECT * FROM notes ORDER BY id DESC");
  // ...build DOM with lk- classes...
}
init();
```
````

- [ ] **Step 2: Commit**

```bash
git add skill/SKILL.md
git commit -m "docs: lodekit-builder skill"
```

---

### Task 12: End-to-end — build the Expense Tracker via the contract

This task proves the three magic moments. It writes the demo app the way Claude would
(via the contract), then verifies it end-to-end.

**Files:**
- Create: `apps/expense-tracker/lodekit.json`, `apps/expense-tracker/index.html`, `apps/expense-tracker/app.js`
- Test: `tests/e2e.test.ts`

**Interfaces:**
- Consumes: the full stack (server, API, SDK, app host). Produces a working tool at `/expense-tracker` storing expenses in SQLite and a default-currency setting in KV.

- [ ] **Step 1: Write the failing end-to-end test** — `tests/e2e.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { start } from "../src/server.js";
import { loadConfig } from "../src/config.js";

let root: string, server: Server, base: string;
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-"));
  // copy the committed demo app into the temp root's apps dir
  const src = path.join(process.cwd(), "apps", "expense-tracker");
  const dst = path.join(root, "apps", "expense-tracker");
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dst, f));
  process.env.LODEKIT_ROOT = root;
  process.env.LODEKIT_PORT = "0";
  server = start(loadConfig());
  await new Promise<void>((r) => server.once("listening", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterEach(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.LODEKIT_ROOT;
  delete process.env.LODEKIT_PORT;
});

describe("expense tracker e2e", () => {
  it("appears in the registry with injected assets", async () => {
    const list = await (await fetch(base + "/api/apps")).json();
    expect(list.map((a: { slug: string }) => a.slug)).toContain("expense-tracker");
    const html = await (await fetch(base + "/expense-tracker")).text();
    expect(html).toContain("/_lodekit/sdk.js");
    expect(html).toContain("Expense Tracker");
  });

  it("persists an expense through the SDK's HTTP API", async () => {
    await fetch(base + "/api/apps/expense-tracker/db/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sql: "CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY, amount REAL, category TEXT, note TEXT, created_at TEXT)",
      }),
    });
    await fetch(base + "/api/apps/expense-tracker/db/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sql: "INSERT INTO expenses (amount, category, note, created_at) VALUES (?,?,?,?)",
        params: [12.5, "food", "lunch", "2026-06-30"],
      }),
    });
    const q = await (
      await fetch(base + "/api/apps/expense-tracker/db/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: "SELECT SUM(amount) AS total FROM expenses" }),
      })
    ).json();
    expect(q.rows[0].total).toBe(12.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/e2e.test.ts`
Expected: FAIL — `apps/expense-tracker` does not exist.

- [ ] **Step 3: Create `apps/expense-tracker/lodekit.json`**

```json
{
  "name": "Expense Tracker",
  "slug": "expense-tracker",
  "icon": "💸",
  "description": "Track expenses with a running total."
}
```

- [ ] **Step 4: Create `apps/expense-tracker/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Expense Tracker</title>
</head>
<body>
  <main class="lk-container">
    <h1 class="lk-h1">Expense Tracker</h1>
    <p class="lk-muted">Total: <strong id="total">—</strong></p>

    <div class="lk-card" style="margin: 20px 0;">
      <div class="lk-row" style="flex-wrap: wrap;">
        <input id="amount" class="lk-input" style="max-width:120px" type="number" step="0.01" placeholder="Amount">
        <select id="category" class="lk-select" style="max-width:160px">
          <option>Food</option><option>Transport</option><option>Bills</option><option>Other</option>
        </select>
        <input id="note" class="lk-input" style="flex:1; min-width:140px" placeholder="Note">
        <button id="add" class="lk-btn">Add</button>
      </div>
    </div>

    <table class="lk-table">
      <thead><tr><th>Date</th><th>Category</th><th>Note</th><th>Amount</th></tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </main>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 5: Create `apps/expense-tracker/app.js`**

```js
async function init() {
  await lodekit.db.exec(
    "CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY, amount REAL, category TEXT, note TEXT, created_at TEXT)"
  );
  if ((await lodekit.store.get("currency")) === null) {
    await lodekit.store.set("currency", "USD");
  }
  document.getElementById("add").addEventListener("click", addExpense);
  await render();
}

async function addExpense() {
  const amount = parseFloat(document.getElementById("amount").value);
  if (!amount) return;
  const category = document.getElementById("category").value;
  const note = document.getElementById("note").value;
  await lodekit.db.exec(
    "INSERT INTO expenses (amount, category, note, created_at) VALUES (?,?,?,?)",
    [amount, category, note, new Date().toISOString().slice(0, 10)]
  );
  document.getElementById("amount").value = "";
  document.getElementById("note").value = "";
  await render();
}

async function render() {
  const rows = await lodekit.db.query("SELECT * FROM expenses ORDER BY id DESC");
  const total = await lodekit.db.query("SELECT COALESCE(SUM(amount),0) AS t FROM expenses");
  const currency = (await lodekit.store.get("currency")) || "USD";
  document.getElementById("total").textContent = currency + " " + total[0].t.toFixed(2);
  document.getElementById("rows").innerHTML = rows
    .map(
      (r) =>
        "<tr><td>" + r.created_at + "</td><td>" + r.category + "</td><td>" +
        (r.note || "") + "</td><td>" + currency + " " + r.amount.toFixed(2) + "</td></tr>"
    )
    .join("");
}

init();
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/e2e.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Full suite + manual end-to-end**

Run: `npm test`
Expected: ALL tests PASS.

Manual: `LODEKIT_ROOT=/tmp/lodekit-demo npm start`, open `http://lodekit.localhost:7777/` → Expense Tracker card visible → click it → add an expense → total updates → reload → data persists. Confirm `/tmp/lodekit-demo/data/expense-tracker/db.sqlite` exists.

- [ ] **Step 8: Commit**

```bash
git add apps/expense-tracker/lodekit.json apps/expense-tracker/index.html apps/expense-tracker/app.js tests/e2e.test.ts
git commit -m "feat: expense tracker demo app and end-to-end test"
```

---

## Self-Review

**Spec coverage:**
- §2 architecture (single Express process, host/API/dashboard/watcher) → Tasks 5–9. ✓
- §2 `kmr.localhost` no-root routing → path-based `/:slug` in Task 6; documented. ✓
- §3 app contract + auto-injection → Tasks 4 (scaffold), 6 (injection). ✓
- §3 layout (apps/ vs data/, no per-app node_modules) → Tasks 1–4. ✓
- §4 client SDK (`db`, `store`, `secrets` stub) → Task 7. ✓
- §5 backend API (all endpoints incl. SSE) → Task 5; schema endpoint added for inspect. ✓
- §6 dashboard (grid, empty state, live) → Task 8. ✓
- §7 MCP tools (scaffold/list/open/inspect) → Task 10. ✓
- §8 skill → Task 11. ✓
- §9 demo expense tracker (SQL + KV) → Task 12. ✓
- §11 testing (smoke boot, scaffold round-trip, SSE event) → Tasks 5, 9, 12. ✓

**Deviations from spec (intentional, flagged for review):**
- Registry is a filesystem scan, not a `lodekit.db` table (simpler; spec §5 mentioned `kmr.db`).
- MCP is a thin HTTP client to the server rather than sharing config to touch files directly (spec §7 left this open).
- A `POST /api/apps` scaffold endpoint and a `GET /api/apps/:slug/db/schema` endpoint were added to support the MCP cleanly (not in spec §5's table).
- POC entry is `npm start`; a global `lodekit start` CLI is roadmap (spec §2 wrote `kmr start`).

**Placeholder scan:** none — every step contains real code/commands.

**Type consistency:** `Config` shape, `AppManifest`, `scanApps`, `getAppDb`/`query`/`exec`/`storeGet`/`storeSet`/`schema`, `scaffoldApp`, `apiRouter`/`createServer`/`start`, `appHost`, `startWatcher`, and the MCP helpers `scaffold`/`listApps`/`inspectDb` are referenced consistently across tasks.
