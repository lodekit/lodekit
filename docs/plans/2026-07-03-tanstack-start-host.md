# TanStack Start Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lodekit becomes a TanStack Start host — apps and the dashboard are Start apps (canonical SSR), built by the runtime into per-app worker threads; server functions land the §2.12 substrate + HTTP trigger.

**Architecture:** The build pipeline gains a Start mode (client + SSR Vite environments, self-contained server bundle into the cache); a new `appWorker` module runs each built server bundle in a `worker_threads.Worker` and forwards Requests/Responses across the boundary; `appHost` serves `_build/*` statically and forwards everything else to the worker, with a soft same-origin guard on `_serverFn/*`. The SDK detects the server context and targets loopback. Spec: `docs/specs/2026-07-03-tanstack-start-host-design.md`.

**Tech Stack:** TanStack Start (`@tanstack/react-start`), Vite 8 (JS API, `createBuilder`), React 19, Tailwind 4, zod 4, `worker_threads`, Hono (runtime internals, unchanged).

## Global Constraints

- Work on the `stack` worktree branch (`~/Code/worktrees/lodekit/stack`); commit directly to it; linear history; **no `Co-Authored-By` trailers**; never fold into `master` (person's call).
- `pnpm install` only from the repo root (never with CWD in `manager/`). If Node was switched: `pnpm rebuild better-sqlite3`.
- Runtime and MCP stay buildless (`tsx`); apps are bundled — the person never builds (umbrella invariant 2).
- Trust-boundary validation is never cut: app-id pattern, path containment, URI-decode 400s all survive the appHost rewrite.
- Canonical language (`context.md`): **app**, **app id**/`appId`, **server function**, **app worker**, **kv**. Never: slug, job, tool, RPC/action/endpoint (for server functions).
- Run tests per package with `pnpm --filter @lodekit/runtime test` (etc.); whole workspace: `pnpm test` from the root.
- Spike-verified facts to trust (do not re-derive): subpath mounting needs **vite-level `base`** (`/<app-id>/_build/`) — the Start plugin's `client.base` option does NOT change emitted asset URLs; plus `tanstackStart({ router: { basepath: "/<app-id>" }, serverFns: { base: "/<app-id>/_serverFn" } })`. The built `dist/server/server.js` **default-exports `{ fetch }`** (pure handler; bare imports unless bundled). Two Start apps mounted under one process verified 2026-07-03.

## File Map

| File | Role |
| --- | --- |
| `packages/runtime/src/build.ts` | Modify: Start build pipeline (`buildStart` + per-app/dashboard wiring); old SPA `viteOptions` deleted in Task 4 |
| `packages/runtime/src/appWorker.ts` | Create: worker lifecycle (spawn/respawn/backoff), request forwarding, server state |
| `packages/runtime/src/appWorkerEntry.mjs` | Create: plain-JS worker entry — imports the server bundle, serves `fetch()` over the message port |
| `packages/runtime/src/appHost.ts` | Rewrite: `_build/*` static, `_serverFn` guard, forward-to-worker, building/error/worker-down pages |
| `packages/runtime/src/server.ts` | Modify: dashboard = Start app #0 (`/_dashboard` static+forward, `/` redirect), worker shutdown, boot order |
| `packages/runtime/src/watcher.ts` | Modify: ignore `routeTree.gen.ts` + `.tanstack/` (build-writes must not retrigger builds) |
| `packages/runtime/src/scaffold.ts` | Rewrite templates: Start starter (routes/, router.tsx, loader + validated server function) |
| `packages/sdk/src/index.ts` | Modify: server-context base URL (`LODEKIT_BASE_URL`); `watch` explicit client-only error |
| `packages/runtime/dashboard/**` | Restructure to Start shape (routes/, router.tsx; `index.html`+`main.tsx` deleted) |
| `examples/apps/habit-tracker/**`, `examples/apps/expense-tracker/**` | Migrate to Start shape |
| `packages/runtime/tests/fixtures/start-app/**` | Create: minimal Start fixture app (loader, `ping`/`crash` server functions) |
| `packages/runtime/tests/{build-start,appWorker}.test.ts` | Create |
| `packages/runtime/tests/{appHost,e2e,dashboard,dashboardFallback,watcher,build,scaffold}.test.ts` | Modify to the new contract |
| `packages/ui/tests/ssr-smoke.test.tsx` | Create: `renderToString` over the component set (node env = real SSR condition) |
| `context.md`, `docs/specs/2026-07-02-product-overview-design.md`, `roadmap.md`, `CLAUDE.md` | Docs sweep (Task 8) |

---

### Task 1: Version bumps + Start build pipeline (new path, old path intact)

**Files:**
- Modify: `packages/runtime/package.json`
- Modify: `packages/runtime/src/build.ts` (add `buildStart`; do NOT remove the old path yet)
- Create: `packages/runtime/tests/fixtures/start-app/{manifest.json,src/router.tsx,src/routes/__root.tsx,src/routes/index.tsx,src/fns.ts,src/styles.css}`
- Test: `packages/runtime/tests/build-start.test.ts`

**Interfaces:**
- Produces: `buildStart(target: { rootDir: string; outDir: string; urlBase: string; appId: string }): Promise<void>` exported from `build.ts` — builds `outDir/client/**` and `outDir/server/server.js` (self-contained, default-exports `{ fetch }`). Tasks 2/4/6 consume it.

- [ ] **Step 1: Bump dependencies**

In `packages/runtime/package.json`: `"vite": "^8.0.0"`, `"@vitejs/plugin-react": "^5.0.0"`, add `"@tanstack/react-start": "^1.168.0"`; bump `"vitest"` (devDep) to the latest major that supports Vite 8 (v4.x at time of writing). Leave `@tanstack/react-router` (^1.170.0), tailwind, hono, better-sqlite3 untouched. Then from the **repo root**: `pnpm install`. Expected: clean install. If vitest's config API changed, fix `vitest.config`/test boot fallout mechanically.

- [ ] **Step 2: Verify the existing suite still passes under Vite 8**

Run: `pnpm --filter @lodekit/runtime test` and `pnpm --filter @lodekit/sdk test`
Expected: PASS (old SPA pipeline still builds under Vite 8's `build()`). If a suite fails on a Vite-8 behavior change, fix minimally; if the old pipeline is fundamentally broken under Vite 8, STOP and escalate (plan assumption violated).

- [ ] **Step 3: Create the fixture Start app**

`packages/runtime/tests/fixtures/start-app/manifest.json`:
```json
{ "name": "Start Fixture", "appId": "start-app", "icon": "🧪", "description": "test fixture" }
```

`packages/runtime/tests/fixtures/start-app/src/router.tsx`:
```tsx
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "../routeTree.gen";

export function getRouter() {
  return createRouter({ routeTree });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
```

(Note: the Start plugin generates `routeTree.gen.ts` at the app root on first build; the import is red in the editor until then — expected.)

`packages/runtime/tests/fixtures/start-app/src/routes/__root.tsx`:
```tsx
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";

export const Route = createRootRoute({
  head: () => ({ meta: [{ title: "start fixture" }] }),
  component: () => (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
```

`packages/runtime/tests/fixtures/start-app/src/fns.ts`:
```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { kv } from "@lodekit/sdk";

export const ping = createServerFn()
  .inputValidator(z.object({ echo: z.string() }))
  .handler(async ({ data }) => ({ echo: data.echo, pid: process.pid }));

// Reads through the SDK's loopback door — exercised by Task 4's e2e.
export const bump = createServerFn().handler(async () => {
  const n = ((await kv.get<number>("bumps")) ?? 0) + 1;
  await kv.set("bumps", n);
  return n;
});

// Kills the worker mid-request — Task 2's crash-containment case.
export const crash = createServerFn().handler(async () => {
  process.exit(1);
});
```

`packages/runtime/tests/fixtures/start-app/src/routes/index.tsx`:
```tsx
import { createFileRoute } from "@tanstack/react-router";
import { ping } from "../fns";

export const Route = createFileRoute("/")({
  loader: () => ping({ data: { echo: "loader" } }),
  component: () => {
    const data = Route.useLoaderData();
    return (
      <main>
        <h1>start fixture ok</h1>
        <p id="ssr-proof">{data.echo}:{data.pid}</p>
      </main>
    );
  },
});
```

`packages/runtime/tests/fixtures/start-app/src/styles.css`: empty file (keeps the fixture minimal; Tailwind plugin tolerates absence of imports).

- [ ] **Step 4: Write the failing test**

`packages/runtime/tests/build-start.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStart } from "../src/build.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fixture = path.join(__dirname, "fixtures", "start-app");

let out: string;

beforeAll(() => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), "lodekit-start-build-"));
});
afterAll(() => fs.rmSync(out, { recursive: true, force: true }));

describe("buildStart", () => {
  it("builds client assets and a self-contained server bundle", async () => {
    await buildStart({ rootDir: fixture, outDir: out, urlBase: "/start-app", appId: "start-app" });

    const serverEntry = path.join(out, "server", "server.js");
    expect(fs.existsSync(serverEntry)).toBe(true);
    expect(fs.readdirSync(path.join(out, "client"), { recursive: true }).length).toBeGreaterThan(0);

    // Self-contained: no bare imports left (spec §3 noExternal decision).
    const src = fs.readFileSync(serverEntry, "utf8");
    expect(src).not.toMatch(/^import .* from ["'](react|@tanstack|seroval|h3)/m);

    // Default export is a fetch handler (spike-verified shape).
    const mod = await import(serverEntry);
    expect(typeof mod.default?.fetch).toBe("function");
  }, 120_000);
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/build-start.test.ts`
Expected: FAIL — `buildStart` is not exported.

- [ ] **Step 6: Implement `buildStart` in `build.ts`**

Add (keeping everything existing intact):

```ts
import { createBuilder } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

// One Start build target: an app (urlBase "/<app-id>") or the dashboard ("/_dashboard").
export interface StartBuildTarget {
  rootDir: string;
  outDir: string;   // cache/<app-id> — client/ and server/ land inside
  urlBase: string;  // no trailing slash
  appId: string;    // __LODEKIT_APP_ID__ define value
}

const appAliases = () => ({
  react: pkgDir("react"),
  "react-dom": pkgDir("react-dom"),
  "@lodekit/sdk": pkgDir("@lodekit/sdk"),
  "@tanstack/react-query": pkgDir("@tanstack/react-query"),
  "@tanstack/react-router": pkgDir("@tanstack/react-router"),
  "@tanstack/react-start": pkgDir("@tanstack/react-start"),
  zod: pkgDir("zod"),
  "@lodekit/ui": uiDir,
  "lucide-react": lucideDir,
});

export async function buildStart(t: StartBuildTarget): Promise<void> {
  const builder = await createBuilder({
    root: fs.realpathSync(t.rootDir),
    base: `${t.urlBase}/_build/`, // vite-level base — the plugin's client.base does NOT do this (spike)
    logLevel: "silent",
    define: { __LODEKIT_APP_ID__: JSON.stringify(t.appId) },
    plugins: [
      tanstackStart({
        router: { basepath: t.urlBase },
        serverFns: { base: `${t.urlBase}/_serverFn` },
      }),
      react(),
      tailwind(),
    ],
    resolve: { alias: appAliases() },
    environments: {
      client: { build: { outDir: path.join(t.outDir, "client"), emptyOutDir: true } },
      ssr: {
        resolve: { noExternal: true },
        build: { outDir: path.join(t.outDir, "server"), emptyOutDir: true },
      },
    },
  });
  await builder.buildApp();
}
```

Known-unknowns to iterate on here (spec §12 risk #1 — this step IS the de-risk):
- The Start plugin may force its own `outDir`s (`dist/client`, `dist/server` under root). If the test shows output landing elsewhere, first try the per-environment `build.outDir` shown above taking precedence; if the plugin wins, fall back to letting it build to `<rootDir>/dist` and move `dist/{client,server}` into `t.outDir` after `buildApp()` (then delete `dist`). Adjust and keep the test green — the test defines the contract, not the mechanism.
- If `noExternal: true` on the ssr environment is rejected/ignored, try `ssr: { noExternal: true }` top-level config; if a dependency still resists bundling, STOP and escalate (spec's fallback is a cache-level `node_modules` symlink — a design change worth a human decision).
- If the ssr environment name differs (Start may register a custom env), inspect `builder.environments` keys and target the server-consumer env.

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/build-start.test.ts`
Expected: PASS (allow ~30–90s; it's a real two-environment build).

- [ ] **Step 8: Run the full runtime suite (no regressions), commit**

Run: `pnpm --filter @lodekit/runtime test`
Expected: PASS.

```bash
git add -A
git commit -m "feat(build): Start build pipeline (createBuilder, client+ssr envs, self-contained server bundle); vite 8 + @tanstack/react-start"
```

---

### Task 2: App worker substrate

**Files:**
- Create: `packages/runtime/src/appWorker.ts`
- Create: `packages/runtime/src/appWorkerEntry.mjs`
- Test: `packages/runtime/tests/appWorker.test.ts`

**Interfaces:**
- Consumes: Task 1's `buildStart` output shape (`<outDir>/server/server.js`, default export `{ fetch }`).
- Produces (from `appWorker.ts`; Tasks 4 and 6 consume all of these):
  - `configureWorkers(baseUrl: string): void` — loopback base handed to every worker as `LODEKIT_BASE_URL`.
  - `startAppWorker(cfg: Config, appId: string): void` — (re)spawns the worker for `cache/<appId>/server/server.js`.
  - `stopAppWorker(appId: string): void`, `stopAllWorkers(): void`.
  - `forwardToWorker(appId: string, request: Request): Promise<Response>` — throws `Error` (message-bearing) on worker-down/fatal/timeout.
  - `getServerState(appId: string): ServerState | undefined` with `type ServerState = { status: "starting" } | { status: "running" } | { status: "error"; message: string }`.
  - SSE event `server-state` broadcast as `{ appId, status, message? }` on every transition.

- [ ] **Step 1: Write the worker entry (plain JS — no loader dependency in workers)**

`packages/runtime/src/appWorkerEntry.mjs`:
```js
// Runs one app's built server bundle. Plain JS on purpose: workers must not
// depend on the tsx loader. Protocol (structured clone + transfers):
//   main -> worker  { type:"request", id, method, url, headers:[[k,v]], body:Uint8Array|null }
//   worker -> main  { type:"ready" } | { type:"fatal", message }
//                   | { type:"response", id, status, headers:[[k,v]], body:ReadableStream|null }
//                   | { type:"response-error", id, message }
import { parentPort, workerData } from "node:worker_threads";

let handler;
try {
  const mod = await import(workerData.serverEntry);
  handler = mod.default;
  if (typeof handler?.fetch !== "function") {
    throw new Error("server bundle default export has no fetch()");
  }
  parentPort.postMessage({ type: "ready" });
} catch (e) {
  parentPort.postMessage({ type: "fatal", message: e?.stack ?? String(e) });
  process.exit(1);
}

parentPort.on("message", async (msg) => {
  if (msg.type !== "request") return;
  try {
    const request = new Request(msg.url, {
      method: msg.method,
      headers: msg.headers,
      body: msg.body ?? undefined,
    });
    const response = await handler.fetch(request);
    const headers = [...response.headers];
    if (response.body) {
      parentPort.postMessage(
        { type: "response", id: msg.id, status: response.status, headers, body: response.body },
        [response.body]
      );
    } else {
      parentPort.postMessage({ type: "response", id: msg.id, status: response.status, headers, body: null });
    }
  } catch (e) {
    parentPort.postMessage({ type: "response-error", id: msg.id, message: e?.stack ?? String(e) });
  }
});
```

- [ ] **Step 2: Write the failing tests**

`packages/runtime/tests/appWorker.test.ts` (reuses Task 1's fixture build; build once in `beforeAll` into a temp cache laid out as `cache/start-app/{client,server}`):
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStart } from "../src/build.js";
import {
  configureWorkers, startAppWorker, stopAllWorkers, forwardToWorker, getServerState,
} from "../src/appWorker.js";
import type { Config } from "../src/config.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fixture = path.join(__dirname, "fixtures", "start-app");

let cacheDir: string;
let cfg: Config;

beforeAll(async () => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "lodekit-worker-"));
  cfg = { root: "", appsDir: "", dataDir: "", cacheDir, port: 0, baseUrl: "" };
  await buildStart({
    rootDir: fixture, outDir: path.join(cacheDir, "start-app"),
    urlBase: "/start-app", appId: "start-app",
  });
  configureWorkers("http://127.0.0.1:9"); // unroutable; SDK calls aren't exercised here
}, 180_000);

afterAll(() => {
  stopAllWorkers();
  fs.rmSync(cacheDir, { recursive: true, force: true });
});

async function waitFor(pred: () => boolean, ms: number) {
  const end = Date.now() + ms;
  while (!pred() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  expect(pred()).toBe(true);
}

describe("appWorker", () => {
  it("spawns, reaches running, and serves an SSR page", async () => {
    startAppWorker(cfg, "start-app");
    expect(getServerState("start-app")?.status).toBe("starting");
    const res = await forwardToWorker("start-app", new Request("http://x/start-app/"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("start fixture ok");
    expect(html).toContain("loader"); // loader ran server-side
    expect(getServerState("start-app")?.status).toBe("running");
  }, 30_000);

  it("a dead worker surfaces as error and respawns; runtime survives", async () => {
    // The crash server fn calls process.exit(1). Trigger it via the fetch handler:
    // Start dispatches POST <serverFns.base>/<fn-id>; we don't know the id, so kill
    // the worker directly instead — same observable contract.
    const { workerForTest } = await import("../src/appWorker.js");
    // (workerForTest(appId) returns the underlying Worker — export it for tests.)
    await workerForTest("start-app")!.terminate();
    await waitFor(() => getServerState("start-app")?.status !== "running", 5_000);
    // Respawn with backoff brings it back:
    await waitFor(() => getServerState("start-app")?.status === "running", 15_000);
    const res = await forwardToWorker("start-app", new Request("http://x/start-app/"));
    expect(res.status).toBe(200);
  }, 30_000);

  it("forwarding to a never-started app throws", async () => {
    await expect(forwardToWorker("nope", new Request("http://x/nope/"))).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/appWorker.test.ts`
Expected: FAIL — module `../src/appWorker.js` not found.

- [ ] **Step 4: Implement `appWorker.ts`**

```ts
import path from "node:path";
import fs from "node:fs";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.js";
import { broadcast } from "./sse.js";

export type ServerState =
  | { status: "starting" }
  | { status: "running" }
  | { status: "error"; message: string };

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "appWorkerEntry.mjs");
const REQUEST_TIMEOUT_MS = 30_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 10_000;

interface Managed {
  worker: Worker;
  ready: Promise<void>;
  pending: Map<number, { resolve: (r: Response) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>;
  nextId: number;
  attempts: number;       // consecutive crashes; reset on ready
  respawn?: NodeJS.Timeout;
  cfg: Config;
  stopped: boolean;       // deliberate stop — suppress respawn
}

const managed = new Map<string, Managed>();
const states = new Map<string, ServerState>();
let baseUrl = "";

export function configureWorkers(url: string): void { baseUrl = url; }

export function getServerState(appId: string): ServerState | undefined { return states.get(appId); }

function setState(appId: string, state: ServerState): void {
  states.set(appId, state);
  broadcast("server-state", { appId, ...state });
}

export function startAppWorker(cfg: Config, appId: string): void {
  stopAppWorker(appId);
  spawn(cfg, appId, 0);
}

function spawn(cfg: Config, appId: string, attempts: number): void {
  const serverEntry = path.join(cfg.cacheDir, appId, "server", "server.js");
  if (!fs.existsSync(serverEntry)) {
    setState(appId, { status: "error", message: "server bundle missing (not built)" });
    return;
  }
  setState(appId, { status: "starting" });
  const worker = new Worker(ENTRY, {
    workerData: { serverEntry },
    env: { ...process.env, LODEKIT_BASE_URL: baseUrl },
  });
  let readyResolve!: () => void, readyReject!: (e: Error) => void;
  const ready = new Promise<void>((res, rej) => { readyResolve = res; readyReject = rej; });
  ready.catch(() => {}); // observed via forwardToWorker; avoid unhandled rejection
  const m: Managed = { worker, ready, pending: new Map(), nextId: 1, attempts, cfg, stopped: false };
  managed.set(appId, m);

  worker.on("message", (msg) => {
    if (msg.type === "ready") { m.attempts = 0; setState(appId, { status: "running" }); readyResolve(); return; }
    if (msg.type === "fatal") { setState(appId, { status: "error", message: msg.message }); readyReject(new Error(msg.message)); return; }
    const p = m.pending.get(msg.id);
    if (!p) return;
    m.pending.delete(msg.id); clearTimeout(p.timer);
    if (msg.type === "response") p.resolve(new Response(msg.body, { status: msg.status, headers: msg.headers }));
    else p.reject(new Error(msg.message));
  });
  worker.on("error", (e) => fail(appId, m, `app worker error: ${e.stack ?? e}`));
  worker.on("exit", (code) => { if (!m.stopped) fail(appId, m, `app worker exited (code ${code})`); });
}

function fail(appId: string, m: Managed, message: string): void {
  for (const [, p] of m.pending) { clearTimeout(p.timer); p.reject(new Error(message)); }
  m.pending.clear();
  setState(appId, { status: "error", message });
  const delay = Math.min(BACKOFF_BASE_MS * 2 ** m.attempts, BACKOFF_CAP_MS);
  m.respawn = setTimeout(() => spawn(m.cfg, appId, m.attempts + 1), delay);
  m.respawn.unref();
}

export function stopAppWorker(appId: string): void {
  const m = managed.get(appId);
  if (!m) return;
  m.stopped = true;
  clearTimeout(m.respawn);
  for (const [, p] of m.pending) { clearTimeout(p.timer); p.reject(new Error("app worker stopped")); }
  m.pending.clear();
  void m.worker.terminate();
  managed.delete(appId);
  states.delete(appId);
}

export function stopAllWorkers(): void { for (const appId of [...managed.keys()]) stopAppWorker(appId); }

/** Test hook — the underlying Worker (crash-containment tests terminate it). */
export function workerForTest(appId: string): Worker | undefined { return managed.get(appId)?.worker; }

export async function forwardToWorker(appId: string, request: Request): Promise<Response> {
  const m = managed.get(appId);
  if (!m) throw new Error(`no app worker for ${appId}`);
  await m.ready; // rejects on fatal
  const id = m.nextId++;
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? null
      : new Uint8Array(await request.arrayBuffer()); // bodies are small (100kb-class); streams come back, not in
  return await new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => {
      m.pending.delete(id);
      reject(new Error(`app worker request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`));
    }, REQUEST_TIMEOUT_MS);
    timer.unref();
    m.pending.set(id, { resolve, reject, timer });
    m.worker.postMessage(
      { type: "request", id, method: request.method, url: request.url, headers: [...request.headers], body },
      body ? [body.buffer] : []
    );
  });
}
```

Note on `forwardToWorker` when the worker is mid-respawn: `managed` has the *new* entry as soon as `spawn` runs (synchronously scheduled by `fail`'s timer). Between crash and respawn, the entry exists with a rejected/never-resolving `ready` only in the fatal case; the crash case replaces the entry after the backoff. Callers (appHost) treat a throw as "server-error page". Do not over-engineer queuing.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/appWorker.test.ts`
Expected: PASS. Debug notes: if `postMessage` rejects on the `Uint8Array` transfer list, transfer `body.buffer` only when `body.buffer` is an `ArrayBuffer` (not a shared/resizable one). If `ReadableStream` transfer from worker→main fails on this Node version, fall back to buffering the response in the entry (`await response.arrayBuffer()`, post as `Uint8Array` transfer) — losing streaming, acceptable fallback; note it in the commit message if taken.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(runtime): app workers — per-app worker threads run built server bundles; forwarding, timeout, crash respawn, server-state SSE"
```

---

### Task 3: SDK server door

**Files:**
- Modify: `packages/sdk/src/index.ts`
- Modify: `packages/sdk/src/client.ts` (watch guard only)
- Test: `packages/sdk/tests/client.test.ts` (add cases)

**Interfaces:**
- Produces: the `kv` singleton targets `process.env.LODEKIT_BASE_URL` when running outside a browser (app workers set it); `kv.watch` throws a clear error server-side.

- [ ] **Step 1: Write the failing tests** (add to `packages/sdk/tests/client.test.ts`)

```ts
describe("server context", () => {
  it("watch throws a clear client-only error where EventSource is missing", () => {
    const client = createClient({ baseUrl: "http://127.0.0.1:9", appId: "x" });
    expect(() => client.kv.watch("", () => {})).toThrow(/client-only/);
  });
});
```

And a resolution test for the singleton base (node env has no `window`):
```ts
it("kv singleton uses LODEKIT_BASE_URL outside a browser", async () => {
  process.env.LODEKIT_BASE_URL = "http://127.0.0.1:1";
  const { kv } = await import("../src/index.js?" + Date.now()); // cache-bust the module
  await expect(kv.get("k")).rejects.toThrow(); // fails to CONNECT to :1 — proves the base was used
  delete process.env.LODEKIT_BASE_URL;
});
```
(If the query-string cache-bust doesn't re-evaluate under vitest, use `vi.resetModules()` + dynamic import instead.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lodekit/sdk test`
Expected: the new cases FAIL (watch throws a `ReferenceError` about `EventSource`, not the clear error; the singleton uses `""` base → relative-URL fetch error, not a connection error).

- [ ] **Step 3: Implement**

`packages/sdk/src/index.ts` — replace the singleton construction:
```ts
// Server side of the contract (an app worker): the runtime provides the loopback
// base; browser side: relative URLs against the page origin. Guarded so neither
// identifier leaks into the other environment's bundle.
const serverBaseUrl =
  typeof window === "undefined" && typeof process !== "undefined"
    ? process.env?.LODEKIT_BASE_URL ?? ""
    : "";

export const kv = createClient({ baseUrl: serverBaseUrl, appId: injectedAppId }).kv;
```

`packages/sdk/src/client.ts` — first line of the `watch` implementation:
```ts
if (typeof EventSource === "undefined") {
  throw new Error("kv.watch is client-only (no EventSource in this environment)");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lodekit/sdk test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sdk): server door — kv singleton targets LODEKIT_BASE_URL in app workers; watch is explicitly client-only"
```

---

### Task 4: The cutover — apps build and serve as Start apps

This is the flip. After it, the old SPA contract is gone: pipeline, serving, examples, and tests all move together.

**Files:**
- Modify: `packages/runtime/src/build.ts` (apps + `buildApp` use `buildStart`; delete `viteOptions`/old SPA path for apps; `dropBuild` stops the worker; `setState(ready)` starts it), `packages/runtime/src/appHost.ts` (rewrite), `packages/runtime/src/server.ts` (worker config + shutdown), `packages/runtime/src/watcher.ts` (ignores)
- Migrate: `examples/apps/habit-tracker/**`, `examples/apps/expense-tracker/**`
- Test: `packages/runtime/tests/appHost.test.ts`, `packages/runtime/tests/e2e.test.ts`, `packages/runtime/tests/build.test.ts`, `packages/runtime/tests/watcher.test.ts` (rewrite to the new contract)

**Interfaces:**
- Consumes: `buildStart` (Task 1), all of `appWorker.ts` (Task 2), SDK server door (Task 3).
- Produces: URL contract for every later task — `/<app-id>/_build/*` static; `/<app-id>/_serverFn/*` guarded + forwarded; all other `/<app-id>/…` forwarded (SSR); `301` on `/<app-id>`; building/build-error/server-error pages.

- [ ] **Step 1: Rewire `build.ts` for apps**

- `runBuild` calls `buildStart({ rootDir: appsDir/<appId>, outDir: cacheDir/<appId>, urlBase: "/"+appId, appId })` instead of `build(viteOptions(...))`.
- In `setState`, when a state becomes `ready`: `startAppWorker(currentCfg, appId)` — thread `cfg` through (make `setState(cfg, appId, state)` or capture cfg in `runBuild`; keep it simple: call `startAppWorker(cfg, appId)` in `runBuild` right after `setState(appId, { status: "ready" })`).
- `dropBuild` additionally calls `stopAppWorker(appId)`.
- Keep `buildDashboard` on the OLD path for now (Task 6 flips it) — retain `viteOptions` only for the dashboard until then, renamed `legacyDashboardViteOptions` if that clarifies.

- [ ] **Step 2: Rewrite `appHost.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import type { MiddlewareHandler } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Config } from "./config.js";
import { isValidAppId } from "./registry.js";
import { getBuildState } from "./build.js";
import { forwardToWorker, getServerState } from "./appWorker.js";

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

const page = (title: string, body: string, sse: boolean) => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:640px;margin:15vh auto;padding:0 24px;color:#0a0a0a}.muted{color:#6b7280}pre{white-space:pre-wrap;background:#f4f4f5;padding:16px;border-radius:10px;overflow:auto}</style>
</head>
<body>${body}${sse ? `<script>const es=new EventSource("/api/events");const r=(e)=>{try{if(JSON.parse(e.data).appId===${JSON.stringify(title)})location.reload()}catch{}};es.addEventListener("ready",r);es.addEventListener("error",r);es.addEventListener("server-state",r);</script>` : ""}</body>
</html>
`;

const buildingPage = (appId: string) =>
  page(appId, `<h1>Building…</h1><p class="muted">${appId} is compiling. This page reloads when it's ready.</p>`, true);
const buildErrorPage = (appId: string, message: string) =>
  page(appId, `<h1>Build failed</h1><p class="muted">${appId} could not be built.</p><pre>${esc(message)}</pre>`, true);
const serverErrorPage = (appId: string, message: string) =>
  page(appId, `<h1>App error</h1><p class="muted">${appId}'s server code failed.</p><pre>${esc(message)}</pre>`, true);

export function appHost(cfg: Config): MiddlewareHandler {
  // /<app-id>/_build/<rest> maps to cache/<app-id>/client/<rest> on disk.
  const staticHandler = serveStatic({
    root: cfg.cacheDir,
    rewriteRequestPath: (p) => p.replace(/^\/([a-z0-9-]+)\/_build\//, "/$1/client/"),
  });
  return async (c, next) => {
    const reqPath = new URL(c.req.url).pathname; // still percent-encoded
    const segments = reqPath.split("/").filter(Boolean);
    const appId = segments[0];
    if (!appId || !isValidAppId(appId)) return next();
    if (!fs.existsSync(path.join(cfg.appsDir, appId, "manifest.json"))) return next();

    if (segments.length === 1 && !reqPath.endsWith("/")) return c.redirect(reqPath + "/", 301);

    const state = getBuildState(appId);
    if (state?.status === "error") return c.html(buildErrorPage(appId, state.message));
    if (!state || state.status === "building") return c.html(buildingPage(appId));

    // Static client assets.
    if (segments[1] === "_build") {
      let decoded: string;
      try {
        decoded = decodeURIComponent(reqPath);
      } catch (e) {
        if (e instanceof URIError) return c.body(null, 400);
        throw e;
      }
      const clientDir = path.resolve(cfg.cacheDir, appId, "client");
      const rest = decoded.split("/").filter(Boolean).slice(2).join("/");
      const filePath = path.resolve(clientDir, rest);
      if (filePath !== clientDir && !filePath.startsWith(clientDir + path.sep)) return c.body(null, 403);
      return staticHandler(c, next);
    }

    // Soft same-origin guard: webhooks are explicitly unsupported (spec §5).
    if (segments[1] === "_serverFn" && c.req.header("sec-fetch-site") !== "same-origin") {
      return c.json({ error: "server functions are same-origin only" }, 403);
    }

    // Everything else — pages, _serverFn — is the app worker's.
    try {
      return await forwardToWorker(appId, c.req.raw);
    } catch (e) {
      const state = getServerState(appId);
      const message = state?.status === "error" ? state.message : e instanceof Error ? e.message : String(e);
      return c.html(serverErrorPage(appId, message), 502);
    }
  };
}
```

- [ ] **Step 3: Wire workers into `server.ts` and the watcher**

`server.ts` `start()` — new order (fallback pages cover the gaps):
```ts
export async function start(cfg: Config): Promise<Server> {
  const server = createServer(cfg);
  server.listen(cfg.port, () => { console.log(`Lodekit running at ${cfg.baseUrl}`); });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const addr = server.address();
  configureWorkers(`http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : cfg.port}`);
  await buildDashboard(cfg);
  const watcher = startWatcher(cfg);
  every("kv-store-sweep", 60_000, sweepAllAndBroadcast);
  server.on("close", () => { void watcher.close(); stop("kv-store-sweep"); stopAllWorkers(); });
  void buildAll(cfg);
  return server;
}
```

`watcher.ts` — build-generated files must not retrigger builds (infinite loop otherwise). Export the predicate for unit testing:
```ts
export const isGeneratedPath = (p: string): boolean =>
  p.endsWith(path.sep + "routeTree.gen.ts") || p.split(path.sep).includes(".tanstack");
```
and pass `ignored: (p) => isGeneratedPath(p)` in the `chokidar.watch` options.

- [ ] **Step 4: Migrate habit-tracker (multi-route, loader + server function)**

Delete `examples/apps/habit-tracker/index.html`, `src/main.tsx`, old `src/router.tsx`, `src/pages/`. Create:

`src/router.tsx` — same shape as the fixture's (Task 1 Step 3), importing `../routeTree.gen`.

`src/routes/__root.tsx`:
```tsx
import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import appCss from "../index.css?url";

const queryClient = new QueryClient();

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: "Habit Tracker" }],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: () => (
    <html lang="en">
      <head>
        <HeadContent />
        {/* Theme before hydration — no dark-mode flash (spec §2 / shadcn item 2).
            dangerouslySetInnerHTML is safe ONLY because this is a fixed string
            literal; never interpolate anything into it. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.toggle("dark",matchMedia("(prefers-color-scheme: dark)").matches)`,
          }}
        />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <nav className="mx-auto flex max-w-2xl gap-4 p-4">
            <Link to="/">Today</Link>
            <Link to="/manage">Manage</Link>
          </nav>
          <Outlet />
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  ),
});
```

`src/routes/index.tsx` — wraps the existing Today page: move the component body from the deleted `src/pages/Today.tsx` into the route `component`, unchanged, and add the canonical loader + server function:
```tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { kv } from "@lodekit/sdk";

// Server function: history summary computed next to the data (canonical pattern).
export const getStreaks = createServerFn().handler(async () => {
  // Port the streak/history computation currently done client-side in src/lib.ts
  // (read habits + check-ins via kv, compute per-habit streaks). Return a plain
  // JSON-serializable object.
});

export const Route = createFileRoute("/")({
  loader: () => getStreaks(),
  component: TodayPage,
});

function TodayPage() {
  const streaks = Route.useLoaderData();
  // <the JSX + Query hooks from the old pages/Today.tsx, with the streak display
  //  reading `streaks` from the loader instead of computing client-side>
}
```
`src/routes/manage.tsx` — `createFileRoute("/manage")` wrapping the old `pages/Manage.tsx` component body verbatim. Keep `src/lib.ts` for whatever both sides still share; keep `src/index.css`. The old `basepath` derivation from the SDK `appId` export is gone — the plugin injects it (do NOT set `basepath` in `createRouter`).

- [ ] **Step 5: Migrate expense-tracker (single route + Query/watch pattern retained)**

Delete `index.html`, `src/main.tsx`. Create `src/router.tsx` (fixture shape) and `src/routes/__root.tsx` (as above, title "Expense Tracker", no nav). Create `src/routes/index.tsx`: `createFileRoute("/")` whose component is the existing `App.tsx` content unchanged (Query + `kv.watch` invalidation stays the live-data pattern), plus one demonstrative server function:
```tsx
export const getSummary = createServerFn().handler(async () => {
  // totals by category over the expenses collection, via kv — port the reduce
  // currently in App.tsx; render its result in the summary section via the loader.
});
```
Delete the old `src/App.tsx` after moving its content.

- [ ] **Step 6: Rewrite the affected test suites**

- `appHost.test.ts`: fixtures become copies of `tests/fixtures/start-app`. Cases: 301 redirect kept; building page before ready; build-error page precedence; `/_build/<real asset>` → 200; `/_build/../escape` → 403; malformed percent-encoding → 400; extension-less sub-path (`/start-app/anything`) → forwarded (200 SSR shell, NOT a 404 — Start's router answers); `/_serverFn/x` without `Sec-Fetch-Site: same-origin` → 403 `{ error }`; with the header → not 403 (any worker-produced status); worker terminated (via `workerForTest`) then immediate request → 502 `serverErrorPage`.
- `e2e.test.ts`: `waitReady` predicate changes — the built page now references `/_build/` (not `/assets/`). Assert: `GET /habit-tracker/` contains SSR'd loader content; `GET /habit-tracker/manage` 200 (deep link); asset URLs as-emitted fetch 200; expense-tracker `/` 200. Add the loopback round-trip: fixture app copied into the temp root, `GET /start-app/` renders, and a page whose loader calls `bump` shows an incremented value across two SSR fetches (proves worker → loopback HTTP → kv).
- `build.test.ts`: assert `cache/<appId>/client` + `server/server.js` after `buildApp`; error state on a source syntax error (unchanged semantics).
- `watcher.test.ts`: add unit cases for `isGeneratedPath` (`.../routeTree.gen.ts` true, `.../src/routes/index.tsx` false, `.../.tanstack/tmp/x` true).

- [ ] **Step 7: Run the full runtime suite**

Run: `pnpm --filter @lodekit/runtime test`
Expected: PASS. (`dashboard`/`dashboardFallback`/`mcp`/`api`/`sse`/kv suites should be untouched by this task — the dashboard still builds on the legacy path until Task 6.)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(runtime)!: the Start cutover — apps build as Start apps into app workers; appHost serves _build + forwards SSR/_serverFn with same-origin guard; examples migrated"
```

---

### Task 5: Scaffold v2

**Files:**
- Modify: `packages/runtime/src/scaffold.ts`
- Test: `packages/runtime/tests/scaffold.test.ts`

**Interfaces:**
- Consumes: the Task 4 contract. Produces: scaffolded apps that build green through `buildApp` and demonstrate loader + validated server function + `@lodekit/ui`.

- [ ] **Step 1: Update the failing test** — `scaffold.test.ts` asserts the new file list `["manifest.json", "src/router.tsx", "src/routes/__root.tsx", "src/routes/index.tsx", "src/styles.css"]`, no `index.html`, and (slow case, reuse the suite's temp-config helper) that a scaffolded app builds to `ready` via `buildApp`. Run; expected FAIL.

- [ ] **Step 2: Rewrite the templates in `scaffold.ts`**

`src/router.tsx`: fixture shape (Task 1 Step 3). `src/styles.css`: `@import "@lodekit/ui/theme.css";`. `src/routes/__root.tsx`: the habit-tracker `__root` from Task 4 Step 4 minus Query provider and nav (title from `input.name`, stylesheet via `../styles.css?url`, theme-flash script). `src/routes/index.tsx`:
```tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { kv } from "@lodekit/sdk";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@lodekit/ui";

const getCount = createServerFn().handler(async () => (await kv.get<number>("count")) ?? 0);

const setCount = createServerFn()
  .inputValidator(z.object({ count: z.number().int().min(0) }))
  .handler(async ({ data }) => {
    await kv.set("count", data.count);
    return data.count;
  });

export const Route = createFileRoute("/")({
  loader: () => getCount(),
  component: Home,
});

function Home() {
  const initial = Route.useLoaderData();
  const [count, setCountState] = useState(initial);

  async function increment() {
    const next = await setCount({ data: { count: count + 1 } });
    setCountState(next);
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Card>
        <CardHeader>
          <CardTitle>${name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-muted-foreground">Edit src/routes/index.tsx to build this app.</p>
          <Button onClick={increment}>Get started ({count})</Button>
        </CardContent>
      </Card>
    </main>
  );
}
```
(In the scaffold template string, `${name}` is the template-literal interpolation of the app's display name, exactly as the old `appTsx` template did; add `import { useState } from "react";` to the emitted file's imports.)

Update the returned `files` array to match.

- [ ] **Step 3: Run tests, commit**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/scaffold.test.ts` — Expected: PASS.

```bash
git add -A
git commit -m "feat(scaffold): Start starter — routes/, loader + zod-validated server function, themed root with flash guard"
```

---

### Task 6: Dashboard = Start app #0

**Files:**
- Restructure: `packages/runtime/dashboard/` → `src/router.tsx`, `src/routes/__root.tsx`, `src/routes/index.tsx` (delete `index.html`, `src/main.tsx`; keep `src/App.tsx` content as the index route's component; keep `src/index.css`)
- Modify: `packages/runtime/src/build.ts` (`buildDashboard` → `buildStart` with `urlBase: "/_dashboard"`, `appId: "_dashboard"`; delete the legacy `viteOptions` path entirely), `packages/runtime/src/server.ts`
- Test: `packages/runtime/tests/dashboard.test.ts`, `packages/runtime/tests/dashboardFallback.test.ts`

- [ ] **Step 1: Restructure the dashboard source** — `__root.tsx` as in Task 4 Step 4 (title "Lodekit", Query provider stays if `App.tsx` uses it, stylesheet `../index.css?url`, theme-flash script); `routes/index.tsx` = `createFileRoute("/")` rendering the moved `App.tsx` default export; `router.tsx` = fixture shape.

- [ ] **Step 2: Flip `buildDashboard` and serving**

`build.ts`: `buildDashboard` calls `buildStart({ rootDir: DASHBOARD_ROOT, outDir: path.join(cfg.cacheDir, "_dashboard"), urlBase: "/_dashboard", appId: "_dashboard" })`; on success `startAppWorker(cfg, "_dashboard")`. Delete `viteOptions` and the old `build()` import if now unused.

`server.ts` `createApp`: replace the `/_dashboard/*` static line and the `/` handler with:
```ts
.use("/_dashboard/_build/*", serveStatic({
  root: cfg.cacheDir,
  rewriteRequestPath: (p) => p.replace(/^\/_dashboard\/_build\//, "/_dashboard/client/"),
}))
.all("/_dashboard/*", async (c) => {
  const state = getDashboardState();
  if (!state || state.status === "error") {
    return c.html(fallbackPage(state?.status === "error" ? state.message : undefined));
  }
  try {
    return await forwardToWorker("_dashboard", c.req.raw);
  } catch (e) {
    return c.html(fallbackPage(e instanceof Error ? e.message : String(e)), 502);
  }
})
.get("/_dashboard", (c) => c.redirect("/_dashboard/", 301))
.get("/", (c) => c.redirect("/_dashboard/", 302))
```
The dependency-free `fallbackPage` stays exactly as-is — it is the debug floor (spec §7).

- [ ] **Step 3: Surface server state in the dashboard UI (spec §5)** — in the dashboard's app grid (`App.tsx` content moved in Step 1): subscribe to the global SSE channel's new `server-state` events (the existing EventSource wiring already handles `building`/`ready`/`error`); each app card shows a badge for `serverState.status === "error"` (e.g. destructive-variant Badge "server error" with the message in a tooltip/title) next to the existing build-state indicator. Seed initial state from the SSE stream alone (state broadcasts on every transition; an app with no `server-state` event yet shows nothing).

- [ ] **Step 4: Update the dashboard suites** — `dashboard.test.ts`: `/` → 302 to `/_dashboard/`; `/_dashboard/` → SSR HTML containing the dashboard root markup after boot; `_build` asset fetch 200. `dashboardFallback.test.ts`: unbuilt/failed dashboard → fallback page (assert the "isn't available" copy), apps + API still served.

- [ ] **Step 5: Run the full runtime suite, commit**

Run: `pnpm --filter @lodekit/runtime test` — Expected: PASS.

```bash
git add -A
git commit -m "feat(dashboard): Start app #0 — SSR'd at /_dashboard via its own app worker; legacy SPA pipeline deleted; / redirects"
```

---

### Task 7: `@lodekit/ui` SSR smoke

**Files:**
- Create: `packages/ui/tests/ssr-smoke.test.tsx` (+ whatever vitest wiring `packages/ui/package.json` lacks — add `"test": "vitest run"` and a devDep on vitest if absent; keep node environment, NOT jsdom — no `window` is the point)

- [ ] **Step 1: Write the test** — one composite page rendering the commonly-used set (Button, Card family, Input, Label, Select with open={false}, Dialog with open, DropdownMenu, Tabs, Table, Badge, Checkbox, Switch, Textarea, Tooltip provider — extend to every export that renders standalone):
```tsx
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
// import { ...set } from "../src";  (match the package's export style)

describe("SSR smoke", () => {
  it("the component set renders server-side without touching window", () => {
    const html = renderToString(<Smoke />); // <Smoke/> composes the set above
    expect(html.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run; fix offenders individually** (expected: zero-to-few; a component reading `window` at render time gets the standard `typeof window` guard). Run: `pnpm --filter @lodekit/ui test` — Expected: PASS. Root `pnpm test` picks the new suite up via `pnpm -r test`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(ui): SSR smoke — component set renders under react-dom/server in a node env"
```

---

### Task 8: Docs sweep

**Files:** `context.md`, `docs/specs/2026-07-02-product-overview-design.md`, `roadmap.md`, `CLAUDE.md`

- [ ] **Step 1: `context.md`** — Add under *Apps*:
  - **Server function**: App-defined code that runs on the server side of the contract — a TanStack Start `createServerFn`, callable from the app's own client; inputs validated at the trust boundary. _Avoid_: server code, RPC, action, endpoint.
  - **App worker**: The per-app worker thread inside the runtime that executes an app's built server bundle (SSR + server functions). _Avoid_: sandbox, per-app server, process.
  - Rewrite **Stack**: TanStack Start (React, file-based routes, loaders, server functions, SSR) + TypeScript + Tailwind through the shared toolchain, importing the SDK and the UI library, conforming to the app contract. Apps are **server-rendered**.
  - Rewrite **App contract**: a manifest, `src/routes/` + `src/router.tsx` (TanStack Start shape), and the build-generated, committed `routeTree.gen.ts`. No HTML entry.
  - Update the **SDK** entry: works on both sides of the contract (browser and app worker).
  - *Relationships*: add "An app's **server functions** run in its **app worker** inside the **runtime**; they reach services through the **SDK** over loopback HTTP."
- [ ] **Step 2: Umbrella spec** — apply §9 of `docs/specs/2026-07-03-tanstack-start-host-design.md` verbatim scope: rewrite §2.5 and §2.12 around Start hosting; annotate §2.1 boundary + invariants 1/3/4/5/8 with the §1.1 sentences; §2.8 dashboard = Start app on the shared substrate; v0.1 table rows (Stack/contract, Tasks) + §4.2: this slice between stack-refresh and slice 3; slice-4 row dissolved. Add the positioning line "powered by TanStack, shadcn, and SQLite" to §1's positioning facts.
- [ ] **Step 3: `roadmap.md`** — delete "Next design target: app server code" (superseded by the shipped spec — note it in "shipped" phrasing consistent with the file's style); secret-store bullet gains "**unblocked** by the tanstack-start-host substrate (SDK from server functions); still its own slice"; add items: *Webhooks trigger* (replace the soft same-origin guard with a real inbound story: auth, reachability, signatures), *server-side watch/signals (with Tasks)*; note the dashboard freshness-skip item's raised relevance (Start build is heavier).
- [ ] **Step 4: `CLAUDE.md`** — Architecture section: runtime line mentions "hosts TanStack Start apps in per-app worker threads"; `examples/` line: "buildless sample apps" → "sample Start apps (no per-app dependencies)". Keep it surgical.
- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: start-host sweep — server function/app worker terms, umbrella §2.5/§2.12 + invariants, roadmap triggers, CLAUDE.md"
```

---

### Task 9: Final verification

- [ ] **Step 1: Full workspace** — Run: `pnpm test` (repo root) and `pnpm --filter @lodekit/runtime exec tsc --noEmit` + the sdk/manager checks. Expected: all PASS.
- [ ] **Step 2: Dev-mode boot** — Run: `pnpm dev`; wait for boot. `curl -s http://127.0.0.1:7777/ -o /dev/null -w '%{http_code}'` → 302; `curl -s http://127.0.0.1:7777/habit-tracker/ | grep -c _build` ≥ 1 and page contains SSR'd content (not "Building…" after settle).
- [ ] **Step 3: Manual browser smoke checklist** (present to the human; do not self-certify):
  - habit-tracker: both pages, back button, hard refresh on `/manage`, a check-in round-trips (server function), streaks visible (loader).
  - expense-tracker: add expense persists; summary (server function) updates; live update via watch→invalidate still works.
  - dashboard: grid + build states live; kv Data panel liveness; kill an app's source into a syntax error → error page → fix → recovers.
  - dark mode: no flash on either app.
- [ ] **Step 4: Update the SDD/progress ledger if in use; leave the branch for the person to fold in (never integrate unattended).**
