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
    // React SSR inserts <!-- --> comment boundaries between adjacent text
    // children; strip them so text assertions see the rendered words.
    const text = html.replace(/<!--.*?-->/g, "");
    expect(text).toContain('data-slot="data-table"');
    expect(text).toContain("Rows per page");
    expect(text).toContain("Page 1 of 1");
  });
});
