import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { buildDashboard } from "../src/build.js";
import { createServer } from "../src/server.js";
import { configureWorkers, stopAllWorkers } from "../src/appWorker.js";
import type { Config } from "../src/config.js";

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
    const assetPath = html.match(/\/_dashboard\/_build\/assets\/[^"]+\.js/)?.[0];
    expect(assetPath).toBeTruthy();
    const asset = await fetch(base + assetPath!);
    expect(asset.status).toBe(200);
  }, 60000);
});
