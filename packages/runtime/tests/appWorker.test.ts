import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStart } from "../src/build.js";
import {
  configureWorkers, startAppWorker, stopAppWorker, stopAllWorkers, forwardToWorker,
  getServerState, workerForTest,
} from "../src/appWorker.js";
import type { Config } from "../src/config.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fixture = path.join(__dirname, "fixtures", "start-app");

let cacheDir: string;
let cfg: Config;

beforeAll(async () => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "lodekit-worker-"));
  cfg = { root: "", appsDir: "", dataDir: "", cacheDir, port: 0, baseUrl: "" };
  await buildStart({
    rootDir: fixture, outDir: path.join(cacheDir, "start-app"),
    urlBase: "/start-app", appId: "start-app",
  });
  configureWorkers("http://127.0.0.1:9"); // unroutable; SDK calls aren't exercised here
}, 180_000);

afterAll(() => {
  stopAllWorkers();
  fs.rmSync(cacheDir, { recursive: true, force: true });
});

async function waitFor(pred: () => boolean, ms: number) {
  const end = Date.now() + ms;
  while (!pred() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  expect(pred()).toBe(true);
}

describe("appWorker", () => {
  it("spawns, reaches running, and serves an SSR page", async () => {
    startAppWorker(cfg, "start-app");
    expect(getServerState("start-app")?.status).toBe("starting");
    const res = await forwardToWorker("start-app", new Request("http://x/start-app/"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("start fixture ok");
    expect(html).toContain("loader"); // loader ran server-side
    expect(getServerState("start-app")?.status).toBe("running");
  }, 30_000);

  it("a dead worker surfaces as error and respawns; runtime survives", async () => {
    // The crash server fn calls process.exit(1). Trigger it via the fetch handler:
    // Start dispatches POST <serverFns.base>/<fn-id>; we don't know the id, so kill
    // the worker directly instead — same observable contract.
    const { workerForTest } = await import("../src/appWorker.js");
    // (workerForTest(appId) returns the underlying Worker — export it for tests.)
    await workerForTest("start-app")!.terminate();
    await waitFor(() => getServerState("start-app")?.status !== "running", 5_000);
    // Respawn with backoff brings it back:
    await waitFor(() => getServerState("start-app")?.status === "running", 15_000);
    const res = await forwardToWorker("start-app", new Request("http://x/start-app/"));
    expect(res.status).toBe(200);
  }, 30_000);

  it("forwarding to a never-started app throws", async () => {
    await expect(forwardToWorker("nope", new Request("http://x/nope/"))).rejects.toThrow();
  });

  it("stopAppWorker mid-start rejects in-flight forwards (no hang) and clears state", async () => {
    startAppWorker(cfg, "start-app");
    // Awaits m.ready — the worker hasn't posted ready yet (import takes ms; this is sync code).
    const inflight = forwardToWorker("start-app", new Request("http://x/start-app/"));
    stopAppWorker("start-app");
    await expect(inflight).rejects.toThrow("app worker stopped");
    expect(getServerState("start-app")).toBeUndefined();
    await expect(forwardToWorker("start-app", new Request("http://x/start-app/")))
      .rejects.toThrow("no app worker");
  }, 15_000);

  it("a crash mid-start rejects in-flight forwards (no hang)", async () => {
    startAppWorker(cfg, "start-app");
    const inflight = forwardToWorker("start-app", new Request("http://x/start-app/"));
    await workerForTest("start-app")!.terminate();
    await expect(inflight).rejects.toThrow("app worker");
    stopAppWorker("start-app"); // cancel the scheduled respawn; end clean
  }, 15_000);

  it("a missing server bundle surfaces as error state without spawning", () => {
    startAppWorker(cfg, "not-built");
    expect(getServerState("not-built")).toEqual({
      status: "error",
      message: "server bundle missing (not built)",
    });
    expect(workerForTest("not-built")).toBeUndefined();
  });
});
