"use strict";
const fs = require("node:fs");
const path = require("node:path");

// First-run showcase install (showcase-apps spec §10): copy each bundled app into the
// root's apps/ — additive only, existing dirs are the person's and are never touched.
function installShowcase(showcaseAppsDir, lodekitRoot) {
  if (!showcaseAppsDir || !fs.existsSync(showcaseAppsDir)) return [];
  const installed = [];
  for (const entry of fs.readdirSync(showcaseAppsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dst = path.join(lodekitRoot, "apps", entry.name);
    if (fs.existsSync(dst)) continue;
    fs.cpSync(path.join(showcaseAppsDir, entry.name), dst, { recursive: true });
    installed.push(entry.name);
  }
  return installed;
}

// First-run gateways install (gateways spec §14): the bundled gateway
// manifests ride beside the showcase apps — additive only, existing dirs are
// the person's and are never touched.
function installGateways(showcaseGatewaysDir, lodekitRoot) {
  if (!showcaseGatewaysDir || !fs.existsSync(showcaseGatewaysDir)) return [];
  const installed = [];
  for (const entry of fs.readdirSync(showcaseGatewaysDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dst = path.join(lodekitRoot, "gateways", entry.name);
    if (fs.existsSync(dst)) continue;
    fs.cpSync(path.join(showcaseGatewaysDir, entry.name), dst, { recursive: true });
    installed.push(entry.name);
  }
  return installed;
}

module.exports = { installShowcase, installGateways };
