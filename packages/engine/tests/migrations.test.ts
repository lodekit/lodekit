import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { applyMigrations, type Migration } from "../src/migrations.js";

const mem = () => new Database(":memory:");

describe("applyMigrations", () => {
  it("applies pending migrations in order and records the ledger", () => {
    const db = mem();
    const applied: string[] = [];
    const chain: Migration[] = [
      { name: "001-a", up: (d) => { applied.push("a"); d.exec("CREATE TABLE t1 (x)"); } },
      { name: "002-b", up: (d) => { applied.push("b"); d.exec("CREATE TABLE t2 (x)"); } },
    ];
    applyMigrations(db, chain);
    expect(applied).toEqual(["a", "b"]);
    const rows = db.prepare("SELECT name FROM _migrations ORDER BY id").all() as { name: string }[];
    expect(rows.map((r) => r.name)).toEqual(["001-a", "002-b"]);
  });

  it("is idempotent — a second call applies nothing", () => {
    const db = mem();
    let runs = 0;
    const chain: Migration[] = [{ name: "001-a", up: () => { runs++; } }];
    applyMigrations(db, chain);
    applyMigrations(db, chain);
    expect(runs).toBe(1);
  });

  it("applies only the new tail when the chain grows", () => {
    const db = mem();
    const first: Migration[] = [{ name: "001-a", up: (d) => d.exec("CREATE TABLE t1 (x)") }];
    applyMigrations(db, first);
    let ranSecond = 0;
    applyMigrations(db, [...first, { name: "002-b", up: () => { ranSecond++; } }]);
    expect(ranSecond).toBe(1);
    expect(db.prepare("SELECT count(*) AS n FROM _migrations").get()).toEqual({ n: 2 });
  });

  it("a failing migration rolls back and is not recorded", () => {
    const db = mem();
    const chain: Migration[] = [
      {
        name: "001-bad",
        up: (d) => {
          d.exec("CREATE TABLE t1 (x)");
          throw new Error("boom");
        },
      },
    ];
    expect(() => applyMigrations(db, chain)).toThrow(/001-bad.*boom/s);
    // rolled back: neither the table nor the ledger row exists
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='t1'").all();
    expect(tables).toEqual([]);
    expect(db.prepare("SELECT count(*) AS n FROM _migrations").get()).toEqual({ n: 0 });
  });

  it("rejects a chain with duplicate names", () => {
    const db = mem();
    const chain: Migration[] = [
      { name: "001-a", up: () => {} },
      { name: "001-a", up: () => {} },
    ];
    expect(() => applyMigrations(db, chain)).toThrow(/duplicate/i);
  });
});
