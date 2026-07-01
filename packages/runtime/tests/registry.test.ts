import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanApps, isValidSlug } from "../src/registry.js";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

function writeApp(slug: string, manifest: object) {
  const d = path.join(dir, slug);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, "manifest.json"), JSON.stringify(manifest));
}

describe("scanApps", () => {
  it("returns [] when dir missing", () => {
    expect(scanApps(path.join(dir, "nope"))).toEqual([]);
  });

  it("lists valid apps sorted by name", () => {
    writeApp("zebra", { name: "Zebra", slug: "zebra" });
    writeApp("apple", { name: "Apple", slug: "apple", icon: "🍎" });
    const apps = scanApps(dir);
    expect(apps.map((a) => a.slug)).toEqual(["apple", "zebra"]);
    expect(apps[0].icon).toBe("🍎");
  });

  it("skips dirs whose manifest slug != folder name", () => {
    writeApp("mismatch", { name: "X", slug: "other" });
    expect(scanApps(dir)).toEqual([]);
  });

  it("skips malformed manifests", () => {
    const d = path.join(dir, "broken");
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, "manifest.json"), "{not json");
    expect(scanApps(dir)).toEqual([]);
  });
});

describe("isValidSlug", () => {
  it("accepts lowercase/digits/dashes, rejects others", () => {
    expect(isValidSlug("tax-2024")).toBe(true);
    expect(isValidSlug("Bad Slug")).toBe(false);
    expect(isValidSlug("../x")).toBe(false);
  });
});
