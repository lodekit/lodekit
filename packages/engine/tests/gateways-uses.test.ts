import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Config } from "../src/config.js";
import { getUsesDb, listUses, applyGatewaysManifest, registerGatewaysManifest } from "../src/services/gateways.js";
import { initGatewaysStore, closeGatewaysStoreForTest, setGatewayConfig, getGatewayConfig } from "../src/gatewaysStore.js";
import { initSecretStore, closeSecretStoreForTest } from "../src/secretsStore.js";

let root: string, state: string;
function cfg(): Config {
  return {
    root, appsDir: path.join(root, "apps"), dataDir: path.join(root, "data"),
    cacheDir: path.join(root, "cache"), stateDir: state, port: 0,
    baseUrl: "http://localhost:0", secretsKeyProvider: "file",
    gatewaysDir: path.join(root, "gateways"),
  };
}
const APP = "app-a";

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-gwuses-"));
  state = fs.mkdtempSync(path.join(os.tmpdir(), "lk-gwuses-state-"));
  initSecretStore(cfg());
  initGatewaysStore(cfg());
});
afterEach(() => {
  closeGatewaysStoreForTest();
  closeSecretStoreForTest();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(state, { recursive: true, force: true });
});

describe("gateway use registration", () => {
  it("registers valid aliases; a bad def records its error without poisoning siblings", () => {
    applyGatewaysManifest(cfg(), APP, {
      weather: { provider: "openweathermap", description: "forecast" },
      broken: { provider: "NOT VALID!" },
      "Bad-Alias": { provider: "x" }, // bad alias key skipped entirely
    }, Date.now());
    const uses = listUses(getUsesDb(cfg().dataDir, APP));
    expect(uses.map((u) => u.alias).sort()).toEqual(["broken", "weather"]);
    expect(uses.find((u) => u.alias === "weather")?.def).toEqual({ provider: "openweathermap", description: "forecast" });
    expect(uses.find((u) => u.alias === "broken")?.def).toBeNull();
    expect(uses.find((u) => u.alias === "broken")?.error).toBeTruthy();
  });

  it("wholesale re-registration prunes removed aliases AND their connection state", () => {
    applyGatewaysManifest(cfg(), APP, {
      kept: { provider: "a" },
      gone: { provider: "b" },
    }, Date.now());
    setGatewayConfig(APP, "gone", "base_url", "http://10.0.0.2");
    applyGatewaysManifest(cfg(), APP, { kept: { provider: "a" } }, Date.now());
    expect(listUses(getUsesDb(cfg().dataDir, APP)).map((u) => u.alias)).toEqual(["kept"]);
    expect(getGatewayConfig(APP, "gone", "base_url")).toBeUndefined();
  });

  it("a load error keeps previous defs; an empty manifest for a data-less app materializes nothing", () => {
    applyGatewaysManifest(cfg(), APP, { weather: { provider: "openweathermap" } }, Date.now());
    registerGatewaysManifest(cfg(), APP, {}, "SyntaxError: boom");
    expect(listUses(getUsesDb(cfg().dataDir, APP)).map((u) => u.alias)).toEqual(["weather"]);
    registerGatewaysManifest(cfg(), "never-used-app", {});
    expect(fs.existsSync(path.join(cfg().dataDir, "never-used-app", "db.sqlite"))).toBe(false);
  });
});
