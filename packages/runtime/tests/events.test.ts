import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { emitEvent } from "../src/events.js";
import { initEventStore, closeEventStoreForTest } from "../src/eventStore.js";
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
    const rec = emitEvent({ app: "notes", kind: "service", component: "kv-store", type: "key-set", payload: { key: "k" } });
    expect(rec).toMatchObject({ app: "notes", kind: "service", component: "kv-store", type: "key-set" });
    expect(rec!.id).toBeGreaterThan(0);
    expect(received.global).toHaveLength(1);
    expect(received.scoped).toHaveLength(1);
  });

  it("scopes by app: null-app events reach global clients only", () => {
    emitEvent({ app: null, kind: "engine", component: "registry", type: "apps-changed" });
    expect(received.global).toHaveLength(1);
    expect(received.scoped).toHaveLength(0);
  });

  it("scopes by app: a sibling app's events never reach another scoped feed", () => {
    emitEvent({ app: "other", kind: "service", component: "kv-store", type: "key-set", payload: { key: "k" } });
    expect(received.global).toHaveLength(1);
    expect(received.scoped).toHaveLength(0); // scoped client is "notes"
  });

  it("rejects bad kind, bad grammar, forged app attribution, oversized payloads, and out-of-range ttl", () => {
    expect(emitEvent({ app: "notes", kind: "robot" as never, component: "kv-store", type: "x" })).toBeNull();
    expect(emitEvent({ app: "Notes!", kind: "service", component: "kv-store", type: "x" })).toBeNull();
    expect(emitEvent({ app: "notes", kind: "service", component: "No Caps", type: "x" })).toBeNull();
    expect(emitEvent({ app: "notes", kind: "service", component: "kv-store", type: "No Caps" })).toBeNull();
    expect(emitEvent({ app: "notes", kind: "app", component: "other", type: "x" })).toBeNull(); // kind=app ⇒ component=app
    expect(emitEvent({ app: "notes", kind: "app", component: "notes", type: "big", payload: { blob: "x".repeat(9000) } })).toBeNull();
    expect(emitEvent({ app: "notes", kind: "app", component: "notes", type: "t", ttl: 0 })).toBeNull();
    expect(emitEvent({ app: "notes", kind: "app", component: "notes", type: "t", ttl: 999_999_999 })).toBeNull();
    expect(received.global).toHaveLength(0); // nothing hit the wire
  });

  it("still broadcasts (id 0) when the store is down — delivery over history", () => {
    closeEventStoreForTest();
    const rec = emitEvent({ app: "notes", kind: "service", component: "kv-store", type: "key-set", payload: { key: "k" } });
    expect(rec!.id).toBe(0);
    expect(received.global).toHaveLength(1);
  });
});
