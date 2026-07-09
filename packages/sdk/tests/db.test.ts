import { describe, it, expect, vi, beforeEach } from "vitest";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { eq } from "drizzle-orm";
import { createRemoteDb } from "../src/db.js";

const plants = sqliteTable("plants", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const db = createRemoteDb({ baseUrl: "http://x", appId: "green", schema: { plants } });

beforeEach(() => fetchMock.mockReset());

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

describe("createRemoteDb", () => {
  it("select builds SQL client-side and maps raw proxy rows to typed objects", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ rows: [[1, "Fernando"]] }));
    const rows = await db.select().from(plants).where(eq(plants.id, 1));
    expect(rows).toEqual([{ id: 1, name: "Fernando" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://x/api/apps/green/db-store/query");
    const body = JSON.parse(init.body);
    expect(body.sql.toLowerCase()).toContain("select");
    expect(body.params).toEqual([1]);
    expect(["all", "values"]).toContain(body.method);
  });

  it("insert posts a run and surfaces the server's error message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ rows: [] }));
    await db.insert(plants).values({ id: 2, name: "Doris" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).method).toBe("run");

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "statements may not reference _-prefixed or sqlite_ tables" }), { status: 400 })
    );
    // drizzle-orm 0.45.2 unconditionally wraps driver-callback errors in
    // DrizzleQueryError ("Failed query: ..."); the server's message survives
    // as `.cause`, not the top-level `.message` — assert on the cause.
    const err: unknown = await db.insert(plants).values({ id: 3, name: "x" }).catch((e) => e);
    expect((err as { cause?: Error }).cause).toBeInstanceOf(Error);
    expect(((err as { cause: Error }).cause.message)).toMatch(/_-prefixed/);
  });

  it("batch posts all queries to /batch and unpacks per-query results", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [{ rows: [] }, { rows: [[1, "Fernando"]] }] }));
    const [, sel] = await db.batch([
      db.insert(plants).values({ id: 9, name: "Z" }),
      db.select().from(plants).where(eq(plants.id, 1)),
    ]);
    expect(sel).toEqual([{ id: 1, name: "Fernando" }]);
    expect(fetchMock.mock.calls[0][0]).toBe("http://x/api/apps/green/db-store/batch");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).queries).toHaveLength(2);
  });
});
