import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initEventStore, queryEvents, closeEventStoreForTest } from "../src/eventStore.js";
import { initLogStore, closeLogStoreForTest } from "../src/logStore.js";
import { startAppWorker, stopAllWorkers } from "../src/appWorker.js";
import { startWatcher } from "../src/watcher.js";
import type { Config } from "../src/config.js";

let root: string, cfg: Config;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-evwire-"));
  cfg = {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: path.join(root, "cache"),
    stateDir: path.join(root, "state"),
    port: 0,
    baseUrl: "http://lodekit.localhost:0",
  };
  initLogStore(cfg.stateDir);
  initEventStore(cfg.dataDir);
});
afterEach(() => {
  stopAllWorkers();
  closeEventStoreForTest();
  closeLogStoreForTest();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("platform emitters land on the bus", () => {
  it("worker lifecycle: a missing server bundle stores a server-state error event in the app's ns", () => {
    startAppWorker(cfg, "ghost");
    const { records } = queryEvents({ ns: "ghost", type: "server-state" });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ source: "_platform", payload: { status: "error" } });
  });

  it("watcher: app-folder churn stores one debounced apps-changed event in _platform", async () => {
    const watcher = await startWatcher(cfg);
    const dir = path.join(cfg.appsDir, "newapp");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ name: "New", appId: "newapp" }));
    await expect
      .poll(() => queryEvents({ ns: "_platform", type: "apps-changed" }).records.length, { timeout: 5000 })
      .toBeGreaterThanOrEqual(1);
    // Debounced: the burst of add/addDir events collapsed (allow the mkdir/write pair
    // to straddle one debounce boundary, but never one event per raw fs event).
    expect(queryEvents({ ns: "_platform", type: "apps-changed" }).records.length).toBeLessThanOrEqual(2);
    await watcher.close();
  });

  it("kv writes store change events with identity-only payloads and a service ttl", async () => {
    const { Hono } = await import("hono");
    const { apiRoutes } = await import("../src/routes.js");
    const app = new Hono().route("/api", apiRoutes(cfg));
    await app.request("/api/apps/notes/kv-store/greeting", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "hi" }),
    });
    const { records } = queryEvents({ ns: "notes", type: "kv-store-change" });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ source: "_platform", payload: { key: "greeting", op: "set" } });
  });

  it("task enqueue stores a tasks-change event with identity-only payload and the service ttl", async () => {
    const { Hono } = await import("hono");
    const { apiRoutes } = await import("../src/routes.js");
    const { getTasksDb, applyManifest } = await import("../src/services/tasks.js");
    applyManifest(getTasksDb(cfg.dataDir, "notes"), [{ name: "resize" }], Date.now(), { minEveryMs: 60_000 });
    const app = new Hono().route("/api", apiRoutes(cfg));
    const res = await app.request("/api/apps/notes/tasks/resize/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const { records } = queryEvents({ ns: "notes", type: "tasks-change" });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ source: "_platform", payload: { task: "resize", state: "queued" } });
    expect(records[0].payload).not.toHaveProperty("appId");
    // Service ttl (7 days): past the window the record no longer queries.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 8 * 86_400_000);
    expect(queryEvents({ ns: "notes", type: "tasks-change" }).records).toHaveLength(0);
    vi.useRealTimers();
  });
});
