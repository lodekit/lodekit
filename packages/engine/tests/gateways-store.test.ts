import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Config } from "../src/config.js";
import {
  initGatewaysStore, closeGatewaysStoreForTest,
  setGatewayLink, deleteGatewayLink, getGatewayLink,
  setGatewayConfig, deleteGatewayConfig, getGatewayConfig,
  pruneGatewayConnections,
  saveOauthTokens, loadOauthTokens, deleteOauthTokens, setNeedsReauth, oauthState,
  GatewaysError, GatewaysNotFoundError,
} from "../src/gatewaysStore.js";
import {
  initSecretStore, closeSecretStoreForTest, createSecret, deleteSecret, readValueBySlug,
  SecretsNotFoundError, SecretsUnavailableError,
} from "../src/secretsStore.js";

let root: string, state: string;
function cfg(): Config {
  return {
    root, appsDir: path.join(root, "apps"), dataDir: path.join(root, "data"),
    cacheDir: path.join(root, "cache"), stateDir: state, port: 0,
    baseUrl: "http://localhost:0", secretsKeyProvider: "file",
    gatewaysDir: path.join(root, "gateways"),
  };
}
const APP = "app-a", ALIAS = "weather";

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-gwstore-"));
  state = fs.mkdtempSync(path.join(os.tmpdir(), "lk-gwstate-"));
  initSecretStore(cfg());
  expect(initGatewaysStore(cfg())).toBe(true);
});
afterEach(() => {
  closeGatewaysStoreForTest();
  closeSecretStoreForTest();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(state, { recursive: true, force: true });
});

describe("readValueBySlug", () => {
  it("decrypts by slug; unknown slug 404s", () => {
    createSecret({ label: "K", value: "v-by-slug" });
    expect(readValueBySlug("k")).toBe("v-by-slug");
    expect(() => readValueBySlug("ghost")).toThrow(SecretsNotFoundError);
  });
});

describe("links (the secrets shape, per alias)", () => {
  it("link → resolve → unlink; unknown slug 404s; a deleted secret reads as pending", () => {
    createSecret({ label: "OW key", value: "v" });
    expect(() => setGatewayLink(APP, ALIAS, "api_key", "ghost")).toThrow(GatewaysNotFoundError);
    setGatewayLink(APP, ALIAS, "api_key", "ow-key");
    expect(getGatewayLink(APP, ALIAS, "api_key")).toEqual({ slug: "ow-key", label: "OW key" });
    deleteSecret("ow-key");
    expect(getGatewayLink(APP, ALIAS, "api_key")).toBeUndefined(); // soft ref → pending again
    expect(deleteGatewayLink(APP, ALIAS, "api_key")).toBe(true);
    expect(deleteGatewayLink(APP, ALIAS, "api_key")).toBe(false);
  });

  it("two aliases on one app hold independent links (two accounts, spec §3)", () => {
    createSecret({ label: "A", value: "1" });
    createSecret({ label: "B", value: "2" });
    setGatewayLink(APP, "acct_one", "api_key", "a");
    setGatewayLink(APP, "acct_two", "api_key", "b");
    expect(getGatewayLink(APP, "acct_one", "api_key")?.slug).toBe("a");
    expect(getGatewayLink(APP, "acct_two", "api_key")?.slug).toBe("b");
  });
});

describe("config values", () => {
  it("set/get/delete round-trips; empty and oversized values 400", () => {
    setGatewayConfig(APP, ALIAS, "base_url", "http://homeassistant.local:8123");
    expect(getGatewayConfig(APP, ALIAS, "base_url")).toBe("http://homeassistant.local:8123");
    setGatewayConfig(APP, ALIAS, "base_url", "http://10.0.0.2:8123"); // upsert
    expect(getGatewayConfig(APP, ALIAS, "base_url")).toBe("http://10.0.0.2:8123");
    expect(() => setGatewayConfig(APP, ALIAS, "x", "")).toThrow(GatewaysError);
    expect(() => setGatewayConfig(APP, ALIAS, "x", "y".repeat(4097))).toThrow(GatewaysError);
    expect(deleteGatewayConfig(APP, ALIAS, "base_url")).toBe(true);
    expect(getGatewayConfig(APP, ALIAS, "base_url")).toBeUndefined();
  });
});

describe("oauth tokens", () => {
  it("round-trips encrypted, tracks needs_reauth, and never stores plaintext", () => {
    expect(oauthState(APP, ALIAS)).toBe("none");
    saveOauthTokens(APP, ALIAS, { accessToken: "at-plain-marker", refreshToken: "rt-plain-marker", expiresAt: 123 });
    expect(oauthState(APP, ALIAS)).toBe("connected");
    expect(loadOauthTokens(APP, ALIAS)).toEqual({ accessToken: "at-plain-marker", refreshToken: "rt-plain-marker", expiresAt: 123 });
    setNeedsReauth(APP, ALIAS, true);
    expect(oauthState(APP, ALIAS)).toBe("needs_reauth");
    saveOauthTokens(APP, ALIAS, { accessToken: "at2" }); // a fresh save clears the flag
    expect(oauthState(APP, ALIAS)).toBe("connected");
    const dir = path.join(root, "data", "_platform");
    const bytes = Buffer.concat(
      fs.readdirSync(dir).filter((f) => f.startsWith("gateways.sqlite")).map((f) => fs.readFileSync(path.join(dir, f)))
    );
    expect(bytes.includes(Buffer.from("at-plain-marker"))).toBe(false);
    expect(bytes.includes(Buffer.from("rt-plain-marker"))).toBe(false);
    expect(deleteOauthTokens(APP, ALIAS)).toBe(true);
    expect(oauthState(APP, ALIAS)).toBe("none");
  });
});

describe("pruneGatewayConnections", () => {
  it("drops links + config + tokens of aliases the app no longer declares", () => {
    createSecret({ label: "K", value: "v" });
    setGatewayLink(APP, "kept", "api_key", "k");
    setGatewayLink(APP, "gone", "api_key", "k");
    setGatewayConfig(APP, "gone", "base_url", "http://10.0.0.2");
    saveOauthTokens(APP, "gone", { accessToken: "t" });
    pruneGatewayConnections(APP, new Set(["kept"]));
    expect(getGatewayLink(APP, "kept", "api_key")).toBeDefined();
    expect(getGatewayLink(APP, "gone", "api_key")).toBeUndefined();
    expect(getGatewayConfig(APP, "gone", "base_url")).toBeUndefined();
    expect(oauthState(APP, "gone")).toBe("none");
  });
});

describe("degraded store", () => {
  it("throws the shared unavailable error when closed", () => {
    closeGatewaysStoreForTest();
    expect(() => setGatewayConfig(APP, ALIAS, "x", "y")).toThrow(SecretsUnavailableError);
  });
});
