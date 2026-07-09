// db-e2e.test.ts — harness copied from settings-e2e.test.ts (same fixture-app
// scaffold + start(cfg) + wait helpers; only the fixture file and assertions
// below differ). Covers the db-store spec §7 flow end to end: boot push →
// additive rebuild → destructive gate.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import { start } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { stopAllWorkers } from "../src/appWorker.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fixture = path.join(__dirname, "fixtures", "start-app");
const APP = "start-app";

let root: string, cache: string, server: Server, base: string;

function copyDir(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

async function waitReady(appId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await (await fetch(`${base}/${appId}/`)).text();
    if (last.includes("/_build/")) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${appId}; last page: ${last.slice(0, 300)}`);
}

const dbTsV1 = `
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createDb } from "@lodekit/sdk";
export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  body: text("body").notNull(),
});
export const db = createDb({ notes });
`;
const dbTsV2 = dbTsV1.replace(
  'body: text("body").notNull(),',
  'body: text("body").notNull(),\n  mood: text("mood"),'
);
const dbTsV3destructive = dbTsV1.replace('body: text("body").notNull(),', ""); // drops body

const query = (body: unknown) =>
  fetch(`${base}/api/apps/${APP}/db-store/query`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

async function waitForColumns(expected: string[], timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let last: string[] = [];
  while (Date.now() < deadline) {
    const schema = await (await fetch(`${base}/api/apps/${APP}/db-store/schema`)).json();
    last = schema.tables.find((t: { name: string }) => t.name === "notes")?.columns.map((c: { name: string }) => c.name) ?? [];
    if (JSON.stringify(last) === JSON.stringify(expected)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`columns never matched ${JSON.stringify(expected)}; last ${JSON.stringify(last)}`);
}

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-dbe2e-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-dbe2e-cache-"));
  copyDir(fixture, path.join(root, "apps", APP));
  fs.writeFileSync(path.join(root, "apps", APP, "src", "db.ts"), dbTsV1);
  process.env.LODEKIT_ROOT = root;
  process.env.LODEKIT_CACHE_DIR = cache;
  process.env.LODEKIT_PORT = "0";
  server = await start(loadConfig());
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  await waitReady(APP, 90_000);
}, 120_000);
afterAll(async () => {
  stopAllWorkers();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
  delete process.env.LODEKIT_ROOT;
  delete process.env.LODEKIT_CACHE_DIR;
  delete process.env.LODEKIT_PORT;
});

describe("db-store e2e (real worker, real build)", () => {
  it("pushes the declared schema before the worker signals ready; query round-trips", async () => {
    await waitForColumns(["id", "body"], 10_000);
    await query({ sql: "INSERT INTO notes (body) VALUES (?)", params: ["hi"], method: "run" });
    const res = await (await query({ sql: "SELECT id, body FROM notes", params: [], method: "all" })).json();
    expect(res).toEqual({ rows: [[1, "hi"]] });
  }, 15_000);

  it("an additive rebuild applies the new column; existing data survives", async () => {
    fs.writeFileSync(path.join(root, "apps", APP, "src", "db.ts"), dbTsV2);
    await waitForColumns(["id", "body", "mood"], 20_000);
    const res = await (await query({ sql: "SELECT id, body FROM notes", params: [], method: "all" })).json();
    expect(res).toEqual({ rows: [[1, "hi"]] });
  }, 30_000);

  it("a destructive rebuild gates: schema unchanged, app keeps serving", async () => {
    fs.writeFileSync(path.join(root, "apps", APP, "src", "db.ts"), dbTsV3destructive);
    const deadline = Date.now() + 20_000;
    let gated = false;
    while (Date.now() < deadline && !gated) {
      const hist = await (
        await fetch(`${base}/api/events/history?ns=${APP}&type=schema-state`)
      ).json();
      gated = hist.records.some((r: { payload: { status?: string } }) => r.payload?.status === "gated");
      if (!gated) await new Promise((r) => setTimeout(r, 300));
    }
    expect(gated).toBe(true);
    const schema = await (await fetch(`${base}/api/apps/${APP}/db-store/schema`)).json();
    const cols = schema.tables.find((t: { name: string }) => t.name === "notes")?.columns.map((c: { name: string }) => c.name);
    expect(cols).toContain("body");
    await waitReady(APP, 20_000);
  }, 30_000);
});
