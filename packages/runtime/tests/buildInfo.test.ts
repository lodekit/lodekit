import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBuildInfo, getBuildInfo } from "../src/buildInfo.js";

const RUNTIME_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// A minimal package dir outside the repo: os.tmpdir() is not inside a git work tree,
// so git resolution fails there by construction.
function tmpPkg(version = "9.9.9"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-buildinfo-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x", version }));
  return dir;
}

describe("resolveBuildInfo", () => {
  it("reads the version from the package's own package.json", () => {
    expect(resolveBuildInfo(tmpPkg("1.2.3")).version).toBe("1.2.3");
  });

  it("prefers the build-info.json stamp for the commit", () => {
    const dir = tmpPkg();
    fs.writeFileSync(path.join(dir, "build-info.json"), JSON.stringify({ commit: "stamped1" }));
    expect(resolveBuildInfo(dir).commit).toBe("stamped1");
  });

  it("falls back to git when no stamp exists", () => {
    const expected = execSync("git rev-parse --short HEAD", { cwd: RUNTIME_DIR, encoding: "utf8" }).trim();
    expect(resolveBuildInfo(RUNTIME_DIR).commit).toBe(expected);
  });

  it("returns a null commit when neither stamp nor git resolves", () => {
    expect(resolveBuildInfo(tmpPkg()).commit).toBeNull();
  });
});

describe("getBuildInfo", () => {
  it("reports the runtime's own version", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(RUNTIME_DIR, "package.json"), "utf8"));
    expect(getBuildInfo()).toEqual({ version: pkg.version, commit: expect.any(String) });
  });
});
