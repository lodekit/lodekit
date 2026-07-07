import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { start } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { scaffold, listApps } from "../../mcp/client.js";
import { createClient } from "@lodekit/sdk";
import { getSettingsDb, applySettingsManifest } from "../src/services/settings.js";

let root: string, server: Server, base: string, dataDir: string;
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-"));
  process.env.LODEKIT_ROOT = root;
  process.env.LODEKIT_PORT = "0";
  process.env.LODEKIT_STATE_DIR = path.join(root, "state");
  const cfg = loadConfig();
  dataDir = cfg.dataDir;
  server = await start(cfg);
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
}, 60000);
afterEach(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.LODEKIT_ROOT;
  delete process.env.LODEKIT_PORT;
  delete process.env.LODEKIT_STATE_DIR;
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

  it("reads app and platform logs through the helper the logs tool uses", async () => {
    await scaffold(base, { appId: "diary", name: "Diary" });
    const { logs } = createClient({ baseUrl: base, appId: "diary" });
    logs.error("render failed", { stack: "TRACE" });
    const { fetchLogs } = await import("../../mcp/client.js");
    await expect
      .poll(async () => (await fetchLogs(base, { appId: "diary", level: "error" })).records, { timeout: 5000 })
      .toHaveLength(1);
    const app = await fetchLogs(base, { appId: "diary" });
    expect(app.records[0]).toMatchObject({ source: "app", message: "render failed" });
    const platform = await fetchLogs(base, { appId: "_platform" });
    expect(platform.records.length).toBeGreaterThan(0); // boot + scaffold activity
  });

  it("reads events through the helper the events tool uses", async () => {
    await scaffold(base, { appId: "pantry", name: "Pantry" });
    const kv = createClient({ baseUrl: base, appId: "pantry" }).kv;
    await kv.set("item:1", { n: "rice" });
    const { fetchEvents } = await import("../../mcp/client.js");
    await expect
      .poll(async () => (await fetchEvents(base, { appId: "pantry", type: "kv-store-change" })).records, { timeout: 5000 })
      .toHaveLength(1);
    // apps-changed only fires once the watcher's fs-change debounce elapses, unlike
    // kv-store-change above (emitted synchronously by the kv route) — poll for it too.
    await expect
      .poll(async () => (await fetchEvents(base, { appId: "_platform", type: "apps-changed" })).records.length, { timeout: 5000 })
      .toBeGreaterThan(0); // the scaffold's registry churn
  });

  it("reads settings through the helper the settings tools use", async () => {
    await scaffold(base, { appId: "notes", name: "Notes" });
    const { fetchSettings } = await import("../../mcp/client.js");
    const platformSettings = await fetchSettings(base);
    expect(platformSettings.settings).toBeDefined();
    expect(platformSettings.settings.some((s: { key: string }) => s.key === "appearance.theme")).toBe(true);
    const appSettings = await fetchSettings(base, "notes");
    expect(appSettings.declared).toBeDefined();
    expect(Array.isArray(appSettings.declared)).toBe(true);
    expect(appSettings.overrides).toBeDefined();
    expect(Array.isArray(appSettings.overrides)).toBe(true);
  });

  it("reads app settings through the sdk core the settings tools use", async () => {
    await scaffold(base, { appId: "settings-test", name: "Settings Test" });
    // Declare settings for the test app
    const db = getSettingsDb(dataDir, "settings-test");
    applySettingsManifest(db, {
      show_archived: { type: "boolean", label: "Show archived", description: "Include archived items.", default: false },
      max_items: { type: "number", label: "Max items", description: "Maximum number of items.", default: 100 },
    }, Date.now());
    const settings = createClient({ baseUrl: base, appId: "settings-test" }).settings;
    // Test found case: declared key with default value
    expect(await settings.get("show_archived")).toBe(false);
    expect(await settings.get("max_items")).toBe(100);
    // Test not-found case: undeclared key
    expect(await settings.get("missing_key")).toBeUndefined();
  });
});
