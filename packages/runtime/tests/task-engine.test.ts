import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Config } from "../src/config.js";
import { initTaskEngine, registerManifest, recoverInterruptedRuns, dispatchTasks, evictApp } from "../src/taskEngine.js";
import { initLogStore, queryLogs, closeLogStoreForTest } from "../src/logStore.js";
import {
  getTasksDb, applyManifest, insertRun, claimNextDue, getRun, getDef, listRuns,
} from "../src/services/tasks.js";
import {
  initSettingsStore, closeSettingsStoreForTest, getSettingsDb, setValue, invalidateSettingsCache, getEffective,
} from "../src/services/settings.js";
import type { TaskRunResult } from "../src/appWorker.js";

const BACKOFF_BASE_MS = 30_000; // tasks.backoff_base default (catalog); no longer exported

const T0 = 1_700_000_000_000;
let root: string, cfg: Config, clock: number;
let workerUp: boolean;
let invocations: { appId: string; name: string; payload: unknown; timeoutMs: number }[];
// Each invoke pulls the next scripted result; a pending entry lets tests hold a run in flight.
let script: (TaskRunResult | { hold: Promise<TaskRunResult> })[];

const tick = () => new Promise((r) => setImmediate(r));

function makeApp(appId: string) {
  fs.mkdirSync(path.join(cfg.appsDir, appId), { recursive: true });
  fs.writeFileSync(
    path.join(cfg.appsDir, appId, "manifest.json"),
    JSON.stringify({ name: appId, appId })
  );
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-engine-"));
  cfg = {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: path.join(root, ".cache"),
    stateDir: path.join(root, ".state"),
    port: 0,
    baseUrl: "", secretsKeyProvider: "file",
    gatewaysDir: path.join(root, "gateways"),
  };
  clock = T0;
  workerUp = true;
  invocations = [];
  script = [];
  initTaskEngine(cfg, {
    now: () => clock,
    workerRunning: () => workerUp,
    invoke: async (appId, name, payload, timeoutMs) => {
      invocations.push({ appId, name, payload, timeoutMs });
      const next = script.shift() ?? { ok: true as const };
      return "hold" in next ? next.hold : next;
    },
  });
});
afterEach(() => {
  closeSettingsStoreForTest();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("taskEngine", () => {
  it("runs an enqueued task with the def's timeout and records success", async () => {
    registerManifest("alpha", [{ name: "job", timeout: "1m" }]);
    const db = getTasksDb(cfg.dataDir, "alpha");
    const { runId } = insertRun(db, { task: "job", payload: { n: 1 }, notBefore: clock, source: "enqueue", now: clock });
    dispatchTasks();
    await vi.waitFor(() => expect(getRun(db, runId)!.state).toBe("succeeded"));
    expect(invocations).toEqual([{ appId: "alpha", name: "job", payload: { n: 1 }, timeoutMs: 60_000 }]);
  });

  it("serial per app, parallel across apps", async () => {
    registerManifest("alpha", [{ name: "job" }]);
    registerManifest("beta", [{ name: "job" }]);
    const dbA = getTasksDb(cfg.dataDir, "alpha");
    const dbB = getTasksDb(cfg.dataDir, "beta");
    let releaseA!: (r: TaskRunResult) => void;
    script = [
      { hold: new Promise<TaskRunResult>((r) => (releaseA = r)) },
      { ok: true },
      { ok: true },
    ];
    insertRun(dbA, { task: "job", notBefore: clock, source: "enqueue", now: clock });
    const second = insertRun(dbA, { task: "job", notBefore: clock, source: "enqueue", now: clock + 1 });
    insertRun(dbB, { task: "job", notBefore: clock, source: "enqueue", now: clock });
    dispatchTasks();
    await tick();
    dispatchTasks(); // alpha is in flight — must not double-claim
    await tick();
    expect(invocations.map((i) => i.appId).sort()).toEqual(["alpha", "beta"]); // one per app
    releaseA({ ok: true });
    await vi.waitFor(() => expect(getRun(dbA, second.runId)!.state).toBe("succeeded")); // self-chained
    expect(invocations.length).toBe(3);
  });

  it("worker down: runs wait, no attempt consumed", async () => {
    registerManifest("alpha", [{ name: "job" }]);
    const db = getTasksDb(cfg.dataDir, "alpha");
    const { runId } = insertRun(db, { task: "job", notBefore: clock, source: "enqueue", now: clock });
    workerUp = false;
    dispatchTasks();
    await tick();
    expect(invocations).toEqual([]);
    expect(getRun(db, runId)!).toMatchObject({ state: "queued", attempt: 0 });
    workerUp = true;
    dispatchTasks();
    await vi.waitFor(() => expect(getRun(db, runId)!.state).toBe("succeeded"));
  });

  it("failed attempts retry on the backoff clock", async () => {
    registerManifest("alpha", [{ name: "job", retries: 1 }]);
    const db = getTasksDb(cfg.dataDir, "alpha");
    const { runId } = insertRun(db, { task: "job", notBefore: clock, source: "enqueue", now: clock });
    script = [{ ok: false, message: "boom" }, { ok: true }];
    dispatchTasks();
    await vi.waitFor(() => expect(getRun(db, runId)!).toMatchObject({ state: "queued", attempt: 1 }));
    clock += BACKOFF_BASE_MS - 1;
    dispatchTasks();
    await tick();
    expect(invocations.length).toBe(1); // still backing off
    clock += 2;
    dispatchTasks();
    await vi.waitFor(() => expect(getRun(db, runId)!.state).toBe("succeeded"));
  });

  it("materializes due schedule runs, coalesced, respecting the catch-up window", async () => {
    registerManifest("alpha", [
      { name: "tock", every: "1h", catchUp: "6h" },
      { name: "strict", every: "1h", catchUp: "5m" },
    ]);
    const db = getTasksDb(cfg.dataDir, "alpha");
    clock += 3 * 3_600_000 + 1_000; // three intervals missed
    dispatchTasks();
    await vi.waitFor(() => expect(listRuns(db, { task: "tock" }).length).toBe(1)); // coalesced to one
    expect(listRuns(db, { task: "tock" })[0].source).toBe("schedule");
    // strict's latest occurrence is 1s old? No — it's 1s past the 3h mark, so the
    // occurrence itself is 1s late: within grace, it fires. Push one out of window:
    await vi.waitFor(() => expect(listRuns(db, { task: "strict" }).length).toBe(1));
    clock += 3_600_000 + 20 * 60_000; // next occurrence now 20m stale
    dispatchTasks();
    await tick();
    expect(listRuns(db, { task: "strict" }).length).toBe(1); // dropped: 20m > 5m window
    expect(listRuns(db, { task: "tock" }).length).toBe(2);   // 20m < 6h window: fired
  });

  it("a still-queued schedule run absorbs the next occurrence", async () => {
    registerManifest("alpha", [{ name: "tock", every: "1h", catchUp: "6h" }]);
    const db = getTasksDb(cfg.dataDir, "alpha");
    workerUp = false; // nothing executes; queued schedule runs pile up unless absorbed
    clock += 3_600_000 + 1_000;
    dispatchTasks();
    clock += 3_600_000;
    dispatchTasks();
    await tick();
    expect(listRuns(db, { task: "tock" }).length).toBe(1);
  });

  it("an evicted app stops materializing schedule runs until it re-registers", async () => {
    registerManifest("alpha", [{ name: "tock", every: "1h", catchUp: "6h" }]);
    const db = getTasksDb(cfg.dataDir, "alpha");
    clock += 3_600_000 + 1_000;
    dispatchTasks();
    await vi.waitFor(() => expect(listRuns(db, { task: "tock" }).length).toBe(1));
    evictApp("alpha"); // app folder deleted (watcher unlinkDir)
    clock += 3_600_000;
    dispatchTasks();
    await tick();
    expect(listRuns(db, { task: "tock" }).length).toBe(1); // no polling of a gone app
    // The app comes back (worker boots, manifest re-registers): dispatch resumes.
    registerManifest("alpha", [{ name: "tock", every: "1h", catchUp: "6h" }]);
    await vi.waitFor(() => expect(listRuns(db, { task: "tock" }).length).toBe(2));
  });

  it("recoverInterruptedRuns requeues running rows and re-registers the app", async () => {
    makeApp("alpha");
    const db = getTasksDb(cfg.dataDir, "alpha");
    applyManifest(db, [{ name: "job", retries: 3 }], clock, { minEveryMs: 60_000 });
    insertRun(db, { task: "job", notBefore: clock, source: "enqueue", now: clock });
    const claimed = claimNextDue(db, clock)!; // simulate death mid-run
    initTaskEngine(cfg, { now: () => clock, workerRunning: () => workerUp, invoke: async (a, n, p, t) => { invocations.push({ appId: a, name: n, payload: p, timeoutMs: t }); return { ok: true }; } });
    recoverInterruptedRuns();
    expect(getRun(db, claimed.id)!).toMatchObject({ state: "queued", attempt: 1 });
    clock += BACKOFF_BASE_MS + 1;
    dispatchTasks();
    await vi.waitFor(() => expect(getRun(db, claimed.id)!.state).toBe("succeeded"));
  });

  it("a tasks-module load error keeps previous defs; _dashboard is ignored", async () => {
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true); // error log tees to stderr
    registerManifest("alpha", [{ name: "job" }]);
    const db = getTasksDb(cfg.dataDir, "alpha");
    registerManifest("alpha", [], "SyntaxError: bad module");
    expect(getDef(db, "job")!.retired).toBe(false); // NOT retired by the failed load
    expect(err).toHaveBeenCalled();
    registerManifest("_dashboard", [{ name: "sneaky" }]);
    expect(fs.existsSync(path.join(cfg.dataDir, "_dashboard"))).toBe(false);
    vi.restoreAllMocks();
  });

  it("apps without tasks never get a data dir", () => {
    registerManifest("plain", []);
    expect(fs.existsSync(path.join(cfg.dataDir, "plain"))).toBe(false);
    // Same invariant for settings' per-app effective reads (services/settings.ts
    // getEffective): resolving an unset per-app override must not mkdir the app's data dir.
    initSettingsStore(cfg.dataDir);
    getEffective("hosting.request_timeout", "plain");
    expect(fs.existsSync(path.join(cfg.dataDir, "plain", "db.sqlite"))).toBe(false);
  });

  it("an app's tasks.default_retries override changes the retry budget of unspecified tasks", async () => {
    initSettingsStore(cfg.dataDir);
    registerManifest("alpha", [{ name: "job" }]); // no retries declared → resolves the effective default
    const db = getTasksDb(cfg.dataDir, "alpha");
    setValue(getSettingsDb(cfg.dataDir, "alpha"), "tasks.default_retries", 0);
    invalidateSettingsCache();
    const { runId } = insertRun(db, { task: "job", notBefore: clock, source: "enqueue", now: clock });
    script = [{ ok: false, message: "boom" }];
    dispatchTasks();
    // budget 0: the first failed attempt is terminal — no retry queued.
    await vi.waitFor(() => expect(getRun(db, runId)!.state).toBe("failed"));
    expect(invocations.length).toBe(1);
  });

  it("run lifecycle lands as tasks-source log records (logging spec §8 wiring)", async () => {
    initLogStore(path.join(root, "state"));
    try {
      registerManifest("alpha", [{ name: "job" }]);
      const db = getTasksDb(cfg.dataDir, "alpha");
      const { runId } = insertRun(db, { task: "job", notBefore: clock, source: "enqueue", now: clock });
      dispatchTasks();
      await vi.waitFor(() => expect(getRun(db, runId)!.state).toBe("succeeded"));
      const { records } = queryLogs({ app: "alpha", source: "tasks" });
      const messages = records.map((r) => r.message);
      expect(messages).toContain("run started: job");
      expect(messages).toContain("run succeeded: job");
    } finally {
      closeLogStoreForTest();
    }
  });
});
