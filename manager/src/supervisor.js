"use strict";
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Engine lifecycle (spec §5): stopped → starting → running | error.
// Effects (spawning, health probes, signals) are injected so this tests
// without Electron or real processes. No auto-restart: failures surface
// as `error` and wait for the person.
class Supervisor extends EventEmitter {
  constructor({
    spawnEngine,
    checkHealth,
    pidFile,
    killProcess = process.kill,
    // The engine builds its dashboard before it starts listening; a cold
    // cache can take well past 30s (the old dev shell's budget was raised
    // to 60s for the same reason).
    startTimeoutMs = 60_000,
    pollIntervalMs = 500,
    graceMs = 5_000,
  }) {
    super();
    this.spawnEngine = spawnEngine;
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

  // A pid file left behind by a crashed manager points at an engine nobody
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
    // (e.g. a dev engine). Never kill what we didn't start (spec §5).
    if (await this.checkHealth()) {
      this.setState("error", "Port 7777 already in use by another process (a dev engine?)");
      return;
    }
    let child;
    try {
      child = this.spawnEngine();
    } catch (e) {
      this.setState("error", `Failed to start engine: ${e.message}`);
      return;
    }
    this.child = child;
    child.on("exit", (code, signal) => {
      this.child = null;
      // force:true only swallows ENOENT; a pidfile path that can't exist at all
      // (e.g. a parent segment replaced by a file) still throws ENOTDIR, and this
      // handler can run from a microtask (child.kill's exit emit) where an
      // uncaught throw crashes the process — so swallow unconditionally here.
      try {
        fs.rmSync(this.pidFile, { force: true });
      } catch {}
      if (this.state === "running" || this.state === "starting") {
        this.setState("error", `Engine exited unexpectedly (${signal ?? `code ${code}`})`);
      }
    });
    try {
      fs.mkdirSync(path.dirname(this.pidFile), { recursive: true });
      fs.writeFileSync(this.pidFile, String(child.pid));
    } catch (e) {
      await this.killChild();
      this.setState("error", `Could not write ${this.pidFile}: ${e.message}`);
      return;
    }
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
        `Engine did not become ready within ${this.startTimeoutMs / 1000}s`
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
