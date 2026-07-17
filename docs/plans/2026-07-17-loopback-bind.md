# Loopback Bind for the Engine Listener — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** The engine's HTTP listener binds IPv4 loopback (`127.0.0.1`) by default instead of all interfaces, with `LODEKIT_HOST` as an explicit escape hatch that warns when it exposes the unauthenticated API beyond loopback.

**Architecture:** `Config` gains an optional `host` field that `loadConfig()` always supplies (`LODEKIT_HOST ?? "127.0.0.1"`); `start()` passes it to `server.listen()` with a `?? "127.0.0.1"` fallback so an absent host fails closed to loopback. The field is optional purely so the ~37 engine test files that build `Config` literals inline keep type-checking untouched (`pnpm --filter @lodekit/engine check` runs `tsc --noEmit`).

**Tech Stack:** TypeScript (buildless, `tsx`), Node `http.Server` via `@hono/node-server`, vitest.

**Spec:** `docs/specs/2026-07-17-loopback-bind-design.md` (issue #87, SEC-01).

## Global Constraints

- The default bind MUST be `127.0.0.1`; anyone not setting `LODEKIT_HOST` gets loopback unconditionally (spec §Change).
- A non-loopback `LODEKIT_HOST` (not `127.0.0.1`, `::1`, or `localhost`) MUST produce a startup warning — the escape hatch works, but never silently (spec §Change).
- Do not touch the worker callback URL (`server.ts` `configureWorkers(...127.0.0.1...)`), `baseUrl`, the manager, or the MCP package — all already loopback (spec §Change).
- Surgical changes only: no reformatting, no adjacent cleanups.

---

### Task 1: Config `host` plumbing

**Files:**
- Modify: `packages/engine/src/config.ts` (interface at lines 4–14, `loadConfig()` return at lines 45–55)
- Test: `packages/engine/tests/config.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Config.host?: string` — always set by `loadConfig()` to `process.env.LODEKIT_HOST ?? "127.0.0.1"`. Task 2 reads `cfg.host`.

**Acceptance Criteria:**
- `loadConfig().host` is `"127.0.0.1"` when `LODEKIT_HOST` is unset.
- `loadConfig().host` echoes `LODEKIT_HOST` when set.
- `pnpm --filter @lodekit/engine check` passes with no other file modified.

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/config.test.ts`, add `LODEKIT_HOST` to the env reset in the existing `beforeEach` (lines 7–11):

```ts
  beforeEach(() => {
    delete process.env.LODEKIT_ROOT;
    delete process.env.LODEKIT_PORT;
    delete process.env.LODEKIT_CACHE_DIR;
    delete process.env.LODEKIT_HOST;
  });
```

Then add two tests before the closing `});` of the `describe` block:

```ts
  it("defaults host to IPv4 loopback", () => {
    expect(loadConfig().host).toBe("127.0.0.1");
  });

  it("honors LODEKIT_HOST", () => {
    process.env.LODEKIT_HOST = "0.0.0.0";
    expect(loadConfig().host).toBe("0.0.0.0");
    delete process.env.LODEKIT_HOST;
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @lodekit/engine exec vitest run tests/config.test.ts`
Expected: the two new tests FAIL (`loadConfig().host` is `undefined`); the pre-existing tests pass.

- [ ] **Step 3: Implement**

In `packages/engine/src/config.ts`, add to the `Config` interface after `port: number;`:

```ts
  // Bind host for the HTTP listener. Loopback by default (issue #87); LODEKIT_HOST is
  // the deliberate LAN-exposure escape hatch. Optional so test Config literals need not
  // set it — start() falls back to loopback when absent.
  host?: string;
```

In the `loadConfig()` return object, after `port,`:

```ts
    host: process.env.LODEKIT_HOST ?? "127.0.0.1",
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @lodekit/engine exec vitest run tests/config.test.ts`
Expected: PASS (all tests).

Run: `pnpm --filter @lodekit/engine check`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/config.ts packages/engine/tests/config.test.ts
git commit -m "feat(engine): loopback-by-default host in config, LODEKIT_HOST override (#87)"
```

---

### Task 2: Bind `start()` to the config host, warn on non-loopback, changelog

**Files:**
- Modify: `packages/engine/src/server.ts:232-236` (the `server.listen` call in `start()`)
- Create: `packages/engine/tests/loopback-bind.test.ts`
- Modify: `docs/changelog.md` (append under `## Fixed`)

**Interfaces:**
- Consumes: `Config.host?: string` from Task 1 (`cfg.host`, may be absent on hand-built test configs).
- Produces: nothing consumed downstream; `start(cfg)` now binds `cfg.host ?? "127.0.0.1"`.

**Acceptance Criteria:**
- A server started via `start(loadConfig())` with default env reports `address().address === "127.0.0.1"`.
- A non-loopback host (anything other than `127.0.0.1`, `::1`, `localhost`) logs a `warn` on the `host` logger at startup; loopback hosts do not.
- `docs/changelog.md` gains a `## Fixed` entry (append-only).
- Full engine suite passes.

- [ ] **Step 1: Write the failing bind test**

Create `packages/engine/tests/loopback-bind.test.ts` (setup/teardown mirrors `watcher.test.ts`, which also drives `start(loadConfig())` against an empty temp root):

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { loadConfig } from "../src/config.js";
import { start, watcherShutdown } from "../src/server.js";

let root: string, cache: string, server: Server;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-bind-root-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-bind-cache-"));
  process.env.LODEKIT_ROOT = root;
  process.env.LODEKIT_CACHE_DIR = cache;
  process.env.LODEKIT_STATE_DIR = path.join(root, "state");
  process.env.LODEKIT_PORT = "0";
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await watcherShutdown.get(server);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
  delete process.env.LODEKIT_ROOT;
  delete process.env.LODEKIT_CACHE_DIR;
  delete process.env.LODEKIT_STATE_DIR;
  delete process.env.LODEKIT_PORT;
});

describe("listener bind (issue #87)", () => {
  it("binds IPv4 loopback by default", async () => {
    server = await start(loadConfig());
    const addr = server.address();
    expect(typeof addr === "object" && addr ? addr.address : null).toBe("127.0.0.1");
  }, 30000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @lodekit/engine exec vitest run tests/loopback-bind.test.ts`
Expected: FAIL — the unbound listen reports the wildcard address (`"::"` or `"0.0.0.0"`), not `"127.0.0.1"`.

- [ ] **Step 3: Implement the bind + warning**

In `packages/engine/src/server.ts`, replace the `server.listen` call in `start()` (currently lines 232–236):

```ts
  const server = createServer(cfg);
  server.listen(cfg.port, () => {
    console.log(`Lodekit running at ${cfg.baseUrl}`);
    createLogger("host").info(`listening on ${cfg.baseUrl}`, { port: cfg.port });
  });
```

with:

```ts
  const server = createServer(cfg);
  // Loopback unless LODEKIT_HOST says otherwise (issue #87); an absent host fails
  // closed to loopback. The escape hatch works, but never silently.
  const host = cfg.host ?? "127.0.0.1";
  if (!["127.0.0.1", "::1", "localhost"].includes(host)) {
    createLogger("host").warn(
      `LODEKIT_HOST=${host} binds beyond loopback — the HTTP API is unauthenticated; anything that can reach this machine gets full read/write access to app data`
    );
  }
  server.listen(cfg.port, host, () => {
    console.log(`Lodekit running at ${cfg.baseUrl}`);
    createLogger("host").info(`listening on ${cfg.baseUrl}`, { port: cfg.port, host });
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @lodekit/engine exec vitest run tests/loopback-bind.test.ts`
Expected: PASS.

- [ ] **Step 5: Append the changelog entry**

Append to the end of the `## Fixed` section of `docs/changelog.md` (append-only — do not touch existing entries):

```markdown
- **The engine listens on loopback only** — the HTTP listener previously accepted
  connections from any device on the local network; it now binds `127.0.0.1` so
  only this machine can reach it. Deliberate wider exposure is still possible via
  `LODEKIT_HOST`, with a startup warning that the API is unauthenticated.
```

- [ ] **Step 6: Run the full engine suite and typecheck**

Run: `pnpm --filter @lodekit/engine test`
Expected: all tests pass (e2e/watcher tests already dial `127.0.0.1` explicitly).

Run: `pnpm --filter @lodekit/engine check`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/server.ts packages/engine/tests/loopback-bind.test.ts docs/changelog.md
git commit -m "fix(engine): bind HTTP listener to loopback by default (#87)"
```

---

## Notes

- **Warning-path test coverage:** the non-loopback warning is a single `includes()` gate on a log line; exercising it would mean intercepting the log store for trivial logic. Deliberately covered by review, not a test.
- **Out of scope** (spec §Out of scope): API auth token (#5/SEC-02), Host-header allowlist/CORS (SEC-03), app-to-app isolation (#8/SEC-04).
