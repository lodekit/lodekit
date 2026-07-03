import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";
import { buildApp, dropBuild } from "../src/build.js";
import type { Config } from "../src/config.js";

let root: string, cache: string, cfg: Config, server: Server, base: string;

function writeApp(appId: string, appTsx: string) {
  const src = path.join(root, "apps", appId, "src");
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(root, "apps", appId, "manifest.json"), JSON.stringify({ name: appId, appId }));
  fs.writeFileSync(
    path.join(root, "apps", appId, "index.html"),
    `<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`
  );
  fs.writeFileSync(path.join(src, "main.tsx"),
    `import { createRoot } from "react-dom/client";\nimport App from "./App";\ncreateRoot(document.getElementById("root")!).render(<App />);\n`);
  fs.writeFileSync(path.join(src, "App.tsx"), appTsx);
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-root-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-cache-"));
  cfg = {
    root, appsDir: path.join(root, "apps"), dataDir: path.join(root, "data"),
    cacheDir: cache, port: 0, baseUrl: "http://lodekit.localhost:0",
  };
  await new Promise<void>((r) => { server = createServer(cfg).listen(0, () => r()); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterEach(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
});

describe("appHost", () => {
  it("serves the built index.html and a hashed asset once built", async () => {
    writeApp("built", `export default function App() { return <h1>hello built</h1>; }`);
    await buildApp(cfg, "built");
    const html = await (await fetch(base + "/built/")).text();
    expect(html).toContain("<div id=\"root\">");
    expect(html).toContain("/assets/");
    expect(html).not.toContain("/_lodekit/sdk.js");
    const assetMatch = html.match(/\/assets\/[\w.-]+\.js/);
    expect(assetMatch).toBeTruthy();
    expect((await fetch(base + "/built" + assetMatch![0])).status).toBe(200);
  }, 30000);

  it("redirects /<appId> to /<appId>/", async () => {
    writeApp("redir", `export default function App() { return <h1>r</h1>; }`);
    await buildApp(cfg, "redir");
    const res = await fetch(base + "/redir", { redirect: "manual" });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/redir/");
  }, 30000);

  it("serves a building page when there is no built output yet", async () => {
    writeApp("pending", `export default function App() { return <h1>p</h1>; }`);
    const html = await (await fetch(base + "/pending/")).text();
    expect(html).toContain("Building");
  });

  it("serves a build-failed page when the app is in error state", async () => {
    writeApp("bad", `export default function App() { return <h1>x</h1>  // missing brace\n`);
    await buildApp(cfg, "bad");
    const res = await fetch(base + "/bad/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Build failed");
  }, 30000);

  it("blocks path traversal out of the cache dir", async () => {
    writeApp("safe", `export default function App() { return <h1>s</h1>; }`);
    await buildApp(cfg, "safe");
    expect((await fetch(base + "/safe/..%2f..%2fpackage.json")).status).toBe(403);
    dropBuild(cfg, "safe");
  }, 30000);
});
