import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";
import type { Config } from "../src/config.js";

let root: string, server: Server, base: string;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-filesapi-"));
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
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
});

const api = (p = "") => `${base}/api/apps/app/file-store${p}`;

async function upload(p: string, body: string, headers: Record<string, string> = {}) {
  return fetch(api(p), {
    method: p.startsWith("/") && p !== "" && !p.startsWith("?") ? "PUT" : "POST",
    headers: { "Content-Type": "text/plain", ...headers },
    body,
  });
}

describe("file-store HTTP surface", () => {
  it("PUT/GET round-trip: bytes, content type, disposition", async () => {
    const created = await (await upload("/report", "hello")).json();
    expect(created.slug).toBe("report");
    const res = await fetch(api("/report"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("content-disposition")).toBe('inline; filename="report.txt"');
    expect(await res.text()).toBe("hello");
    const dl = await fetch(api("/report?download=1"));
    expect(dl.headers.get("content-disposition")).toBe('attachment; filename="report.txt"');
  });

  it("POST / derives the slug from X-Lodekit-Title and returns 201", async () => {
    const res = await upload("", "x", { "X-Lodekit-Title": "Contas Jul 2026" });
    expect(res.status).toBe(201);
    expect((await res.json()).slug).toBe("contas-jul-2026");
  });

  it("serves ETag and answers If-None-Match with a bodyless 304", async () => {
    await upload("/etagged", "content");
    const first = await fetch(api("/etagged"));
    const etag = first.headers.get("etag")!;
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
    const second = await fetch(api("/etagged"), { headers: { "If-None-Match": etag } });
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });

  it("stat returns FileStat with url and absolute path; 404 when missing", async () => {
    await upload("/doc", "data", { "X-Lodekit-Metadata": '{"k":1}' });
    const stat = await (await fetch(api("/doc/stat"))).json();
    expect(stat).toMatchObject({ slug: "doc", size: 4, metadata: { k: 1 } });
    expect(stat.url).toContain("/api/apps/app/file-store/doc");
    expect(path.isAbsolute(stat.path)).toBe(true);
    expect((await fetch(api("/missing/stat"))).status).toBe(404);
    expect((await fetch(api("/missing"))).status).toBe(404);
  });

  it("uploads larger than the API's 100kb JSON body limit succeed", async () => {
    const big = "x".repeat(300 * 1024);
    const res = await upload("/big", big);
    expect(res.status).toBe(200);
    expect((await res.json()).size).toBe(big.length);
    expect((await (await fetch(api("/big"))).text()).length).toBe(big.length);
  });

  it("list, delete, copy, move", async () => {
    await upload("/exp-a", "a");
    await upload("/exp-b", "b");
    const page = await (await fetch(api("?prefix=exp-"))).json();
    expect(page.entries.map((e: { slug: string }) => e.slug)).toEqual(["exp-a", "exp-b"]);

    const copied = await fetch(api("/copy"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "exp-a", to: "exp-c" }),
    });
    expect((await copied.json()).slug).toBe("exp-c");

    const moved = await fetch(api("/move"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "exp-b", to: "exp-d" }),
    });
    expect((await moved.json()).slug).toBe("exp-d");
    expect((await fetch(api("/exp-b"))).status).toBe(404);

    expect((await (await fetch(api("/exp-c"), { method: "DELETE" })).json()).deleted).toBe(true);
  });

  it("literal action-name slugs work via method separation", async () => {
    await upload("/copy", "i am a file named copy");
    expect(await (await fetch(api("/copy"))).text()).toBe("i am a file named copy");
  });

  it("validates at the trust boundary with 400s", async () => {
    expect((await upload("/Bad_Slug!", "x")).status).toBe(400);
    expect((await upload("/ok?ttl=-5", "x")).status).toBe(400);
    expect((await upload("/ok2", "x", { "X-Lodekit-Metadata": "not json" })).status).toBe(400);
    expect((await upload("/ok3", "x", { "X-Lodekit-Metadata": JSON.stringify({ big: "y".repeat(5000) }) })).status).toBe(400);
    expect((await upload("/ok4", "x", { "X-Lodekit-Title": "t".repeat(600) })).status).toBe(400);
    const badApp = await fetch(`${base}/api/apps/Bad!App/file-store/x`);
    expect(badApp.status).toBe(400);
    const badCopy = await fetch(api("/copy"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "ok", to: "Nope!" }),
    });
    expect(badCopy.status).toBe(400);
  });
});
