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
    baseUrl: "http://lodekit.localhost:0", secretsKeyProvider: "file",
    gatewaysDir: path.join(root, "gateways"),
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
  it("worker lifecycle: a missing server bundle lands server-failed in the app's stream", () => {
    startAppWorker(cfg, "ghost");
    const { records } = queryEvents({ app: "ghost", type: "server-failed" });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: "engine", component: "lifecycle", payload: { message: "server bundle missing (not built)" } });
  });

  // Real chokidar on macOS: the OS event stream goes live some time AFTER ready under
  // load, and changes in the gap are dropped outright — including the addDir for a new
  // app folder, which leaves that folder permanently unwatched (watcher.test.ts works
  // around the same gap). So first re-touch a top-level probe file — appsDir itself is
  // watched from startup — until an event proves the stream is live, and only then
  // assert on real churn.
  it("watcher: app-folder churn stores one debounced apps-changed event in _platform", async () => {
    const watcher = await startWatcher(cfg);
    const count = () => queryEvents({ kind: "engine", type: "apps-changed" }).records.length;
    const probe = path.join(cfg.appsDir, "probe.txt"); // invalid app id — fires apps-changed, never a build
    let tick = 0;
    await expect
      .poll(() => {
        fs.writeFileSync(probe, `live?${tick++}`);
        return count();
      }, { interval: 500, timeout: 15_000 })
      .toBeGreaterThanOrEqual(1);
    expect(queryEvents({ type: "apps-changed" }).records[0]).toMatchObject({ app: null, component: "registry" });
    // App-folder churn lands on the bus: with the stream live, the newapp addDir is
    // delivered even if the writes inside race chokidar's watch of the new folder.
    await new Promise((r) => setTimeout(r, 1000)); // drain the last priming write's debounce
    const beforeChurn = count();
    const dir = path.join(cfg.appsDir, "newapp");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ name: "New", appId: "newapp" }));
    await expect.poll(count, { timeout: 15_000 }).toBeGreaterThan(beforeChurn);
    // Debounced: a tight burst on the (definitely watched) probe collapses — allow one
    // debounce-boundary straddle, but never one event per raw fs event.
    await new Promise((r) => setTimeout(r, 1000)); // drain the churn's debounce
    const beforeBurst = count();
    for (let i = 0; i < 5; i++) fs.writeFileSync(probe, `burst${i}`);
    await expect.poll(count, { timeout: 15_000 }).toBeGreaterThan(beforeBurst);
    await new Promise((r) => setTimeout(r, 600)); // a straddled second window gets to fire
    expect(count() - beforeBurst).toBeLessThanOrEqual(2);
    await watcher.close();
  }, 60_000);

  it("kv writes land key-set facts with identity-only payloads and the service ttl", async () => {
    const { Hono } = await import("hono");
    const { apiRoutes } = await import("../src/routes.js");
    const app = new Hono().route("/api", apiRoutes(cfg));
    await app.request("/api/apps/notes/kv-store/greeting", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "hi" }),
    });
    const { records } = queryEvents({ app: "notes", type: "key-set" });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: "service", component: "kv-store", payload: { key: "greeting" } });
    expect(records[0].payload).not.toHaveProperty("op");
  });

  it("task enqueue lands run-queued with identity-only payload and the service ttl", async () => {
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
    const { records } = queryEvents({ app: "notes", type: "run-queued" });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: "service", component: "tasks", payload: { task: "resize" } });
    expect(records[0].payload).toHaveProperty("runId");
    expect(records[0].payload).not.toHaveProperty("state");
    // Service ttl (7 days): past the window the record no longer queries.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 8 * 86_400_000);
    expect(queryEvents({ app: "notes", type: "run-queued" }).records).toHaveLength(0);
    vi.useRealTimers();
  });

  it("gateway slot link lands connection-linked with names-only payload and the service ttl", async () => {
    const { emitGatewayEvent } = await import("../src/gatewayEvents.js");
    emitGatewayEvent("notes", "connection-linked", { alias: "mail", slot: "api-key" });
    emitGatewayEvent(null, "breaker-opened", { provider: "google" });
    const linked = queryEvents({ app: "notes", type: "connection-linked" });
    expect(linked.records).toHaveLength(1);
    expect(linked.records[0]).toMatchObject({ kind: "service", component: "gateways", payload: { alias: "mail", slot: "api-key" } });
    const breaker = queryEvents({ kind: "service", type: "breaker-opened" });
    expect(breaker.records[0]).toMatchObject({ app: null, component: "gateways", payload: { provider: "google" } });
  });
});
