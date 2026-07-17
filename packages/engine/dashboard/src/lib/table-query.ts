// Compiles explorer grid state into parameterized SQL for the engine's
// read-only /db-store/select door. Identifiers are only accepted when present
// in the server-reported schema and are always quote-escaped; values always
// travel as bound params. Dependency-free on purpose: this file is unit-tested
// from packages/engine/tests under the NodeNext tsc program.

export type FilterOp = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains" | "isnull" | "notnull";
export interface FilterRule { column: string; op: FilterOp; value: string }
export interface SortRule { column: string; desc: boolean }
export interface QueryColumn { name: string; type: string }
export interface RowsQueryInput {
  table: string;
  columns: QueryColumn[];
  filters: FilterRule[];
  sorts: SortRule[];
  search: string;
  limit: number;
  offset: number;
}

export const OP_LABELS: Record<FilterOp, string> = {
  eq: "=", ne: "≠", gt: ">", gte: "≥", lt: "<", lte: "≤",
  contains: "contains", isnull: "is null", notnull: "is not null",
};

const OP_SQL: Record<Exclude<FilterOp, "contains" | "isnull" | "notnull">, string> = {
  eq: "=", ne: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=",
};

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const escapeLike = (v: string) => v.replace(/[\\%_]/g, (m) => "\\" + m);
const NUMERIC = /INT|REAL|FLOA|DOUB|NUM|DEC/i;
const TEXTUAL = /CHAR|CLOB|TEXT/i;

function resolve(columns: QueryColumn[], name: string): QueryColumn {
  const col = columns.find((c) => c.name === name);
  if (!col) throw new Error(`unknown column: ${name}`);
  return col;
}

function coerce(col: QueryColumn, value: string): string | number {
  if (NUMERIC.test(col.type)) {
    const n = Number(value);
    if (Number.isFinite(n) && value.trim() !== "") return n;
  }
  return value;
}

function whereClause(i: { columns: QueryColumn[]; filters: FilterRule[]; search: string }): { where: string; params: (string | number | null)[] } {
  const parts: string[] = [];
  const params: (string | number | null)[] = [];
  for (const f of i.filters) {
    const col = resolve(i.columns, f.column);
    if (f.op === "isnull") parts.push(`${quote(col.name)} IS NULL`);
    else if (f.op === "notnull") parts.push(`${quote(col.name)} IS NOT NULL`);
    else if (f.op === "contains") {
      parts.push(`${quote(col.name)} LIKE ? ESCAPE '\\'`);
      params.push(`%${escapeLike(f.value)}%`);
    } else {
      parts.push(`${quote(col.name)} ${OP_SQL[f.op]} ?`);
      params.push(coerce(col, f.value));
    }
  }
  if (i.search) {
    const text = i.columns.filter((c) => TEXTUAL.test(c.type));
    if (text.length > 0) {
      parts.push(`(${text.map((c) => `${quote(c.name)} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
      for (const _ of text) params.push(`%${escapeLike(i.search)}%`);
    }
  }
  return { where: parts.length ? ` WHERE ${parts.join(" AND ")}` : "", params };
}

export function buildRowsQuery(i: RowsQueryInput): { sql: string; params: (string | number | null)[] } {
  const { where, params } = whereClause(i);
  let order = "";
  if (i.sorts.length > 0) {
    order = ` ORDER BY ${i.sorts.map((s) => `${quote(resolve(i.columns, s.column).name)} ${s.desc ? "DESC" : "ASC"}`).join(", ")}`;
  }
  return { sql: `SELECT * FROM ${quote(i.table)}${where}${order} LIMIT ? OFFSET ?`, params: [...params, i.limit, i.offset] };
}

export function buildCountQuery(i: Omit<RowsQueryInput, "sorts" | "limit" | "offset">): { sql: string; params: (string | number | null)[] } {
  const { where, params } = whereClause(i);
  return { sql: `SELECT COUNT(*) AS n FROM ${quote(i.table)}${where}`, params };
}
