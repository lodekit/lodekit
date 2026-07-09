import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { applyMigrations } from "./migrations.js";
import { APP_DB_CHAIN } from "./migrations/appDb.js";

// Cache key is the resolved db file path, not the app id alone.
// This ensures two calls with the same app id but different dataDir
// return independent connections (app-id-only key would collide across
// different temp roots in tests).
const connections = new Map<string, { appId: string; db: Database.Database }>();

export function getAppDb(dataDir: string, appId: string): Database.Database {
  const appDataDir = path.join(dataDir, appId);
  const dbPath = path.join(appDataDir, "db.sqlite");
  const cached = connections.get(dbPath);
  if (cached) return cached.db;
  fs.mkdirSync(appDataDir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  applyMigrations(db, APP_DB_CHAIN);
  connections.set(dbPath, { appId, db });
  return db;
}

export function openDbs(): { appId: string; db: Database.Database }[] {
  return [...connections.values()];
}
