# Stack Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/specs/2026-07-03-stack-refresh-design.md`
**Umbrella:** `docs/specs/2026-07-02-product-overview-design.md`

**Goal:** Replace Express with Hono (with typed `hc` RPC as the SDK transport), bump React 19 and zod 4 workspace-wide, formalize TanStack Query in the app stack, wire TanStack Router with one example, and rename `slug` → `app-id` — all behavior-preserving except the rename and one new SPA-fallback serving rule.

**Architecture:** The runtime (`packages/runtime`) is a single buildless Node process serving apps, dashboard, scoped API, and SSE. The migration swaps its HTTP layer file-by-file, using the shipped vitest suites as the acceptance harness. The SDK (`packages/sdk`) keeps its explicit public `Kv` interface but implements the seven REST ops through Hono's inferred `hc` client, so route/SDK drift fails `tsc` at edit time.

**Tech Stack:** Hono + `@hono/node-server` + `@hono/zod-validator`, zod 4, React 19, TanStack Query + Router, Vite 6 (untouched), better-sqlite3 (untouched), vitest.

## Global Constraints

Copied from the spec — every task's requirements implicitly include these:

- **Behavior-preserving** everywhere except the rename (Task 3) and the SPA fallback rule (Task 8): same routes, same validation failures (`{ error: string }` 400s), same SSE events, same SDK public surface. The shipped vitest suites must pass essentially unchanged (modulo renamed params/URLs).
- **Chained Hono style** (`new Hono().get(...).post(...)`) is a normative constraint on every service module — it is what makes route-type inference work.
- **Versions** (current stable, `^` ranges, no pins): `hono` ^4.12.0, `@hono/node-server` ^2.0.0, `@hono/zod-validator` ^0.8.0, `zod` ^4.4.0, `react`/`react-dom` ^19.2.0, `@types/react`/`@types/react-dom` ^19, `@modelcontextprotocol/sdk` ^1.29.0, `@tanstack/react-router` ^1.170.0.
- **Explicitly untouched:** Vite 6, Tailwind 4, better-sqlite3, `@tanstack/react-query` version (already present; it only gains a toolchain alias).
- **Non-goals:** MCP tool redesign / skill rewrite (slice 3 — MCP gets mechanical renames only; `packages/skill/SKILL.md` is NOT touched even though it mentions `slug`); file-based routing and the multi-page app contract (**slice 4**, future); SDK-level React hooks; Vite 7; `node:sqlite`; scaffold-starter modernization.
- **Rename normative forms:** `appId` in code and JSON fields, `:appId` in route params, "app id" in prose. The identifier stays the human-chosen, folder-name-doubling, URL-safe string `^[a-z0-9-]+$`.
- **Key validation rules (unchanged):** key non-empty and ≤ 512 chars; `ttl` positive number; `by` number; `incr` on a non-number → 400. JSON body limit stays 100 kb (Express's `express.json()` default), made explicit via Hono `bodyLimit`.
- Run `pnpm install` **only from the repo root** (never with CWD inside `manager/` — its `.npmrc` would rewrite the workspace to hoisted layout).
- Commit per task, no `Co-Authored-By` trailers. Work stays on the `stack` branch — never fold into `master` unattended.
- Runtime and MCP stay buildless (`tsx`, no build step).

**Testing commands used throughout:**

```bash
pnpm --filter @lodekit/runtime test     # runtime suites (incl. e2e + mcp integration; builds real apps, slow)
pnpm --filter @lodekit/sdk test         # sdk unit tests (mocked fetch — asserts exact URLs)
pnpm test                               # everything (runtime, sdk, manager)
```

---

### Task 1: React 19 workspace bump

**Files:**
- Modify: `packages/runtime/package.json`
- Modify: `packages/ui/package.json`
- Modify: `web/package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: React 19 installed workspace-wide; examples pick it up automatically via the toolchain aliases in `packages/runtime/src/build.ts` (no example change needed).

- [ ] **Step 1: Bump runtime React deps**

In `packages/runtime/package.json`, change:

```json
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
```

and in `devDependencies`:

```json
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
```

- [ ] **Step 2: Bump `@lodekit/ui` peers and dev deps**

In `packages/ui/package.json`:

```json
  "peerDependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
```

and in `devDependencies` set `"@types/react": "^19.0.0"`, `"@types/react-dom": "^19.0.0"`, `"react": "^19.2.0"`, `"react-dom": "^19.2.0"`. Leave the Radix/shadcn constellation (`radix-ui`, `lucide-react`, etc.) as-is unless Step 4's install or Step 5's checks fail with a React 19 peer/type error — then bump only the failing package to its current stable ("Radix/shadcn constellation bumped as React 19 requires").

- [ ] **Step 3: Bump `web` React deps**

In `web/package.json`: `"react": "^19.2.0"`, `"react-dom": "^19.2.0"`, `"@types/react": "^19.0.0"`, `"@types/react-dom": "^19.0.0"`, and bump `"@astrojs/react"` to its current stable major that supports React 19 (`pnpm --filter @lodekit/web add @astrojs/react@latest`). If pnpm reports an astro peer conflict, bump `astro` too — fix what breaks, nothing opportunistic.

- [ ] **Step 4: Install and rebuild**

```bash
pnpm install   # from the repo root
```

If a `better-sqlite3` ABI error appears later: `pnpm rebuild better-sqlite3`.

- [ ] **Step 5: Verify — typecheck + full test suite + web build**

```bash
pnpm --filter @lodekit/ui check
pnpm test
pnpm --filter @lodekit/web build
```

Expected: all green. The runtime e2e test builds both example apps with React 19 through the real toolchain — that is the acceptance gate. Fix any React 19 breaks minimally (no `forwardRef` sweeps, no opportunistic refactors).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: bump React 18 -> 19 workspace-wide"
```

---

### Task 2: zod 4 + MCP SDK bump

**Files:**
- Modify: `packages/runtime/package.json` (zod range only — zod is not yet imported by runtime source; Task 5's validators will use it)
- Modify: `packages/mcp/package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `zod@^4` available to Task 5's validators; `@modelcontextprotocol/sdk@^1.29` accepting zod 4 shapes natively (Standard Schema). `registerTool` migration stays slice 3 — keep the deprecated `server.tool()` calls.

- [ ] **Step 1: Bump manifests**

`packages/runtime/package.json`: `"zod": "^4.4.0"`.
`packages/mcp/package.json`: `"zod": "^4.4.0"`, `"@modelcontextprotocol/sdk": "^1.29.0"`.

- [ ] **Step 2: Install and typecheck MCP**

```bash
pnpm install
pnpm --filter @lodekit/mcp exec tsc --noEmit
```

Expected: clean. If `server.tool()` raw-shape typing complains under zod 4, adjust the zod shapes minimally (they are plain `z.string()` fields) — do NOT migrate to `registerTool`.

- [ ] **Step 3: Run the runtime↔MCP integration test + full suite**

```bash
pnpm --filter @lodekit/runtime test tests/mcp.test.ts
pnpm test
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: bump zod 3 -> 4 and @modelcontextprotocol/sdk (registerTool migration stays slice 3)"
```

---

### Task 3: `slug` → `app-id` rename (pure terminology, one back-compat line)

Do this **before** the Hono migration so all new Hono code is written once with final names. Express stays in place; tests are renamed in the same commit and must stay green.

**Files:**
- Modify: `packages/runtime/src/registry.ts`, `routes.ts`, `scaffold.ts`, `build.ts`, `db.ts`, `sse.ts`, `appHost.ts`, `watcher.ts`, `services/kv-store.ts`
- Modify: `packages/runtime/dashboard/src/App.tsx`
- Modify: `packages/sdk/src/client.ts`, `packages/sdk/src/index.ts`
- Modify: `packages/mcp/client.ts`, `packages/mcp/index.ts`
- Modify: `examples/apps/habit-tracker/manifest.json`, `examples/apps/expense-tracker/manifest.json`
- Modify: all runtime tests (`tests/api.test.ts`, `appHost.test.ts`, `build.test.ts`, `db.test.ts`, `e2e.test.ts`, `kv-api.test.ts`, `kv-store.test.ts`, `mcp.test.ts`, `registry.test.ts`, `scaffold.test.ts`, `sse.test.ts`, `watcher.test.ts`) and `packages/sdk/tests/client.test.ts`
- NOT touched: `packages/skill/SKILL.md` (slice 3), historical specs, `roadmap.md`/`context.md`/umbrella (Task 10)

**Interfaces:**
- Consumes: nothing new.
- Produces (later tasks rely on these exact names):
  - `isValidAppId(appId: string): boolean` (registry.ts)
  - `AppManifest { name: string; appId: string; icon?: string; description?: string }`
  - `scanApps(appsDir): AppManifest[]` — items carry `appId`
  - `getAppDb(dataDir, appId)`, `openDbs(): { appId, db }[]` (db.ts)
  - `getKv(dataDir, appId)`, `sweepAll(): { appId, keys }[]` (kv-store.ts)
  - `broadcast(event, data, appId?)`, `addClient(res, appId?)` (sse.ts — writer abstraction comes in Task 4)
  - Build define `__LODEKIT_APP_ID__`; SDK `createClient({ baseUrl, appId })`
  - HTTP: route mounts `/api/apps/:appId/…`; `POST /api/apps` body field `appId`; SSE/global event payloads carry `appId`; manifest field `appId` (read `appId ?? slug`)

- [ ] **Step 1: registry.ts — rename + manifest back-compat**

Replace the interface, regex name, and `scanApps` parse:

```ts
export interface AppManifest {
  name: string;
  appId: string;
  icon?: string;
  description?: string;
}

const APP_ID_RE = /^[a-z0-9-]+$/;

export function isValidAppId(appId: string): boolean {
  return APP_ID_RE.test(appId);
}
```

In `scanApps`, read `appId ?? slug` (the one line of back-compat so pre-rename apps in a real Lodekit root keep working):

```ts
      const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as AppManifest & { slug?: string };
      const appId = raw.appId ?? raw.slug ?? "";
      if (!isValidAppId(appId) || appId !== entry.name) continue;
      apps.push({ name: raw.name, appId, icon: raw.icon, description: raw.description });
```

- [ ] **Step 2: Mechanical sweep across runtime source**

Apply these exact renames (grep-driven; every occurrence):

| Old | New | Where |
| --- | --- | --- |
| `isValidSlug` | `isValidAppId` | routes.ts, appHost.ts, kv-store.ts |
| `:slug` route param / `req.params.slug` | `:appId` / `req.params.appId` | routes.ts, kv-store.ts (`mergeParams` router) |
| `slug` local vars / params / fields | `appId` | scaffold.ts (`ScaffoldInput.appId`, manifest written as `appId`, return `{ appId, … }`), build.ts (`getBuildState(appId)`, `setState` broadcasts `{ appId }` / `{ appId, message }`, `buildApp`, `dropBuild`, `chains`/`states` keys, `app.appId` in `buildAll`), db.ts (`{ appId, db }` cache entries, `openDbs`), watcher.ts (`slugOf` → `appIdOf`), sse.ts (`Client.slug` → `Client.appId`, `addClient(res, appId?)`, `broadcast(…, appId?)`), kv-store.ts (`getKv`, `sweepAll`, `emit(appId, …)` broadcasting `{ appId, key, op }`) |
| `__LODEKIT_SLUG__` | `__LODEKIT_APP_ID__` | build.ts define |
| `"invalid slug"` / `"invalid slug or missing name"` | `"invalid app id"` / `"invalid app id or missing name"` | routes.ts, kv-store.ts error strings |
| `.slug===` in the appHost building/error page inline script | `.appId===` | appHost.ts `page()` template (`JSON.parse(e.data).appId`) |

`routes.ts` `POST /apps` now destructures `const { appId, name, description, icon } = req.body ?? {}` and validates `isValidAppId(appId ?? "")`.

- [ ] **Step 3: SDK rename**

`packages/sdk/src/client.ts`: `createClient({ baseUrl, appId }: { baseUrl: string; appId: string })`; `api` = `` `${baseUrl}/api/apps/${appId}/kv-store` ``; the watch EventSource URL uses `${baseUrl}/api/apps/${appId}/events`. `KvChange` is unchanged (it never carried a slug).

`packages/sdk/src/index.ts`:

```ts
// Injected per app by the runtime's Vite build (define). Absent (e.g. under
// Node imports of this entry) it stays undefined and the singleton is inert.
declare const __LODEKIT_APP_ID__: string | undefined;
const injectedAppId = typeof __LODEKIT_APP_ID__ === "string" ? __LODEKIT_APP_ID__ : "";

export const kv = createClient({ baseUrl: "", appId: injectedAppId }).kv;
```

- [ ] **Step 4: MCP + dashboard + examples**

- `packages/mcp/client.ts`: `scaffold(base, input: { appId: string; name: string; … })` (body field renamed with it).
- `packages/mcp/index.ts`: every `slug: z.string()` → `appId: z.string()`; `lodekit_open_app` uses `${BASE}/${appId}`; kv tools call `createClient({ baseUrl: BASE, appId })`. Tool *names* and shapes otherwise unchanged.
- `packages/runtime/dashboard/src/App.tsx`: `AppInfo.slug` → `appId`; `StorePanel({ appId })`; `createClient({ baseUrl: "", appId })`; queryKey `["kv", appId]`; SSE handlers read `d.appId`; card keys/links use `a.appId`.
- Both `examples/apps/*/manifest.json`: `"slug"` key → `"appId"` (values unchanged).

- [ ] **Step 5: Rename in tests + one new back-compat test**

Sweep the test files: request bodies (`{ slug: "exp", … }` → `{ appId: "exp", … }`), response assertions (`a.slug` → `a.appId`), SSE payload assertions (`'"slug":"app-a"'` → `'"appId":"app-a"'`), test-helper manifest writes (`JSON.stringify({ name: slug, slug })` → `JSON.stringify({ name: appId, appId })`), imported helpers (`sweepAll` destructuring), sdk test (`createClient({ baseUrl: "http://x", appId: "notes" })`, dispatched event payloads `{ appId: "notes", … }`), and the e2e comment mentioning `__LODEKIT_SLUG__`. URLs like `/api/apps/exp/kv-store` don't change.

Add to `packages/runtime/tests/registry.test.ts`:

```ts
  it("reads a pre-rename manifest via the slug field (back-compat)", () => {
    const dir = path.join(appsDir, "legacy");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ name: "Legacy", slug: "legacy" }));
    expect(scanApps(appsDir).map((a) => a.appId)).toContain("legacy");
  });
```

(Adapt `appsDir` setup to the file's existing fixture helpers.)

- [ ] **Step 6: Verify nothing is left, run everything**

```bash
grep -rn "slug" packages examples --include="*.ts" --include="*.tsx" --include="*.json" | grep -v node_modules
```

Expected remaining hits ONLY in: `packages/skill/SKILL.md` (slice 3), the back-compat line in `registry.ts`, and the back-compat test. Then:

```bash
pnpm test
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: rename slug -> app-id across runtime, sdk, mcp, dashboard, examples (manifest reads appId ?? slug)"
```

---

### Task 4: SSE writer abstraction

Decouple `sse.ts` from Express so Task 5 can plug Hono's `streamSSE` in. Express routes adapt in the same commit; tests stay green.

**Files:**
- Modify: `packages/runtime/src/sse.ts`
- Modify: `packages/runtime/src/routes.ts` (the two SSE handlers only)

**Interfaces:**
- Consumes: Task 3's `appId` naming.
- Produces: `addClient(send: (payload: string) => void, appId?: string): () => void` — returns the remove function. `broadcast(event: string, data: unknown, appId?: string): void` unchanged (sse.test.ts calls it directly). The module-level singleton registry stays (roadmap note remains true).

- [ ] **Step 1: Rewrite `sse.ts`**

```ts
type Send = (payload: string) => void;

interface Client { send: Send; appId?: string }

const clients = new Set<Client>();

// A client with an appId receives only events broadcast for that app id.
// A client without one (the global /api/events channel) receives everything.
// Returns the remove function; the transport's close/abort callback calls it.
export function addClient(send: Send, appId?: string): () => void {
  const client: Client = { send, appId };
  clients.add(client);
  return () => clients.delete(client);
}

export function broadcast(event: string, data: unknown, appId?: string): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) {
    if (c.appId === undefined || c.appId === appId) c.send(payload);
  }
}
```

- [ ] **Step 2: Adapt the two Express SSE routes in `routes.ts`**

In both `/events` and `/apps/:appId/events` handlers, replace `addClient(res)` / `addClient(res, req.params.appId)` with:

```ts
    const remove = addClient((payload) => { res.write(payload); });
    res.on("close", remove);
```

(scoped variant passes `req.params.appId` as the second `addClient` argument).

- [ ] **Step 3: Run the SSE-touching suites**

```bash
pnpm --filter @lodekit/runtime test tests/sse.test.ts tests/kv-api.test.ts tests/watcher.test.ts
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(sse): registry holds a writer callback instead of an Express Response"
```

---

### Task 5: Hono migration — the runtime server cutover

The framework swap is atomic (routes, kv router, appHost, server boot switch together); the shipped suites are the failing-test harness mid-task and the acceptance gate at the end. Express leaves in this commit.

**Files:**
- Modify: `packages/runtime/package.json` (add `hono`, `@hono/node-server`, `@hono/zod-validator`; remove `express`, `@types/express`)
- Create: `packages/runtime/src/validation.ts`
- Modify: `packages/runtime/src/services/kv-store.ts` (router portion)
- Modify: `packages/runtime/src/routes.ts`
- Modify: `packages/runtime/src/appHost.ts`
- Modify: `packages/runtime/src/server.ts`
- Modify: `packages/runtime/tests/server-errors.test.ts` (create — onError + malformed JSON coverage)

**Interfaces:**
- Consumes: Task 4's `addClient(send, appId?) → remove`; Task 2's zod 4.
- Produces (Task 6 relies on these):
  - `kvRoutes` — module-level chained `Hono<KvEnv>` const; `export type KvRoutes = typeof kvRoutes`
  - `KvEnv = { Variables: { db: Database.Database; appId: string } }`
  - `withDb(cfg: Config): MiddlewareHandler<KvEnv>` — validates `:appId`, sets `c.var.db` / `c.var.appId`
  - `apiRoutes(cfg: Config)` — the chained `/api` sub-app
  - `createApp(cfg: Config): Hono` and `createServer(cfg: Config): Server` (Node `http.Server` via `createAdaptorServer` — tests keep calling `createServer(cfg).listen(0, cb)` unchanged)
  - `validationHook` — shared zValidator hook emitting `{ error }` 400s

- [ ] **Step 1: Swap dependencies**

In `packages/runtime/package.json` `dependencies`: remove `"express"`, add:

```json
    "hono": "^4.12.0",
    "@hono/node-server": "^2.0.0",
    "@hono/zod-validator": "^0.8.0",
```

Remove `"@types/express"` from `devDependencies`. Run `pnpm install` from the root.

- [ ] **Step 2: Confirm the installed `@hono/node-server` API surface**

`@hono/node-server` v2 is newer than this plan's reference knowledge. Before writing server code, check the installed package:

```bash
cat packages/runtime/node_modules/@hono/node-server/package.json | head -40
ls packages/runtime/node_modules/@hono/node-server/dist
```

Confirm the names used below: `createAdaptorServer` (returns an unlistened Node `http.Server`; the spec's `serve()` is this plus `.listen`) and the `@hono/node-server/serve-static` subpath export (`serveStatic`), including whether `serveStatic`'s `root` accepts absolute paths in v2. If names moved, use the v2 equivalents and keep the same shape: `createServer(cfg)` must return an unlistened Node `http.Server`.

- [ ] **Step 3: Create the shared validation hook — `src/validation.ts`**

```ts
import type { Context } from "hono";

// Shared zValidator hook: keep the shipped `{ error: string }` 400 shape
// (zValidator's default error response differs).
export function validationHook(
  result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } },
  c: Context
) {
  if (!result.success) {
    const issue = result.error?.issues[0];
    const where = issue?.path.join(".") ?? "";
    return c.json({ error: `invalid ${where || "request"}${issue ? `: ${issue.message}` : ""}` }, 400);
  }
}
```

(If zValidator's hook parameter types differ in the installed version, match its signature — the behavior is what matters: non-success → `c.json({ error }, 400)`.)

- [ ] **Step 4: Rewrite the router portion of `services/kv-store.ts`**

Storage functions (`getKv`, `ensureSchema`, `get`, `set`, `del`, `incr`, `list`, `getMany`, `setMany`, `sweep`, `sweepAll`, `sweepAllAndBroadcast`, `emit`, `Entry`, `KvError`, `CATALOG_NAME`) are untouched. Delete `kvRouter`, the `KvRequest` interface, `validKey`, `ttlOk`, `slugOf`, and the express imports. Add:

```ts
import { Hono, type MiddlewareHandler } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { validationHook } from "../validation.js";
```

(plus existing imports). Then:

```ts
export type KvEnv = { Variables: { db: Database.Database; appId: string } };

// Applied by the parent router on /apps/:appId/kv-store/* — validates the app id
// and sets the better-sqlite3 handle in context vars.
export function withDb(cfg: Config): MiddlewareHandler<KvEnv> {
  return async (c, next) => {
    const appId = c.req.param("appId");
    if (!appId || !isValidAppId(appId)) return c.json({ error: "invalid app id" }, 400);
    c.set("db", getKv(cfg.dataDir, appId));
    c.set("appId", appId);
    await next();
  };
}

// zod 4: z.number() rejects NaN/Infinity by default — the old Number.isFinite checks fold in.
const keySchema = z.string().min(1).max(512);
const keyParam = z.object({ key: keySchema });
const ttlSchema = z.number().positive().optional();
const listQuery = z.object({
  prefix: z.string().optional(),
  limit: z.coerce.number().optional(),
  cursor: z.string().optional(),
});
const incrBody = z.object({ key: keySchema, by: z.number().optional() });
const getManyBody = z.object({ keys: z.array(keySchema) });
const hasValue = { message: "missing value" };
const putBody = z.object({ value: z.unknown(), ttl: ttlSchema }).refine((b) => "value" in b, hasValue);
const setManyBody = z.object({
  entries: z.array(z.object({ key: keySchema, value: z.unknown() }).refine((e) => "value" in e, hasValue)),
  ttl: ttlSchema,
});

// Chained style is normative: it is what makes hc route-type inference work.
// onError preserves the shipped semantics: every thrown error in a kv route
// (KvError from incr included) maps to a 400 { error } — the 400-vs-500 split
// stays parked in roadmap.md.
export const kvRoutes = new Hono<KvEnv>()
  .onError((err, c) => c.json({ error: err instanceof Error ? err.message : String(err) }, 400))
  .get("/", zValidator("query", listQuery, validationHook), (c) => {
    const { prefix, limit, cursor } = c.req.valid("query");
    return c.json(list(c.var.db, { prefix, limit, cursor }));
  })
  .post("/incr", zValidator("json", incrBody, validationHook), (c) => {
    const { key, by } = c.req.valid("json");
    const value = incr(c.var.db, key, by);
    emit(c.var.appId, key, "set");
    return c.json({ value });
  })
  .post("/get-many", zValidator("json", getManyBody, validationHook), (c) => {
    return c.json({ entries: getMany(c.var.db, c.req.valid("json").keys) });
  })
  .post("/set-many", zValidator("json", setManyBody, validationHook), (c) => {
    const { entries, ttl } = c.req.valid("json");
    setMany(c.var.db, entries as { key: string; value: unknown }[], { ttl });
    for (const e of entries) emit(c.var.appId, e.key, "set");
    return c.json({ ok: true });
  })
  .get("/:key", zValidator("param", keyParam, validationHook), (c) => {
    const r = get(c.var.db, c.req.valid("param").key);
    if (!r.found) return c.json({ found: false as const });
    const { value, createdAt, updatedAt, expiresAt } = r.entry!;
    return c.json({ found: true as const, value, createdAt, updatedAt, expiresAt });
  })
  .put("/:key", zValidator("param", keyParam, validationHook), zValidator("json", putBody, validationHook), (c) => {
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");
    set(c.var.db, key, body.value, { ttl: body.ttl });
    emit(c.var.appId, key, "set");
    return c.json({ ok: true });
  })
  .delete("/:key", zValidator("param", keyParam, validationHook), (c) => {
    const { key } = c.req.valid("param");
    const deleted = del(c.var.db, key);
    if (deleted) emit(c.var.appId, key, "del");
    return c.json({ deleted });
  });

export type KvRoutes = typeof kvRoutes;
```

Route-order semantics carry over: `POST /incr` etc. are method-scoped, so a literal key named `incr` still works via GET/PUT/DELETE `/:key` (covered by the shipped kv-api test).

- [ ] **Step 5: Rewrite `routes.ts` as a chained Hono app**

```ts
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import type { Config } from "./config.js";
import { scanApps, isValidAppId } from "./registry.js";
import { scaffoldApp } from "./scaffold.js";
import { addClient } from "./sse.js";
import { kvRoutes, withDb, CATALOG_NAME } from "./services/kv-store.js";

// Holds the stream open until the client disconnects; the abort callback
// removes the client from the SSE registry.
function sseHandler(appId?: string) {
  return (c: Parameters<typeof streamSSE>[0]) =>
    streamSSE(c, async (stream) => {
      await stream.write(": connected\n\n");
      const remove = addClient((payload) => void stream.write(payload), appId);
      stream.onAbort(remove);
      await new Promise<void>((resolve) => stream.onAbort(resolve));
    });
}

export function apiRoutes(cfg: Config) {
  return new Hono()
    // Express's express.json() default (100 kb), preserved explicitly.
    .use(bodyLimit({ maxSize: 100 * 1024 }))
    .get("/apps", (c) => c.json(scanApps(cfg.appsDir)))
    .post("/apps", async (c) => {
      let body: { appId?: string; name?: string; description?: string; icon?: string } = {};
      try {
        body = await c.req.json();
      } catch {
        // empty or malformed body — falls through to the 400 below
      }
      const { appId, name, description, icon } = body ?? {};
      if (!isValidAppId(appId ?? "") || !name) {
        return c.json({ error: "invalid app id or missing name" }, 400);
      }
      return c.json(scaffoldApp(cfg, { appId: appId!, name, description, icon }), 201);
    })
    .use(`/apps/:appId/${CATALOG_NAME}/*`, withDb(cfg))
    .route(`/apps/:appId/${CATALOG_NAME}`, kvRoutes)
    .get("/events", (c) => sseHandler()(c))
    .get("/apps/:appId/events", (c) => {
      const appId = c.req.param("appId");
      if (!isValidAppId(appId)) return c.json({ error: "invalid app id" }, 400);
      return sseHandler(appId)(c);
    });
}
```

(If the `sseHandler` context-typing indirection fights inference, inline the `streamSSE` call in both routes instead — behavior over cleverness.)

- [ ] **Step 6: Rewrite `appHost.ts` as Hono middleware over `serveStatic`**

Keep the `page`/`buildingPage`/`errorPage` templates exactly as they are (post-Task-3 they read `.appId`). Replace the handler:

```ts
import fs from "node:fs";
import path from "node:path";
import type { MiddlewareHandler } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Config } from "./config.js";
import { isValidAppId } from "./registry.js";
import { getBuildState } from "./build.js";

export function appHost(cfg: Config): MiddlewareHandler {
  // serveStatic resolves root against process.cwd(); the URL path
  // (/<app-id>/<rest>) mirrors the cache layout, so no path rewrite is needed.
  const staticHandler = serveStatic({ root: path.relative(process.cwd(), cfg.cacheDir) });
  return async (c, next) => {
    // Raw (still percent-encoded) pathname — the decode/containment checks below
    // must see the encoded form, exactly as Express's req.path did.
    const reqPath = new URL(c.req.url).pathname;
    const segments = reqPath.split("/").filter(Boolean);
    const appId = segments[0];
    if (!appId || !isValidAppId(appId)) return next();
    if (!fs.existsSync(path.join(cfg.appsDir, appId, "manifest.json"))) return next();

    // Redirect /<app-id> -> /<app-id>/ so the app's relative asset URLs resolve under the app.
    if (segments.length === 1 && !reqPath.endsWith("/")) {
      return c.redirect(reqPath + "/", 301);
    }

    const state = getBuildState(appId);
    if (state?.status === "error") return c.html(errorPage(appId, state.message));

    const outDir = path.resolve(cfg.cacheDir, appId);
    if (!fs.existsSync(path.join(outDir, "index.html"))) return c.html(buildingPage(appId));

    let decoded: string;
    try {
      decoded = decodeURIComponent(reqPath);
    } catch (e) {
      if (e instanceof URIError) return c.body(null, 400);
      throw e;
    }
    const rest = decoded.split("/").filter(Boolean).slice(1).join("/") || "index.html";
    const filePath = path.resolve(outDir, rest);
    if (filePath !== outDir && !filePath.startsWith(outDir + path.sep)) {
      return c.body(null, 403);
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return c.body(null, 404);
    }
    return staticHandler(c, next);
  };
}
```

If the installed v2 `serveStatic` accepts an absolute `root`, pass `cfg.cacheDir` directly instead of the `path.relative` computation. The appHost suite (403/404/redirect/building/error) plus the e2e asset fetches are the gate.

- [ ] **Step 7: Rewrite `server.ts`**

Keep `escapeHtml` and `fallbackPage` unchanged.

```ts
import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createAdaptorServer } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Config } from "./config.js";
import { apiRoutes } from "./routes.js";
import { appHost } from "./appHost.js";
import { startWatcher } from "./watcher.js";
import { buildAll, buildDashboard, getDashboardState } from "./build.js";
import { every, stop } from "./scheduler.js";
import { sweepAllAndBroadcast } from "./services/kv-store.js";

export function createApp(cfg: Config): Hono {
  const dashOut = path.join(cfg.cacheDir, "_dashboard");
  return new Hono()
    .onError((err, c) => {
      if (err instanceof HTTPException) return err.getResponse(); // e.g. bodyLimit's 413
      if (err instanceof SyntaxError) return c.json({ error: "invalid JSON body" }, 400);
      // Uncaught route errors surface as Express's 500-with-message did — never crash.
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    })
    .route("/api", apiRoutes(cfg))
    .use("/_dashboard/*", serveStatic({ root: path.relative(process.cwd(), cfg.cacheDir) }))
    .get("/", (c) => {
      const state = getDashboardState();
      const index = path.join(dashOut, "index.html");
      if (state?.status === "error" || !fs.existsSync(index)) {
        return c.html(fallbackPage(state?.status === "error" ? state.message : undefined));
      }
      return c.html(fs.readFileSync(index, "utf8"));
    })
    .use("*", appHost(cfg));
}

// Returns the underlying (unlistened) Node http.Server — shutdown semantics and
// every fetch-against-listening-server test keep working unchanged.
export function createServer(cfg: Config): Server {
  return createAdaptorServer({ fetch: createApp(cfg).fetch }) as Server;
}

export async function start(cfg: Config): Promise<Server> {
  const server = createServer(cfg);
  await buildDashboard(cfg); // never throws; failures surface as the fallback page
  const watcher = startWatcher(cfg);
  every("kv-store-sweep", 60_000, sweepAllAndBroadcast);
  server.on("close", () => { void watcher.close(); stop("kv-store-sweep"); });
  server.listen(cfg.port, () => {
    console.log(`Lodekit running at ${cfg.baseUrl}`);
  });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  void buildAll(cfg);
  return server;
}
```

- [ ] **Step 8: Write the new error-handling tests — `tests/server-errors.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createAdaptorServer } from "@hono/node-server";
import { createApp } from "../src/server.js";
import type { Config } from "../src/config.js";

let root: string, server: Server, base: string;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-err-"));
  const cfg: Config = {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: path.join(root, ".cache"),
    port: 0,
    baseUrl: "http://lodekit.localhost:0",
  };
  const app = createApp(cfg).get("/boom", () => {
    throw new Error("kaboom");
  });
  await new Promise<void>((resolve) => {
    server = (createAdaptorServer({ fetch: app.fetch }) as Server).listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterEach(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("server error handling", () => {
  it("maps uncaught route errors to a 500 with the message (never crashes)", async () => {
    const res = await fetch(base + "/boom");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "kaboom" });
  });

  it("maps a malformed JSON body to a 400, not a 500", async () => {
    const res = await fetch(base + "/api/apps/app/kv-store/k", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 9: Run the full runtime + sdk suites**

```bash
pnpm --filter @lodekit/runtime test
pnpm --filter @lodekit/sdk test
```

Expected: all green, including the new `server-errors` file, all SSE tests (`: connected` preamble, scoping), appHost (301/403/404/building/error), kv-api validation matrix, dashboard serving/fallback, e2e, mcp integration. Debug failures with the systematic-debugging skill — do not paper over with test edits; the suites define the contract.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(runtime): migrate Express -> Hono (@hono/node-server, zod validators, streamSSE, serveStatic, onError)"
```

---

### Task 6: Typed RPC — `hc` as the SDK transport

**Files:**
- Modify: `packages/runtime/package.json` (add `exports` + `check` script)
- Modify: `packages/sdk/package.json` (deps + `check` script)
- Modify: `packages/sdk/src/client.ts`

**Interfaces:**
- Consumes: `KvRoutes` from Task 5, importable as `@lodekit/runtime/services/kv-store`.
- Produces: the SDK's seven REST ops (`get`, `set`, `del`, `has`, `incr`, `list`, `getMany`, `setMany` — `has` shares `get`'s route) implemented over `hc<KvRoutes>`. Public `Kv`/`KvEntry`/`KvChange`/`Collection`/`LodekitClient` types and `watch`/`collection` byte-identical in surface. Dependency edges: `hono` = SDK **dependency** (bundled into apps); `@lodekit/runtime` = SDK **devDependency** (type-only, erased at build). The resulting dev-edge package cycle with `runtime → sdk` is deliberate and recorded in spec §3.2.

- [ ] **Step 1: Give the runtime a package `exports` entry**

In `packages/runtime/package.json`, add at top level (after `"type"`):

```json
  "exports": {
    "./services/kv-store": "./src/services/kv-store.ts"
  },
```

and add to `scripts`: `"check": "tsc --noEmit"`.

- [ ] **Step 2: Wire the SDK manifest**

`packages/sdk/package.json` becomes:

```json
{
  "name": "@lodekit/sdk",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "check": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^4.12.0"
  },
  "devDependencies": {
    "@lodekit/runtime": "workspace:*",
    "@types/node": "^22.10.5",
    "typescript": "^5.7.3",
    "vitest": "^3.0.0"
  }
}
```

`@types/node` is needed because the type-only runtime import pulls node-flavored modules (`config.ts` uses `process.env`) into the SDK's checking program; also change `packages/sdk/tsconfig.json` `"types": []` to `"types": ["node"]`. Run `pnpm install` (root). pnpm tolerates the dev-edge cycle (a warning is fine).

- [ ] **Step 3: Reimplement the REST ops in `client.ts` over `hc`**

Keep the file's exported interfaces, `createClient` signature, `collection`, and `watch` untouched. Replace the `request`/`jsonInit` helpers and the seven op bodies:

```ts
import { hc } from "hono/client";
import type { ClientResponse } from "hono/client";
import type { KvRoutes } from "@lodekit/runtime/services/kv-store";
```

```ts
// Preserves the hand-written transport's error semantics around the hc calls:
// non-OK -> throw Error carrying the server's { error } message.
async function parse<T>(res: ClientResponse<T> | Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // non-JSON error body — keep statusText
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}
```

Inside `createClient`:

```ts
  const api = `${baseUrl}/api/apps/${appId}/kv-store`;
  // Any route/SDK mismatch (path, method, param, body shape) fails tsc at edit time.
  const rpc = hc<KvRoutes>(api);
  const key$ = rpc[":key"];

  type GetResponse<T> = { found: false } | { found: true; value: T };
```

and the ops (value-typed positions cast through the generic — the server stores `unknown`):

```ts
    async get<T>(key: string): Promise<T | undefined> {
      const r = (await parse(await key$.$get({ param: { key } }))) as GetResponse<T>;
      return r.found ? r.value : undefined;
    },
    async set(key, value, opts = {}) {
      await parse(await key$.$put({ param: { key }, json: { value, ...(opts.ttl != null ? { ttl: opts.ttl } : {}) } }));
    },
    async del(key) {
      return (await parse(await key$.$delete({ param: { key } }))).deleted;
    },
    async has(key) {
      return ((await parse(await key$.$get({ param: { key } }))) as { found: boolean }).found;
    },
    async incr(key, by) {
      return (await parse(await rpc.incr.$post({ json: by === undefined ? { key } : { key, by } }))).value;
    },
    async list(opts = {}) {
      const query: Record<string, string> = {};
      if (opts.prefix !== undefined) query.prefix = opts.prefix;
      if (opts.limit !== undefined) query.limit = String(opts.limit);
      if (opts.cursor !== undefined) query.cursor = opts.cursor;
      return (await parse(await rpc.index.$get({ query }))) as never;
    },
    async getMany(keys) {
      const r = await parse(await rpc["get-many"].$post({ json: { keys } }));
      return r.entries as never;
    },
    async setMany(entries, opts = {}) {
      await parse(await rpc["set-many"].$post({ json: { entries, ...(opts.ttl != null ? { ttl: opts.ttl } : {}) } }));
    },
```

- [ ] **Step 4: Run the SDK tests — the URL contract is asserted there**

```bash
pnpm --filter @lodekit/sdk test
```

The tests mock global `fetch` (hc uses it by default) and assert exact URLs, including encoding (`a b` → `…/kv-store/a%20b`, `expense:7` → `…/kv-store/expense%3A7`) and query strings (`?prefix=e%3A&limit=10&cursor=e%3A5`). If hc does not percent-encode path params in the installed version, encode at the call sites (`param: { key: encodeURIComponent(key) }`) — never in the tests.

- [ ] **Step 5: Typecheck both packages — the type edge IS the contract test**

```bash
pnpm --filter @lodekit/runtime check
pnpm --filter @lodekit/sdk check
```

Expected: clean. Then prove the drift protection works: temporarily rename the `/incr` route to `/increment` in `kv-store.ts`, re-run `pnpm --filter @lodekit/sdk check`, expect a type error at the `rpc.incr.$post` call, and revert.

- [ ] **Step 6: Full suite + commit**

```bash
pnpm test
git add -A
git commit -m "feat(sdk): typed RPC transport via hc<KvRoutes> behind the public Kv interface"
```

---

### Task 7: TanStack Query in the app stack (toolchain alias + expense-tracker)

**Files:**
- Modify: `packages/runtime/src/build.ts` (one alias line)
- Modify: `examples/apps/expense-tracker/src/main.tsx`
- Modify: `examples/apps/expense-tracker/src/App.tsx`

**Interfaces:**
- Consumes: `@tanstack/react-query` (already a runtime dependency for the dashboard).
- Produces: apps can `import { useQuery } from "@tanstack/react-query"` with no per-app dependencies; expense-tracker demonstrates the canonical live-data pattern (`kv.watch` → `invalidateQueries`) that slice 3's skill will teach. **expense-tracker deliberately stays single-page.** No SDK hooks.

- [ ] **Step 1: Add the toolchain alias**

In `packages/runtime/src/build.ts` `viteOptions` alias map, after `"@lodekit/sdk"`:

```ts
        "@tanstack/react-query": pkgDir("@tanstack/react-query"),
```

- [ ] **Step 2: Rewrite `expense-tracker/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { kv } from "@lodekit/sdk";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();
// Canonical live-data pattern: store change events invalidate queries; Query refetches.
kv.watch("", () => void queryClient.invalidateQueries({ queryKey: ["kv"] }));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
```

- [ ] **Step 3: Migrate `expense-tracker/src/App.tsx`'s data layer**

Replace the `useEffect`/`load()` state plumbing (keep the JSX below the data layer as-is, wired to the new names):

```tsx
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { kv } from "@lodekit/sdk";
// ...existing @lodekit/ui imports unchanged...

interface Expense {
  amount: number;
  category: string;
  note: string;
  created_at: string;
}

const expenses = kv.collection<Expense>("expense");

const CATEGORIES = ["Food", "Transport", "Bills", "Other"];

export default function App() {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [note, setNote] = useState("");

  const { data: currency = "USD" } = useQuery({
    queryKey: ["kv", "currency"],
    queryFn: async () => {
      const c = await kv.get<string>("currency");
      if (c === undefined) {
        await kv.set("currency", "USD");
        return "USD";
      }
      return c;
    },
  });

  const { data: rows = [] } = useQuery({
    queryKey: ["kv", "expenses"],
    queryFn: async () => (await expenses.all()).reverse(), // newest first
  });

  const addExpense = useMutation({
    mutationFn: (e: Expense) => expenses.add(e),
    onSuccess: () => {
      setAmount("");
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["kv", "expenses"] });
    },
  });

  function add() {
    const value = parseFloat(amount);
    if (!value) return;
    addExpense.mutate({
      amount: value,
      category,
      note,
      created_at: new Date().toISOString().slice(0, 10),
    });
  }

  const total = rows.reduce((sum, r) => sum + r.value.amount, 0);
  // ...JSX unchanged from here...
```

- [ ] **Step 4: Verify via e2e (builds the real app through the toolchain)**

```bash
pnpm --filter @lodekit/runtime test tests/e2e.test.ts
```

Expected: green (the expense-tracker bundle now includes react-query resolved from the shared install).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(stack): TanStack Query toolchain alias; expense-tracker migrates to the canonical watch->invalidate pattern"
```

---

### Task 8: appHost SPA fallback (the one new serving rule)

For a GET of an app sub-path whose last segment has **no file extension**, when the app is built and ready, serve the app's `index.html` (200). Asset-like paths keep 404-on-missing; building/error pages keep precedence.

**Files:**
- Test: `packages/runtime/tests/appHost.test.ts`
- Modify: `packages/runtime/src/appHost.ts`

**Interfaces:**
- Consumes: Task 5's Hono `appHost`.
- Produces: the serving rule Task 9's Router example depends on (deep links / refreshes at `/<app-id>/manage`).

- [ ] **Step 1: Write the failing tests (append to the appHost describe block)**

```ts
  it("serves index.html for an extension-less sub-path once built (SPA fallback)", async () => {
    writeApp("spa", `export default function App() { return <h1>spa</h1>; }`);
    await buildApp(cfg, "spa");
    const res = await fetch(base + "/spa/manage");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<div id="root">');
  }, 30000);

  it("asset-like sub-paths still 404 and the building page keeps precedence", async () => {
    writeApp("spa2", `export default function App() { return <h1>s2</h1>; }`);
    // Not built yet: extension-less sub-path shows the building page, not the shell.
    expect(await (await fetch(base + "/spa2/manage")).text()).toContain("Building");
    await buildApp(cfg, "spa2");
    expect((await fetch(base + "/spa2/missing.js")).status).toBe(404);
  }, 30000);
```

- [ ] **Step 2: Run them to verify they fail**

```bash
pnpm --filter @lodekit/runtime test tests/appHost.test.ts
```

Expected: FAIL — `/spa/manage` returns 404 today.

- [ ] **Step 3: Implement the rule**

In `appHost.ts`, replace the final not-found return:

```ts
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      // SPA fallback: a GET for an extension-less sub-path of a ready app serves
      // the app shell, so Router deep links and refreshes work. Asset-like paths
      // (with an extension) keep their 404; building/error pages take precedence above.
      const last = rest.split("/").pop() ?? "";
      if (c.req.method === "GET" && path.extname(last) === "") {
        return c.html(fs.readFileSync(path.join(outDir, "index.html"), "utf8"));
      }
      return c.body(null, 404);
    }
```

- [ ] **Step 4: Run the suite**

```bash
pnpm --filter @lodekit/runtime test tests/appHost.test.ts tests/e2e.test.ts
```

Expected: PASS (including the pre-existing 403/redirect cases).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(appHost): SPA fallback — extension-less GET on a ready app serves index.html"
```

---### Task 9: TanStack Router wiring (habit-tracker two-page example)

Code-based routes only — no `@tanstack/router-plugin`, no file-route conventions (slice 4).

**Files:**
- Modify: `packages/runtime/package.json` (add `@tanstack/react-router`)
- Modify: `packages/runtime/src/build.ts` (alias)
- Modify: `packages/sdk/src/index.ts` (export `appId`)
- Modify: `examples/apps/habit-tracker/src/main.tsx`
- Create: `examples/apps/habit-tracker/src/router.tsx`
- Create: `examples/apps/habit-tracker/src/lib.ts`
- Create: `examples/apps/habit-tracker/src/pages/Today.tsx`
- Create: `examples/apps/habit-tracker/src/pages/Manage.tsx`
- Delete: `examples/apps/habit-tracker/src/App.tsx`
- Test: `packages/runtime/tests/e2e.test.ts` (deep-link case)

**Interfaces:**
- Consumes: `appId` injected define (Task 3), SPA fallback (Task 8), Query alias (Task 7).
- Produces: SDK exports `appId: string` (the injected app id; `""` outside an app build) — the smallest sanctioned way for app code to derive `basepath`. This is a deliberate one-export addition to the SDK surface demanded by spec §5's "basepath derives from the injected app id"; record it in the spec decisions log (Task 10). habit-tracker = the two-page contract shape; expense-tracker stays the single-page reference.

- [ ] **Step 1: Toolchain + SDK wiring**

- `packages/runtime/package.json` dependencies: add `"@tanstack/react-router": "^1.170.0"`, then `pnpm install` (root).
- `packages/runtime/src/build.ts` alias map: add `"@tanstack/react-router": pkgDir("@tanstack/react-router"),`.
- `packages/sdk/src/index.ts`: add below `injectedAppId`:

```ts
/** The app's own app id, injected by the toolchain at build time ("" outside an app build). */
export const appId = injectedAppId;
```

- [ ] **Step 2: `habit-tracker/src/lib.ts` — shared data layer**

```ts
import { kv } from "@lodekit/sdk";

export interface Habit { name: string; icon: string; created_at: string }
export interface Checkin { habit_id: number; day: string }

export const habits = kv.collection<Habit>("habit");

export const today = () => new Date().toISOString().slice(0, 10);
export const dayOffset = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export function streak(days: string[]): number {
  const set = new Set(days);
  let count = 0;
  for (let n = set.has(today()) ? 0 : -1; ; n--) {
    if (set.has(dayOffset(n))) count++;
    else break;
  }
  return count;
}

export const habitsQuery = {
  queryKey: ["kv", "habits"] as const,
  queryFn: () => habits.all(),
};

export const checkinsQuery = {
  queryKey: ["kv", "checkins"] as const,
  queryFn: async (): Promise<Checkin[]> => {
    const { entries } = await kv.list({ prefix: "checkin:" });
    return entries.map((e) => {
      const [, id, day] = e.key.split(":"); // day is an ISO date — no ":" inside
      return { habit_id: Number(id), day };
    });
  },
};
```

- [ ] **Step 3: `habit-tracker/src/router.tsx` — code-based routes + basepath**

```tsx
import { createRootRoute, createRoute, createRouter, Link, Outlet } from "@tanstack/react-router";
import { appId } from "@lodekit/sdk";
import Today from "./pages/Today";
import Manage from "./pages/Manage";

const rootRoute = createRootRoute({
  component: () => (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Habit Tracker</h1>
        <nav className="flex gap-3">
          <Link to="/" className="hover:underline [&.active]:font-semibold">Today</Link>
          <Link to="/manage" className="hover:underline [&.active]:font-semibold">Manage</Link>
        </nav>
      </div>
      <Outlet />
    </main>
  ),
});

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Today });
const manageRoute = createRoute({ getParentRoute: () => rootRoute, path: "/manage", component: Manage });

// Real browser history under the app's own URL prefix: /<app-id>/.
export const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, manageRoute]),
  basepath: `/${appId}/`,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

- [ ] **Step 4: `habit-tracker/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { kv } from "@lodekit/sdk";
import { router } from "./router";
import "./index.css";

const queryClient = new QueryClient();
// Canonical live-data pattern: store change events invalidate queries; Query refetches.
kv.watch("", () => void queryClient.invalidateQueries({ queryKey: ["kv"] }));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
```

- [ ] **Step 5: `pages/Today.tsx` (today's check-ins) and `pages/Manage.tsx` (habit management); delete `App.tsx`**

`Today.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { kv } from "@lodekit/sdk";
import { Badge, Button, Card, CardContent } from "@lodekit/ui";
import { checkinsQuery, habitsQuery, streak, today } from "../lib";

export default function Today() {
  const queryClient = useQueryClient();
  const { data: habitRows = [] } = useQuery(habitsQuery);
  const { data: checkins = [] } = useQuery(checkinsQuery);

  const toggle = useMutation({
    mutationFn: async ({ habitId, done }: { habitId: number; done: boolean }) => {
      const key = `checkin:${habitId}:${today()}`;
      if (done) await kv.del(key);
      else await kv.set(key, true);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["kv", "checkins"] }),
  });

  const byHabit = new Map<number, string[]>();
  for (const c of checkins) byHabit.set(c.habit_id, [...(byHabit.get(c.habit_id) ?? []), c.day]);
  const doneToday = habitRows.filter(({ id }) => (byHabit.get(id) ?? []).includes(today())).length;

  return (
    <>
      <p className="text-muted-foreground">
        <strong>{habitRows.length ? `${doneToday} of ${habitRows.length} done today` : "No habits yet"}</strong>
      </p>
      <div className="mt-5 grid gap-3">
        {habitRows.map(({ id, value: h }) => {
          const days = byHabit.get(id) ?? [];
          const done = days.includes(today());
          const s = streak(days);
          return (
            <Card key={id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{h.icon || "✅"}</span>
                  <div>
                    <div><strong>{h.name}</strong></div>
                    <div className="text-muted-foreground">
                      {s > 0 ? <Badge variant="secondary">🔥 {s} {s === 1 ? "day" : "days"}</Badge> : "No streak yet"}
                    </div>
                  </div>
                </div>
                <Button variant={done ? "secondary" : "default"} onClick={() => toggle.mutate({ habitId: id, done })}>
                  {done ? "Undo" : "Done"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
```

`Manage.tsx`:

```tsx
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardContent, Input } from "@lodekit/ui";
import { habits, habitsQuery, today } from "../lib";

export default function Manage() {
  const queryClient = useQueryClient();
  const { data: habitRows = [] } = useQuery(habitsQuery);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["kv", "habits"] });

  const add = useMutation({
    mutationFn: () =>
      habits.add({ name: name.trim(), icon: icon.trim() || "✅", created_at: today() }),
    onSuccess: () => {
      setName("");
      setIcon("");
      invalidate();
    },
  });
  const remove = useMutation({ mutationFn: (id: number) => habits.remove(id), onSuccess: invalidate });

  return (
    <>
      <div className="my-5 flex flex-wrap gap-2">
        <Input className="w-16" placeholder="🎯" maxLength={2}
          value={icon} onChange={(e) => setIcon(e.target.value)} />
        <Input className="min-w-40 flex-1" placeholder="New habit (e.g. Meditate)"
          value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && add.mutate()} />
        <Button onClick={() => name.trim() && add.mutate()}>Add</Button>
      </div>
      <div className="grid gap-3">
        {habitRows.map(({ id, value: h }) => (
          <Card key={id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">{h.icon || "✅"}</span>
                <strong>{h.name}</strong>
              </div>
              <Button variant="ghost" onClick={() => remove.mutate(id)}>Remove</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
```

Delete `examples/apps/habit-tracker/src/App.tsx`.

- [ ] **Step 6: e2e deep-link test**

Append to the describe block in `tests/e2e.test.ts`:

```ts
  it("habit-tracker serves both pages; a deep-link fetch of /manage returns the app shell", async () => {
    for (const p of ["/habit-tracker/", "/habit-tracker/manage"]) {
      const html = await (await fetch(base + p)).text();
      expect(html).toContain('<div id="root">');
      expect(html).toContain("/assets/");
    }
  }, 45000);
```

- [ ] **Step 7: Run the gates**

```bash
pnpm --filter @lodekit/sdk check
pnpm --filter @lodekit/runtime test tests/e2e.test.ts
pnpm test
```

Expected: green.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(stack): TanStack Router wired (code-based) — habit-tracker two-page example with real history"
```

---

### Task 10: Docs, spec amendments, roadmap

**Files:**
- Modify: `CLAUDE.md`
- Modify: `context.md`
- Modify: `docs/specs/2026-07-02-product-overview-design.md`
- Modify: `docs/specs/2026-07-03-stack-refresh-design.md`
- Modify: `roadmap.md`

Historical slice-specs stay as written. `packages/skill/SKILL.md` stays (slice 3).

- [ ] **Step 1: `CLAUDE.md`**

In the Architecture section's `packages/runtime` bullet: "A single Node/Express process" → "A single Node/Hono process".

- [ ] **Step 2: `context.md`**

- Replace the **Slug** entry with:

```markdown
**App id**:
An app's URL-safe identity (`^[a-z0-9-]+$`). It equals the app's folder name and is simultaneously its URL path and its data namespace (`apps/<app-id>/`, `data/<app-id>/`). Normative forms: `appId` in code and JSON fields, `:appId` in route params, "app id" in prose. The toolchain injects it into each app's bundle as the canonical define `__LODEKIT_APP_ID__`.
_Avoid_: slug (the retired name), id, key, handle
```

- **Manifest** entry: "declaring its name, slug, icon" → "declaring its name, app id, icon".
- **Data tree** entry: "one namespace per slug" → "one namespace per app id".
- **Scoped API** entry: "namespaced by slug (`/api/apps/:slug/...`)" → "namespaced by app id (`/api/apps/:appId/...`)".
- Relationships: "An **App** is identified by its **Slug**; that same slug is its URL path and its data namespace." → "An **App** is identified by its **App id**; that same app id is its URL path and its data namespace."
- Grep `context.md` for any remaining `slug`/`Slug` and update.

- [ ] **Step 3: Umbrella spec amendments (`2026-07-02-product-overview-design.md`)**

- Invariant 4: append the clarifying sentence: "Type-only imports of runtime-exported types are permitted — they erase at build and create no runtime coupling; the invariant governs runtime behavior."
- Invariant 5: "the app's own slug" → "the app's own app id".
- §2.3 Today bullet: replace "Transport stays a hand-written HTTP facade (tRPC/Zod reconsideration is parked until a procedure surface exists to justify it)." with "Transport is Hono RPC — the implementations go through `hc<Routes>` behind the explicit public interface, so route/SDK drift fails `tsc` at edit time (stack-refresh slice, 2026-07-03; this resolved the parked tRPC/Zod reconsideration)."
- §4.1 SDK row: "tRPC/Zod transport revisit" → "transport revisit resolved (Hono RPC, 2026-07-03)".
- Grep the umbrella for other `slug` occurrences that *state the concept* (e.g. `createClient({baseUrl, slug})` in §2.3) and update; leave quoted history alone.

- [ ] **Step 4: Stack-refresh spec bookkeeping (`2026-07-03-stack-refresh-design.md`)**

- §1 Non-goals: "file-based routing and the multi-page app contract (deferred; this slice wires Router and proves it, nothing more)" → append "— slated as **slice 4**".
- §5: "the multi-page app contract remains deferred and gets its own slice" → "…and gets its own slice (**slice 4**)".
- §11 Decisions log: add a row: `| Basepath source | SDK exports the injected app id (\`appId\`) — a one-export SDK addition; apps derive \`basepath: /<app-id>/\` from it |`.

- [ ] **Step 5: `roadmap.md`**

- "Deferred from the build-pipeline slice" → the **tRPC + Zod** bullet: mark resolved: "**tRPC + Zod** — ~~reconsider…~~ **Resolved (2026-07-03, stack-refresh slice):** Hono RPC (`hc<Routes>`) + zod validators are the SDK↔runtime transport/validation layer."
- "Other deferred items" → **Multi-page apps + client-side routing** bullet becomes: "**Multi-page apps + file-based routing (slice 4)** — expand the app contract beyond single-page and adopt file-based route conventions. TanStack Router is already wired in the toolchain (stack-refresh slice, code-based routes; habit-tracker is the two-page example with an appHost SPA fallback); slice 4 designs the multi-page app contract on top."
- **SSE client registry** bullet: "keeps one module-level `clients` Set" stays true — update only the Express mention: "shared across all server instances" wording keeps; change "SSE integration tests must tear down client connections before `server.close()`" (still true) and note the registry now holds writer callbacks, not Express `Response` objects.
- **Slug-existence check** bullet (Security): re-word `slug` → `app id` / "kv router" wording to match the Hono `withDb` middleware (the fact is unchanged: any well-formed app id materializes a db without a registry check).
- **v0.1 skill rewrite scope** bullet: append "; the `appId` naming (slug retired), the Query `watch → invalidateQueries` live-data pattern, and the two contract shapes (single-page expense-tracker, two-page habit-tracker)".

- [ ] **Step 6: Verify language sweep + commit**

```bash
grep -rn "slug" CLAUDE.md context.md roadmap.md docs/specs/2026-07-02-product-overview-design.md
```

Expected: only deliberate mentions (retired-name notes, historical quotes). Then:

```bash
git add -A
git commit -m "docs: stack-refresh doc sweep — app-id language, invariant 4 type-only clarification, Hono RPC closes tRPC item, slice 4 marked"
```

---

### Task 11: Final verification + manual smoke

- [ ] **Step 1: Clean full-workspace verification**

```bash
pnpm install                                  # from repo root; should be a no-op
pnpm test                                     # runtime + sdk + manager, all green
pnpm --filter @lodekit/runtime check
pnpm --filter @lodekit/sdk check
pnpm --filter @lodekit/ui check
pnpm --filter @lodekit/mcp exec tsc --noEmit
pnpm --filter @lodekit/web build
```

Expected: everything green. Report actual output, not assumptions (verification-before-completion skill).

- [ ] **Step 2: Manual browser smoke (the known browser-coverage gap)**

```bash
pnpm dev
```

Then in a browser at `http://lodekit.localhost:7777`:

1. Dashboard loads; both apps listed with `ready` badges.
2. Dashboard store panel: open "Data" on habit-tracker; in another tab add a habit; the panel updates live (kv-store-change → invalidate).
3. habit-tracker: `/habit-tracker/` (Today) and `/habit-tracker/manage` both render; nav links switch with real history (back button works); **hard-refresh on `/habit-tracker/manage`** serves the app (SPA fallback).
4. expense-tracker: add an expense; total updates; reload persists.

- [ ] **Step 3: Finish the branch**

Use the superpowers:finishing-a-development-branch skill. Work stays on the `stack` worktree branch — integration into `master` is the person's call (no unattended fold-in).

---

## Self-review notes (spec coverage)

- §2.1 chained routers + zod validators + `{ error }` hook + `withDb` Env middleware + bodyLimit → Task 5.
- §2.2 `addClient(send, appId?)` + streamSSE + abort cleanup + unchanged scoping/`: connected` → Tasks 4–5.
- §2.3 serveStatic for dashboard/appHost, all appHost behaviors, `createServer` returning Node `http.Server` (via `createAdaptorServer`, which is `serve()` minus the listen) → Task 5.
- §3.1 runtime `exports` + `KvRoutes` → Tasks 5–6. §3.2 hc behind public `Kv`, dep edges + accepted dev cycle → Task 6 (plus `@types/node` in sdk, a consequence of the type-only edge, recorded there). §3.3 umbrella amendments → Task 10.
- §4 Query alias + both examples + canonical watch pattern → Tasks 7, 9. §5 Router wiring + basepath + expense stays single-page → Task 9; §5.1 SPA fallback → Task 8.
- §6 React 19 / zod 4 / MCP SDK bumps → Tasks 1–2; Express drop → Task 5; Vite/Tailwind/better-sqlite3 untouched.
- §7 rename sweep + manifest back-compat + define rename → Task 3; docs half → Task 10.
- §8 onError 500 mapping + test → Task 5. §9 test additions (SPA fallback, e2e deep link, tsc-as-contract-test, onError) → Tasks 5, 6, 8, 9; manual smoke → Task 11.
- §10 doc updates/retirements → Task 10. User directive: file-based routing + multi-page contract marked **slice 4** → Task 10.
