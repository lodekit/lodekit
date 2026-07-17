import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanApps, isValidAppId } from "../src/registry.js";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

function writeApp(appId: string, manifest: object) {
  const d = path.join(dir, appId);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, "manifest.json"), JSON.stringify(manifest));
}

describe("scanApps", () => {
  it("returns [] when dir missing", () => {
    expect(scanApps(path.join(dir, "nope"))).toEqual([]);
  });

  it("lists valid apps sorted by name", () => {
    writeApp("zebra", { name: "Zebra", appId: "zebra" });
    writeApp("apple", { name: "Apple", appId: "apple", icon: "🍎" });
    const apps = scanApps(dir);
    expect(apps.map((a) => a.appId)).toEqual(["apple", "zebra"]);
    expect(apps[0].icon).toBe("🍎");
  });

  it("skips dirs whose manifest app id != folder name", () => {
    writeApp("mismatch", { name: "X", appId: "other" });
    expect(scanApps(dir)).toEqual([]);
  });

  it("skips malformed manifests", () => {
    const d = path.join(dir, "broken");
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, "manifest.json"), "{not json");
    expect(scanApps(dir)).toEqual([]);
  });

  it("reads a pre-rename manifest via the slug field (back-compat)", () => {
    const d = path.join(dir, "legacy");
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "manifest.json"), JSON.stringify({ name: "Legacy", slug: "legacy" }));
    expect(scanApps(dir).map((a) => a.appId)).toContain("legacy");
  });
});

describe("isValidAppId", () => {
  it("accepts lowercase/digits/dashes, rejects others", () => {
    expect(isValidAppId("tax-2024")).toBe(true);
    expect(isValidAppId("Bad Slug")).toBe(false);
    expect(isValidAppId("../x")).toBe(false);
  });
});
