import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createAdaptorServer } from "@hono/node-server";
import { createApp } from "../src/server.js";
import type { Config } from "../src/config.js";

let root: string, server: Server, base: string;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-err-"));
  const cfg: Config = {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: path.join(root, ".cache"),
    stateDir: path.join(root, ".state"),
    port: 0,
    baseUrl: "http://lodekit.localhost:0",
  };
  const app = createApp(cfg).get("/boom", () => {
    throw new Error("kaboom");
  });
  await new Promise<void>((resolve) => {
    server = (createAdaptorServer({ fetch: app.fetch }) as Server).listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterEach(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("server error handling", () => {
  it("maps uncaught route errors to a 500 with the message (never crashes)", async () => {
    const res = await fetch(base + "/boom");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "kaboom" });
  });

  it("maps a malformed JSON body to a 400, not a 500", async () => {
    const res = await fetch(base + "/api/apps/app/kv-store/k", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a body over 100 kb with 413", async () => {
    const res = await fetch(base + "/api/apps/app/kv-store/big", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(110 * 1024) }),
    });
    expect(res.status).toBe(413);
  });
});
