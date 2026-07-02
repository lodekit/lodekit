import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { buildDashboard } from "../src/build.js";
import { createServer } from "../src/server.js";
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
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
});

describe("buildDashboard", () => {
  it("builds the dashboard into cacheDir/_dashboard with /_dashboard/ asset urls", async () => {
    const state = await buildDashboard(cfg);
    expect(state).toEqual({ status: "ready" });
    const out = path.join(cache, "_dashboard");
    const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
    expect(html).toContain("/_dashboard/assets/");
    const assets = fs.readdirSync(path.join(out, "assets"));
    expect(assets.some((f) => f.endsWith(".js"))).toBe(true);
    expect(assets.some((f) => f.endsWith(".css"))).toBe(true);
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
  }
  afterEach(() => server?.close());

  it("serves the built dashboard at / and its assets under /_dashboard/", async () => {
    await buildDashboard(cfg);
    await boot();
    const home = await fetch(base + "/");
    expect(home.status).toBe(200);
    const html = await home.text();
    expect(html).toContain('<div id="root">');
    const assetPath = html.match(/\/_dashboard\/assets\/[^"]+\.js/)?.[0];
    expect(assetPath).toBeTruthy();
    const asset = await fetch(base + assetPath!);
    expect(asset.status).toBe(200);
  }, 60000);

  it("serves a fallback page at / when the dashboard output is missing", async () => {
    await boot(); // no buildDashboard — cache is empty
    const res = await fetch(base + "/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Lodekit");
    expect(html).toContain("dashboard");
  });
});
