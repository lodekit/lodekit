import { files, kv, logs, tasks } from "@lodekit/sdk";
import {
  type CareKind,
  type CareState,
  type Plant,
  CARE_VERB,
  plants,
  parseEvery,
  padTs,
  stateKey,
  streakKey,
  countKey,
  snoozeKey,
  journalKey,
} from "./lib";

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
  plant: Omit<Plant, "adoptedAt">;
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
      care: { water: { every: "3d" }, feed: { every: "14d" }, mist: { every: "2d" } },
    },
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
      care: { water: { every: "14d" }, feed: { every: "30d" } },
    },
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
      care: { water: { every: "5d" }, feed: { every: "21d" } },
    },
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
      care: { water: { every: "2d" }, feed: { every: "14d" }, mist: { every: "1d" } },
    },
    daysAgo: 30,
    streak: 1,
    story: "snoozed",
  },
];

/** Idempotent first-open seed (spec §8). Returns true when it seeded. */
export async function seedIfNeeded(): Promise<boolean> {
  if (await kv.has("seeded")) return false;
  const now = Date.now();
  for (const seed of SEEDS) {
    const adoptedAt = now - seed.daysAgo * 86_400_000;
    const { id } = await plants.add({ ...seed.plant, adoptedAt });
    await files.put(portraitSvg(seed.plant.icon, id), {
      slug: `cover-${id}`,
      contentType: "image/svg+xml",
      title: `${seed.plant.name}'s portrait`,
    });
    await files.put(portraitSvg(seed.plant.icon, id + 1), {
      slug: `photo-${id}-${padTs(adoptedAt)}`,
      contentType: "image/svg+xml",
      title: "Adoption day",
      metadata: { plantId: id },
    });
    const state: CareState = {};
    const backdated: { key: string; value: unknown }[] = [];
    for (const [kind, cfg] of Object.entries(seed.plant.care) as [CareKind, { every: string }][]) {
      const every = parseEvery(cfg.every);
      // Stagger due times per the seed's story: an overdue plant is past due, a
      // dueSoon plant comes due within hours, the rest are comfortably ahead.
      const dueAt =
        seed.story === "overdue"
          ? now - Math.floor(every / 2)
          : seed.story === "dueSoon"
            ? now + Math.floor(Math.min(every, 86_400_000) / 4)
            : now + every;
      const lastAt = dueAt - every;
      const reminderRunId = await tasks.enqueue(
        "care-reminder",
        { plantId: id, kind },
        { at: dueAt, dedupeKey: `${id}:${kind}` }
      );
      state[kind] = { lastAt, dueAt, reminderRunId };
      backdated.push({
        key: journalKey(id, lastAt),
        value: { at: lastAt, text: `${CARE_VERB[kind]} ${seed.plant.name}.` },
      });
    }
    backdated.push({
      key: journalKey(id, adoptedAt),
      value: { at: adoptedAt, text: `${seed.plant.name} joined the conservatory.` },
    });
    await kv.setMany([
      { key: stateKey(id), value: state },
      { key: streakKey(id), value: seed.streak },
      { key: countKey(id, "water"), value: Math.max(1, Math.floor(seed.daysAgo / 3)) },
      ...backdated,
    ]);
    if (seed.story === "snoozed") await kv.set(snoozeKey(id), true, { ttl: 86_400 });
  }
  await kv.set("seeded", { at: now, version: 1 });
  logs.info("conservatory seeded", { plants: SEEDS.length });
  return true;
}
