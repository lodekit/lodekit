import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { apiRoutes } from "../src/routes.js";
import { initEventStore, closeEventStoreForTest } from "../src/eventStore.js";
import { emitEvent } from "../src/events.js";
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
    baseUrl: "http://lodekit.localhost:0", secretsKeyProvider: "file",
    gatewaysDir: path.join(root, "gateways"),
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
  it("emits with app = component = appId, kind app, and returns the stored envelope", async () => {
    const res = await post("notes", { type: "note-added", payload: { id: 7 } });
    expect(res.status).toBe(201);
    const rec = await res.json();
    expect(rec).toMatchObject({ app: "notes", kind: "app", component: "notes", type: "note-added", payload: { id: 7 } });
  });

  it("scoped GET lists the app's stream (incl. platform-emitted), never a sibling's", async () => {
    await post("notes", { type: "note-added" });
    emitEvent({ app: "notes", kind: "engine", component: "build", type: "build-ready" });
    emitEvent({ app: "other", kind: "service", component: "kv-store", type: "key-set", payload: { key: "k" } });
    const mine = await (await app.request("/api/apps/notes/event-store")).json();
    expect(mine.records.map((r: { type: string }) => r.type)).toEqual(["build-ready", "note-added"]);
  });

  it("validates type grammar, payload size, ttl, and app id", async () => {
    expect((await post("notes", { type: "No Caps" })).status).toBe(400);
    expect((await post("notes", {})).status).toBe(400);
    expect((await post("notes", { type: "big", payload: { blob: "x".repeat(9000) } })).status).toBe(400);
    expect((await post("notes", { type: "t", ttl: -5 })).status).toBe(400);
    expect((await post("_dashboard", { type: "t" })).status).toBe(400); // internal app id: not scaffoldable, still not an app POST target
    expect((await post("Bad!", { type: "t" })).status).toBe(400);
  });

  it("supports component, since/until, and after (ascending replay) on the scoped GET", async () => {
    await post("notes", { type: "a" });
    emitEvent({ app: "notes", kind: "service", component: "kv-store", type: "key-set", payload: { key: "k" } });
    const byComponent = await (await app.request("/api/apps/notes/event-store?component=kv-store")).json();
    expect(byComponent.records.map((r: { type: string }) => r.type)).toEqual(["key-set"]);
    const all = await (await app.request("/api/apps/notes/event-store?after=0")).json();
    expect(all.records.map((r: { type: string }) => r.type)).toEqual(["a", "key-set"]);
    const none = await (await app.request("/api/apps/notes/event-store?until=1")).json();
    expect(none.records).toHaveLength(0);
  });
});

describe("GET /api/events/history (global)", () => {
  it("returns everything; filters by app, kind, and component", async () => {
    await post("notes", { type: "note-added" });
    emitEvent({ app: null, kind: "engine", component: "registry", type: "apps-changed" });
    const all = await (await app.request("/api/events/history")).json();
    expect(all.records).toHaveLength(2);
    const engine = await (await app.request("/api/events/history?kind=engine")).json();
    expect(engine.records.map((r: { type: string }) => r.type)).toEqual(["apps-changed"]);
    const mine = await (await app.request("/api/events/history?app=notes")).json();
    expect(mine.records.map((r: { type: string }) => r.type)).toEqual(["note-added"]);
  });

  it("rejects a malformed app, an unknown kind, a malformed cursor, and the removed ns param shape", async () => {
    expect((await app.request("/api/events/history?app=Bad!")).status).toBe(400);
    expect((await app.request("/api/events/history?kind=robot")).status).toBe(400);
    expect((await app.request("/api/events/history?after=abc")).status).toBe(400);
    emitEvent({ app: "other", kind: "service", component: "kv-store", type: "key-set", payload: { key: "k" } });
    const nsIgnored = await (await app.request("/api/events/history?ns=notes")).json();
    expect(nsIgnored.records.length).toBeGreaterThan(0); // ns is not a filter anymore — unknown params are ignored, not aliased
  });
});

describe("GET /api/events/stats", () => {
  it("aggregates under filters with complete facet maps", async () => {
    emitEvent({ app: "notes", kind: "service", component: "kv-store", type: "key-set", payload: { key: "k" } });
    emitEvent({ app: "notes", kind: "app", component: "notes", type: "note-added" });
    emitEvent({ app: "other", kind: "service", component: "kv-store", type: "key-deleted" });
    emitEvent({ app: null, kind: "engine", component: "registry", type: "apps-changed" });

    const all = await (await app.request("/api/events/stats?bucket=60000")).json();
    expect(all.total).toBe(4);
    expect(all.byKind).toEqual({ service: 2, app: 1, engine: 1 });
    expect(all.byApp).toEqual({ notes: 2, other: 1, "": 1 });
    expect(all.buckets.reduce((s: number, b: { n: number }) => s + b.n, 0)).toBe(4);

    const filtered = await (await app.request("/api/events/stats?bucket=60000&kind=service&component=kv-store")).json();
    expect(filtered.total).toBe(2);
    expect(filtered.byType).toEqual({ "key-set": 1, "key-deleted": 1 });
  });

  it("rejects a missing or non-positive bucket", async () => {
    expect((await app.request("/api/events/stats")).status).toBe(400);
    expect((await app.request("/api/events/stats?bucket=0")).status).toBe(400);
    expect((await app.request("/api/events/stats?bucket=-5")).status).toBe(400);
  });

  it("rejects invalid app and kind like the history route", async () => {
    expect((await app.request("/api/events/stats?bucket=60000&app=Bad_Id!")).status).toBe(400);
    expect((await app.request("/api/events/stats?bucket=60000&kind=platform")).status).toBe(400);
  });
});
