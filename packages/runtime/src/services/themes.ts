// The theme service (spec 2026-07-16-theme-editor-design.md): the person's look.
// A theme is a CSS token file (`<name>.css`). Vendored themes ship with the
// runtime (packages/runtime/themes/, read-only); user themes live in the Lodekit
// root at `<root>/themes/`, alongside `config.json` (the global + per-app
// selections). Resolution is app → global → the vendored `lodekit` default, with
// per-step fallback when a selected theme's file is missing. Name grammar equals
// the app-id grammar (registry's isValidAppId) — validated before any path join.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isValidAppId } from "../registry.js";
import type { Config } from "../config.js";

export const THEME_MAX_BYTES = 512 * 1024;
export const DEFAULT_THEME = "lodekit";

export interface ThemeInfo {
  name: string;
  vendored: boolean;
  iconLibrary: string;
}

export interface ThemesConfig {
  global?: string;
  apps?: Record<string, string>;
}

/** Theme validation/semantic error — the router maps `status` to the HTTP code. */
export class ThemeError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 = 400) {
    super(message);
    this.name = "ThemeError";
  }
}

let warnedLegacy = false;
let warnedConfig = false;
let previewCss: string | null = null;

// The vendored themes ship inside the package; from src/services/ that is ../../themes.
export function vendoredThemesDir(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "themes");
}

export function userThemesDir(cfg: Config): string {
  return path.join(cfg.root, "themes");
}

// Name grammar is the single app-id grammar; validate before any path join.
function assertValidName(name: string): void {
  if (!isValidAppId(name)) throw new ThemeError(`invalid theme name: ${JSON.stringify(name)}`);
}

function atomicWrite(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

export function isVendoredTheme(name: string): boolean {
  if (!isValidAppId(name)) return false;
  return fs.existsSync(path.join(vendoredThemesDir(), name + ".css"));
}

// The .css basenames in a directory (excluding config.json), sorted alphabetically.
function cssNames(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".css"))
    .map((f) => f.slice(0, -4))
    .filter((n) => isValidAppId(n))
    .sort();
}

export function listThemes(cfg: Config): ThemeInfo[] {
  const out: ThemeInfo[] = [];
  const vendored = new Set(cssNames(vendoredThemesDir()));
  for (const name of vendored) {
    out.push({ name, vendored: true, iconLibrary: extractIconLibrary(readThemeCss(cfg, name) ?? "") });
  }
  for (const name of cssNames(userThemesDir(cfg))) {
    if (vendored.has(name)) continue; // a vendored name never doubles as a user theme
    out.push({ name, vendored: false, iconLibrary: extractIconLibrary(readThemeCss(cfg, name) ?? "") });
  }
  return out;
}

export function readThemeCss(cfg: Config, name: string): string | null {
  if (!isValidAppId(name)) return null;
  const dir = isVendoredTheme(name) ? vendoredThemesDir() : userThemesDir(cfg);
  try {
    return fs.readFileSync(path.join(dir, name + ".css"), "utf8");
  } catch {
    return null;
  }
}

// Missing or malformed config.json → {} (with one logged warning), never a throw.
export function readThemesConfig(cfg: Config): ThemesConfig {
  const file = path.join(userThemesDir(cfg), "config.json");
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as ThemesConfig;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    /* fall through to warn + {} */
  }
  if (!warnedConfig) {
    console.warn(`[themes] ignoring malformed ${file} — using defaults`);
    warnedConfig = true;
  }
  return {};
}

export function writeThemesConfig(cfg: Config, config: ThemesConfig): void {
  if (config.global !== undefined) assertValidName(config.global);
  if (config.apps !== undefined) {
    for (const [appId, name] of Object.entries(config.apps)) {
      if (!isValidAppId(appId)) throw new ThemeError(`invalid app id: ${JSON.stringify(appId)}`);
      assertValidName(name);
    }
  }
  atomicWrite(path.join(userThemesDir(cfg), "config.json"), JSON.stringify(config, null, 2) + "\n");
}

// app → global → DEFAULT_THEME, skipping any selection whose file is missing.
export function resolveThemeName(cfg: Config, appId?: string): string {
  const config = readThemesConfig(cfg);
  const candidates: string[] = [];
  if (appId && config.apps && config.apps[appId]) candidates.push(config.apps[appId]);
  if (config.global) candidates.push(config.global);
  candidates.push(DEFAULT_THEME);
  for (const name of candidates) {
    if (readThemeCss(cfg, name) !== null) return name;
    console.warn(`[themes] selected theme "${name}" not found on disk — falling back`);
  }
  return DEFAULT_THEME;
}

// Never throws: the vendored lodekit.css content is the last-resort floor.
export function resolveThemeCss(cfg: Config, appId?: string): string {
  try {
    const css = readThemeCss(cfg, resolveThemeName(cfg, appId));
    if (css !== null) return css;
  } catch {
    /* fall through to the vendored floor */
  }
  return fs.readFileSync(path.join(vendoredThemesDir(), DEFAULT_THEME + ".css"), "utf8");
}

export function extractIconLibrary(css: string): string {
  const m = css.match(/--icon-library:\s*([a-z-]+)/);
  return m ? m[1] : "lucide";
}

export function putUserTheme(cfg: Config, name: string, css: string): void {
  assertValidName(name);
  if (isVendoredTheme(name)) throw new ThemeError(`"${name}" is a vendored theme and cannot be overwritten`, 409);
  if (Buffer.byteLength(css, "utf8") > THEME_MAX_BYTES) {
    throw new ThemeError(`theme exceeds the ${THEME_MAX_BYTES}-byte cap`);
  }
  atomicWrite(path.join(userThemesDir(cfg), name + ".css"), css);
}

export function duplicateTheme(cfg: Config, from: string, to: string): void {
  assertValidName(from);
  assertValidName(to);
  if (isVendoredTheme(to)) throw new ThemeError(`"${to}" is a vendored theme name`, 409);
  const css = readThemeCss(cfg, from);
  if (css === null) throw new ThemeError(`theme "${from}" not found`, 404);
  atomicWrite(path.join(userThemesDir(cfg), to + ".css"), css);
}

export function renameUserTheme(cfg: Config, from: string, to: string): void {
  assertValidName(from);
  assertValidName(to);
  if (isVendoredTheme(from)) throw new ThemeError(`"${from}" is a vendored theme and cannot be renamed`, 409);
  if (isVendoredTheme(to)) throw new ThemeError(`"${to}" is a vendored theme name`, 409);
  const css = readThemeCss(cfg, from);
  if (css === null) throw new ThemeError(`theme "${from}" not found`, 404);
  atomicWrite(path.join(userThemesDir(cfg), to + ".css"), css);
  fs.rmSync(path.join(userThemesDir(cfg), from + ".css"), { force: true });
  // Carry any config references across in the same operation.
  const config = readThemesConfig(cfg);
  let changed = false;
  if (config.global === from) { config.global = to; changed = true; }
  if (config.apps) {
    for (const [appId, name] of Object.entries(config.apps)) {
      if (name === from) { config.apps[appId] = to; changed = true; }
    }
  }
  if (changed) writeThemesConfig(cfg, config);
}

export function deleteUserTheme(cfg: Config, name: string): void {
  assertValidName(name);
  if (isVendoredTheme(name)) throw new ThemeError(`"${name}" is a vendored theme and cannot be deleted`, 409);
  const file = path.join(userThemesDir(cfg), name + ".css");
  if (!fs.existsSync(file)) throw new ThemeError(`theme "${name}" not found`, 404);
  fs.rmSync(file, { force: true });
  // The selection in config.json is left as-is — resolution falls back on a missing file.
}

export function setPreviewCss(css: string | null): void {
  previewCss = css;
}

export function getPreviewCss(): string | null {
  return previewCss;
}

// One-time startup warning for the retired legacy theme locations (spec §1).
export function warnLegacyThemeFiles(cfg: Config): void {
  if (warnedLegacy) return;
  const legacy: string[] = [];
  const rootTheme = path.join(cfg.root, "theme.css");
  if (fs.existsSync(rootTheme)) legacy.push(rootTheme);
  if (fs.existsSync(cfg.appsDir)) {
    for (const entry of fs.readdirSync(cfg.appsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const appTheme = path.join(cfg.appsDir, entry.name, "theme.css");
      if (fs.existsSync(appTheme)) legacy.push(appTheme);
    }
  }
  if (legacy.length === 0) return;
  warnedLegacy = true;
  console.warn(
    `[themes] legacy theme file(s) are no longer read: ${legacy.join(", ")} — ` +
    `move token overrides into <root>/themes/<name>.css and select them via themes/config.json`
  );
}
