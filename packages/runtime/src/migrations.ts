// The migration engine's core applier (spec 2026-07-09-db-store §5): one ledger
// shape, one moment of application (connection open). Two modes ride on it —
// checked-in internal chains (migrations/*) and the app-schema push (db-store
// service), which uses the ledger's sibling `_schema` snapshot instead.
import type Database from "better-sqlite3";

export interface Migration {
  name: string;
  up: (db: Database.Database) => void;
}

// Applies the chain's pending migrations in order, each in its own transaction,
// recording each in the `_migrations` ledger. A failing migration rolls back
// atomically and throws — the caller decides whether boot degrades or dies.
export function applyMigrations(db: Database.Database, chain: Migration[]): void {
  const names = new Set(chain.map((m) => m.name));
  if (names.size !== chain.length) throw new Error("migration chain has duplicate names");
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    )`
  );
  const done = new Set(
    (db.prepare("SELECT name FROM _migrations").all() as { name: string }[]).map((r) => r.name)
  );
  for (const m of chain) {
    if (done.has(m.name)) continue;
    const txn = db.transaction(() => {
      m.up(db);
      db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(m.name, Date.now());
    });
    try {
      txn();
    } catch (e) {
      throw new Error(`migration "${m.name}" failed: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    }
  }
}
