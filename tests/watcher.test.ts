import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { start } from "../src/server.js";
import { loadConfig } from "../src/config.js";

let root: string, server: Server, base: string;
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-"));
  process.env.LODEKIT_ROOT = root;
  process.env.LODEKIT_PORT = "0";
  server = start(loadConfig());
  await new Promise<void>((r) => server.once("listening", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterEach(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.LODEKIT_ROOT;
  delete process.env.LODEKIT_PORT;
});

describe("watcher", () => {
  it("emits an SSE apps-changed event when an app folder appears", async () => {
    const received: string[] = [];
    const res = await fetch(base + "/api/events");
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    const pump = (async () => {
      for (let i = 0; i < 50; i++) {
        const { value, done } = await reader.read();
        if (done) break;
        received.push(dec.decode(value));
        if (received.join("").includes("apps-changed")) break;
      }
    })();

    const appDir = path.join(root, "apps", "live");
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, "lodekit.json"), JSON.stringify({ name: "Live", slug: "live" }));

    await pump;
    reader.cancel();
    expect(received.join("")).toContain("apps-changed");
  }, 10000);
});
