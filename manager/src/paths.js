"use strict";
const path = require("node:path");

const PORT = 7777;

// The dev/default path-mode switch (spec §7). Everything mode-dependent lives here;
// main.js just spawns `nodeBin --import tsx runtimeEntry` with cwd runtimeDir.
function getPaths({ packaged, homedir, resourcesPath, repoRoot }) {
  const appSupportDir = path.join(homedir, "Library", "Application Support", "Lodekit");
  const common = {
    port: PORT,
    dashboardUrl: `http://lodekit.localhost:${PORT}`,
    appSupportDir,
    pidFile: path.join(appSupportDir, "runtime.pid"),
    settingsFile: path.join(appSupportDir, "settings.json"),
    logsDir: path.join(homedir, "Library", "Logs", "Lodekit"),
  };
  if (packaged) {
    const platformDir = path.join(resourcesPath, "platform");
    return {
      ...common,
      mode: "default",
      lodekitRoot: path.join(homedir, "Documents", "Lodekit"),
      cacheDir: path.join(homedir, "Library", "Caches", "Lodekit"),
      stateDir: appSupportDir,
      nodeBin: path.join(resourcesPath, "node", "bin", "node"),
      runtimeDir: path.join(platformDir, "runtime"),
      runtimeEntry: path.join(platformDir, "runtime", "src", "index.ts"),
      mcpEntry: path.join(platformDir, "mcp", "index.ts"),
      showcaseAppsDir: path.join(platformDir, "root", "apps"),
      showcaseGatewaysDir: path.join(platformDir, "root", "gateways"),
    };
  }
  return {
    ...common,
    mode: "dev",
    lodekitRoot: path.join(repoRoot, "root"),
    cacheDir: path.join(repoRoot, ".cache"),
    stateDir: path.join(repoRoot, ".cache", "state"),
    nodeBin: "node",
    runtimeDir: path.join(repoRoot, "packages", "runtime"),
    runtimeEntry: path.join(repoRoot, "packages", "runtime", "src", "index.ts"),
    mcpEntry: path.join(repoRoot, "packages", "mcp", "index.ts"),
    showcaseAppsDir: null,
    showcaseGatewaysDir: null,
  };
}

module.exports = { getPaths, PORT };
