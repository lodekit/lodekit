"use strict";
const fs = require("node:fs");
const path = require("node:path");

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
};
