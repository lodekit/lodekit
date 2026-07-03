import type Database from "better-sqlite3";
import { getAppDb, openDbs } from "../db.js";

export const CATALOG_NAME = "kv-store";

export interface Entry {
  key: string;
  value: unknown;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
}

/** Validation/semantic error — mapped to HTTP 400 by the router. */
export class KvError extends Error {}

interface Row { key: string; value: string; created_at: number; updated_at: number; expires_at: number | null }

const toEntry = (r: Row): Entry => ({
  key: r.key,
  value: JSON.parse(r.value),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  expiresAt: r.expires_at,
});

const ensured = new WeakSet<Database.Database>();

export function getKv(dataDir: string, slug: string): Database.Database {
  const db = getAppDb(dataDir, slug);
  if (!ensured.has(db)) {
    ensureSchema(db);
    ensured.add(db);
  }
  return db;
}

// Creates the v2 table, or migrates a POC-era (key,value) table in place by
// adding the metadata columns (timestamps backfilled with "now"). Migrated
// columns lack NOT NULL — acceptable; all writers populate them.
export function ensureSchema(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS _lodekit_store (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      expires_at INTEGER
    )`
  );
  const cols = new Set(
    (db.prepare("PRAGMA table_info(_lodekit_store)").all() as { name: string }[]).map((c) => c.name)
  );
  const missing = ["created_at", "updated_at", "expires_at"].filter((c) => !cols.has(c));
  for (const col of missing) db.exec(`ALTER TABLE _lodekit_store ADD COLUMN ${col} INTEGER`);
  if (missing.includes("created_at")) {
    db.prepare("UPDATE _lodekit_store SET created_at = ?, updated_at = ? WHERE created_at IS NULL")
      .run(Date.now(), Date.now());
  }
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_store_expires ON _lodekit_store(expires_at) WHERE expires_at IS NOT NULL"
  );
}

export function get(db: Database.Database, key: string): { found: boolean; entry?: Entry } {
  const row = db
    .prepare("SELECT key, value, created_at, updated_at, expires_at FROM _lodekit_store WHERE key = ?")
    .get(key) as Row | undefined;
  if (!row) return { found: false };
  if (row.expires_at !== null && row.expires_at <= Date.now()) {
    db.prepare("DELETE FROM _lodekit_store WHERE key = ?").run(key);
    return { found: false };
  }
  return { found: true, entry: toEntry(row) };
}

export function set(
  db: Database.Database,
  key: string,
  value: unknown,
  opts: { ttl?: number } = {}
): void {
  const now = Date.now();
  const expiresAt = opts.ttl != null ? now + opts.ttl * 1000 : null;
  db.prepare(
    `INSERT INTO _lodekit_store (key, value, created_at, updated_at, expires_at)
     VALUES (@key, @value, @now, @now, @expiresAt)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value, updated_at = excluded.updated_at, expires_at = excluded.expires_at`
  ).run({ key, value: JSON.stringify(value), now, expiresAt });
}

export function del(db: Database.Database, key: string): boolean {
  return db.prepare("DELETE FROM _lodekit_store WHERE key = ?").run(key).changes > 0;
}

// Synchronous transaction = race-free in the single runtime process.
// Preserves an existing TTL (Redis INCR semantics) by not touching expires_at.
export function incr(db: Database.Database, key: string, by = 1): number {
  const txn = db.transaction((): number => {
    const cur = get(db, key);
    let base = 0;
    if (cur.found) {
      if (typeof cur.entry!.value !== "number") throw new KvError(`incr: value at "${key}" is not a number`);
      base = cur.entry!.value;
    }
    const next = base + by;
    const now = Date.now();
    db.prepare(
      `INSERT INTO _lodekit_store (key, value, created_at, updated_at, expires_at)
       VALUES (?, ?, ?, ?, NULL)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, JSON.stringify(next), now, now);
    return next;
  });
  return txn();
}

export function list(
  db: Database.Database,
  opts: { prefix?: string; limit?: number; cursor?: string } = {}
): { entries: Entry[]; nextCursor: string | null } {
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 1000)), 1000);
  const like = (opts.prefix ?? "").replace(/[\\%_]/g, (m) => "\\" + m) + "%";
  const rows = db
    .prepare(
      `SELECT key, value, created_at, updated_at, expires_at FROM _lodekit_store
       WHERE key LIKE ? ESCAPE '\\' AND key > ?
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY key ASC LIMIT ?`
    )
    .all(like, opts.cursor ?? "", Date.now(), limit) as Row[];
  const entries = rows.map(toEntry);
  return { entries, nextCursor: rows.length === limit ? entries[entries.length - 1].key : null };
}

export function getMany(db: Database.Database, keys: string[]): Entry[] {
  const out: Entry[] = [];
  for (const key of keys) {
    const r = get(db, key);
    if (r.found) out.push(r.entry!);
  }
  return out;
}

export function setMany(
  db: Database.Database,
  entries: { key: string; value: unknown }[],
  opts: { ttl?: number } = {}
): void {
  const txn = db.transaction(() => {
    for (const e of entries) set(db, e.key, e.value, opts);
  });
  txn();
}

export function sweep(db: Database.Database): string[] {
  return (
    db
      .prepare("DELETE FROM _lodekit_store WHERE expires_at IS NOT NULL AND expires_at <= ? RETURNING key")
      .all(Date.now()) as { key: string }[]
  ).map((r) => r.key);
}

// Sweeps every open connection. Apps never opened since boot aren't swept
// until first access — lazy expiry on read covers correctness; the sweep is
// for space. Only connections opened through getKv have the v2 schema
// guaranteed, so guard with ensureSchema idempotently.
export function sweepAll(): { slug: string; keys: string[] }[] {
  const results: { slug: string; keys: string[] }[] = [];
  for (const { slug, db } of openDbs()) {
    if (!ensured.has(db)) {
      ensureSchema(db);
      ensured.add(db);
    }
    const keys = sweep(db);
    if (keys.length > 0) results.push({ slug, keys });
  }
  return results;
}
