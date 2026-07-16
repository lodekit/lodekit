# Events Explorer v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** Ship PR 2 of the events spec — the dashboard Events view becomes an explorer with app/kind/component/type/date-range filters, a filtered count, and a time histogram fed by a new `GET /api/events/stats` endpoint.

**Architecture:** A store-level aggregation function (`queryEventStats`) shares the exact filter WHERE clause with `queryEvents`, exposed as one new global route. The dashboard `events.tsx` route grows a URL-search-param filter model, a stats fetch, and a `@lodekit/ui` bar-chart header. No SDK, MCP, migration, or Greenhouse changes — those all shipped in PR 1.

**Tech Stack:** better-sqlite3 (plain SQL, `events_ts` index), Hono + zod (route), TanStack Router search params, `@lodekit/ui` chart primitives over recharts (already a dashboard dependency).

**Spec:** `docs/specs/2026-07-16-events-canonical-model-design.md` §6 (stats endpoint), §7 (Explorer v2), §9 (PR 2 slice), §10 (testing), §11 (changelog). PR title (load-bearing, squash-merge): `feat(dashboard): event explorer v2 — filters, date range, histogram`.

## Global Constraints

- Date filters are **closed-open `[since, until)`**, epoch ms — everywhere (spec §6).
- Stats facet maps are **complete** — no silent top-N truncation (spec §6).
- Bucket widths snap to exactly **1 m / 5 m / 30 m / 1 h / 6 h / 1 d**, chosen as range ÷ ~60 (spec §7).
- Date-range presets are exactly **15 m / 1 h / 24 h / 7 d / 30 d + custom** (spec §7).
- All filters are **reflected in URL search params** (spec §7); free-text payload search stays client-side.
- Internal apps render **human names** ("Dashboard"), never `_dashboard` (spec §2/§7).
- Live rows with `id: 0` (insert-failed, broadcast-only) still render (spec §7).
- **No new dependencies.** Recharts and the chart wrapper already ship in `@lodekit/ui`; the dashboard already imports both.
- Runtime stays buildless (`tsx`); chained Hono style is normative in `routes.ts` (hc type inference).
- `docs/changelog.md` is **append-only**; the entry rides in this PR (spec §11).
- Commits: conventional prefixes, bead IDs in messages, no `Co-Authored-By` trailers.

**Decisions taken in planning** (review these — each is a judgment call the spec left open):

1. **Default date range is `24h`** when no `range` search param is present. The old view showed the newest 200 rows undated; a histogram needs a bounded window, and 24 h is the neutral ELK-style default. "Last 30 d" ≈ all data anyway (retention sweep).
2. **Presets are open-ended** — they send `since` only, so live tail keeps appending; **custom** sends both edges and live rows at/after `until` are dropped.
3. **Null-app rows** key as `""` in `byApp` (JSON keys must be strings) and render as `—` in the app column — "platform" as an actor name is retired vocabulary (spec §2).
4. **Type filter is an input with a `<datalist>`** populated from `byType` — that is the "select/input" of spec §7 in one native control.
5. **`bucket` is a required param** on `/api/events/stats` (the spec calls it caller-chosen; there is no sensible server default without knowing the range).

## File Structure

| File | Change |
| --- | --- |
| `packages/runtime/src/eventStore.ts` | Extract shared `filterWhere`; add `queryEventStats` + `EventStats` types |
| `packages/runtime/src/routes.ts` | Add `GET /api/events/stats` |
| `packages/runtime/dashboard/src/lib/event-filters.ts` | **New** — pure range/matching helpers (unit-testable, no JSX) |
| `packages/runtime/dashboard/src/lib/event-stats.ts` | **New** — pure bucket snap/fill helpers |
| `packages/runtime/dashboard/src/routes/events.tsx` | Filter bar, URL params, stats header, histogram, row columns |
| `packages/runtime/tests/eventStore.test.ts` | Stats aggregation tests |
| `packages/runtime/tests/event-api.test.ts` | Stats route tests |
| `packages/runtime/tests/event-explorer.test.ts` | **New** — dashboard pure-helper tests |
| `docs/changelog.md` | One `## New` entry (Task 4) |

Dependency shape: Task 1 → Task 2 → Task 4; Task 3 → Task 4. Task 3 is independent of 1–2 (the history endpoint already accepts every filter param since PR 1).

---

### Task 1: `queryEventStats` in the event store

**Files:**
- Modify: `packages/runtime/src/eventStore.ts`
- Test: `packages/runtime/tests/eventStore.test.ts`

**Interfaces:**
- Consumes: existing `db` singleton, `EventQuery` fields.
- Produces (Task 2 relies on these exact names):
  ```ts
  export interface EventFilter { app?: string; kind?: string; component?: string; type?: string; since?: number; until?: number }
  export interface EventStatsQuery extends EventFilter { bucket: number } // ms
  export interface EventStats {
    total: number;
    buckets: { t: number; n: number }[];           // t = floor(ts/bucket)*bucket, ascending, sparse (empty buckets omitted)
    byKind: Record<string, number>;
    byComponent: Record<string, number>;
    byType: Record<string, number>;
    byApp: Record<string, number>;                  // null app keyed ""
  }
  export function queryEventStats(opts: EventStatsQuery): EventStats
  ```

**Acceptance Criteria:**
- `queryEventStats` returns total, sparse ascending histogram buckets, and four complete facet maps, all under the same WHERE as `queryEvents` (filters + read-time expiry).
- Bucket edges are exact: rows at `t0` and `t0+bucket-1` share a bucket; a row at `t0+bucket` starts the next.
- `since`/`until` are closed-open; expired-but-unswept rows are excluded; null app appears in `byApp` under `""`.
- Closed store (`db === null`) and SQL failure both return the empty shape, never throw.
- `queryEvents` behavior is unchanged after the WHERE extraction (existing suite green).

- [ ] **Step 1: Write the failing tests**

Append to `packages/runtime/tests/eventStore.test.ts` (it already has `initEventStore`/`closeEventStoreForTest` scaffolding in `beforeEach`/`afterEach`; add `vi` to the vitest import and `queryEventStats` to the eventStore import):

```ts
describe("queryEventStats", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(6_000_000); // bucket-aligned for 60s buckets
  });
  afterEach(() => vi.useRealTimers());

  const seed = () => {
    insertEvent({ app: "notes", kind: "app", component: "notes", type: "note-added" });
    insertEvent({ app: "notes", kind: "service", component: "kv-store", type: "key-set", payload: { key: "k" } });
    insertEvent({ app: "other", kind: "service", component: "kv-store", type: "key-deleted" });
    insertEvent({ app: null, kind: "engine", component: "registry", type: "apps-changed" });
  };

  it("returns total and complete facet maps; null app keyed ''", () => {
    seed();
    const s = queryEventStats({ bucket: 60_000 });
    expect(s.total).toBe(4);
    expect(s.byKind).toEqual({ app: 1, service: 2, engine: 1 });
    expect(s.byComponent).toEqual({ notes: 1, "kv-store": 2, registry: 1 });
    expect(s.byType).toEqual({ "note-added": 1, "key-set": 1, "key-deleted": 1, "apps-changed": 1 });
    expect(s.byApp).toEqual({ notes: 2, other: 1, "": 1 });
  });

  it("buckets by floor(ts/bucket)*bucket with exact edges, ascending", () => {
    insertEvent({ app: null, kind: "engine", component: "registry", type: "apps-changed" }); // ts 6_000_000
    vi.setSystemTime(6_059_999);
    insertEvent({ app: null, kind: "engine", component: "registry", type: "apps-changed" }); // same bucket
    vi.setSystemTime(6_060_000);
    insertEvent({ app: null, kind: "engine", component: "registry", type: "apps-changed" }); // next bucket
    const s = queryEventStats({ bucket: 60_000 });
    expect(s.buckets).toEqual([{ t: 6_000_000, n: 2 }, { t: 6_060_000, n: 1 }]);
  });

  it("applies the same filters as queryEvents, closed-open on [since, until)", () => {
    seed();
    expect(queryEventStats({ bucket: 60_000, kind: "service" }).total).toBe(2);
    expect(queryEventStats({ bucket: 60_000, app: "notes", component: "kv-store" }).byType).toEqual({ "key-set": 1 });
    // all four rows share ts 6_000_000: since is inclusive, until exclusive
    expect(queryEventStats({ bucket: 60_000, since: 6_000_000, until: 6_000_001 }).total).toBe(4);
    expect(queryEventStats({ bucket: 60_000, until: 6_000_000 }).total).toBe(0);
    expect(queryEventStats({ bucket: 60_000, since: 6_000_001 }).total).toBe(0);
  });

  it("excludes expired-but-unswept rows at read time", () => {
    insertEvent({ app: "notes", kind: "app", component: "notes", type: "note-added", ttl: 1 });
    vi.setSystemTime(6_002_000);
    expect(queryEventStats({ bucket: 60_000 }).total).toBe(0);
  });

  it("returns the empty shape when the store is closed", () => {
    closeEventStoreForTest();
    expect(queryEventStats({ bucket: 60_000 })).toEqual({ total: 0, buckets: [], byKind: {}, byComponent: {}, byType: {}, byApp: {} });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lodekit/runtime test tests/eventStore.test.ts`
Expected: FAIL — `queryEventStats` is not exported.

- [ ] **Step 3: Implement — extract `filterWhere`, add `queryEventStats`**

In `packages/runtime/src/eventStore.ts`, add above `EventQuery` and make `EventQuery` extend it:

```ts
export interface EventFilter {
  app?: string;
  kind?: string;
  component?: string;
  type?: string;
  since?: number;
  until?: number;
}

export interface EventQuery extends EventFilter {
  after?: number; // ascending replay: id > after
  before?: number; // newest-first pagination: id < before
  limit?: number;
}
```

Add the shared WHERE builder (below `toRecord`) and rewrite the top of `queryEvents` to use it — cursor clauses stay in `queryEvents`:

```ts
// Shared by history and stats: the filter WHERE plus read-time expiry (lazy, kv-style).
function filterWhere(f: EventFilter): { where: string[]; params: unknown[] } {
  const where: string[] = ["(expires_at IS NULL OR expires_at > ?)"];
  const params: unknown[] = [Date.now()];
  if (f.app) { where.push("app = ?"); params.push(f.app); }
  if (f.kind) { where.push("kind = ?"); params.push(f.kind); }
  if (f.component) { where.push("component = ?"); params.push(f.component); }
  if (f.type) { where.push("type = ?"); params.push(f.type); }
  if (f.since != null) { where.push("ts >= ?"); params.push(f.since); }
  if (f.until != null) { where.push("ts < ?"); params.push(f.until); }
  return { where, params };
}
```

In `queryEvents`, replace the inline `where`/`params` construction (the block from `const where: string[] = […]` through the `until` push) with:

```ts
  const { where, params } = filterWhere(opts);
  if (asc) { where.push("id > ?"); params.push(opts.after); }
  else if (opts.before != null) { where.push("id < ?"); params.push(opts.before); }
```

Then add the stats function after `queryEvents`:

```ts
export interface EventStatsQuery extends EventFilter {
  bucket: number; // ms — caller-chosen histogram interval
}

export interface EventStats {
  total: number;
  buckets: { t: number; n: number }[];
  byKind: Record<string, number>;
  byComponent: Record<string, number>;
  byType: Record<string, number>;
  byApp: Record<string, number>;
}

const emptyStats = (): EventStats => ({ total: 0, buckets: [], byKind: {}, byComponent: {}, byType: {}, byApp: {} });

// Explorer-header aggregates (spec §6): one histogram GROUP BY plus one GROUP BY per
// facet, all under the same WHERE; the events_ts index carries the range scan. Facet
// maps are complete — cardinality is bounded by the taxonomy plus app count at Lodekit
// scale. Null app is keyed "" in byApp (JSON object keys are strings).
export function queryEventStats(opts: EventStatsQuery): EventStats {
  if (!db) return emptyStats();
  const bucket = Math.max(1, Math.floor(opts.bucket));
  const { where, params } = filterWhere(opts);
  const w = where.join(" AND ");
  try {
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM events WHERE ${w}`).get(...params) as { n: number }).n;
    const buckets = db
      .prepare(`SELECT (ts / ?) * ? AS t, COUNT(*) AS n FROM events WHERE ${w} GROUP BY t ORDER BY t`)
      .all(bucket, bucket, ...params) as { t: number; n: number }[];
    const facet = (col: string): Record<string, number> =>
      Object.fromEntries(
        (db!.prepare(`SELECT ${col} AS k, COUNT(*) AS n FROM events WHERE ${w} GROUP BY k`).all(...params) as { k: string; n: number }[]).map(
          (r) => [r.k, r.n]
        )
      );
    return { total, buckets, byKind: facet("kind"), byComponent: facet("component"), byType: facet("type"), byApp: facet("COALESCE(app, '')") };
  } catch (e) {
    process.stderr.write(`[events] event stats failed: ${e}\n`);
    return emptyStats();
  }
}
```

(`ts / ?` is integer division in SQLite — both operands are integers.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime test tests/eventStore.test.ts`
Expected: PASS, including all pre-existing `queryEvents`/sweep tests (the WHERE extraction must not change behavior).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/eventStore.ts packages/runtime/tests/eventStore.test.ts
git commit -m "feat(runtime): queryEventStats — histogram + facet aggregates over the event store (lk-2gb)"
```

---

### Task 2: `GET /api/events/stats`

**Files:**
- Modify: `packages/runtime/src/routes.ts`
- Test: `packages/runtime/tests/event-api.test.ts`

**Interfaces:**
- Consumes: `queryEventStats` (Task 1), `eventsQuery` zod object from `services/event-store.ts`, `ID_RE`/`KINDS` from `events.ts` (all already imported by `routes.ts` except `queryEventStats`).
- Produces: `GET /api/events/stats?app&kind&component&type&since&until&bucket` → `EventStats` JSON, 200. Missing/invalid `bucket` → 400. (Task 4's dashboard fetch relies on this exact shape.)

**Acceptance Criteria:**
- Same filter params as `/events/history` minus cursors/limit, plus required `bucket` (positive int ms); `app` validated by `ID_RE`, `kind` by the `KINDS` enum, mirroring the history route.
- Returns `queryEventStats` output verbatim; facet maps complete under filters.
- 400 with a validation error when `bucket` is missing, zero, or negative.

- [ ] **Step 1: Write the failing tests**

Append to `packages/runtime/tests/event-api.test.ts` (scaffolding exists; `emitEvent` is already imported):

```ts
describe("GET /api/events/stats", () => {
  it("aggregates under filters with complete facet maps", async () => {
    emitEvent({ app: "notes", kind: "service", component: "kv-store", type: "key-set", payload: { key: "k" } });
    emitEvent({ app: "notes", kind: "app", component: "notes", type: "note-added" });
    emitEvent({ app: "other", kind: "service", component: "kv-store", type: "key-deleted" });
    emitEvent({ app: null, kind: "engine", component: "registry", type: "apps-changed" });

    const all = await (await app.request("/api/events/stats?bucket=60000")).json();
    expect(all.total).toBe(4);
    expect(all.byKind).toEqual({ service: 2, app: 1, engine: 1 });
    expect(all.byApp).toEqual({ notes: 2, other: 1, "": 1 });
    expect(all.buckets.reduce((s: number, b: { n: number }) => s + b.n, 0)).toBe(4);

    const filtered = await (await app.request("/api/events/stats?bucket=60000&kind=service&component=kv-store")).json();
    expect(filtered.total).toBe(2);
    expect(filtered.byType).toEqual({ "key-set": 1, "key-deleted": 1 });
  });

  it("rejects a missing or non-positive bucket", async () => {
    expect((await app.request("/api/events/stats")).status).toBe(400);
    expect((await app.request("/api/events/stats?bucket=0")).status).toBe(400);
    expect((await app.request("/api/events/stats?bucket=-5")).status).toBe(400);
  });

  it("rejects invalid app and kind like the history route", async () => {
    expect((await app.request("/api/events/stats?bucket=60000&app=Bad_Id!")).status).toBe(400);
    expect((await app.request("/api/events/stats?bucket=60000&kind=platform")).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lodekit/runtime test tests/event-api.test.ts`
Expected: FAIL — `/api/events/stats` returns 404 (route missing).

- [ ] **Step 3: Add the route**

In `packages/runtime/src/routes.ts`:

1. Extend the eventStore import: `import { queryEvents, queryEventStats } from "./eventStore.js";` (adjust to the existing import line).
2. Chain directly after the `/events/history` `.get(...)` (before `.get("/events", …)`):

```ts
    // Explorer-header aggregates (spec §6): history's filters minus cursors/limit, plus
    // the caller-chosen histogram bucket. /api/events itself stays the SSE feed.
    .get(
      "/events/stats",
      zValidator(
        "query",
        eventsQuery.omit({ after: true, before: true, limit: true }).extend({
          app: z.string().regex(ID_RE).optional(),
          kind: z.enum(KINDS).optional(),
          bucket: z.coerce.number().int().positive(),
        }),
        validationHook
      ),
      (c) => c.json(queryEventStats(c.req.valid("query")))
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime test tests/event-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/routes.ts packages/runtime/tests/event-api.test.ts
git commit -m "feat(runtime): GET /api/events/stats — explorer-header aggregates (lk-5g8)"
```

---

### Task 3: Explorer filters — URL params, kind chips, date range, rows

**Files:**
- Create: `packages/runtime/dashboard/src/lib/event-filters.ts`
- Modify: `packages/runtime/dashboard/src/routes/events.tsx`
- Test: `packages/runtime/tests/event-explorer.test.ts` (new)

**Interfaces:**
- Consumes: `GET /api/events/history` params `app`/`kind`/`component`/`type`/`since`/`until`/`before`/`limit` (all live since PR 1); `useSSEEvent` from `../components/sse`; `/api/apps` → `{ appId: string; name: string }[]`.
- Produces (Task 4 relies on these exact names):
  ```ts
  // lib/event-filters.ts
  export const RANGE_PRESETS: Record<"15m" | "1h" | "24h" | "7d" | "30d", number>;
  export type RangeKey = keyof typeof RANGE_PRESETS | "custom";
  export function rangeBounds(range: RangeKey, now: number, custom: { since?: number; until?: number }): { since?: number; until?: number };
  export interface LiveFilter { app?: string; kind?: string; component?: string; type?: string; until?: number }
  export function matchesFilters(r: { app: string | null; kind: string; component: string; type: string; ts: number }, f: LiveFilter): boolean;
  export function toLocalInput(ms?: number): string;
  export function fromLocalInput(v: string): number | undefined;
  ```
  Plus, in `events.tsx`: the `EventsSearch` interface, the `patchSearch` helper, the `filterQuery` memo keyed on all URL filters, and `bounds` — Task 4 keys its stats fetch off the same values.

**Acceptance Criteria:**
- Every filter lives in URL search params: `app`, `kind`, `component`, `type`, `range`, `since`, `until`; free-text payload search stays local (client-side).
- Filter bar: app select (human names — "Dashboard" for `_dashboard`, `name` for apps), kind chips Engine/Services/Apps (single-select toggle), date-range select with the 5 presets + Custom (two `datetime-local` inputs), type input (debounced into the URL).
- History fetch and Load more send `kind`/`component`/`type`/`since`/`until`; presets send `since` only, custom sends both, closed-open.
- Live tail respects every server filter (app, kind, component, type, and drops rows at/after a custom `until`); `id: 0` rows still render.
- Rows show time, type badge, component, app (human name; `—` for null), payload preview with expand — the existing pattern plus the split columns.
- `pnpm --filter @lodekit/runtime test tests/event-explorer.test.ts` and the dashboard build test pass.

- [ ] **Step 1: Write the failing helper tests**

Create `packages/runtime/tests/event-explorer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { RANGE_PRESETS, rangeBounds, matchesFilters, toLocalInput, fromLocalInput } from "../dashboard/src/lib/event-filters.js";

const NOW = 1_752_600_000_000;

describe("rangeBounds", () => {
  it("presets are open-ended: since = now - preset, no until", () => {
    expect(rangeBounds("24h", NOW, {})).toEqual({ since: NOW - RANGE_PRESETS["24h"] });
    expect(rangeBounds("15m", NOW, {})).toEqual({ since: NOW - 15 * 60_000 });
  });
  it("custom passes both edges through, either may be absent", () => {
    expect(rangeBounds("custom", NOW, { since: 5, until: 9 })).toEqual({ since: 5, until: 9 });
    expect(rangeBounds("custom", NOW, { until: 9 })).toEqual({ since: undefined, until: 9 });
  });
});

describe("matchesFilters", () => {
  const r = { id: 1, ts: 100, app: "notes", kind: "service", component: "kv-store", type: "key-set" };
  it("matches on every set filter, ignores unset ones", () => {
    expect(matchesFilters(r, {})).toBe(true);
    expect(matchesFilters(r, { app: "notes", kind: "service", component: "kv-store", type: "key-set" })).toBe(true);
    expect(matchesFilters(r, { app: "other" })).toBe(false);
    expect(matchesFilters(r, { kind: "engine" })).toBe(false);
    expect(matchesFilters(r, { component: "tasks" })).toBe(false);
    expect(matchesFilters(r, { type: "key-deleted" })).toBe(false);
  });
  it("drops rows at/after a custom until (closed-open)", () => {
    expect(matchesFilters(r, { until: 100 })).toBe(false);
    expect(matchesFilters(r, { until: 101 })).toBe(true);
  });
});

describe("datetime-local conversion", () => {
  it("round-trips minute precision in the local zone", () => {
    const ms = new Date(2026, 6, 16, 14, 30).getTime();
    expect(fromLocalInput(toLocalInput(ms))).toBe(ms);
    expect(toLocalInput(undefined)).toBe("");
    expect(fromLocalInput("")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lodekit/runtime test tests/event-explorer.test.ts`
Expected: FAIL — module `../dashboard/src/lib/event-filters.js` not found.

- [ ] **Step 3: Implement the helpers**

Create `packages/runtime/dashboard/src/lib/event-filters.ts`:

```ts
// Pure filter helpers for the Events explorer — kept JSX-free so the runtime test
// suite can exercise them directly (dashboard/ has no tsc program of its own).

export const RANGE_PRESETS = {
  "15m": 15 * 60_000,
  "1h": 3_600_000,
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
} as const;

export type RangeKey = keyof typeof RANGE_PRESETS | "custom";

// Presets are open-ended (since only — live tail keeps appending); custom uses both
// edges. Bounds are closed-open [since, until), matching the API (spec §6).
export function rangeBounds(
  range: RangeKey,
  now: number,
  custom: { since?: number; until?: number }
): { since?: number; until?: number } {
  if (range === "custom") return { since: custom.since, until: custom.until };
  return { since: now - RANGE_PRESETS[range] };
}

export interface LiveFilter {
  app?: string;
  kind?: string;
  component?: string;
  type?: string;
  until?: number;
}

// Whether a live SSE row belongs under the current filters. `since` needs no check —
// a live row is newer than any since; a custom until in the past excludes it.
export function matchesFilters(
  r: { app: string | null; kind: string; component: string; type: string; ts: number },
  f: LiveFilter
): boolean {
  return (
    (!f.app || r.app === f.app) &&
    (!f.kind || r.kind === f.kind) &&
    (!f.component || r.component === f.component) &&
    (!f.type || r.type === f.type) &&
    (f.until == null || r.ts < f.until)
  );
}

// datetime-local <-> epoch ms in the viewer's zone (the input has no zone of its own).
export function toLocalInput(ms?: number): string {
  if (ms == null) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): number | undefined {
  if (!v) return undefined;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}
```

- [ ] **Step 4: Run helper tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime test tests/event-explorer.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite `events.tsx` — filter model + bar + rows**

Replace `packages/runtime/dashboard/src/routes/events.tsx` with:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, CardHeader, CardTitle, Skeleton } from "@lodekit/ui";
import { useSSEEvent } from "../components/sse";
import {
  RANGE_PRESETS,
  type RangeKey,
  rangeBounds,
  matchesFilters,
  toLocalInput,
  fromLocalInput,
} from "../lib/event-filters";

interface EventRecord {
  id: number;
  ts: number;
  app: string | null;
  kind: string;
  component: string;
  type: string;
  payload: Record<string, unknown> | null;
}

const INTERNAL_APPS = [{ appId: "_dashboard", name: "Dashboard" }] as const;
const MAX_LIVE_ROWS = 500;
const MAX_ROWS = 1000;
const EVENT_KINDS = [
  ["engine", "Engine"],
  ["service", "Services"],
  ["app", "Apps"],
] as const;
const RANGE_KEYS = [...(Object.keys(RANGE_PRESETS) as (keyof typeof RANGE_PRESETS)[]), "custom"] as const;
const DEFAULT_RANGE: RangeKey = "24h";

interface EventsSearch {
  app?: string;
  kind?: (typeof EVENT_KINDS)[number][0];
  component?: string;
  type?: string;
  range?: RangeKey;
  since?: number;
  until?: number;
}

export const Route = createFileRoute("/events")({
  validateSearch: (s: Record<string, unknown>): EventsSearch => {
    const out: EventsSearch = {};
    if (typeof s.app === "string" && s.app) out.app = s.app;
    if (EVENT_KINDS.some(([k]) => k === s.kind)) out.kind = s.kind as EventsSearch["kind"];
    if (typeof s.component === "string" && s.component) out.component = s.component;
    if (typeof s.type === "string" && s.type) out.type = s.type;
    if (RANGE_KEYS.includes(s.range as RangeKey)) out.range = s.range as RangeKey;
    if (typeof s.since === "number" && s.since >= 0) out.since = s.since;
    if (typeof s.until === "number" && s.until > 0) out.until = s.until;
    return out;
  },
  component: EventsView,
});

function Row({ r, appName }: { r: EventRecord; appName: (id: string | null) => string }) {
  const [open, setOpen] = useState(false);
  const hasPayload = r.payload && Object.keys(r.payload).length > 0;
  return (
    <div className="border-b py-1.5 text-sm">
      <button
        className="flex w-full items-baseline gap-2 text-left"
        onClick={() => hasPayload && setOpen((o) => !o)}
      >
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {new Date(r.ts).toLocaleTimeString()}
        </span>
        <Badge variant="secondary">{r.type}</Badge>
        <span className="shrink-0 text-muted-foreground">{r.component}</span>
        <span className="shrink-0 text-muted-foreground">{appName(r.app)}</span>
        <span className="truncate text-muted-foreground">
          {hasPayload ? JSON.stringify(r.payload) : ""}
        </span>
      </button>
      {open && hasPayload && (
        <pre className="mt-1 overflow-auto rounded bg-muted p-2 text-xs">
          {JSON.stringify(r.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

function EventsView() {
  const search = Route.useSearch();
  const { app, kind, component, since, until } = search;
  const range: RangeKey = search.range ?? DEFAULT_RANGE;
  const navigate = Route.useNavigate();
  const [apps, setApps] = useState<{ appId: string; name: string }[]>([]);
  const [type, setType] = useState(search.type ?? "");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [records, setRecords] = useState<EventRecord[] | null>(null);
  const [next, setNext] = useState<number | null>(null);

  const patchSearch = (patch: Partial<EventsSearch>) =>
    void navigate({ search: (prev: EventsSearch) => ({ ...prev, ...patch }) });

  // Type is a URL filter (spec §7) — the input debounces into the search params.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((search.type ?? "") !== type) patchSearch({ type: type || undefined });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Bounds freeze until a filter changes; the live tail covers newer events.
  const bounds = useMemo(
    () => rangeBounds(range, Date.now(), { since, until }),
    [range, since, until]
  );

  const filterQuery = useMemo(() => {
    const query = new URLSearchParams({ limit: "200" });
    if (app) query.set("app", app);
    if (kind) query.set("kind", kind);
    if (component) query.set("component", component);
    if (search.type) query.set("type", search.type);
    if (bounds.since != null) query.set("since", String(bounds.since));
    if (bounds.until != null) query.set("until", String(bounds.until));
    return query;
  }, [app, kind, component, search.type, bounds]);

  // q is client-side (type + payload text) — the history endpoint has no q param.
  const filtersRef = useRef({ app, kind, component, type: search.type, until: bounds.until, q: debouncedQ });
  filtersRef.current = { app, kind, component, type: search.type, until: bounds.until, q: debouncedQ };
  const matchesQ = (r: EventRecord, needle: string) =>
    !needle ||
    r.type.toLowerCase().includes(needle.toLowerCase()) ||
    (r.payload !== null && JSON.stringify(r.payload).toLowerCase().includes(needle.toLowerCase()));

  const pendingRef = useRef<EventRecord[]>([]);
  const hasRecordsRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    pendingRef.current = [];
    hasRecordsRef.current = false;
    setRecords(null);
    void fetch(`/api/events/history?${filterQuery}`)
      .then((r) => r.json())
      .then((d: { records: EventRecord[]; next: number | null }) => {
        if (cancelled) return;
        const pending = pendingRef.current.filter(
          (p) => p.id === 0 || !d.records.some((r) => r.id === p.id),
        );
        pendingRef.current = [];
        setRecords([...pending.slice().reverse(), ...d.records].slice(0, MAX_LIVE_ROWS));
        hasRecordsRef.current = true;
        setNext(d.next);
      })
      .catch(() => {
        if (cancelled) return;
        const pending = pendingRef.current;
        pendingRef.current = [];
        setRecords(pending.slice().reverse().slice(0, MAX_LIVE_ROWS));
        hasRecordsRef.current = true;
        setNext(null);
      });
    return () => { cancelled = true; };
  }, [filterQuery]);

  useSSEEvent("event", (e) => {
    const r = JSON.parse(e.data) as EventRecord;
    const f = filtersRef.current;
    if (!matchesFilters(r, f) || !matchesQ(r, f.q)) return;
    if (!hasRecordsRef.current) {
      pendingRef.current.push(r);
      return;
    }
    setRecords((rs) =>
      rs && !(r.id !== 0 && rs.some((x) => x.id === r.id))
        ? [r, ...rs].slice(0, Math.max(MAX_LIVE_ROWS, rs.length))
        : rs
    );
  });

  useEffect(() => {
    void fetch("/api/apps").then((r) => r.json()).then(setApps).catch(() => {});
  }, []);

  async function loadMore() {
    if (next == null) return;
    const bottom = [...records ?? []].reverse().find((r) => r.id !== 0)?.id ?? next;
    const query = new URLSearchParams(filterQuery);
    query.set("before", String(bottom));
    try {
      const d = (await (await fetch(`/api/events/history?${query}`)).json()) as { records: EventRecord[]; next: number | null };
      setRecords((rs) => [...(rs ?? []), ...d.records]);
      setNext(d.next);
    } catch {
      // degraded state: leave records/next unchanged, button stays available for retry
    }
  }

  const shown = (records ?? []).filter((r) => matchesQ(r, debouncedQ));
  const names = new Map<string, string>([
    ...INTERNAL_APPS.map((a) => [a.appId, a.name] as const),
    ...apps.map((a) => [a.appId, a.name] as const),
  ]);
  // Null app = platform-wide: no owning stream, rendered as an em dash (spec §2/§3).
  const appName = (id: string | null) => (id === null ? "—" : names.get(id) ?? id);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Events</h1>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={app ?? ""}
          onChange={(e) => patchSearch({ app: e.target.value || undefined })}
        >
          <option value="">All apps</option>
          {INTERNAL_APPS.map((a) => (
            <option key={a.appId} value={a.appId}>{a.name}</option>
          ))}
          {apps.map((a) => (
            <option key={a.appId} value={a.appId}>{a.name}</option>
          ))}
        </select>
        {EVENT_KINDS.map(([k, label]) => (
          <Button
            key={k}
            size="sm"
            variant={kind === k ? "default" : "outline"}
            onClick={() => patchSearch({ kind: kind === k ? undefined : k })}
          >
            {label}
          </Button>
        ))}
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={range}
          onChange={(e) => {
            const r = e.target.value as RangeKey;
            patchSearch(r === "custom" ? { range: r } : { range: r, since: undefined, until: undefined });
          }}
        >
          {RANGE_KEYS.map((k) => (
            <option key={k} value={k}>{k === "custom" ? "Custom…" : `Last ${k}`}</option>
          ))}
        </select>
        {range === "custom" && (
          <>
            <input
              type="datetime-local"
              className="h-8 rounded-md border bg-background px-2 text-sm"
              value={toLocalInput(since)}
              onChange={(e) => patchSearch({ since: fromLocalInput(e.target.value) })}
            />
            <input
              type="datetime-local"
              className="h-8 rounded-md border bg-background px-2 text-sm"
              value={toLocalInput(until)}
              onChange={(e) => patchSearch({ until: fromLocalInput(e.target.value) })}
            />
          </>
        )}
        <input
          className="h-8 w-40 rounded-md border bg-background px-2 text-sm"
          placeholder="Type…"
          value={type}
          onChange={(e) => setType(e.target.value)}
        />
        <input
          className="h-8 flex-1 rounded-md border bg-background px-2 text-sm"
          placeholder="Search payloads…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {records === null ? (
        <Skeleton className="h-32" />
      ) : shown.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No events</CardTitle>
          </CardHeader>
        </Card>
      ) : (
        <div>
          {shown.map((r) => (
            <Row key={r.id === 0 ? `${r.ts}-${r.type}` : r.id} r={r} appName={appName} />
          ))}
          {next != null && shown.length < MAX_ROWS && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void loadMore()}>
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Verify the dashboard still builds and serves**

Run: `pnpm --filter @lodekit/runtime test tests/dashboard.test.ts tests/event-explorer.test.ts`
Expected: PASS (the build test compiles the rewritten TSX — dashboard/ has no tsc program, so this is the type/syntax gate).

- [ ] **Step 7: Eyeball it live**

Run: `pnpm dev`, open `http://lodekit.localhost:<port>/events` (dashboard). Check: chips toggle and land in the URL, range select filters rows, custom shows the two datetime inputs, app select shows "Dashboard"/"Greenhouse"/"Welcome", live rows keep arriving under matching filters. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add packages/runtime/dashboard/src/lib/event-filters.ts packages/runtime/dashboard/src/routes/events.tsx packages/runtime/tests/event-explorer.test.ts
git commit -m "feat(dashboard): events explorer filters — URL params, kind chips, date range (lk-cja)"
```

---

### Task 4: Analytics header — count, histogram, facet-fed selects, changelog

**Files:**
- Create: `packages/runtime/dashboard/src/lib/event-stats.ts`
- Modify: `packages/runtime/dashboard/src/routes/events.tsx`
- Modify: `docs/changelog.md` (append one `## New` entry)
- Test: `packages/runtime/tests/event-explorer.test.ts`

**Interfaces:**
- Consumes: `GET /api/events/stats` (Task 2 shape), the `filterQuery`/`bounds`/`patchSearch` model from Task 3, `ChartContainer`/`ChartTooltip`/`ChartTooltipContent`/`ChartConfig` from `@lodekit/ui`, `Bar`/`BarChart`/`XAxis` from `recharts` (pattern: `dashboard/src/routes/data/$appId/index.tsx`).
- Produces:
  ```ts
  // lib/event-stats.ts
  export const BUCKET_STEPS: readonly number[]; // [1m, 5m, 30m, 1h, 6h, 1d] in ms
  export function snapBucket(rangeMs: number): number;
  export function fillBuckets(sparse: { t: number; n: number }[], since: number, until: number, bucket: number): { t: number; n: number }[];
  ```

**Acceptance Criteria:**
- Header shows the filtered total (`stats.total`, not the loaded-row count) and a bar-chart histogram over the selected range; bucket = range ÷ ~60 snapped up to 1 m / 5 m / 30 m / 1 h / 6 h / 1 d; empty buckets render as zero bars.
- Stats refetch on any filter change; a matching live event nudges one debounced (2 s) refresh — never per-event recompute.
- Component select populated from `byComponent`; type input gains a `<datalist>` from `byType`; component filter lands in the URL like the rest.
- Changelog entry appended under `## New`.
- Helper tests + dashboard build test pass.

- [ ] **Step 1: Write the failing helper tests**

Append to `packages/runtime/tests/event-explorer.test.ts`:

```ts
import { BUCKET_STEPS, snapBucket, fillBuckets } from "../dashboard/src/lib/event-stats.js";

describe("snapBucket", () => {
  it("snaps range/60 up to the allowed steps (spec §7)", () => {
    expect(snapBucket(RANGE_PRESETS["15m"])).toBe(60_000);        // 15s -> 1m
    expect(snapBucket(RANGE_PRESETS["1h"])).toBe(60_000);         // 1m -> 1m
    expect(snapBucket(RANGE_PRESETS["24h"])).toBe(1_800_000);     // 24m -> 30m
    expect(snapBucket(RANGE_PRESETS["7d"])).toBe(21_600_000);     // 2.8h -> 6h
    expect(snapBucket(RANGE_PRESETS["30d"])).toBe(86_400_000);    // 12h -> 1d
  });
  it("clamps degenerate ranges to the largest step", () => {
    expect(snapBucket(10 * 365 * 86_400_000)).toBe(BUCKET_STEPS[BUCKET_STEPS.length - 1]);
  });
});

describe("fillBuckets", () => {
  it("zero-fills [since, until) on bucket-aligned edges", () => {
    const out = fillBuckets([{ t: 120, n: 3 }], 100, 300, 60);
    expect(out).toEqual([{ t: 60, n: 0 }, { t: 120, n: 3 }, { t: 180, n: 0 }, { t: 240, n: 0 }]);
  });
  it("caps output at 1000 bars for degenerate ranges", () => {
    expect(fillBuckets([], 0, 10_000_000, 1).length).toBe(1000);
  });
});
```

(Note: `fillBuckets(…, 100, 300, 60)` starts at `floor(100/60)*60 = 60` and stops below 300 — the first bucket may begin before `since`, matching how the server buckets by `floor(ts/bucket)`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lodekit/runtime test tests/event-explorer.test.ts`
Expected: FAIL — module `../dashboard/src/lib/event-stats.js` not found.

- [ ] **Step 3: Implement the helpers**

Create `packages/runtime/dashboard/src/lib/event-stats.ts`:

```ts
// Pure histogram helpers for the Events explorer header — JSX-free for the same
// reason as event-filters.ts (runtime tests import these directly).

export const BUCKET_STEPS = [60_000, 300_000, 1_800_000, 3_600_000, 21_600_000, 86_400_000] as const;

// Range ÷ ~60 bars, snapped up to the nearest allowed step (spec §7).
export function snapBucket(rangeMs: number): number {
  const target = rangeMs / 60;
  return BUCKET_STEPS.find((s) => s >= target) ?? BUCKET_STEPS[BUCKET_STEPS.length - 1];
}

// Zero-fill the server's sparse buckets across [since, until). The first bar starts at
// floor(since/bucket)*bucket — the same edge the server buckets by. Capped at 1000 bars
// as a guard against degenerate custom ranges.
export function fillBuckets(
  sparse: { t: number; n: number }[],
  since: number,
  until: number,
  bucket: number
): { t: number; n: number }[] {
  const byT = new Map(sparse.map((b) => [b.t, b.n]));
  const out: { t: number; n: number }[] = [];
  for (let t = Math.floor(since / bucket) * bucket; t < until && out.length < 1000; t += bucket) {
    out.push({ t, n: byT.get(t) ?? 0 });
  }
  return out;
}
```

- [ ] **Step 4: Run helper tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime test tests/event-explorer.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the header + facet selects into `events.tsx`**

All edits inside `packages/runtime/dashboard/src/routes/events.tsx`:

1. Extend the imports:

```tsx
import {
  Badge, Button, Card, CardHeader, CardTitle, Skeleton,
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@lodekit/ui";
import { Bar, BarChart, XAxis } from "recharts";
import { snapBucket, fillBuckets } from "../lib/event-stats";
```

2. Add the stats types + chart config at module level (below `EventsSearch`):

```tsx
interface EventStats {
  total: number;
  buckets: { t: number; n: number }[];
  byKind: Record<string, number>;
  byComponent: Record<string, number>;
  byType: Record<string, number>;
  byApp: Record<string, number>;
}

const histConfig = { n: { label: "Events", color: "var(--chart-1)" } } satisfies ChartConfig;
```

3. Inside `EventsView`, add stats state and the fetch (after the `records`/`next` state). `statsTick` re-runs the effect — bumped by the debounced live nudge; the effect recomputes concrete bounds itself so a nudge also slides a preset window forward:

```tsx
  const [stats, setStats] = useState<EventStats | null>(null);
  const [statsTick, setStatsTick] = useState(0);
  const [histogram, setHistogram] = useState<{ bars: { t: number; n: number }[]; bucket: number }>({ bars: [], bucket: 60_000 });

  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
    const b = rangeBounds(range, now, { since, until });
    // The histogram needs finite edges: default the window to the 30d retention span.
    const s = b.since ?? now - RANGE_PRESETS["30d"];
    const u = b.until ?? now;
    const bucket = snapBucket(u - s);
    const query = new URLSearchParams({ bucket: String(bucket), since: String(s), until: String(u) });
    if (app) query.set("app", app);
    if (kind) query.set("kind", kind);
    if (component) query.set("component", component);
    if (search.type) query.set("type", search.type);
    void fetch(`/api/events/stats?${query}`)
      .then((r) => r.json())
      .then((d: EventStats) => {
        if (cancelled) return;
        setStats(d);
        setHistogram({ bars: fillBuckets(d.buckets, s, u, bucket), bucket });
      })
      .catch(() => { if (cancelled) setStats(null); });
    return () => { cancelled = true; };
  }, [app, kind, component, search.type, range, since, until, statsTick]);
```

4. In the `useSSEEvent` handler, after the existing `setRecords(...)` call (i.e. only for rows that passed the filters), add the debounced nudge — with the timer ref declared next to `pendingRef`:

```tsx
  const statsNudgeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

```tsx
    // Live events nudge a debounced stats refresh — never per-event recompute (spec §7).
    if (statsNudgeRef.current) clearTimeout(statsNudgeRef.current);
    statsNudgeRef.current = setTimeout(() => setStatsTick((t) => t + 1), 2000);
```

5. Render the header between the `<h1>` and the filter bar:

```tsx
      <div className="mb-4">
        <div className="mb-1 text-sm text-muted-foreground">
          {stats ? `${stats.total.toLocaleString()} events` : " "}
        </div>
        <ChartContainer config={histConfig} className="h-24 w-full">
          <BarChart data={histogram.bars} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
            <XAxis
              dataKey="t"
              tickLine={false}
              axisLine={false}
              minTickGap={48}
              tickFormatter={(t: number) =>
                histogram.bucket >= 86_400_000
                  ? new Date(t).toLocaleDateString()
                  : new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              }
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_: unknown, p: { payload?: { t?: number } }[]) =>
                    p[0]?.payload?.t != null ? new Date(p[0].payload.t).toLocaleString() : ""
                  }
                />
              }
            />
            <Bar dataKey="n" fill="var(--color-n)" radius={2} />
          </BarChart>
        </ChartContainer>
      </div>
```

6. Upgrade the filter bar: replace the type `<input>` with a datalist-backed one, and add the component select after the kind chips:

```tsx
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={component ?? ""}
          onChange={(e) => patchSearch({ component: e.target.value || undefined })}
        >
          <option value="">All components</option>
          {Object.keys(stats?.byComponent ?? {}).sort().map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
```

```tsx
        <input
          className="h-8 w-40 rounded-md border bg-background px-2 text-sm"
          placeholder="Type…"
          list="event-type-options"
          value={type}
          onChange={(e) => setType(e.target.value)}
        />
        <datalist id="event-type-options">
          {Object.keys(stats?.byType ?? {}).sort().map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
```

(A currently-selected `component` stays selectable even when the filtered `byComponent` no longer lists it — the `value` attribute holds; clearing it via "All components" always works.)

- [ ] **Step 6: Verify build + full runtime suite**

Run: `pnpm --filter @lodekit/runtime test`
Expected: PASS (dashboard build test compiles the new TSX; no runtime regressions).

- [ ] **Step 7: Eyeball it live**

Run: `pnpm dev`, open the dashboard `/events`. Check: count + histogram render and match the range; switching a chip refetches stats; emitting events (e.g. watering a Greenhouse plant) nudges one stats refresh after ~2 s; component select lists real components; the type input suggests real types. Stop the server.

- [ ] **Step 8: Append the changelog entry**

Append to the `## New` section of `docs/changelog.md` (append-only — do not touch existing lines):

```markdown
- **Events explorer** — the dashboard Events view can now filter by app, kind (engine / services / apps), component, event type, and date range, with a live filtered count and time histogram.
```

- [ ] **Step 9: Commit**

```bash
git add packages/runtime/dashboard/src/lib/event-stats.ts packages/runtime/dashboard/src/routes/events.tsx packages/runtime/tests/event-explorer.test.ts docs/changelog.md
git commit -m "feat(dashboard): events explorer header — filtered count, time histogram, facet selects (lk-fpi)"
```

---

## Final verification (before the PR)

- [ ] `pnpm test` — full workspace suite green.
- [ ] `pnpm --filter @lodekit/runtime check` — tsc clean (runtime program; dashboard/ is covered by the build test — known gap lk-gz2).
- [ ] PR: title `feat(dashboard): event explorer v2 — filters, date range, histogram`; body with Summary / Notes (incl. the 5 planning decisions above) / Test plan; bead IDs referenced. Raise the PR and stop — merging is the person's call.
