// gateways-e2e.test.ts — harness copied from secrets-e2e.test.ts (fixture-app
// scaffold + start(cfg) + wait helpers). Covers spec §6 end to end: declare →
// pending → link → server-side call with host-side injection → logs → unlink.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import { start } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { stopAllWorkers } from "../src/appWorker.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fixture = path.join(__dirname, "fixtures", "start-app");
const APP = "start-app";

let root: string, cache: string, state: string, server: Server, base: string;
let stub: http.Server, stubPort: number;

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

async function waitForConnections(expected: string[], timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let last: string[] = [];
  while (Date.now() < deadline) {
    const doc = await (await fetch(`${base}/api/apps/${APP}/gateways`)).json();
    last = (doc.connections ?? []).map((x: { alias: string }) => x.alias).sort();
    if (JSON.stringify(last) === JSON.stringify([...expected].sort())) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`connections never matched ${JSON.stringify(expected)}; last: ${JSON.stringify(last)}`);
}

async function probe(): Promise<string> {
  const html = await (await fetch(`${base}/${APP}/gateway-probe`)).text();
  const m = html.match(/<p id="gateway-probe">([^<]*)<\/p>/);
  if (!m) throw new Error(`probe value not found in page: ${html.slice(0, 300)}`);
  // The probed URL contains "&" as a query separator; React's SSR text-node
  // escaping renders it as "&amp;" — undo that before comparing.
  return m[1].replace(/&amp;/g, "&");
}

const gatewaysTs = `
import { defineGateways, gateway } from "@lodekit/sdk";
export default defineGateways({
  probe: gateway({ provider: "local-probe", description: "e2e probe gateway" }),
});
`;

const probeRoute = `import { createFileRoute } from "@tanstack/react-router";
import { probeGateway } from "../fns";

export const Route = createFileRoute("/gateway-probe")({
  loader: () => probeGateway(),
  component: () => {
    const d = Route.useLoaderData();
    return <p id="gateway-probe">{d.ok ? \`ok:\${d.data.url}\` : \`err:\${d.reason}\`}</p>;
  },
});
`;

beforeAll(async () => {
  // The stub provider — a real local HTTP server the gateway proxies to.
  stub = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ url: req.url }));
  });
  await new Promise<void>((r) => stub.listen(0, "127.0.0.1", r));
  stubPort = (stub.address() as AddressInfo).port;

  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-gwe2e-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-gwe2e-cache-"));
  state = fs.mkdtempSync(path.join(os.tmpdir(), "lk-gwe2e-state-"));
  copyDir(fixture, path.join(root, "apps", APP));
  fs.writeFileSync(path.join(root, "apps", APP, "src", "gateways.ts"), gatewaysTs);
  fs.writeFileSync(path.join(root, "apps", APP, "src", "routes", "gateway-probe.tsx"), probeRoute);
  // The gateway manifest must exist before start() — the registry loads at boot.
  const gwDir = path.join(root, "gateways", "local-probe");
  fs.mkdirSync(gwDir, { recursive: true });
  fs.writeFileSync(path.join(gwDir, "manifest.json"), JSON.stringify({
    name: "Local probe",
    base_url: `http://127.0.0.1:${stubPort}`,
    auth: { kind: "api_key", in: "query", param: "key", slot: "api_key" },
    slots: { api_key: { kind: "secret", label: "Probe key" } },
  }));
  process.env.LODEKIT_ROOT = root;
  process.env.LODEKIT_CACHE_DIR = cache;
  process.env.LODEKIT_STATE_DIR = state;
  process.env.LODEKIT_SECRETS_KEY_PROVIDER = "file";
  process.env.LODEKIT_PORT = "0";
  server = await start(loadConfig());
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  await waitReady(APP, 90_000);
  await waitForConnections(["probe"], 15_000);
}, 120_000);
afterAll(async () => {
  stopAllWorkers();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await new Promise<void>((resolve) => stub.close(() => resolve()));
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
  fs.rmSync(state, { recursive: true, force: true });
  delete process.env.LODEKIT_ROOT;
  delete process.env.LODEKIT_CACHE_DIR;
  delete process.env.LODEKIT_STATE_DIR;
  delete process.env.LODEKIT_SECRETS_KEY_PROVIDER;
  delete process.env.LODEKIT_PORT;
});

describe("gateways e2e (real worker, worker-token door)", () => {
  it("declared alias registers; server-side call reports unconfigured while pending", async () => {
    const doc = await (await fetch(`${base}/api/apps/${APP}/gateways`)).json();
    expect(doc.connections[0]).toMatchObject({ alias: "probe", provider: "local-probe", status: "needs_setup" });
    expect(await probe()).toBe("err:unconfigured");
  }, 15_000);

  it("link → the call succeeds with the key injected host-side; logs record it redacted; unlink → pending", async () => {
    const created = await fetch(`${base}/api/secrets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Probe key", value: "gw-e2e-key" }),
    });
    expect(created.status).toBe(201);
    const { slug } = await created.json();
    const linked = await fetch(`${base}/api/apps/${APP}/gateways/probe/slots/api_key/link`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    expect(linked.status).toBe(200);
    // The stub echoes the URL it received — the key was injected by the HOST;
    // the worker only ever said "GET /hello?name=greenhouse".
    expect(await probe()).toBe("ok:/hello?name=greenhouse&key=gw-e2e-key");

    // The door: no token → 401, even while linked.
    const bare = await fetch(`${base}/api/apps/${APP}/gateways/probe/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "GET", path: "/hello" }),
    });
    expect(bare.status).toBe(401);

    // One log record per request, filterable both ways, credential absent.
    const logs = await (await fetch(`${base}/api/logs?app=${APP}&source=gateway:local-probe`)).json();
    expect(logs.records.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain("gw-e2e-key");

    await fetch(`${base}/api/apps/${APP}/gateways/probe/slots/api_key/link`, { method: "DELETE" });
    expect(await probe()).toBe("err:unconfigured");
  }, 20_000);
});
