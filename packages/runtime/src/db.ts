import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

// Cache key is the resolved db file path, not the slug alone.
// This ensures two calls with the same slug but different dataDir
// return independent connections (slug-only key would collide across
// different temp roots in tests).
const connections = new Map<string, { slug: string; db: Database.Database }>();

export function getAppDb(dataDir: string, slug: string): Database.Database {
  const appDataDir = path.join(dataDir, slug);
  const dbPath = path.join(appDataDir, "db.sqlite");
  const cached = connections.get(dbPath);
  if (cached) return cached.db;
  fs.mkdirSync(appDataDir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  connections.set(dbPath, { slug, db });
  return db;
}

export function openDbs(): { slug: string; db: Database.Database }[] {
  return [...connections.values()];
}
