"use strict";
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Runtime lifecycle (spec §5): stopped → starting → running | error.
// Effects (spawning, health probes, signals) are injected so this tests
// without Electron or real processes. No auto-restart: failures surface
// as `error` and wait for the person.
class Supervisor extends EventEmitter {
  constructor({
    spawnRuntime,
    checkHealth,
    pidFile,
    killProcess = process.kill,
    startTimeoutMs = 30_000,
    pollIntervalMs = 500,
    graceMs = 5_000,
  }) {
    super();
    this.spawnRuntime = spawnRuntime;
    this.checkHealth = checkHealth;
    this.pidFile = pidFile;
    this.killProcess = killProcess;
    this.startTimeoutMs = startTimeoutMs;
    this.pollIntervalMs = pollIntervalMs;
    this.graceMs = graceMs;
    this.state = "stopped";
    this.errorMessage = null;
    this.child = null;
  }

  setState(state, errorMessage = null) {
    this.state = state;
    this.errorMessage = errorMessage;
    this.emit("state", state, errorMessage);
  }

  processAlive(pid) {
    try {
      this.killProcess(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  // A pid file left behind by a crashed manager points at a runtime nobody
  // supervises — terminate it before starting fresh (spec §5).
  async cleanupStale() {
    let pid;
    try {
      pid = Number(fs.readFileSync(this.pidFile, "utf8"));
    } catch {
      return;
    }
    if (Number.isInteger(pid) && pid > 0 && this.processAlive(pid)) {
      try {
        this.killProcess(pid, "SIGTERM");
      } catch {}
      const deadline = Date.now() + this.graceMs;
      while (Date.now() < deadline && this.processAlive(pid)) await sleep(25);
      if (this.processAlive(pid)) {
        try {
          this.killProcess(pid, "SIGKILL");
        } catch {}
      }
    }
    fs.rmSync(this.pidFile, { force: true });
  }

  async start() {
    if (this.state === "starting" || this.state === "running") return;
    this.setState("starting");
    await this.cleanupStale();
    if (this.state !== "starting") return; // stopped mid-start
    // Something we didn't record in the pid file already answers on the port
    // (e.g. a dev runtime). Never kill what we didn't start (spec §5).
    if (await this.checkHealth()) {
      this.setState("error", "Port 7777 already in use by another process (a dev runtime?)");
      return;
    }
    let child;
    try {
      child = this.spawnRuntime();
    } catch (e) {
      this.setState("error", `Failed to start runtime: ${e.message}`);
      return;
    }
    this.child = child;
    fs.mkdirSync(path.dirname(this.pidFile), { recursive: true });
    fs.writeFileSync(this.pidFile, String(child.pid));
    child.on("exit", (code, signal) => {
      this.child = null;
      fs.rmSync(this.pidFile, { force: true });
      if (this.state === "running" || this.state === "starting") {
        this.setState("error", `Runtime exited unexpectedly (${signal ?? `code ${code}`})`);
      }
    });
    const deadline = Date.now() + this.startTimeoutMs;
    while (this.state === "starting" && this.child && Date.now() < deadline) {
      if (await this.checkHealth()) {
        if (this.state === "starting" && this.child) this.setState("running");
        return;
      }
      await sleep(this.pollIntervalMs);
    }
    if (this.state === "starting") {
      await this.killChild();
      this.setState(
        "error",
        `Runtime did not become ready within ${this.startTimeoutMs / 1000}s`
      );
    }
  }

  async killChild() {
    if (!this.child) return;
    this.child.kill("SIGTERM");
    const deadline = Date.now() + this.graceMs;
    while (this.child && Date.now() < deadline) await sleep(25);
    if (this.child) {
      this.child.kill("SIGKILL");
      const killDeadline = Date.now() + this.graceMs;
      while (this.child && Date.now() < killDeadline) await sleep(25);
      this.child = null;
    }
  }

  async stop() {
    if (this.state === "stopped") return;
    // Set the state first so the exit handler doesn't report a deliberate
    // shutdown as an unexpected exit.
    this.setState("stopped");
    await this.killChild();
    fs.rmSync(this.pidFile, { force: true });
  }

  async restart() {
    await this.stop();
    await this.start();
  }
}

module.exports = { Supervisor };
