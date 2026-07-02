import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Supervisor } from "../src/supervisor.js";

function fakeChild({ obeysSigterm = true } = {}) {
  const child = new EventEmitter();
  child.pid = 4242;
  child.signalsSent = [];
  child.kill = (sig) => {
    child.signalsSent.push(sig);
    if (sig === "SIGTERM" && obeysSigterm) queueMicrotask(() => child.emit("exit", 0, "SIGTERM"));
    if (sig === "SIGKILL") queueMicrotask(() => child.emit("exit", null, "SIGKILL"));
    return true;
  };
  return child;
}

function tmpPidFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lodekit-sup-")), "runtime.pid");
}

// Small real-time budgets keep the suite fast without fake timers.
const fastOpts = { startTimeoutMs: 500, pollIntervalMs: 10, graceMs: 100 };

describe("Supervisor", () => {
  it("reaches running once the runtime answers health checks", async () => {
    const child = fakeChild();
    let spawned = false;
    const pidFile = tmpPidFile();
    const sup = new Supervisor({
      ...fastOpts,
      pidFile,
      spawnRuntime: () => ((spawned = true), child),
      checkHealth: async () => spawned,
    });
    await sup.start();
    expect(sup.state).toBe("running");
    expect(fs.readFileSync(pidFile, "utf8")).toBe("4242");
  });

  it("errors without spawning when the port is already taken", async () => {
    let spawnCalls = 0;
    const sup = new Supervisor({
      ...fastOpts,
      pidFile: tmpPidFile(),
      spawnRuntime: () => ((spawnCalls += 1), fakeChild()),
      checkHealth: async () => true,
    });
    await sup.start();
    expect(sup.state).toBe("error");
    expect(sup.errorMessage).toMatch(/already in use/);
    expect(spawnCalls).toBe(0);
  });

  it("surfaces an unexpected exit as an error and removes the pid file", async () => {
    const child = fakeChild();
    let spawned = false;
    const pidFile = tmpPidFile();
    const sup = new Supervisor({
      ...fastOpts,
      pidFile,
      spawnRuntime: () => ((spawned = true), child),
      checkHealth: async () => spawned,
    });
    await sup.start();
    child.emit("exit", 1, null);
    expect(sup.state).toBe("error");
    expect(sup.errorMessage).toMatch(/Runtime exited/);
    expect(fs.existsSync(pidFile)).toBe(false);
  });

  it("stop sends SIGTERM and lands in stopped", async () => {
    const child = fakeChild();
    let spawned = false;
    const pidFile = tmpPidFile();
    const sup = new Supervisor({
      ...fastOpts,
      pidFile,
      spawnRuntime: () => ((spawned = true), child),
      checkHealth: async () => spawned,
    });
    await sup.start();
    await sup.stop();
    expect(child.signalsSent).toContain("SIGTERM");
    expect(sup.state).toBe("stopped");
    expect(fs.existsSync(pidFile)).toBe(false);
  });

  it("escalates to SIGKILL when SIGTERM is ignored", async () => {
    const child = fakeChild({ obeysSigterm: false });
    let spawned = false;
    const sup = new Supervisor({
      ...fastOpts,
      pidFile: tmpPidFile(),
      spawnRuntime: () => ((spawned = true), child),
      checkHealth: async () => spawned,
    });
    await sup.start();
    await sup.stop();
    expect(child.signalsSent).toContain("SIGKILL");
    expect(sup.state).toBe("stopped");
  });

  it("terminates a stale runtime recorded in the pid file before starting", async () => {
    const pidFile = tmpPidFile();
    fs.writeFileSync(pidFile, "9999");
    const calls = [];
    let sigtermSent = false;
    const killProcess = (pid, sig) => {
      calls.push([pid, sig]);
      if (sig === 0 && sigtermSent) throw new Error("ESRCH"); // died after SIGTERM
      if (sig === "SIGTERM") sigtermSent = true;
    };
    const child = fakeChild();
    let spawned = false;
    const sup = new Supervisor({
      ...fastOpts,
      pidFile,
      killProcess,
      spawnRuntime: () => ((spawned = true), child),
      checkHealth: async () => spawned,
    });
    await sup.start();
    expect(calls).toContainEqual([9999, "SIGTERM"]);
    expect(sup.state).toBe("running");
  });

  it("errors when the runtime never becomes healthy", async () => {
    const child = fakeChild();
    const sup = new Supervisor({
      ...fastOpts,
      pidFile: tmpPidFile(),
      spawnRuntime: () => child,
      checkHealth: async () => false,
    });
    await sup.start();
    expect(sup.state).toBe("error");
    expect(sup.errorMessage).toMatch(/did not become ready/);
    expect(child.signalsSent).toContain("SIGTERM");
  });
});
