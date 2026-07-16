// The per-app db.sqlite chain (spec §5). Migration 001 is the baseline + the
// great rename: every historical shape (POC kv, tasks v0, _lodekit_-era) lands
// on the bare-_ names with data preserved. Idempotence comes from the ledger;
// the guards inside keep 001 itself safe against every starting shape.
import type Database from "better-sqlite3";
import type { Migration } from "../migrations.js";

const hasTable = (db: Database.Database, name: string): boolean =>
  db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(name) !== undefined;

const RENAMES: [string, string][] = [
  ["_lodekit_store", "_kv"],
  ["_lodekit_files", "_files"],
  ["_lodekit_setting_defs", "_setting_defs"],
  ["_lodekit_setting_values", "_setting_values"],
  ["_lodekit_task_defs", "_task_defs"],
  ["_lodekit_task_runs", "_task_runs"],
  ["_lodekit_secret_slots", "_secret_slots"],
];

export const APP_DB_CHAIN: Migration[] = [
  {
    name: "001-baseline-rename",
    up(db) {
      // tasks v0→v1 (port of the old ensureSchema's user_version check): defs
      // are manifest-reconstructed every boot, so dropping the v0 table only
      // resets schedule anchors. Runs before the rename so v0 never carries over.
      if ((db.pragma("user_version", { simple: true }) as number) < 1) {
        db.exec("DROP TABLE IF EXISTS _lodekit_task_defs");
        db.pragma("user_version = 1");
      }

      for (const [from, to] of RENAMES) {
        if (hasTable(db, from) && !hasTable(db, to)) db.exec(`ALTER TABLE ${from} RENAME TO ${to}`);
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS _kv (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          expires_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS _files (
          slug         TEXT PRIMARY KEY,
          path         TEXT NOT NULL,
          title        TEXT,
          content_type TEXT NOT NULL,
          size         INTEGER NOT NULL,
          hash         TEXT NOT NULL,
          metadata     TEXT,
          created_at   INTEGER NOT NULL,
          updated_at   INTEGER NOT NULL,
          expires_at   INTEGER
        );
        CREATE TABLE IF NOT EXISTS _setting_defs (
          key           TEXT PRIMARY KEY,
          field         TEXT,
          error         TEXT,
          registered_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS _setting_values (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS _task_defs (
          name          TEXT PRIMARY KEY,
          schedule_kind TEXT,
          schedule_expr TEXT,
          catch_up_ms   INTEGER,
          retries       INTEGER,
          timeout_ms    INTEGER,
          retired       INTEGER NOT NULL DEFAULT 0,
          error         TEXT,
          registered_at INTEGER NOT NULL,
          high_water    INTEGER
        );
        CREATE TABLE IF NOT EXISTS _task_runs (
          id          INTEGER PRIMARY KEY,
          task        TEXT NOT NULL,
          state       TEXT NOT NULL,
          payload     TEXT,
          dedupe_key  TEXT,
          attempt     INTEGER NOT NULL DEFAULT 0,
          not_before  INTEGER NOT NULL,
          source      TEXT NOT NULL,
          created_at  INTEGER NOT NULL,
          started_at  INTEGER,
          finished_at INTEGER,
          duration_ms INTEGER,
          error       TEXT
        );
        CREATE TABLE IF NOT EXISTS _secret_slots (
          slot          TEXT PRIMARY KEY,
          def           TEXT,
          error         TEXT,
          registered_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS _schema (
          id         INTEGER PRIMARY KEY CHECK (id = 1),
          snapshot   TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      // POC-era kv column backfill (port of kv-store's old ensureSchema): a
      // renamed (key,value) table gains the metadata columns, timestamps "now".
      const cols = new Set(
        (db.prepare("PRAGMA table_info(_kv)").all() as { name: string }[]).map((c) => c.name)
      );
      const missing = ["created_at", "updated_at", "expires_at"].filter((c) => !cols.has(c));
      for (const col of missing) db.exec(`ALTER TABLE _kv ADD COLUMN ${col} INTEGER`);
      if (missing.includes("created_at")) {
        db.prepare("UPDATE _kv SET created_at = ?, updated_at = ? WHERE created_at IS NULL")
          .run(Date.now(), Date.now());
      }

      // Indexes: drop the old names (they survive ALTER TABLE RENAME), create the _-prefixed ones.
      db.exec(`
        DROP INDEX IF EXISTS idx_store_expires;
        DROP INDEX IF EXISTS idx_files_expires;
        DROP INDEX IF EXISTS idx_task_runs_due;
        DROP INDEX IF EXISTS idx_task_runs_task;
        CREATE INDEX IF NOT EXISTS _idx_kv_expires ON _kv(expires_at) WHERE expires_at IS NOT NULL;
        CREATE INDEX IF NOT EXISTS _idx_files_expires ON _files(expires_at) WHERE expires_at IS NOT NULL;
        CREATE INDEX IF NOT EXISTS _idx_task_runs_due ON _task_runs(state, not_before);
        CREATE INDEX IF NOT EXISTS _idx_task_runs_task ON _task_runs(task, id);
      `);
    },
  },
];
