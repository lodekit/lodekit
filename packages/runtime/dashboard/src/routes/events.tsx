import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, CardHeader, CardTitle, Skeleton } from "@lodekit/ui";

interface EventRecord {
  id: number;
  ts: number;
  ns: string;
  source: string;
  type: string;
  payload: Record<string, unknown> | null;
}

const INTERNAL_NS = ["_platform", "_dashboard"] as const;
const MAX_LIVE_ROWS = 500;
const MAX_ROWS = 1000;

export const Route = createFileRoute("/events")({
  validateSearch: (s: Record<string, unknown>): { ns?: string } =>
    typeof s.ns === "string" && s.ns ? { ns: s.ns } : {},
  component: EventsView,
});

function Row({ r }: { r: EventRecord }) {
  const [open, setOpen] = useState(false);
  const hasPayload = r.payload && Object.keys(r.payload).length > 0;
  return (
    <div className="border-b py-1.5 text-sm">
      <button
        className="flex w-full items-baseline gap-2 text-left"
        onClick={() => hasPayload && setOpen((o) => !o)}
      >
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {new Date(r.ts).toLocaleTimeString()}
        </span>
        <Badge variant="secondary">{r.type}</Badge>
        <span className="shrink-0 text-muted-foreground">
          {r.ns}{r.source !== r.ns ? `·${r.source}` : ""}
        </span>
        <span className="truncate text-muted-foreground">
          {hasPayload ? JSON.stringify(r.payload) : ""}
        </span>
      </button>
      {open && hasPayload && (
        <pre className="mt-1 overflow-auto rounded bg-muted p-2 text-xs">
          {JSON.stringify(r.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

function EventsView() {
  const { ns } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [apps, setApps] = useState<{ appId: string; name: string }[]>([]);
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [records, setRecords] = useState<EventRecord[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [debounced, setDebounced] = useState({ type: "", q: "" });

  useEffect(() => {
    const t = setTimeout(() => setDebounced({ type, q }), 250);
    return () => clearTimeout(t);
  }, [type, q]);

  const filterQuery = useMemo(() => {
    const query = new URLSearchParams({ limit: "200" });
    if (ns) query.set("ns", ns);
    if (debounced.type) query.set("type", debounced.type);
    return query;
  }, [ns, debounced.type]);

  // q is client-side (type + payload text) — the history endpoint has no q param.
  const filtersRef = useRef({ ns, type: debounced.type, q: debounced.q });
  filtersRef.current = { ns, type: debounced.type, q: debounced.q };
  const matchesQ = (r: EventRecord, needle: string) =>
    !needle ||
    r.type.toLowerCase().includes(needle.toLowerCase()) ||
    (r.payload !== null && JSON.stringify(r.payload).toLowerCase().includes(needle.toLowerCase()));

  const pendingRef = useRef<EventRecord[]>([]);
  const hasRecordsRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    pendingRef.current = [];
    hasRecordsRef.current = false;
    setRecords(null);
    void fetch(`/api/events/history?${filterQuery}`)
      .then((r) => r.json())
      .then((d: { records: EventRecord[]; next: number | null }) => {
        if (cancelled) return;
        const pending = pendingRef.current.filter(
          (p) => p.id === 0 || !d.records.some((r) => r.id === p.id),
        );
        pendingRef.current = [];
        setRecords([...pending.slice().reverse(), ...d.records].slice(0, MAX_LIVE_ROWS));
        hasRecordsRef.current = true;
        setNext(d.next);
      })
      .catch(() => {
        if (cancelled) return;
        const pending = pendingRef.current;
        pendingRef.current = [];
        setRecords(pending.slice().reverse().slice(0, MAX_LIVE_ROWS));
        hasRecordsRef.current = true;
        setNext(null);
      });
    return () => { cancelled = true; };
  }, [filterQuery]);

  useEffect(() => {
    const es = new EventSource("/api/events");
    es.addEventListener("event", (e) => {
      const r = JSON.parse((e as MessageEvent).data) as EventRecord;
      const { ns, type, q } = filtersRef.current;
      if ((ns && r.ns !== ns) || (type && r.type !== type) || !matchesQ(r, q)) return;
      if (!hasRecordsRef.current) {
        pendingRef.current.push(r);
        return;
      }
      setRecords((rs) =>
        rs && !(r.id !== 0 && rs.some((x) => x.id === r.id))
          ? [r, ...rs].slice(0, Math.max(MAX_LIVE_ROWS, rs.length))
          : rs
      );
    });
    return () => es.close();
  }, []);

  useEffect(() => {
    void fetch("/api/apps").then((r) => r.json()).then(setApps).catch(() => {});
  }, []);

  async function loadMore() {
    if (next == null) return;
    const bottom = [...records ?? []].reverse().find((r) => r.id !== 0)?.id ?? next;
    const query = new URLSearchParams(filterQuery);
    query.set("before", String(bottom));
    try {
      const d = (await (await fetch(`/api/events/history?${query}`)).json()) as { records: EventRecord[]; next: number | null };
      setRecords((rs) => [...(rs ?? []), ...d.records]);
      setNext(d.next);
    } catch {
      // degraded state: leave records/next unchanged, button stays available for retry
    }
  }

  const shown = (records ?? []).filter((r) => matchesQ(r, debounced.q));
  const setNs = (value?: string) => void navigate({ search: value ? { ns: value } : {} });

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Events</h1>
        <Link to="/" className="text-sm text-muted-foreground hover:underline">← Apps</Link>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={ns ?? ""}
          onChange={(e) => setNs(e.target.value || undefined)}
        >
          <option value="">All namespaces</option>
          {INTERNAL_NS.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
          {apps.map((a) => (
            <option key={a.appId} value={a.appId}>{a.appId}</option>
          ))}
        </select>
        <input
          className="h-8 w-48 rounded-md border bg-background px-2 text-sm"
          placeholder="Type (exact)…"
          value={type}
          onChange={(e) => setType(e.target.value)}
        />
        <input
          className="h-8 flex-1 rounded-md border bg-background px-2 text-sm"
          placeholder="Search payloads…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {records === null ? (
        <Skeleton className="h-32" />
      ) : shown.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No events</CardTitle>
          </CardHeader>
        </Card>
      ) : (
        <div>
          {shown.map((r) => (
            <Row key={r.id === 0 ? `${r.ts}-${r.type}` : r.id} r={r} />
          ))}
          {next != null && shown.length < MAX_ROWS && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void loadMore()}>
              Load more
            </Button>
          )}
        </div>
      )}
    </main>
  );
}
