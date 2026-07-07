import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  configureWorkers, startAppWorker, stopAllWorkers, getServerState,
  onTasksManifest, runTaskInWorker, workerForTest,
} from "../src/appWorker.js";
import type { Config } from "../src/config.js";

let cacheDir: string;
let cfg: Config;
const manifests = new Map<string, { tasks: unknown[]; error?: string }>();

// Hand-written plain-ESM bundles — the worker only needs files on disk, not a Vite build.
function writeApp(appId: string, tasksJs: string | null) {
  const dir = path.join(cacheDir, appId, "server");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, appId, "package.json"), JSON.stringify({ type: "module" }));
  fs.writeFileSync(path.join(dir, "server.js"), `export default { fetch: () => new Response("ok") };\n`);
  if (tasksJs !== null) fs.writeFileSync(path.join(dir, "tasks.js"), tasksJs);
}

async function waitFor(pred: () => boolean, ms: number) {
  const end = Date.now() + ms;
  while (!pred() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
  expect(pred()).toBe(true);
}

beforeAll(() => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-taskworker-"));
  cfg = { root: "", appsDir: "", dataDir: "", cacheDir, port: 0, baseUrl: "" };
  configureWorkers("http://127.0.0.1:9");
  onTasksManifest((appId, tasks, error) => manifests.set(appId, { tasks, error }));
  writeApp("tasky", `
export const ping = { __lodekitTask: true, cron: "0 9 * * *", run: async () => {} };
export const boom = { __lodekitTask: true, run: async () => { throw new Error("kaboom"); } };
export const slow = { __lodekitTask: true, run: () => new Promise((r) => setTimeout(r, 60_000)) };
export const echoFail = { __lodekitTask: true, run: async (p) => { throw new Error("got:" + JSON.stringify(p)); } };
export const notATask = { run: async () => {} };
`);
  writeApp("bare", null);
  writeApp("busted", `throw new Error("bad module");\n`);
});
afterAll(() => {
  stopAllWorkers();
  fs.rmSync(cacheDir, { recursive: true, force: true });
});

describe("worker task protocol", () => {
  it("posts a kebab-cased manifest with config, skipping unmarked exports", async () => {
    startAppWorker(cfg, "tasky");
    await waitFor(() => manifests.has("tasky"), 10_000);
    const { tasks, error } = manifests.get("tasky")!;
    expect(error).toBeUndefined();
    expect([...(tasks as { name: string }[])].sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: "boom" },
      { name: "echo-fail" },
      { name: "ping", cron: "0 9 * * *" },
      { name: "slow" },
    ]);
    await waitFor(() => getServerState("tasky")?.status === "running", 10_000);
  });

  it("runs a task; failures carry the thrown stack; payload passes through", async () => {
    expect(await runTaskInWorker("tasky", "ping", undefined, 5_000)).toEqual({ ok: true });
    const fail = await runTaskInWorker("tasky", "boom", undefined, 5_000);
    expect(fail.ok).toBe(false);
    expect((fail as { message: string }).message).toContain("kaboom");
    const echoed = await runTaskInWorker("tasky", "echo-fail", { n: 7 }, 5_000);
    expect((echoed as { message: string }).message).toContain('got:{"n":7}');
  });

  it("unknown task and timeout resolve ok:false", async () => {
    const unknown = await runTaskInWorker("tasky", "nope", undefined, 5_000);
    expect(unknown).toMatchObject({ ok: false, message: expect.stringContaining("unknown task") });
    const timedOut = await runTaskInWorker("tasky", "slow", undefined, 300);
    expect(timedOut).toMatchObject({ ok: false, message: expect.stringContaining("timed out") });
  });

  it("worker death mid-run settles the pending task ok:false", async () => {
    const p = runTaskInWorker("tasky", "slow", undefined, 30_000);
    await new Promise((r) => setTimeout(r, 100));
    await workerForTest("tasky")!.terminate();
    expect((await p).ok).toBe(false);
    stopAllWorkers(); // don't leak the backoff respawn into other tests
  });

  it("no tasks.js: an empty manifest still arrives (retire-on-delete path)", async () => {
    startAppWorker(cfg, "bare");
    await waitFor(() => manifests.has("bare"), 10_000);
    expect(manifests.get("bare")).toEqual({ tasks: [], error: undefined });
  });

  it("a tasks module that throws on import reports error and keeps serving", async () => {
    startAppWorker(cfg, "busted");
    await waitFor(() => manifests.has("busted"), 10_000);
    expect(manifests.get("busted")!.error).toContain("bad module");
    expect(manifests.get("busted")!.tasks).toEqual([]);
    await waitFor(() => getServerState("busted")?.status === "running", 10_000);
  });
});
