import fs from "node:fs";
import path from "node:path";
import { openManagedDb, type ManagedDb } from "./sqlite.js";
import { APP_DB_CHAIN } from "./migrations/appDb.js";

// Cache key is the resolved db file path, not the app id alone.
// This ensures two calls with the same app id but different dataDir
// return independent connections (app-id-only key would collide across
// different temp roots in tests).
const connections = new Map<string, { appId: string; db: ManagedDb }>();

export function getAppDb(dataDir: string, appId: string): ManagedDb {
  const appDataDir = path.join(dataDir, appId);
  const dbPath = path.join(appDataDir, "db.sqlite");
  const cached = connections.get(dbPath);
  if (cached) return cached.db;
  const db = openManagedDb(dbPath, { chain: APP_DB_CHAIN });
  connections.set(dbPath, { appId, db });
  return db;
}

// Walked by the retention sweeps. Entries whose db file is gone (a removed data
// dir — temp roots in tests) are closed and evicted here so sweeps never touch
// stale fds.
export function openDbs(): { appId: string; db: ManagedDb }[] {
  for (const [dbPath, { db }] of connections) {
    if (!fs.existsSync(dbPath)) {
      db.close();
      connections.delete(dbPath);
    }
  }
  return [...connections.values()];
}

// Close every cached connection and empty the cache. Production never needs this
// (one Config per process, connections live until exit); tests cycling temp roots
// call it so stale handles don't accumulate across roots.
export function closeAppDbs(): void {
  for (const { db } of connections.values()) db.close();
  connections.clear();
}
