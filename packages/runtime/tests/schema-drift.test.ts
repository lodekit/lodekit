import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { applyMigrations, type Migration } from "../src/migrations.js";
import { APP_DB_CHAIN } from "../src/migrations/appDb.js";
import { EVENTS_CHAIN, LOGS_CHAIN, SECRETS_CHAIN, SETTINGS_CHAIN } from "../src/migrations/platform.js";
import {
  APP_DB_SCHEMA, EVENTS_SCHEMA, LOGS_SCHEMA, SECRETS_SCHEMA, SETTINGS_SCHEMA,
} from "../src/internalSchema.js";

// Structural fingerprint of one database: tables (minus the applier's own
// _migrations and sqlite internals) with their columns' name/type/notnull/
// default/pk — the properties both DDL paths fully control.
function fingerprint(db: Database.Database) {
  const tables = (db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name != '_migrations' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[]).map((r) => r.name);
  return Object.fromEntries(
    tables.map((t) => [
      t,
      (db.prepare(`PRAGMA table_info(${JSON.stringify(t)})`).all() as {
        name: string; type: string; notnull: number; dflt_value: unknown; pk: number;
      }[]).map(({ name, type, notnull, dflt_value, pk }) => ({
        name, type: type.toUpperCase(), notnull, dflt: dflt_value == null ? null : String(dflt_value), pk: pk > 0 ? 1 : 0,
      })),
    ])
  );
}

async function declaredDb(schema: Record<string, unknown>): Promise<Database.Database> {
  const { generateSQLiteDrizzleJson, generateSQLiteMigration } = await import("drizzle-kit/api");
  const prev = await generateSQLiteDrizzleJson({});
  const cur = await generateSQLiteDrizzleJson(schema as Record<string, never>);
  const statements = await generateSQLiteMigration(prev, cur);
  const db = new Database(":memory:");
  for (const s of statements) db.exec(s);
  return db;
}

describe("internal declarations match the migration chains", () => {
  it.each([
    ["app-db", APP_DB_CHAIN, APP_DB_SCHEMA],
    ["events", EVENTS_CHAIN, EVENTS_SCHEMA],
    ["logs", LOGS_CHAIN, LOGS_SCHEMA],
    ["secrets", SECRETS_CHAIN, SECRETS_SCHEMA],
    ["settings", SETTINGS_CHAIN, SETTINGS_SCHEMA],
  ] as const)("%s", async (_name, chain, schema) => {
    const migrated = new Database(":memory:");
    applyMigrations(migrated, chain as Migration[]);
    expect(fingerprint(migrated)).toEqual(fingerprint(await declaredDb(schema)));
  });
});
