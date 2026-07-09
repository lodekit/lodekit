import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { kv, files, tasks, logs } from "@lodekit/sdk";
import { db, plants, careRules, careState, journal } from "./db";
import { CARE_VERB, type CareKind, parseEvery, streakKey, snoozeKey } from "./lib";
import { portraitSvg } from "./seed";

const kindSchema = z.enum(["water", "feed", "mist"]);
const careInput = z.object({ plantId: z.number().int(), kind: kindSchema });

async function requeueReminder(plantId: number, kind: CareKind, at: number): Promise<number> {
  return tasks.enqueue("care-reminder", { plantId, kind }, { at, dedupeKey: `${plantId}:${kind}` });
}

const stateFor = async (plantId: number, kind: CareKind) =>
  (await db.select().from(careState).where(and(eq(careState.plantId, plantId), eq(careState.kind, kind))))[0];

export const giveCare = createServerFn()
  .inputValidator(careInput)
  .handler(async ({ data }) => {
    const { plantId, kind } = data;
    const [plant] = await db.select().from(plants).where(eq(plants.id, plantId));
    if (!plant) throw new Error(`no plant ${plantId}`);
    const [rule] = await db
      .select().from(careRules)
      .where(and(eq(careRules.plantId, plantId), eq(careRules.kind, kind)));
    if (!rule) throw new Error(`${plant.name} doesn't take "${kind}"`);
    const now = Date.now();
    const prev = await stateFor(plantId, kind);
    // Streak (kv counter — app memory): on-time care extends it; late restarts it at 1.
    if (prev && now > prev.dueAt) await kv.set(streakKey(plantId), 0);
    const streak = await kv.incr(streakKey(plantId));
    // One live reminder per plant+kind: drop the stale queued run, then requeue.
    if (prev?.reminderRunId != null) await tasks.cancel(prev.reminderRunId).catch(() => false);
    const dueAt = now + parseEvery(rule.every);
    const reminderRunId = await requeueReminder(plantId, kind, dueAt);
    await db
      .insert(careState)
      .values({ plantId, kind, lastAt: now, dueAt, reminderRunId })
      .onConflictDoUpdate({
        target: [careState.plantId, careState.kind],
        set: { lastAt: now, dueAt, dueSince: null, reminderRunId },
      });
    await kv.del(snoozeKey(plantId));
    await db.insert(journal).values({ plantId, at: now, kind, text: `${CARE_VERB[kind]} ${plant.name}.` });
    logs.info("care given", { plantId, kind, streak });
    return { dueAt, streak };
  });

const adoptInput = z.object({
  name: z.string().min(1).max(60),
  species: z.string().min(1).max(80),
  icon: z.string().min(1).max(8),
  personality: z.string().max(200).default(""),
  waterEvery: z.string(),
  feedEvery: z.string(),
  mistEvery: z.string().optional(),
});

export const adoptPlant = createServerFn()
  .inputValidator(adoptInput)
  .handler(async ({ data }) => {
    // Validate intervals before writing anything.
    parseEvery(data.waterEvery);
    parseEvery(data.feedEvery);
    if (data.mistEvery) parseEvery(data.mistEvery);
    const now = Date.now();
    const every: Partial<Record<CareKind, string>> = { water: data.waterEvery, feed: data.feedEvery };
    if (data.mistEvery) every.mist = data.mistEvery;
    const [{ id }] = await db
      .insert(plants)
      .values({ name: data.name, species: data.species, icon: data.icon, personality: data.personality, adoptedAt: now })
      .returning({ id: plants.id });
    await db.insert(careRules).values(
      (Object.entries(every) as [CareKind, string][]).map(([kind, e]) => ({ plantId: id, kind, every: e }))
    );
    await files.put(portraitSvg(data.icon, id), {
      slug: `cover-${id}`,
      contentType: "image/svg+xml",
      title: `${data.name}'s portrait`,
    });
    for (const [kind, e] of Object.entries(every) as [CareKind, string][]) {
      const dueAt = now + parseEvery(e);
      const reminderRunId = await requeueReminder(id, kind, dueAt);
      await db.insert(careState).values({ plantId: id, kind, lastAt: now, dueAt, reminderRunId });
    }
    await db.insert(journal).values({ plantId: id, at: now, text: `${data.name} joined the conservatory.` });
    logs.info("plant adopted", { plantId: id, name: data.name });
    return id;
  });

export const updateCare = createServerFn()
  .inputValidator(z.object({ plantId: z.number().int(), kind: kindSchema, every: z.string() }))
  .handler(async ({ data }) => {
    parseEvery(data.every);
    const [plant] = await db.select().from(plants).where(eq(plants.id, data.plantId));
    if (!plant) throw new Error("plant not found");
    await db
      .update(careRules)
      .set({ every: data.every })
      .where(and(eq(careRules.plantId, data.plantId), eq(careRules.kind, data.kind)));
    // Reschedule from lastAt under the new interval.
    const ks = await stateFor(data.plantId, data.kind);
    if (ks) {
      if (ks.reminderRunId != null) await tasks.cancel(ks.reminderRunId).catch(() => false);
      const dueAt = ks.lastAt + parseEvery(data.every);
      const reminderRunId = await requeueReminder(data.plantId, data.kind, dueAt);
      await db
        .update(careState)
        .set({ dueAt, dueSince: null, reminderRunId })
        .where(and(eq(careState.plantId, data.plantId), eq(careState.kind, data.kind)));
    }
  });

export const snoozePlant = createServerFn()
  .inputValidator(z.object({ plantId: z.number().int(), hours: z.number().int().min(1).max(72) }))
  .handler(async ({ data }) => {
    // TTL key (kv — app memory): while present the due badge hides; expiry brings it back.
    await kv.set(snoozeKey(data.plantId), true, { ttl: data.hours * 3600 });
    logs.info("plant snoozed", { plantId: data.plantId, hours: data.hours });
  });

export const remindLater = createServerFn()
  .inputValidator(careInput)
  .handler(async ({ data }) => {
    const runId = await tasks.enqueue("care-reminder", data, {
      delay: "1h",
      dedupeKey: `${data.plantId}:${data.kind}:later`,
    });
    logs.info("reminder deferred an hour", { ...data, runId });
    return runId;
  });

export const skipNext = createServerFn()
  .inputValidator(careInput)
  .handler(async ({ data }) => {
    const ks = await stateFor(data.plantId, data.kind);
    if (!ks) return false;
    if (ks.reminderRunId != null) await tasks.cancel(ks.reminderRunId).catch(() => false);
    const [rule] = await db
      .select().from(careRules)
      .where(and(eq(careRules.plantId, data.plantId), eq(careRules.kind, data.kind)));
    if (!rule) return false;
    // Push the due time one interval out and queue the next reminder.
    const dueAt = ks.dueAt + parseEvery(rule.every);
    const reminderRunId = await requeueReminder(data.plantId, data.kind, dueAt);
    await db
      .update(careState)
      .set({ dueAt, dueSince: null, reminderRunId })
      .where(and(eq(careState.plantId, data.plantId), eq(careState.kind, data.kind)));
    logs.info("next care skipped", { plantId: data.plantId, kind: data.kind });
    return true;
  });

export const letGo = createServerFn()
  .inputValidator(z.object({ plantId: z.number().int() }))
  .handler(async ({ data }) => {
    const { plantId } = data;
    const [plant] = await db.select().from(plants).where(eq(plants.id, plantId));
    for (const ks of await db.select().from(careState).where(eq(careState.plantId, plantId))) {
      if (ks.reminderRunId != null) await tasks.cancel(ks.reminderRunId).catch(() => false);
    }
    // ON DELETE CASCADE takes care_rules, care_state, and the journal with it —
    // the cleanup that kv-era code did key by key.
    await db.delete(plants).where(eq(plants.id, plantId));
    await kv.del(streakKey(plantId));
    await kv.del(snoozeKey(plantId));
    for (const prefix of [`photo-${plantId}-`, `archive-${plantId}-`]) {
      let fc: string | null = null;
      do {
        const page = await files.list({ prefix, limit: 200, cursor: fc ?? undefined });
        for (const f of page.entries) await files.delete(f.slug);
        fc = page.nextCursor;
      } while (fc);
    }
    await files.delete(`cover-${plantId}`).catch(() => false);
    logs.info("plant let go", { plantId, name: plant?.name });
  });
