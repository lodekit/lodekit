import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { kv, files, tasks, logs, appId } from "@lodekit/sdk";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@lodekit/ui";
import { plants, stateKey, streakKey } from "../lib";
import { seedIfNeeded } from "../seed";

export const resetConservatory = createServerFn().handler(async () => {
  // Cancel anything queued so reseeded reminders don't collide with stale ones.
  for (const run of await tasks.runs({ state: "queued", limit: 1000 })) {
    await tasks.cancel(run.id).catch(() => false);
  }
  for (const { id } of await plants.all()) await plants.remove(id);
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
  const rows = await plants.all();
  const keys = rows.flatMap(({ id }) => [stateKey(id), streakKey(id)]);
  const entries = keys.length ? await kv.getMany(keys) : [];
  const stat = await files.put(
    JSON.stringify({ exportedAt: Date.now(), plants: rows, care: entries }, null, 2),
    {
      slug: `snapshot-${Date.now()}`,
      contentType: "application/json",
      title: "Conservatory snapshot",
      ttl: 3600, // self-expires in an hour — a temporary export, not a record
    }
  );
  logs.info("snapshot exported", { slug: stat.slug });
  return stat.slug;
});

export const Route = createFileRoute("/shed")({
  component: Shed,
});

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
    </main>
  );
}
