import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";

vi.mock("../src/build.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/build.js")>()),
  getDashboardState: () => ({ status: "error", message: "boom <script>alert(1)</script>" }),
}));

import { createServer } from "../src/server.js";
import type { Config } from "../src/config.js";

describe("dashboard build-error fallback", () => {
  let server: Server, root: string;
  afterEach(() => {
    server?.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("serves a 200 fallback with the build error HTML-escaped", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-"));
    const cfg: Config = {
      root,
      appsDir: path.join(root, "apps"),
      dataDir: path.join(root, "data"),
      cacheDir: path.join(root, ".cache"),
      port: 0,
      baseUrl: "http://lodekit.localhost:0",
    };
    await new Promise<void>((resolve) => {
      server = createServer(cfg).listen(0, () => resolve());
    });
    const addr = server.address();
    const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
    const res = await fetch(base + "/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("its build failed");
    expect(html).toContain("boom &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
