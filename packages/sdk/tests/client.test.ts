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

describe("watch", () => {
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

  it("filters by prefix, shares one EventSource, closes on last unsubscribe", () => {
    (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
    FakeEventSource.instances = [];
    const kv = client();
    const seen: string[] = [];
    const un1 = kv.watch("e:", (c) => seen.push(`1:${c.key}`));
    const un2 = kv.watch("", (c) => seen.push(`2:${c.key}`));
    expect(FakeEventSource.instances).toHaveLength(1);
    const es = FakeEventSource.instances[0];
    expect(es.url).toBe("http://x/api/apps/notes/events");
    es.dispatch("kv-store-change", { appId: "notes", key: "e:1", op: "set" });
    es.dispatch("kv-store-change", { appId: "notes", key: "other", op: "del" });
    expect(seen).toEqual(["1:e:1", "2:e:1", "2:other"]);
    un1();
    expect(es.closed).toBe(false);
    un2();
    expect(es.closed).toBe(true);
    delete (globalThis as { EventSource?: unknown }).EventSource;
  });
});

describe("server context", () => {
  it("watch throws a clear client-only error where EventSource is missing", () => {
    const kvClient = createClient({ baseUrl: "http://127.0.0.1:9", appId: "x" });
    expect(() => kvClient.kv.watch("", () => {})).toThrow(/client-only/);
  });

  it("kv singleton uses LODEKIT_BASE_URL outside a browser", async () => {
    process.env.LODEKIT_BASE_URL = "http://127.0.0.1:1";
    const { kv } = await import("../src/index.js?" + Date.now());
    await expect(kv.get("k")).rejects.toThrow();
    delete process.env.LODEKIT_BASE_URL;
  });
});
