import { describe, expect, it } from "vitest";
import { createRuntimeSettings } from "../src/runtimeSettings.js";

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
  const rs = createRuntimeSettings({
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

describe("runtimeSettings", () => {
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

  it("dev mode (canSetLogin=false) never touches the login item", async () => {
    const { rs, calls, change } = harness({ canSetLogin: false, fetchSettings: async () => doc("system", "a", true) });
    await rs.start();
    await change("general.start_at_login");
    expect(calls.login).toEqual([]);
    expect(calls.put).toEqual([]);
  });
});
