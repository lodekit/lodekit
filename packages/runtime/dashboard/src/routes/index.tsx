import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, CardDescription, CardHeader, CardTitle, Skeleton } from "@lodekit/ui";
import { useSSEEvent } from "../components/sse";

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

// The "app needs a key" nudge (secret-store spec §9): pending slots, visible
// without hunting. Clicking lands on the app's settings section (slots panel).
function PendingSecretsBadge({ appId }: { appId: string }) {
  const q = useQuery<{ slots: { status: string }[] }>({
    queryKey: ["secrets", appId],
    queryFn: async () => (await fetch(`/api/apps/${appId}/secrets`)).json(),
  });
  const pending = (q.data?.slots ?? []).filter((s) => s.status === "pending").length;
  if (pending === 0) return null;
  return (
    <Link to="/settings" search={{ section: appId }}>
      <Badge variant="outline">{pending} secret{pending === 1 ? "" : "s"} needed</Badge>
    </Link>
  );
}

// The "connection needs the person" nudge (gateways spec §12): pending slots
// or an unconnected/expired OAuth, visible without hunting.
function PendingGatewaysBadge({ appId }: { appId: string }) {
  const q = useQuery<{ connections: { status: string }[] }>({
    queryKey: ["gateways", appId],
    queryFn: async () => (await fetch(`/api/apps/${appId}/gateways`)).json(),
  });
  const pending = (q.data?.connections ?? []).filter(
    (c) => c.status === "needs_setup" || c.status === "needs_reauth"
  ).length;
  if (pending === 0) return null;
  return (
    <Link to="/gateways">
      <Badge variant="outline">{pending} gateway{pending === 1 ? "" : "s"} to set up</Badge>
    </Link>
  );
}

function DashboardHome() {
  const apps = useQuery<AppInfo[]>({
    queryKey: ["apps"],
    queryFn: async () => (await fetch("/api/apps")).json(),
  });
  const [states, setStates] = useState<Record<string, BuildStatus>>({});
  const [serverStates, setServerStates] = useState<Record<string, ServerStatus>>({});

  // build/server state is stream-only (no fetchable snapshot) — accumulate from SSE.
  useSSEEvent("event", (e) => {
    const d = JSON.parse(e.data) as {
      ns: string;
      type: string;
      payload: Record<string, unknown> | null;
    };
    if (d.type === "build-state") {
      const p = d.payload as { status: BuildStatus["status"]; message?: string } | null;
      if (p) setStates((s) => ({ ...s, [d.ns]: { status: p.status, message: p.message } }));
    }
    if (d.type === "server-state") {
      const p = d.payload as { status: ServerStatus["status"]; message?: string } | null;
      if (p) setServerStates((s) => ({ ...s, [d.ns]: { status: p.status, message: p.message } }));
    }
  });

  if (apps.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (apps.isError) return <p className="text-sm text-muted-foreground">Failed to load apps.</p>;
  const list = apps.data ?? [];
  if (list.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No apps yet</CardTitle>
          <CardDescription>Ask your agent to build an app with Lodekit.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((a) => (
        <Card key={a.appId} className="relative h-full transition-colors hover:bg-accent/50">
          <CardHeader>
            <div className="text-3xl">{a.icon || "📦"}</div>
            <CardTitle>
              {/* Stretched link: the after-overlay makes the whole card clickable
                  without nesting anchors; the badge row re-stacks above it. */}
              <a href={`/${a.appId}/`} className="after:absolute after:inset-0">{a.name}</a>
            </CardTitle>
            <CardDescription>{a.description || ""}</CardDescription>
            <div className="relative flex flex-wrap items-center gap-2 empty:hidden">
              <StateBadge state={states[a.appId]} />
              <ServerStateBadge state={serverStates[a.appId]} />
              <PendingSecretsBadge appId={a.appId} />
              <PendingGatewaysBadge appId={a.appId} />
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
