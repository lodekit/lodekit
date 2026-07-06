# file-store (Files) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the file-store service — slug-identified, date-sharded blob storage per app — with SDK `files` handle, SSE change feed, TTL sweep, MCP read tools, an example-app export flow, and skill docs, per `docs/specs/2026-07-06-file-store-design.md`.

**Architecture:** One new runtime service module (`services/file-store.ts`: schema + ops + Hono router) following the kv-store v2 convention. Bytes live at `data/<app-id>/files/<YYYY-MM-DD>/<slug>-<hash8>.<ext>`; the `_lodekit_files` table in the per-app SQLite db is authoritative. The SDK gains a `files` handle sharing one scoped EventSource with `kv.watch`. MCP gains two read-only tools on the SDK core.

**Tech Stack:** Node 22 / tsx (buildless), Hono (chained routers — normative, enables `hc` type inference), better-sqlite3 (synchronous), zod v4 + `@hono/zod-validator`, vitest, TanStack Start (example app).

## Global Constraints

- Spec: `docs/specs/2026-07-06-file-store-design.md` — normative for every semantic below.
- Package manager is **pnpm**, run from the repo root. Never run `pnpm install` with CWD inside `manager/`.
- Runtime/SDK/MCP are **buildless** — no build step, no new dependencies.
- Commit directly to the current branch (`service`). **No merge commits. No `Co-Authored-By` trailers.**
- Surgical changes: touch only what the task names; match existing style.
- Slug charset (everywhere): `^[a-z0-9-]{1,128}$`. Catalog name: `file-store`. SDK handle: `files`. SSE event: `file-store-change`.
- Hono routers use the **chained** style (`new Hono().get(...).post(...)`) — required for `hc` route-type inference.
- All service errors thrown in routes map to 400 `{ error }` via `.onError` (kv-store precedent; the 400-vs-500 split stays parked).
- Run a task's tests with: `pnpm --filter @lodekit/runtime exec vitest run tests/<file>.test.ts`
- Full suite (must pass before the final commit of each task): `pnpm --filter @lodekit/runtime test`

---

### Task 1: Service module core — schema, slug derivation, naming helpers

**Files:**
- Create: `packages/runtime/src/services/file-store.ts`
- Test: `packages/runtime/tests/file-store.test.ts`

**Interfaces:**
- Consumes: `getAppDb(dataDir, appId)` from `../db.js`; `Config` from `../config.js`.
- Produces (later tasks rely on these exact names):
  - `CATALOG_NAME = "file-store"`
  - `class FilesError extends Error`
  - `interface FileStat { slug; title: string | null; contentType: string; size: number; hash: string; metadata: Record<string, unknown> | null; createdAt: number; updatedAt: number; expiresAt: number | null; url: string; path: string }`
  - `interface FilesCtx { db: Database.Database; dir: string; appId: string; urlBase: string }`
  - `getFiles(cfg: Config, appId: string): FilesCtx`
  - `ensureSchema(db): void`, `slugify(input: string): string`, `deriveSlug(db, title?: string): string`, `extFor(contentType: string): string | null`, `dateFolder(d?: Date): string`

- [ ] **Step 1: Write the failing tests**

Create `packages/runtime/tests/file-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Config } from "../src/config.js";
import {
  getFiles,
  slugify,
  deriveSlug,
  extFor,
  dateFolder,
  type FilesCtx,
} from "../src/services/file-store.js";

let root: string, cfg: Config;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-files-"));
  cfg = {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: path.join(root, ".cache"),
    port: 0,
    baseUrl: "http://lodekit.localhost:7777",
  };
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  vi.useRealTimers();
});

const ctx = (appId = "app"): FilesCtx => getFiles(cfg, appId);

describe("slugify", () => {
  it("lowercases, folds diacritics, collapses runs, trims dashes", () => {
    expect(slugify("Contas Jul 2026")).toBe("contas-jul-2026");
    expect(slugify("Relatório --- Aérea")).toBe("relatorio-aerea");
    expect(slugify("  ...  ")).toBe("file");
    expect(slugify("")).toBe("file");
  });
  it("caps at 128 chars without a trailing dash", () => {
    const s = slugify("a".repeat(200));
    expect(s.length).toBeLessThanOrEqual(128);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("deriveSlug", () => {
  it("returns the base slug when free, suffixes -2, -3 on collision", () => {
    const c = ctx();
    expect(deriveSlug(c.db, "My Report")).toBe("my-report");
    c.db
      .prepare(
        `INSERT INTO _lodekit_files (slug, path, content_type, size, hash, created_at, updated_at)
         VALUES ('my-report', 'x', 'text/plain', 0, 'h', 0, 0)`
      )
      .run();
    expect(deriveSlug(c.db, "My Report")).toBe("my-report-2");
    c.db
      .prepare(
        `INSERT INTO _lodekit_files (slug, path, content_type, size, hash, created_at, updated_at)
         VALUES ('my-report-2', 'x', 'text/plain', 0, 'h', 0, 0)`
      )
      .run();
    expect(deriveSlug(c.db, "My Report")).toBe("my-report-3");
  });
});

describe("naming helpers", () => {
  it("maps common content types to extensions, null for unknown", () => {
    expect(extFor("text/csv")).toBe("csv");
    expect(extFor("application/pdf")).toBe("pdf");
    expect(extFor("text/csv; charset=utf-8")).toBe("csv");
    expect(extFor("application/x-mystery")).toBeNull();
  });
  it("formats the local date folder", () => {
    expect(dateFolder(new Date(2026, 6, 6))).toBe("2026-07-06");
  });
});

describe("getFiles / ensureSchema", () => {
  it("creates the table idempotently and builds the ctx", () => {
    const c = ctx("finance");
    const cols = (c.db.prepare("PRAGMA table_info(_lodekit_files)").all() as { name: string }[]).map((x) => x.name);
    expect(cols).toEqual(
      expect.arrayContaining(["slug", "path", "title", "content_type", "size", "hash", "metadata", "created_at", "updated_at", "expires_at"])
    );
    expect(c.dir).toBe(path.join(cfg.dataDir, "finance", "files"));
    expect(c.urlBase).toBe("http://lodekit.localhost:7777/api/apps/finance/file-store");
    getFiles(cfg, "finance"); // second call must not throw
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/file-store.test.ts`
Expected: FAIL — cannot resolve `../src/services/file-store.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/runtime/src/services/file-store.ts`:

```ts
import fs from "node:fs";
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
    .replace(/[\u0300-\u036f]/g, "")
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
```

(The unused `fs` import lands in Task 2 — include it now to avoid churn, or add it in Task 2; either way the file must lint clean at commit.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/file-store.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/services/file-store.ts packages/runtime/tests/file-store.test.ts
git commit -m "feat(runtime): file-store service core — schema, slug derivation, naming helpers"
```

---

### Task 2: Write/read/delete ops — streaming put, replace semantics, lazy reconciliation

**Files:**
- Modify: `packages/runtime/src/services/file-store.ts`
- Test: `packages/runtime/tests/file-store.test.ts` (append)

**Interfaces:**
- Consumes: Task 1's `FilesCtx`, `deriveSlug`, `extFor`, `dateFolder`; `broadcast(event, data, appId)` from `../sse.js`.
- Produces:
  - `putFile(ctx, body: NodeJS.ReadableStream, opts: { slug?: string; title?: string; contentType?: string; ttl?: number; metadata?: Record<string, unknown> }): Promise<FileStat>`
  - `statFile(ctx, slug: string): FileStat | undefined`
  - `openFile(ctx, slug: string): { stat: FileStat; abs: string } | undefined`
  - `deleteFile(ctx, slug: string): boolean`
  - All SSE emits happen **inside ops** (module-level `emit(appId, slug, op)`), unlike kv-store's in-router emits — ops here need `ctx.appId` anyway for reconciliation.

- [ ] **Step 1: Write the failing tests**

Append to `packages/runtime/tests/file-store.test.ts` (extend the import from `../src/services/file-store.js` with `putFile, statFile, openFile, deleteFile`; add `import { Readable } from "node:stream";` and `import crypto from "node:crypto";`):

```ts
const put = (c: FilesCtx, body: string, opts: Parameters<typeof putFile>[2] = {}) =>
  putFile(c, Readable.from(body), opts);
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

describe("putFile", () => {
  it("streams to a date-sharded, hash-suffixed path and returns the stat", async () => {
    const c = ctx();
    const stat = await put(c, "hello", { slug: "greeting", contentType: "text/plain", title: "Greeting" });
    const rel = `${dateFolder()}/greeting-${sha("hello").slice(0, 8)}.txt`;
    expect(stat).toMatchObject({
      slug: "greeting",
      title: "Greeting",
      contentType: "text/plain",
      size: 5,
      hash: sha("hello"),
      metadata: null,
      expiresAt: null,
      url: `${c.urlBase}/greeting`,
      path: path.join(c.dir, rel),
    });
    expect(fs.readFileSync(path.join(c.dir, rel), "utf8")).toBe("hello");
    expect(fs.readdirSync(path.join(c.dir, dateFolder())).some((f) => f.startsWith(".tmp-"))).toBe(false);
  });

  it("derives the slug from the title when none is given", async () => {
    const c = ctx();
    expect((await put(c, "x", { title: "Contas Jul 2026" })).slug).toBe("contas-jul-2026");
    expect((await put(c, "y", { title: "Contas Jul 2026" })).slug).toBe("contas-jul-2026-2");
  });

  it("stores custom metadata and ttl", async () => {
    const c = ctx();
    const before = Date.now();
    const stat = await put(c, "x", { slug: "meta", metadata: { period: "2026-07" }, ttl: 60 });
    expect(stat.metadata).toEqual({ period: "2026-07" });
    expect(stat.expiresAt).toBeGreaterThanOrEqual(before + 60_000);
  });

  it("replace: repoints, deletes old bytes, preserves created_at, clears ttl", async () => {
    const c = ctx();
    const first = await put(c, "v1", { slug: "report", contentType: "text/plain", ttl: 60 });
    const second = await put(c, "v2-longer", { slug: "report", contentType: "text/plain" });
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).toBeGreaterThanOrEqual(first.updatedAt);
    expect(second.expiresAt).toBeNull(); // put without ttl clears expiry
    expect(fs.existsSync(first.path)).toBe(false); // old bytes gone
    expect(fs.readFileSync(second.path, "utf8")).toBe("v2-longer");
    expect(statFile(c, "report")!.hash).toBe(sha("v2-longer"));
  });

  it("replace with identical content on the same day lands on the same path", async () => {
    const c = ctx();
    const a = await put(c, "same", { slug: "dup", contentType: "text/plain" });
    const b = await put(c, "same", { slug: "dup", contentType: "text/plain" });
    expect(b.path).toBe(a.path);
    expect(fs.readFileSync(a.path, "utf8")).toBe("same");
  });

  it("a failing body stream removes the temp file and leaves the previous version", async () => {
    const c = ctx();
    await put(c, "v1", { slug: "keep", contentType: "text/plain" });
    const bad = new Readable({
      read() {
        this.destroy(new Error("boom"));
      },
    });
    await expect(putFile(c, bad, { slug: "keep" })).rejects.toThrow();
    expect(statFile(c, "keep")!.hash).toBe(sha("v1"));
    expect(fs.readdirSync(path.join(c.dir, dateFolder())).some((f) => f.startsWith(".tmp-"))).toBe(false);
  });
});

describe("statFile / openFile / deleteFile", () => {
  it("stat of a missing slug is undefined; delete returns false", async () => {
    const c = ctx();
    expect(statFile(c, "nope")).toBeUndefined();
    expect(deleteFile(c, "nope")).toBe(false);
  });

  it("openFile returns the absolute path for serving", async () => {
    const c = ctx();
    await put(c, "bytes", { slug: "doc", contentType: "text/plain" });
    const r = openFile(c, "doc")!;
    expect(fs.readFileSync(r.abs, "utf8")).toBe("bytes");
    expect(r.stat.slug).toBe("doc");
  });

  it("delete removes bytes, row, and the emptied date folder", async () => {
    const c = ctx();
    const stat = await put(c, "x", { slug: "gone" });
    expect(deleteFile(c, "gone")).toBe(true);
    expect(fs.existsSync(stat.path)).toBe(false);
    expect(fs.existsSync(path.dirname(stat.path))).toBe(false); // date folder pruned
    expect(statFile(c, "gone")).toBeUndefined();
  });

  it("Finder-deleted bytes reconcile lazily: stat -> undefined, row cleaned", async () => {
    const c = ctx();
    const stat = await put(c, "x", { slug: "vanished" });
    fs.rmSync(stat.path);
    expect(statFile(c, "vanished")).toBeUndefined();
    expect(c.db.prepare("SELECT 1 FROM _lodekit_files WHERE slug = 'vanished'").get()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/file-store.test.ts`
Expected: FAIL — `putFile` (etc.) not exported.

- [ ] **Step 3: Write the implementation**

Add to `packages/runtime/src/services/file-store.ts` (new imports at top: `import crypto from "node:crypto";`, `import { Transform } from "node:stream";`, `import { pipeline } from "node:stream/promises";`, `import { broadcast } from "../sse.js";`):

```ts
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

export async function putFile(
  ctx: FilesCtx,
  body: NodeJS.ReadableStream,
  opts: { slug?: string; title?: string; contentType?: string; ttl?: number; metadata?: Record<string, unknown> } = {}
): Promise<FileStat> {
  const slug = opts.slug ?? deriveSlug(ctx.db, opts.title);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/file-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/services/file-store.ts packages/runtime/tests/file-store.test.ts
git commit -m "feat(runtime): file-store ops — streaming put, replace semantics, lazy reconciliation"
```

---

### Task 3: list, copy, move

**Files:**
- Modify: `packages/runtime/src/services/file-store.ts`
- Test: `packages/runtime/tests/file-store.test.ts` (append)

**Interfaces:**
- Produces:
  - `listFiles(ctx, opts?: { prefix?: string; limit?: number; cursor?: string }): { entries: FileStat[]; nextCursor: string | null }` — SQLite-only (documented drift: no disk check), slug-ascending keyset pagination, default limit 100, max 1000, expired filtered out.
  - `copyFile(ctx, from: string, to: string): FileStat | undefined` (`undefined` = source missing)
  - `moveFile(ctx, from: string, to: string): FileStat | undefined`

- [ ] **Step 1: Write the failing tests**

Append to `packages/runtime/tests/file-store.test.ts` (extend the module import with `listFiles, copyFile, moveFile`):

```ts
describe("listFiles", () => {
  it("filters by prefix, paginates by cursor, answers from SQLite only", async () => {
    const c = ctx();
    await put(c, "a", { slug: "export-a" });
    await put(c, "b", { slug: "export-b" });
    await put(c, "c", { slug: "other" });
    const page1 = listFiles(c, { prefix: "export-", limit: 1 });
    expect(page1.entries.map((e) => e.slug)).toEqual(["export-a"]);
    expect(page1.nextCursor).toBe("export-a");
    const page2 = listFiles(c, { prefix: "export-", cursor: page1.nextCursor! });
    expect(page2.entries.map((e) => e.slug)).toEqual(["export-b"]);
    expect(page2.nextCursor).toBeNull();
    // documented drift (spec §4.5): a Finder-deleted file still lists until first read
    fs.rmSync(statFile(c, "other")!.path);
    expect(listFiles(c).entries.map((e) => e.slug)).toContain("other");
  });
});

describe("copyFile / moveFile", () => {
  it("copy duplicates bytes under a new slug, copying descriptive fields with fresh timestamps", async () => {
    const c = ctx();
    const src = await put(c, "data", {
      slug: "orig",
      title: "Orig",
      contentType: "text/plain",
      metadata: { k: 1 },
      ttl: 60,
    });
    const dup = copyFile(c, "orig", "twin")!;
    expect(dup.slug).toBe("twin");
    expect(dup).toMatchObject({ title: "Orig", contentType: "text/plain", metadata: { k: 1 }, hash: src.hash });
    expect(dup.expiresAt).toBe(src.expiresAt); // absolute expiry copied as-is
    expect(dup.createdAt).toBeGreaterThanOrEqual(src.createdAt);
    expect(fs.readFileSync(dup.path, "utf8")).toBe("data");
    expect(fs.readFileSync(src.path, "utf8")).toBe("data"); // source untouched
    expect(path.basename(dup.path)).toBe(`twin-${src.hash.slice(0, 8)}.txt`);
  });

  it("move re-keys the row and renames the file in its date folder, preserving created_at", async () => {
    const c = ctx();
    const src = await put(c, "data", { slug: "old-name", contentType: "text/plain" });
    const moved = moveFile(c, "old-name", "new-name")!;
    expect(moved.createdAt).toBe(src.createdAt);
    expect(fs.existsSync(src.path)).toBe(false);
    expect(path.dirname(moved.path)).toBe(path.dirname(src.path)); // same date folder
    expect(path.basename(moved.path)).toBe(`new-name-${src.hash.slice(0, 8)}.txt`);
    expect(statFile(c, "old-name")).toBeUndefined();
    expect(statFile(c, "new-name")!.hash).toBe(src.hash);
  });

  it("copy/move onto an existing destination replaces it (old bytes deleted)", async () => {
    const c = ctx();
    await put(c, "src", { slug: "a", contentType: "text/plain" });
    const victim = await put(c, "victim", { slug: "b", contentType: "text/plain" });
    copyFile(c, "a", "b");
    expect(fs.existsSync(victim.path)).toBe(false);
    expect(statFile(c, "b")!.hash).toBe(sha("src"));
  });

  it("copy/move of a missing source returns undefined", () => {
    const c = ctx();
    expect(copyFile(c, "nope", "x")).toBeUndefined();
    expect(moveFile(c, "nope", "x")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/file-store.test.ts`
Expected: FAIL — `listFiles` (etc.) not exported.

- [ ] **Step 3: Write the implementation**

Add to `packages/runtime/src/services/file-store.ts`:

```ts
export function listFiles(
  ctx: FilesCtx,
  opts: { prefix?: string; limit?: number; cursor?: string } = {}
): { entries: FileStat[]; nextCursor: string | null } {
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 100)), 1000);
  const like = (opts.prefix ?? "").replace(/[\\%_]/g, (m) => "\\" + m) + "%";
  const rows = ctx.db
    .prepare(
      `SELECT * FROM _lodekit_files
       WHERE slug LIKE ? ESCAPE '\\' AND slug > ?
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY slug ASC LIMIT ?`
    )
    .all(like, opts.cursor ?? "", Date.now(), limit) as Row[];
  const entries = rows.map((r) => toStat(ctx, r));
  return { entries, nextCursor: rows.length === limit ? entries[entries.length - 1].slug : null };
}

export function copyFile(ctx: FilesCtx, from: string, to: string): FileStat | undefined {
  const src = verifiedRow(ctx, from);
  if (!src) return undefined;
  const existing = liveRow(ctx, to);
  if (existing) removeBytes(ctx, existing.path); // destination replace, put semantics

  const date = dateFolder();
  fs.mkdirSync(path.join(ctx.dir, date), { recursive: true });
  const relPath = `${date}/${to}-${src.hash.slice(0, 8)}${path.extname(src.path)}`;
  fs.copyFileSync(path.join(ctx.dir, src.path), path.join(ctx.dir, relPath));

  const now = Date.now();
  const row: Row = { ...src, slug: to, path: relPath, created_at: now, updated_at: now };
  ctx.db
    .prepare(
      `INSERT INTO _lodekit_files (slug, path, title, content_type, size, hash, metadata, created_at, updated_at, expires_at)
       VALUES (@slug, @path, @title, @content_type, @size, @hash, @metadata, @created_at, @updated_at, @expires_at)
       ON CONFLICT(slug) DO UPDATE SET
         path = excluded.path, title = excluded.title, content_type = excluded.content_type,
         size = excluded.size, hash = excluded.hash, metadata = excluded.metadata,
         created_at = excluded.created_at, updated_at = excluded.updated_at, expires_at = excluded.expires_at`
    )
    .run(row);
  emit(ctx.appId, to, "put");
  return toStat(ctx, row);
}

export function moveFile(ctx: FilesCtx, from: string, to: string): FileStat | undefined {
  if (from === to) return statFile(ctx, from);
  const src = verifiedRow(ctx, from);
  if (!src) return undefined;
  const existing = liveRow(ctx, to);
  if (existing) removeBytes(ctx, existing.path);
  ctx.db.prepare("DELETE FROM _lodekit_files WHERE slug = ?").run(to);

  // Rename in place: stays in its current date folder, created_at survives (spec §6).
  const relPath = `${path.dirname(src.path)}/${to}-${src.hash.slice(0, 8)}${path.extname(src.path)}`;
  fs.renameSync(path.join(ctx.dir, src.path), path.join(ctx.dir, relPath));
  const now = Date.now();
  ctx.db
    .prepare("UPDATE _lodekit_files SET slug = ?, path = ?, updated_at = ? WHERE slug = ?")
    .run(to, relPath, now, from);
  emit(ctx.appId, from, "del");
  emit(ctx.appId, to, "put");
  const row = liveRow(ctx, to)!;
  return toStat(ctx, row);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/file-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/services/file-store.ts packages/runtime/tests/file-store.test.ts
git commit -m "feat(runtime): file-store list/copy/move with destination-replace semantics"
```

---

### Task 4: TTL sweep + temp cleanup, registered on the scheduler

**Files:**
- Modify: `packages/runtime/src/services/file-store.ts`
- Modify: `packages/runtime/src/server.ts` (next to `every("kv-store-sweep", ...)` at `src/server.ts:83`)
- Test: `packages/runtime/tests/file-store.test.ts` (append)

**Interfaces:**
- Consumes: `openDbs()` from `../db.js`; `every` from `../scheduler.js` (registration in server.ts).
- Produces: `sweepFiles(cfg: Config): void` — for every open per-app connection: deletes expired rows + bytes + emptied date folders (emitting `expire` per slug), and removes `.tmp-*` files older than one hour. Registered as `every("file-store-sweep", 60_000, () => sweepFiles(cfg))`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/runtime/tests/file-store.test.ts` (extend the module import with `sweepFiles`):

```ts
describe("TTL + sweep", () => {
  it("expired files read as missing (lazy) and the sweep removes rows, bytes, folders", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const c = ctx();
    const stat = await put(c, "x", { slug: "fleeting", ttl: 60 });
    vi.setSystemTime(Date.now() + 61_000);
    expect(listFiles(c).entries).toEqual([]); // filtered while expired
    sweepFiles(cfg);
    expect(fs.existsSync(stat.path)).toBe(false);
    expect(fs.existsSync(path.dirname(stat.path))).toBe(false);
    expect(c.db.prepare("SELECT 1 FROM _lodekit_files WHERE slug = 'fleeting'").get()).toBeUndefined();
  });

  it("removes orphaned temp files older than one hour, keeps fresh ones", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const c = ctx();
    await put(c, "x", { slug: "anchor" }); // ensures the date folder exists
    const day = path.join(c.dir, dateFolder());
    const stale = path.join(day, ".tmp-stale");
    const fresh = path.join(day, ".tmp-fresh");
    fs.writeFileSync(stale, "s");
    fs.writeFileSync(fresh, "f");
    const past = new Date(Date.now() - 2 * 3600_000);
    fs.utimesSync(stale, past, past);
    sweepFiles(cfg);
    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/file-store.test.ts`
Expected: FAIL — `sweepFiles` not exported.

- [ ] **Step 3: Write the implementation**

Add to `packages/runtime/src/services/file-store.ts` (add `openDbs` to the `../db.js` import):

```ts
// TTL-only sweep (spec §8): expired rows + bytes + emptied folders, and stale
// temp files. Deliberately does NOT verify existence of unexpired files (§4.5).
export function sweepFiles(cfg: Config): void {
  const now = Date.now();
  for (const { appId, db } of openDbs()) {
    if (!ensured.has(db)) {
      ensureSchema(db);
      ensured.add(db);
    }
    const ctx: FilesCtx = {
      db,
      dir: path.join(cfg.dataDir, appId, "files"),
      appId,
      urlBase: `${cfg.baseUrl}/api/apps/${appId}/${CATALOG_NAME}`,
    };
    const expired = db
      .prepare("DELETE FROM _lodekit_files WHERE expires_at IS NOT NULL AND expires_at <= ? RETURNING slug, path")
      .all(now) as { slug: string; path: string }[];
    for (const r of expired) {
      removeBytes(ctx, r.path);
      emit(appId, r.slug, "expire");
    }
    if (!fs.existsSync(ctx.dir)) continue;
    for (const day of fs.readdirSync(ctx.dir)) {
      const dayDir = path.join(ctx.dir, day);
      if (!fs.statSync(dayDir).isDirectory()) continue;
      for (const f of fs.readdirSync(dayDir)) {
        if (!f.startsWith(".tmp-")) continue;
        const tmp = path.join(dayDir, f);
        if (fs.statSync(tmp).mtimeMs <= now - 3600_000) fs.rmSync(tmp, { force: true });
      }
      try {
        fs.rmdirSync(dayDir);
      } catch {
        // not empty — keep
      }
    }
  }
}
```

In `packages/runtime/src/server.ts`, mirror the kv-store sweep registration (line 83): add `import { sweepFiles } from "./services/file-store.js";` next to the kv import, and directly below `every("kv-store-sweep", 60_000, sweepAllAndBroadcast);` add:

```ts
every("file-store-sweep", 60_000, () => sweepFiles(cfg));
```

Also mirror whatever `stop("kv-store-sweep")` teardown exists in that file with `stop("file-store-sweep")`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/file-store.test.ts`
Expected: PASS. Also run `pnpm --filter @lodekit/runtime exec vitest run tests/scheduler.test.ts tests/server-errors.test.ts` — expected: PASS (server change is additive).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/services/file-store.ts packages/runtime/src/server.ts packages/runtime/tests/file-store.test.ts
git commit -m "feat(runtime): file-store TTL sweep + temp cleanup on the scheduler"
```

---

### Task 5: HTTP surface — router, upload headers, serving with ETag/304, mount outside bodyLimit

**Files:**
- Modify: `packages/runtime/src/services/file-store.ts` (router at the bottom, kv-store layout)
- Modify: `packages/runtime/src/routes.ts`
- Test: Create `packages/runtime/tests/file-store-api.test.ts`

**Interfaces:**
- Consumes: all ops from Tasks 2–3; `validationHook` from `../validation.js`; `isValidAppId` from `../registry.js`.
- Produces (SDK Task 6 relies on these exactly):
  - `withFiles(cfg: Config): MiddlewareHandler<FilesEnv>` and `filesRoutes` (chained Hono router), `export type FilesRoutes = typeof filesRoutes;`
  - Routes (all under `/api/apps/:appId/file-store`): `GET /` (list) · `POST /` (put, derived slug, 201) · `POST /copy` `{from,to}` · `POST /move` `{from,to}` · `GET /:slug/stat` · `GET /:slug` (bytes; `?download` → attachment; ETag/304) · `PUT /:slug` (put, 200) · `DELETE /:slug` → `{deleted}`.
  - Upload metadata: `Content-Type` header (default `application/octet-stream`), `X-Lodekit-Title` (≤ 512 chars), `X-Lodekit-Metadata` (JSON object, ≤ 4096 bytes), `?ttl=` seconds (positive number).
  - **Mount order is load-bearing:** file-store is registered *before* the global `bodyLimit` in `routes.ts` so uploads escape the 100 KB cap.

- [ ] **Step 1: Write the failing tests**

Create `packages/runtime/tests/file-store-api.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";
import type { Config } from "../src/config.js";

let root: string, server: Server, base: string;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-filesapi-"));
  const cfg: Config = {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: path.join(root, ".cache"),
    port: 0,
    baseUrl: "http://lodekit.localhost:0",
  };
  await new Promise<void>((resolve) => {
    server = createServer(cfg).listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterEach(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
});

const api = (p = "") => `${base}/api/apps/app/file-store${p}`;

async function upload(p: string, body: string, headers: Record<string, string> = {}) {
  return fetch(api(p), {
    method: p.startsWith("/") && p !== "" && !p.startsWith("?") ? "PUT" : "POST",
    headers: { "Content-Type": "text/plain", ...headers },
    body,
  });
}

describe("file-store HTTP surface", () => {
  it("PUT/GET round-trip: bytes, content type, disposition", async () => {
    const created = await (await upload("/report", "hello")).json();
    expect(created.slug).toBe("report");
    const res = await fetch(api("/report"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("content-disposition")).toBe('inline; filename="report.txt"');
    expect(await res.text()).toBe("hello");
    const dl = await fetch(api("/report?download=1"));
    expect(dl.headers.get("content-disposition")).toBe('attachment; filename="report.txt"');
  });

  it("POST / derives the slug from X-Lodekit-Title and returns 201", async () => {
    const res = await upload("", "x", { "X-Lodekit-Title": "Contas Jul 2026" });
    expect(res.status).toBe(201);
    expect((await res.json()).slug).toBe("contas-jul-2026");
  });

  it("serves ETag and answers If-None-Match with a bodyless 304", async () => {
    await upload("/etagged", "content");
    const first = await fetch(api("/etagged"));
    const etag = first.headers.get("etag")!;
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
    const second = await fetch(api("/etagged"), { headers: { "If-None-Match": etag } });
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });

  it("stat returns FileStat with url and absolute path; 404 when missing", async () => {
    await upload("/doc", "data", { "X-Lodekit-Metadata": '{"k":1}' });
    const stat = await (await fetch(api("/doc/stat"))).json();
    expect(stat).toMatchObject({ slug: "doc", size: 4, metadata: { k: 1 } });
    expect(stat.url).toContain("/api/apps/app/file-store/doc");
    expect(path.isAbsolute(stat.path)).toBe(true);
    expect((await fetch(api("/missing/stat"))).status).toBe(404);
    expect((await fetch(api("/missing"))).status).toBe(404);
  });

  it("uploads larger than the API's 100kb JSON body limit succeed", async () => {
    const big = "x".repeat(300 * 1024);
    const res = await upload("/big", big);
    expect(res.status).toBe(200);
    expect((await res.json()).size).toBe(big.length);
    expect((await (await fetch(api("/big"))).text()).length).toBe(big.length);
  });

  it("list, delete, copy, move", async () => {
    await upload("/exp-a", "a");
    await upload("/exp-b", "b");
    const page = await (await fetch(api("?prefix=exp-"))).json();
    expect(page.entries.map((e: { slug: string }) => e.slug)).toEqual(["exp-a", "exp-b"]);

    const copied = await fetch(api("/copy"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "exp-a", to: "exp-c" }),
    });
    expect((await copied.json()).slug).toBe("exp-c");

    const moved = await fetch(api("/move"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "exp-b", to: "exp-d" }),
    });
    expect((await moved.json()).slug).toBe("exp-d");
    expect((await fetch(api("/exp-b"))).status).toBe(404);

    expect((await (await fetch(api("/exp-c"), { method: "DELETE" })).json()).deleted).toBe(true);
  });

  it("literal action-name slugs work via method separation", async () => {
    await upload("/copy", "i am a file named copy");
    expect(await (await fetch(api("/copy"))).text()).toBe("i am a file named copy");
  });

  it("validates at the trust boundary with 400s", async () => {
    expect((await upload("/Bad_Slug!", "x")).status).toBe(400);
    expect((await upload("/ok?ttl=-5", "x")).status).toBe(400);
    expect((await upload("/ok2", "x", { "X-Lodekit-Metadata": "not json" })).status).toBe(400);
    expect((await upload("/ok3", "x", { "X-Lodekit-Metadata": JSON.stringify({ big: "y".repeat(5000) }) })).status).toBe(400);
    expect((await upload("/ok4", "x", { "X-Lodekit-Title": "t".repeat(600) })).status).toBe(400);
    const badApp = await fetch(`${base}/api/apps/Bad!App/file-store/x`);
    expect(badApp.status).toBe(400);
    const badCopy = await fetch(api("/copy"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "ok", to: "Nope!" }),
    });
    expect(badCopy.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/file-store-api.test.ts`
Expected: FAIL — 404s everywhere (routes not mounted).

- [ ] **Step 3: Write the router**

Add to `packages/runtime/src/services/file-store.ts` (new imports: `import { Hono, type Context, type MiddlewareHandler } from "hono";`, `import { zValidator } from "@hono/zod-validator";`, `import { z } from "zod";`, `import { Readable } from "node:stream";`, `import { isValidAppId } from "../registry.js";`, `import { validationHook } from "../validation.js";`):

```ts
export type FilesEnv = { Variables: { files: FilesCtx } };

// Applied by the parent router on /apps/:appId/file-store/* — validates the
// app id and sets the FilesCtx in context vars.
export function withFiles(cfg: Config): MiddlewareHandler<FilesEnv> {
  return async (c, next) => {
    const appId = c.req.param("appId");
    if (!appId || !isValidAppId(appId)) return c.json({ error: "invalid app id" }, 400);
    c.set("files", getFiles(cfg, appId));
    await next();
  };
}

const slugSchema = z.string().regex(/^[a-z0-9-]{1,128}$/, "invalid slug");
const slugParam = z.object({ slug: slugSchema });
const fromToBody = z.object({ from: slugSchema, to: slugSchema });
const listQuery = z.object({
  prefix: z.string().optional(),
  limit: z.coerce.number().optional(),
  cursor: z.string().optional(),
});
const ttlQuery = z.object({ ttl: z.coerce.number().positive().optional() });

// Upload metadata rides headers/query on the raw-body request (spec §6).
function uploadOpts(c: Context<FilesEnv>, ttl?: number) {
  const title = c.req.header("x-lodekit-title");
  if (title !== undefined && title.length > 512) throw new FilesError("title too long (max 512 chars)");
  const rawMeta = c.req.header("x-lodekit-metadata");
  let metadata: Record<string, unknown> | undefined;
  if (rawMeta !== undefined) {
    if (rawMeta.length > 4096) throw new FilesError("metadata too large (max 4096 bytes)");
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawMeta);
    } catch {
      throw new FilesError("metadata is not valid JSON");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new FilesError("metadata must be a JSON object");
    }
    metadata = parsed as Record<string, unknown>;
  }
  return { title, contentType: c.req.header("content-type"), ttl, metadata };
}

function requestBody(c: Context<FilesEnv>): NodeJS.ReadableStream {
  return c.req.raw.body
    ? (Readable.fromWeb(c.req.raw.body as import("node:stream/web").ReadableStream) as NodeJS.ReadableStream)
    : Readable.from([]);
}

// Chained style is normative (hc route-type inference). onError mirrors kv-store:
// every thrown error (FilesError included) maps to 400 { error }.
export const filesRoutes = new Hono<FilesEnv>()
  .onError((err, c) => c.json({ error: err instanceof Error ? err.message : String(err) }, 400))
  .get("/", zValidator("query", listQuery, validationHook), (c) =>
    c.json(listFiles(c.var.files, c.req.valid("query")))
  )
  .post("/", zValidator("query", ttlQuery, validationHook), async (c) => {
    const { ttl } = c.req.valid("query");
    return c.json(await putFile(c.var.files, requestBody(c), uploadOpts(c, ttl)), 201);
  })
  .post("/copy", zValidator("json", fromToBody, validationHook), (c) => {
    const { from, to } = c.req.valid("json");
    const stat = copyFile(c.var.files, from, to);
    return stat ? c.json(stat) : c.json({ error: "not found" }, 404);
  })
  .post("/move", zValidator("json", fromToBody, validationHook), (c) => {
    const { from, to } = c.req.valid("json");
    const stat = moveFile(c.var.files, from, to);
    return stat ? c.json(stat) : c.json({ error: "not found" }, 404);
  })
  .get("/:slug/stat", zValidator("param", slugParam, validationHook), (c) => {
    const stat = statFile(c.var.files, c.req.valid("param").slug);
    return stat ? c.json(stat) : c.json({ error: "not found" }, 404);
  })
  .get("/:slug", zValidator("param", slugParam, validationHook), (c) => {
    const r = openFile(c.var.files, c.req.valid("param").slug);
    if (!r) return c.json({ error: "not found" }, 404);
    const etag = `"${r.stat.hash}"`;
    const filename = `${r.stat.slug}${path.extname(r.abs)}`;
    const dispo = c.req.query("download") !== undefined ? "attachment" : "inline";
    c.header("ETag", etag);
    c.header("Content-Type", r.stat.contentType);
    c.header("Content-Disposition", `${dispo}; filename="${filename}"`);
    if (c.req.header("if-none-match") === etag) return c.body(null, 304);
    c.header("Content-Length", String(r.stat.size));
    return c.body(Readable.toWeb(fs.createReadStream(r.abs)) as ReadableStream);
  })
  .put(
    "/:slug",
    zValidator("param", slugParam, validationHook),
    zValidator("query", ttlQuery, validationHook),
    async (c) => {
      const { ttl } = c.req.valid("query");
      const opts = { ...uploadOpts(c, ttl), slug: c.req.valid("param").slug };
      return c.json(await putFile(c.var.files, requestBody(c), opts));
    }
  )
  .delete("/:slug", zValidator("param", slugParam, validationHook), (c) =>
    c.json({ deleted: deleteFile(c.var.files, c.req.valid("param").slug) })
  );

export type FilesRoutes = typeof filesRoutes;
```

In `packages/runtime/src/routes.ts`, add the import (aliased — kv-store also exports `CATALOG_NAME`):

```ts
import { filesRoutes, withFiles, CATALOG_NAME as FILES } from "./services/file-store.js";
```

and register file-store **before** the `bodyLimit` line, keeping the chain (uploads must escape the 100 KB JSON cap):

```ts
return new Hono()
  .use(`/apps/:appId/${FILES}/*`, withFiles(cfg))
  .route(`/apps/:appId/${FILES}`, filesRoutes)
  // Express's express.json() default (100 kb), preserved explicitly.
  .use(bodyLimit({ maxSize: 100 * 1024 }))
  .get("/apps", (c) => c.json(scanApps(cfg.appsDir)))
  // ... rest unchanged
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/file-store-api.test.ts tests/kv-api.test.ts tests/api.test.ts`
Expected: PASS (kv/api suites prove the re-ordered mount broke nothing).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/services/file-store.ts packages/runtime/src/routes.ts packages/runtime/tests/file-store-api.test.ts
git commit -m "feat(runtime): file-store HTTP surface — streamed uploads, ETag/304 serving, mounted outside bodyLimit"
```

---

### Task 6: SDK `files` handle + shared watch channel

**Files:**
- Modify: `packages/sdk/src/client.ts`
- Modify: `packages/sdk/src/index.ts`
- Test: `packages/runtime/tests/file-store-api.test.ts` (append an SDK-core describe block — same booted-server pattern; the runtime suite is where SDK↔runtime behavior is tested, cf. `tests/mcp.test.ts`)

**Interfaces:**
- Consumes: Task 5's routes; existing `createClient`, `parse` in `client.ts`.
- Produces (MCP Task 7 and the example app rely on these):
  - `interface Files { put(body, opts?): Promise<FileStat>; get(slug): Promise<Blob | undefined>; url(slug, opts?: { download?: boolean }): string; stat(slug): Promise<FileStat | undefined>; delete(slug): Promise<boolean>; list(opts?): Promise<{ entries: FileStat[]; nextCursor: string | null }>; copy(from, to): Promise<FileStat>; move(from, to): Promise<FileStat>; watch(prefix, cb): () => void }`
  - `type FilePutBody = string | Blob | ArrayBuffer | Uint8Array | ReadableStream`
  - `type FilesChange = { slug: string; op: "put" | "del" | "expire" }`
  - `FileStat` re-exported type (structurally identical to the runtime's).
  - `LodekitClient` gains `files: Files`; `@lodekit/sdk` app entry exports a `files` singleton next to `kv`.
  - `kv.watch` and `files.watch` share **one** EventSource per client (internal `createEventChannel`).

- [ ] **Step 1: Write the failing tests**

Append to `packages/runtime/tests/file-store-api.test.ts` (add `import { createClient } from "@lodekit/sdk";` at the top):

```ts
describe("sdk files handle (core) against the booted runtime", () => {
  it("put/stat/get/list/copy/move/delete round-trip", async () => {
    const files = createClient({ baseUrl: base, appId: "sdkapp" }).files;
    const stat = await files.put("col1,col2\n1,2", {
      title: "Expenses 2026-07",
      contentType: "text/csv",
      ttl: 3600,
      metadata: { rows: 1 },
    });
    expect(stat.slug).toBe("expenses-2026-07");
    expect(stat.metadata).toEqual({ rows: 1 });

    expect(files.url(stat.slug)).toBe(`${base}/api/apps/sdkapp/file-store/expenses-2026-07`);
    expect(files.url(stat.slug, { download: true })).toContain("?download=1");

    const blob = await files.get(stat.slug);
    expect(await blob!.text()).toBe("col1,col2\n1,2");
    expect(await files.get("missing")).toBeUndefined();
    expect(await files.stat("missing")).toBeUndefined();

    const copied = await files.copy(stat.slug, "expenses-copy");
    expect(copied.hash).toBe(stat.hash);
    const moved = await files.move("expenses-copy", "expenses-final");
    expect(moved.slug).toBe("expenses-final");

    const page = await files.list({ prefix: "expenses-" });
    expect(page.entries.map((e) => e.slug).sort()).toEqual(["expenses-2026-07", "expenses-final"]);

    expect(await files.delete("expenses-final")).toBe(true);
    expect(await files.delete("expenses-final")).toBe(false);
  });

  it("put streams a ReadableStream body", async () => {
    const files = createClient({ baseUrl: base, appId: "sdkapp" }).files;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("streamed"));
        controller.close();
      },
    });
    const stat = await files.put(body, { slug: "streamed", contentType: "text/plain" });
    expect(stat.size).toBe(8);
  });

  it("scoped SSE carries file-store-change and never leaks across apps", async () => {
    const events: string[] = [];
    const res = await fetch(`${base}/api/apps/appa/events`);
    const reader = res.body!.getReader();
    const drain = (async () => {
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        events.push(dec.decode(value));
      }
    })();
    const filesA = createClient({ baseUrl: base, appId: "appa" }).files;
    const filesB = createClient({ baseUrl: base, appId: "appb" }).files;
    await filesA.put("a", { slug: "mine" });
    await filesB.put("b", { slug: "theirs" });
    await new Promise((r) => setTimeout(r, 200));
    await reader.cancel();
    await drain.catch(() => {});
    const stream = events.join("");
    expect(stream).toContain("file-store-change");
    expect(stream).toContain('"slug":"mine"');
    expect(stream).not.toContain("theirs");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/file-store-api.test.ts`
Expected: FAIL — `createClient(...)` has no `files` property (type error / undefined).

- [ ] **Step 3: Write the implementation**

In `packages/sdk/src/client.ts`:

**(a)** Add the types near `KvEntry`:

```ts
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

export type FilesChange = { slug: string; op: "put" | "del" | "expire" };
export type FilePutBody = string | Blob | ArrayBuffer | Uint8Array | ReadableStream;

export interface Files {
  put(
    body: FilePutBody,
    opts?: { slug?: string; title?: string; contentType?: string; ttl?: number; metadata?: Record<string, unknown> }
  ): Promise<FileStat>;
  get(slug: string): Promise<Blob | undefined>;
  url(slug: string, opts?: { download?: boolean }): string;
  stat(slug: string): Promise<FileStat | undefined>;
  delete(slug: string): Promise<boolean>;
  list(opts?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ entries: FileStat[]; nextCursor: string | null }>;
  copy(from: string, to: string): Promise<FileStat>;
  move(from: string, to: string): Promise<FileStat>;
  watch(prefix: string, cb: (change: FilesChange) => void): () => void;
}
```

Change `LodekitClient` to `{ kv: Kv; files: Files }`.

**(b)** Add a plain-fetch parse twin under `parse` (the hc-typed `parse` can't type raw `fetch` responses; the raw-body/byte routes can't go through `hc`):

```ts
async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // non-JSON error body — keep statusText
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}
```

**(c)** Extract the shared watch channel (replaces the `watchers`/`es` block inside `createClient`). One EventSource per client, lazily opened on the first watcher of either handle, closed with the last:

```ts
function createEventChannel(url: string) {
  type Sub = { event: string; match: (data: never) => boolean; cb: (data: never) => void };
  const subs = new Set<Sub>();
  const bound = new Set<string>();
  let es: EventSource | null = null;
  return {
    on<T>(event: string, match: (data: T) => boolean, cb: (data: T) => void): () => void {
      if (typeof EventSource === "undefined") {
        throw new Error("watch is client-only (no EventSource in this environment)");
      }
      if (!es) es = new EventSource(url);
      if (!bound.has(event)) {
        bound.add(event);
        es.addEventListener(event, (e) => {
          const data = JSON.parse((e as MessageEvent).data) as T;
          for (const s of subs) {
            if (s.event === event && (s.match as (d: T) => boolean)(data)) (s.cb as (d: T) => void)(data);
          }
        });
      }
      const sub = { event, match, cb } as Sub;
      subs.add(sub);
      return () => {
        subs.delete(sub);
        if (subs.size === 0 && es) {
          es.close();
          es = null;
          bound.clear();
        }
      };
    },
  };
}
```

Inside `createClient`, build `const channel = createEventChannel(`${baseUrl}/api/apps/${appId}/events`);` and rewrite `kv.watch` to:

```ts
watch(prefix, cb) {
  return channel.on<KvChange>("kv-store-change", (c) => c.key.startsWith(prefix), cb);
},
```

(Note: the client-only error message changes from "kv.watch is client-only…" to "watch is client-only…" — check `packages/sdk/tests/client.test.ts` for an assertion on that string and update it if present.)

**(d)** Implement the handle inside `createClient` (after `kv`):

```ts
const filesApi = `${baseUrl}/api/apps/${appId}/${"file-store"}`;

const files: Files = {
  async put(body, opts = {}) {
    const qs = opts.ttl != null ? `?ttl=${opts.ttl}` : "";
    const headers: Record<string, string> = {};
    if (opts.contentType) headers["Content-Type"] = opts.contentType;
    if (opts.title) headers["X-Lodekit-Title"] = opts.title;
    if (opts.metadata) headers["X-Lodekit-Metadata"] = JSON.stringify(opts.metadata);
    const init: RequestInit & { duplex?: "half" } = {
      method: opts.slug ? "PUT" : "POST",
      body: body as BodyInit,
      headers,
    };
    // Streamed request bodies require half-duplex in fetch (Node and browsers).
    if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) init.duplex = "half";
    return parseJson<FileStat>(await fetch(opts.slug ? `${filesApi}/${opts.slug}${qs}` : `${filesApi}${qs}`, init));
  },
  async get(slug) {
    const res = await fetch(`${filesApi}/${slug}`);
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(res.statusText);
    return res.blob();
  },
  url(slug, opts = {}) {
    return `${filesApi}/${slug}${opts.download ? "?download=1" : ""}`;
  },
  async stat(slug) {
    const res = await fetch(`${filesApi}/${slug}/stat`);
    if (res.status === 404) return undefined;
    return parseJson<FileStat>(res);
  },
  async delete(slug) {
    return (await parseJson<{ deleted: boolean }>(await fetch(`${filesApi}/${slug}`, { method: "DELETE" }))).deleted;
  },
  async list(opts = {}) {
    const query = new URLSearchParams();
    if (opts.prefix !== undefined) query.set("prefix", opts.prefix);
    if (opts.limit !== undefined) query.set("limit", String(opts.limit));
    if (opts.cursor !== undefined) query.set("cursor", opts.cursor);
    const q = query.toString();
    return parseJson<{ entries: FileStat[]; nextCursor: string | null }>(await fetch(`${filesApi}${q ? `?${q}` : ""}`));
  },
  async copy(from, to) {
    return parseJson<FileStat>(
      await fetch(`${filesApi}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      })
    );
  },
  async move(from, to) {
    return parseJson<FileStat>(
      await fetch(`${filesApi}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      })
    );
  },
  watch(prefix, cb) {
    return channel.on<FilesChange>("file-store-change", (c) => c.slug.startsWith(prefix), cb);
  },
};

return { kv, files };
```

(`copy`/`move` 404s surface as thrown `Error("not found")` via `parseJson` — matching the kv transport's error semantics.)

**(e)** In `packages/sdk/src/index.ts`, build the client once and export both handles:

```ts
const client = createClient({ baseUrl: serverBaseUrl, appId: injectedAppId });
export const kv = client.kv;
export const files = client.files;
```

and extend the type re-export line with `Files, FileStat, FilesChange, FilePutBody`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/file-store-api.test.ts && pnpm --filter @lodekit/sdk test`
Expected: PASS (both).

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/client.ts packages/sdk/src/index.ts packages/runtime/tests/file-store-api.test.ts packages/sdk/tests/client.test.ts
git commit -m "feat(sdk): files handle — put/get/url/stat/list/copy/move + shared watch channel with kv"
```

---

### Task 7: MCP read tools — lodekit_files_list, lodekit_files_stat

**Files:**
- Modify: `packages/mcp/index.ts`
- Test: `packages/runtime/tests/mcp.test.ts` (append)

**Interfaces:**
- Consumes: `createClient(...).files` from Task 6.
- Produces: MCP tools `lodekit_files_list({ appId, prefix? })` and `lodekit_files_stat({ appId, slug })`. Read-only; stat returns the FileStat including `url` and absolute `path` (spec §9.1: agents read bytes via `path` with their own file tools, never through MCP).

- [ ] **Step 1: Write the failing test**

Append to `packages/runtime/tests/mcp.test.ts`, inside the existing `describe("mcp tool helpers")`:

```ts
it("reads file metadata through the sdk core the files tools use", async () => {
  await scaffold(base, { appId: "docs", name: "Docs" });
  const files = createClient({ baseUrl: base, appId: "docs" }).files;
  await files.put("report body", { title: "Q2 Report", contentType: "text/plain" });

  // exactly what lodekit_files_list / lodekit_files_stat call:
  const page = await files.list({ prefix: "q2-" });
  expect(page.entries.map((e) => e.slug)).toEqual(["q2-report"]);
  const stat = await files.stat("q2-report");
  expect(stat!.url).toContain("/api/apps/docs/file-store/q2-report");
  expect(stat!.path.startsWith("/")).toBe(true); // absolute path for agent file tools
  expect(await files.stat("missing")).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/mcp.test.ts`
Expected: FAIL if Task 6 is incomplete, PASS if complete — either way, proceed: the tool registration below is the deliverable this test anchors (it exercises the exact SDK calls the tools wrap; the tool wiring itself follows the `lodekit_kv_*` shape that `mcp.test.ts` covers the same way).

- [ ] **Step 3: Register the tools**

In `packages/mcp/index.ts`, after the `lodekit_kv_get` registration:

```ts
server.tool(
  "lodekit_files_list",
  { appId: z.string(), prefix: z.string().optional() },
  async ({ appId, prefix }) =>
    text(await createClient({ baseUrl: BASE, appId }).files.list({ prefix }))
);

server.tool(
  "lodekit_files_stat",
  { appId: z.string(), slug: z.string() },
  async ({ appId, slug }) => {
    const stat = await createClient({ baseUrl: BASE, appId }).files.stat(slug);
    return text(stat === undefined ? { found: false } : { found: true, ...stat });
  }
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/mcp.test.ts && pnpm mcp --help >/dev/null 2>&1 || node --import tsx --eval "await import('./packages/mcp/index.ts')"`
Expected: mcp.test.ts PASS; the import-check exits 0 (registration is syntactically live without connecting stdio).

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/index.ts packages/runtime/tests/mcp.test.ts
git commit -m "feat(mcp): lodekit_files_list and lodekit_files_stat read tools"
```

---

### Task 8: Example app — Export CSV in expense-tracker (acceptance flow)

**Files:**
- Modify: `examples/apps/expense-tracker/src/routes/index.tsx`

**Interfaces:**
- Consumes: `files` from `@lodekit/sdk` (Task 6), existing `expenses` collection and TanStack Query setup in the file.
- Produces: server function `exportCsv` + an Exports section in the UI. This is the spec's acceptance test (§9.2): derived slugs, TTL, list, serving URL, all through a real app.

- [ ] **Step 1: Add the export flow**

In `examples/apps/expense-tracker/src/routes/index.tsx`:

**(a)** Extend the SDK import: `import { kv, files } from "@lodekit/sdk";`

**(b)** Add the server function after `getSummary` (server functions run in the app worker and reach services over loopback HTTP — same as the existing pattern):

```tsx
// Server function: renders the expenses to CSV in the file-store with a 7-day TTL.
// Derived slug ("Expenses 2026-07" -> "expenses-2026-07"); re-exports the same
// month become expenses-2026-07-2, -3, ... (derive-collision suffixing).
export const exportCsv = createServerFn().handler(async () => {
  const rows = await expenses.all();
  const month = new Date().toISOString().slice(0, 7);
  const lines = rows.map((r) =>
    [r.value.created_at, r.value.category, JSON.stringify(r.value.note ?? ""), r.value.amount].join(",")
  );
  return await files.put(["date,category,note,amount", ...lines].join("\n"), {
    title: `Expenses ${month}`,
    contentType: "text/csv",
    ttl: 7 * 24 * 3600,
  });
});
```

**(c)** In `ExpenseTrackerPage`, add the exports query and mutation next to the existing ones:

```tsx
const { data: exports = [] } = useQuery({
  queryKey: ["files", "exports"],
  queryFn: async () => (await files.list({ prefix: "expenses-" })).entries,
});

const runExport = useMutation({
  mutationFn: () => exportCsv(),
  onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["files"] }),
});
```

**(d)** Render an Exports section after the `<Table>` (matching the page's existing plain style):

```tsx
<div className="mt-8">
  <div className="flex items-center justify-between">
    <h2 className="text-lg font-semibold">Exports</h2>
    <Button variant="outline" onClick={() => runExport.mutate()}>Export CSV</Button>
  </div>
  <ul className="text-muted-foreground mt-2 text-sm">
    {exports.map((f) => (
      <li key={f.slug}>
        <a className="underline" href={files.url(f.slug, { download: true })} download>
          {f.title ?? f.slug}
        </a>{" "}
        ({new Date(f.createdAt).toLocaleDateString()})
      </li>
    ))}
  </ul>
</div>
```

- [ ] **Step 2: Verify against the running runtime**

Run: `pnpm dev` (runtime against `examples/`), open `http://lodekit.localhost:7777/expense-tracker`, add an expense if empty, click **Export CSV**, confirm the file appears in the Exports list and the link downloads a CSV. Also confirm on disk: `ls examples/data/expense-tracker/files/*/` shows `expenses-<month>-<hash8>.csv`. Then stop the runtime and `git checkout -- examples/data` if the fixture data changed (fixtures are committed dev data — don't commit incidental churn unless intended).

- [ ] **Step 3: Run the e2e suite (SSR of the modified page must not break)**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/e2e.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add examples/apps/expense-tracker/src/routes/index.tsx
git commit -m "feat(examples): expense-tracker Export CSV — files service acceptance flow"
```

---

### Task 9: Skill + docs — SKILL.md, context.md, roadmap.md, umbrella spec

**Files:**
- Modify: `packages/skill/SKILL.md`
- Modify: `context.md`
- Modify: `roadmap.md`
- Modify: `docs/specs/2026-07-02-product-overview-design.md` (§2.2 status column only)

- [ ] **Step 1: SKILL.md — teach the `files` handle**

Read `packages/skill/SKILL.md` first and place a Files section alongside the existing Store/kv teaching, matching its heading level and voice. Content to convey (adapt phrasing to the file's style, keep all facts):

```markdown
## Files (file-store)

Per-app blob storage for documents and binary data — use the Store (`kv`) for JSON
values, Files for bytes (reports, downloads, images). Import: `import { files } from "@lodekit/sdk"`.

- A file's key is its **slug** (`a-z0-9-`). Pass one explicitly, or pass `title`
  and let the service derive it ("Q2 Report" → `q2-report`); re-putting the same
  slug replaces the content.
- **Export pattern** (file the person downloads): in a server function,
  `await files.put(csvString, { title, contentType: "text/csv", ttl: 7 * 24 * 3600 })`,
  then render `files.url(stat.slug, { download: true })` as the link. `ttl` (seconds)
  auto-deletes it later.
- **Ingest pattern** (fetch and store): pipe the response straight through —
  `await files.put(res.body!, { slug: "latest", contentType: res.headers.get("content-type") ?? undefined })`.
- `files.list({ prefix })`, `files.stat(slug)`, `files.delete(slug)`,
  `files.copy(from, to)`, `files.move(from, to)`, and `files.watch(prefix, cb)`
  (live change events) round out the API.
- Files are real files on disk under the app's data folder — the person can browse
  them in Finder.
- **Via MCP** you can inspect an app's files with `lodekit_files_list` /
  `lodekit_files_stat`. Never pull bytes through MCP: stat returns an absolute
  `path` — read it with your own file tools, and treat it as **read-only** (all
  writes go through `files.put`). Use `url` to verify what's served or to hand
  the person a link.
```

- [ ] **Step 2: context.md — the naming amendment (spec §3)**

In the "The shipped and near-term services" run of entries, add after **Store** (matching entry format):

```markdown
**Files**:
An app's per-app blob storage (the file-store service) for documents and binary data,
reached through the SDK as the `files` handle. A file is identified by its slug; bytes
live as real, Finder-browsable files under the app's data tree, date-foldered, while
the per-app database holds the authoritative index
(`docs/specs/2026-07-06-file-store-design.md`).
_Avoid_: blobs (the retired working name), uploads, attachments, assets
```

And in the **Store** entry, update "The sole storage service through early 0.x" to reflect that Files now ships alongside it (e.g. "The first storage service; joined by Files (file-store) in 0.x").

- [ ] **Step 3: roadmap.md — close and add entries**

- Rewrite the "Blob storage" bullet as shipped-by-this-spec, pointing to `docs/specs/2026-07-06-file-store-design.md` (follow the roadmap's existing strikethrough/"Dissolved"/"specced" conventions for closed items).
- Add four entries (spec §12), matching surrounding bullet style:
  - **Dashboard file explorer** — per-app Files panel (list, preview, delete); deferred from the file-store slice.
  - **file-store `list()` drift reconciliation** — Finder-deleted files linger in listings until first read (lazy reconciliation only, by design); add a cheap reconciliation pass if it bites in practice.
  - **Files lifecycle rules via Tasks** — when task-schedule is designed: richer lifecycle than TTL (e.g. "keep last N exports"), possibly subsuming the file-store sweep — same consolidation note as kv-store's scheduler.
  - **file-store storage dedup** — hardlink or content-addressed variants if duplicate bytes ever matter at personal scale; today the hash suffix buys integrity, not dedup.

- [ ] **Step 4: Umbrella spec status column**

In `docs/specs/2026-07-02-product-overview-design.md` §2.2 service-catalog table, change the file-store row's Status from `Future` to `Shipped (docs/specs/2026-07-06-file-store-design.md): slug-identity blobs, TTL, SSE feed, serving URLs; SDK handle files`.

- [ ] **Step 5: Full verification and commit**

Run: `pnpm test`
Expected: all workspace suites PASS (`@lodekit/runtime` incl. file-store/kv/mcp/e2e, `@lodekit/sdk`, `@lodekit/manager`).

```bash
git add packages/skill/SKILL.md context.md roadmap.md docs/specs/2026-07-02-product-overview-design.md
git commit -m "docs: file-store ships — skill files handle, context.md Files entry, roadmap + umbrella status"
```

---

## Plan Self-Review (done at authoring time)

- **Spec coverage:** §2 cut → Tasks 2–5 (each "in" feature has a task + test); §3 naming → Tasks 1, 5, 9; §4 storage model → Tasks 1–2; §5 data model/convention → Task 1 (schema) — the *convention prose* ships in the spec itself, no code change needed beyond the module following it; §6 HTTP → Task 5; §7 SDK → Task 6; §8 feed/sweep → Tasks 2 (emits), 4 (sweep), 6 (watch); §9 proofs → Tasks 7, 8, 9; §10 errors → Tasks 2, 5 (validation tests); §11 testing → mirrored per task; §12 docs → Task 9.
- **Type consistency:** `FilesCtx`/`FileStat`/`putFile(ctx, body, opts)` signatures match across Tasks 1→6; SDK `FileStat` mirrors runtime field-for-field; `sweepFiles(cfg)` name consistent between Task 4 impl and server registration.
- **Known judgment calls encoded:** file-store mounts before `bodyLimit` (uploads > 100 KB); all SSE emits live in ops (deviation from kv's in-router emits, noted in Task 2); SDK uses plain fetch + `parseJson` instead of `hc` (raw-body/byte routes aren't hc-representable; noted in Task 6).
