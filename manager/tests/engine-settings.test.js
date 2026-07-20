import http from "node:http";
import { describe, expect, it } from "vitest";
import { createEngineSettings } from "../src/engineSettings.js";

// Waits for `check()` to return truthy, polling on an interval, or throws once
// `timeoutMs` elapses. No bare sleeps — the SSE-driven test below needs to wait
// for an async callback without a fixed guess at how long that takes.
function waitFor(check, { timeoutMs = 2000, intervalMs = 10 } = {}) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    (function poll() {
      if (check()) return resolve();
      if (Date.now() > deadline) return reject(new Error("waitFor: timed out"));
      setTimeout(poll, intervalMs);
    })();
  });
}

const doc = (theme, icon, login) => ({
  settings: [
    { key: "appearance.icon_style", effective: icon },
    { key: "general.start_at_login", effective: login },
    { key: "appearance.theme", effective: theme },
  ],
});

function harness(over = {}) {
  const calls = { icon: [], login: [], put: [] };
  let onChange;
  const rs = createEngineSettings({
    log: () => {},
    onIconStyle: (s) => calls.icon.push(s),
    getLoginItem: over.getLoginItem ?? (() => false),
    setLoginItem: (v) => calls.login.push(v),
    canSetLogin: over.canSetLogin ?? true,
    putSetting: async (key, value) => calls.put.push([key, value]),
    fetchSettings: over.fetchSettings ?? (async () => doc("system", "a", false)),
    subscribe: (cb) => { onChange = cb; return () => {}; },
    cacheIconStyle: (s) => calls.icon.push(`cache:${s}`),
  });
  return { rs, calls, change: (key) => onChange(key) };
}

describe("engineSettings", () => {
  it("start(): applies icon style, caches it, and leaves matching login alone", async () => {
    const { rs, calls } = harness();
    await rs.start();
    expect(calls.icon).toEqual(["a", "cache:a"]);
    expect(calls.login).toEqual([]);
    expect(calls.put).toEqual([]);
  });

  it("start(): OS login state wins — written back to the setting, never applied", async () => {
    const { rs, calls } = harness({ getLoginItem: () => true }); // OS: on, setting: off
    await rs.start();
    expect(calls.put).toEqual([["general.start_at_login", true]]);
    expect(calls.login).toEqual([]);
  });

  it("a settings-change after start applies the dashboard's edit to the OS", async () => {
    let login = false;
    const { rs, calls, change } = harness({
      getLoginItem: () => login,
      fetchSettings: async () => doc("system", "b", true),
    });
    await rs.start();          // reconcile writes OS(false) back — put, no apply
    calls.put.length = 0;
    await change("general.start_at_login"); // now dashboard-driven: apply
    expect(calls.login).toEqual([true]);
    expect(calls.put).toEqual([]);
  });

  it("setStartAtLogin writes the setting through to the engine (tray checkbox path)", async () => {
    const { rs, calls } = harness();
    await rs.setStartAtLogin(true);
    expect(calls.put).toEqual([["general.start_at_login", true]]);
    expect(calls.login).toEqual([]); // caller applies the OS change itself
  });

  it("dev mode (canSetLogin=false) never touches the login item", async () => {
    const { rs, calls, change } = harness({ canSetLogin: false, fetchSettings: async () => doc("system", "a", true) });
    await rs.start();
    await change("general.start_at_login");
    expect(calls.login).toEqual([]);
    expect(calls.put).toEqual([]);
  });

  it("defaultSubscribe follows a live engine SSE settings-change event (real HTTP, no DI)", async () => {
    let settingsCalls = 0;
    let sseRes = null;
    const server = http.createServer((req, res) => {
      if (req.url === "/api/settings") {
        settingsCalls += 1;
        const effective = settingsCalls === 1 ? "b" : "c";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ settings: [{ key: "appearance.icon_style", effective }] }));
        return;
      }
      if (req.url === "/api/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        sseRes = res;
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();

    const calls = { icon: [] };
    // Deliberately no `subscribe`/`fetchSettings` injected — this exercises the
    // production defaultSubscribe/defaultFetchSettings, where the bug lives.
    const rs = createEngineSettings({
      port,
      log: () => {},
      onIconStyle: (s) => calls.icon.push(s),
      cacheIconStyle: () => {},
      getLoginItem: () => false,
      setLoginItem: () => {},
      canSetLogin: false,
    });

    try {
      await rs.start();
      expect(calls.icon).toContain("b"); // initial fetch applied

      await waitFor(() => sseRes !== null);
      sseRes.write(
        'event: event\ndata: {"id":1,"ts":1,"app":null,"kind":"service","component":"settings","type":"value-set","payload":{"key":"appearance.icon_style"}}\n\n'
      );

      await waitFor(() => calls.icon.includes("c"));
      expect(calls.icon).toContain("c");
    } finally {
      rs.stop();
      try { if (sseRes && !sseRes.writableEnded) sseRes.end(); } catch { /* already closed */ }
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
