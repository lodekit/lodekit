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
  insertEvent({ app: "notes", kind: "app", component: "notes", type: "note-added", ...over });

describe("eventStore", () => {
  it("creates data/_platform/events.sqlite", () => {
    expect(fs.existsSync(path.join(dataDir, "_platform", "events.sqlite"))).toBe(true);
  });

  it("inserts and returns the stored envelope with a monotonic id", () => {
    const a = write({ payload: { title: "one" } })!;
    const b = write()!;
    expect(a.id).toBeGreaterThan(0);
    expect(b.id).toBe(a.id + 1);
    expect(a).toMatchObject({ app: "notes", kind: "app", component: "notes", type: "note-added", payload: { title: "one" } });
    expect(b.payload).toBeNull();
  });

  it("queries newest-first by default, ascending replay with after", () => {
    const a = write()!, b = write()!, c = write()!;
    const desc = queryEvents({ app: "notes" });
    expect(desc.records.map((r) => r.id)).toEqual([c.id, b.id, a.id]);
    const asc = queryEvents({ app: "notes", after: a.id });
    expect(asc.records.map((r) => r.id)).toEqual([b.id, c.id]);
  });

  it("filters by app and type; paginates with before and reports next", () => {
    write({ app: "notes", type: "kv-store-change" });
    write({ app: "other" });
    write({ app: null, kind: "engine", component: "registry", type: "apps-changed" });
    expect(queryEvents({ app: "notes" }).records).toHaveLength(1);
    expect(queryEvents({ type: "apps-changed" }).records[0].app).toBeNull();
    const all = queryEvents({});
    expect(all.records).toHaveLength(3);
    const page = queryEvents({ limit: 2 });
    expect(page.records).toHaveLength(2);
    expect(page.next).toBe(page.records[1].id);
    const rest = queryEvents({ before: page.next! });
    expect(rest.records).toHaveLength(1);
    expect(rest.next).toBeNull();
  });

  it("filters by kind, component, and a [since, until) ts range", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000);
    insertEvent({ app: "notes", kind: "service", component: "kv-store", type: "key-set", payload: { key: "a" } });
    vi.setSystemTime(2_000);
    insertEvent({ app: null, kind: "engine", component: "registry", type: "apps-changed" });
    vi.setSystemTime(3_000);
    insertEvent({ app: "notes", kind: "app", component: "notes", type: "export-finished" });
    expect(queryEvents({ kind: "engine" }).records.map((r) => r.type)).toEqual(["apps-changed"]);
    expect(queryEvents({ component: "kv-store" }).records.map((r) => r.type)).toEqual(["key-set"]);
    expect(queryEvents({ since: 2_000, until: 3_000 }).records.map((r) => r.type)).toEqual(["apps-changed"]);
    expect(queryEvents({ since: 2_000 }).records.map((r) => r.type)).toEqual(["export-finished", "apps-changed"]);
    vi.useRealTimers();
  });

  it("ttl: expired events vanish from queries and are deleted by the sweep", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now());
    write({ ttl: 1 });
    write();
    vi.setSystemTime(Date.now() + 2_000);
    expect(queryEvents({ app: "notes" }).records).toHaveLength(1);
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

  it("appAges: an app's own retention age wins over the global age", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000_000);
    write({ app: "p" });
    write({ app: "a" });
    write({ app: "b" });
    vi.setSystemTime(1_000_000 + 3 * 24 * 60 * 60 * 1000); // all three now 3 days old
    sweepEventStore({ maxAgeMs: 2 * 24 * 60 * 60 * 1000, appAges: new Map([["a", 7 * 24 * 60 * 60 * 1000]]) });
    const left = queryEvents({}).records.map((r) => r.app);
    expect(left).toEqual(["a"]); // "p" and "b" swept by the 2d global age; "a" kept by its 7d override
  });

  it("sweeps platform-wide (app null) rows past the global age", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000);
    insertEvent({ app: null, kind: "engine", component: "registry", type: "apps-changed" });
    vi.setSystemTime(1_000 + 31 * 24 * 60 * 60 * 1000);
    expect(sweepEventStore({ appAges: new Map([["notes", 1]]) })).toBeGreaterThanOrEqual(1);
    expect(queryEvents({ type: "apps-changed" }).records).toHaveLength(0);
    vi.useRealTimers();
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
