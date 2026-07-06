import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, CardHeader, CardTitle, Skeleton } from "@lodekit/ui";

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

const MAX_LIVE_ROWS = 500;

export const Route = createFileRoute("/logs")({
  validateSearch: (s: Record<string, unknown>): { app?: string } =>
    typeof s.app === "string" && s.app ? { app: s.app } : {},
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
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {new Date(r.ts).toLocaleTimeString()}
        </span>
        {levelBadge(r.level)}
        <span className="shrink-0 text-muted-foreground">{r.appId ?? "platform"}·{r.source}</span>
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
  const { app } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [apps, setApps] = useState<{ appId: string; name: string }[]>([]);
  const [level, setLevel] = useState<Level>("debug");
  const [q, setQ] = useState("");
  const [records, setRecords] = useState<LogRecord[] | null>(null);
  const [nextBefore, setNextBefore] = useState<number | null>(null);

  const filterQuery = useMemo(() => {
    const query = new URLSearchParams({ limit: "200" });
    if (app) query.set("app", app);
    if (level !== "debug") query.set("level", level);
    if (q) query.set("q", q);
    return query;
  }, [app, level, q]);

  useEffect(() => {
    let cancelled = false;
    setRecords(null);
    void fetch(`/api/logs?${filterQuery}`)
      .then((r) => r.json())
      .then((d: { records: LogRecord[]; nextBefore: number | null }) => {
        if (cancelled) return;
        setRecords(d.records);
        setNextBefore(d.nextBefore);
      });
    return () => { cancelled = true; };
  }, [filterQuery]);

  // Live tail: prepend matching records from the shared SSE stream.
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.addEventListener("log", (e) => {
      const r = JSON.parse((e as MessageEvent).data) as LogRecord;
      const matches =
        (!app || (app === "platform" ? r.appId === null : r.appId === app)) &&
        LEVEL_RANK[r.level] >= LEVEL_RANK[level] &&
        (!q || r.message.toLowerCase().includes(q.toLowerCase()));
      if (matches) setRecords((rs) => (rs ? [r, ...rs].slice(0, MAX_LIVE_ROWS) : rs));
    });
    return () => es.close();
  }, [app, level, q]);

  useEffect(() => {
    void fetch("/api/apps").then((r) => r.json()).then(setApps);
  }, []);

  async function loadMore() {
    if (nextBefore == null) return;
    const query = new URLSearchParams(filterQuery);
    query.set("before", String(nextBefore));
    const d = (await (await fetch(`/api/logs?${query}`)).json()) as { records: LogRecord[]; nextBefore: number | null };
    setRecords((rs) => [...(rs ?? []), ...d.records]);
    setNextBefore(d.nextBefore);
  }

  const setApp = (value?: string) => void navigate({ search: value ? { app: value } : {} });

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Logs</h1>
        <Link to="/" className="text-sm text-muted-foreground hover:underline">← Apps</Link>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={app ?? ""}
          onChange={(e) => setApp(e.target.value || undefined)}
        >
          <option value="">All sources</option>
          <option value="platform">platform</option>
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
          {nextBefore != null && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void loadMore()}>
              Load more
            </Button>
          )}
        </div>
      )}
    </main>
  );
}
