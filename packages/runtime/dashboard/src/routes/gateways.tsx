import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppWindow, ExternalLink } from "lucide-react";
import { Badge, Card, CardDescription, CardHeader, CardTitle, Skeleton } from "@lodekit/ui";
import { useSSEEvent } from "../components/sse";

export const Route = createFileRoute("/gateways")({ component: GatewaysView });

// Belt over the manifest schema's http(s)-only rule: never render an anchor
// whose href doesn't parse as http(s) — a hostile manifest must not become a
// javascript: link.
function safeHttpUrl(s: string): string | null {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

// Shapes mirror services/gateways.ts platform payloads exactly.
interface GatewaySummary {
  providerId: string;
  name: string;
  website: string | null;
  authKind: string | null;
  error: string | null;
  hasFavicon: boolean;
  apps: { appId: string; alias: string }[];
}

function GatewaysView() {
  const queryClient = useQueryClient();
  const q = useQuery<{ gateways: GatewaySummary[] }>({
    queryKey: ["gateways", "_platform"],
    queryFn: async () => (await fetch("/api/gateways")).json(),
  });
  useSSEEvent("event", (e) => {
    const d = JSON.parse(e.data) as { component: string };
    if (d.component === "gateways") {
      void queryClient.invalidateQueries({ queryKey: ["gateways"] });
    }
  });

  if (q.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" />
      </div>
    );
  }
  const list = q.data?.gateways ?? [];
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Gateways</h1>
      {list.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No gateways yet</CardTitle>
            <CardDescription>
              A gateway is the guarded door your apps use to reach an external provider.
              Ask your agent to add one — it knows how.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((g) => {
            const website = g.website ? safeHttpUrl(g.website) : null;
            return (
            <Card key={g.providerId} className="relative h-full transition-colors hover:bg-accent/50">
              <CardHeader>
                <div className="flex items-center gap-3">
                  {g.hasFavicon ? (
                    <img src={`/api/gateways/${g.providerId}/favicon`} alt="" className="size-8 rounded" />
                  ) : (
                    <div className="flex size-8 items-center justify-center rounded bg-muted text-sm">🔌</div>
                  )}
                  <CardTitle>
                    <Link to="/gateways/$providerId" params={{ providerId: g.providerId }} className="after:absolute after:inset-0">
                      {g.name}
                    </Link>
                  </CardTitle>
                </div>
                <CardDescription className="flex items-center gap-1.5">
                  <AppWindow aria-hidden="true" className="size-3.5" />
                  {g.apps.length === 0 ? "no apps yet" : `${g.apps.length} app${g.apps.length === 1 ? "" : "s"}`}
                </CardDescription>
                <div className="relative flex flex-wrap items-center gap-2 empty:hidden">
                  {g.error && <Badge variant="destructive">manifest error</Badge>}
                  {website && (
                    <a href={website} target="_blank" rel="noreferrer"
                       className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
                      {new URL(website).hostname} <ExternalLink aria-hidden="true" className="size-3" />
                    </a>
                  )}
                </div>
              </CardHeader>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
