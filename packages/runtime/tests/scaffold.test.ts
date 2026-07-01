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
  it("creates manifest + stub files and returns the app url", () => {
    const out = scaffoldApp(cfg, { slug: "notes", name: "Notes", description: "Jot things" });
    const d = path.join(cfg.appsDir, "notes");
    expect(out.url).toBe("http://lodekit.localhost:7777/notes");
    const manifest = JSON.parse(fs.readFileSync(path.join(d, "manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ name: "Notes", slug: "notes", icon: "📦", description: "Jot things" });
    expect(fs.existsSync(path.join(d, "index.html"))).toBe(true);
    expect(fs.readFileSync(path.join(d, "index.html"), "utf8")).toContain("Notes");
    expect(fs.existsSync(path.join(d, "app.js"))).toBe(true);
  });

  it("does not overwrite an existing index.html", () => {
    const d = path.join(cfg.appsDir, "keep");
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "index.html"), "ORIGINAL");
    scaffoldApp(cfg, { slug: "keep", name: "Keep" });
    expect(fs.readFileSync(path.join(d, "index.html"), "utf8")).toBe("ORIGINAL");
  });
});
