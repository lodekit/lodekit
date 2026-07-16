# ADR-0003: Event stats are caller-bucketed and sparse; facet maps are complete

**Date:** 2026-07-16
**Status:** Accepted
**Spec:** `docs/specs/2026-07-16-events-canonical-model-design.md` §6–§7
**Plan:** `docs/plans/2026-07-16-events-explorer-v2.md`

## Context

Explorer v2 needs a header endpoint (`GET /api/events/stats`) returning a time
histogram plus per-facet counts. Three contract questions had no spec-forced answer:
who chooses the bucket width, who fills empty buckets, and whether facet maps may be
truncated. Each answer shapes every future consumer (dashboard today; MCP or task
triggers tomorrow), and changing an aggregation contract later means migrating all
of them at once.

## Decision

- **`bucket` is a required, caller-chosen param** (ms). The server never guesses a
  default — there is no sensible one without knowing the caller's display range.
- **Histogram buckets are sparse**: one `GROUP BY ts/:bucket` row per non-empty
  bucket, ascending; the client zero-fills across its own `[since, until)` window
  (`fillBuckets`) and owns the snapping heuristic (`snapBucket`: range ÷ ~60, snapped
  to 1 m / 5 m / 30 m / 1 h / 6 h / 1 d).
- **Facet maps (`byKind`/`byComponent`/`byType`/`byApp`) are complete** — no silent
  top-N truncation. Cardinality is bounded by the taxonomy plus app count at Lodekit
  scale. Null-app rows key as `""` in `byApp` (JSON object keys are strings; "platform"
  as an actor name is retired vocabulary per ADR-0001/spec §2).
- The stats WHERE is **the same clause** as `queryEvents` (shared `filterWhere`),
  including read-time expiry — count and rows can never disagree.

## Rationale

Server-side bucket defaults or zero-fill would bake one client's display heuristic
into the API and bloat responses with empty rows; sparse-plus-required-bucket keeps
the SQL to one indexed GROUP BY and leaves presentation choices where they belong.
Complete facets make the endpoint trustworthy as a filter-option source (the
component/type selects are populated from it) — a truncated facet would silently
hide filterable values.

## Consequences

- Every stats consumer must send `bucket` and zero-fill client-side; the dashboard
  helpers (`dashboard/src/lib/event-stats.ts`) are the reference implementation.
- Response size scales with non-empty buckets and real facet cardinality, not with
  the window size — degenerate custom ranges are the client's concern (the dashboard
  caps rendering at 1000 bars).
- If facet cardinality ever stops being taxonomy-bounded (unbounded app-chosen
  types), completeness must be revisited by spec, not silently capped.
