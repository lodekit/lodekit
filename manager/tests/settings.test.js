import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_ICON_STYLE, getIconStyle, setIconStyle } from "../src/settings.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "lodekit-settings-"));
const dirs = [];
const settingsFile = () => {
  const dir = tmp();
  dirs.push(dir);
  return path.join(dir, "settings.json");
};

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("icon style settings", () => {
  it("falls back to the default when the file is missing", () => {
    expect(getIconStyle(settingsFile())).toBe(DEFAULT_ICON_STYLE);
  });

  it("round-trips a valid style", () => {
    const file = settingsFile();
    setIconStyle(file, "c");
    expect(getIconStyle(file)).toBe("c");
  });

  it("falls back to the default when the stored value is invalid", () => {
    const file = settingsFile();
    fs.writeFileSync(file, JSON.stringify({ iconStyle: "z" }));
    expect(getIconStyle(file)).toBe(DEFAULT_ICON_STYLE);
  });

  it("falls back to the default when the file is corrupt", () => {
    const file = settingsFile();
    fs.writeFileSync(file, "not json");
    expect(getIconStyle(file)).toBe(DEFAULT_ICON_STYLE);
  });

  it("rejects an unknown style rather than persisting it", () => {
    const file = settingsFile();
    expect(() => setIconStyle(file, "z")).toThrow(/Unknown icon style/);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("preserves unrelated keys when writing", () => {
    const file = settingsFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ other: 1 }));
    setIconStyle(file, "a");
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ other: 1, iconStyle: "a" });
  });

  it("creates the settings file user-only (0600)", () => {
    const file = settingsFile();
    setIconStyle(file, "a");
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it("creates the settings directory user-only (0700)", () => {
    const dir = tmp();
    dirs.push(dir);
    const file = path.join(dir, "nested", "settings.json");
    setIconStyle(file, "a");
    expect(fs.statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
  });
});
