// The secret-store service (spec 2026-07-07-secret-store): the person's
// credentials. Person writes the catalog (dashboard/HTTP), apps declare slots
// (src/secrets.ts via the worker-boot manifest), the person links secrets to
// slots (the grant), and server-side app code reads values through the
// worker-token door. Catalog + links live in secretsStore; slot declarations
// live in the app's own db (settings' _lodekit_setting_defs pattern).
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { getAppDb } from "../db.js";
import { isValidAppId } from "../registry.js";
import type { Config } from "../config.js";
import { emitEvent, PLATFORM_NS, CHANGE_FEED_TTL_S } from "../events.js";
import { emitLog } from "../logger.js";
import { pruneLinks, SecretsError } from "../secretsStore.js";

export const CATALOG_NAME = "secret-store";
// The change feed is named for the SDK handle (spec §8), not the catalog name.
const EVENT = "secrets-change";

export const SLOT_RE = /^[a-z0-9_]+$/;

export interface SlotDef {
  label: string;
  description: string;
}

// Identity-only change feed on the bus (settings' emit pattern): platform ns
// carries { slug }, app ns carries { slot } — names only, never values.
export function emitSecretsChange(ns: string, name: string): void {
  emitEvent({
    ns,
    source: PLATFORM_NS,
    type: EVENT,
    payload: ns === PLATFORM_NS ? { slug: name } : { slot: name },
    ttl: CHANGE_FEED_TTL_S,
  });
}

// ---------- slot declarations (per-app db) ----------

const ensured = new WeakSet<Database.Database>();

export function getSlotsDb(dataDir: string, appId: string): Database.Database {
  const db = getAppDb(dataDir, appId);
  if (!ensured.has(db)) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS _lodekit_secret_slots (
        slot          TEXT PRIMARY KEY,
        def           TEXT,          -- JSON SlotDef; NULL when the declaration failed
        error         TEXT,          -- per-slot declaration error (spec §5)
        registered_at INTEGER NOT NULL
      );`
    );
    ensured.add(db);
  }
  return db;
}

function validateSlotDef(slot: string, raw: unknown): SlotDef {
  const r = raw as Partial<SlotDef> | null;
  if (!r || typeof r !== "object") throw new SecretsError(`"${slot}" is not a slot definition`);
  if (typeof r.label !== "string" || !r.label.trim()) throw new SecretsError(`"${slot}" needs a label`);
  if (typeof r.description !== "string" || !r.description.trim()) throw new SecretsError(`"${slot}" needs a description`);
  return { label: r.label, description: r.description };
}

// Wholesale per successful boot (spec §5): slots absent from the manifest are
// removed and their links pruned; a bad slot registers with its error and
// never poisons siblings.
export function applySecretsManifest(cfg: Config, appId: string, slots: Record<string, unknown>, now: number): void {
  const db = getSlotsDb(cfg.dataDir, appId);
  const kept = new Set<string>();
  const txn = db.transaction(() => {
    for (const [slot, raw] of Object.entries(slots)) {
      if (typeof slot !== "string" || !SLOT_RE.test(slot) || slot.length > 64) continue;
      kept.add(slot);
      let def: SlotDef | null = null, error: string | null = null;
      try {
        def = validateSlotDef(slot, raw);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      db.prepare(
        `INSERT INTO _lodekit_secret_slots (slot, def, error, registered_at)
         VALUES (@slot, @def, @error, @now)
         ON CONFLICT(slot) DO UPDATE SET def = excluded.def, error = excluded.error, registered_at = excluded.registered_at`
      ).run({ slot, def: def ? JSON.stringify(def) : null, error, now });
    }
    const existing = db.prepare("SELECT slot FROM _lodekit_secret_slots").all() as { slot: string }[];
    for (const { slot } of existing) {
      if (!kept.has(slot)) db.prepare("DELETE FROM _lodekit_secret_slots WHERE slot = ?").run(slot);
    }
  });
  txn();
  try {
    pruneLinks(appId, kept);
  } catch {
    // links live in the platform store — if it's degraded, stale links are
    // harmless (readValue is equally degraded) and re-pruned next boot
  }
}

// The onSecretsManifest callback: a worker booted and reported its declared
// slots. A load error is NOT an empty manifest — previous slots survive it.
export function registerSecretsManifest(cfg: Config, appId: string, slots: Record<string, unknown>, loadError?: string): void {
  if (!isValidAppId(appId)) return; // _dashboard sits outside the app-id grammar
  if (loadError) {
    emitLog("error", "secrets", "secrets module failed to load", { stack: loadError }, appId);
    emitSecretsChange(appId, "*");
    return;
  }
  // Never materialize a data dir for an app that has never used secrets.
  if (Object.keys(slots).length === 0 && !fs.existsSync(path.join(cfg.dataDir, appId, "db.sqlite"))) return;
  applySecretsManifest(cfg, appId, slots, Date.now());
  emitSecretsChange(appId, "*"); // slots changed — dashboard refetches
}

export function listSlots(db: Database.Database): { slot: string; def: SlotDef | null; error: string | null }[] {
  const rows = db.prepare("SELECT slot, def, error FROM _lodekit_secret_slots ORDER BY slot").all() as
    { slot: string; def: string | null; error: string | null }[];
  return rows.map((r) => ({ slot: r.slot, def: r.def ? (JSON.parse(r.def) as SlotDef) : null, error: r.error }));
}
