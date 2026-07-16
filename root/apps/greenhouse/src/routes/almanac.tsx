import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { desc } from "drizzle-orm";
import { events, tasks, type TaskInfo, type TaskRun, type TaskRunState } from "@lodekit/sdk";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle,
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent,
  DataTable, DataTableColumnHeader, DataTablePagination, useDataTable,
  type ChartConfig, type ColumnDef,
} from "@lodekit/ui";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { db, weatherLog, type WeatherDay } from "../db";

export const getAlmanac = createServerFn().handler(async () => ({
  defs: await tasks.list(),
  runs: await tasks.runs({ limit: 50 }),
}));

export const getSkyJournal = createServerFn().handler(async () =>
  db.select().from(weatherLog).orderBy(desc(weatherLog.day)).limit(7)
);

export const fetchWeatherNow = createServerFn().handler(async () => {
  await tasks.enqueue("weather-log");
});

export const Route = createFileRoute("/almanac")({
  loader: async () => ({ almanac: await getAlmanac(), sky: await getSkyJournal() }),
  component: Almanac,
});

const STATES: TaskRunState[] = ["queued", "running", "succeeded", "failed", "canceled"];
const fmt = (ms: number | null) => (ms == null ? "—" : new Date(ms).toLocaleString());

const runColumns: ColumnDef<TaskRun>[] = [
  {
    accessorKey: "state",
    header: ({ column }) => <DataTableColumnHeader column={column} title="State" />,
    cell: ({ row }) => (
      <Badge
        variant={
          row.original.state === "failed" ? "destructive"
          : row.original.state === "succeeded" ? "secondary"
          : "outline"
        }
      >
        {row.original.state}
      </Badge>
    ),
  },
  {
    accessorKey: "task",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Task" />,
    cell: ({ row }) => <span className="font-medium">{row.original.task}</span>,
  },
  { accessorKey: "source", header: "Source" },
  { accessorKey: "attempt", header: "Attempt" },
  {
    id: "when",
    accessorFn: (r) => r.finishedAt ?? r.startedAt ?? r.createdAt,
    header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{fmt(getValue<number>())}</span>
    ),
  },
  {
    accessorKey: "durationMs",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Duration" />,
    cell: ({ getValue }) => {
      const ms = getValue<number | null>();
      return <span className="text-muted-foreground">{ms == null ? "—" : `${ms}ms`}</span>;
    },
  },
  {
    accessorKey: "error",
    header: "Error",
    cell: ({ getValue }) => {
      const error = getValue<string | null>();
      return error ? <span className="text-destructive">{error}</span> : null;
    },
  },
];

function Almanac() {
  const router = useRouter();
  const { almanac, sky } = Route.useLoaderData();
  const [runs, setRuns] = useState<TaskRun[]>(almanac.runs);
  const [upcoming, setUpcoming] = useState<TaskRun[]>(
    almanac.runs.filter((r) => r.state === "queued").sort((a, b) => a.notBefore - b.notBefore)
  );
  const [defs, setDefs] = useState<TaskInfo[]>(almanac.defs);
  const [state, setState] = useState<TaskRunState | "all">("all");
  const [task, setTask] = useState<string | "all">("all");
  const [live, setLive] = useState(false);

  const runsTable = useDataTable({
    columns: runColumns,
    data: runs,
    initialState: { pagination: { pageSize: 10 } },
  });

  const refetch = useCallback(async () => {
    const [filteredRuns, queuedRuns, taskDefs] = await Promise.all([
      tasks.runs({
        limit: 50,
        ...(state !== "all" ? { state } : {}),
        ...(task !== "all" ? { task } : {}),
      }),
      tasks.runs({ state: "queued", limit: 50 }),
      tasks.list(),
    ]);
    setRuns(filteredRuns);
    setUpcoming(queuedRuns.sort((a, b) => a.notBefore - b.notBefore));
    setDefs(taskDefs);
  }, [state, task]);

  useEffect(() => void refetch(), [refetch]);
  useEffect(
    () =>
      events.watch({ component: "tasks" }, (ev) => {
        setLive(ev.type === "run-started");
        void refetch();
      }),
    [refetch]
  );

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">
        Almanac {live && <Badge>🌀 rounds in progress…</Badge>}
      </h1>

      <SkyJournal rows={sky} onFetch={() => void fetchWeatherNow().then(() => router.invalidate())} />

      <Card>
        <CardHeader>
          <CardTitle>Upcoming care</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 && <p className="text-sm text-muted-foreground">Nothing queued — the conservatory rests.</p>}
          {upcoming.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-sm">
              <Badge variant="outline">{r.task}</Badge>
              <span>{fmt(r.notBefore)}</span>
              <span className="text-muted-foreground">{JSON.stringify(r.payload)}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await tasks.cancel(r.id).catch(() => false);
                  void refetch();
                }}
              >
                Cancel
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Care history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant={state === "all" ? "default" : "outline"} onClick={() => setState("all")}>
              all
            </Button>
            {STATES.map((s) => (
              <Button key={s} size="sm" variant={state === s ? "default" : "outline"} onClick={() => setState(s)}>
                {s}
              </Button>
            ))}
            <span className="mx-2" />
            <Button size="sm" variant={task === "all" ? "default" : "outline"} onClick={() => setTask("all")}>
              every task
            </Button>
            {defs.map((d) => (
              <Button key={d.name} size="sm" variant={task === d.name ? "default" : "outline"} onClick={() => setTask(d.name)}>
                {d.name}
              </Button>
            ))}
          </div>
          <DataTable table={runsTable} />
          <DataTablePagination table={runsTable} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>The rota</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {defs.map((d) => (
              <li key={d.name} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{d.name}</span>
                <span className="text-muted-foreground">
                  {d.schedule ? `${d.schedule.kind}: ${d.schedule.expr}` : "on demand"} · next {fmt(d.nextRun)}
                  {d.lastRun && ` · last ${d.lastRun.state}`}
                </span>
                {d.error && <span className="text-destructive">{d.error}</span>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}

const skyConfig = {
  high: { label: "High °C", color: "var(--chart-1)" },
  low: { label: "Low °C", color: "var(--chart-2)" },
} satisfies ChartConfig;

const weekday = (day: string) =>
  new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(`${day}T12:00:00`));

function SkyJournal({ rows, onFetch }: { rows: WeatherDay[]; onFetch: () => void }) {
  const latest = rows[0];
  const series = [...rows].reverse(); // chart reads left→right, oldest→newest
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Sky Journal
          <Button size="sm" variant="outline" onClick={onFetch}>Fetch now</Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No weather yet — link an OpenWeatherMap key on the Gateways page and the
            morning task starts logging highs, lows, rain, humidity, and wind.
          </p>
        ) : (
          <>
            <p className="text-sm">
              <span className="font-medium">{latest.day}</span>{" — "}
              {latest.low.toFixed(0)}–{latest.high.toFixed(0)} °C, {latest.humidity}% humidity,
              wind {latest.wind.toFixed(1)} m/s{latest.rained ? ", rain" : ""}
            </p>
            <ChartContainer config={skyConfig} className="mt-3 aspect-[3/1] w-full">
              <LineChart data={series} margin={{ left: 0, right: 8, top: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={weekday} />
                <YAxis width={28} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line dataKey="high" type="monotone" stroke="var(--color-high)" strokeWidth={2} dot={false} />
                <Line dataKey="low" type="monotone" stroke="var(--color-low)" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
}
