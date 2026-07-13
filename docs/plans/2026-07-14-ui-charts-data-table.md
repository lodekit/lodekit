# UI Charts + Data Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `recharts` (stock shadcn base-nova chart port) and `@tanstack/react-table` (a `useDataTable`/`DataTable` composition) to `@lodekit/ui`, with re-derived chart tokens, docs pages under a new Components section, and Greenhouse showcase coverage.

**Architecture:** The chart is vendored verbatim from the shadcn `base-nova` registry (stock internals, identity via tokens only). The data table is a hook (`useDataTable`, wrapping `useReactTable`) plus presentational components composed over the existing Table/Button/DropdownMenu/Select/Popover/Command/Badge/Separator primitives — client mode by default, `manual: true` for server-driven sort/filter/page (the data explorer's contract, issue #60, out of scope here).

**Tech Stack:** pnpm workspace; `packages/ui` is buildless TypeScript (`main: src/index.ts`), tested with vitest (`environment: "node"` by default, `// @vitest-environment happy-dom` per-file for mount tests). Docs are Starlight (`web/docs`). Showcase is the Greenhouse app in `root/apps/greenhouse` (TanStack Start).

**Spec:** `docs/specs/2026-07-14-ui-charts-data-table-design.md`

## Global Constraints

- Only two new dependencies, both in `packages/ui`: `recharts@^3.8.0` and `@tanstack/react-table@^8.21.3`. **No** `@tanstack/react-virtual`, no JSON-tree-viewer libs, no date libraries (use `Intl`). `@tanstack/react-query` and `react-resizable-panels` already exist elsewhere — do not re-add or wrap them.
- Stock shadcn internals; identity via tokens only. Never hand-tune component internals to look different from upstream.
- Base-nova composition idioms: triggers compose via `render={<Button …/>}` (Base UI), **not** Radix `asChild`. `Select` needs a null-guard on `onValueChange`, `SelectGroup` inside `SelectContent`, and `alignItemWithTrigger={false}` (see `packages/runtime/dashboard/src/routes/gateways_.$providerId.tsx`).
- All work on the current `ui` branch in `/Users/sesv/Code/worktrees/lodekit/ui`. Commit after every task; no `Co-Authored-By` trailers, no "Generated with Claude Code" anywhere.
- `docs/changelog.md` and `docs/defer.md` are append-only.
- Run commands from the repo root `/Users/sesv/Code/worktrees/lodekit/ui` unless stated otherwise.

---

### Task 1: Dependencies + stock chart port

**Files:**
- Modify: `packages/ui/package.json` (via pnpm)
- Create: `packages/ui/src/components/chart.tsx` (vendored from registry)
- Modify: `packages/ui/src/index.ts`
- Test: `packages/ui/tests/chart-ssr.test.tsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`, `ChartLegendContent`, `ChartStyle`, `type ChartConfig` exported from `@lodekit/ui`. `ChartConfig = Record<string, { label?: ReactNode; icon?: ComponentType } & ({ color?: string } | { theme: { light: string; dark: string } })>`. Consumers pass recharts primitives as children and reference series colors as `var(--color-<key>)`.

- [ ] **Step 1: Add the dependencies**

```bash
pnpm --filter @lodekit/ui add recharts@^3.8.0 @tanstack/react-table@^8.21.3
```

Expected: `packages/ui/package.json` gains both under `dependencies`; `pnpm-lock.yaml` updates. (recharts@3.8.0 is exactly what the base-nova registry item declares.)

- [ ] **Step 2: Write the failing chart test**

Create `packages/ui/tests/chart-ssr.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { Line, LineChart } from "recharts";

import { ChartContainer, type ChartConfig } from "../src";

// SSR smoke for the chart port: ChartContainer must render its wrapper and
// emit the per-series CSS variables (light + dark) from the config.
describe("chart", () => {
  it("renders config-driven CSS variables", () => {
    const config = {
      temp: { label: "Temperature", color: "var(--chart-1)" },
      themed: { label: "Themed", theme: { light: "#111111", dark: "#eeeeee" } },
    } satisfies ChartConfig;

    const html = renderToString(
      <ChartContainer config={config}>
        <LineChart data={[{ temp: 1, themed: 2 }]}>
          <Line dataKey="temp" />
        </LineChart>
      </ChartContainer>
    );

    expect(html).toContain('data-slot="chart"');
    expect(html).toContain("--color-temp: var(--chart-1);");
    expect(html).toContain("--color-themed: #111111;");
    expect(html).toContain("--color-themed: #eeeeee;");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @lodekit/ui exec vitest run tests/chart-ssr.test.tsx`
Expected: FAIL — `ChartContainer` is not exported from `../src`.

- [ ] **Step 4: Vendor the stock component**

Fetch the stock base-nova chart and rewrite only the `cn` import path (same pipeline that produced the other 48 components):

```bash
cd packages/ui
curl -sf https://ui.shadcn.com/r/styles/base-nova/chart.json \
  | node -e '
    let s = "";
    process.stdin.on("data", (c) => (s += c));
    process.stdin.on("end", () => {
      const item = JSON.parse(s);
      const src = item.files[0].content.replace(
        "@/registry/base-nova/lib/utils",
        "../lib/utils"
      );
      require("fs").writeFileSync("src/components/chart.tsx", src);
    });
  '
cd ../..
```

Sanity-check the result — it must start with `"use client"`, import `cn` from `"../lib/utils"`, and export `ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, ChartStyle` plus `export type ChartConfig`:

```bash
grep -n "use client\|../lib/utils\|^export" packages/ui/src/components/chart.tsx
```

Make **no other edits** to the file — stock internals stay stock. (The registry item also lists `card` as a dependency; it's already vendored.)

- [ ] **Step 5: Export from the index**

In `packages/ui/src/index.ts`, the component re-exports are alphabetical. Insert between the `card` and `checkbox` lines:

```ts
export * from "./components/chart";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @lodekit/ui exec vitest run tests/chart-ssr.test.tsx`
Expected: PASS.

If it fails inside recharts' `ResponsiveContainer` during SSR: the vendored file renders `ResponsiveContainer` with an `initialDimension` prop — confirm the vendored content matches the registry (re-run Step 4) before touching anything else. Do not patch chart internals.

- [ ] **Step 7: Full package check**

Run: `pnpm --filter @lodekit/ui check && pnpm --filter @lodekit/ui test`
Expected: tsc clean; all tests pass (ssr-smoke, command-dialog-mount, chart-ssr).

- [ ] **Step 8: Commit**

```bash
git add packages/ui/package.json pnpm-lock.yaml packages/ui/src/components/chart.tsx packages/ui/src/index.ts packages/ui/tests/chart-ssr.test.tsx
git commit -m "feat(ui): vendor stock base-nova chart (recharts)"
```

---

### Task 2: Re-derive the chart tokens

**Files:**
- Modify: `packages/ui/theme-tokens.css:29-33` (light) and `:64-68` (dark)

**Interfaces:**
- Consumes: nothing.
- Produces: `--chart-1…--chart-5` in `:root` and `.dark`. The `@theme inline` `--color-chart-*` mappings already exist — do not touch them.

Background: the previous values had a near-duplicate pair (light `#ce6f26` vs `#c07b3a`). The new values were derived with the dataviz color formula and **validated** (lightness band, chroma floor, CVD adjacent-pair separation ΔE ≥ 12, ≥ 3:1 contrast) against the card surfaces (`#ffffff` light, `#152634` dark) — worst adjacent CVD ΔE 39.1 light / 35.3 dark, no contrast relief needed. Slot 1 stays the cork-amber brand hue.

- [ ] **Step 1: Replace the light-mode values**

In `packages/ui/theme-tokens.css`, `:root` block, replace:

```css
  --chart-1: #ce6f26;
  --chart-2: #79b356;
  --chart-3: #4c7ca6;
  --chart-4: #c07b3a;
  --chart-5: #a9cef2;
```

with:

```css
  /* Categorical series (fixed order, never cycled) — CVD- and
     contrast-validated against the card surfaces; slot 1 is the brand amber. */
  --chart-1: #ce6f26;
  --chart-2: #3d7ab8;
  --chart-3: #5d9440;
  --chart-4: #7a63c9;
  --chart-5: #c25e88;
```

- [ ] **Step 2: Replace the dark-mode values**

In the `.dark` block, replace:

```css
  --chart-1: #e08a3c;
  --chart-2: #79b356;
  --chart-3: #a9cef2;
  --chart-4: #b57a42;
  --chart-5: #4c7ca6;
```

with:

```css
  --chart-1: #cd7c2c;
  --chart-2: #4e8ec7;
  --chart-3: #69a648;
  --chart-4: #9280dd;
  --chart-5: #cc6d94;
```

- [ ] **Step 3: Verify**

Run: `grep -c -- "--chart-" packages/ui/theme-tokens.css`
Expected: `15` (5 light + 5 dark + 5 `@theme inline` mappings).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/theme-tokens.css
git commit -m "feat(ui): re-derive chart tokens (CVD/contrast validated, cork-amber anchored)"
```

---

### Task 3: DataTable composition (hook + component + companions)

**Files:**
- Create: `packages/ui/src/components/data-table.tsx`
- Modify: `packages/ui/src/index.ts`
- Test: `packages/ui/tests/data-table.test.tsx`

**Interfaces:**
- Consumes: existing primitives from sibling modules (`./table`, `./button`, `./badge`, `./checkbox` not needed, `./command`, `./dropdown-menu`, `./popover`, `./select`, `./separator`) and `cn` from `../lib/utils`.
- Produces (all exported from `@lodekit/ui`):
  - `useDataTable<TData>(options: UseDataTableOptions<TData>): Table<TData>` — `UseDataTableOptions` = TanStack `TableOptions` minus `getCoreRowModel`/`manual*` flags, plus `manual?: boolean`.
  - `DataTable<TData>({ table, className, ...divProps })`
  - `DataTableColumnHeader<TData, TValue>({ column, title, className })`
  - `DataTablePagination<TData>({ table, pageSizeOptions?, className })`
  - `DataTableViewOptions<TData>({ table })`
  - `DataTableFacetedFilter<TData, TValue>({ column, title, options: { label, value, icon? }[] })`
  - Re-exported TanStack types for consumers: `type ColumnDef`, `type SortingState`, `type ColumnFiltersState`, `type PaginationState`, `type VisibilityState`.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/tests/data-table.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

import {
  DataTable,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableViewOptions,
  useDataTable,
  type ColumnDef,
  type SortingState,
} from "../src";
import type { Table as TanstackTable } from "@tanstack/react-table";

type Row = { name: string; qty: number };

const columns: ColumnDef<Row>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
  },
  { accessorKey: "qty", header: "Qty" },
];

const data: Row[] = [
  { name: "fern", qty: 3 },
  { name: "aloe", qty: 1 },
  { name: "monstera", qty: 2 },
];

function mount(el: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(el));
  return host;
}

function cellTexts(host: HTMLElement) {
  return [...host.querySelectorAll("tbody td:first-child")].map((td) => td.textContent);
}

describe("useDataTable client mode", () => {
  it("sorts and paginates client-side", () => {
    let table!: TanstackTable<Row>;
    function Fixture() {
      table = useDataTable({ columns, data });
      return <DataTable table={table} />;
    }
    const host = mount(<Fixture />);
    expect(cellTexts(host)).toEqual(["fern", "aloe", "monstera"]);

    act(() => table.getColumn("name")!.toggleSorting(false));
    expect(cellTexts(host)).toEqual(["aloe", "fern", "monstera"]);

    act(() => table.setPageSize(2));
    expect(cellTexts(host)).toEqual(["aloe", "fern"]);
  });

  it("renders the empty state across all columns", () => {
    function Fixture() {
      const table = useDataTable({ columns, data: [] });
      return <DataTable table={table} />;
    }
    const host = mount(<Fixture />);
    const cell = host.querySelector("tbody td")!;
    expect(cell.textContent).toBe("No results.");
    expect(cell.getAttribute("colspan")).toBe("2");
  });
});

describe("useDataTable manual mode", () => {
  it("exposes [{id, desc}] sorting state without sorting rows itself", () => {
    const onSortingChange = vi.fn();
    let table!: TanstackTable<Row>;
    let latest: SortingState = [];
    function Fixture() {
      const [sorting, setSorting] = useState<SortingState>([]);
      latest = sorting;
      table = useDataTable({
        columns,
        data,
        manual: true,
        rowCount: 30,
        state: { sorting, pagination: { pageIndex: 0, pageSize: 3 } },
        onSortingChange: (updater) => {
          onSortingChange(updater);
          setSorting((old) => (typeof updater === "function" ? updater(old) : updater));
        },
        onPaginationChange: () => {},
      });
      return <DataTable table={table} />;
    }
    const host = mount(<Fixture />);

    act(() => table.getColumn("name")!.toggleSorting(true));
    expect(onSortingChange).toHaveBeenCalledTimes(1);
    expect(latest).toEqual([{ id: "name", desc: true }]);
    // Manual mode: the caller sorts (SQL-side); rendered order must be untouched.
    expect(cellTexts(host)).toEqual(["fern", "aloe", "monstera"]);
    // Server-driven page math comes from rowCount, not data length.
    expect(table.getPageCount()).toBe(10);
  });
});

describe("companion SSR smoke", () => {
  it("pagination and view options render", () => {
    function Fixture() {
      const table = useDataTable({ columns, data });
      return (
        <div>
          <DataTableViewOptions table={table} />
          <DataTable table={table} />
          <DataTablePagination table={table} />
        </div>
      );
    }
    const html = renderToString(<Fixture />);
    expect(html).toContain('data-slot="data-table"');
    expect(html).toContain("Rows per page");
    expect(html).toContain("Page 1 of 1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lodekit/ui exec vitest run tests/data-table.test.tsx`
Expected: FAIL — `useDataTable`/`DataTable` not exported from `../src`.

- [ ] **Step 3: Implement the composition**

Create `packages/ui/src/components/data-table.tsx`. This is the stock shadcn data-table recipe shape, adapted only where base-nova idioms differ (trigger `render` prop, `SelectGroup` + `alignItemWithTrigger={false}`, null-guarded `onValueChange`):

```tsx
"use client"

import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type Table as TanstackTable,
  type TableOptions,
} from "@tanstack/react-table"
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  EyeOff,
  PlusCircle,
  Settings2,
} from "lucide-react"

import { cn } from "../lib/utils"
import { Badge } from "./badge"
import { Button } from "./button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "./command"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select"
import { Separator } from "./separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table"

type UseDataTableOptions<TData> = Omit<
  TableOptions<TData>,
  "getCoreRowModel" | "manualSorting" | "manualFiltering" | "manualPagination"
> & {
  /**
   * Server-driven mode: sorting, filtering, and pagination are executed by
   * the caller (e.g. as SQL) and fed back through `state` + `on*Change`
   * callbacks; requires `rowCount` or `pageCount` for page math. No client
   * row models are applied.
   */
  manual?: boolean
}

function useDataTable<TData>({
  manual = false,
  ...options
}: UseDataTableOptions<TData>) {
  return useReactTable<TData>({
    enableMultiSort: true,
    ...(manual
      ? {
          manualSorting: true,
          manualFiltering: true,
          manualPagination: true,
        }
      : {
          getSortedRowModel: getSortedRowModel(),
          getFilteredRowModel: getFilteredRowModel(),
          getPaginationRowModel: getPaginationRowModel(),
          getFacetedRowModel: getFacetedRowModel(),
          getFacetedUniqueValues: getFacetedUniqueValues(),
        }),
    ...options,
    getCoreRowModel: getCoreRowModel(),
  })
}

function DataTable<TData>({
  table,
  className,
  ...props
}: React.ComponentProps<"div"> & { table: TanstackTable<TData> }) {
  return (
    <div
      data-slot="data-table"
      className={cn("overflow-hidden rounded-md border", className)}
      {...props}
    >
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} colSpan={header.colSpan}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={table.getAllColumns().length}
                className="h-24 text-center"
              >
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: React.ComponentProps<"div"> & {
  column: Column<TData, TValue>
  title: string
}) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="data-[popup-open]:bg-accent -ml-3 h-8"
            >
              <span>{title}</span>
              {column.getIsSorted() === "desc" ? (
                <ArrowDown />
              ) : column.getIsSorted() === "asc" ? (
                <ArrowUp />
              ) : (
                <ChevronsUpDown />
              )}
            </Button>
          }
        />
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
            <ArrowUp className="text-muted-foreground/70" />
            Asc
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
            <ArrowDown className="text-muted-foreground/70" />
            Desc
          </DropdownMenuItem>
          {column.getCanHide() && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                <EyeOff className="text-muted-foreground/70" />
                Hide
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function DataTablePagination<TData>({
  table,
  pageSizeOptions = [10, 20, 30, 40, 50],
  className,
}: React.ComponentProps<"div"> & {
  table: TanstackTable<TData>
  pageSizeOptions?: number[]
}) {
  return (
    <div
      data-slot="data-table-pagination"
      className={cn("flex items-center justify-between px-2", className)}
    >
      <div className="text-muted-foreground flex-1 text-sm">
        {table.getFilteredSelectedRowModel().rows.length > 0 &&
          `${table.getFilteredSelectedRowModel().rows.length} of ${table.getFilteredRowModel().rows.length} row(s) selected.`}
      </div>
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium">Rows per page</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              if (value) table.setPageSize(Number(value))
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top" alignItemWithTrigger={false}>
              <SelectGroup>
                {pageSizeOptions.map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-[100px] items-center justify-center text-sm font-medium">
          Page {table.getState().pagination.pageIndex + 1} of{" "}
          {Math.max(table.getPageCount(), 1)}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to first page</span>
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to last page</span>
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  )
}

function DataTableViewOptions<TData>({
  table,
}: {
  table: TanstackTable<TData>
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="ml-auto hidden h-8 lg:flex">
            <Settings2 />
            View
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-[150px]">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter(
            (column) =>
              typeof column.accessorFn !== "undefined" && column.getCanHide()
          )
          .map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              className="capitalize"
              checked={column.getIsVisible()}
              onCheckedChange={(value) => column.toggleVisibility(!!value)}
            >
              {column.id}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
}: {
  column?: Column<TData, TValue>
  title?: string
  options: {
    label: string
    value: string
    icon?: React.ComponentType<{ className?: string }>
  }[]
}) {
  const facets = column?.getFacetedUniqueValues()
  const selectedValues = new Set(column?.getFilterValue() as string[])

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="h-8 border-dashed">
            <PlusCircle />
            {title}
            {selectedValues.size > 0 && (
              <>
                <Separator orientation="vertical" className="mx-2 h-4" />
                <Badge
                  variant="secondary"
                  className="rounded-sm px-1 font-normal lg:hidden"
                >
                  {selectedValues.size}
                </Badge>
                <div className="hidden space-x-1 lg:flex">
                  {selectedValues.size > 2 ? (
                    <Badge
                      variant="secondary"
                      className="rounded-sm px-1 font-normal"
                    >
                      {selectedValues.size} selected
                    </Badge>
                  ) : (
                    options
                      .filter((option) => selectedValues.has(option.value))
                      .map((option) => (
                        <Badge
                          variant="secondary"
                          key={option.value}
                          className="rounded-sm px-1 font-normal"
                        >
                          {option.label}
                        </Badge>
                      ))
                  )}
                </div>
              </>
            )}
          </Button>
        }
      />
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedValues.has(option.value)
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      if (isSelected) {
                        selectedValues.delete(option.value)
                      } else {
                        selectedValues.add(option.value)
                      }
                      const filterValues = Array.from(selectedValues)
                      column?.setFilterValue(
                        filterValues.length ? filterValues : undefined
                      )
                    }}
                  >
                    <div
                      className={cn(
                        "border-primary flex size-4 items-center justify-center rounded-[4px] border",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible"
                      )}
                    >
                      <Check className="size-3.5" />
                    </div>
                    {option.icon && (
                      <option.icon className="text-muted-foreground size-4" />
                    )}
                    <span>{option.label}</span>
                    {facets?.get(option.value) && (
                      <span className="text-muted-foreground ml-auto flex size-4 items-center justify-center font-mono text-xs">
                        {facets.get(option.value)}
                      </span>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {selectedValues.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => column?.setFilterValue(undefined)}
                    className="justify-center text-center"
                  >
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export {
  useDataTable,
  DataTable,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableViewOptions,
  DataTableFacetedFilter,
}
export type {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table"
```

Note on `data-[popup-open]:bg-accent` in `DataTableColumnHeader`: Base UI marks open triggers with `data-popup-open`, not Radix's `data-state=open`. Check how other vendored base-nova components style open triggers (`grep -rn "popup-open" packages/ui/src/components | head`) and match whatever attribute they use.

- [ ] **Step 4: Export from the index**

In `packages/ui/src/index.ts`, insert alphabetically (after `context-menu`, before `dialog`):

```ts
export * from "./components/data-table";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @lodekit/ui exec vitest run tests/data-table.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Full package check**

Run: `pnpm --filter @lodekit/ui check && pnpm --filter @lodekit/ui test`
Expected: tsc clean, all test files pass.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/data-table.tsx packages/ui/src/index.ts packages/ui/tests/data-table.test.tsx
git commit -m "feat(ui): useDataTable/DataTable composition over @tanstack/react-table"
```

---

### Task 4: Greenhouse showcase — Sky Journal chart + care-history DataTable

**Files:**
- Modify: `root/apps/greenhouse/src/routes/almanac.tsx`
- Modify: `root/readme.md` (DoD table)

**Interfaces:**
- Consumes: from `@lodekit/ui` — `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`, `ChartLegendContent`, `type ChartConfig`, `useDataTable`, `DataTable`, `DataTableColumnHeader`, `DataTablePagination`, `type ColumnDef`; from `recharts` — `CartesianGrid`, `Line`, `LineChart`, `XAxis`, `YAxis`.
- Produces: nothing consumed by later tasks.

Existing code notes (read `root/apps/greenhouse/src/routes/almanac.tsx` first): `SkyJournal` receives `rows: WeatherDay[]` ordered **newest first** (`orderBy(desc(weatherLog.day)).limit(7)`); `WeatherDay` has `day` (`YYYY-MM-DD` string), `high`/`low` (°C reals), `humidity`, `wind`, `rained`. The care-history card maps `runs: TaskRun[]` into an `<ul>`; the filter buttons above it re-fetch server-side via `tasks.runs({ state, task })` — **keep the buttons exactly as they are** (they are SDK DoD coverage); only the list rendering changes.

- [ ] **Step 1: Update imports in `almanac.tsx`**

Replace the `@lodekit/ui` import line with:

```tsx
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle,
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent,
  DataTable, DataTableColumnHeader, DataTablePagination, useDataTable,
  type ChartConfig, type ColumnDef,
} from "@lodekit/ui";
```

and add:

```tsx
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
```

- [ ] **Step 2: Rebuild `SkyJournal` around a temperature line chart**

Replace the `SkyJournal` function's chart-less body. Keep the empty state and the latest-day summary line; the day-list `<div>` of older rows is replaced by the chart. New function:

```tsx
const skyConfig = {
  high: { label: "High °C", color: "var(--chart-1)" },
  low: { label: "Low °C", color: "var(--chart-2)" },
} satisfies ChartConfig;

const weekday = (day: string) =>
  new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(`${day}T12:00:00`));

function SkyJournal({ rows, onFetch }: { rows: WeatherDay[]; onFetch: () => void }) {
  const latest = rows[0];
  const series = [...rows].reverse(); // chart reads left→right, oldest→newest
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Sky Journal
          <Button size="sm" variant="outline" onClick={onFetch}>Fetch now</Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No weather yet — link an OpenWeatherMap key on the Gateways page and the
            morning task starts logging highs, lows, rain, humidity, and wind.
          </p>
        ) : (
          <>
            <p className="text-sm">
              <span className="font-medium">{latest.day}</span>{" — "}
              {latest.low.toFixed(0)}–{latest.high.toFixed(0)} °C, {latest.humidity}% humidity,
              wind {latest.wind.toFixed(1)} m/s{latest.rained ? ", rain" : ""}
            </p>
            <ChartContainer config={skyConfig} className="mt-3 aspect-[3/1] w-full">
              <LineChart data={series} margin={{ left: 0, right: 8, top: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={weekday} />
                <YAxis width={28} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line dataKey="high" type="monotone" stroke="var(--color-high)" strokeWidth={2} dot={false} />
                <Line dataKey="low" type="monotone" stroke="var(--color-low)" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

(Chart conventions, deliberate: two series → legend present; 2px lines, no dots; recessive grid, no axis lines; hover tooltip; weekday labels via `Intl` — no date library.)

- [ ] **Step 3: Rebuild care history as a client-mode DataTable**

Add module-scope column defs (below `const fmt = …`):

```tsx
const runColumns: ColumnDef<TaskRun>[] = [
  {
    accessorKey: "state",
    header: ({ column }) => <DataTableColumnHeader column={column} title="State" />,
    cell: ({ row }) => (
      <Badge
        variant={
          row.original.state === "failed" ? "destructive"
          : row.original.state === "succeeded" ? "secondary"
          : "outline"
        }
      >
        {row.original.state}
      </Badge>
    ),
  },
  {
    accessorKey: "task",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Task" />,
    cell: ({ row }) => <span className="font-medium">{row.original.task}</span>,
  },
  { accessorKey: "source", header: "Source" },
  { accessorKey: "attempt", header: "Attempt" },
  {
    id: "when",
    accessorFn: (r) => r.finishedAt ?? r.startedAt ?? r.createdAt,
    header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{fmt(getValue<number>())}</span>
    ),
  },
  {
    accessorKey: "durationMs",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Duration" />,
    cell: ({ getValue }) => {
      const ms = getValue<number | null>();
      return <span className="text-muted-foreground">{ms == null ? "—" : `${ms}ms`}</span>;
    },
  },
  {
    accessorKey: "error",
    header: "Error",
    cell: ({ getValue }) => {
      const error = getValue<string | null>();
      return error ? <span className="text-destructive">{error}</span> : null;
    },
  },
];
```

Inside `Almanac()`, after the existing state hooks, create the table:

```tsx
const runsTable = useDataTable({
  columns: runColumns,
  data: runs,
  initialState: { pagination: { pageSize: 10 } },
});
```

In the Care history card, keep the filter-button `<div>` untouched, and replace the `<ul>…</ul>` block with:

```tsx
<DataTable table={runsTable} />
<DataTablePagination table={runsTable} />
```

- [ ] **Step 4: Type-check the app**

Greenhouse has no test suite; the almanac route is exercised by the runtime smoke in Task 6. Here, check compilation:

```bash
pnpm --filter @lodekit/ui check
cd root/apps/greenhouse && npx tsc --noEmit 2>&1 | head -20; cd ../../..
```

Expected: no errors mentioning `almanac.tsx`. (If the app has no tsconfig suitable for standalone checking and `npx tsc` errors on unrelated infrastructure, note it and rely on the Task 6 runtime smoke instead — do not restructure the app's tsconfig.)

- [ ] **Step 5: Extend the DoD table in `root/readme.md`**

Append two rows to the Definition-of-done table (after the `@lodekit/ui`, `theme.css` row):

```markdown
| `@lodekit/ui` chart (`ChartContainer` + `--chart-*` tokens) | Sky Journal temperature lines |
| `@lodekit/ui` `useDataTable` + `DataTable` (client mode, header sort, pagination) | Almanac care history |
```

And append below the table's existing "Pending" paragraphs:

```markdown
**Covered by unit tests, pending the data explorer (#60):** `useDataTable` manual mode
(server-driven sort/filter/page) and the `DataTableViewOptions` / `DataTableFacetedFilter`
companions — `packages/ui/tests/data-table.test.tsx` until the explorer exercises them
for real.
```

- [ ] **Step 6: Commit**

```bash
git add root/apps/greenhouse/src/routes/almanac.tsx root/readme.md
git commit -m "feat(greenhouse): sky journal chart + care-history data table (ui DoD)"
```

---

### Task 5: Docs — Components section + changelog

**Files:**
- Create: `web/docs/src/content/docs/components/overview.mdx`
- Create: `web/docs/src/content/docs/components/chart.mdx`
- Create: `web/docs/src/content/docs/components/data-table.mdx`
- Modify: `web/docs/astro.config.mjs` (sidebar)
- Modify: `web/docs/src/content/docs/build/using-the-ui-library.mdx`
- Modify: `docs/changelog.md` (append-only)

**Interfaces:**
- Consumes: the public API from Tasks 1 and 3 (exact names in those tasks' Produces blocks).
- Produces: pages at `/components/overview/`, `/components/chart/`, `/components/data-table/` (the links validator gates the build — any dead link fails `pnpm --filter @lodekit/web-docs build`).

- [ ] **Step 1: Add the sidebar group**

In `web/docs/astro.config.mjs`, insert after the "Building apps" group (before "Services"):

```js
        {
          label: "Components",
          items: [
            "components/overview",
            "components/chart",
            "components/data-table",
          ],
        },
```

- [ ] **Step 2: Create `components/overview.mdx`**

```mdx
---
title: Components overview
description: "Every component in the UI library — stock shadcn, one shared theme."
---

Every app imports its interface from `@lodekit/ui` — no installation, no copying
component files. The components are [shadcn/ui](https://ui.shadcn.com/) (the
Base UI-based `base-nova` style), kept **stock**: Lodekit adds one shared theme
through tokens, never custom component internals. Because they're stock, shadcn's
own docs and examples apply directly, and your agent already knows them well.

## The stock set

`accordion`, `alert`, `alert-dialog`, `aspect-ratio`, `avatar`, `badge`,
`breadcrumb`, `button`, `button-group`, `card`, `checkbox`, `collapsible`,
`combobox`, `command`, `context-menu`, `dialog`, `drawer`, `dropdown-menu`, `empty`,
`field`, `hover-card`, `input`, `input-group`, `input-otp`, `kbd`, `label`,
`menubar`, `navigation-menu`, `pagination`, `popover`, `progress`, `radio-group`,
`resizable`, `scroll-area`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`,
`slider`, `sonner`, `spinner`, `switch`, `table`, `tabs`, `textarea`, `toggle`,
`toggle-group`, `tooltip`

— plus the `cn` helper for composing class names.

## Beyond the stock set

Two capabilities get their own pages, because they carry API surface of their own:

- **[Chart](/components/chart/)** — recharts through the stock shadcn chart port,
  themed by the `--chart-*` tokens.
- **[Data table](/components/data-table/)** — a reusable table engine over
  `@tanstack/react-table`, client-side or server-driven.

## One theme

Colors, radii, and typography come from theme tokens, not from each app's code.
An app opts in with one line in `src/index.css`:

```css
@import "@lodekit/ui/theme.css";
```

Redefining tokens — globally or per app — restyles every component at once; see
[Theming](/guide/theming/).
```

- [ ] **Step 3: Create `components/chart.mdx`**

````mdx
---
title: Chart
description: "Charts with recharts and the stock shadcn chart port, themed by tokens."
---

Charts are [recharts](https://recharts.org/), wrapped by the stock
[shadcn chart components](https://ui.shadcn.com/docs/components/chart):
`ChartContainer`, `ChartTooltip` / `ChartTooltipContent`,
`ChartLegend` / `ChartLegendContent`, and the `ChartConfig` type. You compose
recharts primitives yourself — the wrapper adds theming and consistent
tooltip/legend styling.

```tsx
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
  ChartLegend, ChartLegendContent, type ChartConfig,
} from "@lodekit/ui";
import { CartesianGrid, Line, LineChart, XAxis } from "recharts";

const config = {
  high: { label: "High °C", color: "var(--chart-1)" },
  low: { label: "Low °C", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function TemperatureChart({ data }: { data: { day: string; high: number; low: number }[] }) {
  return (
    <ChartContainer config={config} className="aspect-[3/1] w-full">
      <LineChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line dataKey="high" stroke="var(--color-high)" strokeWidth={2} dot={false} />
        <Line dataKey="low" stroke="var(--color-low)" strokeWidth={2} dot={false} />
      </LineChart>
    </ChartContainer>
  );
}
```

Each key in the config becomes a CSS variable — `--color-high`, `--color-low` —
scoped to that chart, in both light and dark mode.

## Series colors

The theme defines five categorical series tokens, `--chart-1` through
`--chart-5`, derived from the Lodekit palette and validated for color-vision
deficiency separation and surface contrast in both modes. Use them **in order,
starting from `--chart-1`** — the fixed order is what keeps adjacent series
distinguishable. A config can also hard-code a color or provide a per-mode pair
(`theme: { light, dark }`), but for ordinary series the tokens are the right
default — and they follow [theme overrides](/guide/theming/) automatically.

For the full recharts surface (areas, bars, pies, radial charts…), shadcn's
[chart examples](https://ui.shadcn.com/charts) all work as-is — swap their
`ChartContainer` import for `@lodekit/ui`.

The Greenhouse showcase renders one: the Sky Journal temperature chart on the
Almanac page.
````

- [ ] **Step 4: Create `components/data-table.mdx`**

````mdx
---
title: Data table
description: "A reusable table engine — sorting, filtering, pagination — client-side or server-driven."
---

`useDataTable` wraps [TanStack Table](https://tanstack.com/table/latest) and
pairs with `DataTable`, which renders the instance over the stock Table
primitives. Columns are TanStack `ColumnDef`s — shadcn's
[data-table guide](https://ui.shadcn.com/docs/components/data-table) applies
directly.

## Client mode

For ordinary app tables, pass columns and rows; sorting, filtering, and
pagination run in the browser:

```tsx
import {
  useDataTable, DataTable, DataTableColumnHeader, DataTablePagination,
  type ColumnDef,
} from "@lodekit/ui";

type Run = { task: string; state: string; durationMs: number };

const columns: ColumnDef<Run>[] = [
  {
    accessorKey: "task",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Task" />,
  },
  { accessorKey: "state", header: "State" },
  {
    accessorKey: "durationMs",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Duration" />,
  },
];

export function RunsTable({ runs }: { runs: Run[] }) {
  const table = useDataTable({
    columns,
    data: runs,
    initialState: { pagination: { pageSize: 10 } },
  });
  return (
    <>
      <DataTable table={table} />
      <DataTablePagination table={table} />
    </>
  );
}
```

## Manual mode (server-driven)

With `manual: true`, the table stops computing anything itself: sorting,
filtering, and pagination become *state you own*. Interactions call your
`on*Change` callbacks; you execute the query (typically SQL via a server
function) and pass the resulting page back as `data`. Multi-column sorting
state is the standard TanStack shape, `[{ id, desc }]`.

```tsx
const [sorting, setSorting] = useState<SortingState>([]);
const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });

// Re-query whenever sorting/pagination change; ORDER BY from `sorting`,
// LIMIT/OFFSET from `pagination`. `rows` and `total` come from the server.
const table = useDataTable({
  columns,
  data: rows,
  manual: true,
  rowCount: total,
  state: { sorting, pagination },
  onSortingChange: setSorting,
  onPaginationChange: setPagination,
});
```

Manual mode requires `rowCount` (or `pageCount`) so the pager can do its math.
Everything else — `DataTable`, `DataTableColumnHeader`, `DataTablePagination` —
works unchanged.

## Companions

- **`DataTableColumnHeader`** — drop into a column's `header` to get a sort
  toggle (asc/desc/hide) that reflects sort state.
- **`DataTablePagination`** — page-size select and first/prev/next/last
  controls; takes an optional `pageSizeOptions` array.
- **`DataTableViewOptions`** — a column-visibility dropdown for the toolbar.
- **`DataTableFacetedFilter`** — a multi-select filter with per-value counts
  (client mode only — the counts come from client-side faceting).

The Greenhouse showcase renders one: the care-history table on the Almanac page.
````

- [ ] **Step 5: Trim `using-the-ui-library.mdx`**

Replace the "What's in the box" section body (the long backtick list and the
paragraph after it) with a pointer, keeping the heading:

```mdx
## What's in the box

The set is stock shadcn — Lodekit adds the theme, not custom component internals —
plus two composed capabilities with API surface of their own: charts and data
tables. The full inventory lives in the
[components overview](/components/overview/); because the components are stock,
shadcn's own docs and examples apply directly, and your agent already knows them
well.
```

Leave every other section of the page untouched.

- [ ] **Step 6: Append the changelog entry**

In `docs/changelog.md`, append under `## New` (create the heading if the buffer is empty — read the file first; it is append-only, never reword existing entries):

```markdown
- The UI library gains charts (recharts via the stock shadcn chart port, themed by
  the `--chart-*` tokens) and a reusable data table (`useDataTable` + `DataTable`:
  sorting, filtering, pagination — client-side or server-driven). The Greenhouse
  Almanac shows both: a Sky Journal temperature chart and a sortable care-history
  table.
```

- [ ] **Step 7: Build the docs site (links validator gates)**

Run: `pnpm --filter @lodekit/web-docs build`
Expected: build succeeds; the links validator reports no broken links.

- [ ] **Step 8: Commit**

```bash
git add web/docs/astro.config.mjs web/docs/src/content/docs/components/ web/docs/src/content/docs/build/using-the-ui-library.mdx docs/changelog.md
git commit -m "docs: components section — overview, chart, data table"
```

---

### Task 6: Full verification — workspace tests + runtime smoke

**Files:** none created; verification only.

**Interfaces:** consumes everything above.

- [ ] **Step 1: Workspace install sanity + full test suite**

```bash
pnpm install
pnpm test
```

Expected: install is a no-op (lockfile already updated); `@lodekit/runtime`, `@lodekit/sdk`, `@lodekit/ui`, and `@lodekit/manager` suites all pass. (If `better-sqlite3` throws `NODE_MODULE_VERSION` mismatch: `pnpm rebuild better-sqlite3` and re-run.)

- [ ] **Step 2: Runtime smoke of the Greenhouse almanac**

The runtime's e2e suite (`packages/runtime/tests/e2e.test.ts`) boots the real runtime with the real Greenhouse app and asserts `/greenhouse/almanac` SSRs with status 200 — the changed almanac (chart + DataTable) now renders through it, so an SSR crash in either fails the suite. It already ran as part of `pnpm test` in Step 1; if it passed, this step is satisfied.

For a direct look (optional but recommended), boot and fetch — apps are path-mounted, default port 7777:

```bash
LODEKIT_ROOT=$(pwd)/root pnpm --filter @lodekit/runtime start &
sleep 20   # the first request triggers the app build
curl -s http://localhost:7777/greenhouse/almanac | grep -c "Sky Journal"
```

Expected: `1` (or more). Then kill the runtime process.

If the route errors, debug via the runtime logs (stdout) — the likely failures are an import typo in `almanac.tsx` or an SSR issue in the chart; fix, re-run, and amend the Task 4 commit only if the fix belongs there.

- [ ] **Step 3: Push the branch and raise the PR**

Only once everything above is green:

```bash
git push -u origin ui
gh pr create --title "feat(ui): charts (recharts) + data table (@tanstack/react-table)" --body "$(cat <<'EOF'
## Summary
- `@lodekit/ui` gains `recharts` via the stock base-nova shadcn chart port (`ChartContainer` + tooltip/legend + `ChartConfig`), and `@tanstack/react-table` via a reusable `useDataTable`/`DataTable` composition (column-header sort, pagination, view options, faceted filter).
- Manual mode (`manual: true` — server-driven sort/filter/page with `[{id, desc}]` multi-column sorting state) is the contract the dashboard data explorer (#60) will consume; covered by unit tests until then.
- `--chart-1…5` tokens re-derived (light + dark), CVD- and contrast-validated, anchored on the cork-amber brand.
- New docs Components section (overview, chart, data table); Greenhouse Almanac exercises both (Sky Journal temperature chart, care-history table) per the DoD convention.

## Notes
- Spec: `docs/specs/2026-07-14-ui-charts-data-table-design.md`; plan: `docs/plans/2026-07-14-ui-charts-data-table.md`.
- Chart internals are stock (vendored from `r/styles/base-nova/chart.json`, recharts 3.8) — identity via tokens only.
- Explicitly not added: `@tanstack/react-virtual`, JSON viewers, date libraries.

## Test plan
- [ ] `pnpm test` — workspace suites incl. new chart SSR + data-table client/manual tests
- [ ] `pnpm --filter @lodekit/ui check` — tsc clean
- [ ] `pnpm --filter @lodekit/web-docs build` — links validator green
- [ ] Runtime smoke: Greenhouse `/almanac` renders Sky Journal chart + care-history table
EOF
)"
```

Then **stop** — merging is the person's call.
