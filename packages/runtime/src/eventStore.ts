import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { emitLog } from "./logger.js";
import { applyMigrations } from "./migrations.js";
import { EVENTS_CHAIN } from "./migrations/platform.js";

export interface EventRecord {
  id: number;
  ts: number;
  ns: string;
  source: string;
  type: string;
  payload: Record<string, unknown> | null;
}

export interface EventWrite {
  ns: string;
  source: string;
  type: string;
  payload?: Record<string, unknown> | null;
  ttl?: number; // seconds
}

export interface EventQuery {
  ns?: string;
  type?: string;
  source?: string;
  after?: number; // ascending replay: id > after
  before?: number; // newest-first pagination: id < before
  limit?: number;
}

const RETENTION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const RETENTION_MAX_ROWS = 50_000;

// Single-writer singleton: every event flows through the host process (spec §4).
let db: Database.Database | null = null;

// Opens (creating if needed) <dataDir>/_platform/events.sqlite — the bus lives in the
// platform's internal namespace inside the Backup tree (precious; spec §1/§3). Returns
// false and degrades to broadcast-only when it can't open — the runtime must still boot.
export function initEventStore(dataDir: string): boolean {
  db?.close();
  db = null;
  try {
    const dir = path.join(dataDir, "_platform");
    fs.mkdirSync(dir, { recursive: true });
    db = new Database(path.join(dir, "events.sqlite"));
    db.pragma("journal_mode = WAL");
    applyMigrations(db, EVENTS_CHAIN);
    return true;
  } catch (e) {
    db = null;
    process.stderr.write(`[events] events.sqlite unavailable — live-only event bus: ${e}\n`);
    return false;
  }
}

interface Row { id: number; ts: number; ns: string; source: string; type: string; payload: string | null }

const toRecord = (r: Row): EventRecord => ({
  id: r.id,
  ts: r.ts,
  ns: r.ns,
  source: r.source,
  type: r.type,
  payload: r.payload ? (JSON.parse(r.payload) as Record<string, unknown>) : null,
});

export function insertEvent(w: EventWrite): EventRecord | null {
  if (!db) return null;
  try {
    const ts = Date.now();
    const info = db
      .prepare("INSERT INTO events (ts, ns, source, type, payload, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(ts, w.ns, w.source, w.type, w.payload ? JSON.stringify(w.payload) : null, w.ttl ? ts + w.ttl * 1000 : null);
    return { id: Number(info.lastInsertRowid), ts, ns: w.ns, source: w.source, type: w.type, payload: w.payload ?? null };
  } catch (e) {
    process.stderr.write(`[events] event write failed: ${e}\n`);
    emitLog("error", "event-store", "event write failed — history gap", { stack: String(e) });
    return null;
  }
}

// `after` reads oldest-first from an offset (replay); otherwise newest-first with
// `before` as the pagination cursor. `next` continues whichever mode ran (null = no more).
// Expired-but-unswept rows are excluded at read time (kv-style lazy expiry, spec §6).
export function queryEvents(opts: EventQuery = {}): { records: EventRecord[]; next: number | null } {
  if (!db) return { records: [], next: null };
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 100)), 1000);
  const asc = opts.after != null;
  const where: string[] = ["(expires_at IS NULL OR expires_at > ?)"];
  const params: unknown[] = [Date.now()];
  if (opts.ns) { where.push("ns = ?"); params.push(opts.ns); }
  if (opts.type) { where.push("type = ?"); params.push(opts.type); }
  if (opts.source) { where.push("source = ?"); params.push(opts.source); }
  if (asc) { where.push("id > ?"); params.push(opts.after); }
  else if (opts.before != null) { where.push("id < ?"); params.push(opts.before); }
  try {
    const rows = db
      .prepare(
        `SELECT id, ts, ns, source, type, payload FROM events
         WHERE ${where.join(" AND ")}
         ORDER BY id ${asc ? "ASC" : "DESC"} LIMIT ?`
      )
      .all(...params, limit) as Row[];
    const records = rows.map(toRecord);
    return { records, next: rows.length === limit ? records[records.length - 1].id : null };
  } catch (e) {
    process.stderr.write(`[events] event query failed: ${e}\n`);
    return { records: [], next: null };
  }
}

export function sweepEventStore(opts: { maxAgeMs?: number; maxRows?: number; nsAges?: Map<string, number> } = {}): number {
  if (!db) return 0;
  const maxAgeMs = opts.maxAgeMs ?? RETENTION_MAX_AGE_MS;
  const maxRows = opts.maxRows ?? RETENTION_MAX_ROWS;
  const nsAges = opts.nsAges ?? new Map<string, number>();
  try {
    let deleted = db.prepare("DELETE FROM events WHERE expires_at IS NOT NULL AND expires_at <= ?").run(Date.now()).changes;
    // Per-ns override ages first, then the global age for every other ns.
    for (const [ns, ageMs] of nsAges) {
      deleted += db.prepare("DELETE FROM events WHERE ns = ? AND ts < ?").run(ns, Date.now() - ageMs).changes;
    }
    const skip = [...nsAges.keys()];
    deleted += db
      .prepare(`DELETE FROM events WHERE ts < ? AND ns NOT IN (${skip.map(() => "?").join(",") || "''"})`)
      .run(Date.now() - maxAgeMs, ...skip).changes;
    // Row at OFFSET maxRows (newest-first) is the first over the cap; NULL subselect (under cap) deletes nothing.
    deleted += db
      .prepare("DELETE FROM events WHERE id <= (SELECT id FROM events ORDER BY id DESC LIMIT 1 OFFSET ?)")
      .run(maxRows).changes;
    return deleted;
  } catch (e) {
    process.stderr.write(`[events] event sweep failed: ${e}\n`);
    return 0;
  }
}

export function closeEventStoreForTest(): void {
  db?.close();
  db = null;
}
