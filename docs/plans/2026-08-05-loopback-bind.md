# Loopback Engine Listener — Recovery + Port-Free URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** Land issue #87's loopback bind (the engine's HTTP listener currently accepts connections from any device on the network) by recovering the already-approved 2026-07-17 implementation, and add today's follow-on requirement: `http://lodekit.localhost/` works with no port when port 80 is free — on by default, with `LODEKIT_PORT_FREE=0` as the opt-out.

**Architecture:** The 2026-07-17 session produced a spec, plan, implementation, and clean review for the loopback bind (epic `lk-kwl`, tasks `lk-1ct`/`lk-18n`) — but the commits (`6643f0b`, `9ce7a62`, `4354769`, `1663e97`) were never pushed and survive only as dangling objects in this clone. Task 1 cherry-picks them onto this branch verbatim: `Config.host` = `LODEKIT_HOST || "127.0.0.1"`, `start()` binds `cfg.host`, non-loopback values log a prominent unauthenticated-API warning. Task 2 adds a best-effort convenience listener on port 80 sharing the same Hono app, gated by `Config.portFree` (`LODEKIT_PORT_FREE`, default on). macOS quirk (verified on Darwin 25): Mojave's unprivileged low-port exemption covers **only the wildcard address** — `127.0.0.1:80`/`[::1]:80` get `EACCES` while `0.0.0.0:80` binds fine — so the listener tries the kernel loopback bind first (for platforms that allow it) and falls back to a wildcard bind whose non-loopback peers are destroyed on accept, before HTTP parses a byte. Skipped silently when 80 is taken, when the port is 0 (hermetic tests) or 80, when `LODEKIT_HOST` widened the bind, or when `LODEKIT_PORT_FREE` opts out.

**Tech Stack:** git cherry-pick, Node `http` via `@hono/node-server`'s `createAdaptorServer`, Hono, vitest.

## Global Constraints

- **Recovered engineer's calls stand** (spec `docs/specs/2026-07-17-loopback-bind-design.md`, in commit `6643f0b`): `LODEKIT_HOST` is a deliberate escape hatch (diverging from the issue's "non-overridable" wording — engineer's call, 2026-07-17), and the primary bind is **IPv4 loopback only** — no `::1` companion; clients resolving `lodekit.localhost` to `::1` fall back (Happy Eyeballs). Do not re-litigate either in code.
- App routing is path-based (`/<app-id>/…`); hostnames and ports never affect routing.
- Workers, manager, and MCP already dial loopback — untouched.
- `createServer(cfg)` stays exported and unchanged — ~20 engine test files depend on it.
- Tests boot `start()` with `LODEKIT_PORT=0` (`tests/e2e.test.ts`, `tests/loopback-bind.test.ts` once recovered, `integration-tests/tests/mcp.test.ts`); port 0 must never trigger the port-80 convenience bind.
- Surgical: `cfg.baseUrl`, the `Lodekit running at …` line, and `manager/src/paths.js` stay as-is.
- Changelog buffer (`docs/changelog.md`) is append-only, `**Bold name** — description` shape, written for a Lodekit user.
- Repo convention: no `Co-Authored-By` trailers on new commits (cherry-picked commits keep their original messages).

---

### Task 1: Recover the 2026-07-17 loopback bind (cherry-pick)

**Files (all arrive via cherry-pick):**
- Create: `docs/specs/2026-07-17-loopback-bind-design.md`, `docs/plans/2026-07-17-loopback-bind.md`, `packages/engine/tests/loopback-bind.test.ts`
- Modify: `packages/engine/src/config.ts` (adds `host?: string` from `LODEKIT_HOST`), `packages/engine/src/server.ts:232-237` (binds `cfg.host`, warns on non-loopback), `packages/engine/tests/config.test.ts` (3 additions), `docs/changelog.md` (`## Fixed` entry)

**Interfaces:**
- Consumes: dangling commits `6643f0b` (spec), `9ce7a62` (plan), `4354769` (config host), `1663e97` (bind + warn + tests + changelog), verified present via `git cat-file -t`.
- Produces: `Config.host?: string`; `start()` binding `cfg.host ?? "127.0.0.1"` with the warn-list `["127.0.0.1", "::1", "localhost"]`. Task 2 builds directly on this `start()` shape.

**Acceptance Criteria:**
- All four commits cherry-picked; the only permitted conflict resolution is appending the recovered changelog entry at the end of `## Fixed` (append-only rule).
- `loadConfig().host` is `"127.0.0.1"` by default and echoes `LODEKIT_HOST`.
- `start(loadConfig())` with default env reports `address().address === "127.0.0.1"`.
- Full engine suite passes.

- [ ] **Step 1: Cherry-pick the four commits**

```bash
git cherry-pick 6643f0b 9ce7a62 4354769 1663e97
```

Expected: `6643f0b`, `9ce7a62`, `4354769` apply clean. `1663e97` conflicts on `docs/changelog.md` (the buffer has grown since July — the old entry's context is gone).

- [ ] **Step 2: Resolve the changelog conflict by appending**

Keep every existing entry; append the recovered entry verbatim at the end of the `## Fixed` section:

```markdown
- **The engine listens on loopback only** — the HTTP listener previously accepted
  connections from any device on the local network; it now binds `127.0.0.1` so
  only this machine can reach it. Deliberate wider exposure is still possible via
  `LODEKIT_HOST`, with a startup warning that the API is unauthenticated.
```

```bash
git add docs/changelog.md
git cherry-pick --continue
```

- [ ] **Step 3: Run the recovered tests, then the engine suite**

Run: `pnpm --filter @lodekit/engine exec vitest run tests/config.test.ts tests/loopback-bind.test.ts`
Expected: PASS — `defaults host to IPv4 loopback`, `honors LODEKIT_HOST`, `binds IPv4 loopback by default`.

Run: `pnpm --filter @lodekit/engine test`
Expected: PASS (e2e boots `start()` on port 0 and fetches via `127.0.0.1` — unaffected).

- [ ] **Step 4: Verify the working tree matches the recovered design**

Run: `git log --oneline -4` (four recovered subjects) and `grep -n "LODEKIT_HOST" packages/engine/src/config.ts packages/engine/src/server.ts`
Expected: `config.ts` resolves `host`, `server.ts` warns on non-loopback and calls `server.listen(cfg.port, host, …)`.

---

### Task 2: Best-effort port-80 listener for a port-free URL (with opt-out)

**Files:**
- Modify: `packages/engine/src/config.ts` (`portFree?: boolean` from `LODEKIT_PORT_FREE`, default on), `packages/engine/src/server.ts` (export `tryListen`, gated convenience bind in `start()`, close wiring), `packages/engine/tests/config.test.ts` (default + opt-out tests), `docs/changelog.md` (append under `## New`)
- Test: `packages/engine/tests/try-listen.test.ts` (new — separate file so the recovered `loopback-bind.test.ts` and its module-level hooks stay untouched)

**Interfaces:**
- Consumes: Task 1's `start()` shape (`const host = cfg.host ?? "127.0.0.1"`, warn-list hoisted to `LOOPBACK_HOSTS`), `createApp(cfg)`, `createAdaptorServer`.
- Produces: `export function tryListen(app: Hono, host: string | undefined, port: number, loopbackOnly = false): Promise<Server | null>` — resolves the listening server, or `null` on any bind error (never rejects). `host === undefined` binds the wildcard; `loopbackOnly` attaches a `connection` guard **before `listen()`** that destroys any socket whose `remoteAddress` is not `127.0.0.1`/`::1`/`::ffff:127.0.0.1`. `Config.portFree?: boolean` — optional so test literals need not set it; absent means enabled.

**Acceptance Criteria:**
- `tryListen(app, "127.0.0.1", 0)` serves the app; `tryListen` on an occupied port resolves `null` without throwing.
- The `loopbackOnly` guard blocks a non-loopback peer on the same bind that serves it without the guard (proving the guard is the control), and admits `::1`.
- `loadConfig().portFree` defaults `true`; `LODEKIT_PORT_FREE=0|false|off` yields `false`.
- `start()` attempts port 80 only when `cfg.portFree !== false`, the effective host is loopback, and `cfg.port` is neither `0` nor `80` — kernel bind on `127.0.0.1:80` first, guarded wildcard fallback; success logs `Also at http://lodekit.localhost/` plus a structured host-logger line carrying the mode (`kernel-loopback` | `guarded-wildcard`); the listener closes with the primary server.
- Live curl matrix passes on the dev machine (`:7777` via `lodekit.localhost`/`127.0.0.1`, port-free URL when 80 is free, LAN IP refused on both ports).
- `## New` changelog entry appended (mentions the `LODEKIT_PORT_FREE=0` opt-out).

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/tests/try-listen.test.ts` — plain-Hono tests (no `start()`, fast): serves on requested host/port; occupied port resolves `null`; wildcard bind when host is `undefined`; `loopbackOnly` blocks a LAN peer (`it.skipIf(!lanIp)` so environments without a non-internal IPv4 report a **visible skip**, never a vacuous pass) while the same bind without the guard serves that peer; `loopbackOnly` admits `::1` (`it.skipIf(!hasV6Loopback)`). All remote fetches carry `AbortSignal.timeout(2000)`.

Add to `packages/engine/tests/config.test.ts`: `portFree` defaults `true`; `"0"`, `"false"`, `"OFF"` → `false`; `"1"` → `true`; `LODEKIT_PORT_FREE` cleared in the `beforeEach` env reset.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @lodekit/engine exec vitest run tests/try-listen.test.ts tests/config.test.ts`
Expected: FAIL — `tryListen` is not exported; `portFree` is undefined.

- [ ] **Step 3: Implement**

`config.ts` — field + resolution:

```ts
  // The best-effort :80 listener behind http://lodekit.localhost/ (no port). On by
  // default; LODEKIT_PORT_FREE=0|false|off frees port 80 for other tools. Optional so
  // test Config literals need not set it — start() treats absent as enabled.
  portFree?: boolean;
```

```ts
    portFree: !["0", "false", "off"].includes((process.env.LODEKIT_PORT_FREE ?? "").toLowerCase()),
```

`server.ts` — after the `createServer` export:

```ts
const LOOPBACK_HOSTS = ["127.0.0.1", "::1", "localhost"];

// Best-effort single listener sharing an app (exported for tests). Any bind error
// (port taken, EACCES) resolves null — a convenience URL is never a boot blocker.
// An undefined host binds the wildcard; loopbackOnly then destroys any
// non-loopback peer's socket on accept, before HTTP ever parses a byte, so the
// served surface stays loopback even on a wildcard bind. The guard attaches
// before listen() — no window where an unguarded socket is reachable.
export function tryListen(
  app: Hono,
  host: string | undefined,
  port: number,
  loopbackOnly = false
): Promise<Server | null> {
  return new Promise((resolve) => {
    const s = createAdaptorServer({ fetch: app.fetch }) as Server;
    if (loopbackOnly) {
      s.on("connection", (sock) => {
        const a = sock.remoteAddress;
        if (a !== "127.0.0.1" && a !== "::1" && a !== "::ffff:127.0.0.1") sock.destroy();
      });
    }
    s.once("error", () => resolve(null));
    s.listen(port, host, () => resolve(s));
  });
}
```

In `start()`: build the app once (`const app = createApp(cfg); const server = createAdaptorServer({ fetch: app.fetch }) as Server;` — `createServer` stays exported for tests), use `LOOPBACK_HOSTS` in the non-loopback warning, and after the listening await:

```ts
  let convenience: Server | null = null;
  if (cfg.portFree !== false && LOOPBACK_HOSTS.includes(host) && cfg.port !== 0 && cfg.port !== 80) {
    convenience = await tryListen(app, "127.0.0.1", 80);
    const mode = convenience ? "kernel-loopback" : "guarded-wildcard";
    convenience ??= await tryListen(app, undefined, 80, true);
    if (convenience) {
      console.log(`Also at http://lodekit.localhost/`);
      createLogger("host").info("port-80 convenience listener up", { mode });
    }
  }
```

In the `server.on("close", …)` handler, after the `stop(…)` calls: `convenience?.close();`

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @lodekit/engine exec vitest run tests/try-listen.test.ts tests/config.test.ts tests/loopback-bind.test.ts`
Expected: PASS.

Run: `pnpm --filter @lodekit/engine test`
Expected: PASS.

- [ ] **Step 5: Live verification against the real engine**

Run the engine (`LODEKIT_ROOT=$(pwd)/root pnpm --filter @lodekit/engine start` in the background), then:

```bash
curl -s http://lodekit.localhost:7777/api/apps   # 200 JSON — the must-keep URL
curl -s http://127.0.0.1:7777/api/apps           # 200 JSON
curl -s http://lodekit.localhost/api/apps        # 200 JSON if port 80 was free, else refused
LAN_IP=$(ipconfig getifaddr en0) && curl -s --max-time 2 "http://$LAN_IP:7777/api/apps" || echo "REFUSED (expected)"
curl -s --max-time 2 "http://$LAN_IP/api/apps" || echo "BLOCKED (expected)"   # the :80 guard
```

Expected: first three 200 (third only when 80 was free); the LAN probes print their expected markers. Stop the engine afterward. Kill any stale engine holding 7777 first — a leftover instance makes every probe hit old code.

- [ ] **Step 6: Append the changelog entry**

Append to the `## New` section of `docs/changelog.md`:

```markdown
- **No port needed** — when port 80 is free on your Mac, `http://lodekit.localhost/`
  opens Lodekit without the `:7777`. The classic URL keeps working either way, and
  the port-free door is loopback-only too — nothing on your network can use it.
  Prefer to keep port 80 for other tools? Start the engine with
  `LODEKIT_PORT_FREE=0` to turn the door off.
```

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/config.ts packages/engine/src/server.ts packages/engine/tests/try-listen.test.ts packages/engine/tests/config.test.ts docs/changelog.md
git commit -m "feat(engine): best-effort port-80 loopback listener for a port-free URL (#87) (lk-b2aj)"
```

---

## Verification (plan level)

- `pnpm --filter @lodekit/engine test` — full engine suite green.
- `pnpm test` — workspace suites green (integration tests boot `start()` with port 0).
- `pnpm e2e` — Playwright smoke: dashboard at `http://lodekit.localhost:7777/_dashboard/` renders with zero console errors (proves the must-keep URL end-to-end in a real browser).
- Live curl matrix (Task 2 Step 5) — proves the issue's threat-model fix on a real interface.
- Known gap (accepted): `start()`'s port-80 gating chain is live-verified only — a hermetic test cannot bind fixed port 80. The `tryListen` mechanics, the guard, and the `portFree` resolution are unit-tested.

## Bead bookkeeping

- Epic `lk-kwl` is the single epic for #87 (recovery honors its closed children `lk-1ct`/`lk-18n`, whose commits are what Task 1 lands). This session's duplicate epic/task (`lk-80hk`, `lk-eozf`) are closed as duplicates; `lk-b2aj` (port-80) is reparented under `lk-kwl` with a new recovery task (`lk-kwl.1`) as its blocker.

## Stress Test Results: loopback bind recovery + port-free URL

### Resolved Decisions
- **Recover vs re-implement**: cherry-pick. Pre-image contexts of all four dangling commits verified identical to the current tree (`server.ts:232-237`, `config.ts`, `config.test.ts`); only `docs/changelog.md` conflicts, resolution specified append-only.
- **`LODEKIT_HOST` escape hatch vs the issue's "non-overridable"**: keep the hatch — it is a recorded engineer's call (spec `6643f0b`, 2026-07-17) postdating the issue text; default fails closed to loopback and non-loopback values warn loudly. Flagged in the PR body for the person to re-confirm at review.
- **IPv4-only primary (no `::1` companion)**: keep, per the recovered spec. New supporting evidence: the platform pins Node 24.12.0 (`manager/scripts/prepare-bundle.mjs`), where Happy-Eyeballs fallback (`autoSelectFamily`) is on by default, so `lodekit.localhost` resolving `::1`-first still lands on `127.0.0.1`; browsers and curl fall back natively.
- **Port 80 despite the macOS bind quirk**: the plan's original "macOS ≥10.14 allows unprivileged low-port binds" assumption held only for the wildcard address (live-probed on Darwin 25: `127.0.0.1:80` → `EACCES`, `0.0.0.0:80` → OK). A naked wildcard would re-expose the engine, so `tryListen` gained `loopbackOnly`: kernel loopback attempt first, then a wildcard bind destroying non-loopback peers pre-HTTP, guard attached before `listen()`. Verified live (LAN blocked on `:80`, loopback 200) and by the guard-vs-no-guard test pair.
- **Port-80 opt-out at PR review (person's call, 2026-08-05)**: the always-running manager makes Lodekit a de-facto port-80 squatter (conflicts with Valet/Caddy/`docker -p 80`-style tools, surfacing as confusing bind failures in *those* tools), the wildcard bind can trigger a macOS Application Firewall prompt, and the feature initially shipped with no off-switch. Resolution: keep the feature, default on, add `LODEKIT_PORT_FREE` (`0|false|off` disables) as the env-var kill-switch — a proper platform setting is deferred as a bead.
- **Silent skip on occupied 80**: accepted for a best-effort nicety — the "Also at" log line only appears on success, and the changelog wording says "when port 80 is free".
- **Lifecycle**: convenience listener closed in the existing `server.on("close")` handler; null in all tests; process exit covers held keep-alive/SSE sockets in production.
- **Origin guards / client URLs**: `sec-fetch-site` checks are origin-relative and all dashboard/app URLs are relative; MCP `BASE` (`:7777`) unchanged. The port-free origin is a distinct browser origin (per-origin sessionStorage) — cosmetic only, app data is server-side.
- **Manager stdout**: `manager/src/main.js` pipes engine stdout to log files without parsing — the extra boot lines are benign.
- **Security (mandatory)**: default tightens (all interfaces → loopback); no control weakened; the port-80 listener is loopback-guarded and suppressed whenever `LODEKIT_HOST` widened the bind; DNS-rebinding hardening stays #5/#8 scope, unaffected (must later cover the port-free origin too).

### Changes Made
- Code-review round 1 (subagent): empty `LODEKIT_HOST=""` fell through `??` and would bind the wildcard — fixed to `||` with a regression test; guard tests' silent self-skip made visible via `it.skipIf`; `AbortSignal.timeout` on the control test; structured host-logger line with the bind mode; `::1` guard-admit test. Final verdict after re-review: **Ready to merge — Yes**.
- PR review (the person): `LODEKIT_PORT_FREE` opt-out added (see Resolved Decisions).

### Deferred / Parking Lot
- `LODEKIT_HOST=::1` breaks the worker loopback door (workers dial `127.0.0.1:<port>` hard-coded) — pre-existing edge of the recovered, approved design; filed as `lk-17zc` (`defer`).
- Promote the port-free toggle from env var to a platform setting (dashboard-visible) — filed as a `defer` bead.
- Documenting `LODEKIT_HOST`/`LODEKIT_PORT_FREE` and the listener behavior in the docs site — filed as `lk-9xy0` (`defer`).

### Confidence Assessment
- Overall: High
- Areas of concern: none blocking; the live curl matrix (Task 2 Step 5) is the final proof on real interfaces.
