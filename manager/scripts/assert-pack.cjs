"use strict";
const fs = require("node:fs");
const path = require("node:path");

// Electron ships LICENSE and LICENSES.chromium.html in its dist, but
// electron-builder does not copy them into macOS output — so the packaged app
// would redistribute Chromium with no notice. Node's aggregate LICENSE already
// rides along inside extraResources (build/node → node); this asserts it stayed.
function collectLicenses(context) {
  const resources = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    "Contents",
    "Resources"
  );

  const electronDist = path.dirname(require.resolve("electron/package.json"));
  const copies = [
    [path.join(electronDist, "dist", "LICENSE"), path.join(resources, "LICENSE.electron")],
    [
      path.join(electronDist, "dist", "LICENSES.chromium.html"),
      path.join(resources, "LICENSES.chromium.html"),
    ],
  ];
  for (const [from, to] of copies) {
    if (!fs.existsSync(from)) {
      throw new Error(`Electron license file missing from its dist: ${from}`);
    }
    fs.copyFileSync(from, to);
  }

  const required = [
    path.join(resources, "LICENSE.electron"),
    path.join(resources, "LICENSES.chromium.html"),
    path.join(resources, "node", "LICENSE"),
  ];
  for (const p of required) {
    if (!fs.existsSync(p)) {
      throw new Error(`Packed app is missing a redistribution notice: ${p}`);
    }
  }
}

// afterPack guard: the files whitelist in electron-builder.yml must ship every
// runtime-read path. Forge's ignore-regex shipped assets/ implicitly; a whitelist
// drops it silently and the tray renders an empty (invisible) icon.
module.exports = async function assertPack(context) {
  const appDir = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    "Contents",
    "Resources",
    "app"
  );
  const iconsDir = path.join(appDir, "assets", "menubar-icons");
  const ok =
    fs.existsSync(iconsDir) &&
    fs.readdirSync(iconsDir).some((f) => f.endsWith("-18.png"));
  if (!ok) {
    throw new Error(`Packed app is missing the menubar icons: ${iconsDir}`);
  }
  collectLicenses(context);
};

module.exports.collectLicenses = collectLicenses;
