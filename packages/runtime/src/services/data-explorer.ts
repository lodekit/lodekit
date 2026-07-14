// The data explorer's read side (spec 2026-07-14-data-explorer §2.1): one
// summary endpoint aggregating counts/sizes/recents across an app's stores.
// Strictly read-only — a short-lived readonly connection, like /select.
import fs from "node:fs";
import BetterSqlite3 from "better-sqlite3";
import { Hono } from "hono";
import { userSchema, type DbEnv } from "./db-store.js";
import { countEvents, queryEvents } from "../eventStore.js";

export const CATALOG_NAME = "data";

export interface RecentItem { store: "table" | "kv" | "file" | "event"; label: string; detail?: string; at: number }
export interface DataSummary {
  tables: { name: string; rows: number; sizeBytes: number | null }[];
  kv: { count: number };
  files: { count: number; totalBytes: number };
  events: { count: number };
  dbFileBytes: number;
  recent: RecentItem[];
}

const RECENT_PER_SOURCE = 5;
const RECENT_TOTAL = 10;
// Priority order; matched case-insensitively against column names.
const TS_COLUMNS = ["created_at", "createdat", "created", "inserted_at", "timestamp", "ts"];

export function heuristicTsColumn(columns: { name: string }[]): string | null {
  for (const want of TS_COLUMNS) {
    const hit = columns.find((c) => c.name.toLowerCase() === want);
    if (hit) return hit.name;
  }
  return null;
}

// Epoch numbers: >1e11 reads as ms, >1e8 as seconds; anything smaller is not a
// plausible timestamp. Strings go through Date.parse (ISO et al).
export function parseTsValue(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v > 1e11) return Math.floor(v);
    if (v > 1e8) return Math.floor(v * 1000);
    return null;
  }
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;

export function buildSummary(dbPath: string, appId: string): DataSummary {
  const eventsCount = countEvents({ ns: appId, source: appId });
  const recent: RecentItem[] = queryEvents({ ns: appId, source: appId, limit: RECENT_PER_SOURCE }).records.map(
    (r) => ({ store: "event" as const, label: r.type, at: r.ts })
  );
  const top = (items: RecentItem[]) => items.sort((a, b) => b.at - a.at).slice(0, RECENT_TOTAL);

  if (!fs.existsSync(dbPath)) {
    return {
      tables: [], kv: { count: 0 }, files: { count: 0, totalBytes: 0 },
      events: { count: eventsCount }, dbFileBytes: 0, recent: top(recent),
    };
  }

  const db = new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true });
  try {
    const now = Date.now();
    const schema = userSchema(db);

    // dbstat is a compile-time vtab; when absent, sizes degrade to null and the
    // UI falls back to the whole-file size.
    let sizes: Map<string, number> | null;
    try {
      sizes = new Map(
        (db.prepare("SELECT name, SUM(pgsize) AS s FROM dbstat GROUP BY name").all() as { name: string; s: number }[])
          .map((r) => [r.name, r.s])
      );
    } catch {
      sizes = null;
    }

    const tables = schema.tables.map((t) => ({
      name: t.name,
      rows: (db.prepare(`SELECT COUNT(*) AS c FROM ${quoteIdent(t.name)}`).get() as { c: number }).c,
      sizeBytes: sizes?.get(t.name) ?? null,
    }));

    const kvCount = (db.prepare("SELECT COUNT(*) AS c FROM _kv WHERE expires_at IS NULL OR expires_at > ?").get(now) as { c: number }).c;
    const f = db
      .prepare("SELECT COUNT(*) AS c, COALESCE(SUM(size), 0) AS b FROM _files WHERE expires_at IS NULL OR expires_at > ?")
      .get(now) as { c: number; b: number };

    for (const t of schema.tables) {
      const col = heuristicTsColumn(t.columns as { name: string }[]);
      if (!col) continue;
      const rows = db
        .prepare(`SELECT ${quoteIdent(col)} AS t FROM ${quoteIdent(t.name)} ORDER BY ${quoteIdent(col)} DESC LIMIT ?`)
        .all(RECENT_PER_SOURCE) as { t: unknown }[];
      for (const r of rows) {
        const at = parseTsValue(r.t);
        if (at != null) recent.push({ store: "table", label: t.name, detail: "row", at });
      }
    }
    recent.push(
      ...(db
        .prepare("SELECT key, created_at AS c FROM _kv WHERE expires_at IS NULL OR expires_at > ? ORDER BY created_at DESC LIMIT ?")
        .all(now, RECENT_PER_SOURCE) as { key: string; c: number }[]
      ).map((r) => ({ store: "kv" as const, label: r.key, at: r.c }))
    );
    recent.push(
      ...(db
        .prepare("SELECT slug, title, created_at AS c FROM _files WHERE expires_at IS NULL OR expires_at > ? ORDER BY created_at DESC LIMIT ?")
        .all(now, RECENT_PER_SOURCE) as { slug: string; title: string | null; c: number }[]
      ).map((r) => ({ store: "file" as const, label: r.title ?? r.slug, at: r.c }))
    );

    return {
      tables, kv: { count: kvCount }, files: { count: f.c, totalBytes: f.b },
      events: { count: eventsCount }, dbFileBytes: fs.statSync(dbPath).size, recent: top(recent),
    };
  } finally {
    db.close();
  }
}

// Chained style is normative; onError mirrors the other services (400 { error }).
export const dataRoutes = new Hono<DbEnv>()
  .onError((err, c) => c.json({ error: err instanceof Error ? err.message : String(err) }, 400))
  .get("/summary", (c) => c.json(buildSummary(c.var.dbPath, c.var.appId)));

export type DataRoutes = typeof dataRoutes;
