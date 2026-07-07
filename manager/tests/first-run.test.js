import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installShowcase } from "../src/firstRun.js";

let src, root;
beforeEach(() => {
  src = fs.mkdtempSync(path.join(os.tmpdir(), "lk-showcase-src-"));
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-showcase-root-"));
  fs.mkdirSync(path.join(root, "apps"), { recursive: true });
  for (const app of ["greenhouse", "welcome"]) {
    fs.mkdirSync(path.join(src, app, "src"), { recursive: true });
    fs.writeFileSync(path.join(src, app, "manifest.json"), JSON.stringify({ appId: app }));
    fs.writeFileSync(path.join(src, app, "src", "router.tsx"), "// app source\n");
  }
});
afterEach(() => {
  fs.rmSync(src, { recursive: true, force: true });
  fs.rmSync(root, { recursive: true, force: true });
});

describe("installShowcase", () => {
  it("copies every bundled app into the root's apps/", () => {
    const installed = installShowcase(src, root);
    expect(installed.sort()).toEqual(["greenhouse", "welcome"]);
    expect(fs.existsSync(path.join(root, "apps", "greenhouse", "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "apps", "welcome", "src", "router.tsx"))).toBe(true);
  });

  it("never clobbers an existing app dir", () => {
    fs.mkdirSync(path.join(root, "apps", "greenhouse"), { recursive: true });
    fs.writeFileSync(path.join(root, "apps", "greenhouse", "manifest.json"), '{"mine":true}');
    const installed = installShowcase(src, root);
    expect(installed).toEqual(["welcome"]);
    expect(fs.readFileSync(path.join(root, "apps", "greenhouse", "manifest.json"), "utf8")).toBe('{"mine":true}');
  });

  it("is a no-op when the showcase dir is missing", () => {
    expect(installShowcase(path.join(src, "nope"), root)).toEqual([]);
  });
});
