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
