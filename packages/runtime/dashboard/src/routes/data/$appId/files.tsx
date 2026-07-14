import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Button, Input, Skeleton,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@lodekit/ui";
import {
  ChevronLeft, ChevronRight, ExternalLink, File, FileArchive, FileAudio, FileImage, FileText, FileVideo, RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { fetchFiles, type FileStat } from "../../../lib/data-api";
import { formatBytes, formatTs, relativeTime } from "../../../lib/format";
import { DetailSheet } from "../../../components/data/detail-sheet";

export const Route = createFileRoute("/data/$appId/files")({
  component: FilesView,
});

const PAGE = 50;

function mimeIcon(contentType: string): LucideIcon {
  if (contentType.startsWith("image/")) return FileImage;
  if (contentType.startsWith("video/")) return FileVideo;
  if (contentType.startsWith("audio/")) return FileAudio;
  if (contentType.startsWith("text/") || contentType.includes("json") || contentType.includes("xml")) return FileText;
  if (contentType.includes("zip") || contentType.includes("tar") || contentType.includes("compress")) return FileArchive;
  return File;
}

function FilesView() {
  const { appId } = Route.useParams();
  const [prefix, setPrefix] = useState("");
  const [debounced, setDebounced] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const [detail, setDetail] = useState<FileStat | null>(null);
  const cursor = cursors[cursors.length - 1];

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(prefix); setCursors([]); }, 250);
    return () => clearTimeout(t);
  }, [prefix]);
  useEffect(() => { setPrefix(""); setDebounced(""); setCursors([]); setDetail(null); }, [appId]);

  const q = useQuery({
    queryKey: ["data", appId, "files", debounced, cursor ?? ""],
    placeholderData: keepPreviousData,
    queryFn: () => fetchFiles(appId, { prefix: debounced || undefined, cursor, limit: PAGE }),
  });

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg font-semibold">Files</h1>
      <div className="flex items-center gap-2">
        <Input placeholder="Slug prefix…" value={prefix} onChange={(e) => setPrefix(e.target.value)} className="h-8 w-56" />
        <Button variant="outline" size="sm" className="ml-auto h-8" onClick={() => void q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={q.isFetching ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>
      {q.isError ? (
        <p className="text-destructive text-sm">Failed to load files: {(q.error as Error).message}</p>
      ) : !q.data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.entries.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center">No files.</TableCell></TableRow>
                ) : (
                  q.data.entries.map((f) => {
                    const Icon = mimeIcon(f.contentType);
                    return (
                      <TableRow
                        key={f.slug}
                        tabIndex={0}
                        className="cursor-pointer focus-visible:bg-accent/50 focus-visible:outline-none"
                        onClick={() => setDetail(f)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            setDetail(f);
                          }
                        }}
                      >
                        <TableCell>
                          <span className="flex items-center gap-2">
                            <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                            <span className="min-w-0">
                              <span className="block truncate text-sm">{f.title ?? f.slug}</span>
                              {f.title && <span className="text-muted-foreground block truncate font-mono text-xs">{f.slug}</span>}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">{f.contentType}</TableCell>
                        <TableCell className="text-xs tabular-nums">{formatBytes(f.size)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{relativeTime(f.createdAt)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{f.expiresAt ? formatTs(f.expiresAt) : "—"}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <a href={f.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                            <ExternalLink className="size-4" /><span className="sr-only">Open raw file</span>
                          </a>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" disabled={cursors.length === 0 || q.isFetching} onClick={() => setCursors((c) => c.slice(0, -1))}>
              <ChevronLeft /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={q.data.nextCursor == null || q.isFetching}
              onClick={() => q.data.nextCursor != null && setCursors((c) => [...c, q.data.nextCursor!])}
            >
              Next <ChevronRight />
            </Button>
          </div>
        </>
      )}
      <DetailSheet
        open={detail != null}
        title={detail?.title ?? detail?.slug ?? ""}
        fields={detail ? [
          { label: "slug", value: detail.slug },
          { label: "title", value: detail.title },
          { label: "contentType", value: detail.contentType },
          { label: "size", value: formatBytes(detail.size) },
          { label: "hash", value: detail.hash },
          { label: "metadata", value: detail.metadata },
          { label: "createdAt", value: formatTs(detail.createdAt) },
          { label: "updatedAt", value: formatTs(detail.updatedAt) },
          { label: "expiresAt", value: detail.expiresAt ? formatTs(detail.expiresAt) : null },
          { label: "url", value: detail.url },
        ] : []}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}
