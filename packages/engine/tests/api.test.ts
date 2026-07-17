import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";
import type { Config } from "../src/config.js";

let root: string, server: Server, base: string;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-"));
  const cfg: Config = {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: path.join(root, ".cache"),
    stateDir: path.join(root, ".state"),
    port: 0,
    baseUrl: "http://lodekit.localhost:0", secretsKeyProvider: "file",
    gatewaysDir: path.join(root, "gateways"),
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

async function jpost(p: string, body: unknown) {
  const r = await fetch(base + p, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

describe("API", () => {
  it("scaffolds, lists, and round-trips app data through kv-store", async () => {
    const created = await jpost("/api/apps", { appId: "exp", name: "Exp" });
    expect(created.status).toBe(201);

    const list = await (await fetch(base + "/api/apps")).json();
    expect(list.map((a: { appId: string }) => a.appId)).toContain("exp");

    await fetch(base + "/api/apps/exp/kv-store/cfg", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: { currency: "USD" } }),
    });
    const got = await (await fetch(base + "/api/apps/exp/kv-store/cfg")).json();
    expect(got).toMatchObject({ found: true, value: { currency: "USD" } });
  });

  it("rejects invalid app ids", async () => {
    const r = await fetch(base + "/api/apps/Bad Slug/kv-store/k");
    expect(r.status).toBe(400);
  });
});
