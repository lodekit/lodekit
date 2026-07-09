import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { applySchemaPush } from "../src/services/db-store.js";
import { getAppDb } from "../src/db.js";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-push-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

async function snap(schema: Record<string, unknown>) {
  const { generateSQLiteDrizzleJson } = await import("drizzle-kit/api");
  return generateSQLiteDrizzleJson(schema as Record<string, never>);
}

const v1 = { plants: sqliteTable("plants", { id: integer("id").primaryKey(), name: text("name").notNull() }) };
const v2 = {
  plants: sqliteTable("plants", {
    id: integer("id").primaryKey(), name: text("name").notNull(), species: text("species"),
  }),
};
const v3drop = { plants: sqliteTable("plants", { id: integer("id").primaryKey() }) }; // drops name

const cols = (appId: string, table: string) =>
  (getAppDb(dir, appId).prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

describe("applySchemaPush", () => {
  it("first push creates the declared tables and stores the snapshot", async () => {
    const r = await applySchemaPush(dir, "app", await snap(v1));
    expect(r.status).toBe("applied");
    expect(cols("app", "plants")).toEqual(["id", "name"]);
    const stored = getAppDb(dir, "app").prepare("SELECT snapshot FROM _schema WHERE id = 1").get();
    expect(stored).toBeDefined();
  });

  it("re-pushing the same schema is a noop", async () => {
    await applySchemaPush(dir, "app", await snap(v1));
    const r = await applySchemaPush(dir, "app", await snap(v1)); // fresh snapshot, same shape
    expect(r.status).toBe("noop");
  });

  it("an added column applies additively", async () => {
    await applySchemaPush(dir, "app", await snap(v1));
    const r = await applySchemaPush(dir, "app", await snap(v2));
    expect(r).toEqual({ status: "applied", statements: 1 });
    expect(cols("app", "plants")).toContain("species");
  });

  it("a dropped column gates — nothing applies, snapshot unchanged", async () => {
    await applySchemaPush(dir, "app", await snap(v2));
    const r = await applySchemaPush(dir, "app", await snap(v3drop));
    expect(r.status).toBe("gated");
    if (r.status === "gated") expect(r.message).toMatch(/expand/i); // points at expand-copy
    expect(cols("app", "plants")).toContain("name"); // old schema intact
    // the gate repeats on the next boot — prev snapshot was not replaced
    expect((await applySchemaPush(dir, "app", await snap(v3drop))).status).toBe("gated");
  });

  it("a dropped column whose quoted name contains 'add' still gates", async () => {
    // Regression: a greedy additive regex would classify
    // ALTER TABLE `plants` DROP COLUMN `last add` as additive and execute it.
    const w1 = { plants: sqliteTable("plants", { id: integer("id").primaryKey(), lastAdd: text("last add") }) };
    const w2 = { plants: sqliteTable("plants", { id: integer("id").primaryKey() }) };
    await applySchemaPush(dir, "app", await snap(w1));
    const r = await applySchemaPush(dir, "app", await snap(w2));
    expect(r.status).toBe("gated");
    expect(cols("app", "plants")).toContain("last add"); // column survived
  });

  it("rejects _-prefixed and sqlite_-prefixed table names", async () => {
    const bad = { t: sqliteTable("_mine", { id: integer("id").primaryKey() }) };
    const r = await applySchemaPush(dir, "app", await snap(bad));
    expect(r.status).toBe("gated");
    if (r.status === "gated") expect(r.message).toMatch(/_mine/);
  });

  it("a load error keeps the previous schema and reports", async () => {
    await applySchemaPush(dir, "app", await snap(v1));
    const r = await applySchemaPush(dir, "app", null, "SyntaxError: … in src/db.ts");
    expect(r.status).toBe("gated");
    expect(cols("app", "plants")).toEqual(["id", "name"]);
  });

  it("skips internal namespaces", async () => {
    expect((await applySchemaPush(dir, "_dashboard", await snap(v1))).status).toBe("noop");
    expect(fs.existsSync(path.join(dir, "_dashboard", "db.sqlite"))).toBe(false);
  });

  it("declaring nothing never materializes a database", async () => {
    expect((await applySchemaPush(dir, "empty", await snap({}))).status).toBe("noop");
    expect(fs.existsSync(path.join(dir, "empty", "db.sqlite"))).toBe(false);
  });
});
