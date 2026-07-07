// The settings service (spec 2026-07-07-settings-design.md): the person's knobs.
// Person writes (dashboard/HTTP), apps read+watch their own declared settings,
// services resolve effective values internally. Values live in the Backup tree:
// app settings + per-app overrides in the app's db, platform values in
// data/_platform/settings.sqlite (eventStore's singleton pattern).
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import BetterSqlite3 from "better-sqlite3";
import { getAppDb } from "../db.js";
import { isValidAppId, scanApps } from "../registry.js";
import type { Config } from "../config.js";
import { parseDuration } from "../duration.js";
import { validateFieldDef, validateValue, APP_KEY_RE, type SettingField } from "../settingsSchema.js";
import { PLATFORM_SETTINGS, PLATFORM_KEY_RE } from "../platformSettings.js";

export const CATALOG_NAME = "settings";

/** Validation/semantic error — mapped to HTTP 400 by the router. */
export class SettingsError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "SettingsError";
  }
}

// ---------- per-app storage (defs + values) ----------

const ensured = new WeakSet<Database.Database>();

export function getSettingsDb(dataDir: string, appId: string): Database.Database {
  const db = getAppDb(dataDir, appId);
  if (!ensured.has(db)) {
    ensureSchema(db);
    ensured.add(db);
  }
  return db;
}

export function ensureSchema(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS _lodekit_setting_defs (
      key           TEXT PRIMARY KEY,
      field         TEXT,          -- JSON SettingField; NULL when the declaration failed
      error         TEXT,          -- per-field declaration error (spec §5)
      registered_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS _lodekit_setting_values (
      key        TEXT PRIMARY KEY, -- bare = app setting, dotted = service override
      value      TEXT NOT NULL,    -- JSON
      updated_at INTEGER NOT NULL
    );`
  );
}

// Wholesale per successful boot (spec §5): defs absent from the manifest are
// removed and their stored values pruned; a bad field registers with its error
// and never poisons siblings. Dotted (override) values are not the manifest's.
export function applySettingsManifest(db: Database.Database, fields: Record<string, unknown>, now: number): void {
  const txn = db.transaction(() => {
    const keys = new Set<string>();
    for (const [key, raw] of Object.entries(fields)) {
      if (typeof key !== "string" || !APP_KEY_RE.test(key) || key.length > 64) continue;
      keys.add(key);
      let field: SettingField | null = null, error: string | null = null;
      try {
        field = validateFieldDef(key, raw);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      db.prepare(
        `INSERT INTO _lodekit_setting_defs (key, field, error, registered_at)
         VALUES (@key, @field, @error, @now)
         ON CONFLICT(key) DO UPDATE SET field = excluded.field, error = excluded.error, registered_at = excluded.registered_at`
      ).run({ key, field: field ? JSON.stringify(field) : null, error, now });
    }
    const existing = db.prepare("SELECT key FROM _lodekit_setting_defs").all() as { key: string }[];
    for (const { key } of existing) {
      if (keys.has(key)) continue;
      db.prepare("DELETE FROM _lodekit_setting_defs WHERE key = ?").run(key);
      db.prepare("DELETE FROM _lodekit_setting_values WHERE key = ?").run(key);
    }
  });
  txn();
  invalidateSettingsCache();
}

export function listAppDefs(db: Database.Database): { key: string; field: SettingField | null; error: string | null }[] {
  const rows = db.prepare("SELECT key, field, error FROM _lodekit_setting_defs ORDER BY key").all() as
    { key: string; field: string | null; error: string | null }[];
  return rows.map((r) => ({ key: r.key, field: r.field ? (JSON.parse(r.field) as SettingField) : null, error: r.error }));
}

export function getAppDef(db: Database.Database, key: string): { field: SettingField | null; error: string | null } | undefined {
  const r = db.prepare("SELECT field, error FROM _lodekit_setting_defs WHERE key = ?").get(key) as
    { field: string | null; error: string | null } | undefined;
  return r ? { field: r.field ? (JSON.parse(r.field) as SettingField) : null, error: r.error } : undefined;
}

export function getValue(db: Database.Database, key: string): unknown {
  const r = db.prepare("SELECT value FROM _lodekit_setting_values WHERE key = ?").get(key) as { value: string } | undefined;
  return r === undefined ? undefined : (JSON.parse(r.value) as unknown);
}

export function setValue(db: Database.Database, key: string, value: unknown): void {
  db.prepare(
    `INSERT INTO _lodekit_setting_values (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(value), Date.now());
  invalidateSettingsCache();
}

export function deleteValue(db: Database.Database, key: string): void {
  db.prepare("DELETE FROM _lodekit_setting_values WHERE key = ?").run(key);
  invalidateSettingsCache();
}

// ---------- platform value store (single-writer singleton, eventStore pattern) ----------

let platformDb: Database.Database | null = null;
let dataDirRef: string | null = null;

// Opens (creating if needed) <dataDir>/_platform/settings.sqlite — the person's
// knobs live in the Backup tree (precious). Degrades to defaults-only when it
// can't open — the runtime must still boot; writes then fail loudly (routes 500).
export function initSettingsStore(dataDir: string): boolean {
  platformDb?.close();
  platformDb = null;
  dataDirRef = dataDir;
  invalidateSettingsCache();
  try {
    const dir = path.join(dataDir, "_platform");
    fs.mkdirSync(dir, { recursive: true });
    platformDb = new BetterSqlite3(path.join(dir, "settings.sqlite"));
    platformDb.pragma("journal_mode = WAL");
    platformDb.exec(
      `CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );`
    );
    return true;
  } catch (e) {
    platformDb = null;
    process.stderr.write(`[settings] settings.sqlite unavailable — defaults only: ${e}\n`);
    return false;
  }
}

export function closeSettingsStoreForTest(): void {
  platformDb?.close();
  platformDb = null;
  dataDirRef = null;
  invalidateSettingsCache();
  writeCbs.clear();
}

export function getPlatformValue(key: string): unknown {
  if (!platformDb) return undefined;
  const r = platformDb.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return r === undefined ? undefined : (JSON.parse(r.value) as unknown);
}

export function setPlatformValue(key: string, value: unknown): void {
  if (!platformDb) throw new SettingsError("settings store unavailable");
  platformDb.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(value), Date.now());
  invalidateSettingsCache();
}

export function deletePlatformValue(key: string): void {
  if (!platformDb) throw new SettingsError("settings store unavailable");
  platformDb.prepare("DELETE FROM settings WHERE key = ?").run(key);
  invalidateSettingsCache();
}

// ---------- effective resolution (spec §7) ----------

// app override → platform value → catalog default; every stored value is
// re-validated on read, so schema drift silently yields the default.
const cache = new Map<string, unknown>();

export function invalidateSettingsCache(): void {
  cache.clear();
}

export function getEffective(key: string, appId?: string): unknown {
  const setting = PLATFORM_SETTINGS[key];
  if (!setting || !PLATFORM_KEY_RE.test(key)) throw new SettingsError(`unknown setting "${key}"`);
  const scopedApp = setting.scope === "per-app" && appId && isValidAppId(appId) ? appId : undefined;
  const cacheKey = `${scopedApp ?? ""}:${key}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  let resolved: unknown = setting.field.default;
  const platform = getPlatformValue(key);
  if (platform !== undefined) {
    try { resolved = validateValue(setting.field, platform); } catch { /* drift → keep default */ }
  }
  if (scopedApp && dataDirRef) {
    const override = getValue(getSettingsDb(dataDirRef, scopedApp), key);
    if (override !== undefined) {
      try { resolved = validateValue(setting.field, override); } catch { /* drift → keep platform/default */ }
    }
  }
  cache.set(cacheKey, resolved);
  return resolved;
}

export const effectiveMs = (key: string, appId?: string): number => parseDuration(getEffective(key, appId) as string);
export const effectiveNumber = (key: string, appId?: string): number => getEffective(key, appId) as number;
export const effectiveString = (key: string, appId?: string): string => getEffective(key, appId) as string;
export const effectiveBoolean = (key: string, appId?: string): boolean => getEffective(key, appId) as boolean;

// ---------- write hook (server.ts re-arms loops; manager/theme ride SSE instead) ----------

const writeCbs = new Set<(key: string, appId?: string) => void>();

export function onSettingsWrite(cb: (key: string, appId?: string) => void): void {
  writeCbs.add(cb);
}

export function notifySettingsWrite(key: string, appId?: string): void {
  for (const cb of writeCbs) cb(key, appId);
}

// Valid explicit per-app overrides of one key across the apps on disk — the
// retention sweeps' input (recoverInterruptedRuns' scan pattern). Global-scope
// keys have no overrides by definition.
export function collectAppOverrides(cfg: Config, key: string): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const setting = PLATFORM_SETTINGS[key];
  if (!setting || setting.scope !== "per-app") return out;
  for (const app of scanApps(cfg.appsDir)) {
    if (!fs.existsSync(path.join(cfg.dataDir, app.appId, "db.sqlite"))) continue;
    const v = getValue(getSettingsDb(cfg.dataDir, app.appId), key);
    if (v === undefined) continue;
    try { out.set(app.appId, validateValue(setting.field, v)); } catch { /* drifted override — skip */ }
  }
  return out;
}
