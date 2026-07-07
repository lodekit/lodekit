import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { emitEvent, PLATFORM_NS } from "../src/events.js";
import { initEventStore, queryEvents, closeEventStoreForTest } from "../src/eventStore.js";
import { addClient } from "../src/sse.js";

let dataDir: string;
const received: { global: string[]; scoped: string[] } = { global: [], scoped: [] };
let removeGlobal: () => void, removeScoped: () => void;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-emit-"));
  initEventStore(dataDir);
  received.global = [];
  received.scoped = [];
  removeGlobal = addClient((p) => received.global.push(p));
  removeScoped = addClient((p) => received.scoped.push(p), "notes");
});
afterEach(() => {
  removeGlobal();
  removeScoped();
  closeEventStoreForTest();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("emitEvent", () => {
  it("persists and broadcasts the envelope under the single 'event' wire name", () => {
    const rec = emitEvent({ ns: "notes", source: PLATFORM_NS, type: "export-ready" })!;
    expect(rec.id).toBeGreaterThan(0);
    expect(queryEvents({ ns: "notes" }).records[0]).toMatchObject({ type: "export-ready", source: "_platform" });
    expect(received.global[0]).toContain("event: event\n");
    expect(received.global[0]).toContain('"type":"export-ready"');
    // ns is the scoping key: the app's channel got its own event…
    expect(received.scoped).toHaveLength(1);
  });

  it("scopes by ns: _platform events reach global clients only", () => {
    emitEvent({ ns: PLATFORM_NS, source: PLATFORM_NS, type: "apps-changed" });
    expect(received.global).toHaveLength(1);
    expect(received.scoped).toHaveLength(0);
  });

  it("rejects bad grammar, oversized payloads, and out-of-range ttl", () => {
    expect(emitEvent({ ns: "Notes!", source: "notes", type: "x" })).toBeNull();
    expect(emitEvent({ ns: "notes", source: "notes", type: "No Caps" })).toBeNull();
    expect(emitEvent({ ns: "notes", source: "notes", type: "big", payload: { blob: "x".repeat(9000) } })).toBeNull();
    expect(emitEvent({ ns: "notes", source: "notes", type: "t", ttl: 0 })).toBeNull();
    expect(emitEvent({ ns: "notes", source: "notes", type: "t", ttl: 999_999_999 })).toBeNull();
    expect(received.global).toHaveLength(0); // nothing hit the wire
  });

  it("still broadcasts (id 0) when the store is down — delivery over history", () => {
    closeEventStoreForTest();
    const rec = emitEvent({ ns: "notes", source: "notes", type: "note-added" })!;
    expect(rec.id).toBe(0);
    expect(received.global[0]).toContain('"id":0');
  });
});
