import { useEffect, useState } from "react";
import {
  Badge,
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

export default function App() {
  const [apps, setApps] = useState<AppInfo[] | null>(null);
  const [states, setStates] = useState<Record<string, BuildStatus>>({});

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
    return () => es.close();
  }, []);

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
            <a key={a.slug} href={`/${a.slug}/`} className="block">
              <Card className="h-full transition-colors hover:bg-accent/50">
                <CardHeader>
                  <div className="text-3xl">{a.icon || "📦"}</div>
                  <CardTitle>{a.name}</CardTitle>
                  <CardDescription>{a.description || ""}</CardDescription>
                  <StateBadge state={states[a.slug]} />
                </CardHeader>
              </Card>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
