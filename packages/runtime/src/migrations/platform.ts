// Baselines for the four platform databases (spec §5). Shapes are the shipped
// DDL, moved verbatim from the init*Store functions — the engine changes, the
// schema doesn't. Future platform schema changes append migrations here.
import type { Migration } from "../migrations.js";

export const EVENTS_CHAIN: Migration[] = [
  {
    name: "001-baseline",
    up: (db) =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS events (
          id         INTEGER PRIMARY KEY,
          ts         INTEGER NOT NULL,
          ns         TEXT NOT NULL,
          source     TEXT NOT NULL,
          type       TEXT NOT NULL,
          payload    TEXT,
          expires_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS events_ns ON events(ns, id);
        CREATE INDEX IF NOT EXISTS events_ts ON events(ts);
      `),
  },
  {
    // Canonical envelope (spec 2026-07-16-events §3): app/kind/component replace
    // ns/source; no backfill — nothing is released, dev databases reset.
    name: "002-canonical-envelope",
    up: (db) =>
      db.exec(`
        DROP TABLE events;
        CREATE TABLE events (
          id         INTEGER PRIMARY KEY,
          ts         INTEGER NOT NULL,
          app        TEXT,
          kind       TEXT NOT NULL,
          component  TEXT NOT NULL,
          type       TEXT NOT NULL,
          payload    TEXT,
          expires_at INTEGER
        );
        CREATE INDEX events_app ON events(app, id);
        CREATE INDEX events_ts  ON events(ts);
      `),
  },
];

export const LOGS_CHAIN: Migration[] = [
  {
    name: "001-baseline",
    up: (db) =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS logs (
          id      INTEGER PRIMARY KEY,
          ts      INTEGER NOT NULL,
          level   INTEGER NOT NULL,
          source  TEXT NOT NULL,
          app_id  TEXT,
          message TEXT NOT NULL,
          fields  TEXT
        );
        CREATE INDEX IF NOT EXISTS logs_app ON logs(app_id, id);
        CREATE INDEX IF NOT EXISTS logs_level ON logs(level, id);
        CREATE INDEX IF NOT EXISTS logs_ts ON logs(ts);
      `),
  },
];

export const SECRETS_CHAIN: Migration[] = [
  {
    name: "001-baseline",
    up: (db) =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS secrets (
          slug        TEXT PRIMARY KEY,
          label       TEXT NOT NULL,
          description TEXT,
          ciphertext  BLOB NOT NULL,   -- AES-256-GCM output, auth tag appended
          nonce       BLOB NOT NULL,
          created_at  INTEGER NOT NULL,
          updated_at  INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS links (
          app_id    TEXT NOT NULL,
          slot      TEXT NOT NULL,
          slug      TEXT NOT NULL,
          linked_at INTEGER NOT NULL,
          PRIMARY KEY (app_id, slot)
        );
      `),
  },
];

export const SETTINGS_CHAIN: Migration[] = [
  {
    name: "001-baseline",
    up: (db) =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `),
  },
];

export const GATEWAYS_CHAIN: Migration[] = [
  {
    name: "001-baseline",
    up: (db) =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS links (
          app_id    TEXT NOT NULL,
          alias     TEXT NOT NULL,
          slot      TEXT NOT NULL,
          slug      TEXT NOT NULL,   -- soft reference into the secrets catalog
          linked_at INTEGER NOT NULL,
          PRIMARY KEY (app_id, alias, slot)
        );
        CREATE TABLE IF NOT EXISTS config_values (
          app_id TEXT NOT NULL,
          alias  TEXT NOT NULL,
          slot   TEXT NOT NULL,
          value  TEXT NOT NULL,
          set_at INTEGER NOT NULL,
          PRIMARY KEY (app_id, alias, slot)
        );
        CREATE TABLE IF NOT EXISTS oauth_tokens (
          app_id       TEXT NOT NULL,
          alias        TEXT NOT NULL,
          ciphertext   BLOB NOT NULL,  -- AES-256-GCM over the token JSON, auth tag appended
          nonce        BLOB NOT NULL,
          needs_reauth INTEGER NOT NULL DEFAULT 0,
          updated_at   INTEGER NOT NULL,
          PRIMARY KEY (app_id, alias)
        );
      `),
  },
];
