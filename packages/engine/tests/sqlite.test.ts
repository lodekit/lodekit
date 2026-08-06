import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Migration } from "../src/migrations.js";
import { openManagedDb, openReadonlyDb, type ManagedDb } from "../src/sqlite.js";

const CHAIN: Migration[] = [
  { name: "001-t", up: (db) => { db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)"); } },
];

let tmp: string | null = null;
const opened: ManagedDb[] = [];
const track = (db: ManagedDb): ManagedDb => { opened.push(db); return db; };

// A fresh <tmp>/nested/db.sqlite path — "nested" does not exist yet, so the
// helper's mkdir is what must create it.
const freshDbPath = () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-seam-"));
  return path.join(tmp, "nested", "db.sqlite");
};

afterEach(() => {
  for (const db of opened.splice(0)) { try { db.close(); } catch { /* already closed */ } }
  if (tmp) { fs.rmSync(tmp, { recursive: true, force: true }); tmp = null; }
});

describe("openManagedDb", () => {
  it("creates the parent directory (0700) and applies the chain", () => {
    const dbPath = freshDbPath();
    const db = track(openManagedDb(dbPath, { chain: CHAIN }));
    expect(fs.statSync(path.dirname(dbPath)).mode & 0o777).toBe(0o700);
    db.prepare("INSERT INTO t (v) VALUES (?)").run("x");
    expect(db.prepare("SELECT COUNT(*) AS c FROM _migrations").get()).toEqual({ c: 1 });
  });

  it("sets WAL journal mode", () => {
    const db = track(openManagedDb(freshDbPath(), { chain: CHAIN }));
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
  });

  it("leaves foreign_keys off unless requested", () => {
    const dbPath = freshDbPath();
    const plain = track(openManagedDb(dbPath, { chain: CHAIN }));
    expect(plain.pragma("foreign_keys", { simple: true })).toBe(0);
    plain.close();
    const fk = track(openManagedDb(dbPath, { chain: CHAIN, foreignKeys: true }));
    expect(fk.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("does not reapply an already-applied chain", () => {
    const dbPath = freshDbPath();
    track(openManagedDb(dbPath, { chain: CHAIN })).close();
    const again = track(openManagedDb(dbPath, { chain: CHAIN }));
    expect(again.prepare("SELECT COUNT(*) AS c FROM _migrations").get()).toEqual({ c: 1 });
  });
});

describe("openReadonlyDb", () => {
  it("refuses a missing file", () => {
    expect(() => openReadonlyDb(freshDbPath())).toThrow();
  });

  it("rejects writes on the handle", () => {
    const dbPath = freshDbPath();
    track(openManagedDb(dbPath, { chain: CHAIN })).close();
    const ro = track(openReadonlyDb(dbPath));
    expect(() => ro.prepare("INSERT INTO t (v) VALUES ('y')").run()).toThrow(/readonly/i);
  });
});
