import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type Database from "better-sqlite3";
import { getAppDb } from "../db.js";
import { broadcast } from "../sse.js";
import type { Config } from "../config.js";

export const CATALOG_NAME = "file-store";

/** Validation/semantic error — mapped to HTTP 400 by the router. */
export class FilesError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "FilesError";
  }
}

export interface FileStat {
  slug: string;
  title: string | null;
  contentType: string;
  size: number;
  hash: string;
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
  url: string;
  path: string;
}

interface Row {
  slug: string;
  path: string;
  title: string | null;
  content_type: string;
  size: number;
  hash: string;
  metadata: string | null;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
}

export interface FilesCtx {
  db: Database.Database;
  dir: string; // data/<appId>/files (absolute)
  appId: string;
  urlBase: string; // <cfg.baseUrl>/api/apps/<appId>/file-store
}

const ensured = new WeakSet<Database.Database>();

export function getFiles(cfg: Config, appId: string): FilesCtx {
  const db = getAppDb(cfg.dataDir, appId);
  if (!ensured.has(db)) {
    ensureSchema(db);
    ensured.add(db);
  }
  return {
    db,
    dir: path.join(cfg.dataDir, appId, "files"),
    appId,
    urlBase: `${cfg.baseUrl}/api/apps/${appId}/${CATALOG_NAME}`,
  };
}

export function ensureSchema(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS _lodekit_files (
      slug         TEXT PRIMARY KEY,
      path         TEXT NOT NULL,
      title        TEXT,
      content_type TEXT NOT NULL,
      size         INTEGER NOT NULL,
      hash         TEXT NOT NULL,
      metadata     TEXT,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL,
      expires_at   INTEGER
    )`
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_files_expires ON _lodekit_files(expires_at) WHERE expires_at IS NOT NULL"
  );
}

// "Contas Jul 2026" -> "contas-jul-2026"; empty/unusable input -> "file".
export function slugify(input: string): string {
  const s = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128)
    .replace(/-+$/g, "");
  return s || "file";
}

// Derived slugs get -2, -3, ... on collision; explicit slugs never come here
// (an explicit slug that exists is a replace, not a collision).
export function deriveSlug(db: Database.Database, title?: string): string {
  const base = slugify(title ?? "").slice(0, 120); // room for the suffix
  const exists = db.prepare("SELECT 1 FROM _lodekit_files WHERE slug = ?");
  if (!exists.get(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!exists.get(candidate)) return candidate;
  }
}

const EXT: Record<string, string> = {
  "application/json": "json",
  "application/pdf": "pdf",
  "application/xml": "xml",
  "text/xml": "xml",
  "application/zip": "zip",
  "text/csv": "csv",
  "text/plain": "txt",
  "text/html": "html",
  "text/markdown": "md",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export function extFor(contentType: string): string | null {
  return EXT[contentType.split(";")[0].trim().toLowerCase()] ?? null;
}

// Put date in runtime-local time (spec §4.2) — never toISOString (UTC).
export function dateFolder(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const EVENT = `${CATALOG_NAME}-change`;

function emit(appId: string, slug: string, op: "put" | "del" | "expire"): void {
  broadcast(EVENT, { appId, slug, op }, appId);
}

function toStat(ctx: FilesCtx, r: Row): FileStat {
  return {
    slug: r.slug,
    title: r.title,
    contentType: r.content_type,
    size: r.size,
    hash: r.hash,
    metadata: r.metadata === null ? null : (JSON.parse(r.metadata) as Record<string, unknown>),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    expiresAt: r.expires_at,
    url: `${ctx.urlBase}/${r.slug}`,
    path: path.join(ctx.dir, r.path),
  };
}

// Removes a stored file's bytes (ignoring ENOENT) and prunes its date folder if emptied.
function removeBytes(ctx: FilesCtx, relPath: string): void {
  const abs = path.join(ctx.dir, relPath);
  fs.rmSync(abs, { force: true });
  try {
    fs.rmdirSync(path.dirname(abs)); // fails on ENOTEMPTY — that's the point
  } catch {
    // folder still has files (or never existed) — leave it
  }
}

// Raw row lookup with kv-style lazy TTL expiry (expired = missing; bytes removed too).
function liveRow(ctx: FilesCtx, slug: string): Row | undefined {
  const row = ctx.db.prepare("SELECT * FROM _lodekit_files WHERE slug = ?").get(slug) as Row | undefined;
  if (!row) return undefined;
  if (row.expires_at !== null && row.expires_at <= Date.now()) {
    ctx.db.prepare("DELETE FROM _lodekit_files WHERE slug = ?").run(slug);
    removeBytes(ctx, row.path);
    return undefined;
  }
  return row;
}

// liveRow + on-disk existence: a Finder-deleted file reconciles here (spec §4.5) —
// stale row removed, del event emitted, treated as missing.
function verifiedRow(ctx: FilesCtx, slug: string): Row | undefined {
  const row = liveRow(ctx, slug);
  if (!row) return undefined;
  if (!fs.existsSync(path.join(ctx.dir, row.path))) {
    ctx.db.prepare("DELETE FROM _lodekit_files WHERE slug = ?").run(slug);
    emit(ctx.appId, slug, "del");
    return undefined;
  }
  return row;
}

// Slugs become path segments on disk; the HTTP router validates them at the
// trust boundary, but the ops layer is exported — enforce here too so no
// future internal caller can smuggle a path.
const SLUG_RE = /^[a-z0-9-]{1,128}$/;

export function assertSlug(slug: string): string {
  if (!SLUG_RE.test(slug)) throw new FilesError(`invalid slug "${slug}"`);
  return slug;
}

export async function putFile(
  ctx: FilesCtx,
  body: NodeJS.ReadableStream,
  opts: { slug?: string; title?: string; contentType?: string; ttl?: number; metadata?: Record<string, unknown> } = {}
): Promise<FileStat> {
  const slug = opts.slug !== undefined ? assertSlug(opts.slug) : deriveSlug(ctx.db, opts.title);
  const contentType = opts.contentType || "application/octet-stream";
  const date = dateFolder();
  const dayDir = path.join(ctx.dir, date);
  fs.mkdirSync(dayDir, { recursive: true });

  // Stream to a hidden temp file while hashing; rename once complete (spec §4.3).
  const tmp = path.join(dayDir, `.tmp-${crypto.randomBytes(8).toString("hex")}`);
  const hasher = crypto.createHash("sha256");
  let size = 0;
  const tap = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      hasher.update(chunk);
      size += chunk.length;
      cb(null, chunk);
    },
  });
  try {
    await pipeline(body, tap, fs.createWriteStream(tmp));
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }

  const hash = hasher.digest("hex");
  const ext = extFor(contentType);
  const relPath = `${date}/${slug}-${hash.slice(0, 8)}${ext ? `.${ext}` : ""}`;
  fs.renameSync(tmp, path.join(ctx.dir, relPath));

  const old = liveRow(ctx, slug); // replace preserves created_at; expired row counts as new
  if (old && old.path !== relPath) removeBytes(ctx, old.path);

  const now = Date.now();
  const row: Row = {
    slug,
    path: relPath,
    title: opts.title ?? null,
    content_type: contentType,
    size,
    hash,
    metadata: opts.metadata === undefined ? null : JSON.stringify(opts.metadata),
    created_at: old ? old.created_at : now,
    updated_at: now,
    expires_at: opts.ttl != null ? now + opts.ttl * 1000 : null, // no ttl clears expiry
  };
  ctx.db
    .prepare(
      `INSERT INTO _lodekit_files (slug, path, title, content_type, size, hash, metadata, created_at, updated_at, expires_at)
       VALUES (@slug, @path, @title, @content_type, @size, @hash, @metadata, @created_at, @updated_at, @expires_at)
       ON CONFLICT(slug) DO UPDATE SET
         path = excluded.path, title = excluded.title, content_type = excluded.content_type,
         size = excluded.size, hash = excluded.hash, metadata = excluded.metadata,
         updated_at = excluded.updated_at, expires_at = excluded.expires_at`
    )
    .run(row);
  emit(ctx.appId, slug, "put");
  return toStat(ctx, row);
}

export function statFile(ctx: FilesCtx, slug: string): FileStat | undefined {
  const row = verifiedRow(ctx, slug);
  return row ? toStat(ctx, row) : undefined;
}

export function openFile(ctx: FilesCtx, slug: string): { stat: FileStat; abs: string } | undefined {
  const row = verifiedRow(ctx, slug);
  return row ? { stat: toStat(ctx, row), abs: path.join(ctx.dir, row.path) } : undefined;
}

export function deleteFile(ctx: FilesCtx, slug: string): boolean {
  const row = liveRow(ctx, slug);
  if (!row) return false;
  removeBytes(ctx, row.path);
  ctx.db.prepare("DELETE FROM _lodekit_files WHERE slug = ?").run(slug);
  emit(ctx.appId, slug, "del");
  return true;
}
