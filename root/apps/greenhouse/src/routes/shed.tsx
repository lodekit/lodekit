import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { sql } from "drizzle-orm";
import { db, plants, careRules, careState, journal } from "../db";
import { kv, files, tasks, logs, appId, gateways, GatewayError } from "@lodekit/sdk";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@lodekit/ui";
import { seedIfNeeded } from "../seed";

export const resetConservatory = createServerFn().handler(async () => {
  // Cancel anything queued so reseeded reminders don't collide with stale ones.
  for (const run of await tasks.runs({ state: "queued", limit: 1000 })) {
    await tasks.cancel(run.id).catch(() => false);
  }
  await db.delete(plants); // cascade takes care_rules, care_state, journal
  let cursor: string | null = null;
  do {
    const page = await kv.list({ limit: 200, cursor: cursor ?? undefined });
    for (const e of page.entries) await kv.del(e.key);
    cursor = page.nextCursor;
  } while (cursor);
  let fc: string | null = null;
  do {
    const page = await files.list({ limit: 200, cursor: fc ?? undefined });
    for (const f of page.entries) await files.delete(f.slug);
    fc = page.nextCursor;
  } while (fc);
  logs.warn("conservatory reset", {});
  await seedIfNeeded();
});

export const exportSnapshot = createServerFn().handler(async () => {
  const [allPlants, rules, states, entries] = await Promise.all([
    db.select().from(plants),
    db.select().from(careRules),
    db.select().from(careState),
    db.select().from(journal),
  ]);
  // The raw-SQL escape hatch (spec §6): db.values returns positional rows by
  // contract — the right raw API over the proxy driver (db.all without field
  // metadata would also be positional, just typed as objects — a trap).
  const [[plantCount, journalCount]] = await db.values<[number, number]>(
    sql`SELECT (SELECT count(*) FROM plants), (SELECT count(*) FROM journal)`
  );
  const stats = { plants: plantCount, journal_entries: journalCount };
  const stat = await files.put(
    JSON.stringify({ exportedAt: Date.now(), stats, plants: allPlants, careRules: rules, careState: states, journal: entries }, null, 2),
    { slug: `snapshot-${Date.now()}`, contentType: "application/json", title: "Conservatory snapshot", ttl: 3600 }
  );
  logs.info("snapshot exported", { slug: stat.slug });
  return stat.slug;
});

// The OAuth rail, live (gateways spec §14): Connect in the dashboard, then
// this call rides a bearer token the runtime injected — and transparently
// refreshed. App code never sees the token.
export const fetchGatewayIdentity = createServerFn().handler(async () => {
  try {
    const res = await gateways.oauth_demo.get("/api/test");
    if (!res.ok) return { state: "error" as const, message: `HTTP ${res.status}` };
    return { state: "ok" as const, claims: await res.json<unknown>() };
  } catch (e) {
    if (e instanceof GatewayError) {
      if (e.reason === "unconfigured") return { state: "unconfigured" as const, message: e.message };
      if (e.reason === "needs_reauth") return { state: "needs_reauth" as const, message: e.message };
      return { state: "error" as const, message: e.message };
    }
    return { state: "error" as const, message: e instanceof Error ? e.message : String(e) };
  }
});

export const Route = createFileRoute("/shed")({
  component: Shed,
});

function GatewayDemoCard() {
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchGatewayIdentity>> | null>(null);
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    try {
      setResult(await fetchGatewayIdentity());
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader><CardTitle>Gateway demo — connected identity</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Calls Duende's public OAuth demo through the <code>oauth_demo</code> gateway.
          Set the client id and click Connect on the gateway page first (demo login:
          alice/alice or bob/bob).
        </p>
        <Button size="sm" disabled={busy} onClick={() => void check()}>
          {busy ? "Checking…" : "Check identity"}
        </Button>
        {result?.state === "ok" && (
          <pre className="overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(result.claims, null, 2)}</pre>
        )}
        {result?.state === "unconfigured" && (
          <p className="text-sm text-muted-foreground">Not connected yet — {result.message}</p>
        )}
        {result?.state === "needs_reauth" && (
          <p className="text-sm text-destructive">Session expired — reconnect on the gateway page.</p>
        )}
        {result?.state === "error" && <p className="text-sm text-destructive">{result.message}</p>}
      </CardContent>
    </Card>
  );
}

function Shed() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [roundTrip, setRoundTrip] = useState<string | null>(null);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">The Potting Shed</h1>
      <p className="text-sm text-muted-foreground">
        Tools and rummage. Everything in here is honest utility — and a plain look at the
        SDK underneath the conservatory.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Start over</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Clears every plant, photo, journal, and queued reminder, then reseeds the demo
            conservatory.
          </p>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await resetConservatory();
                void router.invalidate();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Repotting…" : "Reset & reseed"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Share a snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Exports the conservatory as JSON. The file self-expires in an hour.
          </p>
          <Button
            onClick={async () => {
              setRoundTrip(null);
              const slug = await exportSnapshot();
              setSnapshot(slug);
              const blob = await files.get(slug);
              if (blob) {
                setRoundTrip(`${(blob.size / 1024).toFixed(1)} KB`);
              } else {
                setRoundTrip("round-trip failed");
                logs.error("snapshot round-trip check failed", { slug });
              }
            }}
          >
            Export snapshot
          </Button>
          {snapshot && (
            <p className="text-sm">
              <a className="underline" href={files.url(snapshot, { download: true })} download>
                Download {snapshot}
              </a>{" "}
              (expires in an hour)
              {roundTrip && <> · Round-trip check: {roundTrip}</>}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test the log pipes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Each button emits one record at that level — watch them arrive in the
            dashboard&apos;s Logs view.
          </p>
          <div className="flex gap-2">
            {(["debug", "info", "warn", "error"] as const).map((level) => (
              <Button
                key={level}
                variant="outline"
                size="sm"
                onClick={() => logs[level](`shed test log (${level})`, { from: "potting-shed" })}
              >
                {level}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SDK exercises</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Reserved for SDK methods that lose their natural home as the platform grows.
            Almost empty — the <code>appId</code> export lives here; every other method has
            a real feature (see <code>root/readme.md</code>).
          </p>
          <p className="text-sm text-muted-foreground">
            This page belongs to app "<code>{appId}</code>" — the SDK's <code>appId</code>{" "}
            export.
          </p>
        </CardContent>
      </Card>

      <GatewayDemoCard />
    </main>
  );
}
