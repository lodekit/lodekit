import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";
import type { Config } from "../src/config.js";
import { broadcast } from "../src/sse.js";

let root: string, server: Server, base: string;
const aborters: AbortController[] = [];

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-sse-"));
  const cfg: Config = {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: path.join(root, ".cache"),
    port: 0,
    baseUrl: "http://lodekit.localhost:0",
  };
  await new Promise<void>((resolve) => {
    server = createServer(cfg).listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterEach(() => {
  // SSE clients hold the connection open; abort before close or close() hangs.
  for (const a of aborters.splice(0)) a.abort();
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
});

// Opens an SSE stream and returns a reader over its raw text.
async function openStream(url: string) {
  const ac = new AbortController();
  aborters.push(ac);
  const res = await fetch(url, { signal: ac.signal });
  expect(res.status).toBe(200);
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  const first = await reader.read(); // ": connected" preamble
  expect(first.value).toContain("connected");
  return reader;
}

async function nextEvent(reader: ReadableStreamDefaultReader<string>) {
  const { value } = await reader.read();
  return value ?? "";
}

describe("SSE scoping", () => {
  it("scoped clients receive only their slug's events; global clients receive all", async () => {
    const scopedA = await openStream(base + "/api/apps/app-a/events");
    const global = await openStream(base + "/api/events");

    broadcast("kv-store-change", { slug: "app-a", key: "k", op: "set" }, "app-a");
    expect(await nextEvent(scopedA)).toContain('"slug":"app-a"');
    expect(await nextEvent(global)).toContain('"slug":"app-a"');

    // An event for app-b must reach the global client but NOT scopedA.
    broadcast("kv-store-change", { slug: "app-b", key: "k", op: "set" }, "app-b");
    expect(await nextEvent(global)).toContain('"slug":"app-b"');

    // Prove scopedA skipped app-b's event: the next thing it sees is app-a's.
    broadcast("kv-store-change", { slug: "app-a", key: "k2", op: "del" }, "app-a");
    expect(await nextEvent(scopedA)).toContain('"key":"k2"');
  });

  it("rejects an invalid slug on the scoped endpoint", async () => {
    const res = await fetch(base + "/api/apps/Bad%20Slug/events");
    expect(res.status).toBe(400);
  });
});
