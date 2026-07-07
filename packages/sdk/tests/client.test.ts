import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClient } from "../src/client.js";

const fetchMock = vi.fn();
beforeEach(() => {
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  fetchMock.mockReset();
});

const client = () => createClient({ baseUrl: "http://x", appId: "notes" }).kv;
const okJson = (v: unknown) => ({ ok: true, json: async () => v });

describe("createClient kv ops", () => {
  it("get hits the scoped kv-store endpoint; undefined for missing, null preserved", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ found: true, value: null }));
    expect(await client().get("k")).toBeNull();
    expect(fetchMock.mock.calls[0][0]).toBe("http://x/api/apps/notes/kv-store/k");
    fetchMock.mockResolvedValueOnce(okJson({ found: false }));
    expect(await client().get("missing")).toBeUndefined();
  });

  it("set PUTs value and ttl; del DELETEs; has derives from found", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ ok: true }));
    await client().set("k", 5, { ttl: 60 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://x/api/apps/notes/kv-store/k");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ value: 5, ttl: 60 });

    fetchMock.mockResolvedValueOnce(okJson({ deleted: true }));
    expect(await client().del("k")).toBe(true);
    expect(fetchMock.mock.calls[1][1].method).toBe("DELETE");

    fetchMock.mockResolvedValueOnce(okJson({ found: true, value: 1 }));
    expect(await client().has("k")).toBe(true);
  });

  it("incr POSTs and returns the number; keys are URL-encoded", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ value: 3 }));
    expect(await client().incr("a/b", 2)).toBe(3);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://x/api/apps/notes/kv-store/incr");
    expect(JSON.parse(init.body)).toEqual({ key: "a/b", by: 2 });
    fetchMock.mockResolvedValueOnce(okJson({ found: false }));
    await client().get("a b");
    expect(fetchMock.mock.calls[1][0]).toBe("http://x/api/apps/notes/kv-store/a%20b");
  });

  it("list builds query params; throws server error messages", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ entries: [], nextCursor: null }));
    await client().list({ prefix: "e:", limit: 10, cursor: "e:5" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://x/api/apps/notes/kv-store?prefix=e%3A&limit=10&cursor=e%3A5"
    );
    fetchMock.mockResolvedValueOnce({ ok: false, statusText: "Bad Request", json: async () => ({ error: "invalid key" }) });
    await expect(client().get("k")).rejects.toThrow("invalid key");
  });
});

describe("collection", () => {
  it("add incrs _seq:<name> then sets <name>:<id>", async () => {
    const c = client().collection<{ n: string }>("expense");
    fetchMock.mockResolvedValueOnce(okJson({ value: 7 })); // incr
    fetchMock.mockResolvedValueOnce(okJson({ ok: true })); // set
    const r = await c.add({ n: "lunch" });
    expect(r).toEqual({ id: 7, value: { n: "lunch" } });
    expect(fetchMock.mock.calls[0][0]).toContain("/kv-store/incr");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).key).toBe("_seq:expense");
    expect(fetchMock.mock.calls[1][0]).toContain("/kv-store/expense%3A7");
  });

  it("all() pages to exhaustion and sorts by createdAt ascending", async () => {
    const c = client().collection("e");
    fetchMock.mockResolvedValueOnce(okJson({
      entries: [{ key: "e:10", value: "b", createdAt: 200, updatedAt: 200, expiresAt: null }],
      nextCursor: "e:10",
    }));
    fetchMock.mockResolvedValueOnce(okJson({
      entries: [{ key: "e:9", value: "a", createdAt: 100, updatedAt: 100, expiresAt: null }],
      nextCursor: null,
    }));
    expect(await c.all()).toEqual([{ id: 9, value: "a" }, { id: 10, value: "b" }]);
  });

  it("get/set/remove address <name>:<id>", async () => {
    const c = client().collection("e");
    fetchMock.mockResolvedValueOnce(okJson({ found: true, value: "v" }));
    expect(await c.get(3)).toBe("v");
    expect(fetchMock.mock.calls[0][0]).toContain("/kv-store/e%3A3");
    fetchMock.mockResolvedValueOnce(okJson({ ok: true }));
    await c.set(3, "w");
    fetchMock.mockResolvedValueOnce(okJson({ deleted: true }));
    expect(await c.remove(3)).toBe(true);
  });
});

describe("events", () => {
  class FakeEventSource {
    static instances: FakeEventSource[] = [];
    listeners = new Map<string, ((e: { data: string }) => void)[]>();
    closed = false;
    constructor(public url: string) { FakeEventSource.instances.push(this); }
    addEventListener(type: string, cb: (e: { data: string }) => void) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), cb]);
    }
    close() { this.closed = true; }
    dispatch(type: string, data: unknown) {
      for (const cb of this.listeners.get(type) ?? []) cb({ data: JSON.stringify(data) });
    }
  }
  const envelope = (over: Record<string, unknown>) => ({
    id: 1, ts: 1, ns: "notes", source: "notes", type: "note-added", payload: null, ...over,
  });

  it("watch filters by type, shares one EventSource, closes on last unsubscribe", () => {
    (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
    FakeEventSource.instances = [];
    const c = createClient({ baseUrl: "http://x", appId: "notes" });
    const seen: string[] = [];
    const un1 = c.events.watch({ type: "kv-store-change" }, (ev) => seen.push(`kv:${(ev.payload as { key: string }).key}`));
    const un2 = c.events.watch({}, (ev) => seen.push(`any:${ev.type}`));
    expect(FakeEventSource.instances).toHaveLength(1);
    const es = FakeEventSource.instances[0];
    expect(es.url).toBe("http://x/api/apps/notes/events");
    es.dispatch("event", envelope({ id: 2, source: "_platform", type: "kv-store-change", payload: { key: "k1", op: "set" } }));
    es.dispatch("event", envelope({ id: 3, type: "export-ready" }));
    expect(seen).toEqual(["kv:k1", "any:kv-store-change", "any:export-ready"]);
    un1();
    expect(es.closed).toBe(false);
    un2();
    expect(es.closed).toBe(true);
    delete (globalThis as { EventSource?: unknown }).EventSource;
  });

  it("watch accepts an array of types", () => {
    (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
    FakeEventSource.instances = [];
    const c = createClient({ baseUrl: "http://x", appId: "notes" });
    const seen: string[] = [];
    const un = c.events.watch({ type: ["ready", "error"] }, (ev) => seen.push(ev.type));
    const es = FakeEventSource.instances[0];
    es.dispatch("event", envelope({ id: 2, source: "_platform", type: "ready" }));
    es.dispatch("event", envelope({ id: 3, type: "note-added" }));
    es.dispatch("event", envelope({ id: 4, source: "_platform", type: "error", payload: { message: "boom" } }));
    expect(seen).toEqual(["ready", "error"]);
    un();
    delete (globalThis as { EventSource?: unknown }).EventSource;
  });

  it("emit POSTs to the scoped event-store and returns the envelope", async () => {
    const c = createClient({ baseUrl: "http://x", appId: "notes" });
    fetchMock.mockResolvedValueOnce(okJson(envelope({ id: 9, type: "export-ready", payload: { slug: "s" } })));
    const rec = await c.events.emit("export-ready", { slug: "s" }, { ttl: 60 });
    expect(rec.id).toBe(9);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://x/api/apps/notes/event-store");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ type: "export-ready", payload: { slug: "s" }, ttl: 60 });
  });

  it("list builds query params and returns records + next", async () => {
    const c = createClient({ baseUrl: "http://x", appId: "notes" });
    fetchMock.mockResolvedValueOnce(okJson({ records: [], next: null }));
    await c.events.list({ type: "kv-store-change", after: 5, limit: 10 });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://x/api/apps/notes/event-store?type=kv-store-change&after=5&limit=10"
    );
  });
});

describe("server context", () => {
  it("watch throws a clear client-only error where EventSource is missing", () => {
    const kvClient = createClient({ baseUrl: "http://127.0.0.1:9", appId: "x" });
    expect(() => kvClient.events.watch({}, () => {})).toThrow(/client-only/);
  });

  it("kv singleton uses LODEKIT_BASE_URL outside a browser", async () => {
    process.env.LODEKIT_BASE_URL = "http://127.0.0.1:1";
    const { kv } = await import("../src/index.js?" + Date.now());
    await kv.get("k").catch(() => {}); // fetchMock resolves undefined — rejection expected
    const fetched = fetchMock.mock.calls[0][0];
    // hc may pass a string or a Request — normalize either.
    const url = typeof fetched === "string" ? fetched : (fetched as Request).url;
    expect(url).toContain("127.0.0.1:1");
    delete process.env.LODEKIT_BASE_URL;
  });
});
