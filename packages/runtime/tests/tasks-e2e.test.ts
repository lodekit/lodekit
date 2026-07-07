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

async function pollRun(runId: number, pred: (run: { state: string; attempt: number }) => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let run: { state: string; attempt: number; error: string | null; notBefore: number } | undefined;
  while (Date.now() < deadline) {
    run = await (await fetch(`${base}/api/apps/start-app/tasks/runs/${runId}`)).json() as typeof run;
    if (run && pred(run)) return run;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`run ${runId} never matched; last: ${JSON.stringify(run)}`);
}

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-taskse2e-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-taskse2e-cache-"));
  copyDir(fixture, path.join(root, "apps", "start-app"));
  fs.writeFileSync(
    path.join(root, "apps", "start-app", "src", "tasks.ts"),
    `import { task, kv } from "@lodekit/sdk";

export const record = task({ run: async (p: { key: string }) => {
  await kv.set(p.key, "ran");
} });

export const explode = task({ retries: 3, run: async () => { throw new Error("explode!"); } });
`
  );
  process.env.LODEKIT_ROOT = root;
  process.env.LODEKIT_CACHE_DIR = cache;
  process.env.LODEKIT_PORT = "0";
  server = await start(loadConfig());
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  await waitReady("start-app", 90_000);
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

describe("tasks e2e (real worker, real dispatcher)", () => {
  it("worker boot registers the manifest; defs are listable", async () => {
    const { tasks } = await (await fetch(`${base}/api/apps/start-app/tasks`)).json();
    const names = tasks.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual(["explode", "record"]);
    expect(tasks.find((t: { name: string }) => t.name === "record").schedule).toBeNull();
  }, 15_000);

  it("enqueue -> handler runs in the app worker with SDK access -> succeeded", async () => {
    const res = await fetch(`${base}/api/apps/start-app/tasks/record/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: { key: "task:proof" } }),
    });
    const { runId } = await res.json();
    await pollRun(runId, (r) => r.state === "succeeded", 15_000);
    const kv = await (await fetch(`${base}/api/apps/start-app/kv-store/${encodeURIComponent("task:proof")}`)).json();
    expect(kv).toMatchObject({ found: true, value: "ran" });
  }, 30_000);

  it("a throwing handler schedules a retry (queued, attempt 1, backoff notBefore)", async () => {
    const before = Date.now();
    const res = await fetch(`${base}/api/apps/start-app/tasks/explode/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { runId } = await res.json();
    const run = await pollRun(runId, (r) => r.state === "queued" && r.attempt === 1, 15_000);
    expect(run.error).toContain("explode!");
    expect(run.notBefore).toBeGreaterThanOrEqual(before + 29_000); // ~30s backoff
  }, 30_000);
});
