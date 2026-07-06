import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { buildDashboard } from "../src/build.js";
import { createServer } from "../src/server.js";
import { configureWorkers, stopAllWorkers } from "../src/appWorker.js";
import type { Config } from "../src/config.js";
import { getBuildInfo } from "../src/buildInfo.js";

let root: string, cache: string, cfg: Config;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-root-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-cache-"));
  cfg = {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: cache,
    port: 0,
    baseUrl: "http://lodekit.localhost:0",
  };
});
afterEach(() => {
  stopAllWorkers();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
});

describe("buildDashboard", () => {
  it("builds the dashboard to cacheDir/_dashboard through the Start pipeline", async () => {
    const state = await buildDashboard(cfg);
    expect(state).toEqual({ status: "ready" });
    const outDir = path.join(cache, "_dashboard");
    expect(fs.existsSync(path.join(outDir, "server", "server.js"))).toBe(true);
    expect(fs.readdirSync(path.join(outDir, "client"), { recursive: true }).length).toBeGreaterThan(0);
  }, 60000);

  it("applies the global theme override to the dashboard build", async () => {
    fs.writeFileSync(path.join(root, "theme.css"), ":root { --primary: #ff3456; }\n");
    const state = await buildDashboard(cfg);
    expect(state).toEqual({ status: "ready" });
    const assets = fs.readdirSync(path.join(cache, "_dashboard", "client", "assets"));
    const cssFile = assets.find((f) => f.endsWith(".css"));
    const css = fs.readFileSync(path.join(cache, "_dashboard", "client", "assets", cssFile!), "utf8");
    expect(css).toContain("ff3456");
  }, 60000);

  it("serializes concurrent dashboard builds without racing the outDir", async () => {
    const [a, b] = await Promise.all([buildDashboard(cfg), buildDashboard(cfg)]);
    expect(a).toEqual({ status: "ready" });
    expect(b).toEqual({ status: "ready" });
    const outDir = path.join(cache, "_dashboard");
    expect(fs.existsSync(path.join(outDir, "server", "server.js"))).toBe(true);
    expect(fs.readdirSync(path.join(outDir, "client"), { recursive: true }).length).toBeGreaterThan(0);
  }, 60000);
});

describe("dashboard serving", () => {
  let server: Server, base: string;

  async function boot() {
    await new Promise<void>((resolve) => {
      server = createServer(cfg).listen(0, () => resolve());
    });
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
    configureWorkers(base);
  }
  afterEach(() => server?.close());

  it("redirects / to /_dashboard/", async () => {
    await boot();
    const res = await fetch(base + "/", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/_dashboard/");
  });

  it("serves the SSR'd dashboard at /_dashboard/ and its built assets under /_dashboard/_build/", async () => {
    await boot();
    await buildDashboard(cfg);
    const home = await fetch(base + "/_dashboard/");
    expect(home.status).toBe(200);
    const html = await home.text();
    expect(html).toContain("Lodekit");
    const { version, commit } = getBuildInfo();
    expect(html).toContain(`lodekit v${version} ${commit}`);
    const assetPath = html.match(/\/_dashboard\/_build\/assets\/[^"]+\.js/)?.[0];
    expect(assetPath).toBeTruthy();
    const asset = await fetch(base + assetPath!);
    expect(asset.status).toBe(200);
  }, 60000);

  it("rejects a cross-origin _serverFn call and accepts a same-origin one", async () => {
    await boot();
    await buildDashboard(cfg);
    const crossOrigin = await fetch(base + "/_dashboard/_serverFn/x", { method: "POST" });
    expect(crossOrigin.status).toBe(403);
    expect(await crossOrigin.json()).toEqual({ error: "server functions are same-origin only" });

    const sameOrigin = await fetch(base + "/_dashboard/_serverFn/x", {
      method: "POST",
      headers: { "sec-fetch-site": "same-origin" },
    });
    expect(sameOrigin.status).not.toBe(403);
  }, 60000);

  it("links to the ui component preview", async () => {
    await boot();
    await buildDashboard(cfg);
    const html = await (await fetch(base + "/_dashboard/")).text();
    expect(html).toContain('href="/_ui/"');
  }, 60000);
});
