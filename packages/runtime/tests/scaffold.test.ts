import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scaffoldApp } from "../src/scaffold.js";
import { buildApp } from "../src/build.js";
import { stopAppWorker } from "../src/appWorker.js";
import type { Config } from "../src/config.js";

let root: string;
let cfg: Config;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-"));
  cfg = {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: path.join(root, ".cache"),
    port: 7777,
    baseUrl: "http://lodekit.localhost:7777",
  };
});
afterEach(() => {
  stopAppWorker("notes");
  fs.rmSync(root, { recursive: true, force: true });
});

describe("scaffoldApp", () => {
  it("creates the bundled contract and returns the app url", () => {
    const out = scaffoldApp(cfg, { appId: "notes", name: "Notes", description: "Jot things" });
    const d = path.join(cfg.appsDir, "notes");
    expect(out.url).toBe("http://lodekit.localhost:7777/notes");
    expect(out.files).toEqual([
      "manifest.json",
      "src/router.tsx",
      "src/routes/__root.tsx",
      "src/routes/index.tsx",
      "src/styles.css",
    ]);
    expect(fs.existsSync(path.join(d, "index.html"))).toBe(false);
    const manifest = JSON.parse(fs.readFileSync(path.join(d, "manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ name: "Notes", appId: "notes", icon: "📦", description: "Jot things" });
    expect(fs.readFileSync(path.join(d, "src", "router.tsx"), "utf8")).toContain("createRouter");
    expect(fs.readFileSync(path.join(d, "src", "router.tsx"), "utf8")).toContain('from "./routeTree.gen"');
    const root_ = fs.readFileSync(path.join(d, "src", "routes", "__root.tsx"), "utf8");
    expect(root_).toContain("Notes");
    expect(root_).toContain('from "../styles.css?url"');
    expect(root_).toContain("dangerouslySetInnerHTML");
    const indexTsx = fs.readFileSync(path.join(d, "src", "routes", "index.tsx"), "utf8");
    expect(indexTsx).toContain('from "@lodekit/sdk"');
    expect(indexTsx).toContain('from "@lodekit/ui"');
    expect(indexTsx).toMatch(/import\s*{\s*kv\s*}\s*from "@lodekit\/sdk"/);
    expect(indexTsx).not.toMatch(/\b(?:db|store)\b/);
    expect(indexTsx).toContain("Notes");
    expect(indexTsx).toContain('import { useState } from "react"');
    expect(fs.readFileSync(path.join(d, "src", "styles.css"), "utf8")).toContain('@import "@lodekit/ui/theme.css"');
  });

  it("does not overwrite an existing index.tsx route", () => {
    const routes = path.join(cfg.appsDir, "keep", "src", "routes");
    fs.mkdirSync(routes, { recursive: true });
    fs.writeFileSync(path.join(routes, "index.tsx"), "ORIGINAL");
    scaffoldApp(cfg, { appId: "keep", name: "Keep" });
    expect(fs.readFileSync(path.join(routes, "index.tsx"), "utf8")).toBe("ORIGINAL");
  });

  it("scaffolds an app that builds to ready via buildApp", async () => {
    scaffoldApp(cfg, { appId: "notes", name: "Notes" });
    const state = await buildApp(cfg, "notes");
    expect(state).toEqual({ status: "ready" });
  }, 60000);
});
