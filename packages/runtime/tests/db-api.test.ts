import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";
import type { Config } from "../src/config.js";
import { getAppDb } from "../src/db.js";
import { initEventStore, closeEventStoreForTest } from "../src/eventStore.js";

let root: string, server: Server, base: string;
const aborters: AbortController[] = [];

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-kvapi-"));
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
  // /api/events/history reads through the event store singleton — createServer()
  // (unlike start()) doesn't open it, so the change-feed tests below need it explicitly.
  initEventStore(cfg.dataDir);
  await new Promise<void>((resolve) => {
    server = createServer(cfg).listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterEach(() => {
  for (const a of aborters.splice(0)) a.abort();
  server.close();
  closeEventStoreForTest();
  fs.rmSync(root, { recursive: true, force: true });
  vi.useRealTimers();
});

const dbApi = (appId: string, p: string) => `${base}/api/apps/${appId}/db-store${p}`;
const post = async (url: string, body: unknown) => {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
// Creates a user table directly through the app's db handle — the data plane
// doesn't depend on the push (Task 8); DDL here stands in for an applied schema.
function makeTable(appId: string) {
  getAppDb(path.join(root, "data"), appId).exec(
    "CREATE TABLE IF NOT EXISTS plants (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"
  );
}

describe("db-store /query", () => {
  it("insert (run), select (all/get/values) round-trip in proxy row shape", async () => {
    makeTable("app");
    const ins = await post(dbApi("app", "/query"), {
      sql: "INSERT INTO plants (name) VALUES (?)", params: ["Fernando"], method: "run",
    });
    expect(ins.status).toBe(200);
    expect(ins.body).toEqual({ rows: [] });
    const all = await post(dbApi("app", "/query"), { sql: "SELECT id, name FROM plants", params: [], method: "all" });
    expect(all.body).toEqual({ rows: [[1, "Fernando"]] });          // raw arrays, not objects
    const get = await post(dbApi("app", "/query"), { sql: "SELECT name FROM plants WHERE id = ?", params: [1], method: "get" });
    expect(get.body).toEqual({ rows: ["Fernando"] });               // flat array for get
    const miss = await post(dbApi("app", "/query"), { sql: "SELECT name FROM plants WHERE id = 99", params: [], method: "get" });
    expect(miss.body).toEqual({ rows: [] });                        // missing row -> empty
  });

  it("INSERT … RETURNING travels as method all", async () => {
    makeTable("app");
    const r = await post(dbApi("app", "/query"), {
      sql: "INSERT INTO plants (name) VALUES (?) RETURNING id, name", params: ["Doris"], method: "all",
    });
    expect(r.body.rows).toEqual([[1, "Doris"]]);
  });

  it("rejects non-whitelisted statements and internal-table references", async () => {
    makeTable("app");
    for (const sql of [
      "PRAGMA user_version",
      "ATTACH DATABASE 'x' AS y",
      "DROP TABLE plants",
      "CREATE TABLE hax (x)",
      "SELECT * FROM _kv",
      "DELETE FROM _task_runs",
      "SELECT * FROM sqlite_master",
      "INSERT INTO plants (name) SELECT key FROM _kv",
    ]) {
      const r = await post(dbApi("app", "/query"), { sql, params: [], method: "all" });
      expect(r.status, sql).toBe(400);
    }
  });

  it("rejects multi-statement smuggling and non-scalar params", async () => {
    makeTable("app");
    const multi = await post(dbApi("app", "/query"), {
      sql: "SELECT 1; DROP TABLE plants", params: [], method: "all",
    });
    expect(multi.status).toBe(400);
    const obj = await post(dbApi("app", "/query"), {
      sql: "INSERT INTO plants (name) VALUES (?)", params: [{ nested: true }], method: "run",
    });
    expect(obj.status).toBe(400);
  });

  it("scopes by app id", async () => {
    makeTable("a");
    await post(dbApi("a", "/query"), { sql: "INSERT INTO plants (name) VALUES ('mine')", params: [], method: "run" });
    makeTable("b");
    const r = await post(dbApi("b", "/query"), { sql: "SELECT count(*) FROM plants", params: [], method: "get" });
    expect(r.body.rows).toEqual([0]);
    expect((await post(dbApi("bad id!", "/query"), { sql: "SELECT 1", params: [], method: "get" })).status).toBe(400);
  });
});

describe("db-store /batch", () => {
  it("runs queries in one transaction and returns per-query results", async () => {
    makeTable("app");
    const r = await post(dbApi("app", "/batch"), {
      queries: [
        { sql: "INSERT INTO plants (name) VALUES (?)", params: ["A"], method: "run" },
        { sql: "SELECT count(*) FROM plants", params: [], method: "get" },
      ],
    });
    expect(r.status).toBe(200);
    expect(r.body.results).toEqual([{ rows: [] }, { rows: [1] }]);
  });

  it("a failing query rolls the whole batch back", async () => {
    makeTable("app");
    const r = await post(dbApi("app", "/batch"), {
      queries: [
        { sql: "INSERT INTO plants (name) VALUES ('kept?')", params: [], method: "run" },
        { sql: "INSERT INTO plants (name) VALUES (NULL)", params: [], method: "run" }, // NOT NULL violation
      ],
    });
    expect(r.status).toBe(400);
    const count = await post(dbApi("app", "/query"), { sql: "SELECT count(*) FROM plants", params: [], method: "get" });
    expect(count.body.rows).toEqual([0]);
  });
});

describe("db-store /select + /schema", () => {
  it("select answers SELECTs and refuses writes at the connection", async () => {
    makeTable("app");
    await post(dbApi("app", "/query"), { sql: "INSERT INTO plants (name) VALUES ('x')", params: [], method: "run" });
    const ok = await post(dbApi("app", "/select"), { sql: "SELECT name FROM plants" });
    expect(ok.status).toBe(200);
    expect(ok.body.rows).toEqual([{ name: "x" }]);                  // objects here — human/agent-facing
    const write = await post(dbApi("app", "/select"), { sql: "DELETE FROM plants" });
    expect(write.status).toBe(400);                                 // readonly connection refuses
  });

  it("schema lists user tables only, hiding _* and sqlite_*", async () => {
    makeTable("app");
    const r = await fetch(dbApi("app", "/schema"));
    const body = await r.json();
    expect(body.tables.map((t: { name: string }) => t.name)).toEqual(["plants"]);
    const plants = body.tables[0];
    expect(plants.columns.map((c: { name: string }) => c.name)).toEqual(["id", "name"]);
  });

  it("no database yet -> empty schema, select 404s", async () => {
    const r = await fetch(dbApi("virgin", "/schema"));
    expect(await r.json()).toEqual({ tables: [] });
    expect((await post(dbApi("virgin", "/select"), { sql: "SELECT 1" })).status).toBe(404);
  });
});

describe("db-store change feed", () => {
  it("writes emit db-store-change with op + table", async () => {
    makeTable("app");
    await post(dbApi("app", "/query"), { sql: 'INSERT INTO "plants" (name) VALUES (?)', params: ["F"], method: "run" });
    const events = await (await fetch(`${base}/api/events/history?ns=app&type=db-store-change`)).json();
    expect(events.records.length).toBeGreaterThan(0);
    expect(events.records[0].payload).toEqual({ op: "insert", table: "plants" });
  });

  it("reads emit nothing", async () => {
    makeTable("quiet");
    await post(dbApi("quiet", "/query"), { sql: "SELECT 1", params: [], method: "get" });
    const events = await (await fetch(`${base}/api/events/history?ns=quiet&type=db-store-change`)).json();
    expect(events.records).toEqual([]);
  });
});
