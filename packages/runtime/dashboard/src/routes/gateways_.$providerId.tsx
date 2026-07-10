import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, ExternalLink, ScrollText } from "lucide-react";
import {
  Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label,
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, Skeleton,
} from "@lodekit/ui";
import { useSSEEvent } from "../components/sse";

export const Route = createFileRoute("/gateways_/$providerId")({ component: GatewayDetail });

// Shapes mirror services/gateways.ts payloads exactly.
interface SlotState {
  slot: string; kind: "secret" | "config"; label: string; description: string | null;
  optional: boolean; status: "linked" | "set" | "pending";
  secret: { slug: string; label: string } | null; value: string | null;
}
interface ConnectionDoc {
  appId: string; alias: string; provider: string | null; providerName: string | null;
  description: string | null; error: string | null;
  status: "error" | "needs_setup" | "needs_reauth" | "unhealthy" | "connected";
  slots: SlotState[]; oauth: { status: "none" | "connected" | "needs_reauth" } | null;
}
interface Detail {
  gateway: { providerId: string; name: string; website: string | null; authKind: string | null; error: string | null; hasFavicon: boolean };
  slots: { slot: string; kind: string; label: string }[];
  connections: ConnectionDoc[];
}

const STATUS_BADGE: Record<ConnectionDoc["status"], { label: string; variant: "secondary" | "outline" | "destructive" }> = {
  connected: { label: "connected", variant: "secondary" },
  needs_setup: { label: "needs setup", variant: "outline" },
  needs_reauth: { label: "needs reauth", variant: "destructive" },
  unhealthy: { label: "unhealthy", variant: "destructive" },
  error: { label: "error", variant: "destructive" },
};

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

async function send(url: string, method: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// One connection row: secret slots reuse the AppSecretsCard linking pattern
// (link existing / create-new inline); config slots are plain inputs; OAuth
// gets Connect/Reconnect. Every mutation invalidates + announces over SSE.
function ConnectionRow({ c, providerId, invalidate }: { c: ConnectionDoc; providerId: string; invalidate: () => void }) {
  const catalog = useQuery<{ secrets: { slug: string; label: string }[] }>({
    queryKey: ["secrets", "_platform"],
    queryFn: async () => (await fetch("/api/secrets")).json(),
  });
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newValue, setNewValue] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const act = async (fn: () => Promise<Response>) => {
    const res = await fn();
    if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? res.statusText); return; }
    // Drop the config drafts too — after Clear/Save the input must show the
    // refetched server value, not the stale typed text.
    setError(null); setCreating(null); setNewLabel(""); setNewValue(""); setDrafts({});
    invalidate();
  };
  const base = `/api/apps/${c.appId}/gateways/${c.alias}`;
  const link = (slot: string, slug: string) => void act(() => send(`${base}/slots/${slot}/link`, "PUT", { slug }));
  const createAndLink = async (slot: string) => {
    const res = await send("/api/secrets", "POST", { label: newLabel, value: newValue });
    setNewValue(""); // typed value never lingers, success or failure
    if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? res.statusText); return; }
    link(slot, (await res.json()).slug);
  };
  const connect = async () => {
    const res = await send(`${base}/oauth/start`, "POST");
    if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? res.statusText); return; }
    const { authorizeUrl } = (await res.json()) as { authorizeUrl?: unknown };
    // Same belt as the anchors: never window.open a non-http(s) URL.
    if (typeof authorizeUrl === "string" && (authorizeUrl.startsWith("http://") || authorizeUrl.startsWith("https://"))) {
      window.open(authorizeUrl, "_blank", "noopener");
    }
  };
  const badge = STATUS_BADGE[c.status];
  return (
    <div className="border-b py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <Label className="flex items-center gap-2">
          {c.appId} <code className="text-xs text-muted-foreground">{c.alias}</code>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </Label>
        <div className="flex shrink-0 items-center gap-2">
          {c.oauth && (
            <Button size="sm" variant={c.oauth.status === "connected" ? "ghost" : "default"} onClick={() => void connect()}>
              {c.oauth.status === "connected" ? "Reconnect" : "Connect"}
            </Button>
          )}
          <Link
            to="/logs" search={{ app: c.appId, source: `gateway:${providerId}` }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
          >
            <ScrollText aria-hidden="true" className="size-3" /> Logs
          </Link>
        </div>
      </div>
      {c.description && <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>}
      {(error || c.error) && <p className="mt-1 text-sm text-destructive">{error ?? c.error}</p>}
      {c.slots.map((s) => (
        <div key={s.slot} className="mt-2 flex items-center justify-between gap-4">
          <span className="text-sm">
            {s.label}
            {s.optional && <span className="text-xs text-muted-foreground"> (optional)</span>}
            {s.status === "pending" && !s.optional && <Badge className="ml-2" variant="outline">pending</Badge>}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {s.kind === "secret" ? (
              s.status === "linked" && s.secret ? (
                <>
                  <Badge variant="secondary">{s.secret.label}</Badge>
                  <Button variant="ghost" size="sm" onClick={() => void act(() => send(`${base}/slots/${s.slot}/link`, "DELETE"))}>
                    Unlink
                  </Button>
                </>
              ) : creating === s.slot ? (
                <>
                  <Input className="w-32" placeholder="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
                  <Input type="password" autoComplete="off" className="w-36" placeholder="Value" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
                  <Button size="sm" disabled={!newLabel.trim() || !newValue} onClick={() => void createAndLink(s.slot)}>Save & link</Button>
                  <Button variant="ghost" size="sm" onClick={() => { setCreating(null); setNewValue(""); }}>Cancel</Button>
                </>
              ) : (
                <>
                  {/* Base UI Select's onValueChange can emit null (controlled reset) — never link an empty slug. */}
                  <Select value="" onValueChange={(slug) => { if (slug) link(s.slot, slug); }}>
                    <SelectTrigger className="w-44"><SelectValue placeholder="Link a secret…" /></SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {(catalog.data?.secrets ?? []).map((x) => (
                          <SelectItem key={x.slug} value={x.slug}>{x.label}</SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" onClick={() => setCreating(s.slot)}>New secret…</Button>
                </>
              )
            ) : (
              <>
                <Input
                  className="w-52" placeholder={s.label}
                  value={drafts[s.slot] ?? s.value ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [s.slot]: e.target.value }))}
                />
                <Button
                  size="sm" variant="outline"
                  disabled={(drafts[s.slot] ?? s.value ?? "") === (s.value ?? "") || !(drafts[s.slot] ?? "").trim()}
                  onClick={() => void act(() => send(`${base}/slots/${s.slot}/value`, "PUT", { value: drafts[s.slot] }))}
                >
                  Save
                </Button>
                {s.status === "set" && (
                  <Button variant="ghost" size="sm" onClick={() => void act(() => send(`${base}/slots/${s.slot}/value`, "DELETE"))}>
                    Clear
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function GatewayDetail() {
  const { providerId } = Route.useParams();
  const queryClient = useQueryClient();
  const q = useQuery<Detail>({
    queryKey: ["gateways", providerId],
    queryFn: async () => (await fetch(`/api/gateways/${providerId}`)).json(),
  });
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["gateways"] });
    void queryClient.invalidateQueries({ queryKey: ["secrets", "_platform"] });
  };
  useSSEEvent("event", (e) => {
    const d = JSON.parse(e.data) as { type: string };
    if (d.type === "gateway-change" || d.type === "gateway-health" || d.type === "secrets-change") invalidate();
  });

  if (q.isLoading) return <Skeleton className="h-40" />;
  const detail = q.data;
  if (!detail?.gateway) return <p className="text-sm text-muted-foreground">Unknown gateway.</p>;
  const g = detail.gateway;
  const website = g.website ? safeHttpUrl(g.website) : null;
  return (
    <main className="mx-auto max-w-4xl space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            {g.hasFavicon ? (
              <img src={`/api/gateways/${g.providerId}/favicon`} alt="" className="size-10 rounded" />
            ) : (
              <div className="flex size-10 items-center justify-center rounded bg-muted">🔌</div>
            )}
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                {g.name}
                {website && (
                  <a href={website} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                    <ExternalLink aria-hidden="true" className="size-4" />
                  </a>
                )}
              </CardTitle>
              <CardDescription className="flex items-center gap-3">
                <code className="text-xs">{g.providerId}</code>
                <Link to="/logs" search={{ source: `gateway:${g.providerId}` }} className="inline-flex items-center gap-1 hover:underline">
                  <ScrollText aria-hidden="true" className="size-3" /> Logs
                </Link>
                <Link to="/settings" search={{ section: "Gateways" }} className="inline-flex items-center gap-1 hover:underline">
                  <ArrowUpRight aria-hidden="true" className="size-3" /> Settings
                </Link>
              </CardDescription>
            </div>
          </div>
          {g.error && <p className="text-sm text-destructive">manifest error: {g.error}</p>}
        </CardHeader>
      </Card>
      <Card>
        <CardHeader><CardTitle>Apps using this gateway</CardTitle></CardHeader>
        <CardContent>
          {detail.connections.length === 0 ? (
            <>
              <p className="text-sm text-muted-foreground">
                No apps connect through this gateway yet. An app declares a connection in its <code>src/gateways.ts</code>.
              </p>
              {detail.slots.length > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Declares slots: {detail.slots.map((s) => `${s.label} (${s.kind})`).join(", ")}.
                </p>
              )}
            </>
          ) : (
            detail.connections.map((c) => (
              <ConnectionRow key={`${c.appId}/${c.alias}`} c={c} providerId={g.providerId} invalidate={invalidate} />
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}
