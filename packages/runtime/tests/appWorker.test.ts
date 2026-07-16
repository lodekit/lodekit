import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { buildStart } from "../src/build.js";
import {
  configureWorkers, startAppWorker, stopAppWorker, stopAllWorkers, forwardToWorker,
  getServerState, workerForTest, setBackoffForTest, FORWARD_BODY_MAX_BYTES,
} from "../src/appWorker.js";
import { CHANGE_FEED_TTL_S } from "../src/events.js";
import { initEventStore, queryEvents, closeEventStoreForTest } from "../src/eventStore.js";
import type { Config } from "../src/config.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fixture = path.join(__dirname, "fixtures", "start-app");

let cacheDir: string;
let cfg: Config;

beforeAll(async () => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "lodekit-worker-"));
  cfg = { root: "", appsDir: "", dataDir: "", cacheDir, stateDir: "", port: 0, baseUrl: "", secretsKeyProvider: "file", gatewaysDir: "" };
  initEventStore(path.join(cacheDir, "data")); // capture server-state events durably
  await buildStart({
    rootDir: fixture, outDir: path.join(cacheDir, "start-app"),
    urlBase: "/start-app", appId: "start-app",
  });
  configureWorkers("http://127.0.0.1:9"); // unroutable; SDK calls aren't exercised here
}, 180_000);

afterAll(() => {
  stopAllWorkers();
  closeEventStoreForTest();
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

  it("caps forwarded request bodies at FORWARD_BODY_MAX_BYTES (413, never reaches the worker)", async () => {
    // Declared oversize (Content-Length) — rejected before the body is read.
    const oversize = new Request("http://x/start-app/", {
      method: "POST",
      body: new Uint8Array(FORWARD_BODY_MAX_BYTES + 1),
    });
    expect((await forwardToWorker("start-app", oversize)).status).toBe(413);

    // Undeclared size (streamed body, no Content-Length) — counted while reading.
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > FORWARD_BODY_MAX_BYTES) return controller.close();
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const chunked = new Request("http://x/start-app/", {
      method: "POST",
      body: stream,
      // @ts-expect-error undici requires half-duplex for stream bodies; not in DOM types
      duplex: "half",
    });
    expect(chunked.headers.get("content-length")).toBeNull();
    expect((await forwardToWorker("start-app", chunked)).status).toBe(413);

    // An in-budget body still reaches the worker (any non-413 response proves the forward).
    const ok = new Request("http://x/start-app/", { method: "POST", body: "small" });
    expect((await forwardToWorker("start-app", ok)).status).not.toBe(413);
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

  it("gives up respawning after 5 consecutive boot failures; the next build retries", async () => {
    // A bundle that throws at import is permanently fatal — every boot crashes.
    const dir = path.join(cacheDir, "crash-app", "server");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "server.js"), 'throw new Error("boom");\nexport default {};\n');
    setBackoffForTest(50, 100);
    try {
      const boots = () =>
        queryEvents({ ns: "crash-app", type: "server-state", limit: 1000 })
          .records.filter((r) => r.payload?.status === "starting").length;
      startAppWorker(cfg, "crash-app");
      await waitFor(() => boots() >= 5, 15_000);
      // Latched: past the backoff cap, no 6th spawn happens.
      await new Promise((r) => setTimeout(r, 1_000));
      expect(boots()).toBe(5);
      expect(getServerState("crash-app")?.status).toBe("error");
      // A rebuild restarts the worker with a fresh counter — the latch clears.
      startAppWorker(cfg, "crash-app");
      await waitFor(() => boots() >= 6, 5_000);
    } finally {
      setBackoffForTest();
      stopAppWorker("crash-app");
    }
  }, 30_000);

  it("server-state events carry the 7-day service ttl", () => {
    startAppWorker(cfg, "not-built-ttl"); // missing bundle → emits an error server-state event
    const db = new Database(path.join(cacheDir, "data", "_platform", "events.sqlite"), { readonly: true });
    const row = db
      .prepare("SELECT ts, expires_at FROM events WHERE ns = ? AND type = 'server-state' ORDER BY id DESC LIMIT 1")
      .get("not-built-ttl") as { ts: number; expires_at: number | null };
    db.close();
    expect(row.expires_at).toBe(row.ts + CHANGE_FEED_TTL_S * 1000);
  });
});
