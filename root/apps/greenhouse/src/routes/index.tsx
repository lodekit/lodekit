import { useEffect, useState, type ChangeEvent } from "react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { db, plants, careRules, careState } from "../db";
import { CARE_KINDS, careByKind, dueByKind, moodFor, streakKey, snoozeKey } from "../lib";
import { kv, files, events } from "@lodekit/sdk";
import { Badge, Button, Card, CardContent, Input } from "@lodekit/ui";
import { seedIfNeeded } from "../seed";
import { adoptPlant } from "../care";

export const getConservatory = createServerFn().handler(async () => {
  await seedIfNeeded();
  const now = Date.now();
  const [rows, rules, states] = await Promise.all([
    db.select().from(plants).orderBy(plants.id),
    db.select().from(careRules),
    db.select().from(careState),
  ]);
  // kv.getMany fan-in for the app-memory bits (streaks, snoozes).
  const keys = rows.flatMap(({ id }) => [streakKey(id), snoozeKey(id)]);
  const entries = keys.length ? await kv.getMany(keys) : [];
  const byKey = new Map(entries.map((e) => [e.key, e.value]));
  return rows.map((plant) => {
    const care = careByKind(rules.filter((r) => r.plantId === plant.id));
    const due = dueByKind(states.filter((s) => s.plantId === plant.id));
    const streak = (byKey.get(streakKey(plant.id)) as number | undefined) ?? 0;
    const snoozed = byKey.get(snoozeKey(plant.id)) != null;
    const dueKinds = CARE_KINDS.filter((k) => care[k] && due[k] && due[k]!.dueAt <= now);
    return { id: plant.id, plant, streak, snoozed, dueKinds, mood: moodFor(care, due, streak, now) };
  });
});

export const Route = createFileRoute("/")({
  loader: () => getConservatory(),
  component: Conservatory,
});

function Conservatory() {
  const cards = Route.useLoaderData();
  const router = useRouter();

  // useEffect (not module scope) keeps the watch off the SSR path — it's client-only.
  // Entity writes ride db-store facts; streak/snooze (app memory) ride kv-store facts.
  useEffect(
    () => events.watch({ component: ["db-store", "kv-store"] }, () => void router.invalidate()),
    [router]
  );

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map(({ id, plant, streak, snoozed, dueKinds, mood }) => (
          <Card key={id}>
            <CardContent className="flex gap-4 p-4">
              <img
                src={files.url(`cover-${id}`)}
                alt={`${plant.name}'s portrait`}
                className="h-24 w-32 rounded-md object-cover"
              />
              <div className="min-w-0 space-y-1">
                <Link to="/plants/$plantId" params={{ plantId: String(id) }} className="font-medium">
                  {plant.icon} {plant.name}
                </Link>
                <p className="text-sm text-muted-foreground">{plant.species}</p>
                <p className="text-sm">
                  {mood.emoji} {plant.name} is {mood.label}
                </p>
                <div className="flex flex-wrap gap-1">
                  {snoozed ? (
                    <Badge variant="secondary">😴 snoozed</Badge>
                  ) : (
                    dueKinds.map((k) => (
                      <Badge key={k} variant="destructive">
                        {k} due
                      </Badge>
                    ))
                  )}
                  {streak > 0 && <Badge variant="secondary">🔥 {streak}</Badge>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <AdoptForm onAdopted={() => void router.invalidate()} />
    </main>
  );
}

function AdoptForm({ onAdopted }: { onAdopted: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    species: "",
    icon: "🪴",
    personality: "",
    waterEvery: "3d",
    feedEvery: "14d",
    mistEvery: "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  if (!open) return <Button onClick={() => setOpen(true)}>Adopt a plant</Button>;

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <p className="font-medium">New arrival</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input placeholder="Name (e.g. Fernando)" value={form.name} onChange={set("name")} />
          <Input placeholder="Species" value={form.species} onChange={set("species")} />
          <Input placeholder="Icon (emoji)" value={form.icon} onChange={set("icon")} />
          <Input placeholder="Personality (optional)" value={form.personality} onChange={set("personality")} />
          <Input placeholder='Water every (e.g. "3d")' value={form.waterEvery} onChange={set("waterEvery")} />
          <Input placeholder='Feed every (e.g. "14d")' value={form.feedEvery} onChange={set("feedEvery")} />
          <Input placeholder='Mist every (optional, e.g. "2d")' value={form.mistEvery} onChange={set("mistEvery")} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button
            onClick={async () => {
              try {
                setError(null);
                await adoptPlant({
                  data: {
                    name: form.name,
                    species: form.species,
                    icon: form.icon,
                    personality: form.personality,
                    waterEvery: form.waterEvery,
                    feedEvery: form.feedEvery,
                    mistEvery: form.mistEvery || undefined,
                  },
                });
                setOpen(false);
                onAdopted();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            Adopt
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
