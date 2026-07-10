import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createHash } from "node:crypto";
import { Hono } from "hono";
import type { Config } from "../src/config.js";
import { initGatewayOauth, resetGatewayOauthForTest, startOauth, handleOauthCallback } from "../src/gatewayOauth.js";
import { initGatewayManifests, resetGatewayManifestsForTest } from "../src/gatewayManifests.js";
import {
  initGatewaysStore, closeGatewaysStoreForTest, setGatewayConfig, loadOauthTokens, saveOauthTokens, oauthState,
} from "../src/gatewaysStore.js";
import { initSecretStore, closeSecretStoreForTest } from "../src/secretsStore.js";
import { applyGatewaysManifest, platformGatewaysRoutes } from "../src/services/gateways.js";
import {
  initGatewayEngine, resetGatewayEngineForTest, executeGatewayRequest, GatewayRequestError,
} from "../src/gatewayEngine.js";
import { initSettingsStore } from "../src/services/settings.js";
import { initLogStore } from "../src/logStore.js";

let root: string, state: string, provider: http.Server, providerPort: number;
let tokenRequests: URLSearchParams[] = [];
let tokenResponse: () => { status: number; body: unknown };

function cfg(): Config {
  return {
    root, appsDir: path.join(root, "apps"), dataDir: path.join(root, "data"),
    cacheDir: path.join(root, "cache"), stateDir: state, port: 0,
    baseUrl: "http://127.0.0.1:7777", secretsKeyProvider: "file",
    gatewaysDir: path.join(root, "gateways"),
  };
}
const APP = "app-a", ALIAS = "oauth_demo";

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-gwoauth-"));
  state = fs.mkdtempSync(path.join(os.tmpdir(), "lk-gwoauth-state-"));
  tokenRequests = [];
  tokenResponse = () => ({
    status: 200,
    body: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600, token_type: "Bearer" },
  });
  provider = http.createServer((req, res) => {
    if (req.url?.startsWith("/token")) {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        tokenRequests.push(new URLSearchParams(raw));
        const r = tokenResponse();
        res.writeHead(r.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(r.body));
      });
      return;
    }
    // the protected API — echoes the bearer it saw
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ auth: req.headers.authorization ?? null }));
  });
  await new Promise<void>((r) => provider.listen(0, "127.0.0.1", r));
  providerPort = (provider.address() as AddressInfo).port;
  const dir = path.join(root, "gateways", "demo");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    name: "Demo",
    base_url: `http://127.0.0.1:${providerPort}`,
    auth: {
      kind: "oauth2",
      authorization_url: `http://127.0.0.1:${providerPort}/authorize`,
      token_url: `http://127.0.0.1:${providerPort}/token`,
      scopes: ["openid", "api"],
      pkce: true,
      client_id_slot: "client_id",
    },
    slots: { client_id: { kind: "config", label: "Client id" } },
  }));
  initLogStore(state);
  initSettingsStore(path.join(root, "data"));
  initSecretStore(cfg());
  initGatewaysStore(cfg());
  initGatewayManifests(cfg());
  initGatewayEngine(cfg());
  initGatewayOauth(cfg());
  applyGatewaysManifest(cfg(), APP, { [ALIAS]: { provider: "demo" } }, Date.now());
});
afterEach(async () => {
  resetGatewayOauthForTest();
  resetGatewayEngineForTest();
  resetGatewayManifestsForTest();
  closeGatewaysStoreForTest();
  closeSecretStoreForTest();
  await new Promise<void>((r) => provider.close(() => r()));
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(state, { recursive: true, force: true });
});

async function reason(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "none";
  } catch (e) {
    if (e instanceof GatewayRequestError) return e.reason;
    throw e;
  }
}

describe("connect flow", () => {
  it("start without a client id is unconfigured; with one it builds a spec-correct authorize URL", () => {
    expect(() => startOauth(APP, ALIAS)).toThrow(GatewayRequestError);
    setGatewayConfig(APP, ALIAS, "client_id", "interactive.public");
    const { authorizeUrl } = startOauth(APP, ALIAS);
    const u = new URL(authorizeUrl);
    expect(u.pathname).toBe("/authorize");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("interactive.public");
    expect(u.searchParams.get("scope")).toBe("openid api");
    expect(u.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:7777/api/gateways/oauth/callback");
    expect(u.searchParams.get("state")).toBeTruthy();
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBeTruthy();
  });

  it("callback exchanges the code with the PKCE verifier and stores tokens encrypted", async () => {
    setGatewayConfig(APP, ALIAS, "client_id", "interactive.public");
    const { authorizeUrl } = startOauth(APP, ALIAS);
    const u = new URL(authorizeUrl);
    const done = await handleOauthCallback({ code: "code-123", state: u.searchParams.get("state")! });
    expect(done).toEqual({ appId: APP, alias: ALIAS });
    const sent = tokenRequests[0];
    expect(sent.get("grant_type")).toBe("authorization_code");
    expect(sent.get("code")).toBe("code-123");
    expect(sent.get("client_id")).toBe("interactive.public");
    const challenge = u.searchParams.get("code_challenge")!;
    const verifier = sent.get("code_verifier")!;
    expect(createHash("sha256").update(verifier).digest("base64url")).toBe(challenge);
    expect(loadOauthTokens(APP, ALIAS)?.accessToken).toBe("at-1");
    expect(oauthState(APP, ALIAS)).toBe("connected");
    // a state can't be replayed
    await expect(handleOauthCallback({ code: "code-123", state: u.searchParams.get("state")! })).rejects.toThrow();
  });

  it("the callback failure page escapes provider-controlled strings", async () => {
    setGatewayConfig(APP, ALIAS, "client_id", "interactive.public");
    const { authorizeUrl } = startOauth(APP, ALIAS);
    const st = new URL(authorizeUrl).searchParams.get("state")!;
    const app = new Hono().route("/api/gateways", platformGatewaysRoutes(cfg()));
    const payload = encodeURIComponent("<img src=x onerror=alert(1)>");
    const res = await app.request(`/api/gateways/oauth/callback?state=${st}&error=${payload}`);
    expect(res.status).toBe(400);
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; style-src 'unsafe-inline'");
    const html = await res.text();
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("token injection + refresh", () => {
  it("injects the stored access token; refreshes transparently when expired; rotates the refresh token", async () => {
    setGatewayConfig(APP, ALIAS, "client_id", "interactive.public");
    saveOauthTokens(APP, ALIAS, { accessToken: "at-old", refreshToken: "rt-old", expiresAt: Date.now() - 1000 });
    tokenResponse = () => ({
      status: 200,
      body: { access_token: "at-new", refresh_token: "rt-new", expires_in: 3600 },
    });
    const env = await executeGatewayRequest(APP, ALIAS, { method: "GET", path: "/api/test" });
    expect(JSON.parse(env.body!).auth).toBe("Bearer at-new");
    expect(tokenRequests[0].get("grant_type")).toBe("refresh_token");
    expect(tokenRequests[0].get("refresh_token")).toBe("rt-old");
    expect(loadOauthTokens(APP, ALIAS)?.refreshToken).toBe("rt-new");
    // a live token skips the refresh
    tokenRequests = [];
    const again = await executeGatewayRequest(APP, ALIAS, { method: "GET", path: "/api/test" });
    expect(JSON.parse(again.body!).auth).toBe("Bearer at-new");
    expect(tokenRequests).toHaveLength(0);
  });

  it("no tokens → unconfigured; a failed refresh → needs_reauth (sticky until reconnect)", async () => {
    setGatewayConfig(APP, ALIAS, "client_id", "interactive.public");
    expect(await reason(executeGatewayRequest(APP, ALIAS, { method: "GET", path: "/api/test" }))).toBe("unconfigured");
    saveOauthTokens(APP, ALIAS, { accessToken: "at", refreshToken: "rt", expiresAt: Date.now() - 1000 });
    tokenResponse = () => ({ status: 400, body: { error: "invalid_grant" } });
    expect(await reason(executeGatewayRequest(APP, ALIAS, { method: "GET", path: "/api/test" }))).toBe("needs_reauth");
    expect(oauthState(APP, ALIAS)).toBe("needs_reauth");
    expect(await reason(executeGatewayRequest(APP, ALIAS, { method: "GET", path: "/api/test" }))).toBe("needs_reauth");
  });

  it("a token endpoint the refresh can't reach → unavailable, not a durable needs_reauth", async () => {
    // Point token_url at a port nothing listens on — the fetch fails with a
    // network error (not a provider-declined response), so this must NOT
    // flip the sticky needs_reauth flag (a mere blip shouldn't force a
    // human reconnect).
    const dead = http.createServer();
    await new Promise<void>((r) => dead.listen(0, "127.0.0.1", r));
    const deadPort = (dead.address() as AddressInfo).port;
    await new Promise<void>((r) => dead.close(() => r()));
    fs.writeFileSync(path.join(root, "gateways", "demo", "manifest.json"), JSON.stringify({
      name: "Demo",
      base_url: `http://127.0.0.1:${providerPort}`,
      auth: {
        kind: "oauth2",
        authorization_url: `http://127.0.0.1:${providerPort}/authorize`,
        token_url: `http://127.0.0.1:${deadPort}/token`,
        scopes: ["openid", "api"],
        pkce: true,
        client_id_slot: "client_id",
      },
      slots: { client_id: { kind: "config", label: "Client id" } },
    }));
    initGatewayManifests(cfg());
    setGatewayConfig(APP, ALIAS, "client_id", "interactive.public");
    saveOauthTokens(APP, ALIAS, { accessToken: "at", refreshToken: "rt", expiresAt: Date.now() - 1000 });
    expect(await reason(executeGatewayRequest(APP, ALIAS, { method: "GET", path: "/api/test" }))).toBe("unavailable");
    expect(oauthState(APP, ALIAS)).toBe("connected");
  });
});
