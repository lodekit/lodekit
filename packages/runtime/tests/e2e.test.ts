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
