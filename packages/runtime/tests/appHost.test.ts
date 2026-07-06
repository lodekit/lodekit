import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";
import { buildApp } from "../src/build.js";
import { configureWorkers, stopAllWorkers, workerForTest, getServerState } from "../src/appWorker.js";
import type { Config } from "../src/config.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fixture = path.join(__dirname, "fixtures", "start-app");

let root: string, cache: string, cfg: Config, server: Server, base: string;

function copyDir(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// Copies the fixture Start app (tests/fixtures/start-app) under a fresh app id.
function writeFixtureApp(appId: string) {
  const dir = path.join(root, "apps", appId);
  copyDir(fixture, dir);
  fs.rmSync(path.join(dir, "src", "routeTree.gen.ts"), { force: true }); // regenerated at build time
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ name: appId, appId }));
}

function writeBrokenApp(appId: string) {
  const dir = path.join(root, "apps", appId);
  copyDir(fixture, dir);
  fs.rmSync(path.join(dir, "src", "routeTree.gen.ts"), { force: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ name: appId, appId }));
  fs.writeFileSync(
    path.join(dir, "src", "routes", "index.tsx"),
    `import { createFileRoute } from "@tanstack/react-router";\nexport const Route = createFileRoute("/")({\n  component: () => <h1>oops</h1>  // missing brace\n`
  );
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-root-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-cache-"));
  cfg = {
    root, appsDir: path.join(root, "apps"), dataDir: path.join(root, "data"),
    cacheDir: cache, stateDir: path.join(root, ".state"), port: 0, baseUrl: "http://lodekit.localhost:0",
  };
  await new Promise<void>((r) => { server = createServer(cfg).listen(0, () => r()); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  configureWorkers(base);
});
afterEach(() => {
  stopAllWorkers();
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
});

describe("appHost", () => {
  it("redirects /<appId> to /<appId>/", async () => {
    writeFixtureApp("redir");
    await buildApp(cfg, "redir");
    const res = await fetch(base + "/redir", { redirect: "manual" });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/redir/");
  }, 60000);

  it("serves a building page when there is no built output yet", async () => {
    writeFixtureApp("pending");
    const html = await (await fetch(base + "/pending/")).text();
    expect(html).toContain("Building");
  });

  it("serves a build-failed page when the app is in error state (precedence over building/ready)", async () => {
    writeBrokenApp("bad");
    await buildApp(cfg, "bad");
    const res = await fetch(base + "/bad/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Build failed");
  }, 60000);

  it("serves a real client asset at /_build/<asset> once built", async () => {
    writeFixtureApp("built");
    await buildApp(cfg, "built");
    const html = await (await fetch(base + "/built/")).text();
    const assetMatch = html.match(/\/built\/_build\/assets\/[\w.-]+\.js/);
    expect(assetMatch).toBeTruthy();
    expect((await fetch(base + assetMatch![0])).status).toBe(200);
  }, 60000);

  it("blocks path traversal out of the client cache dir via /_build/..", async () => {
    writeFixtureApp("safe");
    await buildApp(cfg, "safe");
    expect((await fetch(base + "/safe/_build/..%2f..%2fpackage.json")).status).toBe(403);
  }, 60000);

  it("400s on malformed percent-encoding under /_build/", async () => {
    writeFixtureApp("malformed");
    await buildApp(cfg, "malformed");
    expect((await fetch(base + "/malformed/_build/%zz")).status).toBe(400);
  }, 60000);

  it("forwards an extension-less sub-path straight to the app worker (Start's own router answers, not appHost)", async () => {
    // The single-route fixture has no route for "/anything" — Start's router legitimately
    // renders its own 404 (full SSR document, TSR hydration markers). That response proves
    // the forward happened; appHost no longer has (or applies) any filesystem-based
    // SPA-fallback/404 logic of its own for this path.
    writeFixtureApp("deep");
    await buildApp(cfg, "deep");
    const res = await fetch(base + "/deep/anything");
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("start fixture");
  }, 60000);

  it("rejects /_serverFn/* without a same-origin Sec-Fetch-Site header", async () => {
    writeFixtureApp("guarded");
    await buildApp(cfg, "guarded");
    const res = await fetch(base + "/guarded/_serverFn/x", { method: "POST" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "server functions are same-origin only" });
  }, 60000);

  it("forwards /_serverFn/* to the worker when Sec-Fetch-Site: same-origin is present", async () => {
    writeFixtureApp("guarded2");
    await buildApp(cfg, "guarded2");
    const res = await fetch(base + "/guarded2/_serverFn/x", {
      method: "POST",
      headers: { "Sec-Fetch-Site": "same-origin" },
    });
    expect(res.status).not.toBe(403);
  }, 60000);

  it("serves the server-error page (502) when the app worker is down", async () => {
    writeFixtureApp("dead");
    await buildApp(cfg, "dead");
    // Prove it works first, then kill the worker underneath the built app.
    expect((await fetch(base + "/dead/")).status).toBe(200);
    await workerForTest("dead")!.terminate();
    // Wait for the crash to register (the 'exit' listener firing isn't synchronized with
    // terminate()'s own promise) so the request below hits a known-down worker instead of
    // racing appWorker's 30s request timeout.
    const deadline = Date.now() + 5000;
    while (getServerState("dead")?.status === "running" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    const res = await fetch(base + "/dead/");
    expect(res.status).toBe(502);
    expect(await res.text()).toContain("App error");
  }, 20000);
});
