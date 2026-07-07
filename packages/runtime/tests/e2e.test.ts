import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import { start } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { stopAllWorkers } from "../src/appWorker.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fixture = path.join(__dirname, "fixtures", "start-app");

let root: string, cache: string, server: Server, base: string;

function copyDir(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// Poll the app endpoint until it serves built output (the built shell references /_build/;
// the building page does not). Deterministic — unlike subscribing to the SSE `ready` event,
// which start()'s buildAll can broadcast before a listener attaches (the event is then
// missed and the wait hangs). A transient "Build failed" is tolerated and re-polled: build
// state is a process-global map, so a prior test's in-flight build against its
// since-removed temp dir can briefly leave this app id in error before the correct build
// supersedes it. A genuine failure persists to the deadline, where we surface the last page
// for diagnosis.
async function waitReady(base: string, appId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await (await fetch(base + "/" + appId + "/")).text();
    if (last.includes("/_build/")) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${appId} to build; last page: ${last.slice(0, 300)}`);
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-root-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-cache-"));
  copyDir(
    path.join(__dirname, "../../../root/apps/greenhouse"),
    path.join(root, "apps", "greenhouse")
  );
  copyDir(
    path.join(__dirname, "../../../root/apps/welcome"),
    path.join(root, "apps", "welcome")
  );
  // The loopback round-trip proof: a route whose loader calls the fixture's `bump` server
  // function, which round-trips through the SDK's server-side loopback door to kv-store.
  copyDir(fixture, path.join(root, "apps", "start-app"));
  fs.rmSync(path.join(root, "apps", "start-app", "src", "routeTree.gen.ts"), { force: true });
  fs.writeFileSync(
    path.join(root, "apps", "start-app", "src", "routes", "bump.tsx"),
    `import { createFileRoute } from "@tanstack/react-router";\nimport { bump } from "../fns";\n\nexport const Route = createFileRoute("/bump")({\n  loader: () => bump(),\n  component: () => {\n    const n = Route.useLoaderData();\n    return <p id="bump-value">{n}</p>;\n  },\n});\n`
  );
  process.env.LODEKIT_ROOT = root;
  process.env.LODEKIT_CACHE_DIR = cache;
  process.env.LODEKIT_STATE_DIR = path.join(root, "state");
  process.env.LODEKIT_PORT = "0";
  server = await start(loadConfig());
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  await waitReady(base, "greenhouse", 60000);
  await waitReady(base, "welcome", 60000);
  await waitReady(base, "start-app", 60000);
}, 120000); // hook builds three real Start apps; well above vitest's 10s default
afterEach(async () => {
  stopAllWorkers();
  // start()'s "close" listener also calls stopAllWorkers() — if that fires late (Node's
  // http server only emits "close" once every keep-alive socket this test's fetch() calls
  // opened has actually closed) it would land after the *next* test's beforeEach has
  // already repopulated the (module-global) worker registry with same-named workers,
  // killing them out from under it. Force sockets closed and wait for "close" here so that
  // stale event can never leak into the next test.
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
  delete process.env.LODEKIT_ROOT;
  delete process.env.LODEKIT_CACHE_DIR;
  delete process.env.LODEKIT_STATE_DIR;
  delete process.env.LODEKIT_PORT;
});

describe("showcase apps e2e (Start)", () => {
  it("greenhouse / is server-rendered with seeded content, and is registered", async () => {
    const list = await (await fetch(base + "/api/apps")).json();
    expect(list.map((a: { appId: string }) => a.appId)).toContain("greenhouse");
    const html = await (await fetch(base + "/greenhouse/")).text();
    // SSR'd: the loader seeds on first fetch and renders the demo plants.
    expect(html).toContain("Fernando");
    expect(html).toContain("Conservatory");
  }, 45000);

  it("greenhouse seeding wrote the flag and queued care reminders", async () => {
    await (await fetch(base + "/greenhouse/")).text(); // ensure the loader ran
    const seeded = await (await fetch(base + "/api/apps/greenhouse/kv-store/seeded")).json();
    expect(seeded.found).toBe(true);
    const body = await (
      await fetch(base + "/api/apps/greenhouse/tasks/runs?state=queued")
    ).json();
    // Deviation from brief: the endpoint returns { runs: [...] }, not a bare array.
    expect(Array.isArray(body.runs)).toBe(true);
    expect(body.runs.length).toBeGreaterThan(0);
  }, 45000);

  it("greenhouse /almanac is a working deep link (multi-route)", async () => {
    const res = await fetch(base + "/greenhouse/almanac");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Almanac");
  }, 45000);

  it("emits app-prefixed /_build/ asset URLs that resolve as written in the shell", async () => {
    const html = await (await fetch(base + "/greenhouse/")).text();
    const src = html.match(/src="([^"]+\.js)"/)?.[1];
    expect(src).toBeTruthy();
    expect(src!.startsWith("/greenhouse/_build/")).toBe(true);
    expect((await fetch(base + src!)).status).toBe(200);
  }, 45000);

  it("welcome / is server-rendered and its visit counter increments across fetches", async () => {
    const countOf = async () => {
      const html = await (await fetch(base + "/welcome/")).text();
      const m = html.match(/id="visit-count">(\d+)</);
      if (!m) throw new Error(`visit count not found in page: ${html.slice(0, 300)}`);
      return Number(m[1]);
    };
    const html = await (await fetch(base + "/welcome/")).text();
    expect(html).toContain("Welcome to Lodekit");
    const first = await countOf();
    const second = await countOf();
    expect(second).toBe(first + 1);
  }, 45000);
});

describe("app worker loopback round-trip", () => {
  it("GET /start-app/ renders the SSR'd loader content", async () => {
    const html = await (await fetch(base + "/start-app/")).text();
    expect(html).toContain("start fixture ok");
    expect(html).toContain("loader"); // ping's loader-supplied echo, rendered server-side
  }, 20000);

  it("a loader calling bump increments across two SSR fetches (worker -> loopback HTTP -> kv)", async () => {
    const valueOf = async () => {
      const html = await (await fetch(base + "/start-app/bump")).text();
      const m = html.match(/<p id="bump-value">(\d+)<\/p>/);
      if (!m) throw new Error(`bump value not found in page: ${html.slice(0, 300)}`);
      return Number(m[1]);
    };
    const first = await valueOf();
    const second = await valueOf();
    expect(second).toBe(first + 1);
  }, 20000);
});
