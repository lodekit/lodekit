# Stack Refresh — Design

**Date:** 2026-07-03
**Status:** Draft, pending review
**Role:** Slice-spec inserted between slice 2 (kv-store v2, shipped `720715a`) and slice 3
(MCP + skill v0.1, held) of the umbrella spec's derivation order
(`docs/specs/2026-07-02-product-overview-design.md`, §4.2). Refreshes the stack before the
skill rewrite freezes it into agent guidance: Hono replaces Express (with typed RPC as the
SDK transport), React 19 and zod 4 workspace-wide, TanStack Query formalized in the app
stack, TanStack Router wired into the toolchain with one example, and the `slug` → `app-id`
rename.

## 1. Goals & scope

Every service added through 0.x lands on whatever HTTP framework, type-flow story, and
domain language exist when it ships. This slice settles all three now, while the surface is
one service and two example apps — so slice 3's skill teaches the stack that will survive.

The slice is **behavior-preserving** everywhere except the rename and the one new serving
rule (§6.2): same routes, same validation failures, same SSE events, same SDK public
surface. The existing vitest suites are the safety net and must pass essentially unchanged
(modulo renamed params/URLs).

**Non-goals:** MCP tool redesign and the skill rewrite (slice 3 — MCP gets mechanical
renames and a version bump only); file-based routing and the multi-page app contract
(deferred; this slice wires Router and proves it, nothing more — slated as **slice 4**); SDK-level React hooks
(the Query pattern lives in examples until the skill teaches it); Vite 7; `node:sqlite`;
scaffold-starter modernization (slice 3, with the skill).

## 2. Hono migration (runtime server)

`express` and `@types/express` leave the runtime; `hono`, `@hono/node-server`, and
`@hono/zod-validator` arrive. Current stable versions; no pins fixed here.

### 2.1 Composition

- **`routes.ts`** becomes a **chained** Hono app composing service sub-routers. Chained
  style (`new Hono().get(...).post(...)`) is a **normative constraint on every service
  module** — it is what makes route-type inference (§3) work.
- **`services/kv-store.ts`**'s `kvRouter` is rewritten in chained style. zod validators
  (via `@hono/zod-validator`) replace the hand-rolled checks — same rules (key non-empty
  and ≤ 512 chars, `ttl` positive number, `by` number, `incr` on a non-number → 400), same
  `{ error: string }` response shape. zValidator's default error response differs, so the
  routers use a shared custom hook that emits `{ error }` — behavior-preserving with the
  shipped suite.
- The `withDb` middleware becomes Hono middleware that validates the app id and sets the
  `better-sqlite3` handle in context vars (`c.var.db`), typed via the router's `Env`.
- **JSON body limit:** Express's `express.json()` default (100 kb) is preserved explicitly
  with Hono's `bodyLimit` middleware, so value-size bounds don't silently change.

### 2.2 SSE

`sse.ts` keeps its registry shape (module-level singleton — the roadmap note about
per-instance registries stays true and stays parked) but holds a writer abstraction instead
of an Express `Response`: `addClient(send, appId?)` where `send(payload)` writes one SSE
frame. Routes use Hono's `streamSSE`; the stream's abort/close callback removes the client.
Global `/api/events` and scoped `/api/apps/:appId/events` are unchanged in behavior: same
event types, same scoping rule (a scoped client sees only its app's events), same
`: connected` opening comment.

### 2.3 Static serving & server boot

- **Dashboard** (`/_dashboard`) and **app hosting** (`appHost.ts`) move to
  `serveStatic` from `@hono/node-server`, keeping every current behavior: the
  `/<app-id>` → `/<app-id>/` 301 redirect, building/error pages by build state, URI-decode
  400s, path-containment 403s, 404s. One new rule is added for Router support (§6.2).
- **`server.ts`** uses `serve()` from `@hono/node-server` and returns the underlying Node
  `http.Server` — shutdown semantics (`server.close()`, watcher teardown) and every
  fetch-against-listening-server test stay valid. The dashboard fallback page logic carries
  over unchanged.

## 3. Typed RPC — the SDK transport

Approach decision: the SDK's transport is Hono's inferred `hc` client (approach A —
edit-time drift prevention that scales to every future service), not a hand-written facade
with contract tests.

### 3.1 Server side

Each service module exports its router's type:

```ts
export const kvRoutes = new Hono<Env>().get(...).put(...).post(...);
export type KvRoutes = typeof kvRoutes;
```

`@lodekit/runtime` gains a `package.json` `exports` entry so consumers import these types
by package specifier (`@lodekit/runtime/services/kv-store`) — no cross-package relative
reach-ins (the smell `roadmap.md` already flags for the MCP test).

### 3.2 SDK side

- The SDK keeps its **explicit public `Kv` interface** exactly as shipped (`client.ts`) —
  self-documenting for the skill and for agents reading SDK source. The *implementations*
  of the seven REST ops go through `hc<KvRoutes>`, so any route/SDK mismatch fails `tsc`
  at edit time. The hand-written `request` helper's error semantics (throw `Error` carrying
  the server's `{ error }` message) are kept around the hc calls.
- `watch` (EventSource — not RPC) and the `collection` sugar stay hand-written, unchanged.
- **Dependency edges:** `hono` becomes an SDK **dependency** (the `hc` import is real code,
  a few kB, bundled into apps; the toolchain resolves it from Lodekit's `node_modules` like
  `react`). `@lodekit/runtime` becomes an SDK **devDependency** — a type-only edge, erased
  at build. This creates a package-manifest cycle with the existing `runtime → sdk`
  dependency; it is dev-edge-only, tolerated by pnpm, and accepted deliberately — this
  section is its record.

### 3.3 Umbrella amendment

Invariant 4 ("HTTP is the runtime's only door… no cross-package imports of runtime
internals") gains one clarifying sentence: **type-only imports of runtime-exported types
are permitted** — they erase at build and create no runtime coupling; the invariant governs
runtime behavior. The umbrella spec's §2.3 SDK status note is updated: the transport is
Hono RPC; the parked tRPC/Zod reconsideration is resolved by it (roadmap entry closed).

## 4. TanStack Query in the app stack

`@tanstack/react-query` (already a runtime dependency for the dashboard store panel) joins
the app-toolchain aliases in `build.ts`, making it importable by apps with no per-app
dependencies. Both example apps migrate their data layer to it:

- `QueryClientProvider` in `main.tsx`.
- `useQuery` over `kv`/collection reads; mutations invalidate.
- `kv.watch(prefix, ...)` → `queryClient.invalidateQueries(...)` as the **canonical
  live-data pattern** — the shape slice 3's skill will teach.

No SDK-level hooks or `@lodekit/sdk/react` entry: the pattern hardens in examples first.

## 5. TanStack Router wiring (habit-tracker)

`@tanstack/react-router` joins the toolchain aliases. **Code-based** routes only — no
`@tanstack/router-plugin` in the toolchain, no file-route conventions; the multi-page app
contract remains deferred and gets its own slice (**slice 4**).

- **habit-tracker** becomes the wiring example: a root route with nav + `Outlet`, `/`
  (today's check-ins) and `/manage` (habit management), real browser history with
  `createRouter({ routeTree, basepath })` where `basepath` derives from the injected app id
  (§7): `/<app-id>/`.
- **expense-tracker deliberately stays single-page** — the pair demonstrates both contract
  shapes.

### 5.1 SPA fallback in appHost

Deep links and refreshes at `/<app-id>/manage` require one new serving rule: for a GET of
an app sub-path whose last segment has **no file extension**, and when the app is built and
ready, `appHost` serves the app's `index.html` (200). Asset-like paths (with an extension)
keep their current 404-on-missing behavior; building/error pages keep precedence. Hash
history was considered and rejected — it avoids this rule but teaches a URL shape the
multi-page slice would immediately unteach.

## 6. Version bumps (workspace-wide)

| Bump | Where | Notes |
| --- | --- | --- |
| React 18 → 19 | runtime, `@lodekit/ui` (incl. peer range), `web`, examples via toolchain, `@types/react*` | Fix what breaks; no opportunistic refactors (e.g. no `forwardRef` sweeps). Radix/shadcn constellation in `@lodekit/ui` bumped as React 19 requires |
| zod 3 → 4 | runtime (validators, §2.1), mcp | Rides a mechanical `@modelcontextprotocol/sdk` bump — current SDK versions accept zod 4 natively (Standard Schema). `registerTool` migration stays slice 3 |
| Express 4 → Hono | runtime | §2; `@types/express` dropped |
| — | Vite 6, Tailwind 4, better-sqlite3 | Explicitly untouched |

The manager payload picks all of this up via `pnpm deploy` at its next `make`; nothing
native is added, so the pinned-Node/ABI story is unaffected.

## 7. `slug` → `app-id` rename

The identifier has outgrown its name — it is the app's identity across URLs, data
namespace, SSE scoping, MCP params, and the manifest. **Pure terminology rename:** it
remains the human-chosen, folder-name-doubling, URL-safe string (`^[a-z0-9-]+$`,
`apps/<app-id>/`, `data/<app-id>/`). No generated or opaque IDs.

Normative forms: **`appId`** in code and JSON fields, **`:appId`** in route params,
**app id** in prose (`app-id` where an identifier-ish form is needed, e.g. this spec's
title and file names).

Sweep:

- Runtime: `isValidSlug` → `isValidAppId`; route mounts `/api/apps/:appId/…`; SSE scoping
  param; registry/scaffold/build internals; the build-time define
  `__LODEKIT_SLUG__` → `__LODEKIT_APP_ID__` (runtime `build.ts` + SDK `index.ts`).
- SDK: `createClient({ baseUrl, appId })`.
- Global SSE channel events: the `slug` field becomes `appId` (dashboard consumer updated
  in the same change).
- MCP: tool parameter renames in place (`slug` → `appId` in the zod shapes and
  `client.ts` helpers). Tool *redesign* stays slice 3.
- **Manifest:** scaffold writes `appId`; the registry reads `appId ?? slug` — one line of
  back-compat so pre-rename apps in a real Lodekit root keep working. Examples'
  `lodekit.json` files move to `appId`.
- Docs: `context.md`'s **Slug** entry becomes **App id** (same format rules); `slug` joins
  the avoid list; the "An App is identified by its Slug" invariant sentence and the
  Manifest/Data-tree/scoped-API entries are updated. Umbrella spec and `CLAUDE.md`
  occurrences updated where they state the concept (not in historical slice-specs, which
  stay as written).

## 8. Error handling

Carried over, not redesigned: trust-boundary validation per §2.1 with `{ error }` 400s;
failures surface, never crash (umbrella invariant 8); SDK throws `Error` with the server's
message; `watch` reconnect via EventSource native retry; scheduler/sweep semantics
untouched. The Hono error handler (`app.onError`) maps uncaught route errors to the same
500-with-message behavior Express provided, covered by a test.

## 9. Testing

The shipped suites (api, kv-api, kv-store, sse, appHost, scaffold, registry, e2e, mcp
integration, dashboard) drive HTTP against a listening server and are the migration's
acceptance harness — green with only renamed params/URLs and boot-helper adjustments.
Additions:

- **appHost:** SPA-fallback cases — extension-less sub-path serves `index.html` when
  ready; asset-like path still 404s; building/error precedence kept.
- **e2e:** habit-tracker's `/` and `/manage` both serve; deep-link fetch of `/manage`
  returns the app shell.
- **Types:** workspace `tsc` (`pnpm -r exec tsc --noEmit` or the packages' existing
  typecheck paths) proves the hc wiring — the type edge *is* the contract test.
- **onError:** one test for §8's uncaught-error mapping.

Browser-level coverage remains the known roadmap gap; the slice ends with a manual smoke of
both example apps (habit-tracker on both pages, refresh on `/manage`) and the dashboard
store panel's liveness.

## 10. Doc updates & retirements

- **Deleted:** `express`, `@types/express` from the runtime.
- **`context.md`:** the App id rename (§7); note the canonical define `__LODEKIT_APP_ID__`.
- **Umbrella spec:** invariant 4 type-only clarification; §2.3 transport note (§3.3);
  `slug` wording where it states the concept.
- **`roadmap.md`:** close the tRPC/Zod reconsideration (resolved by Hono RPC); note
  TanStack Router is wired in the toolchain while the multi-page contract remains parked;
  re-word the SSE-registry note if the §2.2 rewrite changes its facts (it doesn't remove
  the singleton).
- **`CLAUDE.md`:** the architecture line "single Node/Express process" → Hono.

## 11. Decisions log

| Decision | Outcome |
| --- | --- |
| HTTP framework | Hono (`@hono/node-server`); Express retired workspace-wide |
| SDK typing | Approach A — `hc<Routes>` transport behind the explicit public `Kv` interface; type-only runtime import; dev-edge package cycle accepted and documented |
| Invariant 4 | Amended: type-only imports permitted; HTTP-only governs runtime behavior |
| tRPC/Zod parked item | Closed — Hono RPC + zod validators are the transport/validation layer |
| Query formalization | Toolchain alias + example-app migration only; no SDK hooks yet |
| Router scope | Code-based wiring in habit-tracker; file-based routing and the multi-page contract stay deferred |
| Router history | Real browser history + appHost SPA fallback; hash history rejected |
| Example split | habit-tracker two-page, expense-tracker single-page reference |
| React 19 / zod 4 | Workspace-wide; MCP SDK bumped mechanically, `registerTool` stays slice 3 |
| `slug` → `app-id` | Pure terminology rename; manifest written as `appId`, read `appId ?? slug` for back-compat |
| Basepath source | SDK exports the injected app id (`appId`) — a one-export SDK addition; apps derive `basepath: /<app-id>/` from it |
| App asset base | Apps build with Vite base `/<app-id>/` (was `/`) — pre-existing defect (root-absolute `/assets/*` 404'd in the browser) made load-bearing by §5's deep links; fixed at final review |
