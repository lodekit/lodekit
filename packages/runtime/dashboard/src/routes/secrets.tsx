import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Skeleton,
} from "@lodekit/ui";

export const Route = createFileRoute("/secrets")({ component: SecretsView });

// Shapes mirror services/secret-store.ts route payloads exactly. No value field
// exists anywhere — the catalog API is write-only for values by design.
interface SecretMeta {
  slug: string; label: string; description: string | null;
  createdAt: number; updatedAt: number;
  links: { appId: string; slot: string }[];
}

async function send(url: string, method: string, body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText);
}

function NewSecretForm({ onDone }: { onDone: () => void }) {
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    try {
      await send("/api/secrets", "POST", { label, ...(description ? { description } : {}), value });
      setLabel(""); setDescription(""); setValue(""); setError(null);
      onDone();
    } catch (e) {
      setValue(""); // never keep a typed value around after a failed submit
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Card>
      <CardHeader><CardTitle>New secret</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="space-y-1">
          <Label>Label</Label>
          <Input value={label} placeholder="OpenWeather key" onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Description (optional)</Label>
          <Input value={description} placeholder="What this credential is for" onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Value</Label>
          <Input type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <Button disabled={!label.trim() || !value} onClick={() => void submit()}>Save secret</Button>
      </CardContent>
    </Card>
  );
}

function SecretRow({ s, invalidate }: { s: SecretMeta; invalidate: () => void }) {
  const [replacing, setReplacing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const act = async (fn: () => Promise<void>) => {
    try { await fn(); setError(null); setReplacing(false); setValue(""); invalidate(); }
    catch (e) { setValue(""); setError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="border-b py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <Label className="flex items-center gap-2">
            {s.label} <code className="text-xs text-muted-foreground">{s.slug}</code>
          </Label>
          {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
          <div className="mt-1 flex flex-wrap gap-1">
            {s.links.length === 0
              ? <span className="text-xs text-muted-foreground">Not linked to any app</span>
              : s.links.map((l) => (
                  <Badge key={`${l.appId}/${l.slot}`} variant="secondary">{l.appId} · {l.slot}</Badge>
                ))}
          </div>
          {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {replacing ? (
            <>
              <Input type="password" autoComplete="off" className="w-44" placeholder="New value" value={value} onChange={(e) => setValue(e.target.value)} />
              <Button size="sm" disabled={!value} onClick={() => void act(() => send(`/api/secrets/${s.slug}`, "PUT", { value }))}>Save</Button>
              <Button variant="ghost" size="sm" onClick={() => { setReplacing(false); setValue(""); }}>Cancel</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setReplacing(true)}>Replace value</Button>
              <Button
                variant="ghost" size="sm"
                onClick={() => {
                  const warn = s.links.length ? ` ${s.links.length} linked slot(s) become pending.` : "";
                  if (confirm(`Delete "${s.label}"?${warn}`)) void act(() => send(`/api/secrets/${s.slug}`, "DELETE"));
                }}
              >Delete</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SecretsView() {
  const queryClient = useQueryClient();
  const q = useQuery<{ secrets: SecretMeta[] }>({
    queryKey: ["secrets", "_platform"],
    queryFn: async () => (await fetch("/api/secrets")).json(),
  });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["secrets"] });

  useEffect(() => {
    const es = new EventSource("/api/events");
    es.addEventListener("event", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { ns: string; type: string };
      if (d.type === "secrets-change") void queryClient.invalidateQueries({ queryKey: ["secrets", d.ns] });
    });
    return () => es.close();
  }, [queryClient]);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Secrets</h1>
        <Link to="/" className="text-sm text-muted-foreground hover:underline">Dashboard</Link>
      </div>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Credentials for your apps — values are encrypted, shown to no one, and readable only
          by the server code of apps you link them to.
        </p>
        <Card>
          <CardHeader><CardTitle>Your secrets</CardTitle></CardHeader>
          <CardContent>
            {q.isLoading ? (
              <Skeleton className="h-16" />
            ) : (q.data?.secrets ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No secrets yet.</p>
            ) : (
              (q.data?.secrets ?? []).map((s) => <SecretRow key={s.slug} s={s} invalidate={invalidate} />)
            )}
          </CardContent>
        </Card>
        <NewSecretForm onDone={invalidate} />
      </div>
    </main>
  );
}
