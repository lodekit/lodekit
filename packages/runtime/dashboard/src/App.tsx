import { useEffect, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { createClient, type KvEntry } from "@lodekit/sdk";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@lodekit/ui";

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

function StateBadge({ state }: { state: BuildStatus | undefined }) {
  if (!state) return null;
  if (state.status === "building") return <Badge variant="outline">building…</Badge>;
  if (state.status === "ready") return <Badge variant="secondary">ready</Badge>;
  return <Badge variant="destructive">error: {state.message ?? ""}</Badge>;
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

export default function App() {
  const [apps, setApps] = useState<AppInfo[] | null>(null);
  const [states, setStates] = useState<Record<string, BuildStatus>>({});
  const queryClient = useQueryClient();
  const [openPanels, setOpenPanels] = useState<Record<string, boolean>>({});

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
    es.addEventListener("kv-store-change", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { appId: string };
      void queryClient.invalidateQueries({ queryKey: ["kv", d.appId] });
    });
    return () => es.close();
  }, [queryClient]);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Lodekit</h1>
        <span className="text-muted-foreground">
          {apps ? `${apps.length} ${apps.length === 1 ? "app" : "apps"}` : ""}
        </span>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpenPanels((p) => ({ ...p, [a.appId]: !p[a.appId] }))}
                  >
                    {openPanels[a.appId] ? "Hide data" : "Data"}
                  </Button>
                </div>
                {openPanels[a.appId] && <StorePanel appId={a.appId} />}
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
