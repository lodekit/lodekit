import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initEventStore, insertEvent, queryEvents, closeEventStoreForTest } from "../src/eventStore.js";
import { getAppDb } from "../src/db.js";
import { buildSummary, heuristicTsColumn, parseTsValue } from "../src/services/data-explorer.js";

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-dataex-"));
  initEventStore(dataDir);
});
afterEach(() => {
  closeEventStoreForTest();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("event source filter", () => {
  it("queryEvents filters by exact source", () => {
    insertEvent({ ns: "plants", source: "plants", type: "watered" });
    insertEvent({ ns: "plants", source: "_platform", type: "kv-store-change" });
    const all = queryEvents({ ns: "plants" });
    expect(all.records).toHaveLength(2);
    const appOnly = queryEvents({ ns: "plants", source: "plants" });
    expect(appOnly.records).toHaveLength(1);
    expect(appOnly.records[0].type).toBe("watered");
  });
});

describe("summary heuristics", () => {
  it("heuristicTsColumn picks by priority, case-insensitive", () => {
    expect(heuristicTsColumn([{ name: "id" }, { name: "createdAt" }, { name: "ts" }])).toBe("createdAt");
    expect(heuristicTsColumn([{ name: "TS" }])).toBe("TS");
    expect(heuristicTsColumn([{ name: "id" }, { name: "title" }])).toBeNull();
  });

  it("heuristicTsColumn falls back to the wider timestamp-shaped rule", () => {
    expect(heuristicTsColumn([{ name: "id" }, { name: "adopted_at" }])).toBe("adopted_at");
    expect(heuristicTsColumn([{ name: "id" }, { name: "at" }])).toBe("at");
    expect(heuristicTsColumn([{ name: "id" }, { name: "adoptedAt" }])).toBe("adoptedAt");
    // creation-ish names still outrank the wider rule
    expect(heuristicTsColumn([{ name: "adopted_at" }, { name: "created_at" }])).toBe("created_at");
    // no false positives on at-ish words
    expect(heuristicTsColumn([{ name: "chat" }, { name: "format" }])).toBeNull();
  });

  it("parseTsValue handles epoch ms, epoch s, ISO text, junk", () => {
    expect(parseTsValue(1760400000000)).toBe(1760400000000);          // ms
    expect(parseTsValue(1760400000)).toBe(1760400000000);             // s -> ms
    expect(parseTsValue("2026-07-14T10:00:00Z")).toBe(Date.parse("2026-07-14T10:00:00Z"));
    expect(parseTsValue("banana")).toBeNull();
    expect(parseTsValue(42)).toBeNull();                              // too small to be an epoch
    expect(parseTsValue(null)).toBeNull();
  });
});

describe("buildSummary", () => {
  it("returns zeros when the app has no db", () => {
    const s = buildSummary(path.join(dataDir, "ghost", "db.sqlite"));
    expect(s.tables).toEqual([]);
    expect(s.kv.count).toBe(0);
    expect(s.files.count).toBe(0);
    expect(s.dbFileBytes).toBe(0);
    expect(s.recent).toEqual([]);
  });

  it("counts user tables, kv, files; merges heuristic recents; hides internals", () => {
    const db = getAppDb(dataDir, "plants");
    db.exec(`
      CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT, created_at INTEGER);
      CREATE TABLE plain (id INTEGER PRIMARY KEY, name TEXT);
      INSERT INTO notes (body, created_at) VALUES ('old', 1700000000000), ('new', 1760400000000);
      INSERT INTO plain (name) VALUES ('x'), ('y'), ('z');
    `);
    const now = Date.now();
    db.prepare("INSERT INTO _kv (key, value, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, NULL)")
      .run("cursor", "1", now - 5000, now - 5000);
    db.prepare(
      "INSERT INTO _files (slug, path, title, content_type, size, hash, metadata, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)"
    ).run("photo", "2026-07-14/photo-abc.jpg", "Photo", "image/jpeg", 2048, "h", null, now - 1000, now - 1000);
    const s = buildSummary(path.join(dataDir, "plants", "db.sqlite"));
    expect(s.tables.map((t) => ({ name: t.name, rows: t.rows }))).toEqual([
      { name: "notes", rows: 2 },
      { name: "plain", rows: 3 },
    ]);
    for (const t of s.tables) expect(t.sizeBytes === null || t.sizeBytes > 0).toBe(true); // dbstat may be absent
    expect(s.kv.count).toBe(1);
    expect(s.files).toEqual({ count: 1, totalBytes: 2048 });
    expect(s.dbFileBytes).toBeGreaterThan(0);
    // recent: newest-first; `plain` (no ts column) contributes nothing
    expect(s.recent.some((r) => r.store === "table" && r.label === "plain")).toBe(false);
    expect(s.recent.some((r) => r.store === "table" && r.label === "notes")).toBe(true);
    expect(s.recent.some((r) => r.store === "kv" && r.label === "cursor")).toBe(true);
    expect(s.recent.some((r) => r.store === "file" && r.label === "Photo")).toBe(true);
    const ats = s.recent.map((r) => r.at);
    expect([...ats].sort((a, b) => b - a)).toEqual(ats);
    expect(s.recent.length).toBeLessThanOrEqual(10);
  });
});
