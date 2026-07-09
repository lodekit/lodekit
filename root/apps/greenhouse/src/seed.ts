import { files, kv, logs, tasks } from "@lodekit/sdk";
import { db, plants, careRules, careState, journal } from "./db";
import { CARE_VERB, type CareKind, parseEvery, invTs, streakKey, snoozeKey } from "./lib";

/** Deterministic SVG portrait — no binary assets, no network. Icon is stripped of
 *  markup-significant characters (it lands inside an SVG text node). */
export function portraitSvg(icon: string, seed: number): string {
  const safe = icon.replace(/[<>&"']/g, "");
  const hues = [150, 95, 200, 270, 25, 330];
  const hue = hues[Math.abs(seed) % hues.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="hsl(${hue} 45% 88%)"/>
  <circle cx="200" cy="170" r="110" fill="hsl(${hue} 50% 78%)"/>
  <text x="200" y="210" font-size="120" text-anchor="middle">${safe}</text>
</svg>`;
}

interface SeedPlant {
  plant: { name: string; species: string; icon: string; personality: string };
  every: Partial<Record<CareKind, string>>;
  daysAgo: number;
  streak: number;
  story: "overdue" | "dueSoon" | "fine" | "snoozed";
}

const SEEDS: SeedPlant[] = [
  {
    plant: {
      name: "Fernando",
      species: "Fiddle-leaf fig",
      icon: "🌿",
      personality: "Dramatic. Sheds a leaf to make a point.",
    },
    every: { water: "3d", feed: "14d", mist: "2d" },
    daysAgo: 120,
    streak: 0,
    story: "overdue",
  },
  {
    plant: {
      name: "Doris",
      species: "Golden barrel cactus",
      icon: "🌵",
      personality: "Unbothered. Thrives on neglect, mildly disappointed by attention.",
    },
    every: { water: "14d", feed: "30d" },
    daysAgo: 400,
    streak: 3,
    story: "fine",
  },
  {
    plant: {
      name: "Priya",
      species: "Golden pothos",
      icon: "🪴",
      personality: "Overachiever. Will trellis your bookshelf without asking.",
    },
    every: { water: "5d", feed: "21d" },
    daysAgo: 60,
    streak: 12,
    story: "dueSoon",
  },
  {
    plant: {
      name: "Bartholomew",
      species: "Boston fern",
      icon: "🌱",
      personality: "Anxious. Checks the humidity forecast twice a day.",
    },
    every: { water: "2d", feed: "14d", mist: "1d" },
    daysAgo: 30,
    streak: 1,
    story: "snoozed",
  },
];

/** Idempotent first-open seed. Returns true when it seeded. */
export async function seedIfNeeded(): Promise<boolean> {
  if (await kv.has("seeded")) return false;
  const now = Date.now();
  for (const seed of SEEDS) {
    const adoptedAt = now - seed.daysAgo * 86_400_000;
    const [{ id }] = await db
      .insert(plants)
      .values({ ...seed.plant, adoptedAt })
      .returning({ id: plants.id });
    await files.put(portraitSvg(seed.plant.icon, id), {
      slug: `cover-${id}`, contentType: "image/svg+xml", title: `${seed.plant.name}'s portrait`,
    });
    await files.put(portraitSvg(seed.plant.icon, id + 1), {
      slug: `photo-${id}-${invTs(adoptedAt)}`, contentType: "image/svg+xml",
      title: "Adoption day", metadata: { plantId: id },
    });
    const stateRows: (typeof careState.$inferInsert)[] = [];
    const journalRows: (typeof journal.$inferInsert)[] = [];
    let i = 0;
    for (const [kind, every] of Object.entries(seed.every) as [CareKind, string][]) {
      const ms = parseEvery(every);
      // Stagger due times per the seed's story (same arithmetic as before).
      const dueAt =
        seed.story === "overdue" ? now - Math.floor(ms / 2)
        : seed.story === "dueSoon" ? now + Math.floor(Math.min(ms, 86_400_000) / 4)
        : now + ms;
      const lastAt = dueAt - ms;
      const stampAt = lastAt - i * 60_000;
      i++;
      const reminderRunId = await tasks.enqueue("care-reminder", { plantId: id, kind }, { at: dueAt, dedupeKey: `${id}:${kind}` });
      stateRows.push({ plantId: id, kind, lastAt, dueAt, reminderRunId });
      journalRows.push({ plantId: id, at: stampAt, kind, text: `${CARE_VERB[kind]} ${seed.plant.name}.` });
    }
    journalRows.push({ plantId: id, at: adoptedAt, text: `${seed.plant.name} joined the conservatory.` });
    // One transaction for the plant's dependents — db.batch is the transaction story.
    await db.batch([
      db.insert(careRules).values(
        (Object.entries(seed.every) as [CareKind, string][]).map(([kind, every]) => ({ plantId: id, kind, every }))
      ),
      db.insert(careState).values(stateRows),
      db.insert(journal).values(journalRows),
    ]);
    await kv.set(streakKey(id), seed.streak);
    if (seed.story === "snoozed") await kv.set(snoozeKey(id), true, { ttl: 86_400 });
  }
  await kv.set("seeded", { at: now, version: 2 });
  logs.info("conservatory seeded", { plants: SEEDS.length });
  return true;
}
