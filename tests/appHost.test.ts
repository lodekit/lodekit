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
  const appDir = path.join(root, "apps", "demo");
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, "lodekit.json"), JSON.stringify({ name: "Demo", slug: "demo" }));
  fs.writeFileSync(path.join(appDir, "index.html"), "<html><head></head><body>hi</body></html>");
  fs.writeFileSync(path.join(appDir, "app.js"), "console.log(1)");
  const cfg: Config = {
    root, appsDir: path.join(root, "apps"), dataDir: path.join(root, "data"),
    port: 0, baseUrl: "http://lodekit.localhost:0",
  };
  await new Promise<void>((r) => { server = createServer(cfg).listen(0, () => r()); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterEach(() => { server.close(); fs.rmSync(root, { recursive: true, force: true }); });

describe("appHost", () => {
  it("serves index.html with injected design-system + sdk tags", async () => {
    const html = await (await fetch(base + "/demo")).text();
    expect(html).toContain('href="/_lodekit/design-system.css"');
    expect(html).toContain('src="/_lodekit/sdk.js"');
    expect(html).toContain("<body>hi</body>");
  });

  it("serves other app files without injection", async () => {
    const js = await (await fetch(base + "/demo/app.js")).text();
    expect(js).toBe("console.log(1)");
  });

  it("404s a missing file inside a real app", async () => {
    expect((await fetch(base + "/demo/nope.txt")).status).toBe(404);
  });

  it("blocks path traversal", async () => {
    expect((await fetch(base + "/demo/..%2f..%2fpackage.json")).status).toBe(403);
  });
});
