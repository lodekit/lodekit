import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  initEventStore,
  insertEvent,
  queryEvents,
  queryEventStats,
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
    write({ app: "notes", type: "key-set" });
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

  it("creates data/_platform user-only (0700)", () => {
    expect(fs.statSync(path.join(dataDir, "_platform")).mode & 0o777).toBe(0o700);
  });
});

describe("queryEventStats", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(6_000_000); // bucket-aligned for 60s buckets
  });
  afterEach(() => vi.useRealTimers());

  const seed = () => {
    insertEvent({ app: "notes", kind: "app", component: "notes", type: "note-added" });
    insertEvent({ app: "notes", kind: "service", component: "kv-store", type: "key-set", payload: { key: "k" } });
    insertEvent({ app: "other", kind: "service", component: "kv-store", type: "key-deleted" });
    insertEvent({ app: null, kind: "engine", component: "registry", type: "apps-changed" });
  };

  it("returns total and complete facet maps; null app keyed ''", () => {
    seed();
    const s = queryEventStats({ bucket: 60_000 });
    expect(s.total).toBe(4);
    expect(s.byKind).toEqual({ app: 1, service: 2, engine: 1 });
    expect(s.byComponent).toEqual({ notes: 1, "kv-store": 2, registry: 1 });
    expect(s.byType).toEqual({ "note-added": 1, "key-set": 1, "key-deleted": 1, "apps-changed": 1 });
    expect(s.byApp).toEqual({ notes: 2, other: 1, "": 1 });
  });

  it("buckets by floor(ts/bucket)*bucket with exact edges, ascending", () => {
    insertEvent({ app: null, kind: "engine", component: "registry", type: "apps-changed" }); // ts 6_000_000
    vi.setSystemTime(6_059_999);
    insertEvent({ app: null, kind: "engine", component: "registry", type: "apps-changed" }); // same bucket
    vi.setSystemTime(6_060_000);
    insertEvent({ app: null, kind: "engine", component: "registry", type: "apps-changed" }); // next bucket
    const s = queryEventStats({ bucket: 60_000 });
    expect(s.buckets).toEqual([{ t: 6_000_000, n: 2 }, { t: 6_060_000, n: 1 }]);
  });

  it("applies the same filters as queryEvents, closed-open on [since, until)", () => {
    seed();
    expect(queryEventStats({ bucket: 60_000, kind: "service" }).total).toBe(2);
    expect(queryEventStats({ bucket: 60_000, app: "notes", component: "kv-store" }).byType).toEqual({ "key-set": 1 });
    // all four rows share ts 6_000_000: since is inclusive, until exclusive
    expect(queryEventStats({ bucket: 60_000, since: 6_000_000, until: 6_000_001 }).total).toBe(4);
    expect(queryEventStats({ bucket: 60_000, until: 6_000_000 }).total).toBe(0);
    expect(queryEventStats({ bucket: 60_000, since: 6_000_001 }).total).toBe(0);
  });

  it("excludes expired-but-unswept rows at read time", () => {
    insertEvent({ app: "notes", kind: "app", component: "notes", type: "note-added", ttl: 1 });
    vi.setSystemTime(6_002_000);
    expect(queryEventStats({ bucket: 60_000 }).total).toBe(0);
  });

  it("returns the empty shape when the store is closed", () => {
    closeEventStoreForTest();
    expect(queryEventStats({ bucket: 60_000 })).toEqual({ total: 0, buckets: [], byKind: {}, byComponent: {}, byType: {}, byApp: {} });
  });
});
