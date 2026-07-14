import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, Button, Input, Skeleton } from "@lodekit/ui";
import { RefreshCw } from "lucide-react";
import { fetchAppEvents, type EventRecord } from "../../../lib/data-api";
import { formatTs } from "../../../lib/format";

export const Route = createFileRoute("/data/$appId/events")({
  component: EventsView,
});

function EventRow({ r }: { r: EventRecord }) {
  const [open, setOpen] = useState(false);
  const hasPayload = r.payload && Object.keys(r.payload).length > 0;
  return (
    <div className="border-b py-1.5 text-sm last:border-b-0">
      <button className="flex w-full items-baseline gap-2 text-left" onClick={() => hasPayload && setOpen((o) => !o)}>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{formatTs(r.ts)}</span>
        <Badge variant="secondary">{r.type}</Badge>
        <span className="text-muted-foreground truncate text-xs">{hasPayload ? JSON.stringify(r.payload) : ""}</span>
      </button>
      {open && hasPayload && (
        <pre className="bg-muted mt-1 overflow-auto rounded p-2 text-xs">{JSON.stringify(r.payload, null, 2)}</pre>
      )}
    </div>
  );
}

function EventsView() {
  const { appId } = Route.useParams();
  const [type, setType] = useState("");
  const [debounced, setDebounced] = useState("");
  const [records, setRecords] = useState<EventRecord[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(type), 250);
    return () => clearTimeout(t);
  }, [type]);
  useEffect(() => { setType(""); setDebounced(""); }, [appId]);

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const before = reset ? undefined : (next ?? undefined);
      const d = await fetchAppEvents(appId, { type: debounced || undefined, before });
      setRecords((rs) => (reset ? d.records : [...(rs ?? []), ...d.records]));
      setNext(d.next);
    } catch (e) {
      setError((e as Error).message);
      if (reset) setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setRecords(null);
    setNext(null);
    void load(true);
  }, [appId, debounced]);

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg font-semibold">Events</h1>
      <div className="flex items-center gap-2">
        <Input placeholder="Type (exact)…" value={type} onChange={(e) => setType(e.target.value)} className="h-8 w-56" />
        <Button variant="outline" size="sm" className="ml-auto h-8" onClick={() => void load(true)} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>
      {error && <p className="text-destructive text-sm">Failed to load events: {error}</p>}
      {records === null ? (
        <Skeleton className="h-64" />
      ) : records.length === 0 ? (
        <p className="text-muted-foreground text-sm">No events from this app yet.</p>
      ) : (
        <div className="rounded-md border px-3">
          {records.map((r) => <EventRow key={r.id} r={r} />)}
          {next != null && (
            <Button variant="outline" size="sm" className="my-3" onClick={() => void load(false)} disabled={loading}>
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
