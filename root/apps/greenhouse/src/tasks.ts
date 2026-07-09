import { task, kv, files, logs } from "@lodekit/sdk";
import { and, count, desc, eq, inArray, isNull, lte } from "drizzle-orm";
import { db, plants, careRules, careState, journal } from "./db";
import { parseEvery, streakKey, type CareKind } from "./lib";

/** Reminder for one plant + care kind, enqueued by care actions at the next due time. */
export const care_reminder = task({
  run: async (p: { plantId: number; kind: CareKind }) => {
    const [plant] = await db.select().from(plants).where(eq(plants.id, p.plantId));
    if (!plant) return; // let go before the reminder fired
    const now = Date.now();
    const [ks] = await db
      .select().from(careState)
      .where(and(eq(careState.plantId, p.plantId), eq(careState.kind, p.kind)));
    if (!ks || ks.dueAt > now) return; // re-cared meanwhile — nothing due
    if (!ks.dueSince) {
      await db
        .update(careState).set({ dueSince: now })
        .where(and(eq(careState.plantId, p.plantId), eq(careState.kind, p.kind)));
    }
    logs.info("care due", { plantId: p.plantId, kind: p.kind, name: plant.name });
  },
});

/** Daily rounds: mark overdue kinds, break streaks, warn on wilting plants. */
export const morning_rounds = task({
  cron: "0 9 * * *",
  catchUp: true,
  run: async () => {
    const now = Date.now();
    // One join answers "what's overdue, and by how much" — the SQL that the
    // kv-era version assembled by hand across three key families.
    const overdue = await db
      .select({
        plantId: careState.plantId,
        name: plants.name,
        dueAt: careState.dueAt,
        dueSince: careState.dueSince,
        every: careRules.every,
      })
      .from(careState)
      .innerJoin(plants, eq(plants.id, careState.plantId))
      .innerJoin(careRules, and(eq(careRules.plantId, careState.plantId), eq(careRules.kind, careState.kind)))
      .where(lte(careState.dueAt, now));
    await db.update(careState).set({ dueSince: now }).where(and(lte(careState.dueAt, now), isNull(careState.dueSince)));
    const byPlant = new Map<number, { name: string; wilting: boolean }>();
    for (const row of overdue) {
      const cur = byPlant.get(row.plantId) ?? { name: row.name, wilting: false };
      if (now - row.dueAt > parseEvery(row.every)) cur.wilting = true;
      byPlant.set(row.plantId, cur);
    }
    for (const [plantId, info] of byPlant) {
      await kv.set(streakKey(plantId), 0); // a missed round breaks the streak
      if (info.wilting) logs.warn("plant wilting", { plantId, name: info.name });
    }
    const [{ total }] = await db.select({ total: count() }).from(plants);
    await kv.set("rounds:last", { ranAt: now, due: byPlant.size, total });
    logs.info("morning rounds complete", { due: byPlant.size, total });
  },
});

/** Housekeeping: prune archived photos older than 90 days, trim journals beyond 200 entries. */
export const compost_sweep = task({
  every: "12h",
  run: async () => {
    const now = Date.now();
    let sweptFiles = 0;
    let sweptRows = 0;
    for (const { id } of await db.select({ id: plants.id }).from(plants)) {
      let fc: string | null = null;
      do {
        const page = await files.list({ prefix: `archive-${id}-`, limit: 200, cursor: fc ?? undefined });
        for (const f of page.entries) {
          if (now - f.createdAt > 90 * 86_400_000) {
            await files.delete(f.slug);
            sweptFiles++;
          }
        }
        fc = page.nextCursor;
      } while (fc);
      // Everything past the newest 200 journal entries goes. (SQLite wants a
      // LIMIT before OFFSET — the large limit is "the rest".)
      const excess = await db
        .select({ id: journal.id }).from(journal)
        .where(eq(journal.plantId, id))
        .orderBy(desc(journal.at), desc(journal.id))
        .limit(100_000).offset(200);
      if (excess.length > 0) {
        await db.delete(journal).where(inArray(journal.id, excess.map((e) => e.id)));
        sweptRows += excess.length;
      }
    }
    logs.debug("compost swept", { files: sweptFiles, journalEntries: sweptRows });
  },
});
