import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDashboard } from "../src/build.js";
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
