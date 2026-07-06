import path from "node:path";
import type Database from "better-sqlite3";
import { getAppDb } from "../db.js";
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
