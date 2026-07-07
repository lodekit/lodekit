import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { kv, files, tasks, logs } from "@lodekit/sdk";
import {
  CARE_KINDS,
  CARE_VERB,
  type CareKind,
  type CareState,
  type Plant,
  plants,
  parseEvery,
  stateKey,
  streakKey,
  countKey,
  snoozeKey,
  journalPrefix,
  journalKey,
} from "./lib";
import { portraitSvg } from "./seed";

const kindSchema = z.enum(["water", "feed", "mist"]);
const careInput = z.object({ plantId: z.number().int(), kind: kindSchema });

async function requeueReminder(plantId: number, kind: CareKind, at: number): Promise<number> {
  return tasks.enqueue("care-reminder", { plantId, kind }, { at, dedupeKey: `${plantId}:${kind}` });
}

export const giveCare = createServerFn()
  .inputValidator(careInput)
  .handler(async ({ data }) => {
    const { plantId, kind } = data;
    const plant = await plants.get(plantId);
    if (!plant) throw new Error(`no plant ${plantId}`);
    const cfg = plant.care[kind];
    if (!cfg) throw new Error(`${plant.name} doesn't take "${kind}"`);
    const now = Date.now();
    const state = (await kv.get<CareState>(stateKey(plantId))) ?? {};
    const prev = state[kind];
    // Streak: on-time care extends it; late care restarts it at 1.
    if (prev && now > prev.dueAt) await kv.set(streakKey(plantId), 0);
    const streak = await kv.incr(streakKey(plantId));
    await kv.incr(countKey(plantId, kind));
    // One live reminder per plant+kind: drop the stale queued run, then requeue.
    if (prev?.reminderRunId != null) await tasks.cancel(prev.reminderRunId).catch(() => false);
    const dueAt = now + parseEvery(cfg.every);
    const reminderRunId = await requeueReminder(plantId, kind, dueAt);
    state[kind] = { lastAt: now, dueAt, reminderRunId };
    await kv.set(stateKey(plantId), state);
    await kv.del(snoozeKey(plantId));
    await kv.set(journalKey(plantId, now), { at: now, text: `${CARE_VERB[kind]} ${plant.name}.` });
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
    const care: Plant["care"] = {
      water: { every: data.waterEvery },
      feed: { every: data.feedEvery },
    };
    if (data.mistEvery) care.mist = { every: data.mistEvery };
    const { id } = await plants.add({
      name: data.name,
      species: data.species,
      icon: data.icon,
      personality: data.personality,
      adoptedAt: now,
      care,
    });
    await files.put(portraitSvg(data.icon, id), {
      slug: `cover-${id}`,
      contentType: "image/svg+xml",
      title: `${data.name}'s portrait`,
    });
    const state: CareState = {};
    for (const kind of Object.keys(care) as CareKind[]) {
      const dueAt = now + parseEvery(care[kind]!.every);
      state[kind] = { lastAt: now, dueAt, reminderRunId: await requeueReminder(id, kind, dueAt) };
    }
    await kv.set(stateKey(id), state);
    await kv.set(journalKey(id, now), { at: now, text: `${data.name} joined the conservatory.` });
    logs.info("plant adopted", { plantId: id, name: data.name });
    return id;
  });

export const updateCare = createServerFn()
  .inputValidator(z.object({ plantId: z.number().int(), kind: kindSchema, every: z.string() }))
  .handler(async ({ data }) => {
    parseEvery(data.every);
    const plant = await plants.get(data.plantId);
    if (!plant) throw new Error("plant not found");
    plant.care[data.kind] = { every: data.every };
    await plants.set(data.plantId, plant);
    // Reschedule from lastAt under the new interval.
    const state = (await kv.get<CareState>(stateKey(data.plantId))) ?? {};
    const ks = state[data.kind];
    if (ks) {
      if (ks.reminderRunId != null) await tasks.cancel(ks.reminderRunId).catch(() => false);
      ks.dueAt = ks.lastAt + parseEvery(data.every);
      delete ks.dueSince;
      ks.reminderRunId = await requeueReminder(data.plantId, data.kind, ks.dueAt);
      await kv.set(stateKey(data.plantId), state);
    }
  });

export const snoozePlant = createServerFn()
  .inputValidator(z.object({ plantId: z.number().int(), hours: z.number().int().min(1).max(72) }))
  .handler(async ({ data }) => {
    // TTL key: while present the due badge hides; expiry brings it back by itself.
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
    const state = (await kv.get<CareState>(stateKey(data.plantId))) ?? {};
    const ks = state[data.kind];
    if (!ks) return false;
    if (ks.reminderRunId != null) await tasks.cancel(ks.reminderRunId).catch(() => false);
    const plant = await plants.get(data.plantId);
    const cfg = plant?.care[data.kind];
    if (!cfg) return false;
    // Push the due time one interval out and queue the next reminder.
    ks.dueAt = ks.dueAt + parseEvery(cfg.every);
    delete ks.dueSince;
    ks.reminderRunId = await requeueReminder(data.plantId, data.kind, ks.dueAt);
    await kv.set(stateKey(data.plantId), state);
    logs.info("next care skipped", { plantId: data.plantId, kind: data.kind });
    return true;
  });

export const letGo = createServerFn()
  .inputValidator(z.object({ plantId: z.number().int() }))
  .handler(async ({ data }) => {
    const { plantId } = data;
    const plant = await plants.get(plantId);
    const state = (await kv.get<CareState>(stateKey(plantId))) ?? {};
    for (const ks of Object.values(state)) {
      if (ks?.reminderRunId != null) await tasks.cancel(ks.reminderRunId).catch(() => false);
    }
    await kv.del(stateKey(plantId));
    await kv.del(streakKey(plantId));
    await kv.del(snoozeKey(plantId));
    for (const kind of CARE_KINDS) await kv.del(countKey(plantId, kind));
    let cursor: string | null = null;
    do {
      const page = await kv.list({ prefix: journalPrefix(plantId), limit: 200, cursor: cursor ?? undefined });
      for (const e of page.entries) await kv.del(e.key);
      cursor = page.nextCursor;
    } while (cursor);
    for (const prefix of [`photo-${plantId}-`, `archive-${plantId}-`]) {
      let fc: string | null = null;
      do {
        const page = await files.list({ prefix, limit: 200, cursor: fc ?? undefined });
        for (const f of page.entries) await files.delete(f.slug);
        fc = page.nextCursor;
      } while (fc);
    }
    await files.delete(`cover-${plantId}`).catch(() => false);
    await plants.remove(plantId);
    logs.info("plant let go", { plantId, name: plant?.name });
  });
