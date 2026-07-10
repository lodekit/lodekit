import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Config } from "../src/config.js";
import {
  initGatewayEngine, resetGatewayEngineForTest, setGatewayTuningForTest,
  executeGatewayRequest, getConnectionHealth, GatewayRequestError,
} from "../src/gatewayEngine.js";
import { initGatewayManifests, resetGatewayManifestsForTest } from "../src/gatewayManifests.js";
import { initGatewaysStore, closeGatewaysStoreForTest, setGatewayLink, setGatewayConfig } from "../src/gatewaysStore.js";
import { initSecretStore, closeSecretStoreForTest, createSecret } from "../src/secretsStore.js";
import { applyGatewaysManifest } from "../src/services/gateways.js";
import { initSettingsStore } from "../src/services/settings.js";
import { initLogStore, queryLogs } from "../src/logStore.js";

let root: string, state: string, stub: http.Server, stubPort: number;
let mode: "echo" | "fail500" | "slow" | "big" | "unauthorized" | "retry-after" | "redirect" | "drip";
let hits: { url: string; auth: string | null }[] = [];

function cfg(): Config {
  return {
    root, appsDir: path.join(root, "apps"), dataDir: path.join(root, "data"),
    cacheDir: path.join(root, "cache"), stateDir: state, port: 0,
    baseUrl: "http://localhost:0", secretsKeyProvider: "file",
    gatewaysDir: path.join(root, "gateways"),
  };
}
const APP = "app-a";

function writeManifest(id: string, manifest: unknown) {
  const dir = path.join(root, "gateways", id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
}

function stubManifest(auth: unknown, slots: Record<string, unknown>, basePath = "") {
  return {
    name: "Stub", base_url: `http://127.0.0.1:${stubPort}${basePath}`,
    auth, slots,
  };
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-gweng-"));
  state = fs.mkdtempSync(path.join(os.tmpdir(), "lk-gweng-state-"));
  mode = "echo";
  hits = [];
  stub = http.createServer((req, res) => {
    hits.push({ url: req.url ?? "", auth: req.headers.authorization ?? null });
    if (mode === "fail500") { res.writeHead(500); res.end("boom"); return; }
    if (mode === "unauthorized") { res.writeHead(401); res.end("{}"); return; }
    if (mode === "retry-after") { res.writeHead(429, { "Retry-After": "2" }); res.end("{}"); return; }
    if (mode === "slow") { setTimeout(() => { res.writeHead(200); res.end("{}"); }, 300); return; }
    if (mode === "big") { res.writeHead(200); res.end("x".repeat(5000)); return; }
    if (mode === "redirect") {
      const qs = req.url?.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      res.writeHead(302, { Location: `/next${qs}` });
      res.end();
      return;
    }
    if (mode === "drip") { res.writeHead(200, { "Content-Type": "text/plain" }); res.write("chunk"); return; }
    res.writeHead(200, { "Content-Type": "application/json", "Set-Cookie": "session=nope" });
    res.end(JSON.stringify({ url: req.url, auth: req.headers.authorization ?? null }));
  });
  await new Promise<void>((r) => stub.listen(0, "127.0.0.1", r));
  stubPort = (stub.address() as AddressInfo).port;
  initLogStore(state);
  initSettingsStore(path.join(root, "data"));
  initSecretStore(cfg());
  initGatewaysStore(cfg());
  initGatewayEngine(cfg());
});
afterEach(async () => {
  setGatewayTuningForTest(null);
  resetGatewayEngineForTest();
  resetGatewayManifestsForTest();
  closeGatewaysStoreForTest();
  closeSecretStoreForTest();
  await new Promise<void>((r) => stub.close(() => r()));
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(state, { recursive: true, force: true });
});

function declare(provider: string, alias = "probe") {
  applyGatewaysManifest(cfg(), APP, { [alias]: { provider } }, Date.now());
}

async function reason(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "none";
  } catch (e) {
    if (e instanceof GatewayRequestError) return e.reason;
    throw e;
  }
}

describe("auth injection + egress", () => {
  it("injects an api_key query param host-side and returns the envelope", async () => {
    writeManifest("stub", stubManifest(
      { kind: "api_key", in: "query", param: "key", slot: "api_key" },
      { api_key: { kind: "secret", label: "Key" } }
    ));
    initGatewayManifests(cfg());
    declare("stub");
    createSecret({ label: "Stub key", value: "sk-12345" });
    setGatewayLink(APP, "probe", "api_key", "stub-key");
    const env = await executeGatewayRequest(APP, "probe", { method: "GET", path: "/hello", query: { name: "greenhouse" } });
    expect(env.status).toBe(200);
    const data = JSON.parse(env.body!);
    expect(data.url).toContain("key=sk-12345");
    expect(data.url).toContain("name=greenhouse");
    expect(env.headers["set-cookie"]).toBeUndefined(); // stripped from envelopes
  });

  it("injects bearer and basic; a recipe-owned header in the descriptor is rejected", async () => {
    writeManifest("stub", stubManifest({ kind: "bearer", slot: "token" }, { token: { kind: "secret", label: "Token" } }));
    initGatewayManifests(cfg());
    declare("stub");
    createSecret({ label: "Tok", value: "tk-9" });
    setGatewayLink(APP, "probe", "token", "tok");
    const env = await executeGatewayRequest(APP, "probe", { method: "GET", path: "/x" });
    expect(JSON.parse(env.body!).auth).toBe("Bearer tk-9");
    await expect(
      executeGatewayRequest(APP, "probe", { method: "GET", path: "/x", headers: { Authorization: "Bearer mine" } })
    ).rejects.toThrow(/owns the/i);
  });

  it("a caller-supplied authorization header is rejected even when the gateway's auth is none", async () => {
    writeManifest("stub", stubManifest({ kind: "none" }, {}));
    initGatewayManifests(cfg());
    declare("stub");
    await expect(
      executeGatewayRequest(APP, "probe", { method: "GET", path: "/x", headers: { authorization: "Bearer mine" } })
    ).rejects.toThrow(/owns the authorization/);
  });

  it("a redirect Location echoing the query string masks the injected key in the envelope", async () => {
    writeManifest("stub", stubManifest(
      { kind: "api_key", in: "query", param: "key", slot: "api_key" },
      { api_key: { kind: "secret", label: "Key" } }
    ));
    initGatewayManifests(cfg());
    declare("stub");
    createSecret({ label: "Stub key", value: "sk-leak-me" });
    setGatewayLink(APP, "probe", "api_key", "stub-key");
    mode = "redirect";
    const env = await executeGatewayRequest(APP, "probe", { method: "GET", path: "/hello" });
    expect(env.status).toBe(302);
    expect(env.headers["location"]).toContain("•••");
    expect(env.headers["location"]).not.toContain("sk-leak-me");
  });

  it("base_url from a config slot works; unset config slot → unconfigured", async () => {
    writeManifest("stub", {
      name: "HA", base_url: { from_slot: "base_url" },
      auth: { kind: "none" },
      slots: { base_url: { kind: "config", label: "Base URL" } },
    });
    initGatewayManifests(cfg());
    declare("stub");
    expect(await reason(executeGatewayRequest(APP, "probe", { method: "GET", path: "/x" }))).toBe("unconfigured");
    setGatewayConfig(APP, "probe", "base_url", `http://127.0.0.1:${stubPort}`);
    expect((await executeGatewayRequest(APP, "probe", { method: "GET", path: "/x" })).status).toBe(200);
  });

  it("path traversal past the base path is rejected; missing link → unconfigured", async () => {
    writeManifest("stub", stubManifest({ kind: "none" }, {}, "/api"));
    initGatewayManifests(cfg());
    declare("stub");
    await expect(executeGatewayRequest(APP, "probe", { method: "GET", path: "/../admin" })).rejects.toThrow(/escapes/);
    writeManifest("locked", stubManifest({ kind: "bearer", slot: "token" }, { token: { kind: "secret", label: "T" } }));
    initGatewayManifests(cfg());
    declare("locked", "locked");
    expect(await reason(executeGatewayRequest(APP, "locked", { method: "GET", path: "/x" }))).toBe("unconfigured");
  });
});

describe("guards", () => {
  it("rate_limited when the bucket can't refill within the timeout", async () => {
    writeManifest("stub", { ...stubManifest({ kind: "none" }, {}), limits: { rate: "1/hour" } });
    initGatewayManifests(cfg());
    declare("stub");
    expect((await executeGatewayRequest(APP, "probe", { method: "GET", path: "/x" })).status).toBe(200);
    expect(await reason(executeGatewayRequest(APP, "probe", { method: "GET", path: "/x", timeoutMs: 120 }))).toBe("rate_limited");
  });

  it("a provider 429 with Retry-After pauses the bucket", async () => {
    writeManifest("stub", stubManifest({ kind: "none" }, {}));
    initGatewayManifests(cfg());
    declare("stub");
    mode = "retry-after";
    const env = await executeGatewayRequest(APP, "probe", { method: "GET", path: "/x" });
    expect(env.status).toBe(429); // the provider's response still comes back
    mode = "echo";
    expect(await reason(executeGatewayRequest(APP, "probe", { method: "GET", path: "/x", timeoutMs: 120 }))).toBe("rate_limited");
  });

  it("5xx trips the per-provider breaker after the threshold; 401 marks the connection unhealthy instead", async () => {
    writeManifest("stub", stubManifest({ kind: "none" }, {}));
    initGatewayManifests(cfg());
    declare("stub");
    setGatewayTuningForTest({ breakerThreshold: 2, breakerCooldownMs: 60_000 });
    mode = "fail500";
    expect((await executeGatewayRequest(APP, "probe", { method: "GET", path: "/x" })).status).toBe(500);
    expect((await executeGatewayRequest(APP, "probe", { method: "GET", path: "/x" })).status).toBe(500);
    expect(await reason(executeGatewayRequest(APP, "probe", { method: "GET", path: "/x" }))).toBe("breaker_open");
  });

  it("401 → unhealthy (breaker untouched), success clears it", async () => {
    writeManifest("stub", stubManifest({ kind: "none" }, {}));
    initGatewayManifests(cfg());
    declare("stub");
    mode = "unauthorized";
    expect((await executeGatewayRequest(APP, "probe", { method: "GET", path: "/x" })).status).toBe(401);
    expect(getConnectionHealth(APP, "probe")).toBe("unhealthy");
    mode = "echo";
    expect((await executeGatewayRequest(APP, "probe", { method: "GET", path: "/x" })).status).toBe(200);
    expect(getConnectionHealth(APP, "probe")).toBe("ok");
  });

  it("timeout and size cap abort typed", async () => {
    writeManifest("stub", stubManifest({ kind: "none" }, {}));
    initGatewayManifests(cfg());
    declare("stub");
    mode = "slow";
    expect(await reason(executeGatewayRequest(APP, "probe", { method: "GET", path: "/x", timeoutMs: 100 }))).toBe("timeout");
    mode = "big";
    setGatewayTuningForTest({ maxResponseBytes: 1000 });
    expect(await reason(executeGatewayRequest(APP, "probe", { method: "GET", path: "/x" }))).toBe("too_large");
  });

  it("a timeout mid-body is typed, logged, and carries no URL in its message", async () => {
    writeManifest("stub", stubManifest({ kind: "none" }, {}));
    initGatewayManifests(cfg());
    declare("stub");
    mode = "drip";
    let err: unknown;
    try {
      await executeGatewayRequest(APP, "probe", { method: "GET", path: "/x", timeoutMs: 100 });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(GatewayRequestError);
    expect((err as GatewayRequestError).reason).toBe("timeout");
    expect((err as GatewayRequestError).message).not.toContain(`127.0.0.1:${stubPort}`);
    const { records } = queryLogs({ app: APP, source: "gateway:stub", limit: 10 });
    expect(records.some((r) => (r.fields as Record<string, unknown>)?.outcome === "timeout")).toBe(true);
  });
});

describe("observability", () => {
  it("records one log per request under source gateway:<id>, credentials absent even with capture on", async () => {
    writeManifest("stub", stubManifest(
      { kind: "api_key", in: "query", param: "key", slot: "api_key" },
      { api_key: { kind: "secret", label: "Key" } }
    ));
    initGatewayManifests(cfg());
    declare("stub");
    createSecret({ label: "Stub key", value: "sk-redact-me" });
    setGatewayLink(APP, "probe", "api_key", "stub-key");
    setGatewayTuningForTest({ captureBodies: true });
    await executeGatewayRequest(APP, "probe", { method: "GET", path: "/hello" });
    const { records } = queryLogs({ app: APP, source: "gateway:stub", limit: 10 });
    expect(records.length).toBe(1);
    expect(records[0].message).toContain("GET /hello");
    const flat = JSON.stringify(records[0]);
    expect(flat).not.toContain("sk-redact-me");
    expect(flat).toContain("•••"); // the injected value was captured, masked
    const fields = records[0].fields as Record<string, unknown>;
    expect(fields.provider).toBe("stub");
    expect(fields.alias).toBe("probe");
    expect(fields.status).toBe(200);
  });

  it("the composed basic-auth header value is masked in captured bodies", async () => {
    writeManifest("stub", stubManifest(
      { kind: "basic", username_slot: "user", password_slot: "pass" },
      { user: { kind: "secret", label: "U" }, pass: { kind: "secret", label: "P" } }
    ));
    initGatewayManifests(cfg());
    declare("stub");
    createSecret({ label: "User", value: "alice" });
    createSecret({ label: "Pass", value: "hunter2" });
    setGatewayLink(APP, "probe", "user", "user");
    setGatewayLink(APP, "probe", "pass", "pass");
    setGatewayTuningForTest({ captureBodies: true });
    // echo mode reflects the Authorization header into the response body
    const env = await executeGatewayRequest(APP, "probe", { method: "GET", path: "/echo" });
    expect(env.status).toBe(200);
    const b64 = Buffer.from("alice:hunter2").toString("base64");
    const { records } = queryLogs({ app: APP, source: "gateway:stub", limit: 10 });
    expect(records.length).toBe(1);
    const flat = JSON.stringify(records[0]);
    expect(flat).not.toContain(b64);
    expect(flat).not.toContain("hunter2");
    expect(flat).toContain("•••");
  });
});
