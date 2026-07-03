import { useEffect, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
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
  slug: string;
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

interface KvEntry { key: string; value: unknown; createdAt: number; updatedAt: number; expiresAt: number | null }
interface KvPage { entries: KvEntry[]; nextCursor: string | null }

function StorePanel({ slug }: { slug: string }) {
  const q = useInfiniteQuery({
    queryKey: ["kv", slug],
    queryFn: async ({ pageParam }): Promise<KvPage> =>
      (await fetch(
        `/api/apps/${slug}/kv-store?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`
      )).json(),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const entries = q.data?.pages.flatMap((p) => p.entries) ?? [];
  return (
    <div className="mt-2 space-y-1 border-t pt-2 text-sm">
      {q.isLoading ? (
        <Skeleton className="h-4" />
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground">No data yet.</p>
      ) : (
        entries.map((e) => (
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
        const d = JSON.parse((e as MessageEvent).data) as { slug: string; message?: string };
        setStates((s) => ({ ...s, [d.slug]: { status: ev, message: d.message } }));
      });
    }
    es.addEventListener("kv-store-change", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { slug: string };
      void queryClient.invalidateQueries({ queryKey: ["kv", d.slug] });
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
            <Card key={a.slug} className="h-full transition-colors hover:bg-accent/50">
              <CardHeader>
                <div className="text-3xl">{a.icon || "📦"}</div>
                <CardTitle>
                  <a href={`/${a.slug}/`} className="hover:underline">{a.name}</a>
                </CardTitle>
                <CardDescription>{a.description || ""}</CardDescription>
                <div className="flex items-center gap-2">
                  <StateBadge state={states[a.slug]} />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpenPanels((p) => ({ ...p, [a.slug]: !p[a.slug] }))}
                  >
                    {openPanels[a.slug] ? "Hide data" : "Data"}
                  </Button>
                </div>
                {openPanels[a.slug] && <StorePanel slug={a.slug} />}
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
