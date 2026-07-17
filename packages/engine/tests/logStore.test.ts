import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  initLogStore, insertLog, queryLogs, sweepLogStore, closeLogStoreForTest,
} from "../src/logStore.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-logs-"));
  expect(initLogStore(dir)).toBe(true);
});
afterEach(() => {
  closeLogStoreForTest();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("logStore", () => {
  it("inserts and queries newest-first with level names round-tripped", () => {
    insertLog({ level: "info", source: "host", message: "one" });
    insertLog({ level: "error", source: "build", appId: "notes", message: "two", fields: { stack: "s" } });
    const { records } = queryLogs();
    expect(records.map((r) => r.message)).toEqual(["two", "one"]);
    expect(records[0]).toMatchObject({ level: "error", source: "build", appId: "notes", fields: { stack: "s" } });
    expect(records[1].appId).toBeNull();
    expect(fs.existsSync(path.join(dir, "logs.sqlite"))).toBe(true);
  });

  it("filters by app, platform, minimum level, source, and substring", () => {
    insertLog({ level: "debug", source: "host", appId: "a", message: "GET /a/ 200" });
    insertLog({ level: "warn", source: "console", appId: "a", message: "low disk" });
    insertLog({ level: "info", source: "watcher", message: "app changed" });
    expect(queryLogs({ app: "a" }).records).toHaveLength(2);
    expect(queryLogs({ app: "_platform" }).records.map((r) => r.source)).toEqual(["watcher"]);
    expect(queryLogs({ level: "warn" }).records.map((r) => r.message)).toEqual(["low disk"]);
    expect(queryLogs({ source: "console" }).records).toHaveLength(1);
    expect(queryLogs({ q: "disk" }).records).toHaveLength(1);
    expect(queryLogs({ q: "%" }).records).toHaveLength(0); // LIKE metachars escaped
  });

  it("paginates with before/nextBefore", () => {
    for (let i = 1; i <= 5; i++) insertLog({ level: "info", source: "host", message: `m${i}` });
    const page1 = queryLogs({ limit: 2 });
    expect(page1.records.map((r) => r.message)).toEqual(["m5", "m4"]);
    expect(page1.nextBefore).toBe(page1.records[1].id);
    const page2 = queryLogs({ limit: 2, before: page1.nextBefore! });
    expect(page2.records.map((r) => r.message)).toEqual(["m3", "m2"]);
    const last = queryLogs({ limit: 2, before: page2.nextBefore! });
    expect(last.records.map((r) => r.message)).toEqual(["m1"]);
    expect(last.nextBefore).toBeNull();
  });

  it("sweep deletes by age and caps row count oldest-first", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    insertLog({ level: "info", source: "host", message: "old" });
    vi.setSystemTime(1_000_000 + 8 * 24 * 60 * 60 * 1000);
    for (let i = 0; i < 5; i++) insertLog({ level: "info", source: "host", message: `new${i}` });
    expect(sweepLogStore({ maxRows: 3 })).toBe(3); // 1 aged out + 2 over cap
    const { records } = queryLogs();
    expect(records.map((r) => r.message)).toEqual(["new4", "new3", "new2"]);
  });

  it("appAges: an app's own retention age wins over the global age", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    insertLog({ level: "info", source: "t", message: "p" });
    insertLog({ level: "info", source: "t", appId: "a", message: "a" });
    insertLog({ level: "info", source: "t", appId: "b", message: "b" });
    vi.setSystemTime(1_000_000 + 3 * 86_400_000); // all three now 3 days old
    sweepLogStore({ maxAgeMs: 2 * 86_400_000, appAges: new Map([["a", 7 * 86_400_000]]) });
    const left = queryLogs({}).records.map((r) => r.appId);
    expect(left).toEqual(["a"]); // platform + "b" swept by the 2d global age; "a" kept by its 7d override
  });

  it("degrades instead of throwing when the state dir is unusable", () => {
    closeLogStoreForTest();
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const file = path.join(dir, "not-a-dir");
    fs.writeFileSync(file, "x"); // mkdir over a file fails
    expect(initLogStore(path.join(file, "nested"))).toBe(false);
    expect(insertLog({ level: "info", source: "host", message: "dropped" })).toBeNull();
    expect(queryLogs().records).toEqual([]);
    expect(sweepLogStore()).toBe(0);
    expect(err).toHaveBeenCalled(); // the one degradation notice
  });

  it("queryLogs degrades on read failure instead of throwing", () => {
    insertLog({ level: "info", source: "host", message: "test" });
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    // Corrupt the schema by opening a raw connection and dropping the table
    const corruptDb = new Database(path.join(dir, "logs.sqlite"));
    corruptDb.exec("DROP TABLE logs");
    corruptDb.close();
    // queryLogs must degrade gracefully, not throw
    const result = queryLogs();
    expect(result).toEqual({ records: [], nextBefore: null });
    expect(err).toHaveBeenCalledWith(expect.stringContaining("[logger] log query failed:"));
  });
});
