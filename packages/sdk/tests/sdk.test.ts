import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db, store } from "../src/index.js";

const fetchMock = vi.fn();

beforeEach(() => {
  (globalThis as unknown as { window: unknown }).window = {
    location: { pathname: "/notes/" },
  };
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  fetchMock.mockReset();
});
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("@lodekit/sdk db", () => {
  it("query posts sql to the app-scoped endpoint and returns rows", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ rows: [{ id: 1 }] }) });
    const rows = await db.query("SELECT 1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/apps/notes/db/query");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ sql: "SELECT 1", params: [] });
    expect(rows).toEqual([{ id: 1 }]);
  });

  it("exec returns changes + lastInsertRowid", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ changes: 1, lastInsertRowid: 7 }) });
    expect(await db.exec("INSERT INTO t VALUES (1)")).toEqual({ changes: 1, lastInsertRowid: 7 });
  });

  it("throws the server error message on a non-ok response", async () => {
    fetchMock.mockResolvedValue({ ok: false, statusText: "Bad Request", json: async () => ({ error: "no such table" }) });
    await expect(db.query("SELECT * FROM nope")).rejects.toThrow("no such table");
  });
});

describe("@lodekit/sdk store", () => {
  it("get returns the parsed value", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ value: "USD" }) });
    expect(await store.get("currency")).toBe("USD");
  });

  it("get returns null when the value is null", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ value: null }) });
    expect(await store.get("missing")).toBeNull();
  });

  it("set PUTs the JSON-wrapped value", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await store.set("currency", "EUR");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/apps/notes/store/currency");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ value: "EUR" });
  });
});
