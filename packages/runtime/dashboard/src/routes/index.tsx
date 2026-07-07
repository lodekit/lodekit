import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient, type KvEntry, type TaskInfo, type TaskRun } from "@lodekit/sdk";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@lodekit/ui";

export const Route = createFileRoute("/")({
  component: DashboardHome,
});

interface AppInfo {
  appId: string;
  name: string;
  icon?: string;
  description?: string;
}

type BuildStatus =
  | { status: "building" }
  | { status: "ready" }
  | { status: "error"; message?: string };

type ServerStatus =
  | { status: "starting" }
  | { status: "running" }
  | { status: "error"; message?: string };

function StateBadge({ state }: { state: BuildStatus | undefined }) {
  if (!state) return null;
  if (state.status === "building") return <Badge variant="outline">building…</Badge>;
  if (state.status === "ready") return <Badge variant="secondary">ready</Badge>;
  return <Badge variant="destructive">error: {state.message ?? ""}</Badge>;
}

function ServerStateBadge({ state }: { state: ServerStatus | undefined }) {
  if (!state || state.status !== "error") return null;
  return (
    <Badge variant="destructive" title={state.message}>
      server error
    </Badge>
  );
}

function StorePanel({ appId }: { appId: string }) {
  const kv = createClient({ baseUrl: "", appId }).kv;
  const q = useInfiniteQuery({
    queryKey: ["kv", appId],
    queryFn: ({ pageParam }) => kv.list({ limit: 100, cursor: pageParam || undefined }),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const entries = q.data?.pages.flatMap((p) => p.entries) ?? [];
  return (
    <div className="mt-2 space-y-1 border-t pt-2 text-sm">
      {q.isLoading ? (
        <Skeleton className="h-4" />
      ) : q.isError ? (
        <p className="text-muted-foreground">Failed to load data.</p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground">No data yet.</p>
      ) : (
        entries.map((e: KvEntry) => (
          <div key={e.key} className="flex gap-2">
            <code className="shrink-0 text-muted-foreground">{e.key}</code>
            <code className="truncate">{JSON.stringify(e.value)}</code>
          </div>
        ))
      )}
      {q.hasNextPage && (
        <Button variant="outline" size="sm" onClick={() => void q.fetchNextPage()}>
          Load more
        </Button>
      )}
    </div>
  );
}

function StateBadgeForRun({ state }: { state: TaskRun["state"] }) {
  if (state === "failed") return <Badge variant="destructive">failed</Badge>;
  if (state === "succeeded") return <Badge variant="secondary">succeeded</Badge>;
  return <Badge variant="outline">{state}</Badge>;
}

function TasksPanel({ appId }: { appId: string }) {
  const tasks = createClient({ baseUrl: "", appId }).tasks;
  const queryClient = useQueryClient();
  const defs = useQuery({ queryKey: ["tasks", appId], queryFn: () => tasks.list() });
  const runs = useQuery({ queryKey: ["task-runs", appId], queryFn: () => tasks.runs({ limit: 15 }) });

  // Run now / Re-run — source "manual" (spec §8); invalidation arrives over SSE.
  async function runNow(name: string, payload?: unknown) {
    await fetch(`/api/apps/${appId}/tasks/${name}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload === undefined ? { source: "manual" } : { source: "manual", payload }),
    });
    void queryClient.invalidateQueries({ queryKey: ["task-runs", appId] });
  }

  if (defs.isLoading) return <Skeleton className="mt-2 h-4" />;
  if (defs.isError) return <p className="mt-2 text-sm text-muted-foreground">Failed to load tasks.</p>;
  const list = defs.data ?? [];
  return (
    <div className="mt-2 space-y-2 border-t pt-2 text-sm">
      {list.length === 0 ? (
        <p className="text-muted-foreground">No tasks declared.</p>
      ) : (
        list.filter((t: TaskInfo) => !t.retired).map((t: TaskInfo) => (
          <div key={t.name} className="flex items-center gap-2">
            <code className="shrink-0">{t.name}</code>
            {t.schedule && <Badge variant="outline">{t.schedule.expr}</Badge>}
            {t.error ? (
              <Badge variant="destructive" title={t.error}>config error</Badge>
            ) : t.nextRun ? (
              <span className="truncate text-muted-foreground">next {new Date(t.nextRun).toLocaleString()}</span>
            ) : null}
            {t.lastRun && <StateBadgeForRun state={t.lastRun.state} />}
            {!t.error && (
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void runNow(t.name)}>
                Run now
              </Button>
            )}
          </div>
        ))
      )}
      {(runs.data ?? []).length > 0 && (
        <div className="space-y-1 border-t pt-2">
          {(runs.data ?? []).map((r: TaskRun) => (
            <div key={r.id} className="flex items-center gap-2">
              <code className="shrink-0 text-muted-foreground">#{r.id}</code>
              <code className="shrink-0">{r.task}</code>
              <StateBadgeForRun state={r.state} />
              {r.error && <span className="truncate text-muted-foreground" title={r.error}>{r.error}</span>}
              {r.state === "failed" && (
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void runNow(r.task, r.payload ?? undefined)}>
                  Re-run
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DashboardHome() {
  const [apps, setApps] = useState<AppInfo[] | null>(null);
  const [states, setStates] = useState<Record<string, BuildStatus>>({});
  const [serverStates, setServerStates] = useState<Record<string, ServerStatus>>({});
  const queryClient = useQueryClient();
  const [openPanels, setOpenPanels] = useState<Record<string, boolean>>({});
  const [openTasks, setOpenTasks] = useState<Record<string, boolean>>({});

  async function load() {
    setApps(await (await fetch("/api/apps")).json());
  }

  useEffect(() => {
    void load();
    const es = new EventSource("/api/events");
    es.addEventListener("apps-changed", () => void load());
    for (const ev of ["building", "ready", "error"] as const) {
      es.addEventListener(ev, (e) => {
        const d = JSON.parse((e as MessageEvent).data) as { appId: string; message?: string };
        setStates((s) => ({ ...s, [d.appId]: { status: ev, message: d.message } }));
      });
    }
    es.addEventListener("server-state", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as {
        appId: string;
        status: ServerStatus["status"];
        message?: string;
      };
      setServerStates((s) => ({ ...s, [d.appId]: { status: d.status, message: d.message } }));
    });
    es.addEventListener("kv-store-change", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { appId: string };
      void queryClient.invalidateQueries({ queryKey: ["kv", d.appId] });
    });
    es.addEventListener("tasks-change", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { appId: string };
      void queryClient.invalidateQueries({ queryKey: ["tasks", d.appId] });
      void queryClient.invalidateQueries({ queryKey: ["task-runs", d.appId] });
    });
    return () => es.close();
  }, [queryClient]);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Lodekit</h1>
        <div className="flex items-center gap-4">
          <a href="/_ui/" className="text-sm text-muted-foreground hover:underline">
            Components
          </a>
          <span className="text-muted-foreground">
            {apps ? `${apps.length} ${apps.length === 1 ? "app" : "apps"}` : ""}
          </span>
          <Link to="/logs" className="text-sm text-muted-foreground hover:underline">Logs</Link>
        </div>
      </div>
      {apps === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : apps.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No apps yet</CardTitle>
            <CardDescription>Ask your agent to build an app with Lodekit.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((a) => (
            <Card key={a.appId} className="h-full transition-colors hover:bg-accent/50">
              <CardHeader>
                <div className="text-3xl">{a.icon || "📦"}</div>
                <CardTitle>
                  <a href={`/${a.appId}/`} className="hover:underline">{a.name}</a>
                </CardTitle>
                <CardDescription>{a.description || ""}</CardDescription>
                <div className="flex items-center gap-2">
                  <StateBadge state={states[a.appId]} />
                  <ServerStateBadge state={serverStates[a.appId]} />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpenPanels((p) => ({ ...p, [a.appId]: !p[a.appId] }))}
                  >
                    {openPanels[a.appId] ? "Hide data" : "Data"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpenTasks((p) => ({ ...p, [a.appId]: !p[a.appId] }))}
                  >
                    {openTasks[a.appId] ? "Hide tasks" : "Tasks"}
                  </Button>
                  <Link to="/logs" search={{ app: a.appId }} className="text-sm text-muted-foreground hover:underline">Logs</Link>
                </div>
                {openPanels[a.appId] && <StorePanel appId={a.appId} />}
                {openTasks[a.appId] && <TasksPanel appId={a.appId} />}
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
