// The db-store service (spec 2026-07-09-db-store): the app's relational
// database. This module is the data plane (query/batch/select/schema); the
// schema push (applySchemaPush) lands beside it. Statement-text guards are
// deliberately "organized, not paranoid" (spec §2): apps are user-trusted
// local code; the sqlite driver has no authorizer.
import fs from "node:fs";
import path from "node:path";
import { openReadonlyDb, type ManagedDb } from "../sqlite.js";
import { Hono, type MiddlewareHandler } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getAppDb } from "../db.js";
import type { Config } from "../config.js";
import { isValidAppId } from "../registry.js";
import { emitEvent, CHANGE_FEED_TTL_S } from "../events.js";
import { validationHook } from "../validation.js";
import { emitLog } from "../logger.js";

export const CATALOG_NAME = "db-store";

/** Validation/semantic error — mapped to HTTP 400 by the router. */
export class DbError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "DbError";
  }
}

// ---------- statement guards ----------

const ALLOWED_FIRST = /^\s*(select|insert|update|delete|replace|with)\b/i;
// Internal/system table reference after a structural keyword. String literals
// containing "_foo" don't match (no keyword before them) — good enough at the
// local-trust posture; sqlite_master et al are also caught here.
const INTERNAL_REF = /\b(?:from|into|update|join|table)\s+["'`[]?(?:_|sqlite_)/i;

export function assertAllowed(sql: string): void {
  if (!ALLOWED_FIRST.test(sql)) throw new DbError("only SELECT/INSERT/UPDATE/DELETE/REPLACE/WITH statements are allowed — schema changes come from src/db.ts");
  if (INTERNAL_REF.test(sql)) throw new DbError("statements may not reference _-prefixed or sqlite_ tables");
}

// ---------- query execution (the sqlite-proxy contract) ----------

export type ProxyMethod = "run" | "all" | "get" | "values";
export interface ProxyQuery { sql: string; params: (string | number | null)[]; method: ProxyMethod }

// Rows are RAW ARRAYS (drizzle's sqlite-proxy wire shape): all/values ->
// unknown[][]; get -> flat unknown[] (empty when missing); run -> [].
export function runQuery(db: ManagedDb, q: ProxyQuery): { rows: unknown[] } {
  assertAllowed(q.sql);
  const stmt = db.prepare(q.sql); // single statement only — prepare throws on trailing SQL
  if (q.method === "run" && !stmt.reader) {
    stmt.run(...q.params);
    return { rows: [] };
  }
  if (q.method === "get") {
    const row = stmt.raw().get(...q.params) as unknown[] | undefined;
    return { rows: row ?? [] };
  }
  return { rows: stmt.raw().all(...q.params) as unknown[] };
}

// ---------- change feed ----------

const WRITE_OP = /^\s*(insert|update|delete|replace)\b/i;
// drizzle emits regular SQL — the target table is extractable for the common
// shapes; misses (e.g. WITH-prefixed writes) just omit `table`.
const TABLE_OF = /\b(?:into|update|from)\s+["'`[]?([a-z0-9_$]+)/i;

// Write ops become past-tense facts (spec §4); REPLACE rides WRITE_OP's existing match.
const ROW_FACT: Record<string, string> = {
  insert: "row-inserted",
  update: "row-updated",
  delete: "row-deleted",
  replace: "row-replaced",
};

function emitChange(appId: string, sql: string): void {
  const op = WRITE_OP.exec(sql)?.[1]?.toLowerCase();
  const type = op ? ROW_FACT[op] : undefined;
  if (!type) return;
  const table = TABLE_OF.exec(sql)?.[1];
  emitEvent({
    app: appId, kind: "service", component: CATALOG_NAME, type,
    payload: table ? { table } : undefined,
    ttl: CHANGE_FEED_TTL_S,
  });
}

// ---------- introspection ----------

export function userSchema(db: ManagedDb): { tables: { name: string; columns: unknown[]; indexes: string[] }[] } {
  const tables = (db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name")
    .all() as { name: string }[]).map((r) => r.name);
  return {
    tables: tables.map((name) => ({
      name,
      columns: (db.prepare(`PRAGMA table_info(${JSON.stringify(name)})`).all() as {
        name: string; type: string; notnull: number; dflt_value: unknown; pk: number;
      }[]).map((c) => ({ name: c.name, type: c.type, notNull: c.notnull === 1, default: c.dflt_value ?? null, pk: c.pk > 0 })),
      indexes: (db.prepare(`PRAGMA index_list(${JSON.stringify(name)})`).all() as { name: string }[])
        .map((i) => i.name).filter((n) => !n.startsWith("sqlite_")),
    })),
  };
}

// ---------- middleware + routes ----------

export type DbEnv = { Variables: { appId: string; dataDir: string; dbPath: string } };

export function withDbStore(cfg: Config): MiddlewareHandler<DbEnv> {
  return async (c, next) => {
    const appId = c.req.param("appId");
    if (!appId || !isValidAppId(appId)) return c.json({ error: "invalid app id" }, 400);
    c.set("appId", appId);
    c.set("dataDir", cfg.dataDir);
    c.set("dbPath", path.join(cfg.dataDir, appId, "db.sqlite"));
    // GET /schema and /select must not materialize a data dir for an app that
    // never stored anything — they open lazily; /query and /batch do create.
    await next();
  };
}

const paramsSchema = z.array(z.union([z.string(), z.number(), z.null()]));
const querySchema = z.object({
  sql: z.string().min(1).max(100_000),
  params: paramsSchema,
  method: z.enum(["run", "all", "get", "values"]),
});
const batchSchema = z.object({ queries: z.array(querySchema).min(1).max(100) });
const selectSchema = z.object({ sql: z.string().min(1).max(100_000), params: paramsSchema.optional() });

export const dbRoutes = new Hono<DbEnv>()
  .onError((err, c) => c.json({ error: err instanceof Error ? err.message : String(err) }, 400))
  .get("/schema", (c) => {
    if (!fs.existsSync(c.var.dbPath)) return c.json({ tables: [] });
    return c.json(userSchema(getAppDb(c.var.dataDir, c.var.appId)));
  })
  .post("/query", zValidator("json", querySchema, validationHook), (c) => {
    const q = c.req.valid("json");
    const db = getAppDb(c.var.dataDir, c.var.appId);
    const result = runQuery(db, q);
    emitChange(c.var.appId, q.sql);
    return c.json(result);
  })
  .post("/batch", zValidator("json", batchSchema, validationHook), (c) => {
    const { queries } = c.req.valid("json");
    const db = getAppDb(c.var.dataDir, c.var.appId);
    const txn = db.transaction(() => queries.map((q) => runQuery(db, q)));
    const results = txn();
    for (const q of queries) emitChange(c.var.appId, q.sql);
    return c.json({ results });
  })
  // SELECT-only, on a short-lived READ-ONLY connection: the guarantee is the
  // connection's, not a SQL parse's (spec §8/§9). Rows come back as objects —
  // this door serves agents and the future data explorer, not the proxy driver.
  .post("/select", zValidator("json", selectSchema, validationHook), (c) => {
    const { sql, params } = c.req.valid("json");
    assertAllowed(sql);
    if (!fs.existsSync(c.var.dbPath)) return c.json({ error: "no database for this app yet" }, 404);
    const ro = openReadonlyDb(c.var.dbPath);
    try {
      const stmt = ro.prepare(sql);
      if (!stmt.reader) throw new DbError("only SELECT statements are allowed here");
      return c.json({ rows: stmt.all(...(params ?? [])) });
    } finally {
      ro.close();
    }
  });

export type DbRoutes = typeof dbRoutes;

// ---------- schema push (spec §7): declared schema -> live database ----------

export type PushResult =
  | { status: "applied"; statements: number }
  | { status: "gated"; message: string }
  | { status: "noop" };

// ADD is anchored right after the table identifier (one \S+ token — drizzle
// emits backticked names): a greedy `.*` would let a quoted identifier like
// `last add` inside a DROP COLUMN statement classify as additive.
const ADDITIVE = [/^create table\b/i, /^create (unique )?index\b/i, /^alter table \S+ add(\s+column)?\s/i];
const isAdditive = (s: string) => ADDITIVE.some((re) => re.test(s.trim()));

const EXPAND_COPY =
  "Destructive schema changes don't auto-apply. Iterate additively (expand-copy): add the new column/table, " +
  "copy data across in app code, switch reads, stop writing the old one. (Accepting destructive migrations is on the roadmap.)";

function emitSchemaFact(appId: string, type: "schema-applied" | "schema-gated", message?: string): void {
  emitEvent({ app: appId, kind: "service", component: CATALOG_NAME, type, payload: message ? { message } : undefined, ttl: CHANGE_FEED_TTL_S });
}

// The db-manifest hook's handler (wired in server.ts). Contract mirrors the
// settings manifest: a load error keeps the previous schema; internal
// namespaces are skipped; an app that declares nothing never materializes a
// database. Returns the outcome for tests/observability; callers may ignore it.
export async function applySchemaPush(
  dataDir: string,
  appId: string,
  snapshot: unknown,
  loadError?: string
): Promise<PushResult> {
  if (!isValidAppId(appId)) return { status: "noop" }; // _dashboard et al
  if (loadError) {
    const message = `src/db.ts failed to load — keeping the previous schema`;
    emitLog("error", "db-store", message, { stack: loadError }, appId);
    emitSchemaFact(appId, "schema-gated", message);
    return { status: "gated", message };
  }
  const tables =
    snapshot && typeof snapshot === "object" && "tables" in snapshot
      ? Object.keys((snapshot as { tables: Record<string, unknown> }).tables ?? {})
      : null;
  if (tables === null) {
    const message = "src/db.ts produced no schema snapshot — keeping the previous schema";
    emitLog("error", "db-store", message, undefined, appId);
    emitSchemaFact(appId, "schema-gated", message);
    return { status: "gated", message };
  }
  // Never materialize a data dir for an app that declares no tables and has none.
  if (tables.length === 0 && !fs.existsSync(path.join(dataDir, appId, "db.sqlite"))) return { status: "noop" };

  const bad = tables.filter((t) => t.startsWith("_") || t.startsWith("sqlite_"));
  if (bad.length > 0) {
    const message = `table names may not start with "_" or "sqlite_": ${bad.join(", ")}`;
    emitLog("error", "db-store", message, undefined, appId);
    emitSchemaFact(appId, "schema-gated", message);
    return { status: "gated", message };
  }

  const { generateSQLiteDrizzleJson, generateSQLiteMigration } = await import("drizzle-kit/api");
  const db = getAppDb(dataDir, appId);
  const prevRow = db.prepare("SELECT snapshot FROM _schema WHERE id = 1").get() as { snapshot: string } | undefined;
  let prev: Awaited<ReturnType<typeof generateSQLiteDrizzleJson>>;
  if (prevRow) {
    try {
      prev = JSON.parse(prevRow.snapshot);
    } catch (e) {
      const message = `stored schema snapshot is corrupt — keeping the previous schema: ${e instanceof Error ? e.message : String(e)}`;
      emitLog("error", "db-store", message, undefined, appId);
      emitSchemaFact(appId, "schema-gated", message);
      return { status: "gated", message };
    }
  } else {
    prev = await generateSQLiteDrizzleJson({});
  }
  let statements: string[];
  try {
    statements = await generateSQLiteMigration(prev, snapshot as Parameters<typeof generateSQLiteMigration>[1]);
  } catch (e) {
    const message = `schema diff failed: ${e instanceof Error ? e.message : String(e)}`;
    emitLog("error", "db-store", message, undefined, appId);
    emitSchemaFact(appId, "schema-gated", message);
    return { status: "gated", message };
  }
  if (statements.length === 0) return { status: "noop" };

  const destructive = statements.filter((s) => !isAdditive(s));
  if (destructive.length > 0) {
    const message = `schema change gated — would require:\n${destructive.join(";\n")}\n${EXPAND_COPY}`;
    emitLog("error", "db-store", message, undefined, appId);
    emitSchemaFact(appId, "schema-gated", message);
    return { status: "gated", message };
  }

  try {
    const txn = db.transaction(() => {
      for (const s of statements) db.exec(s);
      db.prepare(
        `INSERT INTO _schema (id, snapshot, updated_at) VALUES (1, @snap, @now)
         ON CONFLICT(id) DO UPDATE SET snapshot = excluded.snapshot, updated_at = excluded.updated_at`
      ).run({ snap: JSON.stringify(snapshot), now: Date.now() });
    });
    txn();
  } catch (e) {
    // A statement the diff produced but the database refused (e.g. a table that
    // pre-exists outside snapshot lineage) — same surface as the gate (spec §7).
    const message = `schema apply failed: ${e instanceof Error ? e.message : String(e)}`;
    emitLog("error", "db-store", message, undefined, appId);
    emitSchemaFact(appId, "schema-gated", message);
    return { status: "gated", message };
  }
  emitLog("info", "db-store", `schema applied (${statements.length} statement${statements.length === 1 ? "" : "s"})`, undefined, appId);
  emitSchemaFact(appId, "schema-applied");
  return { status: "applied", statements: statements.length };
}
