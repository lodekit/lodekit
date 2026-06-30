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
