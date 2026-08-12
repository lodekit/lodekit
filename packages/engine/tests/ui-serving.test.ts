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

describe("/_ui placeholder", () => {
  it("redirects /_ui through /_ui/ to the dashboard Themes stub", async () => {
    await listen(cfgFor(root, cache));
    const redirect = await fetch(base + "/_ui", { redirect: "manual" });
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get("location")).toBe("/_ui/");
    const home = await fetch(base + "/_ui/", { redirect: "manual" });
    expect(home.status).toBe(302);
    expect(home.headers.get("location")).toBe("/_dashboard/themes");
  });

  it("keeps serving theme assets and 404s unknown /_ui paths", async () => {
    await listen(cfgFor(root, cache));
    expect((await fetch(base + "/_ui/theme.js")).status).toBe(200);
    expect((await fetch(base + "/_ui/theme.json")).status).toBe(200);
    expect((await fetch(base + "/_ui/theme.css")).status).toBe(200);
    expect((await fetch(base + "/_ui/assets/nope.js")).status).toBe(404);
  });
});

describe("/_ui/theme.css", () => {
  it("serves the resolved default theme, text/css, no-store", async () => {
    await listen(cfgFor(root, cache));
    const res = await fetch(base + "/_ui/theme.css");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain("--icon-library"); // the vendored shadcn default
  });

  it("resolves a configured per-app theme", async () => {
    const themesDir = path.join(root, "themes");
    fs.mkdirSync(themesDir, { recursive: true });
    fs.writeFileSync(path.join(themesDir, "demo-theme.css"), ":root { --primary: #22cc78; }\n");
    fs.writeFileSync(path.join(themesDir, "config.json"), JSON.stringify({ apps: { demo: "demo-theme" } }));
    const appDir = path.join(root, "apps", "demo");
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, "manifest.json"), JSON.stringify({ name: "Demo", appId: "demo" }));
    await listen(cfgFor(root, cache));
    expect(await (await fetch(base + "/_ui/theme.css?app=demo")).text()).toContain("#22cc78");
  });

  it("degrades unknown and invalid app ids to global resolution (always 200)", async () => {
    await listen(cfgFor(root, cache));
    const invalid = await fetch(base + "/_ui/theme.css?app=..%2Fevil");
    expect(invalid.status).toBe(200);
    expect(await invalid.text()).toContain("--icon-library");
    const unknown = await fetch(base + "/_ui/theme.css?app=nope");
    expect(unknown.status).toBe(200);
    expect(await unknown.text()).toContain("--icon-library");
  });

  it("serves the theme resolver with the effective mode, no-store", async () => {
    await listen(cfgFor(root, cache));
    const r = await fetch(`${base}/_ui/theme.js`);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.text()).toContain('"system"');
    setPlatformValue("appearance.theme", "dark");
    expect(await (await fetch(`${base}/_ui/theme.js`)).text()).toContain('"dark"');
    expect(await (await fetch(`${base}/_ui/theme.json`)).json()).toEqual({ theme: "dark", iconLibrary: "lucide" });
  });
});
