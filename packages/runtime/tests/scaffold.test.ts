import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scaffoldApp } from "../src/scaffold.js";
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
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("scaffoldApp", () => {
  it("creates the bundled contract and returns the app url", () => {
    const out = scaffoldApp(cfg, { slug: "notes", name: "Notes", description: "Jot things" });
    const d = path.join(cfg.appsDir, "notes");
    expect(out.url).toBe("http://lodekit.localhost:7777/notes");
    expect(out.files).toEqual(["manifest.json", "index.html", "src/main.tsx", "src/App.tsx", "src/index.css"]);
    const manifest = JSON.parse(fs.readFileSync(path.join(d, "manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ name: "Notes", slug: "notes", icon: "📦", description: "Jot things" });
    expect(fs.readFileSync(path.join(d, "index.html"), "utf8")).toContain('src="/src/main.tsx"');
    expect(fs.readFileSync(path.join(d, "src", "main.tsx"), "utf8")).toContain("createRoot");
    expect(fs.readFileSync(path.join(d, "src", "App.tsx"), "utf8")).toContain('from "@lodekit/sdk"');
    expect(fs.readFileSync(path.join(d, "src", "App.tsx"), "utf8")).toContain('from "@lodekit/ui"');
    expect(fs.readFileSync(path.join(d, "src", "index.css"), "utf8")).toContain('@import "@lodekit/ui/theme.css"');
  });

  it("does not overwrite an existing App.tsx", () => {
    const src = path.join(cfg.appsDir, "keep", "src");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, "App.tsx"), "ORIGINAL");
    scaffoldApp(cfg, { slug: "keep", name: "Keep" });
    expect(fs.readFileSync(path.join(src, "App.tsx"), "utf8")).toBe("ORIGINAL");
  });
});
