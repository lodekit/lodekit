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
