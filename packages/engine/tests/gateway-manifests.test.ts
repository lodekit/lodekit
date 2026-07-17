import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Config } from "../src/config.js";
import {
  initGatewayManifests, reloadGatewayManifests, listGatewayEntries, getGatewayEntry,
  resetGatewayManifestsForTest, isPrivateHost, manifestSchema,
} from "../src/gatewayManifests.js";

let root: string;
function cfg(): Config {
  return {
    root, appsDir: path.join(root, "apps"), dataDir: path.join(root, "data"),
    cacheDir: path.join(root, "cache"), stateDir: path.join(root, "state"), port: 0,
    baseUrl: "http://localhost:0", secretsKeyProvider: "file",
    gatewaysDir: path.join(root, "gateways"),
  };
}

const OWM = {
  name: "OpenWeatherMap",
  website: "https://openweathermap.org",
  base_url: "https://api.openweathermap.org",
  auth: { kind: "api_key", in: "query", param: "appid", slot: "api_key" },
  slots: { api_key: { kind: "secret", label: "API key" } },
  limits: { rate: "60/min" },
};

function writeManifest(id: string, manifest: unknown) {
  const dir = path.join(root, "gateways", id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-gwman-"));
});
afterEach(() => {
  resetGatewayManifestsForTest();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("manifest schema", () => {
  it("accepts each auth kind and rejects undeclared slot references", () => {
    expect(manifestSchema.safeParse(OWM).success).toBe(true);
    expect(manifestSchema.safeParse({ ...OWM, auth: { kind: "none" } }).success).toBe(true);
    expect(manifestSchema.safeParse({ ...OWM, auth: { kind: "bearer", slot: "ghost" } }).success).toBe(false);
    const basic = {
      ...OWM,
      auth: { kind: "basic", username_slot: "user", password_slot: "pass" },
      slots: { user: { kind: "secret", label: "User" }, pass: { kind: "secret", label: "Pass" } },
    };
    expect(manifestSchema.safeParse(basic).success).toBe(true);
  });

  it("enforces slot kinds: auth credentials are secret slots, oauth client_id is config", () => {
    const wrongKind = { ...OWM, slots: { api_key: { kind: "config", label: "API key" } } };
    expect(manifestSchema.safeParse(wrongKind).success).toBe(false);
    const oauth = {
      name: "X", base_url: "https://x.example",
      auth: {
        kind: "oauth2", authorization_url: "https://x.example/authorize",
        token_url: "https://x.example/token", client_id_slot: "client_id",
      },
      slots: { client_id: { kind: "config", label: "Client id" } },
    };
    expect(manifestSchema.safeParse(oauth).success).toBe(true);
  });

  it("website and oauth2 URLs are http(s) only; http oauth2 endpoints only for private hosts", () => {
    expect(manifestSchema.safeParse({ ...OWM, website: "javascript:alert(1)" }).success).toBe(false);
    const oauth = (authorization_url: string) => ({
      name: "X", base_url: "https://x.example",
      auth: {
        kind: "oauth2", authorization_url,
        token_url: "https://x.example/token", client_id_slot: "client_id",
      },
      slots: { client_id: { kind: "config", label: "Client id" } },
    });
    expect(manifestSchema.safeParse(oauth("http://public.example/auth")).success).toBe(false);
    expect(manifestSchema.safeParse({ ...oauth("http://127.0.0.1:8123/auth"), local_network: true }).success).toBe(true);
    expect(manifestSchema.safeParse(oauth("javascript:alert(1)")).success).toBe(false);
  });

  it("api_key needs param/header matching its `in`; http base_url only for private hosts", () => {
    expect(manifestSchema.safeParse({ ...OWM, auth: { kind: "api_key", in: "query", slot: "api_key" } }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...OWM, base_url: "http://api.example.com" }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...OWM, base_url: "http://127.0.0.1:8123", local_network: true }).success).toBe(true);
    const fromSlot = {
      ...OWM, base_url: { from_slot: "base_url" },
      slots: { ...OWM.slots, base_url: { kind: "config", label: "Base URL" } },
    };
    expect(manifestSchema.safeParse(fromSlot).success).toBe(true);
  });
});

describe("egress schema (#88)", () => {
  const base = { name: "X", auth: { kind: "none" }, slots: {} } as const;
  it("rejects a literal private base_url without local_network", () => {
    const r = manifestSchema.safeParse({ ...base, base_url: "https://192.168.1.10" });
    expect(r.success).toBe(false);
  });
  it("accepts a literal private base_url with local_network", () => {
    const r = manifestSchema.safeParse({ ...base, base_url: "https://192.168.1.10", local_network: true });
    expect(r.success).toBe(true);
  });
  it("rejects a loopback IdP token_url without the flag", () => {
    const r = manifestSchema.safeParse({
      ...base,
      base_url: "https://api.example.com",
      auth: { kind: "oauth2", authorization_url: "https://127.0.0.1/a", token_url: "https://127.0.0.1/t", client_id_slot: "cid" },
      slots: { cid: { kind: "config", label: "cid" } },
    });
    expect(r.success).toBe(false);
  });
  it("parses allowed_hosts inside from_slot", () => {
    const r = manifestSchema.safeParse({
      ...base,
      base_url: { from_slot: "url", allowed_hosts: ["home.example.com", "*.ui.nabu.casa"] },
      slots: { url: { kind: "config", label: "url" } },
    });
    expect(r.success).toBe(true);
  });
});

describe("isPrivateHost", () => {
  it("classifies loopback/RFC-1918/mDNS as private, public hosts as not", () => {
    for (const h of ["localhost", "foo.localhost", "127.0.0.1", "::1", "10.0.0.5", "192.168.1.20", "172.16.0.1", "172.31.9.9", "homeassistant.local"]) {
      expect(isPrivateHost(h), h).toBe(true);
    }
    for (const h of ["api.example.com", "172.32.0.1", "11.0.0.1", "192.169.0.1"]) {
      expect(isPrivateHost(h), h).toBe(false);
    }
  });
});

describe("registry", () => {
  it("loads valid manifests, records per-gateway errors without dying, finds favicons", () => {
    writeManifest("openweathermap", OWM);
    fs.writeFileSync(path.join(root, "gateways", "openweathermap", "favicon.svg"), "<svg/>");
    writeManifest("broken", { name: "" });
    fs.mkdirSync(path.join(root, "gateways", "not-json"), { recursive: true });
    fs.writeFileSync(path.join(root, "gateways", "not-json", "manifest.json"), "{nope");
    fs.mkdirSync(path.join(root, "gateways", "Bad_Name"), { recursive: true }); // bad id → skipped entirely
    initGatewayManifests(cfg());
    const ids = listGatewayEntries().map((e) => e.providerId).sort();
    expect(ids).toEqual(["broken", "not-json", "openweathermap"]);
    const owm = getGatewayEntry("openweathermap")!;
    expect(owm.manifest?.name).toBe("OpenWeatherMap");
    expect(owm.error).toBeNull();
    expect(owm.faviconFile).toContain("favicon.svg");
    expect(getGatewayEntry("broken")!.manifest).toBeNull();
    expect(getGatewayEntry("broken")!.error).toBeTruthy();
    expect(getGatewayEntry("not-json")!.error).toBeTruthy();
  });

  it("a missing gateways/ dir is an empty registry, and reload reports changes", () => {
    initGatewayManifests(cfg());
    expect(listGatewayEntries()).toEqual([]);
    writeManifest("openweathermap", OWM);
    expect(reloadGatewayManifests()).toEqual(["openweathermap"]);
    expect(reloadGatewayManifests()).toEqual([]); // no change → no ids
    writeManifest("openweathermap", { ...OWM, name: "OWM" });
    expect(reloadGatewayManifests()).toEqual(["openweathermap"]);
    fs.rmSync(path.join(root, "gateways", "openweathermap"), { recursive: true });
    expect(reloadGatewayManifests()).toEqual(["openweathermap"]); // removal is a change
    expect(getGatewayEntry("openweathermap")).toBeUndefined();
  });
});
