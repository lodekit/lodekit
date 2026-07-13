import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initEventStore, insertEvent, queryEvents, countEvents, closeEventStoreForTest } from "../src/eventStore.js";

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

  it("countEvents counts with ns+source filters", () => {
    insertEvent({ ns: "plants", source: "plants", type: "watered" });
    insertEvent({ ns: "plants", source: "plants", type: "fed" });
    insertEvent({ ns: "plants", source: "_platform", type: "kv-store-change" });
    insertEvent({ ns: "other", source: "other", type: "x" });
    expect(countEvents({ ns: "plants", source: "plants" })).toBe(2);
    expect(countEvents({ ns: "plants" })).toBe(3);
    expect(countEvents()).toBe(4);
  });
});
