import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getSettingsDb, initSettingsStore, closeSettingsStoreForTest, applySettingsManifest, listAppDefs,
  getValue, setValue, deleteValue, setPlatformValue, deletePlatformValue,
  getEffective, effectiveMs, effectiveNumber, invalidateSettingsCache, collectAppOverrides,
} from "../src/services/settings.js";
import type { Config } from "../src/config.js";

let root: string, cfg: Config;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-settings-"));
  cfg = {
    root, appsDir: path.join(root, "apps"), dataDir: path.join(root, "data"),
    cacheDir: path.join(root, ".cache"), stateDir: path.join(root, ".state"),
    port: 0, baseUrl: "http://lodekit.localhost:0",
  };
  initSettingsStore(cfg.dataDir);
});
afterEach(() => {
  closeSettingsStoreForTest();
  fs.rmSync(root, { recursive: true, force: true });
});

const FIELDS = {
  show_archived: { type: "boolean", label: "Show archived", description: "Include archived items.", default: false },
  refresh_every: { type: "duration", label: "Refresh", description: "Background refresh interval.", default: "15m", min: "1m" },
  bad_one: { type: "number", label: "Broken", description: "Missing default." }, // no default → per-field error
};

describe("app settings storage", () => {
  it("applies a manifest wholesale: valid defs register, bad fields carry errors, siblings unaffected", () => {
    const db = getSettingsDb(cfg.dataDir, "app");
    applySettingsManifest(db, FIELDS, 1000);
    const defs = Object.fromEntries(listAppDefs(db).map((d) => [d.key, d]));
    expect(defs.show_archived.field?.type).toBe("boolean");
    expect(defs.refresh_every.error).toBeNull();
    expect(defs.bad_one.field).toBeNull();
    expect(defs.bad_one.error).toMatch(/default/);
  });

  it("prunes removed defs and their values; keeps dotted override rows", () => {
    const db = getSettingsDb(cfg.dataDir, "app");
    applySettingsManifest(db, FIELDS, 1000);
    setValue(db, "show_archived", true);
    setValue(db, "tasks.default_retries", 5); // an override row — not app-declared
    applySettingsManifest(db, { refresh_every: FIELDS.refresh_every }, 2000);
    expect(listAppDefs(db).map((d) => d.key)).toEqual(["refresh_every"]);
    expect(getValue(db, "show_archived")).toBeUndefined();
    expect(getValue(db, "tasks.default_retries")).toBe(5);
  });

  it("set/delete round-trips JSON values", () => {
    const db = getSettingsDb(cfg.dataDir, "app");
    setValue(db, "k", "v");
    expect(getValue(db, "k")).toBe("v");
    deleteValue(db, "k");
    expect(getValue(db, "k")).toBeUndefined();
  });
});

describe("effective resolution", () => {
  it("resolves override → platform value → catalog default", () => {
    expect(getEffective("tasks.default_retries")).toBe(3); // catalog default
    setPlatformValue("tasks.default_retries", 5);
    expect(getEffective("tasks.default_retries")).toBe(5);
    expect(getEffective("tasks.default_retries", "app")).toBe(5); // no override yet
    const db = getSettingsDb(cfg.dataDir, "app");
    setValue(db, "tasks.default_retries", 1);
    invalidateSettingsCache();
    expect(getEffective("tasks.default_retries", "app")).toBe(1);
    deletePlatformValue("tasks.default_retries");
    invalidateSettingsCache();
    expect(getEffective("tasks.default_retries")).toBe(3);
    expect(getEffective("tasks.default_retries", "app")).toBe(1); // override survives platform reset
  });

  it("global-scope keys ignore app overrides; invalid appIds fall back to platform", () => {
    const db = getSettingsDb(cfg.dataDir, "app");
    setValue(db, "tasks.dispatch_poll", "5s"); // stored but meaningless — global scope
    invalidateSettingsCache();
    expect(getEffective("tasks.dispatch_poll", "app")).toBe("1s");
    expect(getEffective("hosting.request_timeout", "_dashboard")).toBe("30s"); // outside app grammar
  });

  it("schema drift: a stored value that no longer validates yields the default", () => {
    setPlatformValue("appearance.theme", "dark");
    expect(getEffective("appearance.theme")).toBe("dark");
    // simulate drift by writing a raw invalid value through the storage door
    setPlatformValue("appearance.theme", "sepia" as never);
    invalidateSettingsCache();
    expect(getEffective("appearance.theme")).toBe("system");
  });

  it("typed helpers convert; unknown platform keys throw", () => {
    expect(effectiveMs("tasks.default_timeout")).toBe(300_000);
    expect(effectiveNumber("tasks.default_retries")).toBe(3);
    expect(() => getEffective("nope.nope")).toThrow(/unknown setting/);
  });
});

describe("collectAppOverrides", () => {
  it("finds valid explicit overrides across apps on disk", () => {
    fs.mkdirSync(path.join(cfg.appsDir, "app"), { recursive: true });
    fs.writeFileSync(path.join(cfg.appsDir, "app", "manifest.json"), JSON.stringify({ name: "App", appId: "app" }));
    const db = getSettingsDb(cfg.dataDir, "app");
    setValue(db, "logs.retention_age", "2d");
    const m = collectAppOverrides(cfg, "logs.retention_age");
    expect(m.get("app")).toBe("2d");
    expect(collectAppOverrides(cfg, "logs.sweep_interval").size).toBe(0); // global scope → never collected
  });
});
