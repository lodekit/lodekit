import { useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, count, desc, eq, isNotNull, lt, or } from "drizzle-orm";
import { db, plants as plantsTable, careRules, careState, journal } from "../db";
import {
  CARE_KINDS,
  type CareKind,
  type CareEvery,
  type DueByKind,
  careByKind,
  dueByKind,
  moodFor,
  invTs,
  streakKey,
  snoozeKey,
} from "../lib";
import { kv, files, logs, events } from "@lodekit/sdk";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from "@lodekit/ui";
import { giveCare, updateCare, snoozePlant, remindLater, skipNext, letGo } from "../care";

export const getPlant = createServerFn()
  .inputValidator(z.object({ plantId: z.number().int() }))
  .handler(async ({ data }) => {
    const [plant] = await db.select().from(plantsTable).where(eq(plantsTable.id, data.plantId));
    if (!plant) throw new Error("plant not found");
    const now = Date.now();
    const rules = await db.select().from(careRules).where(eq(careRules.plantId, data.plantId));
    const states = await db.select().from(careState).where(eq(careState.plantId, data.plantId));
    const care = careByKind(rules);
    const due = dueByKind(states);
    const streak = (await kv.get<number>(streakKey(data.plantId))) ?? 0;
    const snoozed = await kv.has(snoozeKey(data.plantId));
    // Lifetime care counts, derived — GROUP BY over the journal instead of a counter per kind.
    const countRows = await db
      .select({ kind: journal.kind, n: count() }).from(journal)
      .where(and(eq(journal.plantId, data.plantId), isNotNull(journal.kind)))
      .groupBy(journal.kind);
    const counts = Object.fromEntries(countRows.map((r) => [r.kind as CareKind, r.n]));
    const photos = await files.list({ prefix: `photo-${data.plantId}-`, limit: 12 });
    const entries = await db
      .select().from(journal).where(eq(journal.plantId, data.plantId))
      .orderBy(desc(journal.at), desc(journal.id)).limit(10);
    const cover = await files.stat(`cover-${data.plantId}`);
    return { plant, care, due, streak, snoozed, counts, photos, journal: entries, cover, mood: moodFor(care, due, streak, now) };
  });

export const Route = createFileRoute("/plants/$plantId")({
  loader: ({ params }) => getPlant({ data: { plantId: Number(params.plantId) } }),
  component: PlantPage,
});

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString();

function PlantPage() {
  const data = Route.useLoaderData();
  const { plantId } = Route.useParams();
  const id = Number(plantId);
  const router = useRouter();
  const { plant, care, due, streak, snoozed, counts, cover, mood } = data;
  const refresh = () => void router.invalidate();

  // The file change feed rides the event bus; slug filtering happens in the callback
  // (payloads carry identity, not values — {slug}).
  useEffect(
    () =>
      events.watch({ component: "file-store" }, (ev) => {
        const slug = (ev.payload as { slug?: string } | undefined)?.slug;
        if (slug?.startsWith(`photo-${id}-`)) refresh();
      }),
    [id]
  );

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4">
      <Card>
        <CardContent className="flex gap-4 p-4">
          {cover && (
            <img src={files.url(cover.slug)} alt={`${plant.name}'s portrait`} className="h-32 w-44 rounded-md object-cover" />
          )}
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">
              {plant.icon} {plant.name}
            </h1>
            <p className="text-sm text-muted-foreground">{plant.species}</p>
            {plant.personality && <p className="text-sm italic">{plant.personality}</p>}
            <p className="text-sm">
              {mood.emoji} {plant.name} is {mood.label}
            </p>
            <div className="flex gap-1">
              {snoozed && <Badge variant="secondary">😴 snoozed</Badge>}
              {streak > 0 && <Badge variant="secondary">🔥 {streak}-care streak</Badge>}
              <Badge variant="outline">with you since {fmtDate(plant.adoptedAt)}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <CareCard id={id} care={care} due={due} counts={counts} onChange={refresh} />
      <PhotoTimeline id={id} initial={data.photos} onChange={refresh} />
      <JournalCard id={id} initial={data.journal} />

      <Button
        variant="destructive"
        onClick={async () => {
          if (!window.confirm(`Let ${plant.name} go? Their photos and journal go too — for good.`)) return;
          await letGo({ data: { plantId: id } });
          void router.navigate({ to: "/" });
        }}
      >
        Let {plant.name} go
      </Button>
    </main>
  );
}

function CareCard({
  id,
  care,
  due,
  counts,
  onChange,
}: {
  id: number;
  care: CareEvery;
  due: DueByKind;
  counts: Partial<Record<CareKind, number>>;
  onChange: () => void;
}) {
  const kinds = CARE_KINDS.filter((k) => care[k]);
  const [editing, setEditing] = useState(false);
  const [every, setEvery] = useState<Record<string, string>>(
    Object.fromEntries(kinds.map((k) => [k, care[k]!]))
  );
  const now = Date.now();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Care</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {kinds.map((kind) => {
          const ks = due[kind];
          const isDue = ks != null && ks.dueAt <= now;
          return (
            <div key={kind} className="flex flex-wrap items-center gap-2">
              <span className="w-16 capitalize">{kind}</span>
              <Button size="sm" onClick={async () => { await giveCare({ data: { plantId: id, kind } }); onChange(); }}>
                {kind === "water" ? "💧 Water" : kind === "feed" ? "🍽️ Feed" : "💨 Mist"} now
              </Button>
              <span className="text-sm text-muted-foreground">
                every {care[kind]!}
                {ks && ` · ${isDue ? "due since" : "next"} ${fmtDate(ks.dueAt)}`}
                {` · ${counts[kind] ?? 0}× so far`}
              </span>
              {isDue && (
                <>
                  <Button size="sm" variant="secondary" onClick={async () => { await remindLater({ data: { plantId: id, kind } }); onChange(); }}>
                    Remind me in 1h
                  </Button>
                  <Button size="sm" variant="secondary" onClick={async () => { await skipNext({ data: { plantId: id, kind } }); onChange(); }}>
                    Skip this one
                  </Button>
                </>
              )}
              {editing && (
                <Input
                  className="w-24"
                  value={every[kind]}
                  onChange={(e) => setEvery((m) => ({ ...m, [kind]: e.target.value }))}
                />
              )}
            </div>
          );
        })}
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={async () => { await snoozePlant({ data: { plantId: id, hours: 24 } }); onChange(); }}>
            😴 Snooze reminders for a day
          </Button>
          {editing ? (
            <Button
              size="sm"
              onClick={async () => {
                for (const kind of kinds) {
                  if (every[kind] !== care[kind]!) {
                    await updateCare({ data: { plantId: id, kind, every: every[kind] } });
                  }
                }
                setEditing(false);
                onChange();
              }}
            >
              Save schedule
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit schedule
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PhotoTimeline({
  id,
  initial,
  onChange,
}: {
  id: number;
  initial: Awaited<ReturnType<typeof files.list>>;
  onChange: () => void;
}) {
  const [entries, setEntries] = useState(initial.entries);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [caption, setCaption] = useState("");
  useEffect(() => {
    setEntries(initial.entries);
    setCursor(initial.nextCursor);
  }, [initial]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Photo timeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="w-56" placeholder="Caption (optional)" value={caption} onChange={(e) => setCaption(e.target.value)} />
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                await files.put(file, {
                  slug: `photo-${id}-${invTs(Date.now())}`,
                  title: caption || file.name,
                  contentType: file.type || "application/octet-stream",
                  metadata: { plantId: id },
                });
                setCaption("");
                onChange();
              } catch (err) {
                logs.error("photo upload failed", { plantId: id, error: String(err) });
              } finally {
                e.target.value = "";
              }
            }}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {entries.map((f) => (
            <figure key={f.slug} className="space-y-1">
              <img src={files.url(f.slug)} alt={f.title ?? f.slug} className="aspect-[4/3] w-full rounded-md object-cover" />
              <figcaption className="text-xs text-muted-foreground">
                {f.title ?? "Untitled"} · {fmtDate(f.createdAt)} · {(f.size / 1024).toFixed(1)} KB
              </figcaption>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={async () => { await files.copy(f.slug, `cover-${id}`); onChange(); }}>
                  Set cover
                </Button>
                <Button size="sm" variant="outline" onClick={async () => { await files.move(f.slug, f.slug.replace(`photo-${id}-`, `archive-${id}-`)); onChange(); }}>
                  Archive
                </Button>
                <Button size="sm" variant="outline" onClick={async () => { await files.delete(f.slug); onChange(); }}>
                  Delete
                </Button>
              </div>
            </figure>
          ))}
        </div>
        {entries.length === 0 && <p className="text-sm text-muted-foreground">No photos yet — add the first one.</p>}
        {cursor && (
          <Button
            variant="secondary"
            onClick={async () => {
              const page = await files.list({ prefix: `photo-${id}-`, limit: 12, cursor });
              setEntries((cur) => [...cur, ...page.entries]);
              setCursor(page.nextCursor);
            }}
          >
            Load more
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function JournalCard({
  id,
  initial,
}: {
  id: number;
  initial: (typeof journal.$inferSelect)[];
}) {
  const [entries, setEntries] = useState(initial);
  const [done, setDone] = useState(initial.length < 10);
  const [text, setText] = useState("");
  useEffect(() => {
    setEntries(initial);
    setDone(initial.length < 10);
  }, [initial]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Journal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder="A note for the record…" value={text} onChange={(e) => setText(e.target.value)} />
          <Button
            onClick={async () => {
              if (!text.trim()) return;
              const at = Date.now();
              await db.insert(journal).values({ plantId: id, at, text: text.trim() });
              setEntries((cur) => [{ id: -at, plantId: id, at, kind: null, text: text.trim() }, ...cur]);
              setText("");
            }}
          >
            Add
          </Button>
        </div>
        <ul className="space-y-1 text-sm">
          {entries.map((e) => (
            <li key={e.id}>
              <span className="text-muted-foreground">{fmtDate(e.at)}</span> — {e.text}
            </li>
          ))}
        </ul>
        {!done && (
          <Button
            variant="secondary"
            onClick={async () => {
              const last = entries[entries.length - 1];
              const page = await db
                .select().from(journal)
                .where(
                  and(
                    eq(journal.plantId, id),
                    or(lt(journal.at, last.at), and(eq(journal.at, last.at), lt(journal.id, last.id)))
                  )
                )
                .orderBy(desc(journal.at), desc(journal.id))
                .limit(10);
              setEntries((cur) => [...cur, ...page]);
              if (page.length < 10) setDone(true);
            }}
          >
            Load more
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
