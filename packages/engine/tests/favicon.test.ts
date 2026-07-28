import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createAdaptorServer } from "@hono/node-server";
import { beforeEach, afterEach } from "vitest";
import { createApp } from "../src/server.js";
import {
  initSettingsStore, setPlatformValue, invalidateSettingsCache, closeSettingsStoreForTest,
} from "../src/services/settings.js";
import type { Config } from "../src/config.js";
import { MARK_BODIES, markFaviconSvg, emojiFaviconSvg } from "../src/marks.js";

describe("favicon svg builders", () => {
  it("renders the requested mark and falls back to b on unknown styles", () => {
    expect(markFaviconSvg("c")).toContain(MARK_BODIES.c);
    expect(markFaviconSvg("nope")).toContain(MARK_BODIES.b);
    expect(markFaviconSvg("b")).toContain("prefers-color-scheme");
    expect(markFaviconSvg("b")).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  });

  it("inks the mark in plum, flipping to paper against dark chrome (DESIGN.md §5)", () => {
    expect(markFaviconSvg("b")).toContain("svg{color:#251b25}");
    expect(markFaviconSvg("b")).toContain("@media(prefers-color-scheme:dark){svg{color:#f6f1e6}}");
  });

  it("renders the emoji via the text technique", () => {
    expect(emojiFaviconSvg("🪴")).toContain("🪴");
    expect(emojiFaviconSvg("🪴")).toContain("<text");
  });

  it("XML-escapes user-authored icon text (manifest is a trust boundary)", () => {
    const svg = emojiFaviconSvg('<script>alert(1)</script>"\'&');
    expect(svg).not.toContain("<script");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&quot;");
    expect(svg).toContain("&#39;");
    expect(svg).toContain("&amp;");
  });
});

describe("favicon routes", () => {
  let root: string, server: Server, base: string;

  const writeManifest = (appId: string, manifest: object) => {
    const dir = path.join(root, "apps", appId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  };

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-favicon-"));
    const cfg: Config = {
      root,
      appsDir: path.join(root, "apps"),
      dataDir: path.join(root, "data"),
      cacheDir: path.join(root, ".cache"),
      stateDir: path.join(root, ".state"),
      port: 0,
      baseUrl: "http://lodekit.localhost:0",
      secretsKeyProvider: "file",
      gatewaysDir: path.join(root, "gateways"),
    };
    writeManifest("plants", { name: "Plants", appId: "plants", icon: "🪴" });
    writeManifest("noicon", { name: "NoIcon", appId: "noicon" });
    writeManifest("evil", { name: "Evil", appId: "evil", icon: '<script>alert(1)</script>' });
    initSettingsStore(cfg.dataDir);
    invalidateSettingsCache();
    await new Promise<void>((resolve) => {
      server = (createAdaptorServer({ fetch: createApp(cfg).fetch }) as Server).listen(0, () => resolve());
    });
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  });

  afterEach(() => {
    server.close();
    closeSettingsStoreForTest();
    invalidateSettingsCache();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("serves the default mark (style b) at /favicon.svg", async () => {
    const res = await fetch(base + "/favicon.svg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain(MARK_BODIES.b);
  });

  it("reflects the stored icon_style setting", async () => {
    setPlatformValue("appearance.icon_style", "c");
    invalidateSettingsCache();
    expect(await (await fetch(base + "/favicon.svg")).text()).toContain(MARK_BODIES.c);
  });

  it("serves the same SVG at /favicon.ico for linkless pages", async () => {
    const res = await fetch(base + "/favicon.ico");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(await res.text()).toContain(MARK_BODIES.b);
  });

  it("serves the app emoji at /_ui/favicon.svg?app=<id>", async () => {
    const res = await fetch(base + "/_ui/favicon.svg?app=plants");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(await res.text()).toContain("🪴");
  });

  it("falls back to 📦 for an app without an icon", async () => {
    expect(await (await fetch(base + "/_ui/favicon.svg?app=noicon")).text()).toContain("📦");
  });

  it("falls back to 📦 for a malformed icon (non-string or empty) instead of erroring", async () => {
    writeManifest("badicon", { name: "BadIcon", appId: "badicon", icon: 123 });
    writeManifest("emptyicon", { name: "EmptyIcon", appId: "emptyicon", icon: "" });
    for (const app of ["badicon", "emptyicon"]) {
      const res = await fetch(base + `/_ui/favicon.svg?app=${app}`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("📦");
    }
  });

  it("falls back to the mark for an unknown app and a missing param", async () => {
    expect(await (await fetch(base + "/_ui/favicon.svg?app=ghost")).text()).toContain(MARK_BODIES.b);
    expect(await (await fetch(base + "/_ui/favicon.svg")).text()).toContain(MARK_BODIES.b);
  });

  it("XML-escapes a user-authored manifest icon (XSS guard)", async () => {
    const body = await (await fetch(base + "/_ui/favicon.svg?app=evil")).text();
    expect(body).not.toContain("<script");
    expect(body).toContain("&lt;script&gt;");
  });
});
