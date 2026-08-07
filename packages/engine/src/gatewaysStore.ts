// The gateways platform store (spec 2026-07-10-gateways §8): connection state
// in data/_platform/gateways.sqlite — `links` is the secrets links shape one
// level deeper (per alias), `config_values` holds plain per-connection values,
// `oauth_tokens` holds AES-256-GCM ciphertext over the token JSON (the
// secret-store key-provider rail — same master key, same degraded-mode rule).
// Gateway manifests live on disk (gatewayManifests.ts); declarations live in
// each app's own db (services/gateways.ts). Breaker/bucket state is in-memory
// only (gatewayExecutor.ts) — a restart forgives.
import path from "node:path";
import type { Config } from "./config.js";
import {
  encryptValue, decryptValue, getSecretMeta, SecretsUnavailableError,
} from "./secretsStore.js";
import { getMasterKey } from "./keyProvider.js";
import { openManagedDb, type ManagedDb } from "./sqlite.js";
import { GATEWAYS_CHAIN } from "./migrations/platform.js";

/** Validation/semantic error — mapped to HTTP 400 by the router. */
export class GatewaysError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "GatewaysError";
  }
}

/** Unknown alias/slot/slug/provider — mapped to HTTP 404 by the router. */
export class GatewaysNotFoundError extends GatewaysError {
  constructor(message?: string) {
    super(message);
    this.name = "GatewaysNotFoundError";
  }
}

export const CONFIG_VALUE_MAX_BYTES = 4096;

export interface OauthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms
}

let db: ManagedDb | null = null;
let cfgRef: Config | null = null;
let masterKey: Buffer | null = null;

export function initGatewaysStore(cfg: Config): boolean {
  db?.close();
  db = null;
  masterKey = null;
  cfgRef = cfg;
  try {
    db = openManagedDb(path.join(cfg.dataDir, "_platform", "gateways.sqlite"), { chain: GATEWAYS_CHAIN });
    return true;
  } catch (e) {
    db = null;
    process.stderr.write(`[gateways] gateways.sqlite unavailable — gateways degraded: ${e}\n`);
    return false;
  }
}

export function closeGatewaysStoreForTest(): void {
  db?.close();
  db = null;
  cfgRef = null;
  masterKey = null;
}

function store(): ManagedDb {
  if (!db) throw new SecretsUnavailableError("gateways store unavailable");
  return db;
}

// The secret-store master key encrypts OAuth tokens too — one key, one
// Keychain item, one degraded-mode story (spec §7).
function key(): Buffer {
  if (!masterKey) {
    if (!cfgRef) throw new SecretsUnavailableError("gateways store unavailable");
    masterKey = getMasterKey(cfgRef);
  }
  return masterKey;
}

// ---------- secret-slot links (the grant, spec §3/§8) ----------

export function setGatewayLink(appId: string, alias: string, slot: string, slug: string): void {
  if (!getSecretMeta(slug)) throw new GatewaysNotFoundError(`unknown secret "${slug}"`);
  store()
    .prepare(
      `INSERT INTO links (app_id, alias, slot, slug, linked_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(app_id, alias, slot) DO UPDATE SET slug = excluded.slug, linked_at = excluded.linked_at`
    )
    .run(appId, alias, slot, slug, Date.now());
}

export function deleteGatewayLink(appId: string, alias: string, slot: string): boolean {
  return store().prepare("DELETE FROM links WHERE app_id = ? AND alias = ? AND slot = ?").run(appId, alias, slot).changes > 0;
}

/** Soft reference: the linked secret may since have been deleted from the
 *  catalog — that reads as undefined, i.e. the slot is pending again. */
export function getGatewayLink(appId: string, alias: string, slot: string): { slug: string; label: string } | undefined {
  const row = store()
    .prepare("SELECT slug FROM links WHERE app_id = ? AND alias = ? AND slot = ?")
    .get(appId, alias, slot) as { slug: string } | undefined;
  if (!row) return undefined;
  const meta = getSecretMeta(row.slug);
  return meta ? { slug: meta.slug, label: meta.label } : undefined;
}

// ---------- config values (plain, spec §8) ----------

export function setGatewayConfig(appId: string, alias: string, slot: string, value: string): void {
  if (typeof value !== "string" || value.length === 0) throw new GatewaysError("value must be a non-empty string");
  if (Buffer.byteLength(value, "utf8") > CONFIG_VALUE_MAX_BYTES) {
    throw new GatewaysError(`value exceeds ${CONFIG_VALUE_MAX_BYTES} bytes`);
  }
  store()
    .prepare(
      `INSERT INTO config_values (app_id, alias, slot, value, set_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(app_id, alias, slot) DO UPDATE SET value = excluded.value, set_at = excluded.set_at`
    )
    .run(appId, alias, slot, value, Date.now());
}

export function deleteGatewayConfig(appId: string, alias: string, slot: string): boolean {
  return store().prepare("DELETE FROM config_values WHERE app_id = ? AND alias = ? AND slot = ?").run(appId, alias, slot).changes > 0;
}

export function getGatewayConfig(appId: string, alias: string, slot: string): string | undefined {
  const row = store()
    .prepare("SELECT value FROM config_values WHERE app_id = ? AND alias = ? AND slot = ?")
    .get(appId, alias, slot) as { value: string } | undefined;
  return row?.value;
}

// ---------- oauth tokens (encrypted at rest, spec §7) ----------

export function saveOauthTokens(appId: string, alias: string, t: OauthTokens): void {
  const { ciphertext, nonce } = encryptValue(key(), JSON.stringify(t));
  store()
    .prepare(
      `INSERT INTO oauth_tokens (app_id, alias, ciphertext, nonce, needs_reauth, updated_at)
       VALUES (?, ?, ?, ?, 0, ?)
       ON CONFLICT(app_id, alias) DO UPDATE SET
         ciphertext = excluded.ciphertext, nonce = excluded.nonce,
         needs_reauth = 0, updated_at = excluded.updated_at`
    )
    .run(appId, alias, ciphertext, nonce, Date.now());
}

export function loadOauthTokens(appId: string, alias: string): OauthTokens | undefined {
  const row = store()
    .prepare("SELECT ciphertext, nonce FROM oauth_tokens WHERE app_id = ? AND alias = ?")
    .get(appId, alias) as { ciphertext: Buffer; nonce: Buffer } | undefined;
  if (!row) return undefined;
  return JSON.parse(decryptValue(key(), row.ciphertext, row.nonce)) as OauthTokens;
}

export function deleteOauthTokens(appId: string, alias: string): boolean {
  return store().prepare("DELETE FROM oauth_tokens WHERE app_id = ? AND alias = ?").run(appId, alias).changes > 0;
}

export function setNeedsReauth(appId: string, alias: string, on: boolean): void {
  store().prepare("UPDATE oauth_tokens SET needs_reauth = ? WHERE app_id = ? AND alias = ?").run(on ? 1 : 0, appId, alias);
}

export function oauthState(appId: string, alias: string): "none" | "connected" | "needs_reauth" {
  const row = store()
    .prepare("SELECT needs_reauth FROM oauth_tokens WHERE app_id = ? AND alias = ?")
    .get(appId, alias) as { needs_reauth: number } | undefined;
  if (!row) return "none";
  return row.needs_reauth ? "needs_reauth" : "connected";
}

// ---------- wholesale-registration cleanup (spec §5) ----------

export function pruneGatewayConnections(appId: string, keptAliases: Set<string>): void {
  const s = store();
  const aliases = new Set<string>();
  for (const table of ["links", "config_values", "oauth_tokens"]) {
    const rows = s.prepare(`SELECT DISTINCT alias FROM ${table} WHERE app_id = ?`).all(appId) as { alias: string }[];
    for (const { alias } of rows) aliases.add(alias);
  }
  const txn = s.transaction(() => {
    for (const alias of aliases) {
      if (keptAliases.has(alias)) continue;
      s.prepare("DELETE FROM links WHERE app_id = ? AND alias = ?").run(appId, alias);
      s.prepare("DELETE FROM config_values WHERE app_id = ? AND alias = ?").run(appId, alias);
      s.prepare("DELETE FROM oauth_tokens WHERE app_id = ? AND alias = ?").run(appId, alias);
    }
  });
  txn();
}
