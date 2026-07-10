"use strict";
const http = require("node:http");

// Applies runtime-owned platform settings to the OS/tray (settings spec §9).
// The runtime is the store; this module is the applier. All effects are
// injected (supervisor.js pattern) so tests run without Electron or HTTP.
//
// Reconcile rule: on start, the OS login item is the applied truth — a mismatch
// writes the OS state back to the setting. After that, settings-change events
// (person edits in the dashboard) apply to the OS/tray.

function createRuntimeSettings(deps) {
  const {
    port, log, onIconStyle, getLoginItem, setLoginItem, canSetLogin,
    putSetting = defaultPutSetting, fetchSettings = defaultFetchSettings,
    subscribe = defaultSubscribe, cacheIconStyle,
  } = deps;
  let unsubscribe = null;

  function effective(doc, key) {
    const s = (doc.settings || []).find((x) => x.key === key);
    return s ? s.effective : undefined;
  }

  async function applyDoc(doc, { reconcileLogin }) {
    const icon = effective(doc, "appearance.icon_style");
    if (icon) {
      onIconStyle(icon);
      cacheIconStyle(icon);
    }
    if (!canSetLogin) return;
    const desired = effective(doc, "general.start_at_login");
    if (typeof desired !== "boolean") return;
    const actual = getLoginItem();
    if (actual === desired) return;
    if (reconcileLogin) await putSetting("general.start_at_login", actual); // OS wins on connect
    else setLoginItem(desired); // dashboard wins after connect
  }

  return {
    async start() {
      const doc = await fetchSettings();
      await applyDoc(doc, { reconcileLogin: true });
      unsubscribe = subscribe(async (key) => {
        if (key !== "appearance.icon_style" && key !== "general.start_at_login") return;
        try {
          await applyDoc(await fetchSettings(), { reconcileLogin: false });
        } catch (e) {
          log(`runtimeSettings: ${e.message}`);
        }
      });
    },
    stop() {
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
    },
    // Write path for the tray's Launch at Login checkbox: the caller applies the
    // OS change itself; this keeps the runtime's setting (dashboard) in step.
    setStartAtLogin(value) {
      return putSetting("general.start_at_login", value);
    },
  };

  // ---- production defaults (node:http against the local runtime) ----

  function defaultFetchSettings() {
    return new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/settings" }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        });
      }).on("error", reject);
    });
  }

  function defaultPutSetting(key, value) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: `/api/settings/${key}`, method: "PUT", headers: { "Content-Type": "application/json" } },
        (res) => { res.resume(); res.statusCode === 200 ? resolve() : reject(new Error(`PUT ${key}: ${res.statusCode}`)); }
      );
      req.on("error", reject);
      req.end(JSON.stringify({ value }));
    });
  }

  // Minimal SSE consumer over node:http: platform settings-change events ride
  // the bus envelope (wire name "event", ns "_platform", type "settings-change").
  function defaultSubscribe(onChange) {
    const req = http.get({ host: "127.0.0.1", port, path: "/api/events" }, (res) => {
      let buf = "";
      res.on("data", (chunk) => {
        buf += chunk;
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const isEvent = /^event: event$/m.test(frame);
          const data = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!isEvent || !data) continue;
          try {
            const d = JSON.parse(data.slice(6));
            if (d.type === "settings-change" && d.ns === "_platform" && d.payload) onChange(d.payload.key);
          } catch { /* partial or non-JSON frame — skip */ }
        }
      });
    });
    req.on("error", (e) => log(`runtimeSettings SSE: ${e.message}`));
    return () => req.destroy();
  }
}

module.exports = { createRuntimeSettings };
