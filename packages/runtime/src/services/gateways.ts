// The gateways service (spec 2026-07-10-gateways): apps consume external
// providers through a host-side door. Manifests live on disk
// (gatewayManifests.ts), connection state in the platform store
// (gatewaysStore.ts), declarations here in the app's own db
// (the secrets _secret_slots pattern) — an app's `src/gateways.ts` aliases,
// registered wholesale per successful worker boot.
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { getAppDb } from "../db.js";
import { isValidAppId } from "../registry.js";
import type { Config } from "../config.js";
import { emitLog } from "../logger.js";
import { emitGatewayChange } from "../gatewayEvents.js";
import { GatewaysError, pruneGatewayConnections } from "../gatewaysStore.js";
import { PROVIDER_ID_RE } from "../gatewayManifests.js";

export const CATALOG_NAME = "gateways";

export const ALIAS_RE = /^[a-z0-9_]+$/;

export interface UseDef {
  provider: string;
  description: string | null;
}

// ---------- declarations (per-app db) ----------

export function getUsesDb(dataDir: string, appId: string): Database.Database {
  return getAppDb(dataDir, appId);
}

function validateUseDef(alias: string, raw: unknown): UseDef {
  const r = raw as { provider?: unknown; description?: unknown } | null;
  if (!r || typeof r !== "object") throw new GatewaysError(`"${alias}" is not a gateway declaration`);
  if (typeof r.provider !== "string" || !PROVIDER_ID_RE.test(r.provider) || r.provider.length > 64) {
    throw new GatewaysError(`"${alias}" needs a valid provider id (lowercase letters, digits, dashes)`);
  }
  const description = typeof r.description === "string" && r.description.trim() ? r.description : null;
  return { provider: r.provider, description };
}

// Wholesale per successful boot (spec §5): aliases absent from the manifest
// are removed and their links/config/tokens pruned; a bad def registers with
// its error and never poisons siblings.
export function applyGatewaysManifest(cfg: Config, appId: string, uses: Record<string, unknown>, now: number): void {
  const db = getUsesDb(cfg.dataDir, appId);
  db.exec(
    `CREATE TABLE IF NOT EXISTS _gateway_uses (
      alias         TEXT PRIMARY KEY,
      def           TEXT,          -- JSON UseDef; NULL when the declaration failed
      error         TEXT,          -- per-alias declaration error (spec §5)
      registered_at INTEGER NOT NULL
    );`
  );
  const kept = new Set<string>();
  const txn = db.transaction(() => {
    for (const [alias, raw] of Object.entries(uses)) {
      if (typeof alias !== "string" || !ALIAS_RE.test(alias) || alias.length > 64) continue;
      kept.add(alias);
      let def: UseDef | null = null, error: string | null = null;
      try {
        def = validateUseDef(alias, raw);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      db.prepare(
        `INSERT INTO _gateway_uses (alias, def, error, registered_at)
         VALUES (@alias, @def, @error, @now)
         ON CONFLICT(alias) DO UPDATE SET def = excluded.def, error = excluded.error, registered_at = excluded.registered_at`
      ).run({ alias, def: def ? JSON.stringify(def) : null, error, now });
    }
    const existing = db.prepare("SELECT alias FROM _gateway_uses").all() as { alias: string }[];
    for (const { alias } of existing) {
      if (!kept.has(alias)) db.prepare("DELETE FROM _gateway_uses WHERE alias = ?").run(alias);
    }
  });
  txn();
  try {
    pruneGatewayConnections(appId, kept);
  } catch {
    // connection state lives in the platform store — if it's degraded, stale
    // rows are harmless (the engine is equally degraded) and re-pruned next boot
  }
}

// The onGatewaysManifest callback: a worker booted and reported its declared
// aliases. A load error is NOT an empty manifest — previous uses survive it.
export function registerGatewaysManifest(cfg: Config, appId: string, uses: Record<string, unknown>, loadError?: string): void {
  if (!isValidAppId(appId)) return; // _dashboard sits outside the app-id grammar
  if (loadError) {
    emitLog("error", "gateways", "gateways module failed to load", { stack: loadError }, appId);
    emitGatewayChange(appId, "*");
    return;
  }
  // Never materialize a data dir for an app that has never used gateways.
  if (Object.keys(uses).length === 0 && !fs.existsSync(path.join(cfg.dataDir, appId, "db.sqlite"))) return;
  applyGatewaysManifest(cfg, appId, uses, Date.now());
  emitGatewayChange(appId, "*"); // declarations changed — dashboard refetches
}

export function listUses(db: Database.Database): { alias: string; def: UseDef | null; error: string | null }[] {
  const hasTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_gateway_uses'").get();
  if (!hasTable) return [];
  const rows = db.prepare("SELECT alias, def, error FROM _gateway_uses ORDER BY alias").all() as
    { alias: string; def: string | null; error: string | null }[];
  return rows.map((r) => ({ alias: r.alias, def: r.def ? (JSON.parse(r.def) as UseDef) : null, error: r.error }));
}
