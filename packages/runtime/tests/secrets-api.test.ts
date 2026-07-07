import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import type { Config } from "../src/config.js";
import { platformSecretsRoutes, appSecretsRoutes, withSecrets, applySecretsManifest } from "../src/services/secret-store.js";
import { initSecretStore, closeSecretStoreForTest } from "../src/secretsStore.js";
import { setWorkerTokenForTest } from "../src/appWorker.js";

let root: string, state: string, app: Hono;
const APP = "app-a";
const TOKEN = "test-worker-token";

function cfg(): Config {
  return {
    root, appsDir: path.join(root, "apps"), dataDir: path.join(root, "data"),
    cacheDir: path.join(root, "cache"), stateDir: state, port: 0,
    baseUrl: "http://localhost:0", secretsKeyProvider: "file",
  };
}
const req = (p: string, init?: RequestInit) => app.request(p, init);
const json = (body: unknown, method = "POST"): RequestInit => ({
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-secapi-"));
  state = fs.mkdtempSync(path.join(os.tmpdir(), "lk-secapi-state-"));
  initSecretStore(cfg());
  applySecretsManifest(cfg(), APP, { api_key: { label: "API key", description: "d" } }, Date.now());
  setWorkerTokenForTest(APP, TOKEN);
  // Built as a separate sub-app and mounted at "/" (rather than `.use`d directly
  // on `app`) so the child router's typed Env doesn't leak into `app`'s own type.
  app = new Hono().route(
    "/",
    new Hono()
      .route("/api/secrets", platformSecretsRoutes)
      .use(`/api/apps/:appId/secrets/*`, withSecrets(cfg()))
      .route("/api/apps/:appId/secrets", appSecretsRoutes)
  );
});
afterEach(() => {
  setWorkerTokenForTest(APP, null);
  closeSecretStoreForTest();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(state, { recursive: true, force: true });
});

async function createK(): Promise<string> {
  const r = await req("/api/secrets", json({ label: "OpenWeather key", description: "wx", value: "s3cr3t" }));
  expect(r.status).toBe(201);
  return (await r.json()).slug;
}

describe("platform catalog", () => {
  it("CRUD round-trips; no payload ever contains a value", async () => {
    const slug = await createK();
    expect(slug).toBe("openweather-key");
    const list = await (await req("/api/secrets")).json();
    expect(JSON.stringify(list)).not.toContain("s3cr3t");
    expect(list.secrets[0].label).toBe("OpenWeather key");
    const upd = await req(`/api/secrets/${slug}`, json({ value: "s3cr3t-2", label: "OW key" }, "PUT"));
    expect(upd.status).toBe(200);
    expect(JSON.stringify(await upd.json())).not.toContain("s3cr3t");
    expect((await req("/api/secrets/ghost", json({ value: "x" }, "PUT"))).status).toBe(404);
    expect((await req(`/api/secrets/${slug}`, { method: "DELETE" })).status).toBe(200);
    expect((await req(`/api/secrets/${slug}`, { method: "DELETE" })).status).toBe(404);
  });

  it("validates create bodies (missing value 400, oversized value 400)", async () => {
    expect((await req("/api/secrets", json({ label: "K" }))).status).toBe(400);
    expect((await req("/api/secrets", json({ label: "K", value: "x".repeat(4097) }))).status).toBe(400);
  });
});

describe("app slots and links", () => {
  it("lists declared slots with link status; link/unlink round-trips", async () => {
    const slug = await createK();
    let doc = await (await req(`/api/apps/${APP}/secrets`)).json();
    expect(doc.slots).toEqual([
      { slot: "api_key", label: "API key", description: "d", error: null, status: "pending", secret: null },
    ]);
    expect((await req(`/api/apps/${APP}/secrets/api_key/link`, json({ slug }, "PUT"))).status).toBe(200);
    doc = await (await req(`/api/apps/${APP}/secrets`)).json();
    expect(doc.slots[0].status).toBe("linked");
    expect(doc.slots[0].secret).toEqual({ slug, label: "OpenWeather key" });
    expect((await req(`/api/apps/${APP}/secrets/api_key/link`, { method: "DELETE" })).status).toBe(200);
    doc = await (await req(`/api/apps/${APP}/secrets`)).json();
    expect(doc.slots[0].status).toBe("pending");
  });

  it("404s: undeclared slot link, unknown slug link, invalid app id 400", async () => {
    const slug = await createK();
    expect((await req(`/api/apps/${APP}/secrets/ghost_slot/link`, json({ slug }, "PUT"))).status).toBe(404);
    expect((await req(`/api/apps/${APP}/secrets/api_key/link`, json({ slug: "ghost" }, "PUT"))).status).toBe(404);
    expect((await req(`/api/apps/NOT!VALID/secrets`)).status).toBe(400);
  });
});

describe("the value door", () => {
  it("401 without/with a wrong token; 200 with the right one; 409 unlinked; 404 unknown slot", async () => {
    const slug = await createK();
    const value = (t?: string) =>
      req(`/api/apps/${APP}/secrets/api_key/value`, { headers: t ? { "x-lodekit-worker-token": t } : {} });
    expect((await value()).status).toBe(401);
    expect((await value("wrong")).status).toBe(401);
    expect((await value(TOKEN)).status).toBe(409); // declared but unlinked
    await req(`/api/apps/${APP}/secrets/api_key/link`, json({ slug }, "PUT"));
    const ok = await value(TOKEN);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ value: "s3cr3t" });
    const missing = await req(`/api/apps/${APP}/secrets/ghost_slot/value`, { headers: { "x-lodekit-worker-token": TOKEN } });
    expect(missing.status).toBe(404);
  });

  it("503 when the store is degraded", async () => {
    closeSecretStoreForTest();
    const r = await req(`/api/apps/${APP}/secrets/api_key/value`, { headers: { "x-lodekit-worker-token": TOKEN } });
    expect(r.status).toBe(503);
  });
});
