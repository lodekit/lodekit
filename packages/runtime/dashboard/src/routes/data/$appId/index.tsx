import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Button, Card, CardAction, CardContent, CardHeader, CardTitle,
  ChartContainer, ChartTooltip, ChartTooltipContent, Skeleton,
  type ChartConfig,
} from "@lodekit/ui";
import { ArrowUpRight, Database, Folder, KeyRound, Zap, type LucideIcon } from "lucide-react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { fetchSummary, type DataSummary } from "../../../lib/data-api";
import { formatBytes, formatCount, relativeTime } from "../../../lib/format";

export const Route = createFileRoute("/data/$appId/")({
  component: Overview,
});

const objectsConfig = { count: { label: "Objects", color: "var(--chart-1)" } } satisfies ChartConfig;
const sizeConfig = { size: { label: "Size", color: "var(--chart-2)" } } satisfies ChartConfig;

// Service identity per store — same icons the explorer sidebar uses.
const STORES: Record<DataSummary["recent"][number]["store"], { label: string; icon: LucideIcon; to: string }> = {
  table: { label: "Tables", icon: Database, to: "/data/$appId/tables/$table" },
  kv: { label: "Key-value", icon: KeyRound, to: "/data/$appId/kv" },
  file: { label: "Files", icon: Folder, to: "/data/$appId/files" },
  event: { label: "Events", icon: Zap, to: "/data/$appId/events" },
};

function Stat({ icon: Icon, label, value, hint, to, params }: {
  icon: LucideIcon; label: string; value: string; hint?: string;
  to?: string; params?: Record<string, string>;
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </CardTitle>
        {to && (
          <CardAction>
            <Link to={to} params={params} className="text-muted-foreground hover:text-foreground">
              <ArrowUpRight className="size-4" aria-hidden="true" />
              <span className="sr-only">Open {label}</span>
            </Link>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Overview() {
  const { appId } = Route.useParams();
  const q = useQuery({ queryKey: ["data", appId, "summary"], queryFn: () => fetchSummary(appId) });

  if (q.isError)
    return (
      <div className="text-sm">
        <p className="text-destructive">Failed to load summary: {(q.error as Error).message}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void q.refetch()}>Retry</Button>
      </div>
    );
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
        <Stat
          icon={STORES.table.icon}
          label="Tables"
          value={formatCount(totalRows)}
          hint={`rows · ${s.tables.length} table${s.tables.length === 1 ? "" : "s"}`}
          to={s.tables.length > 0 ? STORES.table.to : undefined}
          params={s.tables.length > 0 ? { appId, table: s.tables[0].name } : undefined}
        />
        <Stat icon={STORES.kv.icon} label="Key-value" value={formatCount(s.kv.count)} hint="entries" to={STORES.kv.to} params={{ appId }} />
        <Stat icon={STORES.file.icon} label="Files" value={formatCount(s.files.count)} hint={formatBytes(s.files.totalBytes)} to={STORES.file.to} params={{ appId }} />
        <Stat icon={STORES.event.icon} label="Events" value={formatCount(s.events.count)} hint="events" to={STORES.event.to} params={{ appId }} />
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
          <CardHeader><CardTitle className="text-sm">Recent activity</CardTitle></CardHeader>
          <CardContent>
            {s.recent.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing stored yet.</p>
            ) : (
              <div className="divide-y">
                {s.recent.map((r, i) => {
                  const Icon = STORES[r.store].icon;
                  return (
                    <Link
                      key={i}
                      to={STORES[r.store].to}
                      params={r.store === "table" ? { appId, table: r.label } : { appId }}
                      className="hover:bg-accent/50 flex items-center gap-3 px-1 py-2 text-sm"
                    >
                      <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                      <span className="sr-only">{STORES[r.store].label}</span>
                      <span className="min-w-0 truncate font-mono text-xs">{r.label}</span>
                      {r.detail && <span className="text-muted-foreground text-xs">{r.detail}</span>}
                      <span className="text-muted-foreground ml-auto shrink-0 text-xs">{relativeTime(r.at)}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
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
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(v) => (
                          <>
                            <div className="size-2.5 shrink-0 rounded-[2px]" style={{ background: "var(--color-size)" }} />
                            <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                              <span className="text-muted-foreground">Size</span>
                              <span className="text-foreground font-mono font-medium tabular-nums">{formatBytes(Number(v))}</span>
                            </div>
                          </>
                        )}
                      />
                    }
                  />
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
        <Card>
          <CardHeader><CardTitle className="text-sm">Tables</CardTitle></CardHeader>
          <CardContent>
            {s.tables.length === 0 ? (
              <p className="text-muted-foreground text-sm">No tables yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {s.tables.map((t) => (
                  <Link
                    key={t.name}
                    to="/data/$appId/tables/$table"
                    params={{ appId, table: t.name }}
                    className="hover:bg-accent/50 rounded-md border px-3 py-2 transition-colors"
                  >
                    <p className="truncate font-mono text-sm">{t.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatCount(t.rows)} rows{t.sizeBytes != null ? ` · ${formatBytes(t.sizeBytes)}` : ""}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
