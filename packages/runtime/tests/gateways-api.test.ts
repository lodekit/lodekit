import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { Hono } from "hono";
import type { Config } from "../src/config.js";
import { platformGatewaysRoutes, appGatewaysRoutes, withGateways, applyGatewaysManifest } from "../src/services/gateways.js";
import { initGatewayManifests, resetGatewayManifestsForTest } from "../src/gatewayManifests.js";
import { initGatewaysStore, closeGatewaysStoreForTest } from "../src/gatewaysStore.js";
import { initSecretStore, closeSecretStoreForTest, createSecret } from "../src/secretsStore.js";
import { initGatewayEngine, resetGatewayEngineForTest } from "../src/gatewayEngine.js";
import { initSettingsStore } from "../src/services/settings.js";
import { initLogStore } from "../src/logStore.js";
import { setWorkerTokenForTest } from "../src/appWorker.js";

let root: string, state: string, app: Hono, stub: http.Server, stubPort: number;
const APP = "app-a";
const TOKEN = "test-worker-token";

function cfg(): Config {
  return {
    root, appsDir: path.join(root, "apps"), dataDir: path.join(root, "data"),
    cacheDir: path.join(root, "cache"), stateDir: state, port: 0,
    baseUrl: "http://localhost:0", secretsKeyProvider: "file",
    gatewaysDir: path.join(root, "gateways"),
  };
}
const req = (p: string, init?: RequestInit) => app.request(p, init);
const json = (body: unknown, method = "POST"): RequestInit => ({
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-gwapi-"));
  state = fs.mkdtempSync(path.join(os.tmpdir(), "lk-gwapi-state-"));
  stub = http.createServer((rq, rs) => {
    rs.writeHead(200, { "Content-Type": "application/json" });
    rs.end(JSON.stringify({ url: rq.url }));
  });
  await new Promise<void>((r) => stub.listen(0, "127.0.0.1", r));
  stubPort = (stub.address() as AddressInfo).port;
  const dir = path.join(root, "gateways", "stub");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    name: "Stub", website: "https://stub.example",
    base_url: `http://127.0.0.1:${stubPort}`,
    auth: { kind: "api_key", in: "query", param: "key", slot: "api_key" },
    slots: {
      api_key: { kind: "secret", label: "API key" },
      region: { kind: "config", label: "Region", optional: true },
    },
  }));
  fs.writeFileSync(path.join(dir, "favicon.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
  // The apps tree needs the app folder so the platform list can count usage.
  fs.mkdirSync(path.join(root, "apps", APP), { recursive: true });
  fs.writeFileSync(path.join(root, "apps", APP, "manifest.json"), JSON.stringify({ appId: APP, name: "App A" }));
  initLogStore(state);
  initSettingsStore(path.join(root, "data"));
  initSecretStore(cfg());
  initGatewaysStore(cfg());
  initGatewayManifests(cfg());
  initGatewayEngine(cfg());
  applyGatewaysManifest(cfg(), APP, { weather: { provider: "stub", description: "d" } }, Date.now());
  setWorkerTokenForTest(APP, TOKEN);
  // Built as a separate sub-app and mounted at "/" (rather than `.use`d directly
  // on `app`) so the child router's typed Env doesn't leak into `app`'s own type
  // (same pattern as secrets-api.test.ts).
  app = new Hono().route(
    "/",
    new Hono()
      .route("/api/gateways", platformGatewaysRoutes(cfg()))
      .use("/api/apps/:appId/gateways/*", withGateways(cfg()))
      .route("/api/apps/:appId/gateways", appGatewaysRoutes)
  );
});
afterEach(async () => {
  setWorkerTokenForTest(APP, null);
  resetGatewayEngineForTest();
  resetGatewayManifestsForTest();
  closeGatewaysStoreForTest();
  closeSecretStoreForTest();
  await new Promise<void>((r) => stub.close(() => r()));
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(state, { recursive: true, force: true });
});

describe("platform surface", () => {
  it("lists gateways with usage counts and serves the favicon", async () => {
    const list = await (await req("/api/gateways")).json();
    expect(list.gateways).toHaveLength(1);
    expect(list.gateways[0].providerId).toBe("stub");
    expect(list.gateways[0].name).toBe("Stub");
    expect(list.gateways[0].hasFavicon).toBe(true);
    expect(list.gateways[0].apps).toEqual([{ appId: APP, alias: "weather" }]);
    const fav = await req("/api/gateways/stub/favicon");
    expect(fav.status).toBe(200);
    expect(fav.headers.get("content-type")).toContain("svg");
    expect((await req("/api/gateways/ghost/favicon")).status).toBe(404);
    expect((await req("/api/gateways/ghost")).status).toBe(404);
  });

  it("detail includes slot defs and per-app connection docs", async () => {
    const detail = await (await req("/api/gateways/stub")).json();
    expect(detail.gateway.providerId).toBe("stub");
    expect(detail.slots.map((s: { slot: string }) => s.slot).sort()).toEqual(["api_key", "region"]);
    expect(detail.connections).toHaveLength(1);
    expect(detail.connections[0].appId).toBe(APP);
    expect(detail.connections[0].alias).toBe("weather");
    expect(detail.connections[0].status).toBe("needs_setup");
  });
});

describe("app connections", () => {
  it("GET reflects slot state; link/set/clear round-trips and flips status", async () => {
    createSecret({ label: "Stub key", value: "sk-1" });
    let doc = await (await req(`/api/apps/${APP}/gateways`)).json();
    expect(doc.connections[0].status).toBe("needs_setup");
    expect(doc.connections[0].slots.find((s: { slot: string }) => s.slot === "api_key").status).toBe("pending");

    expect((await req(`/api/apps/${APP}/gateways/weather/slots/api_key/link`, json({ slug: "stub-key" }, "PUT"))).status).toBe(200);
    expect((await req(`/api/apps/${APP}/gateways/weather/slots/region/value`, json({ value: "eu" }, "PUT"))).status).toBe(200);
    doc = await (await req(`/api/apps/${APP}/gateways`)).json();
    const slots = doc.connections[0].slots;
    expect(slots.find((s: { slot: string }) => s.slot === "api_key")).toMatchObject({ status: "linked", secret: { slug: "stub-key", label: "Stub key" } });
    expect(slots.find((s: { slot: string }) => s.slot === "region")).toMatchObject({ status: "set", value: "eu" });
    expect(doc.connections[0].status).toBe("connected");

    expect((await req(`/api/apps/${APP}/gateways/weather/slots/api_key/link`, { method: "DELETE" })).status).toBe(200);
    doc = await (await req(`/api/apps/${APP}/gateways`)).json();
    expect(doc.connections[0].status).toBe("needs_setup");
  });

  it("kind mismatches and unknowns are typed: config slot can't be linked, unknown alias/slot 404", async () => {
    createSecret({ label: "K", value: "v" });
    expect((await req(`/api/apps/${APP}/gateways/weather/slots/region/link`, json({ slug: "k" }, "PUT"))).status).toBe(400);
    expect((await req(`/api/apps/${APP}/gateways/weather/slots/api_key/value`, json({ value: "x" }, "PUT"))).status).toBe(400);
    expect((await req(`/api/apps/${APP}/gateways/ghost/slots/api_key/link`, json({ slug: "k" }, "PUT"))).status).toBe(404);
    expect((await req(`/api/apps/${APP}/gateways/weather/slots/ghost/link`, json({ slug: "k" }, "PUT"))).status).toBe(404);
    expect((await req(`/api/apps/NOT!VALID/gateways`)).status).toBe(400);
  });
});

describe("the request door", () => {
  it("401 without/with a wrong token; typed reason bodies; envelope with the right token", async () => {
    createSecret({ label: "Stub key", value: "sk-1" });
    const call = (t?: string) =>
      req(`/api/apps/${APP}/gateways/weather/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(t ? { "x-lodekit-worker-token": t } : {}) },
        body: JSON.stringify({ method: "GET", path: "/hello" }),
      });
    expect((await call()).status).toBe(401);
    expect((await call("wrong")).status).toBe(401);
    const unconfigured = await call(TOKEN);
    expect(unconfigured.status).toBe(409);
    expect((await unconfigured.json()).reason).toBe("unconfigured");
    await req(`/api/apps/${APP}/gateways/weather/slots/api_key/link`, json({ slug: "stub-key" }, "PUT"));
    const ok = await call(TOKEN);
    expect(ok.status).toBe(200);
    const env = await ok.json();
    expect(env.status).toBe(200);
    expect(JSON.parse(env.body).url).toContain("key=sk-1");
    // absolute URLs / bad descriptors are rejected at the boundary
    const abs = await req(`/api/apps/${APP}/gateways/weather/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-lodekit-worker-token": TOKEN },
      body: JSON.stringify({ method: "GET", path: "https://evil.example/x" }),
    });
    expect(abs.status).toBe(400);
  });
});
