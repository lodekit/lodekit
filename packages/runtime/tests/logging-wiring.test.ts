import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initLogStore, queryLogs, closeLogStoreForTest } from "../src/logStore.js";
import { every, tick, stop } from "../src/scheduler.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-wire-"));
  initLogStore(dir);
});
afterEach(() => {
  stop("boom-task");
  closeLogStoreForTest();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("subsystem logging", () => {
  it("scheduler task failures land as platform error records (and still tee to stderr)", () => {
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    every("boom-task", 60_000, () => { throw new Error("task exploded"); });
    tick("boom-task");
    const { records } = queryLogs({ app: "_platform", source: "scheduler", level: "error" });
    expect(records).toHaveLength(1);
    expect(records[0].message).toContain("boom-task");
    expect(String(records[0].fields?.stack)).toContain("task exploded");
    expect(err).toHaveBeenCalled();
  });
});
