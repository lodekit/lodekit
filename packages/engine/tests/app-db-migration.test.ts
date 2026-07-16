import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { getAppDb } from "../src/db.js";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-mig-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const SERVICE_TABLES = [
  "_kv", "_files", "_setting_defs", "_setting_values",
  "_task_defs", "_task_runs", "_secret_slots", "_schema", "_migrations",
];

function tableNames(db: Database.Database): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[])
    .map((r) => r.name);
}

describe("app-db migration 001", () => {
  it("a fresh open creates every service table under the bare-_ names", () => {
    const db = getAppDb(dir, "fresh");
    const names = tableNames(db);
    for (const t of SERVICE_TABLES) expect(names).toContain(t);
    expect(names.some((n) => n.startsWith("_lodekit_"))).toBe(false);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("renames _lodekit_-era tables in place, preserving rows", () => {
    // Build a settings-slice-era db by hand: old names, v2 kv shape, one row each.
    fs.mkdirSync(path.join(dir, "legacy"), { recursive: true });
    const raw = new Database(path.join(dir, "legacy", "db.sqlite"));
    raw.exec(`CREATE TABLE _lodekit_store (
      key TEXT PRIMARY KEY, value TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER
    )`);
    raw.prepare("INSERT INTO _lodekit_store (key, value, created_at, updated_at) VALUES ('k', '1', 1, 1)").run();
    raw.exec(`CREATE TABLE _lodekit_setting_values (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL
    )`);
    raw.prepare("INSERT INTO _lodekit_setting_values (key, value, updated_at) VALUES ('s', '\"x\"', 1)").run();
    raw.pragma("user_version = 1");
    raw.close();

    const db = getAppDb(dir, "legacy");
    expect(db.prepare("SELECT value FROM _kv WHERE key = 'k'").get()).toEqual({ value: "1" });
    expect(db.prepare("SELECT value FROM _setting_values WHERE key = 's'").get()).toEqual({ value: '"x"' });
    expect(tableNames(db)).not.toContain("_lodekit_store");
  });

  it("migrates a POC-era (key,value) store: rename + column backfill", () => {
    fs.mkdirSync(path.join(dir, "poc"), { recursive: true });
    const raw = new Database(path.join(dir, "poc", "db.sqlite"));
    raw.exec("CREATE TABLE _lodekit_store (key TEXT PRIMARY KEY, value TEXT)");
    raw.prepare("INSERT INTO _lodekit_store (key, value) VALUES ('cfg', ?)").run(JSON.stringify({ c: "USD" }));
    raw.close();

    const db = getAppDb(dir, "poc");
    const cols = (db.prepare("PRAGMA table_info(_kv)").all() as { name: string }[]).map((c) => c.name);
    for (const c of ["created_at", "updated_at", "expires_at"]) expect(cols).toContain(c);
    const row = db.prepare("SELECT value, created_at FROM _kv WHERE key = 'cfg'").get() as { value: string; created_at: number };
    expect(JSON.parse(row.value)).toEqual({ c: "USD" });
    expect(row.created_at).toBeGreaterThan(0);
  });

  it("drops a pre-user_version-1 _lodekit_task_defs (tasks v0→v1 port)", () => {
    fs.mkdirSync(path.join(dir, "tv0"), { recursive: true });
    const raw = new Database(path.join(dir, "tv0", "db.sqlite"));
    raw.exec(`CREATE TABLE _lodekit_task_defs (
      name TEXT PRIMARY KEY, retries INTEGER NOT NULL, timeout_ms INTEGER NOT NULL, registered_at INTEGER NOT NULL
    )`);
    raw.prepare("INSERT INTO _lodekit_task_defs (name, retries, timeout_ms, registered_at) VALUES ('old', 3, 300000, 1)").run();
    raw.close(); // user_version stays 0 — the v0 marker

    const db = getAppDb(dir, "tv0");
    // v0 defs are dropped, the fresh _task_defs shape exists and is empty
    expect(db.prepare("SELECT count(*) AS n FROM _task_defs").get()).toEqual({ n: 0 });
    const cols = (db.prepare("PRAGMA table_info(_task_defs)").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain("schedule_kind");
  });

  it("second open is a no-op (ledger already recorded)", () => {
    getAppDb(dir, "twice");
    const db = getAppDb(dir, "twice");
    expect(db.prepare("SELECT count(*) AS n FROM _migrations").get()).toEqual({ n: 1 });
  });
});
