# 011-feat: Data Explorer

**Status:** Active · **Last reviewed:** 2026-08-11

## Overview

The data explorer is the dashboard's window onto one app's stored data: the relational
tables of the db-store, the kv-store's entries, and the file-store's index. It exists so
the person can see what their agent-built apps are actually keeping — verify, browse,
and trust the data tree — without writing SQL or opening files. It is read-only by
design; the stores themselves are covered by 010-feat-app-storage.

## Behavior

- Reached from the dashboard's Data page. An explorer-local sidebar carries an app
  selector (one app at a time), the app's tables, and the Key-value, Files, and Storage
  views; every app and table is deep-linkable. A vanished or unknown app id lands back
  on the explorer root.
- The overview shows stat cards (rows across tables, kv entries, file count and bytes),
  two charts (objects per store; estimated size per table, falling back to the whole
  database file size when per-table sizes are unavailable), table shortcuts, and a
  recent-activity list merged across stores with relative timestamps.
- The table browser offers free-text search across text columns, additive filter rules,
  ordered multi-column sorting, and real-total pagination. A row click opens a detail
  panel with the full row, pretty-printed JSON for object-shaped values, and copy
  actions.
- The key-value view searches by key prefix with cursor pagination; the files view lists
  file metadata with a link to the raw served file. Both open the same detail panel.
- Storage is a visible "Soon" placeholder for future disk-usage insight.
- Everything is read-only: no inserts, edits, deletes, or SQL editor.
- Summaries, schemas, and kv listings refresh live on data-change events; table rows
  refresh only on the explicit refresh action, so rows never shift mid-browse.
- There is no per-app events view in the explorer: event browsing lives in the platform
  Events view (019-feat-logging-events), which filters by app.
- The agent has read parity over MCP: listing and reading kv entries, inspecting the
  declared schema, running SELECT-only queries through the same read-only door the
  explorer uses, and listing/inspecting files.

## Design Decisions

### 1. The client compiles SQL against the existing read-only select door

**Decision:** Grid state (filters, sorts, search, pagination) compiles client-side into
parameterized SELECT statements against the db-store's existing read-only select
endpoint; identifiers are accepted only if they appear in the server-reported schema,
and values always travel as bound parameters.
**Why:** The select door already existed for exactly this consumer — SELECT-only,
enforced on a short-lived read-only connection — so no structured rows endpoint was
needed (2026-07-14 explorer design).
**Tradeoff:** The dashboard owns query-compilation logic (a tested pure module), and
grid capabilities are bounded by what that one door can express.

### 2. Read-only throughout

**Decision:** The explorer ships no write operations of any kind.
**Why:** The person's need is inspection and trust; writes belong to app code, and
agent-driven writes wait on designed guardrails (the MCP posture shares this rule).
**Tradeoff:** Correcting a bad row means going through the app or the agent, never the
explorer.

### 3. Recent activity by timestamp-column heuristic

**Decision:** Recent activity for user tables comes from heuristically recognized
timestamp columns (conventional creation-time names first, then a broader
name-shape rule); values must parse as plausible dates, and tables with no match simply
don't contribute.
**Why:** Apps declare no explorer metadata, and a naming convention covers most real
schemas with zero contract imposed on app authors.
**Tradeoff:** Tables with unconventional column names are silently absent from recents,
and an ill-named column could occasionally be misread as a timestamp.

### 4. The per-app events view was dropped after the Events explorer subsumed it

**Decision:** The explorer covers tables, kv, and files only. The events view designed
in the original spec was removed post-build: once the platform Events view gained
app/kind/component/type/date filters, a live count, and a histogram header (the sparse
stats contract, 003-arch-event-stats-sparse), a second per-app event list inside the
data explorer duplicated it.
**Why:** One events surface with an app filter beats two surfaces with diverging
filter vocabularies — and events are not app storage; they live on the platform bus.
**Tradeoff:** Moving between an app's data and its events is a navigation, not a tab.

### 5. Charts and the data table live in the UI library, not the explorer

**Decision:** The chart kit and the server-driven data table were built into the shared
UI library first (2026-07-14 charts/data-table slice); the explorer consumes them in
manual mode.
**Why:** The shared-toolchain principle — a capability the explorer needs is a
capability every app should get, and the library is where it stays themed.
**Tradeoff:** The library carries two substantial dependencies for all consumers,
explorer or not.

## Related

- **Recs:** 003-arch-event-stats-sparse, 008-feat-dashboard, 010-feat-app-storage,
  019-feat-logging-events
- **Specs:** docs/specs/2026-07-14-data-explorer-design.md,
  docs/specs/2026-07-14-ui-charts-data-table-design.md,
  docs/specs/2026-07-16-events-canonical-model-design.md (§6–7)

## Open Questions

- The Storage panel is still the "Soon" placeholder; persisted storage metrics and their
  model remain future work.
