import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { events, tasks, type TaskInfo, type TaskRun, type TaskRunState } from "@lodekit/sdk";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@lodekit/ui";

export const getAlmanac = createServerFn().handler(async () => ({
  defs: await tasks.list(),
  runs: await tasks.runs({ limit: 50 }),
}));

export const Route = createFileRoute("/almanac")({
  loader: () => getAlmanac(),
  component: Almanac,
});

const STATES: TaskRunState[] = ["queued", "running", "succeeded", "failed", "canceled"];
const fmt = (ms: number | null) => (ms == null ? "—" : new Date(ms).toLocaleString());

function Almanac() {
  const initial = Route.useLoaderData();
  const [runs, setRuns] = useState<TaskRun[]>(initial.runs);
  const [upcoming, setUpcoming] = useState<TaskRun[]>(
    initial.runs.filter((r) => r.state === "queued").sort((a, b) => a.notBefore - b.notBefore)
  );
  const [defs, setDefs] = useState<TaskInfo[]>(initial.defs);
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
