import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAppDb } from "../src/db.js";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("db connection management", () => {
  it("creates the per-app db file and caches the connection", () => {
    const a = getAppDb(dir, "demo");
    expect(fs.existsSync(path.join(dir, "demo", "db.sqlite"))).toBe(true);
    expect(getAppDb(dir, "demo")).toBe(a);
  });

  it("returns independent databases for the same slug under different data dirs", () => {
    const dirB = fs.mkdtempSync(path.join(os.tmpdir(), "lkb-"));
    expect(getAppDb(dir, "same")).not.toBe(getAppDb(dirB, "same"));
    fs.rmSync(dirB, { recursive: true, force: true });
  });
});
