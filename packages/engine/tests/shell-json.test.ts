import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";
import type { Config } from "../src/config.js";
import { initSettingsStore, closeSettingsStoreForTest, setPlatformValue } from "../src/services/settings.js";

let root: string, cache: string, server: Server, base: string;

function cfgFor(root: string, cache: string): Config {
  return {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: cache,
    stateDir: path.join(root, "state"),
    port: 0,
    baseUrl: "http://lodekit.localhost:0", secretsKeyProvider: "file",
    gatewaysDir: path.join(root, "gateways"),
  };
}

function writeApp(appId: string, manifest: Record<string, unknown>): void {
  const dir = path.join(root, "apps", appId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
}

async function listen(cfg: Config): Promise<void> {
  server = createServer(cfg);
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-root-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-cache-"));
  initSettingsStore(path.join(root, "data"));
});
afterEach(() => {
  closeSettingsStoreForTest();
  server?.close();
  for (const d of [root, cache]) fs.rmSync(d, { recursive: true, force: true });
});

describe("/_ui/shell.json", () => {
  it("serves the app inventory name-sorted with the default mark style, no-store", async () => {
    writeApp("bravo", { name: "Zebra", appId: "bravo", icon: "🦓" });
    writeApp("alpha", { name: "Apple", appId: "alpha", icon: "🍎" });
    await listen(cfgFor(root, cache));
    const res = await fetch(base + "/_ui/shell.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      apps: [
        { appId: "alpha", name: "Apple", icon: "🍎" },
        { appId: "bravo", name: "Zebra", icon: "🦓" },
      ],
      iconStyle: "b",
    });
  });

  it("tracks the effective appearance.icon_style", async () => {
    await listen(cfgFor(root, cache));
    setPlatformValue("appearance.icon_style", "c");
    expect(await (await fetch(base + "/_ui/shell.json")).json()).toEqual({ apps: [], iconStyle: "c" });
  });

  it("omits malformed manifest icons so the client fallback applies", async () => {
    writeApp("demo", { name: "Demo", appId: "demo", icon: 123 });
    await listen(cfgFor(root, cache));
    const body = await (await fetch(base + "/_ui/shell.json")).json();
    expect(body.apps).toEqual([{ appId: "demo", name: "Demo" }]);
  });
});
