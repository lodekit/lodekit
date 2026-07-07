# tasks-change Bus Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the tasks service's `tasks-change` feed from a plain SSE broadcast onto the event bus (stored, replayable, ns-scoped, 7-day service TTL), and remove the now-redundant `tasks.watch`/`TasksChange` SDK surface.

**Architecture:** One-body swap in the runtime (`emitTasksChange` calls `emitEvent` instead of `broadcast`, exactly like kv-store's `emit`), plus consumer updates: the SDK loses its dedicated watch surface (consumers use `events.watch({type: "tasks-change"})`), and the dashboard folds its separate listener into the envelope-aware `event` listener. Spec: `docs/specs/2026-07-07-tasks-change-bus-migration-design.md`.

**Tech Stack:** Node/TypeScript (buildless, tsx), Hono, better-sqlite3, vitest, pnpm workspaces.

## Global Constraints

- Work on the `stack` branch in this worktree (`/Users/sesv/Code/worktrees/lodekit/stack`). Never fold into `master` — the person integrates.
- Surgical changes only: every changed line traces to the spec; no adjacent "improvements".
- Commit messages: conventional-commit style matching recent history (`refactor(runtime): …`). **No `Co-Authored-By` trailers.**
- Run all pnpm commands from the repo root (never with CWD inside `manager/`).
- The event **type** string stays `tasks-change`; the SSE **wire name** becomes the bus's single `event: event` envelope.
- Payload is identity-only: `{ task, runId?, state? }` — no `appId` (the envelope's `ns` carries it), no `error` (the stack lives in the adjacent `tasks`-source log record).

---

### Task 1: Runtime — `emitTasksChange` rides the bus

**Files:**
- Modify: `packages/runtime/src/services/tasks.ts:3` (import), `:430-437` (`emitTasksChange`)
- Modify: `packages/runtime/src/taskEngine.ts:51` (drop the `error` field)
- Test: `packages/runtime/tests/events-wiring.test.ts` (new case)
- Test: `packages/runtime/tests/tasks-api.test.ts:107-126` (rewrite SSE case)

**Interfaces:**
- Consumes: `emitEvent`, `PLATFORM_NS`, `CHANGE_FEED_TTL_S` from `packages/runtime/src/events.ts` (existing).
- Produces: `emitTasksChange(appId: string, data: { task: string; runId?: number; state?: string }): void` — same name/module, `error?` removed from the signature. Stored `tasks-change` events with `{ns: appId, source: "_platform"}`, payload `data`, 7-day ttl.

- [ ] **Step 1: Write the failing stored-event test**

In `packages/runtime/tests/events-wiring.test.ts`, add `vi` to the vitest import:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
```

Append this case inside the `describe("platform emitters land on the bus", …)` block, after the kv case:

```ts
  it("task enqueue stores a tasks-change event with identity-only payload and the service ttl", async () => {
    const { Hono } = await import("hono");
    const { apiRoutes } = await import("../src/routes.js");
    const { getTasksDb, applyManifest } = await import("../src/services/tasks.js");
    applyManifest(getTasksDb(cfg.dataDir, "notes"), [{ name: "resize" }], Date.now());
    const app = new Hono().route("/api", apiRoutes(cfg));
    const res = await app.request("/api/apps/notes/tasks/resize/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const { records } = queryEvents({ ns: "notes", type: "tasks-change" });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ source: "_platform", payload: { task: "resize", state: "queued" } });
    expect(records[0].payload).not.toHaveProperty("appId");
    // Service ttl (7 days): past the window the record no longer queries.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 8 * 86_400_000);
    expect(queryEvents({ ns: "notes", type: "tasks-change" }).records).toHaveLength(0);
    vi.useRealTimers();
  });
```

- [ ] **Step 2: Rewrite the SSE case for the envelope (also failing)**

In `packages/runtime/tests/tasks-api.test.ts`, replace the whole `it("broadcasts tasks-change on enqueue over the app SSE channel", …)` case (lines 107–126) with:

```ts
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
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `pnpm --filter @lodekit/runtime test -- tests/events-wiring.test.ts tests/tasks-api.test.ts`
Expected: the new events-wiring case FAILS (`records` has length 0 — nothing stored yet); the rewritten tasks-api case FAILS (buffer contains `event: tasks-change`, never `event: event` + `"type":"tasks-change"`). Pre-existing cases stay green.

- [ ] **Step 4: Migrate `emitTasksChange` onto the bus**

In `packages/runtime/src/services/tasks.ts`, replace line 3:

```ts
import { broadcast } from "../sse.js";
```

with:

```ts
import { emitEvent, PLATFORM_NS, CHANGE_FEED_TTL_S } from "../events.js";
```

Replace the `emitTasksChange` block (lines 430–437):

```ts
const EVENT = `${CATALOG_NAME}-change`;

export function emitTasksChange(
  appId: string,
  data: { task: string; runId?: number; state?: string; error?: string }
): void {
  broadcast(EVENT, { appId, ...data }, appId);
}
```

with:

```ts
const EVENT = `${CATALOG_NAME}-change`;

// Change-feed events: identity + state, never values (events spec §4); a module
// load error sends {task: "*"} — the stack lives in the adjacent tasks-source
// log record, and a full stack could blow the payload cap and drop the event.
export function emitTasksChange(
  appId: string,
  data: { task: string; runId?: number; state?: string }
): void {
  emitEvent({ ns: appId, source: PLATFORM_NS, type: EVENT, payload: data, ttl: CHANGE_FEED_TTL_S });
}
```

- [ ] **Step 5: Drop the `error` field at its one emitter**

In `packages/runtime/src/taskEngine.ts:51`, replace:

```ts
    emitTasksChange(appId, { task: "*", error: loadError });
```

with:

```ts
    emitTasksChange(appId, { task: "*" });
```

(The `emitLog` on the line above already persists the stack.)

- [ ] **Step 6: Run the two test files to verify they pass**

Run: `pnpm --filter @lodekit/runtime test -- tests/events-wiring.test.ts tests/tasks-api.test.ts`
Expected: PASS (all cases).

- [ ] **Step 7: Run the full runtime suite and typecheck**

Run: `pnpm --filter @lodekit/runtime test && pnpm --filter @lodekit/runtime check`
Expected: all tests pass (240+ pre-existing plus the new case), tsc clean. If an unrelated test flakes, re-run it once before investigating.

- [ ] **Step 8: Commit**

```bash
git add packages/runtime/src/services/tasks.ts packages/runtime/src/taskEngine.ts packages/runtime/tests/events-wiring.test.ts packages/runtime/tests/tasks-api.test.ts
git commit -m "refactor(runtime): tasks-change rides the event bus — stored, ns-scoped, 7-day service ttl"
```

---

### Task 2: SDK — remove `tasks.watch` / `TasksChange`

**Files:**
- Modify: `packages/sdk/src/client.ts:73-74` (type), `:83` (interface member), `:398-400` (impl)
- Modify: `packages/sdk/src/index.ts` (re-export list)

**Interfaces:**
- Consumes: nothing from Task 1 (compile-time removal; the wire already changed).
- Produces: `Tasks` interface without `watch`; `TasksChange` no longer exported. Consumers use the existing `events.watch({ type: "tasks-change" }, cb)` — `cb` receives the `LodekitEvent` envelope, app id in `ns`.

- [ ] **Step 1: Remove the type and interface member**

In `packages/sdk/src/client.ts`, delete lines 73–74:

```ts
// `task: "*"` is the defs-changed/load-error wildcard (no single task is implicated).
export type TasksChange = { task: string; runId?: number; state?: TaskRunState; error?: string };
```

and delete the `watch` member from the `Tasks` interface (line 83):

```ts
  watch(cb: (change: TasksChange) => void): () => void;
```

- [ ] **Step 2: Remove the implementation**

In the `tasks` object literal (lines 398–400), delete:

```ts
    watch(cb) {
      return channel.on<TasksChange>("tasks-change", () => true, cb);
    },
```

(Keep the trailing structure valid — `list()` becomes the last member; remove the now-dangling comma if needed.)

- [ ] **Step 3: Remove the re-export**

In `packages/sdk/src/index.ts`, delete the `TasksChange,` line from the `export type { … }` block.

- [ ] **Step 4: Typecheck and test SDK + dependents**

Run: `pnpm --filter @lodekit/sdk test && pnpm --filter @lodekit/sdk check && pnpm --filter @lodekit/runtime check`
Expected: all pass. The SDK `channel` helper stays — `events.watch` is its remaining user. No SDK test references `tasks.watch` (verified during spec review), so no test edits.

- [ ] **Step 5: Confirm no stray consumers**

Run: `grep -rn "tasks\.watch\|TasksChange" packages examples --include="*.ts" --include="*.tsx" | grep -v node_modules`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/client.ts packages/sdk/src/index.ts
git commit -m "refactor(sdk)!: remove tasks.watch/TasksChange — events.watch({type: \"tasks-change\"}) is the one watch surface"
```

---

### Task 3: Dashboard — fold the listener into the envelope handler

**Files:**
- Modify: `packages/runtime/dashboard/src/routes/index.tsx:196-202`

**Interfaces:**
- Consumes: the bus envelope `{ns, type, payload}` already parsed by the `event` listener (Task 1's wire format).
- Produces: nothing downstream; behavior-preserving (tasks panels invalidate on change).

- [ ] **Step 1: Fold the listener**

In `packages/runtime/dashboard/src/routes/index.tsx`, inside the `es.addEventListener("event", …)` callback, replace:

```ts
      if (d.type === "kv-store-change") void queryClient.invalidateQueries({ queryKey: ["kv", d.ns] });
    });
    es.addEventListener("tasks-change", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { appId: string };
      void queryClient.invalidateQueries({ queryKey: ["tasks", d.appId] });
      void queryClient.invalidateQueries({ queryKey: ["task-runs", d.appId] });
    });
```

with:

```ts
      if (d.type === "kv-store-change") void queryClient.invalidateQueries({ queryKey: ["kv", d.ns] });
      if (d.type === "tasks-change") {
        void queryClient.invalidateQueries({ queryKey: ["tasks", d.ns] });
        void queryClient.invalidateQueries({ queryKey: ["task-runs", d.ns] });
      }
    });
```

- [ ] **Step 2: Smoke the dashboard build**

The dashboard has no test suite or standalone typecheck; it is Vite-built by the runtime at startup, which surfaces TS/JSX errors. Run (background, from repo root):

`pnpm dev`

Watch stdout until the runtime reports listening (default port 7777, `LODEKIT_PORT` overrides) and the dashboard build is ready, then `curl -sf http://localhost:7777/ -o /dev/null`. Expected: no Vite build error mentioning `index.tsx`; curl exits 0. Stop the dev server afterward.

- [ ] **Step 3: Commit**

```bash
git add packages/runtime/dashboard/src/routes/index.tsx
git commit -m "refactor(dashboard): fold tasks-change into the envelope-aware event listener"
```

---

### Task 4: Docs & bookkeeping

**Files:**
- Modify: `docs/specs/2026-07-06-tasks-service-design.md` (§8 supersession note)
- Modify: `docs/specs/2026-07-07-events-design.md` (§4 change-feeds paragraph)
- Modify: `roadmap.md:326-333` (delete the migrated entry)

**Interfaces:** none (docs only).

- [ ] **Step 1: Supersession note in the tasks spec**

In `docs/specs/2026-07-06-tasks-service-design.md` §8, directly after the paragraph ending `…(the bus has no replay — established pattern).` (line ~211), insert:

```markdown
> **Superseded (2026-07-07):** the change feed now rides the event bus as stored
> `tasks-change` events (7-day service ttl) and `tasks.watch` is replaced by
> `events.watch({type: "tasks-change"})` —
> `docs/specs/2026-07-07-tasks-change-bus-migration-design.md`. Event type and payload
> identity (`task`, `runId?`, `state?`) are unchanged; the load-error `error` field is
> dropped (the stack lives in the adjacent `tasks`-source log record) and the bus now
> does have replay.
```

- [ ] **Step 2: Events spec §4 gains tasks-change**

In `docs/specs/2026-07-07-events-design.md`, at the end of the **Change feeds become events** paragraph (after `…keep emitting their \`expire\` ops through the same path.`), append:

```markdown
`tasks-change` joined them in a fast-follow once the parallel-landed Tasks v1 slice
reconciled (`2026-07-07-tasks-change-bus-migration-design.md`).
```

- [ ] **Step 3: Delete the roadmap entry**

In `roadmap.md`, delete the whole bullet (lines 326–333):

```markdown
- **`tasks-change` feed onto the event bus** — the Tasks v1 slice landed in parallel with
  the events slice, so its change feed (`broadcast("tasks-change", …)` in
  `services/tasks.ts` + SDK `tasks.watch`/`TasksChange`) still rides a plain SSE
  broadcast — the pre-bus pattern kv/file-store migrated away from. Works fine (the
  transport is shared), but it's the one service feed that isn't a stored, replayable
  event. Migrate it like the other change feeds (emitEvent, service ttl, identity-only
  payload) and fold `tasks.watch` into `events.watch`; pairs naturally with
  event-triggered tasks above — both make the bus the tasks service's spine.
```

Leave the adjacent event-triggered-tasks entry untouched (this migration is its prerequisite, not its delivery).

- [ ] **Step 4: Full workspace verification**

Run: `pnpm test`
Expected: all packages green (runtime, sdk, manager, ui).

- [ ] **Step 5: Commit**

```bash
git add docs/specs/2026-07-06-tasks-service-design.md docs/specs/2026-07-07-events-design.md roadmap.md
git commit -m "docs(specs,roadmap): tasks-change bus migration — supersession notes, roadmap entry closed"
```
