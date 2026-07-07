import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LevelName = keyof typeof LEVELS;
const NAME_OF: Record<number, LevelName> = { 10: "debug", 20: "info", 30: "warn", 40: "error" };

export interface LogRecord {
  id: number;
  ts: number;
  level: LevelName;
  source: string;
  appId: string | null;
  message: string;
  fields: Record<string, unknown> | null;
}

export interface LogWrite {
  level: LevelName;
  source: string;
  appId?: string | null;
  message: string;
  fields?: Record<string, unknown> | null;
}

export interface LogQuery {
  app?: string; // app id, or "platform" for app_id IS NULL
  level?: LevelName; // minimum
  source?: string;
  before?: number; // id cursor
  limit?: number;
  q?: string; // substring on message
}

const RETENTION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const RETENTION_MAX_ROWS = 200_000;

// Single-writer singleton: every record flows through the host process (spec §5).
let db: Database.Database | null = null;

// Opens (creating if needed) <stateDir>/logs.sqlite. Returns false and degrades to
// stderr-only when the store can't open — the runtime must still boot (spec §7).
export function initLogStore(stateDir: string): boolean {
  db?.close();
  db = null;
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    db = new Database(path.join(stateDir, "logs.sqlite"));
    db.pragma("journal_mode = WAL");
    db.exec(
      `CREATE TABLE IF NOT EXISTS logs (
        id      INTEGER PRIMARY KEY,
        ts      INTEGER NOT NULL,
        level   INTEGER NOT NULL,
        source  TEXT NOT NULL,
        app_id  TEXT,
        message TEXT NOT NULL,
        fields  TEXT
      );
      CREATE INDEX IF NOT EXISTS logs_app ON logs(app_id, id);
      CREATE INDEX IF NOT EXISTS logs_level ON logs(level, id);
      CREATE INDEX IF NOT EXISTS logs_ts ON logs(ts);`
    );
    return true;
  } catch (e) {
    db = null;
    process.stderr.write(`[logger] logs.sqlite unavailable — stderr-only logging: ${e}\n`);
    return false;
  }
}

interface Row { id: number; ts: number; level: number; source: string; app_id: string | null; message: string; fields: string | null }

const toRecord = (r: Row): LogRecord => ({
  id: r.id,
  ts: r.ts,
  level: NAME_OF[r.level] ?? "info",
  source: r.source,
  appId: r.app_id,
  message: r.message,
  fields: r.fields ? (JSON.parse(r.fields) as Record<string, unknown>) : null,
});

export function insertLog(w: LogWrite): LogRecord | null {
  if (!db) return null;
  try {
    const ts = Date.now();
    const info = db
      .prepare("INSERT INTO logs (ts, level, source, app_id, message, fields) VALUES (?, ?, ?, ?, ?, ?)")
      .run(ts, LEVELS[w.level], w.source, w.appId ?? null, w.message, w.fields ? JSON.stringify(w.fields) : null);
    return {
      id: Number(info.lastInsertRowid),
      ts,
      level: w.level,
      source: w.source,
      appId: w.appId ?? null,
      message: w.message,
      fields: w.fields ?? null,
    };
  } catch (e) {
    process.stderr.write(`[logger] log write failed: ${e}\n`);
    return null;
  }
}

export function queryLogs(opts: LogQuery = {}): { records: LogRecord[]; nextBefore: number | null } {
  if (!db) return { records: [], nextBefore: null };
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 100)), 1000);
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.app === "platform") where.push("app_id IS NULL");
  else if (opts.app) { where.push("app_id = ?"); params.push(opts.app); }
  if (opts.level) { where.push("level >= ?"); params.push(LEVELS[opts.level]); }
  if (opts.source) { where.push("source = ?"); params.push(opts.source); }
  if (opts.before != null) { where.push("id < ?"); params.push(opts.before); }
  if (opts.q) {
    where.push("message LIKE ? ESCAPE '\\'");
    params.push("%" + opts.q.replace(/[\\%_]/g, (m) => "\\" + m) + "%");
  }
  try {
    const rows = db
      .prepare(
        `SELECT id, ts, level, source, app_id, message, fields FROM logs
         ${where.length ? "WHERE " + where.join(" AND ") : ""}
         ORDER BY id DESC LIMIT ?`
      )
      .all(...params, limit) as Row[];
    const records = rows.map(toRecord);
    return { records, nextBefore: rows.length === limit ? records[records.length - 1].id : null };
  } catch (e) {
    process.stderr.write(`[logger] log query failed: ${e}\n`);
    return { records: [], nextBefore: null };
  }
}

export function sweepLogStore(opts: { maxAgeMs?: number; maxRows?: number } = {}): number {
  if (!db) return 0;
  const maxAgeMs = opts.maxAgeMs ?? RETENTION_MAX_AGE_MS;
  const maxRows = opts.maxRows ?? RETENTION_MAX_ROWS;
  try {
    let deleted = db.prepare("DELETE FROM logs WHERE ts < ?").run(Date.now() - maxAgeMs).changes;
    // Row at OFFSET maxRows (newest-first) is the first over the cap; NULL subselect (under cap) deletes nothing.
    deleted += db
      .prepare("DELETE FROM logs WHERE id <= (SELECT id FROM logs ORDER BY id DESC LIMIT 1 OFFSET ?)")
      .run(maxRows).changes;
    return deleted;
  } catch (e) {
    process.stderr.write(`[logger] log sweep failed: ${e}\n`);
    return 0;
  }
}

export function closeLogStoreForTest(): void {
  db?.close();
  db = null;
}
