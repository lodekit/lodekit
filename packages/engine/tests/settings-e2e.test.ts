// settings-e2e.test.ts — harness copied verbatim from tasks-e2e.test.ts (same
// fixture-app scaffold + start(cfg) + wait helpers; only the fixture file and
// assertions below differ).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
const APP = "start-app";

let root: string, cache: string, server: Server, base: string;

function copyDir(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

async function waitReady(appId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await (await fetch(`${base}/${appId}/`)).text();
    if (last.includes("/_build/")) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${appId}; last page: ${last.slice(0, 300)}`);
}

async function waitForDeclaredKeys(expected: string[], timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let last: string[] = [];
  while (Date.now() < deadline) {
    const doc = await (await fetch(`${base}/api/apps/${APP}/settings`)).json();
    last = doc.declared.map((d: { key: string }) => d.key).sort();
    if (JSON.stringify(last) === JSON.stringify([...expected].sort())) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`declared keys never matched ${JSON.stringify(expected)}; last: ${JSON.stringify(last)}`);
}

const settingsTs = `
import { defineSettings, boolean, duration } from "@lodekit/sdk";
export default defineSettings({
  show_archived: boolean({ label: "Show archived", description: "Include archived items.", default: false }),
  refresh_every: duration({ label: "Refresh", description: "Background refresh interval.", default: "15m", min: "1m" }),
});
`;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-settingse2e-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-settingse2e-cache-"));
  copyDir(fixture, path.join(root, "apps", APP));
  fs.writeFileSync(path.join(root, "apps", APP, "src", "settings.ts"), settingsTs);
  process.env.LODEKIT_ROOT = root;
  process.env.LODEKIT_CACHE_DIR = cache;
  process.env.LODEKIT_PORT = "0";
  server = await start(loadConfig());
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  await waitReady(APP, 90_000);
}, 120_000);
afterAll(async () => {
  stopAllWorkers();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
  delete process.env.LODEKIT_ROOT;
  delete process.env.LODEKIT_CACHE_DIR;
  delete process.env.LODEKIT_PORT;
});

describe("settings e2e (real worker, real dispatcher)", () => {
  it("registers declared settings on worker boot; SDK-typed read round-trips over HTTP", async () => {
    const doc = await (await fetch(`${base}/api/apps/${APP}/settings`)).json();
    const keys = doc.declared.map((d: { key: string }) => d.key).sort();
    expect(keys).toEqual(["refresh_every", "show_archived"]);
    expect((await (await fetch(`${base}/api/apps/${APP}/settings/refresh_every`)).json())).toEqual({ found: true, value: "15m" });
  }, 15_000);

  it("a removed declaration prunes on the next boot; a broken module keeps previous defs", async () => {
    // Give refresh_every a stored value first, so pruning it is observable.
    await fetch(`${base}/api/apps/${APP}/settings/refresh_every`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "30m" }),
    });
    expect(await (await fetch(`${base}/api/apps/${APP}/settings/refresh_every`)).json()).toEqual({ found: true, value: "30m" });

    // 1. Rewrite src/settings.ts with only show_archived → rebuild (the running
    //    watcher picks up the file change and rebuilds+restarts the worker) →
    //    declared shrinks to one, and the pruned key's stored value is gone.
    fs.writeFileSync(
      path.join(root, "apps", APP, "src", "settings.ts"),
      `import { defineSettings, boolean } from "@lodekit/sdk";
export default defineSettings({
  show_archived: boolean({ label: "Show archived", description: "Include archived items.", default: false }),
});
`
    );
    await waitForDeclaredKeys(["show_archived"], 30_000);
    expect(await (await fetch(`${base}/api/apps/${APP}/settings/refresh_every`)).json()).toEqual({ found: false });

    // 2. Rewrite src/settings.ts to throw at module top-level → rebuild → declared
    //    still lists show_archived (load error keeps previous defs).
    fs.writeFileSync(path.join(root, "apps", APP, "src", "settings.ts"), `throw new Error("boom");\n`);
    await waitReady(APP, 30_000); // build + worker restart complete; app still serves
    // The settings-manifest message is posted asynchronously right after "ready" —
    // give it a moment, then assert the previous declaration set survived the error.
    await new Promise((r) => setTimeout(r, 1_000));
    const doc = await (await fetch(`${base}/api/apps/${APP}/settings`)).json();
    expect(doc.declared.map((d: { key: string }) => d.key).sort()).toEqual(["show_archived"]);
  }, 60_000);
});
