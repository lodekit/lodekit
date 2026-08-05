"use strict";
const fs = require("node:fs");
const path = require("node:path");

// User preferences persisted as JSON in Application Support (paths.settingsFile).
// Kept intentionally tiny — a corrupt or missing file falls back to defaults.

const ICON_STYLES = ["a", "b", "c"];
const DEFAULT_ICON_STYLE = "b"; // knockout — boldest at menu-bar sizes

function readSettings(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function getIconStyle(file) {
  const style = readSettings(file).iconStyle;
  return ICON_STYLES.includes(style) ? style : DEFAULT_ICON_STYLE;
}

function setIconStyle(file, style) {
  if (!ICON_STYLES.includes(style)) throw new Error(`Unknown icon style: ${style}`);
  const settings = readSettings(file);
  settings.iconStyle = style;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(settings, null, 2), { mode: 0o600 });
}

module.exports = { getIconStyle, setIconStyle, ICON_STYLES, DEFAULT_ICON_STYLE };
