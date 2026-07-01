import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import { start } from "../src/server.js";
import { loadConfig } from "../src/config.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

let root: string, cache: string, server: Server, base: string;

function copyDir(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// Poll the app endpoint until it serves built output. Deterministic — unlike
// subscribing to the SSE `ready` event, which start()'s buildAll can broadcast
// before a listener attaches (the event is then missed and the wait hangs).
// The building page has no hashed assets; the built page references /assets/;
// a failed build serves the "Build failed" page.
async function waitReady(base: string, slug: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const body = await (await fetch(base + "/" + slug + "/")).text();
    if (body.includes("/assets/")) return;
    if (body.includes("Build failed")) throw new Error(`build failed for ${slug}: ${body.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${slug} to build`);
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-root-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-cache-"));
  copyDir(
    path.join(__dirname, "../../../examples/apps/expense-tracker"),
    path.join(root, "apps", "expense-tracker")
  );
  copyDir(
    path.join(__dirname, "../../../examples/apps/habit-tracker"),
    path.join(root, "apps", "habit-tracker")
  );
  process.env.LODEKIT_ROOT = root;
  process.env.LODEKIT_CACHE_DIR = cache;
  process.env.LODEKIT_PORT = "0";
  server = start(loadConfig());
  await new Promise<void>((r) => server.once("listening", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  await waitReady(base, "expense-tracker", 40000);
  await waitReady(base, "habit-tracker", 40000);
}, 90000); // hook builds two real example apps via Vite; well above vitest's 10s default
afterEach(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
  delete process.env.LODEKIT_ROOT;
  delete process.env.LODEKIT_CACHE_DIR;
  delete process.env.LODEKIT_PORT;
});

describe("expense tracker e2e (bundled)", () => {
  it("serves the bundled index.html and a hashed asset", async () => {
    const list = await (await fetch(base + "/api/apps")).json();
    expect(list.map((a: { slug: string }) => a.slug)).toContain("expense-tracker");
    const html = await (await fetch(base + "/expense-tracker/")).text();
    expect(html).toContain("<div id=\"root\">");
    const asset = html.match(/\/assets\/[\w.-]+\.js/);
    expect(asset).toBeTruthy();
    expect((await fetch(base + "/expense-tracker" + asset![0])).status).toBe(200);
  }, 45000);

  it("round-trips an expense through the API", async () => {
    await fetch(base + "/api/apps/expense-tracker/db/exec", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY, amount REAL, category TEXT, note TEXT, created_at TEXT)" }),
    });
    await fetch(base + "/api/apps/expense-tracker/db/exec", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "INSERT INTO expenses (amount, category, note, created_at) VALUES (?,?,?,?)", params: [12.5, "food", "lunch", "2026-06-30"] }),
    });
    const q = await (await fetch(base + "/api/apps/expense-tracker/db/query", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "SELECT SUM(amount) AS total FROM expenses" }),
    })).json();
    expect(q.rows[0].total).toBe(12.5);
  }, 45000);

  it("serves the bundled habit-tracker index.html and a hashed asset", async () => {
    const html = await (await fetch(base + "/habit-tracker/")).text();
    expect(html).toContain("<div id=\"root\">");
    const asset = html.match(/\/assets\/[\w.-]+\.js/);
    expect(asset).toBeTruthy();
    expect((await fetch(base + "/habit-tracker" + asset![0])).status).toBe(200);
  }, 45000);
});
