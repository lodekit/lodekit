import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { start } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { scaffold, listApps } from "../../mcp/client.js";
import { createClient } from "@lodekit/sdk";

let root: string, server: Server, base: string;
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-"));
  process.env.LODEKIT_ROOT = root;
  process.env.LODEKIT_PORT = "0";
  server = await start(loadConfig());
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
}, 60000);
afterEach(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.LODEKIT_ROOT;
  delete process.env.LODEKIT_PORT;
});

describe("mcp tool helpers", () => {
  it("scaffolds and lists an app via http", async () => {
    const created = await scaffold(base, { appId: "books", name: "Books" });
    expect(created.url).toContain("/books");

    const list = await listApps(base);
    expect(list.map((a: { appId: string }) => a.appId)).toContain("books");
  });

  it("reads app data through the sdk core the kv tools use", async () => {
    await scaffold(base, { appId: "recipes", name: "Recipes" });
    const kv = createClient({ baseUrl: base, appId: "recipes" }).kv;
    await kv.set("recipe:1", { title: "Soup" });
    expect(await kv.get("recipe:1")).toEqual({ title: "Soup" });
    const page = await kv.list({ prefix: "recipe:" });
    expect(page.entries.map((e) => e.key)).toEqual(["recipe:1"]);
    expect(await kv.get("missing")).toBeUndefined();
  });

  it("reads file metadata through the sdk core the files tools use", async () => {
    await scaffold(base, { appId: "docs", name: "Docs" });
    const files = createClient({ baseUrl: base, appId: "docs" }).files;
    await files.put("report body", { title: "Q2 Report", contentType: "text/plain" });

    // exactly what lodekit_files_list / lodekit_files_stat call:
    const page = await files.list({ prefix: "q2-" });
    expect(page.entries.map((e) => e.slug)).toEqual(["q2-report"]);
    const stat = await files.stat("q2-report");
    expect(stat!.url).toContain("/api/apps/docs/file-store/q2-report");
    expect(stat!.path.startsWith("/")).toBe(true); // absolute path for agent file tools
    expect(await files.stat("missing")).toBeUndefined();
  });
});
