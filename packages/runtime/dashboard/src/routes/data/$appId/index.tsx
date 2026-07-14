import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Badge, Card, CardContent, CardHeader, CardTitle,
  ChartContainer, ChartTooltip, ChartTooltipContent, Skeleton,
  type ChartConfig,
} from "@lodekit/ui";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { fetchSummary, type DataSummary } from "../../../lib/data-api";
import { formatBytes, formatCount, relativeTime } from "../../../lib/format";

export const Route = createFileRoute("/data/$appId/")({
  component: Overview,
});

const objectsConfig = { count: { label: "Objects", color: "var(--chart-1)" } } satisfies ChartConfig;
const sizeConfig = { size: { label: "Size", color: "var(--chart-2)" } } satisfies ChartConfig;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-1"><CardTitle className="text-muted-foreground text-xs font-medium">{label}</CardTitle></CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </CardContent>
    </Card>
  );
}

const STORE_VIEW: Record<DataSummary["recent"][number]["store"], { label: string; to: string }> = {
  table: { label: "table", to: "/data/$appId/tables/$table" },
  kv: { label: "kv", to: "/data/$appId/kv" },
  file: { label: "file", to: "/data/$appId/files" },
  event: { label: "event", to: "/data/$appId/events" },
};

function Overview() {
  const { appId } = Route.useParams();
  const q = useQuery({ queryKey: ["data", appId, "summary"], queryFn: () => fetchSummary(appId) });

  if (q.isError) return <p className="text-destructive text-sm">Failed to load summary: {(q.error as Error).message}</p>;
  if (!q.data) return <Skeleton className="h-64" />;
  const s = q.data;
  const totalRows = s.tables.reduce((n, t) => n + t.rows, 0);
  const objects = [
    { store: "Tables", count: totalRows },
    { store: "Key-value", count: s.kv.count },
    { store: "Files", count: s.files.count },
    { store: "Events", count: s.events.count },
  ];
  const sized = s.tables.filter((t) => t.sizeBytes != null);
  const sizes = sized.map((t) => ({ table: t.name, size: t.sizeBytes! })).sort((a, b) => b.size - a.size).slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Table rows" value={formatCount(totalRows)} hint={`${s.tables.length} table${s.tables.length === 1 ? "" : "s"}`} />
        <Stat label="Key-value entries" value={formatCount(s.kv.count)} />
        <Stat label="Files" value={formatCount(s.files.count)} hint={formatBytes(s.files.totalBytes)} />
        <Stat label="Events" value={formatCount(s.events.count)} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Objects per store</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={objectsConfig} className="aspect-[2/1] w-full">
              <BarChart data={objects} layout="vertical" margin={{ left: 8, right: 8 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="store" width={80} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Estimated size per table
              <span className="text-muted-foreground ml-2 font-normal">db file {formatBytes(s.dbFileBytes)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sizes.length > 0 ? (
              <ChartContainer config={sizeConfig} className="aspect-[2/1] w-full">
                <BarChart data={sizes} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="table" width={100} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatBytes(Number(v))} />} />
                  <Bar dataKey="size" fill="var(--color-size)" radius={4} />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-muted-foreground text-sm">
                {s.tables.length === 0 ? "No tables yet." : "Per-table sizes unavailable in this build."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {s.tables.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium">Tables</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {s.tables.map((t) => (
              <Link key={t.name} to="/data/$appId/tables/$table" params={{ appId, table: t.name }}>
                <Card className="hover:bg-accent/50 transition-colors">
                  <CardContent className="pt-4">
                    <p className="truncate font-mono text-sm">{t.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatCount(t.rows)} rows{t.sizeBytes != null ? ` · ${formatBytes(t.sizeBytes)}` : ""}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-medium">Recent activity</h2>
        {s.recent.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing stored yet.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {s.recent.map((r, i) => (
              <Link
                key={i}
                to={STORE_VIEW[r.store].to}
                params={r.store === "table" ? { appId, table: r.label } : { appId }}
                className="hover:bg-accent/50 flex items-center gap-3 px-3 py-2 text-sm"
              >
                <Badge variant="secondary" className="w-14 justify-center">{STORE_VIEW[r.store].label}</Badge>
                <span className="min-w-0 truncate font-mono text-xs">{r.label}</span>
                {r.detail && <span className="text-muted-foreground text-xs">{r.detail}</span>}
                <span className="text-muted-foreground ml-auto shrink-0 text-xs">{relativeTime(r.at)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
