import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { start } from "../src/server.js";
import { loadConfig } from "../src/config.js";

let root: string, cache: string, server: Server, base: string;

async function collectEvents(base: string, until: string, timeoutMs: number): Promise<string> {
  const res = await fetch(base + "/api/events");
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value);
    if (buf.includes(until)) break;
  }
  await reader.cancel();
  return buf;
}

function writeApp(slug: string, appTsx: string) {
  const src = path.join(root, "apps", slug, "src");
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(root, "apps", slug, "manifest.json"), JSON.stringify({ name: slug, slug }));
  fs.writeFileSync(path.join(root, "apps", slug, "index.html"),
    `<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`);
  fs.writeFileSync(path.join(src, "main.tsx"),
    `import { createRoot } from "react-dom/client";\nimport App from "./App";\ncreateRoot(document.getElementById("root")!).render(<App />);\n`);
  fs.writeFileSync(path.join(src, "App.tsx"), appTsx);
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-root-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-cache-"));
  process.env.LODEKIT_ROOT = root;
  process.env.LODEKIT_CACHE_DIR = cache;
  process.env.LODEKIT_PORT = "0";
  server = start(loadConfig());
  await new Promise<void>((r) => server.once("listening", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterEach(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
  delete process.env.LODEKIT_ROOT;
  delete process.env.LODEKIT_CACHE_DIR;
  delete process.env.LODEKIT_PORT;
});

describe("watcher", () => {
  it("emits building then ready when a valid app appears", async () => {
    const done = collectEvents(base, "event: building", 30000);
    // give the SSE reader a tick to attach before writing files
    await new Promise((r) => setTimeout(r, 100));
    writeApp("wgood", `export default function App() { return <h1>ok</h1>; }`);
    const buf = await done;
    expect(buf).toContain("event: building");
    // wait for the ready event specifically
    const ready = await collectEvents(base, "event: ready", 30000);
    expect(ready).toContain("event: ready");
  }, 40000);

  it("emits an error event for a broken app", async () => {
    await new Promise((r) => setTimeout(r, 100));
    writeApp("wbad", `export default function App() { return <h1>x</h1>  // missing brace\n`);
    const buf = await collectEvents(base, "event: error", 30000);
    expect(buf).toContain("event: error");
  }, 40000);
});
