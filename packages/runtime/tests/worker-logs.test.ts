import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { configureWorkers, startAppWorker, stopAllWorkers, forwardToWorker } from "../src/appWorker.js";
import { initLogStore, queryLogs, closeLogStoreForTest } from "../src/logStore.js";
import type { Config } from "../src/config.js";

let cacheDir: string, stateDir: string, cfg: Config;

const SERVER = `
console.log("booting", { step: 1 });
export default {
  fetch(req) {
    if (new URL(req.url).pathname.endsWith("/warn")) console.warn(new Error("kaboom"));
    return new Response("ok");
  },
};
`;

async function waitFor(pred: () => boolean, ms: number) {
  const end = Date.now() + ms;
  while (!pred() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
  expect(pred()).toBe(true);
}

beforeEach(() => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-wl-cache-"));
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-wl-state-"));
  initLogStore(stateDir);
  cfg = { root: "", appsDir: "", dataDir: "", cacheDir, stateDir, port: 0, baseUrl: "" };
  const serverDir = path.join(cacheDir, "loggy", "server");
  fs.mkdirSync(serverDir, { recursive: true });
  fs.writeFileSync(path.join(serverDir, "package.json"), '{"type":"module"}');
  fs.writeFileSync(path.join(serverDir, "server.js"), SERVER);
  configureWorkers("http://127.0.0.1:9");
});
afterEach(() => {
  stopAllWorkers();
  closeLogStoreForTest();
  fs.rmSync(cacheDir, { recursive: true, force: true });
  fs.rmSync(stateDir, { recursive: true, force: true });
});

describe("worker log capture", () => {
  it("captures console output tagged to the app, formats objects, carries stacks", async () => {
    startAppWorker(cfg, "loggy");
    await forwardToWorker("loggy", new Request("http://x/loggy/warn"));
    await waitFor(() => queryLogs({ app: "loggy", source: "console" }).records.length >= 2, 5_000);
    const records = queryLogs({ app: "loggy", source: "console" }).records;
    const boot = records.find((r) => r.message.includes("booting"))!;
    expect(boot.level).toBe("info"); // console.log → info
    expect(boot.message).toContain("step: 1"); // objects inspect-formatted
    const warn = records.find((r) => r.level === "warn")!;
    expect(warn.message).toContain("kaboom");
    expect(String(warn.fields?.stack)).toContain("kaboom"); // Error arg → fields.stack
  });

  it("logs lifecycle: ready on start, error with the crash on termination", async () => {
    startAppWorker(cfg, "loggy");
    await forwardToWorker("loggy", new Request("http://x/loggy/"));
    await waitFor(() => queryLogs({ app: "loggy", source: "lifecycle" }).records.some((r) => r.level === "info"), 5_000);
    const { workerForTest } = await import("../src/appWorker.js");
    await workerForTest("loggy")!.terminate();
    await waitFor(
      () => queryLogs({ app: "loggy", source: "lifecycle", level: "error" }).records.length > 0,
      5_000
    );
  });

  it("logs a fatal import failure with its stack", async () => {
    const badDir = path.join(cacheDir, "broken", "server");
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(path.join(badDir, "package.json"), '{"type":"module"}');
    fs.writeFileSync(path.join(badDir, "server.js"), 'throw new Error("import bang");');
    startAppWorker(cfg, "broken");
    await waitFor(
      () => queryLogs({ app: "broken", level: "error" }).records.some((r) => String(r.fields?.stack ?? r.message).includes("import bang")),
      5_000
    );
  });
});
