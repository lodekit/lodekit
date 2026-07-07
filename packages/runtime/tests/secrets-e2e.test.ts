// secrets-e2e.test.ts — harness copied verbatim from settings-e2e.test.ts (same
// fixture-app scaffold + start(cfg) + wait helpers; only the fixture files and
// assertions below differ). Covers the spec §6 flow end to end: declare →
// pending → link → server-side read → unlink.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import { start } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { stopAllWorkers } from "../src/appWorker.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fixture = path.join(__dirname, "fixtures", "start-app");
const APP = "start-app";

let root: string, cache: string, state: string, server: Server, base: string;

function copyDir(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

async function waitReady(appId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await (await fetch(`${base}/${appId}/`)).text();
    if (last.includes("/_build/")) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${appId}; last page: ${last.slice(0, 300)}`);
}

async function waitForSlots(expected: string[], timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let last: string[] = [];
  while (Date.now() < deadline) {
    const doc = await (await fetch(`${base}/api/apps/${APP}/secrets`)).json();
    last = (doc.slots ?? []).map((s: { slot: string }) => s.slot).sort();
    if (JSON.stringify(last) === JSON.stringify([...expected].sort())) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`slots never matched ${JSON.stringify(expected)}; last: ${JSON.stringify(last)}`);
}

async function probe(): Promise<string> {
  const html = await (await fetch(`${base}/${APP}/secret-probe`)).text();
  const m = html.match(/<p id="secret-probe">([^<]*)<\/p>/);
  if (!m) throw new Error(`probe value not found in page: ${html.slice(0, 300)}`);
  return m[1];
}

const secretsTs = `
import { defineSecrets, secret } from "@lodekit/sdk";
export default defineSecrets({
  api_key: secret({ label: "API key", description: "Probe secret for the e2e." }),
});
`;

const probeRoute = `import { createFileRoute } from "@tanstack/react-router";
import { readSecret } from "../fns";

export const Route = createFileRoute("/secret-probe")({
  loader: () => readSecret(),
  component: () => {
    const d = Route.useLoaderData();
    return <p id="secret-probe">{d.ok ? \`ok:\${d.value}\` : \`err:\${d.reason}\`}</p>;
  },
});
`;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-secretse2e-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-secretse2e-cache-"));
  state = fs.mkdtempSync(path.join(os.tmpdir(), "lk-secretse2e-state-"));
  copyDir(fixture, path.join(root, "apps", APP));
  fs.writeFileSync(path.join(root, "apps", APP, "src", "secrets.ts"), secretsTs);
  fs.writeFileSync(path.join(root, "apps", APP, "src", "routes", "secret-probe.tsx"), probeRoute);
  process.env.LODEKIT_ROOT = root;
  process.env.LODEKIT_CACHE_DIR = cache;
  process.env.LODEKIT_STATE_DIR = state;
  process.env.LODEKIT_SECRETS_KEY_PROVIDER = "file";
  process.env.LODEKIT_PORT = "0";
  server = await start(loadConfig());
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  await waitReady(APP, 90_000);
  await waitForSlots(["api_key"], 15_000);
}, 120_000);
afterAll(async () => {
  stopAllWorkers();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
  fs.rmSync(state, { recursive: true, force: true });
  delete process.env.LODEKIT_ROOT;
  delete process.env.LODEKIT_CACHE_DIR;
  delete process.env.LODEKIT_STATE_DIR;
  delete process.env.LODEKIT_SECRETS_KEY_PROVIDER;
  delete process.env.LODEKIT_PORT;
});

describe("secrets e2e (real worker, worker-token door)", () => {
  it("declared slot registers as pending; server-side read reports unlinked", async () => {
    const doc = await (await fetch(`${base}/api/apps/${APP}/secrets`)).json();
    expect(doc.slots).toEqual([
      { slot: "api_key", label: "API key", description: "Probe secret for the e2e.", error: null, status: "pending", secret: null },
    ]);
    expect(await probe()).toBe("err:unlinked");
  }, 15_000);

  it("create + link → the server function reads the value; unlink → unlinked again", async () => {
    const created = await fetch(`${base}/api/secrets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Probe key", value: "s3cr3t-value" }),
    });
    expect(created.status).toBe(201);
    const { slug } = await created.json();
    const linked = await fetch(`${base}/api/apps/${APP}/secrets/api_key/link`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    expect(linked.status).toBe(200);
    expect(await probe()).toBe("ok:s3cr3t-value");

    // The door: no token → 401, even while linked.
    const bare = await fetch(`${base}/api/apps/${APP}/secrets/api_key/value`);
    expect(bare.status).toBe(401);

    await fetch(`${base}/api/apps/${APP}/secrets/api_key/link`, { method: "DELETE" });
    expect(await probe()).toBe("err:unlinked");
  }, 20_000);
});
