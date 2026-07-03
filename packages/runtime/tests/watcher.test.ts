import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { start } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { isGeneratedPath } from "../src/watcher.js";
import { stopAllWorkers } from "../src/appWorker.js";

let root: string, cache: string, server: Server, base: string;

async function collectEvents(base: string, until: string, timeoutMs: number): Promise<string> {
  const res = await fetch(base + "/api/events");
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value);
    if (buf.includes(until)) break;
  }
  await reader.cancel();
  return buf;
}

// Fixture-shaped Start app (see tests/fixtures/start-app): manifest + src/router.tsx +
// src/routes/{__root,index}.tsx — no HTML entry, routeTree.gen.ts generated at build time.
function writeApp(appId: string, indexRoute: string) {
  const src = path.join(root, "apps", appId, "src");
  const routes = path.join(src, "routes");
  fs.mkdirSync(routes, { recursive: true });
  fs.writeFileSync(path.join(root, "apps", appId, "manifest.json"), JSON.stringify({ name: appId, appId }));
  fs.writeFileSync(
    path.join(src, "router.tsx"),
    `import { createRouter } from "@tanstack/react-router";\nimport { routeTree } from "./routeTree.gen";\n\nexport function getRouter() {\n  return createRouter({ routeTree });\n}\n\ndeclare module "@tanstack/react-router" {\n  interface Register {\n    router: ReturnType<typeof getRouter>;\n  }\n}\n`
  );
  fs.writeFileSync(
    path.join(routes, "__root.tsx"),
    `import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";\n\nexport const Route = createRootRoute({\n  head: () => ({ meta: [{ title: "${appId}" }] }),\n  component: () => (\n    <html>\n      <head><HeadContent /></head>\n      <body><Outlet /><Scripts /></body>\n    </html>\n  ),\n});\n`
  );
  fs.writeFileSync(path.join(routes, "index.tsx"), indexRoute);
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-root-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-cache-"));
  process.env.LODEKIT_ROOT = root;
  process.env.LODEKIT_CACHE_DIR = cache;
  process.env.LODEKIT_PORT = "0";
  server = await start(loadConfig());
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
}, 60000);
afterEach(() => {
  stopAllWorkers();
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
  delete process.env.LODEKIT_ROOT;
  delete process.env.LODEKIT_CACHE_DIR;
  delete process.env.LODEKIT_PORT;
});

describe("watcher", () => {
  it("emits building then ready when a valid app appears", async () => {
    const done = collectEvents(base, "event: building", 30000);
    // give the SSE reader a tick to attach before writing files
    await new Promise((r) => setTimeout(r, 100));
    writeApp(
      "wgood",
      `import { createFileRoute } from "@tanstack/react-router";\nexport const Route = createFileRoute("/")({\n  component: () => <h1>ok</h1>,\n});\n`
    );
    const buf = await done;
    expect(buf).toContain("event: building");
    // wait for the ready event specifically
    const ready = await collectEvents(base, "event: ready", 30000);
    expect(ready).toContain("event: ready");
  }, 40000);

  it("emits an error event for a broken app", async () => {
    await new Promise((r) => setTimeout(r, 100));
    writeApp(
      "wbad",
      `import { createFileRoute } from "@tanstack/react-router";\nexport const Route = createFileRoute("/")({\n  component: () => <h1>x</h1>  // missing brace\n`
    );
    const buf = await collectEvents(base, "event: error", 30000);
    expect(buf).toContain("event: error");
  }, 40000);

  it("triggers a rebuild when only a route file changes (the canonical editing surface)", async () => {
    const done = collectEvents(base, "event: building", 30000);
    await new Promise((r) => setTimeout(r, 100));
    writeApp(
      "wroute",
      `import { createFileRoute } from "@tanstack/react-router";\nexport const Route = createFileRoute("/")({\n  component: () => <h1>v1</h1>,\n});\n`
    );
    await done;
    await collectEvents(base, "event: ready", 30000);

    // Edit ONLY the route file — no manifest/router touch — and confirm a rebuild fires.
    const rebuildDone = collectEvents(base, "event: building", 30000);
    await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(
      path.join(root, "apps", "wroute", "src", "routes", "index.tsx"),
      `import { createFileRoute } from "@tanstack/react-router";\nexport const Route = createFileRoute("/")({\n  component: () => <h1>v2</h1>,\n});\n`
    );
    const buf = await rebuildDone;
    expect(buf).toContain("event: building");
  }, 60000);
});

describe("isGeneratedPath", () => {
  it("flags a routeTree.gen.ts file", () => {
    expect(isGeneratedPath(path.join("apps", "my-app", "src", "routeTree.gen.ts"))).toBe(true);
  });

  it("does not flag an ordinary route file", () => {
    expect(isGeneratedPath(path.join("apps", "my-app", "src", "routes", "index.tsx"))).toBe(false);
  });

  it("flags anything under a .tanstack scratch directory", () => {
    expect(isGeneratedPath(path.join("apps", "my-app", ".tanstack", "tmp", "x"))).toBe(true);
  });
});
