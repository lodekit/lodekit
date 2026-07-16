import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";

// A mutable spy (via vi.hoisted) lets each test drive a different dashboard state without
// re-registering the module mock — vi.mock itself only runs once per file.
const { getDashboardStateMock } = vi.hoisted(() => ({ getDashboardStateMock: vi.fn() }));

vi.mock("../src/build.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/build.js")>()),
  getDashboardState: getDashboardStateMock,
}));

import { createServer } from "../src/server.js";
import type { Config } from "../src/config.js";

function cfgFor(root: string): Config {
  return {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: path.join(root, ".cache"),
    stateDir: path.join(root, ".state"),
    port: 0,
    baseUrl: "http://lodekit.localhost:0", secretsKeyProvider: "file",
    gatewaysDir: path.join(root, "gateways"),
  };
}

async function boot(cfg: Config): Promise<{ server: Server; base: string }> {
  const server: Server = await new Promise((resolve) => {
    const s = createServer(cfg).listen(0, () => resolve(s));
  });
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  return { server, base };
}

describe("dashboard fallback", () => {
  let server: Server, root: string;
  afterEach(() => {
    server?.close();
    fs.rmSync(root, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("serves a 200 fallback at /_dashboard/ before the dashboard has ever been built", async () => {
    getDashboardStateMock.mockReturnValue(undefined);
    root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-"));
    let base: string;
    ({ server, base } = await boot(cfgFor(root)));

    const res = await fetch(base + "/_dashboard/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("isn't available");
    expect(html).toContain("yet");
  });

  it("serves a 200 fallback with the build error HTML-escaped, while apps and the API keep serving", async () => {
    getDashboardStateMock.mockReturnValue({ status: "error", message: "boom <script>alert(1)</script>" });
    root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-"));
    // An app present but unbuilt — proves appHost is untouched by the dashboard's error state.
    const appDir = path.join(root, "apps", "sibling");
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, "manifest.json"), JSON.stringify({ name: "sibling", appId: "sibling" }));

    let base: string;
    ({ server, base } = await boot(cfgFor(root)));

    const res = await fetch(base + "/_dashboard/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("isn't available");
    expect(html).toContain("its build failed");
    expect(html).toContain("boom &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");

    const apps = await fetch(base + "/api/apps");
    expect(apps.status).toBe(200);
    expect(await apps.json()).toEqual([{ name: "sibling", appId: "sibling" }]);

    const sibling = await fetch(base + "/sibling/");
    expect(sibling.status).toBe(200);
    expect(await sibling.text()).toContain("Building");
  });
});
