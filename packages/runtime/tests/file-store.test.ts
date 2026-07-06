import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import crypto from "node:crypto";
import type { Config } from "../src/config.js";
import {
  getFiles,
  slugify,
  deriveSlug,
  extFor,
  dateFolder,
  putFile,
  statFile,
  openFile,
  deleteFile,
  listFiles,
  copyFile,
  moveFile,
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

  it("rejects explicit slugs outside the slug charset (no path smuggling)", async () => {
    const c = ctx();
    for (const slug of ["../evil", "a/b", "UPPER", "", "-".repeat(129)]) {
      await expect(put(c, "x", { slug })).rejects.toThrow(/invalid slug/);
    }
    expect(fs.existsSync(path.join(cfg.dataDir, "evil"))).toBe(false);
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

  it("copy-to-self is a safe no-op (bytes intact)", async () => {
    const c = ctx();
    const src = await put(c, "data", { slug: "solo", contentType: "text/plain" });
    const same = copyFile(c, "solo", "solo")!;
    expect(same.hash).toBe(src.hash);
    expect(fs.readFileSync(src.path, "utf8")).toBe("data");
  });

  it("copy/move reject destinations outside the slug charset before touching anything", async () => {
    const c = ctx();
    const src = await put(c, "data", { slug: "guarded", contentType: "text/plain" });
    for (const bad of ["../evil", "a/b", "UPPER"]) {
      expect(() => copyFile(c, "guarded", bad)).toThrow(/invalid slug/);
      expect(() => moveFile(c, "guarded", bad)).toThrow(/invalid slug/);
      expect(() => moveFile(c, bad, bad)).toThrow(/invalid slug/);
    }
    expect(fs.readFileSync(src.path, "utf8")).toBe("data");
  });
});
