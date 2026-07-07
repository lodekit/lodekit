import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";
import type { Config } from "../src/config.js";
import {
  getSettingsDb, applySettingsManifest, initSettingsStore, closeSettingsStoreForTest,
  setValue, invalidateSettingsCache,
} from "../src/services/settings.js";
import { initEventStore, queryEvents, closeEventStoreForTest } from "../src/eventStore.js";

let root: string, server: Server, base: string, cfg: Config;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-settingsapi-"));
  cfg = {
    root, appsDir: path.join(root, "apps"), dataDir: path.join(root, "data"),
    cacheDir: path.join(root, ".cache"), stateDir: path.join(root, ".state"),
    port: 0, baseUrl: "http://lodekit.localhost:0", secretsKeyProvider: "file",
  };
  initSettingsStore(cfg.dataDir);
  initEventStore(cfg.dataDir);
  await new Promise<void>((resolve) => {
    server = createServer(cfg).listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  applySettingsManifest(getSettingsDb(cfg.dataDir, "app"), {
    show_archived: { type: "boolean", label: "Show archived", description: "Include archived items.", default: false },
    broken: { type: "number", label: "Broken", description: "Missing default." },
  }, Date.now());
});
afterEach(() => {
  server.close();
  closeSettingsStoreForTest();
  closeEventStoreForTest();
  fs.rmSync(root, { recursive: true, force: true });
});

const put = (url: string, value: unknown) =>
  fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value }) });

describe("platform settings API", () => {
  it("GET lists the catalog with sections, scope, and effective values", async () => {
    const { settings } = await (await fetch(`${base}/api/settings`)).json();
    const theme = settings.find((s: { key: string }) => s.key === "appearance.theme");
    expect(theme).toMatchObject({ section: "Appearance", scope: "global", value: null, effective: "system" });
    expect(theme.field.options).toHaveLength(3);
  });

  it("PUT validates and persists; DELETE resets; both emit stored settings-change events", async () => {
    expect((await put(`${base}/api/settings/appearance.theme`, "dark")).status).toBe(200);
    let { settings } = await (await fetch(`${base}/api/settings`)).json();
    expect(settings.find((s: { key: string }) => s.key === "appearance.theme")).toMatchObject({ value: "dark", effective: "dark" });
    expect((await put(`${base}/api/settings/appearance.theme`, "sepia")).status).toBe(400);
    expect((await put(`${base}/api/settings/nope.nope`, 1)).status).toBe(404);
    expect((await fetch(`${base}/api/settings/appearance.theme`, { method: "DELETE" })).status).toBe(200);
    ({ settings } = await (await fetch(`${base}/api/settings`)).json());
    expect(settings.find((s: { key: string }) => s.key === "appearance.theme").value).toBeNull();
    const events = queryEvents({ ns: "_platform", type: "settings-change" }).records;
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0].payload).toEqual({ key: "appearance.theme" });
  });
});

describe("app settings API", () => {
  const api = (p = "") => `${base}/api/apps/app/settings${p}`;

  it("GET returns declared (with per-field errors) and overridable service settings", async () => {
    const doc = await (await fetch(api())).json();
    const byKey = Object.fromEntries(doc.declared.map((d: { key: string }) => [d.key, d]));
    expect(byKey.show_archived).toMatchObject({ value: null, effective: false, error: null });
    expect(byKey.broken.error).toMatch(/default/);
    const retries = doc.overrides.find((o: { key: string }) => o.key === "tasks.default_retries");
    expect(retries).toMatchObject({ platformEffective: 3, override: null });
    expect(doc.overrides.some((o: { key: string }) => o.key === "tasks.dispatch_poll")).toBe(false); // global
  });

  it("declared value round-trip; GET /:key serves the effective value (the SDK read)", async () => {
    expect((await (await fetch(api("/show_archived"))).json())).toEqual({ found: true, value: false });
    expect((await put(api("/show_archived"), true)).status).toBe(200);
    expect((await (await fetch(api("/show_archived"))).json())).toEqual({ found: true, value: true });
    expect((await put(api("/show_archived"), "yes")).status).toBe(400);
    expect((await fetch(api("/show_archived"), { method: "DELETE" })).status).toBe(200);
    expect((await (await fetch(api("/show_archived"))).json())).toEqual({ found: true, value: false });
    expect((await (await fetch(api("/unknown_key"))).json())).toEqual({ found: false });
    expect((await (await fetch(api("/broken"))).json())).toEqual({ found: false }); // errored def never reads
  });

  it("override round-trip; global keys and unknown platform keys are 400", async () => {
    expect((await put(api("/tasks.default_retries"), 1)).status).toBe(200);
    const doc = await (await fetch(api())).json();
    expect(doc.overrides.find((o: { key: string }) => o.key === "tasks.default_retries").override).toBe(1);
    expect((await put(api("/tasks.default_retries"), 99)).status).toBe(400);  // max 20
    expect((await put(api("/tasks.dispatch_poll"), "5s")).status).toBe(400);  // global scope
    expect((await put(api("/nope.nope"), 1)).status).toBe(404);
    expect((await fetch(api("/tasks.default_retries"), { method: "DELETE" })).status).toBe(200);
  });

  it("app-scoped settings-change events land on the bus under the app ns", async () => {
    await put(api("/show_archived"), true);
    const events = queryEvents({ ns: "app", type: "settings-change" }).records;
    expect(events[0].payload).toEqual({ key: "show_archived" });
  });

  it("an app kv.list_limit override changes the default page size", async () => {
    const db = getSettingsDb(cfg.dataDir, "app");
    setValue(db, "kv.list_limit", 2);
    invalidateSettingsCache();
    for (const k of ["a", "b", "c"]) {
      await fetch(`${base}/api/apps/app/kv-store/${k}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: 1 }),
      });
    }
    const { entries } = await (await fetch(`${base}/api/apps/app/kv-store`)).json();
    expect(entries).toHaveLength(2);
  });
});
