# Changelog buffer

Unreleased, user-facing changes. A slice that ships something a Lodekit user can see or
do appends an entry here, in the same PR as the code; `/release` drains this file into
the docs changelog page (`web/docs/src/content/docs/changelog.md`) and resets it.

Rules:

- **Append-only for agents** — never reword or remove existing entries; editorial
  cuts and rewording happen in the release PR review.
- **Write for a person using Lodekit** — what they can do now, never how it was built.
  One entry per product change, `**Bold name** — description` shape.
- **Internal work appends nothing** — refactors, docs, bookkeeping, and tooling stay
  out; user-noticeable fixes go under `## Fixed`.
- Keep the `## New` / `## Fixed` headings; the drain lifts them verbatim. Omitting an
  empty section is fine.

---

## New

- **Charts and data tables** — the UI library gains charts (recharts via the stock
  shadcn chart port, themed by the `--chart-*` tokens) and a reusable data table
  (`useDataTable` + `DataTable`: sorting, filtering, pagination — client-side or
  server-driven). The Greenhouse Almanac shows both: a Sky Journal temperature chart
  and a sortable care-history table.

- **Data explorer.** The dashboard's Data page is now a real explorer: pick an
  app and browse its tables (filter, multi-column sort, search, paging),
  key-value entries, files, and events — read-only, with storage insights and
  recent activity on the overview.

## Fixed

- **kv-store error statuses** — internal faults in the kv API now return 500
  instead of masquerading as 400; bad requests (invalid keys, `incr` on a
  non-number, malformed JSON) still return 400.

- **Deleting an app stops its scheduled tasks immediately** — the task engine
  used to keep materializing a deleted app's schedule runs (and emitting their
  events) until the next restart.

- **Oversized requests to apps are refused** — a request body over 5 MB sent to
  an app page or server function now gets a 413 instead of being buffered
  without limit.

- **Apps get a real not-found page** — newly scaffolded apps (and Welcome and
  Greenhouse) now render a styled 404 with a link back home instead of a bare
  "Not Found" fallback.
