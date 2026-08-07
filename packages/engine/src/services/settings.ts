// The settings service (spec 2026-07-07-settings-design.md): the person's knobs.
// Person writes (dashboard/HTTP), apps read+watch their own declared settings,
// services resolve effective values internally. Values live in the Backup tree:
// app settings + per-app overrides in the app's db, platform values in
// data/_platform/settings.sqlite (eventStore's singleton pattern).
import fs from "node:fs";
import path from "node:path";
import { Hono, type MiddlewareHandler } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getAppDb } from "../db.js";
import { isValidAppId, scanApps } from "../registry.js";
import type { Config } from "../config.js";
import { parseDuration } from "../duration.js";
import { validateFieldDef, validateValue, APP_KEY_RE, type SettingField } from "../settingsSchema.js";
import { PLATFORM_SETTINGS, PLATFORM_KEY_RE } from "../platformSettings.js";
import { validationHook } from "../validation.js";
import { emitEvent, CHANGE_FEED_TTL_S } from "../events.js";
import { emitLog } from "../logger.js";
import { openManagedDb, type ManagedDb } from "../sqlite.js";
import { SETTINGS_CHAIN } from "../migrations/platform.js";

export const CATALOG_NAME = "settings";

/** Validation/semantic error — mapped to HTTP 400 by the router. */
export class SettingsError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "SettingsError";
  }
}

/** Unknown-key error — mapped to HTTP 404 by the router (spec §7). */
export class SettingsNotFoundError extends SettingsError {
  constructor(message?: string) {
    super(message);
    this.name = "SettingsNotFoundError";
  }
}

// ---------- per-app storage (defs + values) ----------

export function getSettingsDb(dataDir: string, appId: string): ManagedDb {
  return getAppDb(dataDir, appId);
}

// Wholesale per successful boot (spec §5): defs absent from the manifest are
// removed and their stored values pruned; a bad field registers with its error
// and never poisons siblings. Dotted (override) values are not the manifest's.
export function applySettingsManifest(db: ManagedDb, fields: Record<string, unknown>, now: number): void {
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
        `INSERT INTO _setting_defs (key, field, error, registered_at)
         VALUES (@key, @field, @error, @now)
         ON CONFLICT(key) DO UPDATE SET field = excluded.field, error = excluded.error, registered_at = excluded.registered_at`
      ).run({ key, field: field ? JSON.stringify(field) : null, error, now });
    }
    const existing = db.prepare("SELECT key FROM _setting_defs").all() as { key: string }[];
    for (const { key } of existing) {
      if (keys.has(key)) continue;
      db.prepare("DELETE FROM _setting_defs WHERE key = ?").run(key);
      db.prepare("DELETE FROM _setting_values WHERE key = ?").run(key);
    }
  });
  txn();
  invalidateSettingsCache();
}

// The onSettingsManifest callback: a worker booted and reported its declared
// settings. A load error is NOT an empty manifest — previous defs survive it.
export function registerSettingsManifest(cfg: Config, appId: string, fields: Record<string, unknown>, loadError?: string): void {
  if (!isValidAppId(appId)) return; // _dashboard sits outside the app-id grammar
  if (loadError) {
    emitLog("error", "settings", "settings module failed to load", { stack: loadError }, appId);
    emitSettingsEvent(appId, "defs-changed");
    return;
  }
  // Never materialize a data dir for an app that has never used settings.
  if (Object.keys(fields).length === 0 && !fs.existsSync(path.join(cfg.dataDir, appId, "db.sqlite"))) return;
  applySettingsManifest(getSettingsDb(cfg.dataDir, appId), fields, Date.now());
  emitSettingsEvent(appId, "defs-changed"); // defs changed — dashboard refetches
}

export function listAppDefs(db: ManagedDb): { key: string; field: SettingField | null; error: string | null }[] {
  const rows = db.prepare("SELECT key, field, error FROM _setting_defs ORDER BY key").all() as
    { key: string; field: string | null; error: string | null }[];
  return rows.map((r) => ({ key: r.key, field: r.field ? (JSON.parse(r.field) as SettingField) : null, error: r.error }));
}

export function getAppDef(db: ManagedDb, key: string): { field: SettingField | null; error: string | null } | undefined {
  const r = db.prepare("SELECT field, error FROM _setting_defs WHERE key = ?").get(key) as
    { field: string | null; error: string | null } | undefined;
  return r ? { field: r.field ? (JSON.parse(r.field) as SettingField) : null, error: r.error } : undefined;
}

export function getValue(db: ManagedDb, key: string): unknown {
  const r = db.prepare("SELECT value FROM _setting_values WHERE key = ?").get(key) as { value: string } | undefined;
  return r === undefined ? undefined : (JSON.parse(r.value) as unknown);
}

export function setValue(db: ManagedDb, key: string, value: unknown): void {
  db.prepare(
    `INSERT INTO _setting_values (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(value), Date.now());
  invalidateSettingsCache();
}

export function deleteValue(db: ManagedDb, key: string): void {
  db.prepare("DELETE FROM _setting_values WHERE key = ?").run(key);
  invalidateSettingsCache();
}

// ---------- platform value store (single-writer singleton, eventStore pattern) ----------

let platformDb: ManagedDb | null = null;
let dataDirRef: string | null = null;

// Opens (creating if needed) <dataDir>/_platform/settings.sqlite — the person's
// knobs live in the Backup tree (precious). Degrades to defaults-only when it
// can't open — the engine must still boot; writes then fail loudly (routes 500).
export function initSettingsStore(dataDir: string): boolean {
  platformDb?.close();
  platformDb = null;
  dataDirRef = dataDir;
  invalidateSettingsCache();
  try {
    platformDb = openManagedDb(path.join(dataDir, "_platform", "settings.sqlite"), { chain: SETTINGS_CHAIN });
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
  // Not a client error — an internal fault (routes 500, per initSettingsStore's promise).
  if (!platformDb) throw new Error("settings store unavailable");
  platformDb.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(value), Date.now());
  invalidateSettingsCache();
}

export function deletePlatformValue(key: string): void {
  if (!platformDb) throw new Error("settings store unavailable");
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
  if (scopedApp && dataDirRef && fs.existsSync(path.join(dataDirRef, scopedApp, "db.sqlite"))) {
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

// ---------- HTTP surface (spec §7) ----------

// Identity-only facts on the bus (spec §4): the write verb is the type, the key is
// the payload; a defs reload is its own fact ("refetch"), not a magic key.
export function emitSettingsEvent(app: string | null, type: "value-set" | "value-cleared" | "defs-changed", key?: string): void {
  emitEvent({ app, kind: "service", component: CATALOG_NAME, type, payload: key ? { key } : undefined, ttl: CHANGE_FEED_TTL_S });
}

const keyParam = z.object({ key: z.string().regex(/^[a-z0-9_.]+$/).max(128) });
const hasValue = { message: "missing value" };
const valueBody = z.object({ value: z.unknown() }).refine((b) => "value" in b, hasValue);

// drifted = a stored value no longer validates (schema drift) — the default is
// in effect and the dashboard shows a notice (spec §7); any edit clears it.
function isDrifted(field: SettingField, stored: unknown): boolean {
  if (stored === undefined || stored === null) return false;
  try { validateValue(field, stored); return false; } catch { return true; }
}

const toPlatformEntry = (key: string) => {
  const s = PLATFORM_SETTINGS[key];
  const value = getPlatformValue(key) ?? null;
  return {
    key,
    section: s.section,
    scope: s.scope,
    advanced: s.field.advanced ?? false,
    field: s.field,
    value,
    effective: getEffective(key),
    drifted: isDrifted(s.field, value),
  };
};

export const platformSettingsRoutes = new Hono()
  .onError((err, c) => c.json({ error: err instanceof Error ? err.message : String(err) }, err instanceof SettingsError ? 400 : 500))
  .get("/", (c) => c.json({ settings: Object.keys(PLATFORM_SETTINGS).map(toPlatformEntry) }))
  .put("/:key", zValidator("param", keyParam, validationHook), zValidator("json", valueBody, validationHook), (c) => {
    const { key } = c.req.valid("param");
    const setting = PLATFORM_SETTINGS[key];
    if (!setting) return c.json({ error: `unknown setting "${key}"` }, 404);
    let value;
    try {
      value = validateValue(setting.field, c.req.valid("json").value);
    } catch (e) {
      throw new SettingsError(`${key}: ${e instanceof Error ? e.message : String(e)}`);
    }
    setPlatformValue(key, value);
    notifySettingsWrite(key);
    emitSettingsEvent(null, "value-set", key);
    return c.json({ ok: true as const });
  })
  .delete("/:key", zValidator("param", keyParam, validationHook), (c) => {
    const { key } = c.req.valid("param");
    if (!PLATFORM_SETTINGS[key]) return c.json({ error: `unknown setting "${key}"` }, 404);
    deletePlatformValue(key);
    notifySettingsWrite(key);
    emitSettingsEvent(null, "value-cleared", key);
    return c.json({ ok: true as const });
  });

export type PlatformSettingsRoutes = typeof platformSettingsRoutes;

export type SettingsEnv = { Variables: { settingsDb: ManagedDb; appId: string } };

export function withSettings(cfg: Config): MiddlewareHandler<SettingsEnv> {
  return async (c, next) => {
    const appId = c.req.param("appId");
    if (!appId || !isValidAppId(appId)) return c.json({ error: "invalid app id" }, 400);
    c.set("settingsDb", getSettingsDb(cfg.dataDir, appId));
    c.set("appId", appId);
    await next();
  };
}

// The effective value of one declared setting (the SDK read path).
function readDeclared(db: ManagedDb, key: string): { found: boolean; value?: unknown } {
  const def = getAppDef(db, key);
  if (!def || !def.field) return { found: false };
  const stored = getValue(db, key);
  if (stored !== undefined) {
    try { return { found: true, value: validateValue(def.field, stored) }; } catch { /* drift */ }
  }
  return { found: true, value: def.field.default };
}

export const settingsRoutes = new Hono<SettingsEnv>()
  .onError((err, c) => c.json(
    { error: err instanceof Error ? err.message : String(err) },
    err instanceof SettingsNotFoundError ? 404 : err instanceof SettingsError ? 400 : 500
  ))
  .get("/", (c) => {
    const db = c.var.settingsDb;
    const declared = listAppDefs(db).map((d) => {
      const value = getValue(db, d.key) ?? null;
      return {
        key: d.key,
        field: d.field,
        error: d.error,
        value,
        effective: d.field ? readDeclared(db, d.key).value : null,
        drifted: d.field ? isDrifted(d.field, value) : false,
      };
    });
    const overrides = Object.entries(PLATFORM_SETTINGS)
      .filter(([, s]) => s.scope === "per-app")
      .map(([key, s]) => ({
        key,
        section: s.section,
        advanced: s.field.advanced ?? false,
        field: s.field,
        platformEffective: getEffective(key),
        override: getValue(db, key) ?? null,
      }));
    return c.json({ declared, overrides });
  })
  .get("/:key", zValidator("param", keyParam, validationHook), (c) => {
    return c.json(readDeclared(c.var.settingsDb, c.req.valid("param").key));
  })
  .put("/:key", zValidator("param", keyParam, validationHook), zValidator("json", valueBody, validationHook), (c) => {
    const { key } = c.req.valid("param");
    const raw = c.req.valid("json").value;
    const field = fieldForAppWrite(c.var.settingsDb, key);
    let value;
    try {
      value = validateValue(field, raw);
    } catch (e) {
      throw new SettingsError(`${key}: ${e instanceof Error ? e.message : String(e)}`);
    }
    setValue(c.var.settingsDb, key, value);
    notifySettingsWrite(key, c.var.appId);
    emitSettingsEvent(c.var.appId, "value-set", key);
    return c.json({ ok: true as const });
  })
  .delete("/:key", zValidator("param", keyParam, validationHook), (c) => {
    const { key } = c.req.valid("param");
    fieldForAppWrite(c.var.settingsDb, key); // 404 on unknown, 400 on global — deletes are gated like writes
    deleteValue(c.var.settingsDb, key);
    notifySettingsWrite(key, c.var.appId);
    emitSettingsEvent(c.var.appId, "value-cleared", key);
    return c.json({ ok: true as const });
  });

// Bare key → the app's declared field; dotted key → a per-app platform setting.
function fieldForAppWrite(db: ManagedDb, key: string): SettingField {
  if (key.includes(".")) {
    const s = PLATFORM_SETTINGS[key];
    if (!s) throw new SettingsNotFoundError(`unknown setting "${key}"`);
    if (s.scope !== "per-app") throw new SettingsError(`"${key}" applies to all apps and cannot be overridden`);
    return s.field;
  }
  const def = getAppDef(db, key);
  if (!def) throw new SettingsNotFoundError(`unknown setting "${key}"`);
  if (!def.field) throw new SettingsError(`"${key}" has a declaration error: ${def.error}`);
  return def.field;
}

export type SettingsRoutes = typeof settingsRoutes;
