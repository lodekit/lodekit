# Engine Rename (PR 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** Ship PR 3 of the events spec — after it, "runtime" is not a Lodekit word: the docs site and steering/skill prose say **engine**, and the per-subsystem `taskEngine.ts` / `gatewayEngine.ts` become `taskExecutor.ts` / `gatewayExecutor.ts` so "engine" only ever names the whole process.

**Architecture:** Two independent mechanical tasks. Task 1 renames two files and four exported symbols with all their reference sites (pure refactor, no behavior change — the existing suite is the safety net). Task 2 is a rules-driven prose sweep over 20 docs-site pages plus `AGENTS.md`, `packages/skill/SKILL.md`, and `root/README.md`, gated by a deterministic residual-grep check and the docs-site build.

**Tech Stack:** git mv + exact string edits; vitest + tsc (Task 1); Astro/Starlight build (Task 2).

**Spec:** `docs/specs/2026-07-16-events-canonical-model-design.md` §8 (tiers 1–2), §9 (PR 3 slice). PR title (load-bearing, squash-merge): `refactor(runtime): engine rename — docs site + code identifiers`.

## Global Constraints

- **"Runtime" survives only as:** (a) generic English "at runtime" (compile-time vs run-time); (b) on-disk artifact names the docs describe truthfully (`runtime.pid`, `runtime-YYYYMMDD.log`); (c) package/path specifiers `@lodekit/runtime`, `packages/runtime` (those are PR 4, spec §8 tier 3); (d) historical records (the released changelog page, dated specs/plans under `docs/specs/`+`docs/plans/`, `docs/decisions/` ADRs — never rewritten).
- **No wire/stored/behavioral values change.** Log source strings, event fields, HTTP paths, env vars, file names on disk all stay — this PR renames identifiers and prose only. (log-store's `_platform` sentinel and `emitLog` sources are the separate lk-rl0 slice.)
- "Engine" in prose is lowercase mid-sentence ("the engine"), like "the dashboard" / "the manager"; capitalized as a glossary/canon term heading.
- `CLAUDE.md` is a committed symlink to `AGENTS.md` — edit `AGENTS.md` only, never diverge them.
- No changelog-buffer entry: internal work and docs rewording append nothing (`docs/changelog.md` rules; spec §11 assigns entries to PRs 1–2 only).
- No new dependencies; commits carry bead IDs; conventional prefixes.

**Decisions taken in planning** (review these — each is a judgment call the spec left open):

1. **Scope includes `packages/skill/SKILL.md` and `root/README.md`.** The spec's tier-1 list names CONTEXT.md/AGENTS.md/docs-site, but both files use "runtime" as the product term and the spec's intent is "after this spec, 'runtime' is not a Lodekit word." Small (4 + 2 occurrences).
2. **`web/docs/.../changelog.md` is untouched** — it is the released 0.1.0 record; rewriting history contradicts the dated-snapshot rule.
3. **Stale envelope wording in swept pages gets corrected, not just renamed.** `reference/mcp-tools.mdx` documents the pre-PR-1 `lodekit_events` params (`_platform` sentinel, `kv-store-change`) and `sdk/events.mdx` says `ns`/`source` — both died in PR #98. Polishing "runtime"→"engine" around wrong facts would be worse than the typo; the sweep updates those lines to the shipped vocabulary. (`lodekit_logs`' `_platform` sentinel is still real — its wording updates, the sentinel stays.)
4. **Taglines** ("a local, self-hosted runtime where you…") recast to **platform**: CONTEXT.md canon defines the Platform as the collection running on the person's machine, which is what the tagline gestures at; "engine" would be too narrow there.
5. **Symbol renames:** `initTaskEngine`→`initTaskExecutor`, `EngineDeps`→`ExecutorDeps`, `initGatewayEngine`→`initGatewayExecutor`, `resetGatewayEngineForTest`→`resetGatewayExecutorForTest`. All other exports carry no "Engine" and keep their names. Test files rename in kind (`task-engine.test.ts`→`task-executor.test.ts`, `gateway-engine.test.ts`→`gateway-executor.test.ts`).

## File Structure

| File | Change |
| --- | --- |
| `packages/runtime/src/taskEngine.ts` | → `taskExecutor.ts` (git mv + symbol renames) |
| `packages/runtime/src/gatewayEngine.ts` | → `gatewayExecutor.ts` (git mv + symbol renames) |
| `packages/runtime/tests/task-engine.test.ts` | → `task-executor.test.ts` |
| `packages/runtime/tests/gateway-engine.test.ts` | → `gateway-executor.test.ts` |
| `packages/runtime/src/{server,watcher,gatewayOauth,gatewaysStore}.ts`, `src/services/gateways.ts`, `tests/{gateway-oauth,gateways-api,tasks-store}.test.ts` | import/reference updates |
| 20 docs pages under `web/docs/src/content/docs/` | prose sweep (inventory in Task 2) |
| `AGENTS.md`, `packages/skill/SKILL.md`, `root/README.md` | prose sweep remainder |

Task 1 and Task 2 touch disjoint files — no dependency between them.

---

### Task 1: Tier 2 — `taskExecutor.ts` / `gatewayExecutor.ts`

**Files:**
- Rename: `packages/runtime/src/taskEngine.ts` → `packages/runtime/src/taskExecutor.ts`
- Rename: `packages/runtime/src/gatewayEngine.ts` → `packages/runtime/src/gatewayExecutor.ts`
- Rename: `packages/runtime/tests/task-engine.test.ts` → `packages/runtime/tests/task-executor.test.ts`
- Rename: `packages/runtime/tests/gateway-engine.test.ts` → `packages/runtime/tests/gateway-executor.test.ts`
- Modify: `packages/runtime/src/server.ts:27,33,183,196`; `packages/runtime/src/watcher.ts:8`; `packages/runtime/src/gatewayOauth.ts:10`; `packages/runtime/src/services/gateways.ts:27`; `packages/runtime/src/gatewaysStore.ts:8` (comment); `packages/runtime/tests/gateway-oauth.test.ts:18-19,83,89`; `packages/runtime/tests/gateways-api.test.ts:13,67,83`; `packages/runtime/tests/tasks-store.test.ts:23` (comment)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (post-rename public surface — nothing else changes):
  ```ts
  // taskExecutor.ts
  export interface ExecutorDeps { /* fields unchanged */ }
  export function initTaskExecutor(config: Config, overrides: Partial<ExecutorDeps> = {}): void
  // registerManifest, evictApp, recoverInterruptedRuns, dispatchTasks — unchanged names
  // gatewayExecutor.ts
  export function initGatewayExecutor(cfg: Config): void
  export function resetGatewayExecutorForTest(): void
  // GatewayFailReason, GatewayRequestError, REASON_STATUS, GatewayRequestDescriptor,
  // GatewayResponseEnvelope, _setOauthTokenProvider, setGatewayTuningForTest,
  // getConnectionHealth, clearConnectionHealth, executeGatewayRequest — unchanged names
  ```

**Acceptance Criteria:**
- Zero remaining references to `taskEngine`, `gatewayEngine`, `initTaskEngine`, `initGatewayEngine`, `EngineDeps`, `resetGatewayEngineForTest` anywhere under `packages/` and `manager/` (excluding `node_modules` and dated docs).
- No behavior, wire, or stored value changes: `emitLog` source strings, event emission, HTTP surface all byte-identical.
- Inside the two renamed files, comments/log prose that used "engine" for this per-subsystem machinery read "executor" (the files are touched — opportunistic per spec §8 tier 2); "Engine" meaning the whole process stays.
- `pnpm --filter @lodekit/runtime check` clean; full `pnpm --filter @lodekit/runtime test` green.

- [ ] **Step 1: git mv all four files**

```bash
git mv packages/runtime/src/taskEngine.ts packages/runtime/src/taskExecutor.ts
git mv packages/runtime/src/gatewayEngine.ts packages/runtime/src/gatewayExecutor.ts
git mv packages/runtime/tests/task-engine.test.ts packages/runtime/tests/task-executor.test.ts
git mv packages/runtime/tests/gateway-engine.test.ts packages/runtime/tests/gateway-executor.test.ts
```

- [ ] **Step 2: rename the four symbols and all reference sites**

Complete reference inventory (verified by grep at planning time — after editing, the residual grep in Step 4 is the authority):

| Old | New | Sites |
| --- | --- | --- |
| `initTaskEngine` | `initTaskExecutor` | `taskExecutor.ts:50`, `server.ts:33,196`, `task-executor.test.ts:6,51,184` |
| `EngineDeps` | `ExecutorDeps` | `taskExecutor.ts:31,38,42,50` |
| `initGatewayEngine` | `initGatewayExecutor` | `gatewayExecutor.ts:83`, `server.ts:27,183`, `gateway-executor.test.ts:9,74`, `gateway-oauth.test.ts:18,83`, `gateways-api.test.ts:13,67` |
| `resetGatewayEngineForTest` | `resetGatewayExecutorForTest` | `gatewayExecutor.ts:91`, `gateway-executor.test.ts:9,78`, `gateway-oauth.test.ts:18,89`, `gateways-api.test.ts:13,83` |
| module path `./taskEngine.js` / `../src/taskEngine.js` | `./taskExecutor.js` / `../src/taskExecutor.js` | `server.ts:33`, `watcher.ts:8`, `task-executor.test.ts:6` |
| module path `./gatewayEngine.js` / `../gatewayEngine.js` / `../src/gatewayEngine.js` | `…gatewayExecutor.js` | `server.ts:27`, `gatewayOauth.ts:10`, `services/gateways.ts:27`, `gateway-executor.test.ts:11`, `gateway-oauth.test.ts:19`, `gateways-api.test.ts:13` |
| comment `(gatewayEngine.ts)` | `(gatewayExecutor.ts)` | `gatewaysStore.ts:8` |
| comment `taskEngine's policyFor` | `taskExecutor's policyFor` | `tasks-store.test.ts:23` |

Then, inside `taskExecutor.ts` and `gatewayExecutor.ts` only, update comments/log **prose** where "engine" means this subsystem (e.g. a header comment like "the task engine" → "the task executor"). Do NOT touch `emitLog(...)` source-string arguments or any other runtime string values.

- [ ] **Step 3: typecheck**

Run: `pnpm --filter @lodekit/runtime check`
Expected: clean (no output). A missed reference shows up here as TS2305/TS2307.

- [ ] **Step 4: residual grep gate**

```bash
grep -rn "taskEngine\|gatewayEngine\|EngineDeps\|initTaskEngine\|initGatewayEngine\|resetGatewayEngineForTest" \
  packages/ manager/ --include='*.ts' --include='*.tsx' --include='*.json' | grep -v node_modules
```

Expected: no output.

- [ ] **Step 5: full runtime suite**

Run: `pnpm --filter @lodekit/runtime test`
Expected: all files/tests pass (renamed test files run under their new names; count unchanged).

- [ ] **Step 6: Commit**

```bash
git add -A packages/runtime
git commit -m "refactor(runtime): taskEngine/gatewayEngine -> taskExecutor/gatewayExecutor (lk-jbb)"
```

---

### Task 2: Tier 1 — docs-site + steering/skill prose sweep

**Files:**
- Modify (docs site, 20 pages — `changelog.md` excluded per Decision 2):
  `web/docs/src/content/docs/` → `start/what-is-lodekit.mdx`, `start/how-lodekit-works.mdx`, `guide/manager.mdx`, `build/app-anatomy.mdx`, `build/data-and-server-functions.mdx`, `build/the-stack.mdx`, `sdk/overview.mdx`, `sdk/db.mdx`, `sdk/events.mdx`, `sdk/gateways.mdx`, `sdk/tasks.mdx`, `services/overview.mdx`, `services/file-store.mdx`, `services/gateways.mdx`, `services/settings.mdx`, `services/tasks.mdx`, `reference/file-locations.mdx`, `reference/glossary.mdx`, `reference/manifest.mdx`, `reference/mcp-tools.mdx`
- Modify: `AGENTS.md` (lines 3, 57, 62, 67, 138), `packages/skill/SKILL.md` (lines 56, 218, 219, 275), `root/README.md` (lines 3, 18)

**Interfaces:** none consumed/produced — prose only.

**Acceptance Criteria:**
- Product-term "runtime" is gone from all listed files; only the Global-Constraints residual classes remain (generic "at runtime", `runtime.pid` / `runtime-YYYYMMDD.log` artifact names, `@lodekit/runtime` / `packages/runtime` specifiers).
- Glossary: `### Engine` carries the canon definition; `### runtime` becomes a one-line retired-term pointer.
- `reference/mcp-tools.mdx` `lodekit_events` params match the shipped tool (`app`/`kind`/`component`/`type`/`since`/`after`/`limit`; no `_platform` sentinel; fact-type example); `sdk/events.mdx` describes `app`/`kind`/`component` stamping (no `ns`/`source`).
- `pnpm --filter @lodekit/web-docs build` succeeds; the residual grep gate output matches the expected allowlist exactly.

- [ ] **Step 1: apply the sweep rules**

Normative rules, in precedence order:

1. **Leave untouched:** `at runtime` / `at run time` (generic English — known sites: `build/the-stack.mdx:19`, `services/settings.mdx:28`, `sdk/gateways.mdx:251`, `SKILL.md:117,167`, glossary kv entry); literal artifact names `runtime.pid`, `runtime-YYYYMMDD.log` (`reference/file-locations.mdx` table cells); `@lodekit/runtime` and `packages/runtime` specifiers anywhere.
2. **`the runtime` (product term) → `the engine`** — the default rewrite for every other occurrence, adjusting articles/possessives (`the runtime's own records` → `the engine's own records`, `runtime restart` → `engine restart`, `runtime origin` → `engine origin`, `manager, runtime, dashboard` → `manager, engine, dashboard`).
3. **Taglines → platform** (Decision 4), exact new text:
   - `start/what-is-lodekit.mdx:3` (frontmatter description) and `:6` (body): `A local, self-hosted platform where you — working with an AI coding agent — build and run your own personal web apps.` / `Lodekit is a local, self-hosted platform where you — working with an AI coding …` (keep the sentence's existing tail verbatim).
   - `AGENTS.md:3`: `lodekit is a local, self-hosted platform on which a person — working with an AI coding` (rest of sentence unchanged).
   - `root/README.md:3`: `This directory is the checked-in Lodekit root: the engine serves it in dev` (here "engine" is right — it's the serving process).
   - `start/what-is-lodekit.mdx:58`: `- **The engine** — the one local program that hosts and serves your apps.`
4. **Glossary restructure** (`reference/glossary.mdx`):
   - Replace the `### Engine` entry body with:
     ```markdown
     ### Engine

     The single Node process at the heart of the platform: it hosts, builds,
     watches, and serves your apps, the dashboard, and the API. See
     [How Lodekit works](/start/how-lodekit-works/).
     ```
   - Replace the `### runtime` entry (header + body) with:
     ```markdown
     ### runtime

     Retired name for the [engine](#engine) — older material may still use it.
     ```
   - Every other glossary body that says "the runtime" follows rule 2 (known: app worker `:38`, gateway `:115`, manager `:148`, platform `:165`, service `:221`).
5. **Stale envelope fixes** (Decision 3):
   - `reference/mcp-tools.mdx` `lodekit_events` section — replace the param list with the shipped tool's:
     ```markdown
     - `app` (string, optional) — filter to one app's stream by app id; omit for
       everything (platform-wide events have no app).
     - `kind` (`engine` | `service` | `app`, optional) — the class of platform
       member that emitted the event.
     - `component` (string, optional) — the emitting instance: an engine
       subsystem (`build`, `lifecycle`, `registry`), a service name
       (`kv-store`, `tasks`, …), or an app id.
     - `type` (string, optional) — a past-tense fact type, e.g. `key-set` or an
       app-defined type.
     - `since` (number, optional) — epoch ms lower bound (inclusive).
     - `after` (number, optional) — replay ascending from this event id (offset);
       omit for newest-first.
     - `limit` (number, optional).
     ```
   - `reference/mcp-tools.mdx` `lodekit_logs` `appId` line: keep the `_platform` sentinel (it is still real for logs), reword the tail: `` `_platform` for the engine's own records; omit for everything.``
   - `sdk/events.mdx:26-28`: replace the `ns`/`source` sentence with: ``Publishes an event and resolves to the stored `LodekitEvent`. The event's `app`, `kind`, and `component` are stamped by the engine (`kind: "app"`, `app = component = your app id`) — an app cannot forge events as another sender or emit into another app's stream.``
6. **Everything else in the inventory** (from the planning grep — `how-lodekit-works.mdx:3,19,22,32`, `guide/manager.mdx:3`, `sdk/overview.mdx:19,21,77,80`, `sdk/db.mdx:46,59,104`, `sdk/tasks.mdx:42,178`, `sdk/gateways.mdx:80`, `build/*`, `services/*`, `reference/manifest.mdx:7,27`, `reference/file-locations.mdx:45,56` prose around the artifact names, `SKILL.md:56,218,219,275`, `root/README.md:18`, `AGENTS.md:57,62,67,138`) follows rule 2. The grep inventory is a planning aid — re-grep, don't trust the line numbers blindly.

- [ ] **Step 2: residual grep gate**

```bash
grep -rni "runtime" web/docs/src/content/docs/ AGENTS.md packages/skill/SKILL.md root/README.md | grep -vi "@lodekit/runtime\|packages/runtime"
```

Expected output — exactly these residual classes and nothing else:
- `web/docs/src/content/docs/changelog.md:13` (untouched release record)
- `build/the-stack.mdx`, `services/settings.mdx`, `sdk/gateways.mdx`, `SKILL.md`, glossary kv entry — only in the phrase `at runtime`
- `reference/file-locations.mdx` — only the literal `runtime.pid` / `runtime-YYYYMMDD.log` artifact names
- `reference/glossary.mdx` — only the `### runtime` retired-term pointer
- `AGENTS.md` — no hits outside package/path specifiers

Any other hit = the sweep missed a spot; fix and re-run.

- [ ] **Step 3: docs site builds**

Run: `pnpm --filter @lodekit/web-docs build`
Expected: build succeeds (this also catches broken MDX/frontmatter from the edits).

- [ ] **Step 4: Commit**

```bash
git add web/docs AGENTS.md packages/skill/SKILL.md root/README.md
git commit -m "refactor(docs): engine rename sweep — docs site, steering docs, skill (lk-2ud)"
```

---

## Final verification (before the PR)

- [ ] `pnpm test` — full workspace suite green.
- [ ] `pnpm --filter @lodekit/web-docs build` — green (Task 2 gate, re-run on the merged branch).
- [ ] Combined residual grep (both task gates) clean.
- [ ] PR: title `refactor(runtime): engine rename — docs site + code identifiers`; body Summary / Notes (planning decisions 1–5) / Test plan. Raise the PR and stop — merging is the person's call.
