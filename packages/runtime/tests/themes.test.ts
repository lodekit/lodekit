import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  listThemes, readThemeCss, readThemesConfig, writeThemesConfig, resolveThemeName,
  resolveThemeCss, extractIconLibrary, putUserTheme, duplicateTheme, renameUserTheme,
  deleteUserTheme, ThemeError, DEFAULT_THEME, THEME_MAX_BYTES,
} from "../src/services/themes.js";
import type { Config } from "../src/config.js";

let root: string; let cfg: Config;
const themesDir = () => path.join(root, "themes");

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-themes-"));
  cfg = { root, appsDir: path.join(root, "apps"), dataDir: path.join(root, "data"),
    cacheDir: path.join(root, ".cache"), stateDir: path.join(root, ".state"),
    port: 0, baseUrl: "http://lodekit.localhost:0", secretsKeyProvider: "file",
    gatewaysDir: path.join(root, "gateways") };
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("theme service", () => {
  it("lists vendored themes including lodekit", () => {
    const names = listThemes(cfg).map((t) => t.name);
    expect(names).toContain("lodekit");
    expect(listThemes(cfg).find((t) => t.name === "lodekit")?.vendored).toBe(true);
  });
  it("resolves app → global → default with fallbacks", () => {
    expect(resolveThemeName(cfg)).toBe(DEFAULT_THEME);
    putUserTheme(cfg, "mine", ":root { --primary: red; }");
    writeThemesConfig(cfg, { global: "mine" });
    expect(resolveThemeName(cfg)).toBe("mine");
    writeThemesConfig(cfg, { global: "mine", apps: { books: "lodekit" } });
    expect(resolveThemeName(cfg, "books")).toBe("lodekit");
    fs.rmSync(path.join(themesDir(), "mine.css"));      // selected theme vanishes on disk
    expect(resolveThemeName(cfg)).toBe(DEFAULT_THEME);  // falls back, no throw
  });
  it("resolveThemeCss never throws and always returns lodekit content at worst", () => {
    const css = resolveThemeCss(cfg);
    expect(css).toContain("--icon-library");
  });
  it("survives malformed config.json", () => {
    fs.mkdirSync(themesDir(), { recursive: true });
    fs.writeFileSync(path.join(themesDir(), "config.json"), "{nope");
    expect(readThemesConfig(cfg)).toEqual({});
    expect(resolveThemeName(cfg)).toBe(DEFAULT_THEME);
  });
  it("refuses vendored writes, renames, deletes and name collisions", () => {
    expect(() => putUserTheme(cfg, "lodekit", ":root{}")).toThrow(ThemeError);
    expect(() => renameUserTheme(cfg, "lodekit", "x")).toThrow(ThemeError);
    expect(() => deleteUserTheme(cfg, "lodekit")).toThrow(ThemeError);
    putUserTheme(cfg, "mine", ":root{}");
    expect(() => renameUserTheme(cfg, "mine", "lodekit")).toThrow(ThemeError);
  });
  it("rejects path traversal on every mutating call", () => {
    for (const bad of ["../evil", "a/b", ".", "", "UPPER", "has space"]) {
      expect(() => putUserTheme(cfg, bad, ":root{}")).toThrow(ThemeError);
      expect(() => duplicateTheme(cfg, "lodekit", bad)).toThrow(ThemeError);
      expect(() => deleteUserTheme(cfg, bad)).toThrow(ThemeError);
    }
    expect(fs.existsSync(path.join(root, "evil.css"))).toBe(false);
  });
  it("enforces the size cap", () => {
    expect(() => putUserTheme(cfg, "big", "x".repeat(THEME_MAX_BYTES + 1))).toThrow(ThemeError);
  });
  it("rename rewrites config references", () => {
    putUserTheme(cfg, "mine", ":root{}");
    writeThemesConfig(cfg, { global: "mine", apps: { books: "mine" } });
    renameUserTheme(cfg, "mine", "yours");
    expect(readThemesConfig(cfg)).toEqual({ global: "yours", apps: { books: "yours" } });
    expect(readThemeCss(cfg, "yours")).toBe(":root{}");
    expect(readThemeCss(cfg, "mine")).toBeNull();
  });
  it("delete-while-selected falls back on read", () => {
    putUserTheme(cfg, "mine", ":root{}");
    writeThemesConfig(cfg, { global: "mine" });
    deleteUserTheme(cfg, "mine");
    expect(resolveThemeName(cfg)).toBe(DEFAULT_THEME);
  });
  it("extracts --icon-library with lucide default", () => {
    expect(extractIconLibrary(":root { --icon-library: tabler; }")).toBe("tabler");
    expect(extractIconLibrary(":root { color: red; }")).toBe("lucide");
  });
});
