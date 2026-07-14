import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { flexRender } from "@tanstack/react-table";
import {
  Button, DataTableColumnHeader, DataTablePagination, Skeleton,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  useDataTable, type ColumnDef, type PaginationState, type SortingState,
} from "@lodekit/ui";
import { KeyRound } from "lucide-react";
import { fetchSchema, selectRows } from "../../../../lib/data-api";
import { buildCountQuery, buildRowsQuery, type FilterRule, type SortRule } from "../../../../lib/table-query";
import { TableToolbar } from "../../../../components/data/table-toolbar";
import { DetailSheet } from "../../../../components/data/detail-sheet";

export const Route = createFileRoute("/data/$appId/tables/$table")({
  component: TableBrowser,
});

type Row = Record<string, unknown>;

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground/60 italic">NULL</span>;
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return <span className="block max-w-64 truncate font-mono text-xs">{text}</span>;
}

function TableBrowser() {
  const { appId, table } = Route.useParams();
  const schemaQ = useQuery({ queryKey: ["data", appId, "schema"], queryFn: () => fetchSchema(appId) });
  const tbl = schemaQ.data?.tables.find((t) => t.name === table);

  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [sorts, setSorts] = useState<SortRule[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });
  const [detailRow, setDetailRow] = useState<Row | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPagination((p) => ({ ...p, pageIndex: 0 }));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  // State resets when the table param changes (sidebar navigation).
  useEffect(() => {
    setFilters([]); setSorts([]); setSearch(""); setDebouncedSearch("");
    setPagination({ pageIndex: 0, pageSize: 50 });
    setDetailRow(null);
  }, [appId, table]);

  const queryColumns = useMemo(() => (tbl?.columns ?? []).map((c) => ({ name: c.name, type: c.type })), [tbl]);

  const rowsQ = useQuery({
    queryKey: ["data", appId, "rows", table, { filters, sorts, search: debouncedSearch, pagination }],
    enabled: !!tbl,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const input = {
        table, columns: queryColumns, filters, sorts, search: debouncedSearch,
        limit: pagination.pageSize, offset: pagination.pageIndex * pagination.pageSize,
      };
      const [rows, count] = await Promise.all([
        selectRows(appId, buildRowsQuery(input)),
        selectRows(appId, buildCountQuery(input)),
      ]);
      return { rows, total: Number((count[0] as { n?: unknown } | undefined)?.n ?? 0) };
    },
  });

  const sorting: SortingState = useMemo(() => sorts.map((s) => ({ id: s.column, desc: s.desc })), [sorts]);
  const columns = useMemo<ColumnDef<Row>[]>(
    () =>
      (tbl?.columns ?? []).map((c) => ({
        id: c.name,
        accessorFn: (row: Row) => row[c.name],
        header: ({ column }) => (
          <div className="flex items-center gap-1.5">
            <DataTableColumnHeader column={column} title={c.name} />
            {c.pk && <KeyRound className="text-muted-foreground size-3" aria-label="primary key" />}
            <span className="text-muted-foreground text-[10px] font-normal lowercase">{c.type}</span>
          </div>
        ),
        cell: ({ getValue }) => <CellValue value={getValue()} />,
        enableSorting: true,
        enableHiding: true,
      })),
    [tbl]
  );

  const dt = useDataTable<Row>({
    data: rowsQ.data?.rows ?? [],
    columns,
    manual: true,
    rowCount: rowsQ.data?.total ?? 0,
    state: { sorting, pagination },
    onSortingChange: (u) => {
      const next = typeof u === "function" ? u(sorting) : u;
      setSorts(next.map((r) => ({ column: r.id, desc: r.desc })));
      setPagination((p) => ({ ...p, pageIndex: 0 }));
    },
    onPaginationChange: (u) => setPagination((p) => (typeof u === "function" ? u(p) : u)),
    getRowId: (_row, i) => String(i),
  });

  if (schemaQ.isError) return <p className="text-destructive text-sm">Failed to load schema: {(schemaQ.error as Error).message}</p>;
  if (!schemaQ.data) return <Skeleton className="h-64" />;
  if (!tbl) {
    return (
      <div className="text-sm">
        <p className="text-destructive">Table “{table}” no longer exists.</p>
        <Button variant="outline" size="sm" className="mt-3" render={<Link to="/data/$appId" params={{ appId }} />}>
          Back to overview
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-mono text-lg font-semibold">{table}</h1>
      <TableToolbar
        columns={queryColumns}
        filters={filters}
        onFiltersChange={(f) => { setFilters(f); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
        sorts={sorts}
        onSortsChange={(s) => { setSorts(s); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => void rowsQ.refetch()}
        refreshing={rowsQ.isFetching}
      />
      {rowsQ.isError ? (
        <p className="text-destructive text-sm">Query failed: {(rowsQ.error as Error).message}</p>
      ) : !rowsQ.data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          {/* Mirrors @lodekit/ui DataTable's body, adding row click-through. */}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                {dt.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((h) => (
                      <TableHead key={h.id} colSpan={h.colSpan}>
                        {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {dt.getRowModel().rows.length ? (
                  dt.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      tabIndex={0}
                      className="cursor-pointer focus-visible:bg-accent/50 focus-visible:outline-none"
                      onClick={() => setDetailRow(row.original)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setDetailRow(row.original);
                        }
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={dt.getVisibleLeafColumns().length} className="h-24 text-center">
                      No rows.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DataTablePagination table={dt} pageSizeOptions={[25, 50, 100]} />
        </>
      )}
      <DetailSheet
        open={detailRow != null}
        title={`${table} row`}
        fields={detailRow ? tbl.columns.map((c) => ({ label: c.name, value: detailRow[c.name] })) : []}
        onClose={() => setDetailRow(null)}
      />
    </div>
  );
}
