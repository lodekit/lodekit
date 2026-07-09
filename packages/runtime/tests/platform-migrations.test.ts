import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { applyMigrations } from "../src/migrations.js";
import { EVENTS_CHAIN, LOGS_CHAIN, SECRETS_CHAIN, SETTINGS_CHAIN } from "../src/migrations/platform.js";

const tables = (db: Database.Database) =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[])
    .map((r) => r.name);

describe("platform chains", () => {
  it.each([
    ["events", EVENTS_CHAIN, ["events"]],
    ["logs", LOGS_CHAIN, ["logs"]],
    ["secrets", SECRETS_CHAIN, ["links", "secrets"]],
    ["settings", SETTINGS_CHAIN, ["settings"]],
  ] as const)("%s: baseline creates its tables + ledger, idempotently", (_name, chain, expected) => {
    const db = new Database(":memory:");
    applyMigrations(db, chain);
    applyMigrations(db, chain);
    const t = tables(db);
    for (const e of expected) expect(t).toContain(e);
    expect(t).toContain("_migrations");
    expect(db.prepare("SELECT count(*) AS n FROM _migrations").get()).toEqual({ n: 1 });
  });

  it("adopts an existing pre-ledger database without touching rows", () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE events (
      id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, ns TEXT NOT NULL,
      source TEXT NOT NULL, type TEXT NOT NULL, payload TEXT, expires_at INTEGER
    )`);
    db.prepare("INSERT INTO events (ts, ns, source, type) VALUES (1, 'a', '_platform', 'x')").run();
    applyMigrations(db, EVENTS_CHAIN);
    expect(db.prepare("SELECT count(*) AS n FROM events").get()).toEqual({ n: 1 });
  });
});
