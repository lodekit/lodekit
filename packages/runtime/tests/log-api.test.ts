import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { apiRoutes } from "../src/routes.js";
import { initLogStore, closeLogStoreForTest } from "../src/logStore.js";
import { emitLog } from "../src/logger.js";
import type { Config } from "../src/config.js";

let root: string, app: Hono;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-logapi-"));
  const cfg: Config = {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: path.join(root, "cache"),
    stateDir: path.join(root, "state"),
    port: 0,
    baseUrl: "http://lodekit.localhost:0", secretsKeyProvider: "file",
  };
  initLogStore(cfg.stateDir);
  app = new Hono().route("/api", apiRoutes(cfg));
});
afterEach(() => {
  closeLogStoreForTest();
  fs.rmSync(root, { recursive: true, force: true });
});

const post = (appId: string, body: unknown) =>
  app.request(`/api/apps/${appId}/log-store`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("log-store service", () => {
  it("writes and reads back app-scoped records", async () => {
    expect((await post("notes", { level: "warn", message: "low disk", fields: { free: 12 } })).status).toBe(201);
    expect((await post("other", { level: "info", message: "unrelated" })).status).toBe(201);
    const res = await app.request("/api/apps/notes/log-store");
    const body = await res.json();
    expect(body.records).toHaveLength(1);
    expect(body.records[0]).toMatchObject({ level: "warn", appId: "notes", message: "low disk", fields: { free: 12 } });
  });

  it("validates level, message, and app id", async () => {
    expect((await post("notes", { level: "fatal", message: "x" })).status).toBe(400);
    expect((await post("notes", { level: "info" })).status).toBe(400);
    expect((await post("Not-Valid!", { level: "info", message: "x" })).status).toBe(400);
  });

  it("an app named 'platform' is a normal app under the internal-namespace convention", async () => {
    expect((await post("platform", { level: "info", message: "mine" })).status).toBe(201);
    const own = await (await app.request("/api/logs?app=platform")).json();
    expect(own.records.map((r: { message: string }) => r.message)).toEqual(["mine"]);
  });

  it("app-scoped GET honors level/limit and never leaks other apps", async () => {
    await post("notes", { level: "debug", message: "d" });
    await post("notes", { level: "error", message: "e" });
    const res = await app.request("/api/apps/notes/log-store?level=error");
    expect((await res.json()).records.map((r: { message: string }) => r.message)).toEqual(["e"]);
  });
});

describe("GET /api/logs (global)", () => {
  it("returns everything, filters by app and platform", async () => {
    emitLog("info", "watcher", "platform event");
    await post("notes", { level: "info", message: "app event" });
    const all = await (await app.request("/api/logs")).json();
    expect(all.records).toHaveLength(2);
    const plat = await (await app.request("/api/logs?app=_platform")).json();
    expect(plat.records.map((r: { source: string }) => r.source)).toEqual(["watcher"]);
    const notes = await (await app.request("/api/logs?app=notes")).json();
    expect(notes.records.map((r: { message: string }) => r.message)).toEqual(["app event"]);
  });

  it("rejects a malformed level", async () => {
    expect((await app.request("/api/logs?level=loud")).status).toBe(400);
  });
});
