import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initLogStore, queryLogs, closeLogStoreForTest } from "../src/logStore.js";
import { emitLog, createLogger } from "../src/logger.js";
import { addClient } from "../src/sse.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-logger-"));
  initLogStore(dir);
});
afterEach(() => {
  closeLogStoreForTest();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("logger", () => {
  it("persists, broadcasts a log SSE event, and scopes it to the app channel", () => {
    const globalSeen: string[] = [];
    const appSeen: string[] = [];
    const otherSeen: string[] = [];
    const rm1 = addClient((p) => globalSeen.push(p));
    const rm2 = addClient((p) => appSeen.push(p), "notes");
    const rm3 = addClient((p) => otherSeen.push(p), "elsewhere");
    emitLog("info", "console", "hello", undefined, "notes");
    rm1(); rm2(); rm3();
    expect(queryLogs({ app: "notes" }).records[0]).toMatchObject({ source: "console", message: "hello" });
    expect(globalSeen).toHaveLength(1);
    expect(globalSeen[0]).toContain("event: log");
    expect(appSeen).toHaveLength(1);
    expect(otherSeen).toHaveLength(0);
  });

  it("tees error-level records to stderr, others not", () => {
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const log = createLogger("build", "notes");
    log.info("fine");
    expect(err).not.toHaveBeenCalled();
    log.error("boom", { stack: "TRACE" });
    expect(err).toHaveBeenCalledOnce();
    const line = err.mock.calls[0][0] as string;
    expect(line).toContain("[build:notes] boom");
    expect(line).toContain("TRACE");
  });

  it("createLogger stamps source/appId on every level", () => {
    const log = createLogger("watcher");
    log.debug("d"); log.warn("w");
    const { records } = queryLogs({ app: "_platform" });
    expect(records.map((r) => [r.level, r.source])).toEqual([["warn", "watcher"], ["debug", "watcher"]]);
  });

  it("never throws when the store is degraded", () => {
    closeLogStoreForTest();
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(() => createLogger("host").error("still fine")).not.toThrow();
  });
});
