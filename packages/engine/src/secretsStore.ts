// The secret-store's platform store (spec 2026-07-07-secret-store §4): the
// person's secret catalog + links, in data/_platform/secrets.sqlite (settings'
// singleton pattern). Only values are encrypted (AES-256-GCM, master key from
// keyProvider, fetched lazily and held in memory); names/metadata/links stay
// plaintext so the dashboard and MCP render without touching the key.
import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Config } from "./config.js";
import { getMasterKey, SecretsUnavailableError } from "./keyProvider.js";
import { slugify } from "./services/file-store.js";
import { openManagedDb, type ManagedDb } from "./sqlite.js";
import { SECRETS_CHAIN } from "./migrations/platform.js";

export { SecretsUnavailableError };

/** Validation/semantic error — mapped to HTTP 400 by the router. */
export class SecretsError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "SecretsError";
  }
}

/** Unknown slug/slot — mapped to HTTP 404 by the router. */
export class SecretsNotFoundError extends SecretsError {
  constructor(message?: string) {
    super(message);
    this.name = "SecretsNotFoundError";
  }
}

/** Declared slot with no link (or linked secret gone) — mapped to HTTP 409. */
export class SecretUnlinkedError extends Error {
  constructor(message?: string) {
    super(message ?? "slot is not linked to a secret");
    this.name = "SecretUnlinkedError";
  }
}

export const VALUE_MAX_BYTES = 4096;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export interface SecretMeta {
  slug: string;
  label: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
  links: { appId: string; slot: string }[];
}

// ---------- crypto ----------

export function encryptValue(key: Buffer, plaintext: string): { ciphertext: Buffer; nonce: Buffer } {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return { ciphertext, nonce };
}

export function decryptValue(key: Buffer, ciphertext: Buffer, nonce: Buffer): string {
  const body = ciphertext.subarray(0, ciphertext.length - TAG_BYTES);
  const tag = ciphertext.subarray(ciphertext.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    // Failed integrity check — a typed refusal, never garbage bytes.
    throw new SecretsUnavailableError("secret value failed its integrity check");
  }
}

// ---------- singleton store (settings' platform-db pattern) ----------

let db: ManagedDb | null = null;
let cfgRef: Config | null = null;
let masterKey: Buffer | null = null;

export function initSecretStore(cfg: Config): boolean {
  db?.close();
  db = null;
  masterKey = null;
  cfgRef = cfg;
  try {
    db = openManagedDb(path.join(cfg.dataDir, "_platform", "secrets.sqlite"), { chain: SECRETS_CHAIN });
    return true;
  } catch (e) {
    db = null;
    process.stderr.write(`[secrets] secrets.sqlite unavailable — secret store degraded: ${e}\n`);
    return false;
  }
}

export function closeSecretStoreForTest(): void {
  db?.close();
  db = null;
  cfgRef = null;
  masterKey = null;
}

function store(): ManagedDb {
  if (!db) throw new SecretsUnavailableError();
  return db;
}

// Lazily fetched, held for the process (spec §4); a provider failure is 503.
function key(): Buffer {
  if (!masterKey) {
    if (!cfgRef) throw new SecretsUnavailableError();
    masterKey = getMasterKey(cfgRef);
  }
  return masterKey;
}

// ---------- catalog ----------

function assertValue(value: string): void {
  if (typeof value !== "string" || value.length === 0) throw new SecretsError("value must be a non-empty string");
  if (Buffer.byteLength(value, "utf8") > VALUE_MAX_BYTES) throw new SecretsError(`value exceeds ${VALUE_MAX_BYTES} bytes`);
}

function uniqueSlug(label: string): string {
  // slugify() falls back to "file" for input with no alnum chars (file-store's
  // filename-always-exists contract) — a secret label needs a real rejection instead.
  if (!/[a-z0-9]/i.test(label)) throw new SecretsError("label must contain letters or numbers");
  const base = slugify(label).slice(0, 120);
  if (!base) throw new SecretsError("label must contain letters or numbers");
  const exists = store().prepare("SELECT 1 FROM secrets WHERE slug = ?");
  if (!exists.get(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!exists.get(candidate)) return candidate;
  }
}

interface SecretRow {
  slug: string;
  label: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}

function toMeta(r: SecretRow): SecretMeta {
  const links = store()
    .prepare("SELECT app_id, slot FROM links WHERE slug = ? ORDER BY app_id, slot")
    .all(r.slug) as { app_id: string; slot: string }[];
  return {
    slug: r.slug,
    label: r.label,
    description: r.description,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    links: links.map((l) => ({ appId: l.app_id, slot: l.slot })),
  };
}

export function createSecret(input: { label: string; description?: string; value: string }): SecretMeta {
  if (typeof input.label !== "string" || !input.label.trim()) throw new SecretsError("label is required");
  assertValue(input.value);
  const { ciphertext, nonce } = encryptValue(key(), input.value);
  const now = Date.now();
  const slug = uniqueSlug(input.label);
  store()
    .prepare(
      `INSERT INTO secrets (slug, label, description, ciphertext, nonce, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(slug, input.label.trim(), input.description ?? null, ciphertext, nonce, now, now);
  return getSecretMeta(slug)!;
}

export function updateSecret(
  slug: string,
  patch: { label?: string; description?: string; value?: string }
): SecretMeta {
  const row = store().prepare("SELECT slug, label, description, created_at, updated_at FROM secrets WHERE slug = ?").get(slug) as SecretRow | undefined;
  if (!row) throw new SecretsNotFoundError(`unknown secret "${slug}"`);
  if (patch.label !== undefined && !patch.label.trim()) throw new SecretsError("label cannot be empty");
  const now = Date.now();
  if (patch.value !== undefined) {
    assertValue(patch.value);
    const { ciphertext, nonce } = encryptValue(key(), patch.value);
    store().prepare("UPDATE secrets SET ciphertext = ?, nonce = ?, updated_at = ? WHERE slug = ?").run(ciphertext, nonce, now, slug);
  }
  if (patch.label !== undefined || patch.description !== undefined) {
    store()
      .prepare("UPDATE secrets SET label = ?, description = ?, updated_at = ? WHERE slug = ?")
      .run(patch.label?.trim() ?? row.label, patch.description !== undefined ? patch.description : row.description, now, slug);
  }
  return getSecretMeta(slug)!;
}

export function deleteSecret(slug: string): { removedLinks: { appId: string; slot: string }[] } {
  const s = store();
  const removedLinks = (s.prepare("SELECT app_id, slot FROM links WHERE slug = ?").all(slug) as { app_id: string; slot: string }[])
    .map((l) => ({ appId: l.app_id, slot: l.slot }));
  const txn = s.transaction(() => {
    const gone = s.prepare("DELETE FROM secrets WHERE slug = ?").run(slug);
    if (gone.changes === 0) throw new SecretsNotFoundError(`unknown secret "${slug}"`);
    s.prepare("DELETE FROM links WHERE slug = ?").run(slug);
  });
  txn();
  return { removedLinks };
}

export function listSecrets(): SecretMeta[] {
  const rows = store()
    .prepare("SELECT slug, label, description, created_at, updated_at FROM secrets ORDER BY label")
    .all() as SecretRow[];
  return rows.map(toMeta);
}

export function getSecretMeta(slug: string): SecretMeta | undefined {
  const row = store().prepare("SELECT slug, label, description, created_at, updated_at FROM secrets WHERE slug = ?").get(slug) as SecretRow | undefined;
  return row ? toMeta(row) : undefined;
}

// ---------- links (the grant, spec §2) ----------

export function setLink(appId: string, slot: string, slug: string): void {
  const s = store();
  if (!s.prepare("SELECT 1 FROM secrets WHERE slug = ?").get(slug)) {
    throw new SecretsNotFoundError(`unknown secret "${slug}"`);
  }
  s.prepare(
    `INSERT INTO links (app_id, slot, slug, linked_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(app_id, slot) DO UPDATE SET slug = excluded.slug, linked_at = excluded.linked_at`
  ).run(appId, slot, slug, Date.now());
}

export function deleteLink(appId: string, slot: string): boolean {
  return store().prepare("DELETE FROM links WHERE app_id = ? AND slot = ?").run(appId, slot).changes > 0;
}

export function getLinkedSecret(appId: string, slot: string): { slug: string; label: string } | undefined {
  return store()
    .prepare(
      `SELECT s.slug, s.label FROM links l JOIN secrets s ON s.slug = l.slug
       WHERE l.app_id = ? AND l.slot = ?`
    )
    .get(appId, slot) as { slug: string; label: string } | undefined;
}

/** Wholesale-registration cleanup: drop links whose slot the app no longer declares. */
export function pruneLinks(appId: string, keptSlots: Set<string>): { appId: string; slot: string }[] {
  const rows = store().prepare("SELECT slot FROM links WHERE app_id = ?").all(appId) as { slot: string }[];
  const removed: { appId: string; slot: string }[] = [];
  for (const { slot } of rows) {
    if (keptSlots.has(slot)) continue;
    store().prepare("DELETE FROM links WHERE app_id = ? AND slot = ?").run(appId, slot);
    removed.push({ appId, slot });
  }
  return removed;
}

// ---------- the value read (the only decrypt path) ----------

export function readValue(appId: string, slot: string): string {
  const row = store()
    .prepare(
      `SELECT s.ciphertext, s.nonce FROM links l JOIN secrets s ON s.slug = l.slug
       WHERE l.app_id = ? AND l.slot = ?`
    )
    .get(appId, slot) as { ciphertext: Buffer; nonce: Buffer } | undefined;
  if (!row) throw new SecretUnlinkedError(`slot "${slot}" is not linked to a secret`);
  return decryptValue(key(), row.ciphertext, row.nonce);
}

/** Decrypt a catalog secret by slug — the gateways engine's read path (its
 *  links reference slugs directly, not app slots). Same posture as readValue:
 *  the value never leaves the engine process. */
export function readValueBySlug(slug: string): string {
  const row = store()
    .prepare("SELECT ciphertext, nonce FROM secrets WHERE slug = ?")
    .get(slug) as { ciphertext: Buffer; nonce: Buffer } | undefined;
  if (!row) throw new SecretsNotFoundError(`unknown secret "${slug}"`);
  return decryptValue(key(), row.ciphertext, row.nonce);
}
