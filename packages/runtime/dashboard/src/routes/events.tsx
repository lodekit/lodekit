import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, CardHeader, CardTitle, Skeleton } from "@lodekit/ui";
import { useSSEEvent } from "../components/sse";
import {
  RANGE_PRESETS,
  type RangeKey,
  rangeBounds,
  matchesFilters,
  toLocalInput,
  fromLocalInput,
} from "../lib/event-filters";

interface EventRecord {
  id: number;
  ts: number;
  app: string | null;
  kind: string;
  component: string;
  type: string;
  payload: Record<string, unknown> | null;
}

const INTERNAL_APPS = [{ appId: "_dashboard", name: "Dashboard" }] as const;
const MAX_LIVE_ROWS = 500;
const MAX_ROWS = 1000;
const EVENT_KINDS = [
  ["engine", "Engine"],
  ["service", "Services"],
  ["app", "Apps"],
] as const;
const RANGE_KEYS = [...(Object.keys(RANGE_PRESETS) as (keyof typeof RANGE_PRESETS)[]), "custom"] as const;
const DEFAULT_RANGE: RangeKey = "24h";

interface EventsSearch {
  app?: string;
  kind?: (typeof EVENT_KINDS)[number][0];
  component?: string;
  type?: string;
  range?: RangeKey;
  since?: number;
  until?: number;
}

export const Route = createFileRoute("/events")({
  validateSearch: (s: Record<string, unknown>): EventsSearch => {
    const out: EventsSearch = {};
    if (typeof s.app === "string" && s.app) out.app = s.app;
    if (EVENT_KINDS.some(([k]) => k === s.kind)) out.kind = s.kind as EventsSearch["kind"];
    if (typeof s.component === "string" && s.component) out.component = s.component;
    if (typeof s.type === "string" && s.type) out.type = s.type;
    if (RANGE_KEYS.includes(s.range as RangeKey)) out.range = s.range as RangeKey;
    if (typeof s.since === "number" && s.since >= 0) out.since = s.since;
    if (typeof s.until === "number" && s.until > 0) out.until = s.until;
    return out;
  },
  component: EventsView,
});

function Row({ r, appName }: { r: EventRecord; appName: (id: string | null) => string }) {
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
        <span className="shrink-0 text-muted-foreground">{r.component}</span>
        <span className="shrink-0 text-muted-foreground">{appName(r.app)}</span>
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
  const search = Route.useSearch();
  const { app, kind, component, since, until } = search;
  const range: RangeKey = search.range ?? DEFAULT_RANGE;
  const navigate = Route.useNavigate();
  const [apps, setApps] = useState<{ appId: string; name: string }[]>([]);
  const [type, setType] = useState(search.type ?? "");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [records, setRecords] = useState<EventRecord[] | null>(null);
  const [next, setNext] = useState<number | null>(null);

  const patchSearch = (patch: Partial<EventsSearch>) =>
    void navigate({ search: (prev: EventsSearch) => ({ ...prev, ...patch }) });

  // Type is a URL filter (spec §7) — the input debounces into the search params.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((search.type ?? "") !== type) patchSearch({ type: type || undefined });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Bounds freeze until a filter changes; the live tail covers newer events.
  const bounds = useMemo(
    () => rangeBounds(range, Date.now(), { since, until }),
    [range, since, until]
  );

  const filterQuery = useMemo(() => {
    const query = new URLSearchParams({ limit: "200" });
    if (app) query.set("app", app);
    if (kind) query.set("kind", kind);
    if (component) query.set("component", component);
    if (search.type) query.set("type", search.type);
    if (bounds.since != null) query.set("since", String(bounds.since));
    if (bounds.until != null) query.set("until", String(bounds.until));
    return query;
  }, [app, kind, component, search.type, bounds]);

  // q is client-side (type + payload text) — the history endpoint has no q param.
  const filtersRef = useRef({ app, kind, component, type: search.type, until: bounds.until, q: debouncedQ });
  filtersRef.current = { app, kind, component, type: search.type, until: bounds.until, q: debouncedQ };
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

  useSSEEvent("event", (e) => {
    const r = JSON.parse(e.data) as EventRecord;
    const f = filtersRef.current;
    if (!matchesFilters(r, f) || !matchesQ(r, f.q)) return;
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

  const shown = (records ?? []).filter((r) => matchesQ(r, debouncedQ));
  const names = new Map<string, string>([
    ...INTERNAL_APPS.map((a) => [a.appId, a.name] as const),
    ...apps.map((a) => [a.appId, a.name] as const),
  ]);
  // Null app = platform-wide: no owning stream, rendered as an em dash (spec §2/§3).
  const appName = (id: string | null) => (id === null ? "—" : names.get(id) ?? id);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Events</h1>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={app ?? ""}
          onChange={(e) => patchSearch({ app: e.target.value || undefined })}
        >
          <option value="">All apps</option>
          {INTERNAL_APPS.map((a) => (
            <option key={a.appId} value={a.appId}>{a.name}</option>
          ))}
          {apps.map((a) => (
            <option key={a.appId} value={a.appId}>{a.name}</option>
          ))}
        </select>
        {EVENT_KINDS.map(([k, label]) => (
          <Button
            key={k}
            size="sm"
            variant={kind === k ? "default" : "outline"}
            onClick={() => patchSearch({ kind: kind === k ? undefined : k })}
          >
            {label}
          </Button>
        ))}
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={range}
          onChange={(e) => {
            const r = e.target.value as RangeKey;
            patchSearch(r === "custom" ? { range: r } : { range: r, since: undefined, until: undefined });
          }}
        >
          {RANGE_KEYS.map((k) => (
            <option key={k} value={k}>{k === "custom" ? "Custom…" : `Last ${k}`}</option>
          ))}
        </select>
        {range === "custom" && (
          <>
            <input
              type="datetime-local"
              className="h-8 rounded-md border bg-background px-2 text-sm"
              value={toLocalInput(since)}
              onChange={(e) => patchSearch({ since: fromLocalInput(e.target.value) })}
            />
            <input
              type="datetime-local"
              className="h-8 rounded-md border bg-background px-2 text-sm"
              value={toLocalInput(until)}
              onChange={(e) => patchSearch({ until: fromLocalInput(e.target.value) })}
            />
          </>
        )}
        <input
          className="h-8 w-40 rounded-md border bg-background px-2 text-sm"
          placeholder="Type…"
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
            <Row key={r.id === 0 ? `${r.ts}-${r.type}` : r.id} r={r} appName={appName} />
          ))}
          {next != null && shown.length < MAX_ROWS && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void loadMore()}>
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
