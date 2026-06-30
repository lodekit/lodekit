import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAppDb, query, exec, storeGet, storeSet, schema } from "../src/db.js";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("db service", () => {
  it("creates the db file and runs exec + query round-trip", () => {
    const db = getAppDb(dir, "demo");
    expect(fs.existsSync(path.join(dir, "demo", "db.sqlite"))).toBe(true);
    exec(db, "CREATE TABLE items (id INTEGER PRIMARY KEY, n TEXT)");
    const r = exec(db, "INSERT INTO items (n) VALUES (?)", ["hello"]);
    expect(r.changes).toBe(1);
    expect(query(db, "SELECT n FROM items")).toEqual([{ n: "hello" }]);
  });

  it("stores and reads JSON KV values", () => {
    const db = getAppDb(dir, "kv");
    expect(storeGet(db, "missing")).toBeNull();
    storeSet(db, "cfg", { currency: "USD" });
    expect(storeGet(db, "cfg")).toEqual({ currency: "USD" });
    storeSet(db, "cfg", { currency: "EUR" });
    expect(storeGet(db, "cfg")).toEqual({ currency: "EUR" });
  });

  it("reports schema excluding internal tables", () => {
    const db = getAppDb(dir, "sc");
    exec(db, "CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
    exec(db, "INSERT INTO t (v) VALUES ('x')");
    const s = schema(db);
    expect(s.map((x) => x.table)).toEqual(["t"]);
    expect(s[0].columns.map((c) => c.name)).toEqual(["id", "v"]);
    expect(s[0].sample).toEqual([{ id: 1, v: "x" }]);
  });

  it("returns independent databases for the same slug under different data dirs", () => {
    const dirA = fs.mkdtempSync(path.join(os.tmpdir(), "lka-"));
    const dirB = fs.mkdtempSync(path.join(os.tmpdir(), "lkb-"));
    const a = getAppDb(dirA, "same");
    const b = getAppDb(dirB, "same");
    exec(a, "CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
    exec(a, "INSERT INTO t (v) VALUES ('only-in-a')");
    expect(() => query(b, "SELECT * FROM t")).toThrow(); // b has no table t
    fs.rmSync(dirA, { recursive: true, force: true });
    fs.rmSync(dirB, { recursive: true, force: true });
  });
});
