import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";
import type { Config } from "../src/config.js";
import { initSettingsStore, closeSettingsStoreForTest } from "../src/services/settings.js";
import { initEventStore, closeEventStoreForTest } from "../src/eventStore.js";
import { setPreviewCss, THEME_MAX_BYTES } from "../src/services/themes.js";

let root: string, server: Server, base: string, cfg: Config;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-themesapi-"));
  cfg = {
    root, appsDir: path.join(root, "apps"), dataDir: path.join(root, "data"),
    cacheDir: path.join(root, ".cache"), stateDir: path.join(root, ".state"),
    port: 0, baseUrl: "http://lodekit.localhost:0", secretsKeyProvider: "file",
    gatewaysDir: path.join(root, "gateways"),
  };
  initSettingsStore(cfg.dataDir);
  initEventStore(cfg.dataDir);
  setPreviewCss(null);
  await new Promise<void>((resolve) => {
    server = createServer(cfg).listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterEach(() => {
  server.close();
  setPreviewCss(null);
  closeSettingsStoreForTest();
  closeEventStoreForTest();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("/_ui theme delivery", () => {
  it("serves the resolved theme with always-200 semantics", async () => {
    let r = await fetch(base + "/_ui/theme.css");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/css");
    expect(await r.text()).toContain("--icon-library"); // lodekit default
    r = await fetch(base + "/_ui/theme.css?app=not-an-app"); // unknown app: still 200, global
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.text()).toContain("--icon-library");
  });

  it("theme.json carries iconLibrary", async () => {
    const t = await (await fetch(base + "/_ui/theme.json")).json();
    expect(t).toEqual({ theme: "system", iconLibrary: "lucide" });
  });

  it("theme.js applies theme-change and stamps data-icon-library", async () => {
    const js = await (await fetch(base + "/_ui/theme.js")).text();
    expect(js).toContain("theme-change");
    expect(js).toContain("data-icon-library");
  });
});

describe("/api/themes", () => {
  it("lists themes with config", async () => {
    const doc = await (await fetch(base + "/api/themes")).json();
    expect(Array.isArray(doc.themes)).toBe(true);
    expect(doc.themes.some((t: { name: string; vendored: boolean }) => t.name === "lodekit" && t.vendored)).toBe(true);
    expect(doc.config).toEqual({});
  });

  it("user theme CRUD lifecycle", async () => {
    expect((await fetch(base + "/api/themes/mine", { method: "PUT", body: ":root { --primary: #abcdef; }" })).status).toBe(204);
    const got = await fetch(base + "/api/themes/mine");
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toContain("text/css");
    expect(await got.text()).toContain("#abcdef");
    expect((await fetch(base + "/api/themes/mine/duplicate", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: "mine2" }),
    })).status).toBe(204);
    expect((await fetch(base + "/api/themes/mine2/rename", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: "mine3" }),
    })).status).toBe(204);
    expect((await fetch(base + "/api/themes/mine2")).status).toBe(404);
    expect((await fetch(base + "/api/themes/mine3", { method: "DELETE" })).status).toBe(204);
    expect((await fetch(base + "/api/themes/mine3")).status).toBe(404);
  });

  it("refuses vendored writes and traversal names", async () => {
    expect((await fetch(base + "/api/themes/lodekit", { method: "PUT", body: ":root{}" })).status).toBe(409);
    expect((await fetch(base + "/api/themes/" + encodeURIComponent("../evil"), { method: "PUT", body: ":root{}" })).status).toBe(400);
  });

  it("caps body size on theme and preview PUT", async () => {
    const big = "/*" + "x".repeat(THEME_MAX_BYTES + 1) + "*/";
    expect([400, 413]).toContain((await fetch(base + "/api/themes/huge", { method: "PUT", body: big })).status);
    expect([400, 413]).toContain((await fetch(base + "/api/themes/preview", { method: "PUT", body: big })).status);
  });

  it("config PUT validates names and app ids", async () => {
    expect((await fetch(base + "/api/themes/config", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ global: "../evil" }),
    })).status).toBe(400);
    expect((await fetch(base + "/api/themes/config", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ global: "lodekit" }),
    })).status).toBe(204);
    const doc = await (await fetch(base + "/api/themes")).json();
    expect(doc.config).toEqual({ global: "lodekit" });
  });

  it("preview slot serves and self-heals", async () => {
    // Empty slot (fresh server): falls back to normal resolution, still 200.
    const empty = await fetch(base + "/_ui/theme.css?preview=1");
    expect(empty.status).toBe(200);
    const emptyBody = await empty.text();
    expect(emptyBody).toContain("--icon-library");
    expect(emptyBody).not.toContain("hotpink");
    // With a draft: the preview slot is served.
    expect((await fetch(base + "/api/themes/preview", { method: "PUT", body: ":root { --primary: hotpink; }" })).status).toBe(204);
    expect(await (await fetch(base + "/_ui/theme.css?preview=1")).text()).toContain("hotpink");
  });
});
