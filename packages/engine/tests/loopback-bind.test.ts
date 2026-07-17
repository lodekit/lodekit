import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { loadConfig } from "../src/config.js";
import { start, watcherShutdown } from "../src/server.js";

let root: string, cache: string, server: Server;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-bind-root-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-bind-cache-"));
  process.env.LODEKIT_ROOT = root;
  process.env.LODEKIT_CACHE_DIR = cache;
  process.env.LODEKIT_STATE_DIR = path.join(root, "state");
  process.env.LODEKIT_PORT = "0";
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await watcherShutdown.get(server);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
  delete process.env.LODEKIT_ROOT;
  delete process.env.LODEKIT_CACHE_DIR;
  delete process.env.LODEKIT_STATE_DIR;
  delete process.env.LODEKIT_PORT;
});

describe("listener bind (issue #87)", () => {
  it("binds IPv4 loopback by default", async () => {
    server = await start(loadConfig());
    const addr = server.address();
    expect(typeof addr === "object" && addr ? addr.address : null).toBe("127.0.0.1");
  }, 30000);
});
