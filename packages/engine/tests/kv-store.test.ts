import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  getKv, get, set, del, incr, list, getMany, setMany, sweep, KvError,
} from "../src/services/kv-store.js";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-kv-")); });
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

describe("kv-store ops", () => {
  it("set/get round-trips JSON, distinguishing missing from stored null", () => {
    const db = getKv(dir, "a");
    expect(get(db, "nope").found).toBe(false);
    set(db, "k", { x: 1 });
    const r = get(db, "k");
    expect(r.found).toBe(true);
    expect(r.entry!.value).toEqual({ x: 1 });
    expect(r.entry!.createdAt).toBeTypeOf("number");
    set(db, "n", null);
    expect(get(db, "n")).toMatchObject({ found: true, entry: { value: null } });
  });

  it("set preserves created_at and bumps updated_at on update", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const db = getKv(dir, "a");
    set(db, "k", 1);
    vi.setSystemTime(2_000_000);
    set(db, "k", 2);
    const e = get(db, "k").entry!;
    expect(e.createdAt).toBe(1_000_000);
    expect(e.updatedAt).toBe(2_000_000);
  });

  it("del deletes and reports whether anything was deleted", () => {
    const db = getKv(dir, "a");
    set(db, "k", 1);
    expect(del(db, "k")).toBe(true);
    expect(del(db, "k")).toBe(false);
    expect(get(db, "k").found).toBe(false);
  });

  it("incr starts at 0, applies by, and rejects non-numbers", () => {
    const db = getKv(dir, "a");
    expect(incr(db, "c")).toBe(1);
    expect(incr(db, "c", 5)).toBe(6);
    expect(incr(db, "c", -2)).toBe(4);
    set(db, "s", "text");
    expect(() => incr(db, "s")).toThrow(KvError);
  });

  it("ttl expires keys: get lazily deletes, set without ttl clears expiry, incr preserves it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const db = getKv(dir, "a");
    set(db, "tmp", "v", { ttl: 10 });
    expect(get(db, "tmp").found).toBe(true);
    vi.setSystemTime(11_000);
    expect(get(db, "tmp").found).toBe(false); // expired + lazily deleted

    set(db, "keep", 1, { ttl: 10 });
    incr(db, "keep"); // preserves expiry
    vi.setSystemTime(22_000);
    expect(get(db, "keep").found).toBe(false);

    set(db, "clear", 1, { ttl: 10 });
    set(db, "clear", 2); // no ttl -> expiry cleared
    vi.setSystemTime(60_000);
    expect(get(db, "clear").found).toBe(true);
  });

  it("list filters by escaped prefix, orders by key, paginates by cursor, skips expired", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const db = getKv(dir, "a");
    set(db, "e:1", 1); set(db, "e:2", 2); set(db, "e:3", 3);
    set(db, "other", 0);
    set(db, "e:dead", 9, { ttl: 1 });
    set(db, "e_x", 9); // '_' must not act as a LIKE wildcard
    vi.setSystemTime(2_000);

    const p1 = list(db, { prefix: "e:", limit: 2 });
    expect(p1.entries.map((e) => e.key)).toEqual(["e:1", "e:2"]);
    expect(p1.nextCursor).toBe("e:2");
    const p2 = list(db, { prefix: "e:", limit: 2, cursor: p1.nextCursor! });
    expect(p2.entries.map((e) => e.key)).toEqual(["e:3"]);
    expect(p2.nextCursor).toBeNull();
    expect(list(db).entries.map((e) => e.key)).toContain("other");
  });

  it("getMany returns found entries; setMany writes a batch with one ttl", () => {
    const db = getKv(dir, "a");
    setMany(db, [{ key: "a", value: 1 }, { key: "b", value: 2 }]);
    const got = getMany(db, ["a", "b", "missing"]);
    expect(got.map((e) => [e.key, e.value])).toEqual([["a", 1], ["b", 2]]);
  });

  it("sweep deletes expired rows and returns their keys", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const db = getKv(dir, "a");
    set(db, "gone", 1, { ttl: 1 });
    set(db, "stays", 1);
    vi.setSystemTime(2_000);
    expect(sweep(db)).toEqual(["gone"]);
    expect(sweep(db)).toEqual([]);
    expect(get(db, "stays").found).toBe(true);
  });

  it("migrates a POC-era (key,value) table in place without data loss", () => {
    // Build an old-shape db by hand, as the POC runtime created it.
    const appDir = path.join(dir, "old");
    fs.mkdirSync(appDir, { recursive: true });
    const raw = new Database(path.join(appDir, "db.sqlite"));
    raw.exec("CREATE TABLE _lodekit_store (key TEXT PRIMARY KEY, value TEXT)");
    raw.prepare("INSERT INTO _lodekit_store (key, value) VALUES (?, ?)").run("cfg", JSON.stringify({ currency: "USD" }));
    raw.close();

    const db = getKv(dir, "old");
    const r = get(db, "cfg");
    expect(r.found).toBe(true);
    expect(r.entry!.value).toEqual({ currency: "USD" });
    expect(r.entry!.createdAt).toBeTypeOf("number"); // backfilled
    set(db, "cfg", { currency: "EUR" }, { ttl: 60 }); // new columns usable
    expect(get(db, "cfg").entry!.value).toEqual({ currency: "EUR" });
  });
});
