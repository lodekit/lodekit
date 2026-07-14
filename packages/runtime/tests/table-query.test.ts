import { describe, it, expect } from "vitest";
import { buildRowsQuery, buildCountQuery } from "../dashboard/src/lib/table-query.js";
import { formatBytes, relativeTime } from "../dashboard/src/lib/format.js";

const COLS = [
  { name: "id", type: "INTEGER" },
  { name: "name", type: "TEXT" },
  { name: "note", type: "text" },
  { name: 'we"ird', type: "TEXT" },
  { name: "score", type: "REAL" },
];
const base = { table: "plants", columns: COLS, filters: [], sorts: [], search: "", limit: 50, offset: 0 };

describe("buildRowsQuery", () => {
  it("bare query selects * with limit/offset params", () => {
    const q = buildRowsQuery(base);
    expect(q.sql).toBe('SELECT * FROM "plants" LIMIT ? OFFSET ?');
    expect(q.params).toEqual([50, 0]);
  });

  it("rejects a column not in the schema", () => {
    expect(() => buildRowsQuery({ ...base, filters: [{ column: "evil", op: "eq", value: "1" }] })).toThrow();
    expect(() => buildRowsQuery({ ...base, sorts: [{ column: "evil", desc: false }] })).toThrow();
  });

  it("escapes quoted identifiers", () => {
    const q = buildRowsQuery({ ...base, sorts: [{ column: 'we"ird', desc: false }] });
    expect(q.sql).toContain('ORDER BY "we""ird" ASC');
  });

  it("compiles each operator; numeric values coerce on numeric columns", () => {
    const q = buildRowsQuery({
      ...base,
      filters: [
        { column: "id", op: "gte", value: "5" },
        { column: "name", op: "ne", value: "fern" },
        { column: "score", op: "lt", value: "1.5" },
        { column: "note", op: "isnull", value: "" },
      ],
    });
    expect(q.sql).toBe(
      'SELECT * FROM "plants" WHERE "id" >= ? AND "name" <> ? AND "score" < ? AND "note" IS NULL LIMIT ? OFFSET ?'
    );
    expect(q.params).toEqual([5, "fern", 1.5, 50, 0]);
  });

  it("contains uses escaped LIKE", () => {
    const q = buildRowsQuery({ ...base, filters: [{ column: "name", op: "contains", value: "50%_x" }] });
    expect(q.sql).toContain(`"name" LIKE ? ESCAPE '\\'`);
    expect(q.params[0]).toBe("%50\\%\\_x%");
  });

  it("search ORs LIKE across TEXT-affinity columns only", () => {
    const q = buildRowsQuery({ ...base, search: "fern" });
    expect(q.sql).toBe(
      `SELECT * FROM "plants" WHERE ("name" LIKE ? ESCAPE '\\' OR "note" LIKE ? ESCAPE '\\' OR "we""ird" LIKE ? ESCAPE '\\') LIMIT ? OFFSET ?`
    );
    expect(q.params).toEqual(["%fern%", "%fern%", "%fern%", 50, 0]);
  });

  it("search with no TEXT columns is a no-op", () => {
    const q = buildRowsQuery({ ...base, columns: [{ name: "id", type: "INTEGER" }], search: "x" });
    expect(q.sql).toBe('SELECT * FROM "plants" LIMIT ? OFFSET ?');
  });

  it("multi-sort preserves precedence order", () => {
    const q = buildRowsQuery({ ...base, sorts: [{ column: "score", desc: true }, { column: "id", desc: false }] });
    expect(q.sql).toContain('ORDER BY "score" DESC, "id" ASC');
  });
});

describe("buildCountQuery", () => {
  it("counts with the same WHERE, no order/limit", () => {
    const q = buildCountQuery({ table: "plants", columns: COLS, filters: [{ column: "id", op: "gt", value: "1" }], search: "" });
    expect(q.sql).toBe('SELECT COUNT(*) AS n FROM "plants" WHERE "id" > ?');
    expect(q.params).toEqual([1]);
  });
});

describe("format", () => {
  it("formatBytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(15_728_640)).toBe("15 MB");
  });
  it("relativeTime", () => {
    const now = 1_760_400_000_000;
    expect(relativeTime(now - 30_000, now)).toMatch(/second/);
    expect(relativeTime(now - 5 * 60_000, now)).toMatch(/minute/);
    expect(relativeTime(now - 3 * 3_600_000, now)).toMatch(/hour/);
  });
});
