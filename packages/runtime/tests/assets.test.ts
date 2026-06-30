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
    root, appsDir: path.join(root, "apps"), dataDir: path.join(root, "data"),
    port: 0, baseUrl: "http://lodekit.localhost:0",
  };
  await new Promise<void>((r) => { server = createServer(cfg).listen(0, () => r()); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterEach(() => { server.close(); fs.rmSync(root, { recursive: true, force: true }); });

describe("static assets", () => {
  it("serves the design system css", async () => {
    const r = await fetch(base + "/_lodekit/design-system.css");
    expect(r.status).toBe(200);
    expect((await r.text())).toContain(".lk-container");
  });
  it("serves the sdk and exposes window.lodekit", async () => {
    const js = await (await fetch(base + "/_lodekit/sdk.js")).text();
    expect(js).toContain("window.lodekit");
    expect(js).toContain("/api/apps/");
  });
});
