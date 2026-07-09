// The db-store service (spec 2026-07-09-db-store): the app's relational
// database. This module is the data plane (query/batch/select/schema); the
// schema push (applySchemaPush) lands beside it. Statement-text guards are
// deliberately "organized, not paranoid" (spec §2): apps are user-trusted
// local code; better-sqlite3 has no authorizer.
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import BetterSqlite3 from "better-sqlite3";
import { Hono, type MiddlewareHandler } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getAppDb } from "../db.js";
import type { Config } from "../config.js";
import { isValidAppId } from "../registry.js";
import { emitEvent, PLATFORM_NS, CHANGE_FEED_TTL_S } from "../events.js";
import { validationHook } from "../validation.js";

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
export function runQuery(db: Database.Database, q: ProxyQuery): { rows: unknown[] } {
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

const EVENT = `${CATALOG_NAME}-change`;
const WRITE_OP = /^\s*(insert|update|delete|replace)\b/i;
// drizzle emits regular SQL — the target table is extractable for the common
// shapes; misses (e.g. WITH-prefixed writes) just omit `table`.
const TABLE_OF = /\b(?:into|update|from)\s+["'`[]?([a-z0-9_$]+)/i;

function emitChange(appId: string, sql: string): void {
  const op = WRITE_OP.exec(sql)?.[1]?.toLowerCase();
  if (!op) return;
  const table = TABLE_OF.exec(sql)?.[1];
  emitEvent({
    ns: appId, source: PLATFORM_NS, type: EVENT,
    payload: table ? { op, table } : { op },
    ttl: CHANGE_FEED_TTL_S,
  });
}

// ---------- introspection ----------

export function userSchema(db: Database.Database): { tables: { name: string; columns: unknown[]; indexes: string[] }[] } {
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
    const ro = new BetterSqlite3(c.var.dbPath, { readonly: true, fileMustExist: true });
    try {
      const stmt = ro.prepare(sql);
      if (!stmt.reader) throw new DbError("only SELECT statements are allowed here");
      return c.json({ rows: stmt.all(...(params ?? [])) });
    } finally {
      ro.close();
    }
  });

export type DbRoutes = typeof dbRoutes;
