# Events Canonical Model (PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** Rebuild the event envelope as `app` / `kind` / `component` + fine-grained past-tense fact types, migrate every emitter, query surface, and consumer in one PR, and land the tier-1 canon (Platform / Engine / Kind / Component / Internal app) — spec `docs/specs/2026-07-16-events-canonical-model-design.md` §3–§6 + §8 tier 1, PR 1 of §9.

**Architecture:** One sqlite table (`data/_platform/events.sqlite`) rebuilt by a drop-and-recreate migration; one emission facade (`emitEvent`) that validates, inserts, and broadcasts over the existing SSE registry keyed by `record.app`; HTTP/SDK/MCP query surfaces gain `app`/`kind`/`component`/`since`/`until` filters and lose `ns`/`source`. No dual-shape code and no backfill — every consumer flips in the same PR.

**Tech Stack:** Node/Hono + better-sqlite3 (buildless, tsx), zod validators, TanStack Start dashboard, vitest.

## Global Constraints

- `app`: `^_?[a-z0-9-]+$` or `null` (null = platform-wide, global feed only). `component`: `^_?[a-z0-9-]+$`. `type`: `^[a-z0-9-]+$` (unchanged `TYPE_RE`). `kind`: closed set `engine | service | app`.
- `kind === "app"` ⇒ `component === app` (attribution unforgeable by construction).
- Payload cap 8 KB serialized; ttl bounds unchanged (`TTL_MAX_S = 30 d`); `CHANGE_FEED_TTL_S = 7 d` keeps its exact per-emitter assignment (spec §5 table).
- Payloads carry identity and references only — never ops or statuses (those are the type). The `"*"` payload sentinel dies (`defs-changed` replaces it).
- The taxonomy in spec §4 is normative: exactly those emitters and types, no others.
- Retention sweep semantics unchanged: 30 d / 50 k rows default + per-app overrides + per-emission `expires_at`.
- The `ns` and `source` params/fields are removed, not aliased. `_platform` ceases to exist on the bus (log-store's `_platform` query sentinel is untouched — its convergence is a follow-up slice).
- The package stays `@lodekit/runtime` (rename is PR 4); prose canon says "engine".
- `docs/changelog.md` is append-only; commit messages carry bead IDs, no `Co-Authored-By` trailers.

**Sequencing note (single-PR flip, squash-merged):** Task 2 flips the facade signature; from then until Task 8 completes, the emitter-asserting suites (`events-wiring.test.ts` and any service suite asserting emitted events) are red for the not-yet-migrated emitters. Each task's own named suites must be green at its commit; the **full** `@lodekit/runtime` suite gates Task 9, and the workspace-wide `pnpm test` gates Task 13. This is a deliberate, spec-stated property (no dual-shape code); `master` only ever receives the final squashed commit.

---

### Task 1: Storage layer — canonical schema, migration, since/until, sweep

**Files:**
- Modify: `packages/runtime/src/migrations/platform.ts` (EVENTS_CHAIN)
- Modify: `packages/runtime/src/eventStore.ts`
- Modify: `packages/runtime/src/server.ts:196-200` (sweep call)
- Test: `packages/runtime/tests/eventStore.test.ts`, `packages/runtime/tests/platform-migrations.test.ts`

**Interfaces:**
- Consumes: existing `applyMigrations(db, chain)` from `src/migrations.ts` (unchanged).
- Produces (later tasks rely on these exact shapes):
  ```ts
  export interface EventRecord { id: number; ts: number; app: string | null; kind: string; component: string; type: string; payload: Record<string, unknown> | null }
  export interface EventWrite { app: string | null; kind: string; component: string; type: string; payload?: Record<string, unknown> | null; ttl?: number }
  export interface EventQuery { app?: string; kind?: string; component?: string; type?: string; since?: number; until?: number; after?: number; before?: number; limit?: number }
  export function insertEvent(w: EventWrite): EventRecord | null
  export function queryEvents(opts?: EventQuery): { records: EventRecord[]; next: number | null }
  export function sweepEventStore(opts?: { maxAgeMs?: number; maxRows?: number; appAges?: Map<string, number> }): number
  ```

**Acceptance Criteria:**
- `EVENTS_CHAIN` gains `002-canonical-envelope` (DROP + recreate per spec §3, no backfill); applying the full chain over a v1 database yields the new columns and zero rows.
- `queryEvents` filters by `app`, `kind`, `component`, `type`, `since` (`ts >= since`), `until` (`ts < until`); cursor semantics (`after`/`before`/`next`) and limit clamp unchanged.
- Sweep: `appAges` replaces `nsAges`; the global-age delete removes `app IS NULL` rows too (SQL `NULL NOT IN (...)` is never true — the clause must be `(app IS NULL OR app NOT IN (...))`).
- `eventStore.test.ts` and `platform-migrations.test.ts` pass.

- [ ] **Step 1: Append migration 002 to EVENTS_CHAIN**

In `packages/runtime/src/migrations/platform.ts`, after the `001-baseline` entry of `EVENTS_CHAIN` (keep 001 verbatim — the ledger already recorded it on live databases):

```ts
  {
    // Canonical envelope (spec 2026-07-16-events §3): app/kind/component replace
    // ns/source; no backfill — nothing is released, dev databases reset.
    name: "002-canonical-envelope",
    up: (db) =>
      db.exec(`
        DROP TABLE events;
        CREATE TABLE events (
          id         INTEGER PRIMARY KEY,
          ts         INTEGER NOT NULL,
          app        TEXT,
          kind       TEXT NOT NULL,
          component  TEXT NOT NULL,
          type       TEXT NOT NULL,
          payload    TEXT,
          expires_at INTEGER
        );
        CREATE INDEX events_app ON events(app, id);
        CREATE INDEX events_ts  ON events(ts);
      `),
  },
```

- [ ] **Step 2: Rewrite eventStore.ts shapes and SQL**

Replace the `EventRecord`/`EventWrite`/`EventQuery` interfaces with the Produces block above (keep the inline comments on `after`/`before`). Then:

`Row` + `toRecord`:

```ts
interface Row { id: number; ts: number; app: string | null; kind: string; component: string; type: string; payload: string | null }

const toRecord = (r: Row): EventRecord => ({
  id: r.id,
  ts: r.ts,
  app: r.app,
  kind: r.kind,
  component: r.component,
  type: r.type,
  payload: r.payload ? (JSON.parse(r.payload) as Record<string, unknown>) : null,
});
```

`insertEvent`:

```ts
export function insertEvent(w: EventWrite): EventRecord | null {
  if (!db) return null;
  try {
    const ts = Date.now();
    const info = db
      .prepare("INSERT INTO events (ts, app, kind, component, type, payload, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(ts, w.app, w.kind, w.component, w.type, w.payload ? JSON.stringify(w.payload) : null, w.ttl ? ts + w.ttl * 1000 : null);
    return { id: Number(info.lastInsertRowid), ts, app: w.app, kind: w.kind, component: w.component, type: w.type, payload: w.payload ?? null };
  } catch (e) {
    process.stderr.write(`[events] event write failed: ${e}\n`);
    emitLog("error", "event-store", "event write failed — history gap", { stack: String(e) });
    return null;
  }
}
```

`queryEvents` (same structure; new WHERE arms, new SELECT list):

```ts
export function queryEvents(opts: EventQuery = {}): { records: EventRecord[]; next: number | null } {
  if (!db) return { records: [], next: null };
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 100)), 1000);
  const asc = opts.after != null;
  const where: string[] = ["(expires_at IS NULL OR expires_at > ?)"];
  const params: unknown[] = [Date.now()];
  if (opts.app) { where.push("app = ?"); params.push(opts.app); }
  if (opts.kind) { where.push("kind = ?"); params.push(opts.kind); }
  if (opts.component) { where.push("component = ?"); params.push(opts.component); }
  if (opts.type) { where.push("type = ?"); params.push(opts.type); }
  if (opts.since != null) { where.push("ts >= ?"); params.push(opts.since); }
  if (opts.until != null) { where.push("ts < ?"); params.push(opts.until); }
  if (asc) { where.push("id > ?"); params.push(opts.after); }
  else if (opts.before != null) { where.push("id < ?"); params.push(opts.before); }
  try {
    const rows = db
      .prepare(
        `SELECT id, ts, app, kind, component, type, payload FROM events
         WHERE ${where.join(" AND ")}
         ORDER BY id ${asc ? "ASC" : "DESC"} LIMIT ?`
      )
      .all(...params, limit) as Row[];
    const records = rows.map(toRecord);
    return { records, next: rows.length === limit ? records[records.length - 1].id : null };
  } catch (e) {
    process.stderr.write(`[events] event query failed: ${e}\n`);
    return { records: [], next: null };
  }
}
```

`sweepEventStore` — rename `nsAges` → `appAges`, switch the column, and fix the NULL hole:

```ts
export function sweepEventStore(opts: { maxAgeMs?: number; maxRows?: number; appAges?: Map<string, number> } = {}): number {
  if (!db) return 0;
  const maxAgeMs = opts.maxAgeMs ?? RETENTION_MAX_AGE_MS;
  const maxRows = opts.maxRows ?? RETENTION_MAX_ROWS;
  const appAges = opts.appAges ?? new Map<string, number>();
  try {
    let deleted = db.prepare("DELETE FROM events WHERE expires_at IS NOT NULL AND expires_at <= ?").run(Date.now()).changes;
    // Per-app override ages first, then the global age for every other stream.
    for (const [app, ageMs] of appAges) {
      deleted += db.prepare("DELETE FROM events WHERE app = ? AND ts < ?").run(app, Date.now() - ageMs).changes;
    }
    // NULL never matches NOT IN — the IS NULL arm keeps platform-wide rows sweepable.
    const skip = [...appAges.keys()];
    deleted += db
      .prepare(`DELETE FROM events WHERE ts < ? AND (app IS NULL OR app NOT IN (${skip.map(() => "?").join(",") || "''"}))`)
      .run(Date.now() - maxAgeMs, ...skip).changes;
    // Row at OFFSET maxRows (newest-first) is the first over the cap; NULL subselect (under cap) deletes nothing.
    deleted += db
      .prepare("DELETE FROM events WHERE id <= (SELECT id FROM events ORDER BY id DESC LIMIT 1 OFFSET ?)")
      .run(maxRows).changes;
    return deleted;
  } catch (e) {
    process.stderr.write(`[events] event sweep failed: ${e}\n`);
    return 0;
  }
}
```

- [ ] **Step 3: Update the sweep call in server.ts**

At `packages/runtime/src/server.ts:199`, rename the option (`collectAppOverrides` already yields app ids):

```ts
        appAges: new Map([...collectAppOverrides(cfg, "events.retention_age")].map(([a, v]) => [a, parseDuration(v as string)])),
```

- [ ] **Step 4: Update eventStore.test.ts to the new shapes**

Replace every `{ ns: ..., source: ..., type: ... }` write fixture with the canonical shape, e.g. old `insertEvent({ ns: "notes", source: "_platform", type: "kv-store-change", payload: { key: "k" } })` becomes:

```ts
insertEvent({ app: "notes", kind: "service", component: "kv-store", type: "key-set", payload: { key: "k" } })
```

and every read assertion on `ns`/`source` becomes `app`/`kind`/`component`. Filter calls `queryEvents({ ns: "notes" })` become `queryEvents({ app: "notes" })`. Sweep tests passing `nsAges` pass `appAges`. Then append the new coverage:

```ts
it("filters by kind, component, and a [since, until) ts range", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(1_000);
  insertEvent({ app: "notes", kind: "service", component: "kv-store", type: "key-set", payload: { key: "a" } });
  vi.setSystemTime(2_000);
  insertEvent({ app: null, kind: "engine", component: "registry", type: "apps-changed" });
  vi.setSystemTime(3_000);
  insertEvent({ app: "notes", kind: "app", component: "notes", type: "export-finished" });
  expect(queryEvents({ kind: "engine" }).records.map((r) => r.type)).toEqual(["apps-changed"]);
  expect(queryEvents({ component: "kv-store" }).records.map((r) => r.type)).toEqual(["key-set"]);
  expect(queryEvents({ since: 2_000, until: 3_000 }).records.map((r) => r.type)).toEqual(["apps-changed"]);
  expect(queryEvents({ since: 2_000 }).records.map((r) => r.type)).toEqual(["export-finished", "apps-changed"]);
  vi.useRealTimers();
});

it("sweeps platform-wide (app null) rows past the global age", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(1_000);
  insertEvent({ app: null, kind: "engine", component: "registry", type: "apps-changed" });
  vi.setSystemTime(1_000 + 31 * 24 * 60 * 60 * 1000);
  expect(sweepEventStore({ appAges: new Map([["notes", 1]]) })).toBeGreaterThanOrEqual(1);
  expect(queryEvents({ type: "apps-changed" }).records).toHaveLength(0);
  vi.useRealTimers();
});
```

(Adopt the file's existing init/teardown helpers; add the `vi` import if missing.)

- [ ] **Step 5: Add the migration-over-v1 test**

In `packages/runtime/tests/platform-migrations.test.ts`, update any EVENTS_CHAIN column assertions to the new list and add:

```ts
it("002 rebuilds a v1 events table into the canonical envelope with no backfill", () => {
  const db = new Database(":memory:");
  applyMigrations(db, [EVENTS_CHAIN[0]]); // a v1 database
  db.prepare("INSERT INTO events (ts, ns, source, type, payload, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(Date.now(), "notes", "_platform", "kv-store-change", null, null);
  applyMigrations(db, EVENTS_CHAIN); // 002 applies over it
  const cols = (db.prepare("PRAGMA table_info(events)").all() as { name: string }[]).map((c) => c.name);
  expect(cols).toEqual(["id", "ts", "app", "kind", "component", "type", "payload", "expires_at"]);
  expect((db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n).toBe(0);
  db.close();
});
```

- [ ] **Step 6: Run the task's suites**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/eventStore.test.ts tests/platform-migrations.test.ts tests/migrations.test.ts`
Expected: PASS (all three).

- [ ] **Step 7: Commit**

```bash
git add packages/runtime/src/migrations/platform.ts packages/runtime/src/eventStore.ts packages/runtime/src/server.ts packages/runtime/tests/eventStore.test.ts packages/runtime/tests/platform-migrations.test.ts
git commit -m "feat(runtime): canonical event storage — app/kind/component schema, since/until, sweep (<bead-id>)"
```

---

### Task 2: Facade + HTTP surfaces — EmitInput, validation, history & scoped routes

**Files:**
- Modify: `packages/runtime/src/events.ts`
- Modify: `packages/runtime/src/services/event-store.ts`
- Modify: `packages/runtime/src/routes.ts:86-104`
- Test: `packages/runtime/tests/events.test.ts`, `packages/runtime/tests/event-api.test.ts`

**Interfaces:**
- Consumes: Task 1's `insertEvent`/`queryEvents`/`EventRecord`; `broadcast(event, data, appId?)` from `src/sse.ts` (unchanged).
- Produces (every emitter task and consumer relies on these):
  ```ts
  export const ID_RE = /^_?[a-z0-9-]+$/;          // renamed from NS_RE
  export const TYPE_RE = /^[a-z0-9-]+$/;           // unchanged
  export const KINDS = ["engine", "service", "app"] as const;
  export type Kind = (typeof KINDS)[number];
  export const CHANGE_FEED_TTL_S: number;          // unchanged value
  export interface EmitInput { app: string | null; kind: Kind; component: string; type: string; payload?: Record<string, unknown>; ttl?: number }
  export function emitEvent(e: EmitInput): EventRecord | null
  // PLATFORM_NS stays exported until Task 9 (emitters still import it); do not add new importers.
  ```
- HTTP: `GET /api/events/history?app&kind&component&type&since&until&after&before&limit`; `GET /api/apps/:appId/event-store?component&type&since&until&after&before&limit`; `POST` body unchanged.

**Acceptance Criteria:**
- Facade validation: kind enum; `app` null or `ID_RE`; `component` `ID_RE`; `kind=app ⇒ component===app`; payload/ttl bounds unchanged; never throws; insert-failure still broadcasts with `id: 0`.
- Broadcast key is `record.app` — null-app events reach the global feed only; wire name `event` and full-envelope `data:` unchanged.
- `/api/events/history` accepts the new params, rejects malformed ones (400), and no longer accepts `ns`/`source`.
- App POST stamps `app = component = appId`, `kind = "app"`.
- `events.test.ts` and `event-api.test.ts` pass.

- [ ] **Step 1: Rewrite events.ts**

Full new file body (keep the existing header comment about the one emission path, updating its `type`-filter sentence to mention the envelope fields):

```ts
import { insertEvent, type EventRecord } from "./eventStore.js";
import { broadcast } from "./sse.js";

// log-store's query sentinel only (its convergence is a follow-up slice) — no event
// emitter may import this. Deleted once the last emitter migrates (this PR, Task 9).
export const PLATFORM_NS = "_platform";
// App and component ids: an app id, or an underscore-prefixed internal-app id
// (_dashboard) — the app-id grammar has no underscore, so the two can never collide
// and no reserved-word check exists anywhere (spec §2/§3).
export const ID_RE = /^_?[a-z0-9-]+$/;
export const TYPE_RE = /^[a-z0-9-]+$/;
// The closed set of platform-member classes that emit (spec §2 "Kind").
export const KINDS = ["engine", "service", "app"] as const;
export type Kind = (typeof KINDS)[number];
export const PAYLOAD_MAX_BYTES = 8 * 1024;
export const TTL_MAX_S = 30 * 24 * 60 * 60;
// Change-feed events (kv/file-store &c.) are the bus's noisiest tenants — a
// service-set shorter ttl keeps the backed-up file lean (durable ≠ forever).
export const CHANGE_FEED_TTL_S = 7 * 24 * 60 * 60;

export interface EmitInput {
  app: string | null; // whose stream; null = platform-wide (global feed only, spec §3)
  kind: Kind;
  component: string;
  type: string;
  payload?: Record<string, unknown>;
  ttl?: number; // seconds
}

// The one emission path (spec §5): persist, then stream live over the shared SSE
// transport. One wire name ("event") for the whole bus — EventSource has no catch-all
// listener, so generic consumers filter on the envelope (kind/component/type). Insert
// failure still broadcasts (id 0): the gap is history, never delivery. Never throws.
export function emitEvent(e: EmitInput): EventRecord | null {
  if (e.app !== null && !ID_RE.test(e.app)) return null;
  if (!KINDS.includes(e.kind) || !ID_RE.test(e.component) || !TYPE_RE.test(e.type)) return null;
  if (e.kind === "app" && e.component !== e.app) return null;
  if (e.payload && Buffer.byteLength(JSON.stringify(e.payload)) > PAYLOAD_MAX_BYTES) return null;
  if (e.ttl != null && (!Number.isInteger(e.ttl) || e.ttl <= 0 || e.ttl > TTL_MAX_S)) return null;
  const record = insertEvent(e) ?? {
    id: 0,
    ts: Date.now(),
    app: e.app,
    kind: e.kind,
    component: e.component,
    type: e.type,
    payload: e.payload ?? null,
  };
  broadcast("event", record, record.app ?? undefined);
  return record;
}
```

`NS_RE` is gone; the compat note on `PLATFORM_NS` is deliberate — emitters still import it until their tasks run, and Task 9 deletes it.

- [ ] **Step 2: Update services/event-store.ts**

Extend the shared query schema and stamp the new envelope:

```ts
// Shared by the app-scoped GET and (extended with app/kind) the global /api/events/history.
export const eventsQuery = z.object({
  component: z.string().optional(),
  type: z.string().optional(),
  since: z.coerce.number().int().nonnegative().optional(),
  until: z.coerce.number().int().positive().optional(),
  after: z.coerce.number().int().nonnegative().optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().optional(),
});
```

POST handler (in `eventRoutes`):

```ts
  .post("/", zValidator("json", emitBody, validationHook), (c) => {
    const { type, payload, ttl } = c.req.valid("json");
    // app = component = the app's own id — attribution can't be forged by construction.
    const record = emitEvent({ app: c.var.appId, kind: "app", component: c.var.appId, type, payload, ttl });
    if (!record) return c.json({ error: "invalid event" }, 400);
    return c.json(record, 201);
  })
```

GET handler:

```ts
  .get("/", zValidator("query", eventsQuery, validationHook), (c) => {
    const { component, type, since, until, after, before, limit } = c.req.valid("query");
    return c.json(queryEvents({ app: c.var.appId, component, type, since, until, after, before, limit }));
  });
```

(`emitBody` is unchanged.)

- [ ] **Step 3: Update the global history route in routes.ts**

Replace the `ns`/`source` extension (imports: swap `NS_RE` for `ID_RE, KINDS` from `./events.js`):

```ts
    // Global event history (dashboard + MCP); /api/events itself stays the SSE feed.
    .get(
      "/events/history",
      zValidator(
        "query",
        eventsQuery.extend({
          app: z.string().regex(ID_RE).optional(),
          kind: z.enum(KINDS).optional(),
        }),
        validationHook
      ),
      (c) => {
        const { app, kind, component, type, since, until, after, before, limit } = c.req.valid("query");
        return c.json(queryEvents({ app, kind, component, type, since, until, after, before, limit }));
      }
    )
```

The two SSE routes below it are unchanged.

- [ ] **Step 4: Rewrite events.test.ts**

Keep the setup (global + `"notes"`-scoped clients via `addClient`). New test bodies:

```ts
describe("emitEvent", () => {
  it("persists and broadcasts the envelope under the single 'event' wire name", () => {
    const rec = emitEvent({ app: "notes", kind: "service", component: "kv-store", type: "key-set", payload: { key: "k" } });
    expect(rec).toMatchObject({ app: "notes", kind: "service", component: "kv-store", type: "key-set" });
    expect(rec!.id).toBeGreaterThan(0);
    expect(received.global).toHaveLength(1);
    expect(received.scoped).toHaveLength(1);
  });

  it("scopes by app: null-app events reach global clients only", () => {
    emitEvent({ app: null, kind: "engine", component: "registry", type: "apps-changed" });
    expect(received.global).toHaveLength(1);
    expect(received.scoped).toHaveLength(0);
  });

  it("scopes by app: a sibling app's events never reach another scoped feed", () => {
    emitEvent({ app: "other", kind: "service", component: "kv-store", type: "key-set", payload: { key: "k" } });
    expect(received.global).toHaveLength(1);
    expect(received.scoped).toHaveLength(0); // scoped client is "notes"
  });

  it("rejects bad kind, bad grammar, forged app attribution, oversized payloads, and out-of-range ttl", () => {
    expect(emitEvent({ app: "notes", kind: "robot" as never, component: "kv-store", type: "x" })).toBeNull();
    expect(emitEvent({ app: "Notes!", kind: "service", component: "kv-store", type: "x" })).toBeNull();
    expect(emitEvent({ app: "notes", kind: "service", component: "No Caps", type: "x" })).toBeNull();
    expect(emitEvent({ app: "notes", kind: "service", component: "kv-store", type: "No Caps" })).toBeNull();
    expect(emitEvent({ app: "notes", kind: "app", component: "other", type: "x" })).toBeNull(); // kind=app ⇒ component=app
    expect(emitEvent({ app: "notes", kind: "app", component: "notes", type: "big", payload: { blob: "x".repeat(9000) } })).toBeNull();
    expect(emitEvent({ app: "notes", kind: "app", component: "notes", type: "t", ttl: 0 })).toBeNull();
    expect(emitEvent({ app: "notes", kind: "app", component: "notes", type: "t", ttl: 999_999_999 })).toBeNull();
    expect(received.global).toHaveLength(0); // nothing hit the wire
  });

  it("still broadcasts (id 0) when the store is down — delivery over history", () => {
    closeEventStoreForTest();
    const rec = emitEvent({ app: "notes", kind: "service", component: "kv-store", type: "key-set", payload: { key: "k" } });
    expect(rec!.id).toBe(0);
    expect(received.global).toHaveLength(1);
  });
});
```

(Drop the `PLATFORM_NS` import; adjust `received` fixture names to the file's existing ones.)

- [ ] **Step 5: Rewrite event-api.test.ts**

Update the emit fixtures and params. Replacement bodies for the named tests:

```ts
  it("emits with app = component = appId, kind app, and returns the stored envelope", async () => {
    const res = await post("notes", { type: "note-added", payload: { id: 7 } });
    expect(res.status).toBe(201);
    const rec = await res.json();
    expect(rec).toMatchObject({ app: "notes", kind: "app", component: "notes", type: "note-added", payload: { id: 7 } });
  });

  it("scoped GET lists the app's stream (incl. platform-emitted), never a sibling's", async () => {
    await post("notes", { type: "note-added" });
    emitEvent({ app: "notes", kind: "engine", component: "build", type: "build-ready" });
    emitEvent({ app: "other", kind: "service", component: "kv-store", type: "key-set", payload: { key: "k" } });
    const mine = await (await app.request("/api/apps/notes/event-store")).json();
    expect(mine.records.map((r: { type: string }) => r.type)).toEqual(["build-ready", "note-added"]);
  });

  it("validates type grammar, payload size, ttl, and app id", async () => {
    expect((await post("notes", { type: "No Caps" })).status).toBe(400);
    expect((await post("notes", {})).status).toBe(400);
    expect((await post("notes", { type: "big", payload: { blob: "x".repeat(9000) } })).status).toBe(400);
    expect((await post("notes", { type: "t", ttl: -5 })).status).toBe(400);
    expect((await post("_dashboard", { type: "t" })).status).toBe(400); // internal app id: not scaffoldable, still not an app POST target
    expect((await post("Bad!", { type: "t" })).status).toBe(400);
  });

  it("supports component, since/until, and after (ascending replay) on the scoped GET", async () => {
    await post("notes", { type: "a" });
    emitEvent({ app: "notes", kind: "service", component: "kv-store", type: "key-set", payload: { key: "k" } });
    const byComponent = await (await app.request("/api/apps/notes/event-store?component=kv-store")).json();
    expect(byComponent.records.map((r: { type: string }) => r.type)).toEqual(["key-set"]);
    const all = await (await app.request("/api/apps/notes/event-store?after=0")).json();
    expect(all.records.map((r: { type: string }) => r.type)).toEqual(["a", "key-set"]);
    const none = await (await app.request("/api/apps/notes/event-store?until=1")).json();
    expect(none.records).toHaveLength(0);
  });
```

Global history describe:

```ts
  it("returns everything; filters by app, kind, and component", async () => {
    await post("notes", { type: "note-added" });
    emitEvent({ app: null, kind: "engine", component: "registry", type: "apps-changed" });
    const all = await (await app.request("/api/events/history")).json();
    expect(all.records).toHaveLength(2);
    const engine = await (await app.request("/api/events/history?kind=engine")).json();
    expect(engine.records.map((r: { type: string }) => r.type)).toEqual(["apps-changed"]);
    const mine = await (await app.request("/api/events/history?app=notes")).json();
    expect(mine.records.map((r: { type: string }) => r.type)).toEqual(["note-added"]);
  });

  it("rejects a malformed app, an unknown kind, a malformed cursor, and the removed ns param shape", async () => {
    expect((await app.request("/api/events/history?app=Bad!")).status).toBe(400);
    expect((await app.request("/api/events/history?kind=robot")).status).toBe(400);
    expect((await app.request("/api/events/history?after=abc")).status).toBe(400);
    emitEvent({ app: "other", kind: "service", component: "kv-store", type: "key-set", payload: { key: "k" } });
    const nsIgnored = await (await app.request("/api/events/history?ns=notes")).json();
    expect(nsIgnored.records.length).toBeGreaterThan(0); // ns is not a filter anymore — unknown params are ignored, not aliased
  });
```

(Keep the file's `post` helper and setup; update its `emitEvent` import fixtures accordingly.)

- [ ] **Step 6: Run the task's suites**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/events.test.ts tests/event-api.test.ts tests/sse.test.ts`
Expected: PASS. (Known red elsewhere: `events-wiring.test.ts` until Tasks 3–8 — per Sequencing note.)

- [ ] **Step 7: Commit**

```bash
git add packages/runtime/src/events.ts packages/runtime/src/services/event-store.ts packages/runtime/src/routes.ts packages/runtime/tests/events.test.ts packages/runtime/tests/event-api.test.ts
git commit -m "feat(runtime): canonical emit facade + history/scoped event params (<bead-id>)"
```

---

### Task 3: kv-store & file-store — key-* / file-* fact types

**Files:**
- Modify: `packages/runtime/src/services/kv-store.ts:156-162` (+ call sites 166, 215, 224, 237, 243)
- Modify: `packages/runtime/src/services/file-store.ts:124-129` (+ call sites 177, 253, 272, 319, 339-340, 361)
- Test: `packages/runtime/tests/events-wiring.test.ts` (kv test), `packages/runtime/tests/kv-api.test.ts` / `kv-store.test.ts` / `file-store.test.ts` / `file-store-api.test.ts` (any event assertions)

**Interfaces:**
- Consumes: Task 2's `emitEvent`, `CHANGE_FEED_TTL_S` (`PLATFORM_NS` import is dropped from both files).
- Produces: bus facts `key-set` / `key-deleted` / `key-expired` `{key}` and `file-put` / `file-deleted` / `file-expired` `{slug}` — `kind: "service"`, `component: CATALOG_NAME`, ttl 7 d.

**Acceptance Criteria:**
- A kv PUT lands `{app: appId, kind: "service", component: "kv-store", type: "key-set", payload: {key}}`; DELETE → `key-deleted`; sweep → `key-expired`. Same pattern for file-store with `file-put`/`file-deleted`/`file-expired` `{slug}`.
- No `op` field in any payload; the `<service>-change` type strings are gone from both files.
- The kv wiring test and both services' suites pass.

- [ ] **Step 1: Rewrite the kv-store emit helper**

Replace lines 156-162 (drop the `EVENT` const; drop `PLATFORM_NS` from the import at line 8):

```ts
// Change-feed facts: identity only, never values (spec §4); service-set ttl keeps
// the bus's noisiest tenant from bloating the backed-up file.
type KvFact = "key-set" | "key-deleted" | "key-expired";
function emit(appId: string, key: string, type: KvFact): void {
  emitEvent({ app: appId, kind: "service", component: CATALOG_NAME, type, payload: { key }, ttl: CHANGE_FEED_TTL_S });
}
```

Call-site arg swaps: `"expire"` → `"key-expired"` (L166), `"set"` → `"key-set"` (L215, L224, L237), `"del"` → `"key-deleted"` (L243).

- [ ] **Step 2: Rewrite the file-store emit helper**

Replace lines 124-129 (drop `EVENT`; drop `PLATFORM_NS` from the import at line 11):

```ts
// Change-feed facts: identity only, never bytes (spec §4); service-set ttl as kv-store.
type FileFact = "file-put" | "file-deleted" | "file-expired";
function emit(appId: string, slug: string, type: FileFact): void {
  emitEvent({ app: appId, kind: "service", component: CATALOG_NAME, type, payload: { slug }, ttl: CHANGE_FEED_TTL_S });
}
```

Call-site arg swaps: `"del"` → `"file-deleted"` (L177, L272, L339), `"put"` → `"file-put"` (L253, L319, L340), `"expire"` → `"file-expired"` (L361).

- [ ] **Step 3: Update the kv wiring test**

In `events-wiring.test.ts`, the kv test becomes:

```ts
  it("kv writes land key-set facts with identity-only payloads and the service ttl", async () => {
    const { Hono } = await import("hono");
    const { apiRoutes } = await import("../src/routes.js");
    const app = new Hono().route("/api", apiRoutes(cfg));
    await app.request("/api/apps/notes/kv-store/greeting", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "hi" }),
    });
    const { records } = queryEvents({ app: "notes", type: "key-set" });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: "service", component: "kv-store", payload: { key: "greeting" } });
    expect(records[0].payload).not.toHaveProperty("op");
  });
```

- [ ] **Step 4: Sweep the four service suites for old assertions**

Run: `grep -n "kv-store-change\|file-store-change\|op: \"set\"\|op: \"del\"\|op: \"put\"\|op: \"expire\"" packages/runtime/tests/kv-api.test.ts packages/runtime/tests/kv-store.test.ts packages/runtime/tests/file-store.test.ts packages/runtime/tests/file-store-api.test.ts`
For each hit, apply the mapping — filter `{ ns: X, type: "kv-store-change" }` → `{ app: X, type: "key-set" }` (or `key-deleted`/`key-expired` per the asserted `op`), assertion `payload: { key, op: "set" }` → `payload: { key }` plus `type: "key-set"`; identically for file-store with `file-put`/`file-deleted`/`file-expired` and `{slug}`.

- [ ] **Step 5: Run the task's suites**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/kv-api.test.ts tests/kv-store.test.ts tests/file-store.test.ts tests/file-store-api.test.ts tests/events-wiring.test.ts -t "kv writes"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/services/kv-store.ts packages/runtime/src/services/file-store.ts packages/runtime/tests/events-wiring.test.ts packages/runtime/tests/kv-api.test.ts packages/runtime/tests/kv-store.test.ts packages/runtime/tests/file-store.test.ts packages/runtime/tests/file-store-api.test.ts
git commit -m "feat(runtime): kv/file change feeds speak key-*/file-* facts (<bead-id>)"
```

---

### Task 4: db-store — row-* and schema-applied/schema-gated

**Files:**
- Modify: `packages/runtime/src/services/db-store.ts:66-81, 184-186` (+ gated call sites 202, 212, 222, 236, 248, 257, 275 and applied site 279)
- Test: `packages/runtime/tests/db-api.test.ts` / `db-push.test.ts` / `db-e2e.test.ts` / `schema-drift.test.ts` (any event assertions)

**Interfaces:**
- Consumes: Task 2's `emitEvent`, `CHANGE_FEED_TTL_S` (drop `PLATFORM_NS` from the import at line 16).
- Produces: `row-inserted` / `row-updated` / `row-deleted` / `row-replaced` `{table?}`; `schema-applied` (no payload) / `schema-gated` `{message}` — all `kind: "service"`, `component: "db-store"`, ttl 7 d.

**Acceptance Criteria:**
- A drizzle INSERT lands `row-inserted` (payload `{table}` when the regex finds one, else no payload); UPDATE/DELETE/REPLACE map likewise. No `op` payload field.
- A successful schema push lands `schema-applied` with **no payload** (the old `{statements: n}` count is dropped per the spec's payload rule — counts are not identity/reference); a gate lands `schema-gated` `{message}`.
- db suites pass.

- [ ] **Step 1: Rewrite emitChange**

Replace lines 66-81 (drop the `EVENT` const at line 66):

```ts
// Write ops become past-tense facts (spec §4); REPLACE rides WRITE_OP's existing match.
const ROW_FACT: Record<string, string> = {
  insert: "row-inserted",
  update: "row-updated",
  delete: "row-deleted",
  replace: "row-replaced",
};

function emitChange(appId: string, sql: string): void {
  const op = WRITE_OP.exec(sql)?.[1]?.toLowerCase();
  const type = op ? ROW_FACT[op] : undefined;
  if (!type) return;
  const table = TABLE_OF.exec(sql)?.[1];
  emitEvent({
    app: appId, kind: "service", component: CATALOG_NAME, type,
    payload: table ? { table } : undefined,
    ttl: CHANGE_FEED_TTL_S,
  });
}
```

- [ ] **Step 2: Rewrite emitSchemaState and its call sites**

Replace lines 184-186:

```ts
function emitSchemaFact(appId: string, type: "schema-applied" | "schema-gated", message?: string): void {
  emitEvent({ app: appId, kind: "service", component: CATALOG_NAME, type, payload: message ? { message } : undefined, ttl: CHANGE_FEED_TTL_S });
}
```

Call-site swaps — each `emitSchemaState(appId, { status: "gated", message })` (L202, 212, 222, 236, 248, 257, 275) becomes `emitSchemaFact(appId, "schema-gated", message)`; L279 `emitSchemaState(appId, { status: "applied", statements: statements.length })` becomes `emitSchemaFact(appId, "schema-applied")`.

- [ ] **Step 3: Sweep db suites for old assertions**

Run: `grep -n "db-store-change\|schema-state\|status: \"gated\"\|status: \"applied\"\|statements:" packages/runtime/tests/db-api.test.ts packages/runtime/tests/db-push.test.ts packages/runtime/tests/db-e2e.test.ts packages/runtime/tests/schema-drift.test.ts packages/runtime/tests/db.test.ts`
Mapping: filter `type: "db-store-change"` + asserted `payload.op` → the matching `row-*` type with `payload: {table?}`; `type: "schema-state"` + `payload.status "gated"` → `type: "schema-gated"`, `payload: {message}`; `"applied"` → `type: "schema-applied"`, payload `null` (drop any `statements` assertion).

- [ ] **Step 4: Run the task's suites**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/db-api.test.ts tests/db-push.test.ts tests/db-e2e.test.ts tests/schema-drift.test.ts tests/db.test.ts tests/table-query.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/services/db-store.ts packages/runtime/tests/
git commit -m "feat(runtime): db-store speaks row-* and schema-applied/gated facts (<bead-id>)"
```

---

### Task 5: Engine emitters — build, lifecycle, registry (+ the gated relay)

**Files:**
- Modify: `packages/runtime/src/build.ts:46-49, 162-167`
- Modify: `packages/runtime/src/appWorker.ts:110-113, 163-179`
- Modify: `packages/runtime/src/watcher.ts:30-36`
- Test: `packages/runtime/tests/events-wiring.test.ts` (server-state + watcher tests), `packages/runtime/tests/build.test.ts` / `build-start.test.ts` / `appWorker.test.ts` / `watcher.test.ts` / `server-errors.test.ts` (any event assertions)

**Interfaces:**
- Consumes: Task 2's `emitEvent`, `CHANGE_FEED_TTL_S` (drop `PLATFORM_NS` from imports in all three files — watcher keeps its `emitGatewayChange` import untouched until Task 8).
- Produces: `build-started`/`build-ready`/`build-failed` (`kind: "engine"`, `component: "build"`, default ttl, `{message}` on failure); `server-started`/`server-ready`/`server-failed` (`component: "lifecycle"`, 7 d ttl); `apps-changed` (`app: null`, `component: "registry"`); the appWorker fallback relays `schema-gated` as `kind: "service"`, `component: "db-store"`.

**Acceptance Criteria:**
- `BuildState.status` maps `building→build-started`, `ready→build-ready`, `error→build-failed {message}`; the two dashboard-build sites emit `build-ready`/`build-failed` with `app: "_dashboard"`.
- `ServerState.status` maps `starting→server-started`, `running→server-ready`, `error→server-failed {message}` with `ttl: CHANGE_FEED_TTL_S`.
- Watcher emits `{app: null, kind: "engine", component: "registry", type: "apps-changed"}` — debounce unchanged.
- The schema-push catch in appWorker emits `schema-gated` `{message}` attributed to db-store.
- Named suites pass.

- [ ] **Step 1: build.ts**

Replace `setState` (lines 46-49):

```ts
const BUILD_FACT = { building: "build-started", ready: "build-ready", error: "build-failed" } as const;

function setState(appId: string, state: BuildState): void {
  states.set(appId, state);
  emitEvent({
    app: appId, kind: "engine", component: "build", type: BUILD_FACT[state.status],
    payload: state.status === "error" ? { message: state.message } : undefined,
  });
  if (state.status === "error") emitLog("error", "build", "build failed", { stack: state.message }, appId);
```

Dashboard-build sites (lines 162-167):

```ts
    dashboardState = { status: "ready" };
    emitEvent({ app: "_dashboard", kind: "engine", component: "build", type: "build-ready" });
    startAppWorker(cfg, "_dashboard");
  } catch (e) {
    dashboardState = { status: "error", message: e instanceof Error ? e.message : String(e) };
    emitEvent({ app: "_dashboard", kind: "engine", component: "build", type: "build-failed", payload: { message: dashboardState.message } });
  }
```

- [ ] **Step 2: appWorker.ts**

Replace `setState` (lines 110-113):

```ts
const SERVER_FACT = { starting: "server-started", running: "server-ready", error: "server-failed" } as const;

function setState(appId: string, state: ServerState): void {
  states.set(appId, state);
  emitEvent({
    app: appId, kind: "engine", component: "lifecycle", type: SERVER_FACT[state.status],
    payload: state.status === "error" ? { message: state.message } : undefined,
    ttl: CHANGE_FEED_TTL_S,
  });
}
```

The gated fallback (line 172) becomes:

```ts
        emitEvent({ app: appId, kind: "service", component: "db-store", type: "schema-gated", payload: { message }, ttl: CHANGE_FEED_TTL_S });
```

- [ ] **Step 3: watcher.ts**

Line 34 becomes (drop `PLATFORM_NS` from the line-5 import, keeping `emitEvent`):

```ts
      emitEvent({ app: null, kind: "engine", component: "registry", type: "apps-changed" });
```

- [ ] **Step 4: Update the two wiring tests**

```ts
  it("worker lifecycle: a missing server bundle lands server-failed in the app's stream", () => {
    startAppWorker(cfg, "ghost");
    const { records } = queryEvents({ app: "ghost", type: "server-failed" });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: "engine", component: "lifecycle", payload: { message: "server bundle missing (not built)" } });
  });
```

In the watcher test, replace the counter line only:

```ts
    const count = () => queryEvents({ kind: "engine", type: "apps-changed" }).records.length;
```

and add, after the first successful poll:

```ts
    expect(queryEvents({ type: "apps-changed" }).records[0]).toMatchObject({ app: null, component: "registry" });
```

- [ ] **Step 5: Sweep and run the suites**

Run: `grep -n "build-state\|server-state\|apps-changed" packages/runtime/tests/build.test.ts packages/runtime/tests/build-start.test.ts packages/runtime/tests/appWorker.test.ts packages/runtime/tests/watcher.test.ts packages/runtime/tests/server-errors.test.ts packages/runtime/tests/task-worker.test.ts packages/runtime/tests/e2e.test.ts`
Apply the type/payload mapping to every hit (status → type per the two maps above; `payload.status` assertions become type assertions; `{message}` only on failures).

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/build.test.ts tests/build-start.test.ts tests/appWorker.test.ts tests/watcher.test.ts tests/server-errors.test.ts tests/events-wiring.test.ts -t "lifecycle|watcher"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/build.ts packages/runtime/src/appWorker.ts packages/runtime/src/watcher.ts packages/runtime/tests/
git commit -m "feat(runtime): engine emitters — build/lifecycle/registry facts (<bead-id>)"
```

---

### Task 6: settings & secret-store — value-*, secret-*, slot-*, defs-changed

**Files:**
- Modify: `packages/runtime/src/services/settings.ts:249-254` (+ call sites 87, 93, 297, 305, 379, 387)
- Modify: `packages/runtime/src/services/secret-store.ts:26-47` (+ call sites 105, 111, 154, 160, 166, 167, 212, 219)
- Test: `packages/runtime/tests/settings-api.test.ts` / `settings-e2e.test.ts` / `settings-store.test.ts` / `platform-settings.test.ts` / `secrets-api.test.ts` / `secrets-e2e.test.ts` / `secrets-slots.test.ts` (any event assertions)

**Interfaces:**
- Consumes: Task 2's `emitEvent`, `CHANGE_FEED_TTL_S` (drop `PLATFORM_NS` from event use in both files — settings.ts keeps it ONLY if used for non-event purposes; check with grep before removing the import).
- Produces:
  ```ts
  // settings.ts — replaces emitSettingsChange
  export function emitSettingsEvent(app: string | null, type: "value-set" | "value-cleared" | "defs-changed", key?: string): void
  // secret-store.ts — replaces emitSecretsChange
  type SecretFact = "secret-created" | "secret-updated" | "secret-deleted" | "slot-linked" | "slot-unlinked" | "defs-changed";
  function emitSecretEvent(app: string | null, type: SecretFact, payload?: Record<string, unknown>): void
  ```

**Acceptance Criteria:**
- Settings: app PUT → `value-set {key}`, app DELETE → `value-cleared {key}` (app stream); platform PUT/DELETE → same types with `app: null`; defs reload → `defs-changed`, no payload.
- Secrets: catalog POST/PUT/DELETE → `secret-created`/`secret-updated`/`secret-deleted` `{slug}` with `app: null`; link PUT/DELETE → `slot-linked`/`slot-unlinked` `{slot}` in the app stream; cascade on catalog delete → `slot-unlinked` `{slot}` per affected app; defs reload → `defs-changed`.
- No `"*"` sentinel remains in either file. Named suites pass.

- [ ] **Step 1: settings.ts**

Replace lines 249-254 (drop the `EVENT` const):

```ts
// Identity-only facts on the bus (spec §4): the write verb is the type, the key is
// the payload; a defs reload is its own fact ("refetch"), not a magic key.
export function emitSettingsEvent(app: string | null, type: "value-set" | "value-cleared" | "defs-changed", key?: string): void {
  emitEvent({ app, kind: "service", component: CATALOG_NAME, type, payload: key ? { key } : undefined, ttl: CHANGE_FEED_TTL_S });
}
```

Call-site swaps:
- L87 & L93 (defs): `emitSettingsChange(appId, "*")` → `emitSettingsEvent(appId, "defs-changed")`
- L297 (platform PUT): → `emitSettingsEvent(null, "value-set", key)`
- L305 (platform DELETE): → `emitSettingsEvent(null, "value-cleared", key)`
- L379 (app PUT): → `emitSettingsEvent(c.var.appId, "value-set", key)`
- L387 (app DELETE): → `emitSettingsEvent(c.var.appId, "value-cleared", key)`

- [ ] **Step 2: secret-store.ts**

Replace lines 26-47 (drop `const EVENT = "secrets-change"`):

```ts
// Identity-only facts (spec §4): catalog changes (app null) carry { slug }; an app's
// slot changes carry { slot } — names only, never values.
type SecretFact = "secret-created" | "secret-updated" | "secret-deleted" | "slot-linked" | "slot-unlinked" | "defs-changed";
function emitSecretEvent(app: string | null, type: SecretFact, payload?: Record<string, unknown>): void {
  emitEvent({ app, kind: "service", component: CATALOG_NAME, type, payload, ttl: CHANGE_FEED_TTL_S });
}
```

Call-site swaps:
- L105 & L111 (defs): → `emitSecretEvent(appId, "defs-changed")`
- L154 (catalog POST): → `emitSecretEvent(null, "secret-created", { slug: meta.slug })`
- L160 (catalog PUT): → `emitSecretEvent(null, "secret-updated", { slug })`
- L166 (catalog DELETE): → `emitSecretEvent(null, "secret-deleted", { slug })`
- L167 (cascade): → `for (const l of removedLinks) emitSecretEvent(l.appId, "slot-unlinked", { slot: l.slot }); // cascaded → pending`
- L212 (link PUT): → `emitSecretEvent(c.var.appId, "slot-linked", { slot })`
- L219 (link DELETE): → `emitSecretEvent(c.var.appId, "slot-unlinked", { slot })`

- [ ] **Step 3: Sweep and run the suites**

Run: `grep -rn "settings-change\|secrets-change" packages/runtime/tests/ packages/runtime/src/`
Expected after edits: hits only in dashboard/ (Task 12) — fix any remaining `src/` or `tests/` hit with the mapping above (e.g. a filter `{ns: "_platform", type: "secrets-change"}` becomes `{kind: "service", component: "secret-store", type: "secret-created"}` per the asserted verb).

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/settings-api.test.ts tests/settings-e2e.test.ts tests/settings-store.test.ts tests/platform-settings.test.ts tests/settings-schema.test.ts tests/secrets-api.test.ts tests/secrets-e2e.test.ts tests/secrets-slots.test.ts tests/secrets-store.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/runtime/src/services/settings.ts packages/runtime/src/services/secret-store.ts packages/runtime/tests/
git commit -m "feat(runtime): settings/secrets speak value-*/secret-*/slot-* facts (<bead-id>)"
```

---

### Task 7: tasks & taskEngine — run-* facts and defs-changed

**Files:**
- Modify: `packages/runtime/src/services/tasks.ts:377-387` (+ call sites 467, 487)
- Modify: `packages/runtime/src/taskEngine.ts:64, 72-73, 88, 127, 142, 158` (import at line 12)
- Test: `packages/runtime/tests/events-wiring.test.ts` (task test), `packages/runtime/tests/tasks-api.test.ts` / `task-engine.test.ts` / `tasks-e2e.test.ts` / `task-schedule.test.ts` / `build-tasks.test.ts` (any event assertions)

**Interfaces:**
- Consumes: Task 2's `emitEvent`, `CHANGE_FEED_TTL_S`; existing `RunState` (`"queued" | "running" | "succeeded" | "failed" | "canceled"`, tasks.ts:31).
- Produces (replaces `emitTasksChange`):
  ```ts
  export function emitRunEvent(appId: string, task: string, runId: number, state: RunState): void  // type = RUN_FACT[state]
  export function emitTaskDefsChanged(appId: string): void                                          // type = "defs-changed", no payload
  ```

**Acceptance Criteria:**
- State→type map: `queued→run-queued`, `running→run-started`, `succeeded→run-succeeded`, `failed→run-failed`, `canceled→run-canceled`; payload always `{task, runId}`.
- The startup reconcile (`recoverInterruptedRuns`) emits `run-queued`/`run-failed` through the same helper.
- Defs reload / load error emits `defs-changed` with no payload — `{task: "*"}` is gone.
- Named suites pass.

- [ ] **Step 1: tasks.ts helpers**

Replace lines 377-387 (drop the `EVENT` const):

```ts
// Run transitions are past-tense facts (spec §4): the state is the type, the payload
// carries identity only. A module load error emits defs-changed — the stack lives in
// the adjacent tasks-source log record, and a full stack could blow the payload cap.
const RUN_FACT: Record<RunState, string> = {
  queued: "run-queued",
  running: "run-started",
  succeeded: "run-succeeded",
  failed: "run-failed",
  canceled: "run-canceled",
};

export function emitRunEvent(appId: string, task: string, runId: number, state: RunState): void {
  emitEvent({ app: appId, kind: "service", component: CATALOG_NAME, type: RUN_FACT[state], payload: { task, runId }, ttl: CHANGE_FEED_TTL_S });
}

export function emitTaskDefsChanged(appId: string): void {
  emitEvent({ app: appId, kind: "service", component: CATALOG_NAME, type: "defs-changed", ttl: CHANGE_FEED_TTL_S });
}
```

In-file call-site swaps: L467 → `emitRunEvent(c.var.appId, res.task, id, "canceled")`; L487 → `emitRunEvent(c.var.appId, name, runId, "queued")`.

- [ ] **Step 2: taskEngine.ts call sites**

Import swap at line 12: `emitTasksChange` → `emitRunEvent, emitTaskDefsChanged`. Then:
- L64: → `emitTaskDefsChanged(appId);`
- L72: → `emitTaskDefsChanged(appId); // defs changed — dashboard refetches`
- L73: → `for (const c of canceled) emitRunEvent(appId, c.task, c.runId, "canceled");`
- L88: → `emitRunEvent(app.appId, t.task, t.runId, t.state);`
- L127: → `emitRunEvent(appId, def.name, runId, "queued");`
- L142: → `emitRunEvent(appId, run.task, run.id, "running");`
- L158: → `emitRunEvent(appId, run.task, run.id, outcome.state);`

- [ ] **Step 3: Update the task wiring test**

```ts
  it("task enqueue lands run-queued with identity-only payload and the service ttl", async () => {
    const { Hono } = await import("hono");
    const { apiRoutes } = await import("../src/routes.js");
    const { getTasksDb, applyManifest } = await import("../src/services/tasks.js");
    applyManifest(getTasksDb(cfg.dataDir, "notes"), [{ name: "resize" }], Date.now(), { minEveryMs: 60_000 });
    const app = new Hono().route("/api", apiRoutes(cfg));
    const res = await app.request("/api/apps/notes/tasks/resize/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const { records } = queryEvents({ app: "notes", type: "run-queued" });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: "service", component: "tasks", payload: { task: "resize" } });
    expect(records[0].payload).toHaveProperty("runId");
    expect(records[0].payload).not.toHaveProperty("state");
    // Service ttl (7 days): past the window the record no longer queries.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 8 * 86_400_000);
    expect(queryEvents({ app: "notes", type: "run-queued" }).records).toHaveLength(0);
    vi.useRealTimers();
  });
```

- [ ] **Step 4: Sweep and run the suites**

Run: `grep -n "tasks-change\|emitTasksChange\|state: \"queued\"\|task: \"\*\"" packages/runtime/tests/tasks-api.test.ts packages/runtime/tests/task-engine.test.ts packages/runtime/tests/tasks-e2e.test.ts packages/runtime/tests/task-schedule.test.ts packages/runtime/tests/build-tasks.test.ts packages/runtime/tests/scheduler.test.ts`
Mapping: filter `type: "tasks-change"` + asserted `state` → the `run-*` type; `{task: "*"}` assertions → `type: "defs-changed"`, no payload.

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/tasks-api.test.ts tests/task-engine.test.ts tests/tasks-e2e.test.ts tests/task-schedule.test.ts tests/build-tasks.test.ts tests/events-wiring.test.ts -t "task enqueue"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/services/tasks.ts packages/runtime/src/taskEngine.ts packages/runtime/tests/
git commit -m "feat(runtime): task runs speak run-* facts; defs-changed replaces the * sentinel (<bead-id>)"
```

---

### Task 8: gateways — the connection/breaker/provider fact set

**Files:**
- Modify: `packages/runtime/src/gatewayEvents.ts` (full rewrite)
- Modify: `packages/runtime/src/gatewayEngine.ts:386, 427, 430, 436, 439` (import line 11)
- Modify: `packages/runtime/src/gatewayOauth.ts:140, 160, 180` (import line 17)
- Modify: `packages/runtime/src/services/gateways.ts:106, 112, 369, 379, 392, 402` (import line 19)
- Modify: `packages/runtime/src/watcher.ts:119` (import line 10)
- Test: `packages/runtime/tests/gateway-*.test.ts`, `gateways-*.test.ts` (any event assertions)

**Interfaces:**
- Consumes: Task 2's `emitEvent`, `CHANGE_FEED_TTL_S`.
- Produces (replaces `emitGatewayChange` + `emitGatewayHealth`):
  ```ts
  export type GatewayFact =
    | "connection-linked" | "connection-unlinked" | "connection-configured" | "connection-cleared" | "connection-authorized"
    | "connection-recovered" | "connection-failed" | "auth-expired"
    | "breaker-opened" | "breaker-closed" | "provider-changed" | "defs-changed";
  export function emitGatewayEvent(app: string | null, type: GatewayFact, payload?: Record<string, unknown>): void
  ```

**Acceptance Criteria:**
- Health statuses translate: `ok → connection-recovered`, `unhealthy → connection-failed`, `needs_reauth → auth-expired` — payload `{alias, provider}`. Breaker: `breaker-opened`/`breaker-closed` `{provider}`, `app: null`.
- Slot routes emit `connection-linked`/`-unlinked`/`-configured`/`-cleared` `{alias, slot}` (payloads gain the `slot` the old feed dropped); OAuth completion emits `connection-authorized` `{alias}`.
- Manifest reload (watcher) emits `provider-changed` `{provider}`, `app: null`; defs reload emits `defs-changed`.
- Gateway suites pass.

- [ ] **Step 1: Rewrite gatewayEvents.ts**

```ts
// The gateways fact set (spec 2026-07-16-events §4). Kept in its own module so the
// request engine, oauth, store, and service router can all emit without import
// cycles. Names only — never a credential or token.
import { emitEvent, CHANGE_FEED_TTL_S } from "./events.js";

export type GatewayFact =
  | "connection-linked" | "connection-unlinked" | "connection-configured" | "connection-cleared" | "connection-authorized"
  | "connection-recovered" | "connection-failed" | "auth-expired"
  | "breaker-opened" | "breaker-closed" | "provider-changed" | "defs-changed";

/** Connection facts ride the app's stream ({ alias, ... }); catalog-level facts
 *  (breaker, provider manifest) are platform-wide (app null, { provider }). */
export function emitGatewayEvent(app: string | null, type: GatewayFact, payload?: Record<string, unknown>): void {
  emitEvent({ app, kind: "service", component: "gateways", type, payload, ttl: CHANGE_FEED_TTL_S });
}
```

- [ ] **Step 2: gatewayEngine.ts call sites**

Import swap (line 11): `emitGatewayHealth` → `emitGatewayEvent`; drop the now-unused `PLATFORM_NS` import if the file has no other use (verify with grep).
- L386 & L427: `if (opened) emitGatewayHealth(PLATFORM_NS, { provider: providerId, breaker: "open" });` → `if (opened) emitGatewayEvent(null, "breaker-opened", { provider: providerId });`
- L430: → `if (closed) emitGatewayEvent(null, "breaker-closed", { provider: providerId });`
- L436: → `emitGatewayEvent(appId, "connection-failed", { alias, provider: providerId });`
- L439: → `emitGatewayEvent(appId, "connection-recovered", { alias, provider: providerId });`

- [ ] **Step 3: gatewayOauth.ts call sites**

Import swap (line 17): both helpers → `emitGatewayEvent`.
- L140: `emitGatewayChange(p.appId, p.alias);` → `emitGatewayEvent(p.appId, "connection-authorized", { alias: p.alias });`
- L160 & L180: `emitGatewayHealth(appId, { alias, provider: providerId, status: "needs_reauth" });` → `emitGatewayEvent(appId, "auth-expired", { alias, provider: providerId });`

- [ ] **Step 4: services/gateways.ts call sites**

Import swap (line 19). The four slot routes have `slot` in scope from `c.req.valid("param")` — payloads gain it per spec §4:
- L106 & L112 (defs): → `emitGatewayEvent(appId, "defs-changed");`
- L369 (link PUT): → `emitGatewayEvent(c.var.appId, "connection-linked", { alias, slot });`
- L379 (link DELETE): → `emitGatewayEvent(c.var.appId, "connection-unlinked", { alias, slot });`
- L392 (value PUT): → `emitGatewayEvent(c.var.appId, "connection-configured", { alias, slot });`
- L402 (value DELETE): → `emitGatewayEvent(c.var.appId, "connection-cleared", { alias, slot });`

- [ ] **Step 5: watcher.ts manifest reload**

Import swap (line 10) and L119: `for (const id of reloadGatewayManifests()) emitGatewayChange(PLATFORM_NS, id);` → `for (const id of reloadGatewayManifests()) emitGatewayEvent(null, "provider-changed", { provider: id });`

- [ ] **Step 6: Sweep and run the suites**

Run: `grep -rn "gateway-change\|gateway-health\|emitGatewayChange\|emitGatewayHealth\|breaker: \"open\"\|status: \"unhealthy\"\|status: \"needs_reauth\"" packages/runtime/tests/ packages/runtime/src/`
Expected after edits: hits only under dashboard/ (Task 12). Mapping for test assertions: `gateway-health` + `payload.status`/`payload.breaker` → the matching fact type with `{alias, provider}` / `{provider}`; `gateway-change` on an app ns → the `connection-*` verb of the route under test; `gateway-change` on `_platform` → `provider-changed`.

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/gateway-engine.test.ts tests/gateway-guards.test.ts tests/gateway-manifests.test.ts tests/gateway-oauth.test.ts tests/gateway-settings.test.ts tests/gateways-api.test.ts tests/gateways-e2e.test.ts tests/gateways-store.test.ts tests/gateways-uses.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/runtime/src/gatewayEvents.ts packages/runtime/src/gatewayEngine.ts packages/runtime/src/gatewayOauth.ts packages/runtime/src/services/gateways.ts packages/runtime/src/watcher.ts packages/runtime/tests/
git commit -m "feat(runtime): gateways speak the connection/breaker/provider fact set (<bead-id>)"
```

---

### Task 9: Cleanup gate — delete PLATFORM_NS, full runtime suite green

**Files:**
- Modify: `packages/runtime/src/events.ts` (delete the `PLATFORM_NS` export)
- Modify: any straggler found by the greps below

**Interfaces:**
- Consumes: Tasks 3–8 complete (no emitter imports `PLATFORM_NS`).
- Produces: a runtime package with zero references to `ns`/`source` event vocabulary; log-store's inline `"_platform"` literals (`logStore.ts:30,101`, `routes.ts:74`) are the only survivors — deliberately untouched (follow-up slice).

**Acceptance Criteria:**
- `grep -rn "PLATFORM_NS" packages/runtime/src/` → no hits. `grep -rn "kv-store-change\|file-store-change\|db-store-change\|settings-change\|secrets-change\|tasks-change\|gateway-change\|gateway-health\|build-state\|server-state\|schema-state" packages/runtime/src/ packages/runtime/tests/` → hits only under `packages/runtime/dashboard/` (Task 12 clears those).
- The complete `@lodekit/runtime` suite is green.

- [ ] **Step 1: Delete the export**

Remove the `PLATFORM_NS` constant and its comment from `packages/runtime/src/events.ts` (added-back note in Task 2 Step 1). Run the two greps above; fix any straggler using the task-level mappings.

- [ ] **Step 2: Full runtime suite**

Run: `pnpm --filter @lodekit/runtime test`
Expected: PASS — every suite, including `events-wiring.test.ts` end to end.

- [ ] **Step 3: Commit**

```bash
git add -A packages/runtime
git commit -m "refactor(runtime): retire PLATFORM_NS from the event bus (<bead-id>)"
```

---

### Task 10: SDK — envelope, watch filters, list params, settings.watch

**Files:**
- Modify: `packages/sdk/src/client.ts:19-32` (types), `444-475` (events impl), `489-495` (settings.watch)
- Test: `packages/sdk/tests/client.test.ts`

**Interfaces:**
- Consumes: the wire envelope `{id, ts, app, kind, component, type, payload}` (Task 2); scoped GET params (Task 2).
- Produces (spec §6; Greenhouse and the skill docs rely on these):
  ```ts
  export interface LodekitEvent<T extends Record<string, unknown> = Record<string, unknown>> {
    id: number; ts: number; app: string | null; kind: string; component: string; type: string; payload: T | null;
  }
  export interface Events {
    emit(type: string, payload?: Record<string, unknown>, opts?: { ttl?: number }): Promise<LodekitEvent>;
    watch(filter: { kind?: string | string[]; component?: string | string[]; type?: string | string[] }, cb: (event: LodekitEvent) => void): () => void;
    list(opts?: { component?: string; type?: string; since?: number; until?: number; after?: number; before?: number; limit?: number }): Promise<{ records: LodekitEvent[]; next: number | null }>;
  }
  ```

**Acceptance Criteria:**
- `watch` matches every given filter dimension (string or array, AND across dimensions); `emit` signature unchanged; `list` forwards the new params.
- `settings.watch` fires on `value-set`/`value-cleared` from the settings component (it no longer fires on a defs reload — the old `key: "*"` callback dies with the sentinel).
- SDK suite passes.

- [ ] **Step 1: Update the types (client.ts:19-32)** — paste the Produces block over the existing `LodekitEvent`/`Events` definitions.

- [ ] **Step 2: Update the events implementation**

`watch` and `list` inside the `events` object (emit is unchanged):

```ts
    watch(filter, cb) {
      const norm = (v?: string | string[]) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);
      const kinds = norm(filter.kind);
      const components = norm(filter.component);
      const types = norm(filter.type);
      return channel.on<LodekitEvent>(
        "event",
        (ev) =>
          (!kinds || kinds.includes(ev.kind)) &&
          (!components || components.includes(ev.component)) &&
          (!types || types.includes(ev.type)),
        cb
      );
    },
    async list(opts = {}) {
      const query: Record<string, string> = {};
      if (opts.component !== undefined) query.component = opts.component;
      if (opts.type !== undefined) query.type = opts.type;
      if (opts.since !== undefined) query.since = String(opts.since);
      if (opts.until !== undefined) query.until = String(opts.until);
      if (opts.after !== undefined) query.after = String(opts.after);
      if (opts.before !== undefined) query.before = String(opts.before);
      if (opts.limit !== undefined) query.limit = String(opts.limit);
      return (await parse(await eventsRpc.index.$get({ query }))) as {
        records: LodekitEvent[];
        next: number | null;
      };
    },
```

- [ ] **Step 3: Update settings.watch (client.ts:489-495)**

```ts
    watch(cb) {
      return channel.on<{ component: string; type: string; payload: { key: string } | null }>(
        "event",
        (ev) => ev.component === "settings" && (ev.type === "value-set" || ev.type === "value-cleared"),
        (ev) => cb({ key: ev.payload?.key ?? "" })
      );
    },
```

- [ ] **Step 4: Update the SDK tests**

In `packages/sdk/tests/client.test.ts`, extend the `envelope` helper's defaults with the new fields (`app: "notes", kind: "service", component: "kv-store"` unless overridden). Update the watch test to the new filters:

```ts
  it("watch filters by kind/component/type, shares one EventSource, closes on last unsubscribe", () => {
    (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
    FakeEventSource.instances = [];
    const c = createClient({ baseUrl: "http://x", appId: "notes" });
    const seen: string[] = [];
    const un1 = c.events.watch({ component: "kv-store" }, (ev) => seen.push(`kv:${(ev.payload as { key: string }).key}`));
    const un2 = c.events.watch({}, (ev) => seen.push(`any:${ev.type}`));
    const un3 = c.events.watch({ kind: "service", type: ["key-set"] }, (ev) => seen.push(`and:${ev.type}`));
    expect(FakeEventSource.instances).toHaveLength(1);
    const es = FakeEventSource.instances[0];
    expect(es.url).toBe("http://x/api/apps/notes/events");
    es.dispatch("event", envelope({ id: 2, kind: "service", component: "kv-store", type: "key-set", payload: { key: "k1" } }));
    es.dispatch("event", envelope({ id: 3, kind: "app", component: "notes", type: "export-ready" }));
    expect(seen).toEqual(["kv:k1", "any:key-set", "and:key-set", "any:export-ready"]);
    un1(); un3();
    expect(es.closed).toBe(false);
    un2();
    expect(es.closed).toBe(true);
    delete (globalThis as { EventSource?: unknown }).EventSource;
  });
```

Update the array-filter test to `{ component: ["kv-store", "db-store"] }` dispatching a `key-set` and a `row-inserted` envelope. Update the list test:

```ts
  it("list builds query params and returns records + next", async () => {
    const c = createClient({ baseUrl: "http://x", appId: "notes" });
    fetchMock.mockResolvedValueOnce(okJson({ records: [], next: null }));
    await c.events.list({ component: "kv-store", type: "key-set", since: 1, after: 5, limit: 10 });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://x/api/apps/notes/event-store?component=kv-store&type=key-set&since=1&after=5&limit=10"
    );
  });
```

If a settings.watch test exists, its trigger envelope becomes `envelope({ component: "settings", type: "value-set", payload: { key: "theme" } })` and a `defs-changed` dispatch must NOT fire the callback.

- [ ] **Step 5: Run the suite**

Run: `pnpm --filter @lodekit/sdk test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk
git commit -m "feat(sdk): canonical event envelope + kind/component watch filters (<bead-id>)"
```

---

### Task 11: MCP — lodekit_events params + integration test

**Files:**
- Modify: `packages/mcp/client.ts:34-47`
- Modify: `packages/mcp/index.ts:49-58`
- Test: `packages/integration-tests/tests/mcp.test.ts:95-108`

**Interfaces:**
- Consumes: `GET /api/events/history` params (Task 2).
- Produces:
  ```ts
  export async function fetchEvents(base: string, params?: { app?: string; kind?: string; component?: string; type?: string; since?: number; after?: number; limit?: number }): Promise<unknown>
  ```

**Acceptance Criteria:**
- The `"_platform"` sentinel description is deleted; `appId` param is renamed `app`; new `kind`/`component`/`since` params forward to the history endpoint.
- The integration test proves `key-set` and `apps-changed` are reachable through the helper end-to-end.

- [ ] **Step 1: client.ts**

```ts
export async function fetchEvents(
  base: string,
  params: { app?: string; kind?: string; component?: string; type?: string; since?: number; after?: number; limit?: number } = {}
) {
  const query = new URLSearchParams();
  if (params.app) query.set("app", params.app);
  if (params.kind) query.set("kind", params.kind);
  if (params.component) query.set("component", params.component);
  if (params.type) query.set("type", params.type);
  if (params.since != null) query.set("since", String(params.since));
  if (params.after != null) query.set("after", String(params.after));
  if (params.limit != null) query.set("limit", String(params.limit));
  const qs = query.toString();
  const r = await fetch(`${base}/api/events/history${qs ? `?${qs}` : ""}`);
  if (!r.ok) throw new Error(`events fetch failed: ${r.status}`);
  return r.json();
}
```

- [ ] **Step 2: index.ts tool definition**

```ts
server.tool(
  "lodekit_events",
  {
    app: z.string().optional().describe("filter to one app's stream (an app id); omit for everything"),
    kind: z.enum(["engine", "service", "app"]).optional().describe("class of emitter: the engine, a catalog service, or an app"),
    component: z.string().optional().describe('emitting component, e.g. "kv-store", "build", or an app id'),
    type: z.string().optional().describe('event type — a past-tense fact, e.g. "key-set", or an app-defined type'),
    since: z.number().optional().describe("epoch ms lower bound on the event timestamp"),
    after: z.number().optional().describe("replay ascending from this event id (offset); omit for newest-first"),
    limit: z.number().optional(),
  },
  async (args) => text(await fetchEvents(BASE, args))
);
```

- [ ] **Step 3: Integration test**

Replace the two polls in `mcp.test.ts:95-108`:

```ts
    await expect
      .poll(async () => (await fetchEvents(base, { app: "pantry", component: "kv-store", type: "key-set" })).records, { timeout: 10_000 })
      .toHaveLength(1);
    // apps-changed only fires once the watcher's fs-change debounce elapses, unlike
    // key-set above (emitted synchronously by the kv route) — poll for it too.
    await expect
      .poll(async () => (await fetchEvents(base, { kind: "engine", type: "apps-changed" })).records.length, { timeout: 10_000 })
      .toBeGreaterThan(0); // the scaffold's registry churn
```

- [ ] **Step 4: Run the suites**

Run: `pnpm --filter @lodekit/mcp test; pnpm --filter @lodekit/integration-tests test`
Expected: PASS (integration test spins up a real runtime — needs the migrated emitters, hence after Task 9).

- [ ] **Step 5: Commit**

```bash
git add packages/mcp packages/integration-tests
git commit -m "feat(mcp): lodekit_events speaks app/kind/component (<bead-id>)"
```

---

### Task 12: Dashboard consumers + appHost interstitial

**Files:**
- Modify: `packages/runtime/dashboard/src/components/sse.tsx:23-55`
- Modify: `packages/runtime/dashboard/src/routes/index.tsx:87-101`
- Modify: `packages/runtime/dashboard/src/routes/events.tsx` (field renames only — Explorer v2 is PR 2)
- Modify: `packages/runtime/dashboard/src/routes/gateways.tsx:38-43`, `routes/gateways_.$providerId.tsx:199-202`
- Modify: `packages/runtime/src/appHost.ts:18`
- Test: `packages/runtime/tests/dashboard.test.ts`, `packages/runtime/tests/appHost.test.ts` (any envelope assertions)

**Interfaces:**
- Consumes: the wire envelope `{id, ts, app, kind, component, type, payload}`; the platform pages' query keys `["settings", "_platform"]` / `["secrets", "_platform"]` (logo.tsx:55, settings.tsx:380) stay as-is — the switchboard maps `app: null` onto the `"_platform"` key slot.

**Acceptance Criteria:**
- The invalidation switchboard keys on `component` (one branch each for settings, secret-store, kv-store, db-store, file-store, tasks) + the `apps-changed` type; null-app events invalidate the `"_platform"`-keyed queries.
- Home tiles derive build/server status from the fact types; events view renders `app`/`component` columns and filters by `app`; gateways views key on `component`; the interstitial reloads on engine `build-*`/`server-*` for its own app.
- Dashboard-related suites pass.

- [ ] **Step 1: sse.tsx switchboard**

Replace the `event` listener body (lines 33-51):

```tsx
    es.addEventListener("event", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data) as { app: string | null; kind: string; component: string; type: string };
        // Platform pages key their queries on "_platform"; on the bus that stream is app null.
        const appKey = d.app ?? "_platform";
        if (d.type === "apps-changed") void queryClient.invalidateQueries({ queryKey: ["apps"] });
        if (d.component === "settings") void queryClient.invalidateQueries({ queryKey: ["settings", appKey] });
        if (d.component === "secret-store") void queryClient.invalidateQueries({ queryKey: ["secrets", appKey] });
        if (d.component === "kv-store") void queryClient.invalidateQueries({ queryKey: ["kv", appKey] });
        if (d.component === "db-store" || d.component === "file-store") {
          void queryClient.invalidateQueries({ queryKey: ["data", appKey, "summary"] });
        }
        if (d.component === "db-store") void queryClient.invalidateQueries({ queryKey: ["data", appKey, "schema"] });
        if (d.component === "file-store") void queryClient.invalidateQueries({ queryKey: ["data", appKey, "files"] });
        if (d.component === "tasks") {
          void queryClient.invalidateQueries({ queryKey: ["tasks", appKey] });
          void queryClient.invalidateQueries({ queryKey: ["task-runs", appKey] });
        }
      } catch {
        // malformed frame: skip invalidation, still fan out below
      }
      onEvent(e);
    });
```

- [ ] **Step 2: index.tsx build/server tiles**

Replace lines 87-101:

```tsx
  // build/server state is stream-only (no fetchable snapshot) — accumulate from SSE.
  const BUILD_STATUS: Record<string, BuildStatus["status"]> = {
    "build-started": "building", "build-ready": "ready", "build-failed": "error",
  };
  const SERVER_STATUS: Record<string, ServerStatus["status"]> = {
    "server-started": "starting", "server-ready": "running", "server-failed": "error",
  };
  useSSEEvent("event", (e) => {
    const d = JSON.parse(e.data) as {
      app: string | null;
      kind: string;
      type: string;
      payload: { message?: string } | null;
    };
    if (d.kind !== "engine" || !d.app) return;
    const app = d.app;
    const b = BUILD_STATUS[d.type];
    if (b) setStates((s) => ({ ...s, [app]: { status: b, message: d.payload?.message } }));
    const sv = SERVER_STATUS[d.type];
    if (sv) setServerStates((s) => ({ ...s, [app]: { status: sv, message: d.payload?.message } }));
  });
```

(Move the two maps above the component if the file's lint prefers module scope; they are constant.)

- [ ] **Step 3: events.tsx minimal rename**

Mechanical renames only (Explorer v2 lands in PR 2):
- `EventRecord`: `ns: string; source: string` → `app: string | null; kind: string; component: string`.
- `const INTERNAL_NS = ["_platform", "_dashboard"]` → `const INTERNAL_APPS = ["_dashboard"]` (platform-wide events have no app id to select; the option disappears until PR 2's explorer).
- `validateSearch`: `{ ns?: string }` → `{ app?: string }` (same shape, key renamed); `Route.useSearch()` destructure and `setNs` → `setApp`, navigating `{ app: value }`.
- `filterQuery`: `if (app) query.set("app", app);` (was `ns`).
- Live-tail filter: `(app && r.app !== app)` (was `r.ns !== ns`); `filtersRef` carries `app`.
- Row meta line: `{r.app ?? "platform"}{r.component !== r.app ? `·${r.component}` : ""}` (was `{r.ns}{r.source !== r.ns ? … }`).
- The `<select>` maps `INTERNAL_APPS` then `apps`; label `All namespaces` → `All apps`.

- [ ] **Step 4: gateways views**

`gateways.tsx:38-43`:

```tsx
  useSSEEvent("event", (e) => {
    const d = JSON.parse(e.data) as { component: string };
    if (d.component === "gateways") {
      void queryClient.invalidateQueries({ queryKey: ["gateways"] });
    }
  });
```

`gateways_.$providerId.tsx:199-202`:

```tsx
  useSSEEvent("event", (e) => {
    const d = JSON.parse(e.data) as { component: string };
    if (d.component === "gateways" || d.component === "secret-store") invalidate();
  });
```

- [ ] **Step 5: appHost.ts interstitial**

Line 18's inline script condition becomes (kind guard keeps app-emitted `build-*`-shaped types from reloading the page):

```ts
if(d.app===${JSON.stringify(title)}&&d.kind==="engine"&&(d.type.indexOf("build-")===0||d.type.indexOf("server-")===0))location.reload()
```

- [ ] **Step 6: Sweep and run**

Run: `grep -rn "\.ns\b\|source\|-change\|build-state\|server-state" packages/runtime/dashboard/src/ packages/runtime/src/appHost.ts`
Expected: no event-envelope hits remain (unrelated `source` identifiers — e.g. log-store columns in a logs view — stay).

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/dashboard.test.ts tests/appHost.test.ts tests/ui-serving.test.ts && pnpm --filter @lodekit/runtime test`
Expected: PASS (full suite again — this task touched runtime src).

- [ ] **Step 7: Commit**

```bash
git add packages/runtime/dashboard packages/runtime/src/appHost.ts packages/runtime/tests/
git commit -m "feat(dashboard): consume the canonical envelope — component switchboard, fact-typed tiles (<bead-id>)"
```

---

### Task 13: Greenhouse, README DoD, skill docs + workspace green

**Files:**
- Modify: `root/apps/greenhouse/src/routes/index.tsx:42-47`, `plants.$plantId.tsx:64-73`, `almanac.tsx:119-126`
- Modify: `root/README.md:39, 48, 54`
- Modify: `packages/skill/SKILL.md:80-81, 128-144`

**Interfaces:**
- Consumes: Task 10's SDK `events.watch` filters.

**Acceptance Criteria:**
- Greenhouse watches by `component`; the almanac live flag derives from `run-started`.
- README DoD rows quote the new filters; skill docs teach the new envelope, watch filters, and the past-tense type rule for app-emitted events.
- `pnpm test` (workspace) passes; Greenhouse smoke via `pnpm dev` renders and live-refreshes.

- [ ] **Step 1: Greenhouse watch sites**

`index.tsx:42-47`:

```tsx
  // useEffect (not module scope) keeps the watch off the SSR path — it's client-only.
  // Entity writes ride db-store facts; streak/snooze (app memory) ride kv-store facts.
  useEffect(
    () => events.watch({ component: ["db-store", "kv-store"] }, () => void router.invalidate()),
    [router]
  );
```

`plants.$plantId.tsx:64-73`:

```tsx
  // The file change feed rides the event bus; slug filtering happens in the callback
  // (payloads carry identity, not values — {slug}).
  useEffect(
    () =>
      events.watch({ component: "file-store" }, (ev) => {
        const slug = (ev.payload as { slug?: string } | undefined)?.slug;
        if (slug?.startsWith(`photo-${id}-`)) refresh();
      }),
    [id]
  );
```

`almanac.tsx:119-126`:

```tsx
  useEffect(
    () =>
      events.watch({ component: "tasks" }, (ev) => {
        setLive(ev.type === "run-started");
        void refetch();
      }),
    [refetch]
  );
```

- [ ] **Step 2: README DoD rows**

Line 39: `| `events.watch {component: array}` | conservatory refresh on `["db-store", "kv-store"]` |`
Line 48: `| `events.watch {component: "file-store"}` | photo timeline live refresh (slug filter in the callback) |`
Line 54: `| `events.watch {component: "tasks"}` | almanac live indicator |`
(The pending Part 2 rows — `events.emit`, `events.list`, Ledger, While You Were Away — stay pending, wording untouched.)

- [ ] **Step 3: Skill docs**

Replace `packages/skill/SKILL.md` lines 128-144 with:

```md
## Events (event-store)

The platform event bus — durable, replayable messages that drive app behavior. Every
event is addressed (`app` — whose stream) and attributed (`kind` + `component` — what
class of platform member emitted it, and which instance): a kv write in your app is
`{app, kind: "service", component: "kv-store", type: "key-set", payload: {key}}`.
Import: `import { events } from "@lodekit/sdk"`.

- `await events.emit(type, payload?, { ttl? })` — announce something happened. Name
  types as past-tense facts, `<subject>-<verb-ed>` (`export-finished`, `note-added`) —
  matching `^[a-z0-9-]+$`; payload is a small JSON object carrying identity and
  references, never statuses (the status IS the type). Works in server functions and
  the browser; returns the stored event with its `id` offset. Your events land with
  `kind: "app"`, `component` = your app id.
- `events.watch({ kind?, component?, type? }, cb)` — client-only live subscription
  (keep it in `useEffect`); each filter is a string or array, dimensions AND together.
  The canonical live-data pattern:
  `events.watch({ component: "kv-store" }, () => queryClient.invalidateQueries({ queryKey: ["kv"] }))`
  — one component filter covers all its facts (`key-set`, `key-deleted`, `key-expired`).
- `await events.list({ component?, type?, since?, until?, after?, before?, limit? })` —
  replay the app's stream (includes platform facts about the app: `build-*` and
  `server-*` from the engine).
- **Via MCP**: `lodekit_events` (`app`, `kind`, `component`, `type`, `since`, `after`,
  `limit`) reads the history — use it to check whether an expected event actually fired.
```

Lines 80-81 (data-store chapter) become:

```md
- Live refresh: `events.watch({ component: "db-store" }, () => …invalidate…)` —
  same pattern as the kv feed; payloads carry identity (`{ table }`), never values.
```

- [ ] **Step 4: Workspace suite + smoke**

Run: `pnpm test`
Expected: PASS (all workspace packages).
Run: `LODEKIT_ROOT=$(pwd)/root pnpm --filter @lodekit/runtime start` — open Greenhouse, add a plant, confirm the conservatory live-refreshes (db-store fact) and the dashboard Events view shows `key-set`/`row-inserted` rows. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add root packages/skill
git commit -m "feat(runtime): greenhouse + skill docs speak component watch filters (<bead-id>)"
```

---

### Task 14: Canon & changelog — CONTEXT.md, AGENTS.md, docs/changelog.md

**Files:**
- Modify: `CONTEXT.md` (entries per spec §2 — normative text)
- Modify: `AGENTS.md` (architecture prose only; `CLAUDE.md` is a symlink — do not touch it separately)
- Modify: `docs/changelog.md` (append under `## New`)

**Interfaces:**
- Consumes: spec §2's entry texts (copy verbatim — they are normative for this edit).

**Acceptance Criteria:**
- CONTEXT.md: **Platform** and **Engine** entries replaced with spec §2's text; **Kind**, **Component**, **Internal app** added; **Runtime** and **Internal namespace** deleted (Runtime's `_Avoid_` list folds into Engine's); **Event**/**Event Store** entries updated to "addressed (`app`) and attributed (`kind` + `component`)"; the type-naming rule added; every other `_platform`-as-emitter phrasing in the file reworded (grep `_platform` and `namespace` to find them — the data-tree/log-sentinel mentions survive with "internal app / platform-wide" wording per spec §2's "unchanged plumbing" note).
- AGENTS.md: architecture prose says "engine" for the process (package specifiers `@lodekit/runtime`, path `packages/runtime` unchanged — the rename is PR 4); no other sections touched.
- Changelog gains one `## New` entry; append-only.

- [ ] **Step 1: CONTEXT.md** — apply spec §2 verbatim (the five quoted entries + the two deletions + the Event/Event Store rewording + the type naming rule). Then run `grep -n "_platform\|amespace\|untime" CONTEXT.md` and reword every event-related survivor consistently with the new entries; leave the log-store sentinel and `data/_platform/` mentions factually intact (they describe unchanged plumbing).

- [ ] **Step 2: AGENTS.md** — in the Architecture section only, reword the `packages/runtime` bullet's prose: "the product. The **engine** — a single Node/Hono process (buildless, run via `tsx`) that is host + scoped API + dashboard + folder-watcher + SSE…" (keep every command, path, and package specifier byte-identical).

- [ ] **Step 3: Changelog** — append under `## New` in `docs/changelog.md`:

```md
- Events now say who did what: every event names its app, the platform member that
  emitted it (engine / service / app + component), and a past-tense fact type
  (`key-set`, `run-failed`, `build-ready`) — visible in the dashboard Events view,
  the SDK (`events.watch` can filter by component), and the `lodekit_events` MCP tool.
```

- [ ] **Step 4: File the spec's follow-up deferrals as beads** (spec §11 Backlog; orchestrator-only — subagents never touch beads)

```bash
bd create "log-store convergence: adopt kind/component, retire the app=_platform sentinel" -t task -l defer \
  -d "severity: medium / confidence: high. Provenance: spec docs/specs/2026-07-16-events-canonical-model-design.md §11 + PR 1. Adopt kind/component in log records and queries; retire the app=_platform query sentinel and its inline literals (logStore.ts:30,101, routes.ts:74); align emitLog call sites (build/lifecycle/host/scheduler become engine components; app/console become kind app with a channel field)."
bd create "registry diffing: app-installed/app-removed instead of apps-changed" -t task -l defer \
  -d "severity: low / confidence: medium. Provenance: spec docs/specs/2026-07-16-events-canonical-model-design.md §1/§4 non-goal. Only if it earns its keep — requires the watcher to compute diffs instead of debounced full rescans."
```

List both deferrals in the PR body.

- [ ] **Step 5: Verify + commit**

Run: `pnpm test`
Expected: PASS (unchanged — docs-only task; this is the final pre-PR gate).

```bash
git add CONTEXT.md AGENTS.md docs/changelog.md
git commit -m "docs: canon — platform/engine/kind/component vocabulary (<bead-id>)"
```

---

## PR

Branch `service` → PR titled `feat(runtime): canonical event model — app/kind/component + fact types` with Summary / Notes / Test plan sections; Notes must list: the `schema-applied` payload drops the `{statements}` count (spec payload rule); `settings.watch` no longer fires on defs reloads (the `"*"` sentinel died); `PLATFORM_NS` deleted rather than relocated (log-store already inlines its `"_platform"` literals — the spec's intent, one less export). The spec + this plan + ADR-0001 ride in the same PR. Merging is the person's call.
