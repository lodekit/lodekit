// The engine's single door to the SQLite driver (issue #141): every connection —
// the read-write platform/app stores and the short-lived readonly opens — is
// constructed here, and callers name the handle type via ManagedDb. A driver
// swap (node:sqlite #143, Bun #142) starts here — construction and types are
// centralized; call sites still use driver-shaped transaction/reader/raw/pragma.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { applyMigrations, type Migration } from "./migrations.js";

export type ManagedDb = Database.Database;

export interface ManagedDbOptions {
  chain: Migration[];
}

// Opens (creating if needed) a read-write store: private parent dir (0700),
// WAL, foreign-key enforcement (explicit — pins the driver default every store
// already runs with), migrations applied at open — the one moment of application
// (migrations.ts). Throws on failure; degrade policy stays with each caller.
export function openManagedDb(dbPath: string, opts: ManagedDbOptions): ManagedDb {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  applyMigrations(db, opts.chain);
  return db;
}

// Short-lived readonly connection: the readonly guarantee is the connection's,
// not a SQL parse's (db-store spec §8/§9).
export function openReadonlyDb(dbPath: string): ManagedDb {
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}
