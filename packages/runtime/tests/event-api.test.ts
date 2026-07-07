import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { apiRoutes } from "../src/routes.js";
import { initEventStore, closeEventStoreForTest } from "../src/eventStore.js";
import { emitEvent, PLATFORM_NS } from "../src/events.js";
import type { Config } from "../src/config.js";

let root: string, app: Hono;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-eventapi-"));
  const cfg: Config = {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: path.join(root, "cache"),
    stateDir: path.join(root, "state"),
    port: 0,
    baseUrl: "http://lodekit.localhost:0",
  };
  initEventStore(cfg.dataDir);
  app = new Hono().route("/api", apiRoutes(cfg));
});
afterEach(() => {
  closeEventStoreForTest();
  fs.rmSync(root, { recursive: true, force: true });
});

const post = (appId: string, body: unknown) =>
  app.request(`/api/apps/${appId}/event-store`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("event-store service", () => {
  it("emits with ns = source = appId and returns the stored envelope", async () => {
    const res = await post("notes", { type: "export-ready", payload: { slug: "expenses-2026-07" } });
    expect(res.status).toBe(201);
    const rec = await res.json();
    expect(rec).toMatchObject({ ns: "notes", source: "notes", type: "export-ready", payload: { slug: "expenses-2026-07" } });
    expect(rec.id).toBeGreaterThan(0);
  });

  it("scoped GET lists the app's stream (incl. _platform-sourced), never a sibling's", async () => {
    await post("notes", { type: "note-added" });
    emitEvent({ ns: "notes", source: PLATFORM_NS, type: "build-state", payload: { status: "ready" } });
    await post("other", { type: "unrelated" });
    const body = await (await app.request("/api/apps/notes/event-store")).json();
    expect(body.records.map((r: { type: string }) => r.type)).toEqual(["build-state", "note-added"]);
  });

  it("validates type grammar, payload size, ttl, and app id", async () => {
    expect((await post("notes", { type: "No Caps" })).status).toBe(400);
    expect((await post("notes", {})).status).toBe(400);
    expect((await post("notes", { type: "big", payload: { blob: "x".repeat(9000) } })).status).toBe(400);
    expect((await post("notes", { type: "t", ttl: -5 })).status).toBe(400);
    expect((await post("_platform", { type: "t" })).status).toBe(400); // internal ns: not an app id
    expect((await post("Bad!", { type: "t" })).status).toBe(400);
  });

  it("supports after (ascending replay) and type filter on the scoped GET", async () => {
    const first = await (await post("notes", { type: "a" })).json();
    await post("notes", { type: "b" });
    const replay = await (await app.request(`/api/apps/notes/event-store?after=${first.id}`)).json();
    expect(replay.records.map((r: { type: string }) => r.type)).toEqual(["b"]);
    const filtered = await (await app.request("/api/apps/notes/event-store?type=a")).json();
    expect(filtered.records).toHaveLength(1);
  });
});

describe("GET /api/events/history (global)", () => {
  it("returns everything, filters by ns including internal namespaces", async () => {
    await post("notes", { type: "note-added" });
    emitEvent({ ns: PLATFORM_NS, source: PLATFORM_NS, type: "apps-changed" });
    const all = await (await app.request("/api/events/history")).json();
    expect(all.records).toHaveLength(2);
    const plat = await (await app.request("/api/events/history?ns=_platform")).json();
    expect(plat.records.map((r: { type: string }) => r.type)).toEqual(["apps-changed"]);
  });

  it("rejects a malformed ns and a malformed cursor", async () => {
    expect((await app.request("/api/events/history?ns=Bad!")).status).toBe(400);
    expect((await app.request("/api/events/history?after=abc")).status).toBe(400);
  });
});
