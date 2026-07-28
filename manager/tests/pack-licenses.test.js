import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// Default import, then destructure. assert-pack.cjs sets `module.exports` to a
// function and hangs `collectLicenses` off it as a property — cjs-module-lexer
// does not reliably detect that shape as a named export, unlike the
// object-literal `module.exports = { … }` in src/paths.js.
import assertPack from "../scripts/assert-pack.cjs";

const { collectLicenses } = assertPack;

function fakeContext(appOutDir) {
  return {
    appOutDir,
    packager: { appInfo: { productFilename: "Lodekit" } },
  };
}

function scaffold() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-pack-"));
  const resources = path.join(dir, "Lodekit.app", "Contents", "Resources");
  fs.mkdirSync(path.join(resources, "node"), { recursive: true });
  fs.writeFileSync(path.join(resources, "node", "LICENSE"), "node license");
  return { dir, resources };
}

describe("collectLicenses", () => {
  it("copies Electron's LICENSE and LICENSES.chromium.html into Resources", () => {
    const { dir, resources } = scaffold();
    collectLicenses(fakeContext(dir));
    expect(fs.existsSync(path.join(resources, "LICENSE.electron"))).toBe(true);
    expect(fs.existsSync(path.join(resources, "LICENSES.chromium.html"))).toBe(true);
  });

  it("throws when Node's aggregate LICENSE is missing from the bundle", () => {
    const { dir, resources } = scaffold();
    fs.rmSync(path.join(resources, "node", "LICENSE"));
    expect(() => collectLicenses(fakeContext(dir))).toThrow(/node[/\\]LICENSE/);
  });
});
