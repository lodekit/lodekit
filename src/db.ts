import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

// Cache key is the resolved db file path, not the slug alone.
// This ensures two calls with the same slug but different dataDir
// return independent connections (slug-only key would collide across
// different temp roots in tests).
const connections = new Map<string, Database.Database>();

export function getAppDb(dataDir: string, slug: string): Database.Database {
  const appDataDir = path.join(dataDir, slug);
  const dbPath = path.join(appDataDir, "db.sqlite");
  const cached = connections.get(dbPath);
  if (cached) return cached;
  fs.mkdirSync(appDataDir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec("CREATE TABLE IF NOT EXISTS _lodekit_store (key TEXT PRIMARY KEY, value TEXT)");
  connections.set(dbPath, db);
  return db;
}

export function query(db: Database.Database, sql: string, params: unknown[] = []): unknown[] {
  return db.prepare(sql).all(...(params as never[]));
}

export function exec(db: Database.Database, sql: string, params: unknown[] = []) {
  const info = db.prepare(sql).run(...(params as never[]));
  return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
}

export function storeGet(db: Database.Database, key: string): unknown {
  const row = db.prepare("SELECT value FROM _lodekit_store WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row ? JSON.parse(row.value) : null;
}

export function storeSet(db: Database.Database, key: string, value: unknown): void {
  db.prepare(
    "INSERT INTO _lodekit_store (key, value) VALUES (?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, JSON.stringify(value));
}

export function schema(db: Database.Database) {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' " +
        "AND name NOT LIKE 'sqlite_%' AND name != '_lodekit_store'"
    )
    .all() as { name: string }[];
  return tables.map((t) => ({
    table: t.name,
    columns: (db.prepare(`PRAGMA table_info("${t.name}")`).all() as { name: string; type: string }[])
      .map((c) => ({ name: c.name, type: c.type })),
    sample: db.prepare(`SELECT * FROM "${t.name}" LIMIT 5`).all(),
  }));
}
