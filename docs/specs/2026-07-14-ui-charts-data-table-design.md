# UI charts + data table — design

**Date:** 2026-07-14
**Status:** approved
**Scope:** two new dependencies for `@lodekit/ui` — `recharts` (via the stock shadcn
chart port) and `@tanstack/react-table` (via a reusable DataTable composition) — full
cycle: component, exports, token review, docs, showcase coverage. Chosen in the design
session for the dashboard data explorer (GitHub issue #60); **the explorer itself is out
of scope here** — this slice ships the library capabilities it will build on.

## Motivation

The upcoming dashboard data explorer needs charts and a server-driven table. Rather than
grow those inside the dashboard, the capabilities land in `@lodekit/ui` where every app
gets them, per the shared-toolchain principle. Greenhouse exercises the client-side
shapes now (definition of done); the explorer exercises manual mode later.

## Non-goals

- The data explorer itself (#60).
- Any other new dependency: no `@tanstack/react-virtual`, no JSON-tree-viewer libs, no
  date libraries (use `Intl`). `@tanstack/react-query` and `react-resizable-panels`
  are already present — not re-added, not wrapped.
- Custom component internals. The library stays stock shadcn base-nova; identity comes
  from tokens only (`docs/specs/2026-07-10-base-ui-migration-design.md`).

## 1. Dependencies

`packages/ui` gains two runtime dependencies:

- `recharts` — version taken from what the stock base-nova `chart.json` registry item
  declares at implementation time.
- `@tanstack/react-table` (v8, latest).

## 2. Chart — stock port

- `src/components/chart.tsx` vendored from the shadcn registry
  (`r/styles/base-nova/chart.json`), the same pipeline that produced the existing 48
  components. Stock internals; only the `cn` import path is adjusted to `../lib/utils`.
- Exports (re-exported from `src/index.ts`): `ChartContainer`, `ChartTooltip`,
  `ChartTooltipContent`, `ChartLegend`, `ChartLegendContent`, `ChartStyle`, and the
  `ChartConfig` type.
- Apps import recharts primitives (`BarChart`, `Line`, `XAxis`, …) from `recharts`
  directly, per the stock recipe; the library does not wrap them.

## 3. Chart tokens — review & re-derive

`--chart-1…--chart-5` already exist in `packages/ui/theme-tokens.css` (light + dark)
from the branding slice. This slice **audits and re-derives** them using the dataviz
skill's color formula and validator:

- Anchored on the cork-amber brand: chart-1 stays in the `--primary` hue family.
- Adjacent series must be distinguishable in both light and dark mode; the known
  near-duplicate (light chart-1 `#ce6f26` vs chart-4 `#c07b3a`) gets fixed.
- The `@theme inline` `--color-chart-*` mappings already exist and stay untouched.

## 4. DataTable — hook + component composition

One new file `src/components/data-table.tsx` (flat, one-file-per-component convention),
following the stock shadcn data-table recipe shape, composed over the existing Table,
Button, DropdownMenu, Select, Popover, Command, Badge, and Separator primitives.

### `useDataTable(options)`

Wraps `useReactTable`; returns the TanStack table instance.

- Always wires `getCoreRowModel`.
- **Client mode (default):** adds `getSortedRowModel`, `getFilteredRowModel`,
  `getPaginationRowModel`, `getFacetedRowModel` + `getFacetedUniqueValues`. Works
  out of the box for simple app tables: `useDataTable({ columns, data })`.
- **Manual mode (`manual: true`):** sets `manualSorting`, `manualFiltering`,
  `manualPagination`; applies **no** client row models. The caller supplies
  `rowCount` (or `pageCount`) and owns the controlled state — `sorting`
  (`[{ id, desc }]`, multi-column), `columnFilters`, `pagination` — plus the
  `onSortingChange` / `onColumnFiltersChange` / `onPaginationChange` callbacks.
  This is the data explorer's contract: sort/filter/page execute as SQL server-side.
- Multi-column sorting enabled (`enableMultiSort`); other `useReactTable` options
  pass through.

### Components

- `<DataTable table={…} />` — renders the instance over the Table primitives via
  `flexRender`, with the stock empty-state row (`colSpan` across all columns).
- `DataTableColumnHeader` — sort toggle/indicator + hide, stock dropdown shape;
  works with multi-column sorting state.
- `DataTablePagination` — page-size select, row-count/range, first/prev/next/last.
- `DataTableViewOptions` — column-visibility dropdown.
- `DataTableFacetedFilter` — Popover + Command + Badge faceted filter; client mode
  only (documented as such — faceted value counts need client row models).

All exported from `src/index.ts`.

## 5. Tests

`packages/ui` vitest + happy-dom:

- **Chart smoke:** `ChartContainer` renders a config and emits the per-series CSS
  variables.
- **DataTable client mode:** sorting via `DataTableColumnHeader` reorders rows;
  pagination pages them.
- **DataTable manual mode:** interaction fires `onSortingChange` with
  `[{ id, desc }]` state and `onPaginationChange` with page state, while row order
  stays exactly as passed in (no client sorting applied). Manual mode's definition
  of done lives here, since Greenhouse doesn't exercise it — its real consumer is
  the explorer (#60).

## 6. Docs — new top-level Components section

New sidebar group **Components** in `web/docs/astro.config.mjs`, placed after
"Building apps":

- `components/overview.mdx` — absorbs the stock-component list from
  `build/using-the-ui-library.mdx` (which keeps its narrative and links here), states
  the stock-internals / identity-via-tokens policy, and points to shadcn's docs for
  the stock set.
- `components/chart.mdx` — `ChartConfig` + `ChartContainer` usage, the five chart
  tokens and how theming overrides them, pointer to shadcn chart / recharts docs.
- `components/data-table.mdx` — the full API reference for the Lodekit composition:
  `useDataTable` options, client vs manual mode (with the explorer-shaped controlled
  example), and all companion components.

The links validator (`starlight-links-validator`) gates the build.

## 7. Showcase — Greenhouse definition of done

In `root/apps/greenhouse/src/routes/almanac.tsx`:

- **Sky Journal** renders a temperature chart over `weather_log` rows
  (`ChartContainer` + recharts), lighting up the chart tokens.
- The **care history** list (from `tasks.runs`) becomes a client-mode DataTable with
  `DataTableColumnHeader` sorting and `DataTablePagination`.

`root/readme.md` DoD table gains rows for `chart` and `data-table` (client mode);
manual mode is noted as unit-test-covered pending the explorer (#60).
`DataTableViewOptions` / `DataTableFacetedFilter` are not forced into Greenhouse —
noted the same way.

`docs/changelog.md` gets a `## New` entry (user-visible: charts + data tables in the
UI library).

## 8. Delivery

Slice work on the `ui` worktree branch; one PR to master
(`feat(ui): recharts chart port + DataTable composition`), squash-merged. The PR is
raised and left for the person's review — never merged unattended.

## Error handling

- Chart: `ChartContainer` requires a `ChartConfig`; stock component behavior applies
  (unknown series keys simply don't get colors). No custom validation added.
- DataTable manual mode without `rowCount`/`pageCount` degrades per TanStack's
  documented behavior; the docs page calls out the requirement.
- Empty data renders the stock "No results." row, not a crash.
