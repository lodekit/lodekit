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
  it("ships all five vendored theme ports", () => {
    const names = listThemes(cfg).map((t) => t.name).sort();
    expect(names).toEqual(["catppuccin", "dracula", "lodekit", "nord", "rose-pine"]);
    for (const t of listThemes(cfg)) expect(t.vendored).toBe(true);
  });
  it("every vendored port carries the full token structure both modes", () => {
    for (const name of ["catppuccin", "dracula", "lodekit", "nord", "rose-pine"]) {
      const css = readThemeCss(cfg, name)!;
      expect(css, name).toContain(":root");
      expect(css, name).toContain(".dark");
      expect(css, name).toContain("--chart-5");
      expect(css, name).toContain("--icon-library");
    }
  });
  it("ports select their stress-test icon libraries", () => {
    expect(extractIconLibrary(readThemeCss(cfg, "nord")!)).toBe("tabler");
    expect(extractIconLibrary(readThemeCss(cfg, "rose-pine")!)).toBe("phosphor");
    expect(extractIconLibrary(readThemeCss(cfg, "dracula")!)).toBe("lucide");
    expect(extractIconLibrary(readThemeCss(cfg, "catppuccin")!)).toBe("lucide");
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
  it("resolveThemeCss never throws even for a nonexistent root", () => {
    const bogus = { ...cfg, root: path.join(root, "does", "not", "exist") };
    expect(() => resolveThemeCss(bogus)).not.toThrow();
    expect(resolveThemeCss(bogus)).toContain("--icon-library");
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
  it("refuses to overwrite an existing user theme on duplicate or rename", () => {
    putUserTheme(cfg, "mine", ":root{}");
    putUserTheme(cfg, "yours", ":root{ --primary: blue; }");
    expect(() => duplicateTheme(cfg, "mine", "yours")).toThrow(ThemeError);
    expect(() => renameUserTheme(cfg, "mine", "yours")).toThrow(ThemeError);
    expect(readThemeCss(cfg, "yours")).toBe(":root{ --primary: blue; }"); // untouched
    expect(readThemeCss(cfg, "mine")).toBe(":root{}");                     // still present
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
