import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";
import type { Config } from "../src/config.js";
import { getKv, sweepAllAndBroadcast } from "../src/services/kv-store.js";

let root: string, server: Server, base: string;
const aborters: AbortController[] = [];

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-kvapi-"));
  const cfg: Config = {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: path.join(root, ".cache"),
    stateDir: path.join(root, ".state"),
    port: 0,
    baseUrl: "http://lodekit.localhost:0", secretsKeyProvider: "file",
    gatewaysDir: path.join(root, "gateways"),
  };
  await new Promise<void>((resolve) => {
    server = createServer(cfg).listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterEach(() => {
  for (const a of aborters.splice(0)) a.abort();
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
  vi.useRealTimers();
});

const kv = (appId: string, p = "") => `${base}/api/apps/${appId}/kv-store${p}`;

async function put(appId: string, key: string, body: unknown) {
  return fetch(kv(appId, `/${encodeURIComponent(key)}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function post(url: string, body: unknown) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

describe("kv-store HTTP surface", () => {
  it("PUT/GET/DELETE round-trip with found flag", async () => {
    expect((await put("app", "greeting", { value: { hi: true } })).status).toBe(200);
    const got = await (await fetch(kv("app", "/greeting"))).json();
    expect(got).toMatchObject({ found: true, value: { hi: true } });
    const missing = await (await fetch(kv("app", "/nope"))).json();
    expect(missing).toEqual({ found: false });
    const del = await fetch(kv("app", "/greeting"), { method: "DELETE" });
    expect(await del.json()).toEqual({ deleted: true });
  });

  it("incr, get-many, set-many, list with prefix and cursor", async () => {
    expect((await post(kv("app", "/incr"), { key: "_seq:e" })).body.value).toBe(1);
    expect((await post(kv("app", "/incr"), { key: "_seq:e", by: 4 })).body.value).toBe(5);

    await post(kv("app", "/set-many"), { entries: [{ key: "e:1", value: "a" }, { key: "e:2", value: "b" }] });
    const many = await post(kv("app", "/get-many"), { keys: ["e:1", "e:2", "missing"] });
    expect(many.body.entries.map((e: { key: string }) => e.key)).toEqual(["e:1", "e:2"]);

    const page = await (await fetch(kv("app", "?prefix=e%3A&limit=1"))).json();
    expect(page.entries.map((e: { key: string }) => e.key)).toEqual(["e:1"]);
    expect(page.nextCursor).toBe("e:1");
    const page2 = await (await fetch(kv("app", `?prefix=e%3A&limit=1&cursor=${encodeURIComponent(page.nextCursor)}`))).json();
    expect(page2.entries.map((e: { key: string }) => e.key)).toEqual(["e:2"]);
  });

  it("validates: bad app id, missing value, bad ttl, incr on non-number, oversized key, literal action-route keys, non-finite limit", async () => {
    expect((await put("Bad Slug", "k", { value: 1 })).status).toBe(400);
    expect((await put("app", "k", {})).status).toBe(400); // no value property
    expect((await put("app", "k", { value: 1, ttl: -5 })).status).toBe(400);
    expect((await put("app", "x".repeat(513), { value: 1 })).status).toBe(400);
    await put("app", "s", { value: "str" });
    expect((await post(kv("app", "/incr"), { key: "s" })).status).toBe(400);
    // Action routes are POST-only; a literal key named "incr" works via GET/PUT/DELETE.
    expect((await put("app", "incr", { value: 7 })).status).toBe(200);
    expect((await (await fetch(kv("app", "/incr"))).json()).value).toBe(7);
    // Non-finite limit must 400, not leak a raw SQLite error.
    const badLimit = await fetch(kv("app", "?limit=abc"));
    expect(badLimit.status).toBe(400);
    expect(await badLimit.json()).toHaveProperty("error");
  });

  it("maps unexpected errors to 500, not the client-error 400", async () => {
    await put("app", "corrupt", { value: 1 });
    // Bypass the API to plant a value JSON.parse chokes on — an internal fault,
    // not a bad request.
    getKv(path.join(root, "data"), "app").prepare("UPDATE _kv SET value = 'not-json' WHERE key = ?").run("corrupt");
    const res = await fetch(kv("app", "/corrupt"));
    expect(res.status).toBe(500);
    expect(await res.json()).toHaveProperty("error");
  });

  it("emits key-set facts on the scoped channel and key-expired facts from the sweep", async () => {
    const ac = new AbortController();
    aborters.push(ac);
    const res = await fetch(base + "/api/apps/app/events", { signal: ac.signal });
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    await reader.read(); // preamble

    await put("app", "watched", { value: 1 });
    let chunk = (await reader.read()).value!;
    expect(chunk).toContain('"type":"key-set"');

    // Fake ONLY Date — faking setTimeout etc. hangs undici's fetch internals.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now()); // pin, then jump past the ttl
    await put("app", "temp", { value: 1, ttl: 1 });
    (await reader.read()); // consume the set event
    vi.setSystemTime(Date.now() + 2_000);
    sweepAllAndBroadcast(); // what the scheduler task runs
    vi.useRealTimers();
    chunk = (await reader.read()).value!;
    expect(chunk).toContain('"type":"key-expired"');
    expect(chunk).toContain('"key":"temp"');
  });
});
