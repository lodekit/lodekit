import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, CardHeader, CardTitle, Meta, Skeleton } from "@lodekit/ui";
import { useSSEEvent } from "../components/sse";

const LEVELS = ["debug", "info", "warn", "error"] as const;
type Level = (typeof LEVELS)[number];
const LEVEL_RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

interface LogRecord {
  id: number;
  ts: number;
  level: Level;
  source: string;
  appId: string | null;
  message: string;
  fields: Record<string, unknown> | null;
}

// MAX_LIVE_ROWS: live tail is allowed to grow the displayed list up to this many rows before it
// starts displacing the oldest row per arrival. MAX_ROWS: hard ceiling past which "Load more" is
// hidden regardless of how many more the server has.
const MAX_LIVE_ROWS = 500;
const MAX_ROWS = 1000;

export const Route = createFileRoute("/logs")({
  validateSearch: (s: Record<string, unknown>): { app?: string; source?: string } => ({
    ...(typeof s.app === "string" && s.app ? { app: s.app } : {}),
    ...(typeof s.source === "string" && s.source ? { source: s.source } : {}),
  }),
  component: LogsView,
});

function levelBadge(level: Level) {
  if (level === "error") return <Badge variant="destructive">error</Badge>;
  if (level === "warn") return <Badge variant="outline">warn</Badge>;
  if (level === "info") return <Badge variant="secondary">info</Badge>;
  return <Badge variant="secondary" className="opacity-60">debug</Badge>;
}

function Row({ r }: { r: LogRecord }) {
  const [open, setOpen] = useState(false);
  const hasFields = r.fields && Object.keys(r.fields).length > 0;
  return (
    <div className="border-b py-1.5 text-sm">
      <button
        className="flex w-full items-baseline gap-2 text-left"
        onClick={() => hasFields && setOpen((o) => !o)}
      >
        <Meta className="shrink-0 text-muted-foreground">
          {new Date(r.ts).toLocaleTimeString()}
        </Meta>
        {levelBadge(r.level)}
        <Meta className="shrink-0 text-muted-foreground">{r.appId ?? "platform"}·{r.source}</Meta>
        <span className="truncate">{r.message}</span>
      </button>
      {open && hasFields && (
        <pre className="mt-1 overflow-auto rounded bg-muted p-2 text-xs">
          {typeof r.fields?.stack === "string" ? r.fields.stack : JSON.stringify(r.fields, null, 2)}
        </pre>
      )}
    </div>
  );
}

function LogsView() {
  const { app, source } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [apps, setApps] = useState<{ appId: string; name: string }[]>([]);
  const [level, setLevel] = useState<Level>("debug");
  const [q, setQ] = useState("");
  const [records, setRecords] = useState<LogRecord[] | null>(null);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [debouncedQ, setDebouncedQ] = useState("");

  // Debounce the search box so it doesn't refire the backfill/live-filter on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const filterQuery = useMemo(() => {
    const query = new URLSearchParams({ limit: "200" });
    if (app) query.set("app", app);
    if (source) query.set("source", source);
    if (level !== "debug") query.set("level", level);
    if (debouncedQ) query.set("q", debouncedQ);
    return query;
  }, [app, source, level, debouncedQ]);

  // Current filters, readable from the persistent SSE handler without reopening the connection.
  const filtersRef = useRef({ app, source, level, q: debouncedQ });
  filtersRef.current = { app, source, level, q: debouncedQ };

  // Records that arrived over SSE while a backfill was in flight (records === null); merged in
  // once the backfill resolves so they aren't dropped.
  const pendingRef = useRef<LogRecord[]>([]);
  // Whether `records` currently holds a resolved backfill (as opposed to being mid-flight/null).
  // Read by the persistent SSE handler to decide between buffering and live-prepending.
  const hasRecordsRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    pendingRef.current = [];
    hasRecordsRef.current = false;
    setRecords(null);
    void fetch(`/api/logs?${filterQuery}`)
      .then((r) => r.json())
      .then((d: { records: LogRecord[]; nextBefore: number | null }) => {
        if (cancelled) return;
        // Pending records are newer than the backfill page, so they lead; dedupe real ids
        // (id 0 marks a degraded/unpersisted record and is always kept). Pending buffers
        // oldest-to-newest, so reverse it to match the newest-first display order.
        const pending = pendingRef.current.filter(
          (p) => p.id === 0 || !d.records.some((r) => r.id === p.id),
        );
        pendingRef.current = [];
        setRecords([...pending.slice().reverse(), ...d.records].slice(0, MAX_LIVE_ROWS));
        hasRecordsRef.current = true;
        setNextBefore(d.nextBefore);
      });
    return () => { cancelled = true; };
  }, [filterQuery]);

  // Live tail: a single persistent connection (filter changes must not tear it down), prepending
  // matching records from the shared SSE stream.
  useSSEEvent("log", (e) => {
    const r = JSON.parse(e.data) as LogRecord;
    const { app, source, level, q } = filtersRef.current;
    const matches =
      (!app || (app === "_platform" ? r.appId === null : r.appId === app)) &&
      (!source || r.source === source) &&
      LEVEL_RANK[r.level] >= LEVEL_RANK[level] &&
      (!q || r.message.toLowerCase().includes(q.toLowerCase()));
    if (!matches) return;
    if (!hasRecordsRef.current) {
      pendingRef.current.push(r);
      return;
    }
    // Non-shrinking: grows freely up to MAX_LIVE_ROWS; beyond that (user has paginated further)
    // the length holds steady and each arrival displaces the oldest displayed row, so the
    // paginated tail stays contiguous instead of getting chopped back down.
    // Cross-connection arrival order between the backfill fetch and this SSE stream isn't
    // guaranteed, so skip a real record (id !== 0) already present from backfill.
    setRecords((rs) =>
      rs && !(r.id !== 0 && rs.some((x) => x.id === r.id))
        ? [r, ...rs].slice(0, Math.max(MAX_LIVE_ROWS, rs.length))
        : rs
    );
  });

  useEffect(() => {
    void fetch("/api/apps").then((r) => r.json()).then(setApps);
  }, []);

  async function loadMore() {
    if (nextBefore == null) return;
    // Cursor is the smallest real id currently displayed, not the stale stored `nextBefore` —
    // live prepends can advance past what the backfill/previous page saw. `nextBefore` itself
    // stays purely the has-more signal (null = server said no more).
    const bottom = [...records ?? []].reverse().find((r) => r.id !== 0)?.id ?? nextBefore;
    const query = new URLSearchParams(filterQuery);
    query.set("before", String(bottom));
    const d = (await (await fetch(`/api/logs?${query}`)).json()) as { records: LogRecord[]; nextBefore: number | null };
    setRecords((rs) => [...(rs ?? []), ...d.records]);
    setNextBefore(d.nextBefore);
  }

  const setApp = (value?: string) =>
    void navigate({ search: { ...(value ? { app: value } : {}), ...(source ? { source } : {}) } });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Logs</h1>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={app ?? ""}
          onChange={(e) => setApp(e.target.value || undefined)}
        >
          <option value="">All sources</option>
          <option value="_platform">platform</option>
          {apps.map((a) => (
            <option key={a.appId} value={a.appId}>{a.appId}</option>
          ))}
        </select>
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={level}
          onChange={(e) => setLevel(e.target.value as Level)}
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>{l}+</option>
          ))}
        </select>
        {source && (
          <Badge variant="secondary" className="gap-1">
            source: {source}
            <button aria-label="clear source filter"
              onClick={() => void navigate({ search: app ? { app } : {} })}>×</button>
          </Badge>
        )}
        <input
          className="h-8 flex-1 rounded-md border bg-background px-2 text-sm"
          placeholder="Search messages…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {records === null ? (
        <Skeleton className="h-32" />
      ) : records.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No log records</CardTitle>
          </CardHeader>
        </Card>
      ) : (
        <div>
          {records.map((r) => (
            <Row key={r.id === 0 ? `${r.ts}-${r.message}` : r.id} r={r} />
          ))}
          {nextBefore != null && records.length < MAX_ROWS && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void loadMore()}>
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
