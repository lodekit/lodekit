import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { desc } from "drizzle-orm";
import { events, tasks, type TaskInfo, type TaskRun, type TaskRunState } from "@lodekit/sdk";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@lodekit/ui";
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
      events.watch({ type: "tasks-change" }, (ev) => {
        setLive(ev.payload?.state === "running");
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
          <ul className="space-y-1 text-sm">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={r.state === "failed" ? "destructive" : r.state === "succeeded" ? "secondary" : "outline"}
                >
                  {r.state}
                </Badge>
                <span className="font-medium">{r.task}</span>
                <span className="text-muted-foreground">
                  {r.source} · attempt {r.attempt} · {fmt(r.finishedAt ?? r.startedAt ?? r.createdAt)}
                  {r.durationMs != null && ` · ${r.durationMs}ms`}
                </span>
                {r.error && <span className="text-destructive">{r.error}</span>}
              </li>
            ))}
          </ul>
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

function SkyJournal({ rows, onFetch }: { rows: WeatherDay[]; onFetch: () => void }) {
  const latest = rows[0];
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
            <div className="mt-2 space-y-1">
              {rows.slice(1).map((r) => (
                <p key={r.day} className="text-xs text-muted-foreground">
                  {r.day}: {r.low.toFixed(0)}–{r.high.toFixed(0)} °C{r.rained ? " · rain" : ""}
                </p>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
