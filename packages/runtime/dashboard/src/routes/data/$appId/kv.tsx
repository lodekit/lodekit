import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Button, Input, Skeleton,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@lodekit/ui";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { fetchKv, type KvEntry } from "../../../lib/data-api";
import { formatTs, relativeTime } from "../../../lib/format";
import { DetailSheet } from "../../../components/data/detail-sheet";

export const Route = createFileRoute("/data/$appId/kv")({
  component: KvView,
});

const PAGE = 50;

function KvView() {
  const { appId } = Route.useParams();
  const [prefix, setPrefix] = useState("");
  const [debounced, setDebounced] = useState("");
  // Cursor stack: [ ] = first page; push nextCursor to advance, pop to go back.
  const [cursors, setCursors] = useState<string[]>([]);
  const [detail, setDetail] = useState<KvEntry | null>(null);
  const cursor = cursors[cursors.length - 1];

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(prefix); setCursors([]); }, 250);
    return () => clearTimeout(t);
  }, [prefix]);
  useEffect(() => { setPrefix(""); setDebounced(""); setCursors([]); setDetail(null); }, [appId]);

  const q = useQuery({
    queryKey: ["kv", appId, debounced, cursor ?? ""],
    placeholderData: keepPreviousData,
    queryFn: () => fetchKv(appId, { prefix: debounced || undefined, cursor, limit: PAGE }),
  });

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg font-semibold">Key-value</h1>
      <div className="flex items-center gap-2">
        <Input placeholder="Key prefix…" value={prefix} onChange={(e) => setPrefix(e.target.value)} className="h-8 w-56" />
        <Button variant="outline" size="sm" className="ml-auto h-8" onClick={() => void q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={q.isFetching ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>
      {q.isError ? (
        <p className="text-destructive text-sm">Failed to load entries: {(q.error as Error).message}</p>
      ) : !q.data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.entries.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="h-24 text-center">No entries.</TableCell></TableRow>
                ) : (
                  q.data.entries.map((e) => (
                    <TableRow
                      key={e.key}
                      tabIndex={0}
                      className="cursor-pointer focus-visible:bg-accent/50 focus-visible:outline-none"
                      onClick={() => setDetail(e)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          setDetail(e);
                        }
                      }}
                    >
                      <TableCell className="font-mono text-xs">{e.key}</TableCell>
                      <TableCell><span className="block max-w-80 truncate font-mono text-xs">{JSON.stringify(e.value)}</span></TableCell>
                      <TableCell className="text-muted-foreground text-xs">{relativeTime(e.createdAt)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{relativeTime(e.updatedAt)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{e.expiresAt ? formatTs(e.expiresAt) : "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" disabled={cursors.length === 0} onClick={() => setCursors((c) => c.slice(0, -1))}>
              <ChevronLeft /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={q.data.nextCursor == null}
              onClick={() => q.data.nextCursor != null && setCursors((c) => [...c, q.data.nextCursor!])}
            >
              Next <ChevronRight />
            </Button>
          </div>
        </>
      )}
      <DetailSheet
        open={detail != null}
        title={detail?.key ?? ""}
        fields={detail ? [
          { label: "key", value: detail.key },
          { label: "value", value: detail.value },
          { label: "createdAt", value: formatTs(detail.createdAt) },
          { label: "updatedAt", value: formatTs(detail.updatedAt) },
          { label: "expiresAt", value: detail.expiresAt ? formatTs(detail.expiresAt) : null },
        ] : []}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}
