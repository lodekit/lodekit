import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";
import type { Config } from "../src/config.js";
import { getTasksDb, applyManifest } from "../src/services/tasks.js";

let root: string, server: Server, base: string, cfg: Config;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-tasksapi-"));
  cfg = {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: path.join(root, ".cache"),
    stateDir: path.join(root, ".state"),
    port: 0,
    baseUrl: "http://lodekit.localhost:0",
  };
  await new Promise<void>((resolve) => {
    server = createServer(cfg).listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  // Seed defs the way the engine does — through the storage layer.
  applyManifest(getTasksDb(cfg.dataDir, "app"), [
    { name: "digest", cron: "0 9 * * *" },
    { name: "resize", retries: 1 },
    { name: "broken", cron: "not a cron" },
  ], Date.now());
  applyManifest(getTasksDb(cfg.dataDir, "app"), [
    { name: "digest", cron: "0 9 * * *" },
    { name: "resize", retries: 1 },
    { name: "broken", cron: "not a cron" },
  ], Date.now()); // idempotent re-apply must not disturb anything
});
afterEach(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
});

const api = (p = "") => `${base}/api/apps/app/tasks${p}`;
const post = async (url: string, body: unknown) => {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

describe("tasks HTTP surface", () => {
  it("GET / lists defs with schedule, nextRun, error, lastRun", async () => {
    const { tasks } = await (await fetch(api())).json();
    const byName = Object.fromEntries(tasks.map((t: { name: string }) => [t.name, t]));
    expect(byName.digest).toMatchObject({ schedule: { kind: "cron", expr: "0 9 * * *" }, retired: false, lastRun: null });
    expect(byName.digest.nextRun).toBeGreaterThan(Date.now());
    expect(byName.resize.schedule).toBeNull();
    expect(byName.broken.error).toBeTruthy();
    expect(byName.broken.nextRun).toBeNull();
  });

  it("enqueue round-trip: runId, listed queued, get by id, payload preserved", async () => {
    const { status, body } = await post(api("/resize/runs"), { payload: { fileSlug: "pic" } });
    expect(status).toBe(200);
    expect(body.deduped).toBe(false);
    const run = await (await fetch(api(`/runs/${body.runId}`))).json();
    expect(run).toMatchObject({ id: body.runId, task: "resize", state: "queued", source: "enqueue", payload: { fileSlug: "pic" } });
    const { runs } = await (await fetch(api("/runs?task=resize&state=queued"))).json();
    expect(runs.map((r: { id: number }) => r.id)).toContain(body.runId);
  });

  it("dedupeKey returns the existing queued run", async () => {
    const a = await post(api("/resize/runs"), { dedupeKey: "pic" });
    const b = await post(api("/resize/runs"), { dedupeKey: "pic" });
    expect(b.body).toEqual({ runId: a.body.runId, deduped: true });
  });

  it("delay/at set notBefore; both together is a 400", async () => {
    const before = Date.now();
    const { body } = await post(api("/resize/runs"), { delay: "10m" });
    const run = await (await fetch(api(`/runs/${body.runId}`))).json();
    expect(run.notBefore).toBeGreaterThanOrEqual(before + 600_000);
    const at = Date.now() + 5_000;
    const r2 = await post(api("/resize/runs"), { at });
    expect((await (await fetch(api(`/runs/${r2.body.runId}`))).json()).notBefore).toBe(at);
    expect((await post(api("/resize/runs"), { delay: "10m", at })).status).toBe(400);
    expect((await post(api("/resize/runs"), { delay: "10 minutes" })).status).toBe(400);
  });

  it("rejects unknown, retired-equivalent, and config-error tasks with 400", async () => {
    expect((await post(api("/nope/runs"), {})).status).toBe(400);
    expect((await post(api("/broken/runs"), {})).status).toBe(400);
    expect((await post(`${base}/api/apps/UPPER/tasks/resize/runs`, {})).status).toBe(400); // invalid app id
  });

  it("cancel: 200 for queued, 409 after, 404 for unknown", async () => {
    const { body } = await post(api("/resize/runs"), { delay: "1h" });
    const del = await fetch(api(`/runs/${body.runId}`), { method: "DELETE" });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ canceled: true });
    expect((await fetch(api(`/runs/${body.runId}`), { method: "DELETE" })).status).toBe(409);
    expect((await fetch(api("/runs/99999"), { method: "DELETE" })).status).toBe(404);
    expect((await fetch(api(`/runs/${body.runId}`))).status).toBe(200);
    expect((await fetch(api("/runs/99999"))).status).toBe(404);
  });

  it("delivers tasks-change on enqueue over the app SSE channel as a bus envelope", async () => {
    const ac = new AbortController();
    const res = await fetch(`${base}/api/apps/app/events`, { signal: ac.signal });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const waitFor = async (needle: string) => {
      const deadline = Date.now() + 5_000;
      while (!buf.includes(needle) && Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
      }
      expect(buf).toContain(needle);
    };
    await post(api("/resize/runs"), {});
    await waitFor("event: event");
    await waitFor('"type":"tasks-change"');
    await waitFor('"ns":"app"');
    await waitFor('"state":"queued"');
    ac.abort();
  });
});
