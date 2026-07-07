import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  initEventStore,
  insertEvent,
  queryEvents,
  sweepEventStore,
  closeEventStoreForTest,
} from "../src/eventStore.js";

let dataDir: string;
beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-events-"));
  expect(initEventStore(dataDir)).toBe(true);
});
afterEach(() => {
  closeEventStoreForTest();
  fs.rmSync(dataDir, { recursive: true, force: true });
  vi.useRealTimers();
});

const write = (over: Partial<Parameters<typeof insertEvent>[0]> = {}) =>
  insertEvent({ ns: "notes", source: "notes", type: "note-added", ...over });

describe("eventStore", () => {
  it("creates data/_platform/events.sqlite", () => {
    expect(fs.existsSync(path.join(dataDir, "_platform", "events.sqlite"))).toBe(true);
  });

  it("inserts and returns the stored envelope with a monotonic id", () => {
    const a = write({ payload: { title: "one" } })!;
    const b = write()!;
    expect(a.id).toBeGreaterThan(0);
    expect(b.id).toBe(a.id + 1);
    expect(a).toMatchObject({ ns: "notes", source: "notes", type: "note-added", payload: { title: "one" } });
    expect(b.payload).toBeNull();
  });

  it("queries newest-first by default, ascending replay with after", () => {
    const a = write()!, b = write()!, c = write()!;
    const desc = queryEvents({ ns: "notes" });
    expect(desc.records.map((r) => r.id)).toEqual([c.id, b.id, a.id]);
    const asc = queryEvents({ ns: "notes", after: a.id });
    expect(asc.records.map((r) => r.id)).toEqual([b.id, c.id]);
  });

  it("filters by ns and type; paginates with before and reports next", () => {
    write({ ns: "notes", type: "kv-store-change" });
    write({ ns: "other" });
    write({ ns: "_platform", source: "_platform", type: "apps-changed" });
    expect(queryEvents({ ns: "notes" }).records).toHaveLength(1);
    expect(queryEvents({ type: "apps-changed" }).records[0].ns).toBe("_platform");
    const all = queryEvents({});
    expect(all.records).toHaveLength(3);
    const page = queryEvents({ limit: 2 });
    expect(page.records).toHaveLength(2);
    expect(page.next).toBe(page.records[1].id);
    const rest = queryEvents({ before: page.next! });
    expect(rest.records).toHaveLength(1);
    expect(rest.next).toBeNull();
  });

  it("ttl: expired events vanish from queries and are deleted by the sweep", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now());
    write({ ttl: 1 });
    write();
    vi.setSystemTime(Date.now() + 2_000);
    expect(queryEvents({ ns: "notes" }).records).toHaveLength(1);
    expect(sweepEventStore()).toBe(1);
  });

  it("sweep enforces max age and row cap", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now());
    write();
    vi.setSystemTime(Date.now() + 31 * 24 * 60 * 60 * 1000);
    write(); write(); write();
    expect(sweepEventStore()).toBe(1); // over max age
    expect(sweepEventStore({ maxRows: 2 })).toBe(1); // over cap, oldest-first
    expect(queryEvents({}).records).toHaveLength(2);
  });

  it("degrades to null/empty when the store cannot open", () => {
    closeEventStoreForTest();
    const blocked = path.join(dataDir, "blocked");
    fs.writeFileSync(blocked, ""); // a FILE where the dataDir should be
    expect(initEventStore(path.join(blocked, "nope"))).toBe(false);
    expect(write()).toBeNull();
    expect(queryEvents({})).toEqual({ records: [], next: null });
    expect(sweepEventStore()).toBe(0);
  });
});
