import type Database from "better-sqlite3";
import { Hono, type MiddlewareHandler } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getAppDb, openDbs } from "../db.js";
import type { Config } from "../config.js";
import { isValidAppId } from "../registry.js";
import { emitEvent, PLATFORM_NS, CHANGE_FEED_TTL_S } from "../events.js";
import { validationHook } from "../validation.js";
import { effectiveNumber } from "./settings.js";

export const CATALOG_NAME = "kv-store";

export interface Entry {
  key: string;
  value: unknown;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
}

/** Validation/semantic error — mapped to HTTP 400 by the router. */
export class KvError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "KvError";
  }
}

interface Row { key: string; value: string; created_at: number; updated_at: number; expires_at: number | null }

const toEntry = (r: Row): Entry => ({
  key: r.key,
  value: JSON.parse(r.value),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  expiresAt: r.expires_at,
});

export function getKv(dataDir: string, appId: string): Database.Database {
  return getAppDb(dataDir, appId); // schema guaranteed by the app-db migration chain
}

export function get(db: Database.Database, key: string): { found: boolean; entry?: Entry } {
  const row = db
    .prepare("SELECT key, value, created_at, updated_at, expires_at FROM _kv WHERE key = ?")
    .get(key) as Row | undefined;
  if (!row) return { found: false };
  if (row.expires_at !== null && row.expires_at <= Date.now()) {
    db.prepare("DELETE FROM _kv WHERE key = ?").run(key);
    return { found: false };
  }
  return { found: true, entry: toEntry(row) };
}

export function set(
  db: Database.Database,
  key: string,
  value: unknown,
  opts: { ttl?: number } = {}
): void {
  const now = Date.now();
  const expiresAt = opts.ttl != null ? now + opts.ttl * 1000 : null;
  db.prepare(
    `INSERT INTO _kv (key, value, created_at, updated_at, expires_at)
     VALUES (@key, @value, @now, @now, @expiresAt)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value, updated_at = excluded.updated_at, expires_at = excluded.expires_at`
  ).run({ key, value: JSON.stringify(value), now, expiresAt });
}

export function del(db: Database.Database, key: string): boolean {
  return db.prepare("DELETE FROM _kv WHERE key = ?").run(key).changes > 0;
}

// Synchronous transaction = race-free in the single runtime process.
// Preserves an existing TTL (Redis INCR semantics) by not touching expires_at.
export function incr(db: Database.Database, key: string, by = 1): number {
  const txn = db.transaction((): number => {
    const cur = get(db, key);
    let base = 0;
    if (cur.found) {
      if (typeof cur.entry!.value !== "number") throw new KvError(`incr: value at "${key}" is not a number`);
      base = cur.entry!.value;
    }
    const next = base + by;
    const now = Date.now();
    db.prepare(
      `INSERT INTO _kv (key, value, created_at, updated_at, expires_at)
       VALUES (?, ?, ?, ?, NULL)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, JSON.stringify(next), now, now);
    return next;
  });
  return txn();
}

export function list(
  db: Database.Database,
  opts: { prefix?: string; limit?: number; cursor?: string } = {}
): { entries: Entry[]; nextCursor: string | null } {
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 1000)), 1000);
  const like = (opts.prefix ?? "").replace(/[\\%_]/g, (m) => "\\" + m) + "%";
  const rows = db
    .prepare(
      `SELECT key, value, created_at, updated_at, expires_at FROM _kv
       WHERE key LIKE ? ESCAPE '\\' AND key > ?
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY key ASC LIMIT ?`
    )
    .all(like, opts.cursor ?? "", Date.now(), limit) as Row[];
  const entries = rows.map(toEntry);
  return { entries, nextCursor: rows.length === limit ? entries[entries.length - 1].key : null };
}

export function getMany(db: Database.Database, keys: string[]): Entry[] {
  const out: Entry[] = [];
  for (const key of keys) {
    const r = get(db, key);
    if (r.found) out.push(r.entry!);
  }
  return out;
}

export function setMany(
  db: Database.Database,
  entries: { key: string; value: unknown }[],
  opts: { ttl?: number } = {}
): void {
  const txn = db.transaction(() => {
    for (const e of entries) set(db, e.key, e.value, opts);
  });
  txn();
}

export function sweep(db: Database.Database): string[] {
  return (
    db
      .prepare("DELETE FROM _kv WHERE expires_at IS NOT NULL AND expires_at <= ? RETURNING key")
      .all(Date.now()) as { key: string }[]
  ).map((r) => r.key);
}

// Sweeps every open connection. Apps never opened since boot aren't swept
// until first access — lazy expiry on read covers correctness; the sweep is
// for space.
export function sweepAll(): { appId: string; keys: string[] }[] {
  const results: { appId: string; keys: string[] }[] = [];
  for (const { appId, db } of openDbs()) {
    const keys = sweep(db);
    if (keys.length > 0) results.push({ appId, keys });
  }
  return results;
}

const EVENT = `${CATALOG_NAME}-change`;

// Change-feed events: identity + op, never values (spec §4); service-set ttl keeps
// the bus's noisiest tenant from bloating the backed-up file.
function emit(appId: string, key: string, op: "set" | "del" | "expire"): void {
  emitEvent({ ns: appId, source: PLATFORM_NS, type: EVENT, payload: { key, op }, ttl: CHANGE_FEED_TTL_S });
}

export function sweepAllAndBroadcast(): void {
  for (const { appId, keys } of sweepAll()) {
    for (const key of keys) emit(appId, key, "expire");
  }
}

export type KvEnv = { Variables: { db: Database.Database; appId: string } };

// Applied by the parent router on /apps/:appId/kv-store/* — validates the app id
// and sets the better-sqlite3 handle in context vars.
export function withDb(cfg: Config): MiddlewareHandler<KvEnv> {
  return async (c, next) => {
    const appId = c.req.param("appId");
    if (!appId || !isValidAppId(appId)) return c.json({ error: "invalid app id" }, 400);
    c.set("db", getKv(cfg.dataDir, appId));
    c.set("appId", appId);
    await next();
  };
}

// zod 4: z.number() rejects NaN/Infinity by default — the old Number.isFinite checks fold in.
const keySchema = z.string().min(1).max(512);
const keyParam = z.object({ key: keySchema });
const ttlSchema = z.number().positive().optional();
const listQuery = z.object({
  prefix: z.string().optional(),
  limit: z.coerce.number().optional(),
  cursor: z.string().optional(),
});
const incrBody = z.object({ key: keySchema, by: z.number().optional() });
const getManyBody = z.object({ keys: z.array(keySchema) });
const hasValue = { message: "missing value" };
const putBody = z.object({ value: z.unknown(), ttl: ttlSchema }).refine((b) => "value" in b, hasValue);
const setManyBody = z.object({
  entries: z.array(z.object({ key: keySchema, value: z.unknown() }).refine((e) => "value" in e, hasValue)),
  ttl: ttlSchema,
});

// Chained style is normative: it is what makes hc route-type inference work.
// onError preserves the shipped semantics: every thrown error in a kv route
// (KvError from incr included) maps to a 400 { error } — the 400-vs-500 split
// stays parked in the backlog (issue #3).
export const kvRoutes = new Hono<KvEnv>()
  .onError((err, c) => c.json({ error: err instanceof Error ? err.message : String(err) }, 400))
  .get("/", zValidator("query", listQuery, validationHook), (c) => {
    const { prefix, limit, cursor } = c.req.valid("query");
    return c.json(list(c.var.db, { prefix, cursor, limit: limit ?? effectiveNumber("kv.list_limit", c.var.appId) }));
  })
  .post("/incr", zValidator("json", incrBody, validationHook), (c) => {
    const { key, by } = c.req.valid("json");
    const value = incr(c.var.db, key, by);
    emit(c.var.appId, key, "set");
    return c.json({ value });
  })
  .post("/get-many", zValidator("json", getManyBody, validationHook), (c) => {
    return c.json({ entries: getMany(c.var.db, c.req.valid("json").keys) });
  })
  .post("/set-many", zValidator("json", setManyBody, validationHook), (c) => {
    const { entries, ttl } = c.req.valid("json");
    setMany(c.var.db, entries as { key: string; value: unknown }[], { ttl });
    for (const e of entries) emit(c.var.appId, e.key, "set");
    return c.json({ ok: true });
  })
  .get("/:key", zValidator("param", keyParam, validationHook), (c) => {
    const r = get(c.var.db, c.req.valid("param").key);
    if (!r.found) return c.json({ found: false as const });
    const { value, createdAt, updatedAt, expiresAt } = r.entry!;
    return c.json({ found: true as const, value, createdAt, updatedAt, expiresAt });
  })
  .put("/:key", zValidator("param", keyParam, validationHook), zValidator("json", putBody, validationHook), (c) => {
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");
    set(c.var.db, key, body.value, { ttl: body.ttl });
    emit(c.var.appId, key, "set");
    return c.json({ ok: true });
  })
  .delete("/:key", zValidator("param", keyParam, validationHook), (c) => {
    const { key } = c.req.valid("param");
    const deleted = del(c.var.db, key);
    if (deleted) emit(c.var.appId, key, "del");
    return c.json({ deleted });
  });

export type KvRoutes = typeof kvRoutes;
