import { task, kv, files, logs } from "@lodekit/sdk";
import {
  CARE_KINDS,
  type CareKind,
  type CareState,
  plants,
  parseEvery,
  stateKey,
  streakKey,
} from "./lib";

/** Reminder for one plant + care kind, enqueued by care actions at the next due time. */
export const care_reminder = task({
  run: async (p: { plantId: number; kind: CareKind }) => {
    const plant = await plants.get(p.plantId);
    if (!plant) return; // let go before the reminder fired
    const state = (await kv.get<CareState>(stateKey(p.plantId))) ?? {};
    const ks = state[p.kind];
    const now = Date.now();
    if (!ks || ks.dueAt > now) return; // re-cared meanwhile — nothing due
    if (!ks.dueSince) {
      ks.dueSince = now;
      await kv.set(stateKey(p.plantId), state);
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
    const all = await plants.all();
    let due = 0;
    for (const { id, value: plant } of all) {
      const state = (await kv.get<CareState>(stateKey(id))) ?? {};
      let overdue = false;
      let wilting = false;
      let changed = false;
      for (const kind of CARE_KINDS) {
        const cfg = plant.care[kind];
        const ks = state[kind];
        if (!cfg || !ks || ks.dueAt > now) continue;
        overdue = true;
        if (!ks.dueSince) {
          ks.dueSince = now;
          changed = true;
        }
        if (now - ks.dueAt > parseEvery(cfg.every)) wilting = true;
      }
      if (changed) await kv.set(stateKey(id), state);
      if (overdue) {
        due++;
        await kv.set(streakKey(id), 0); // a missed round breaks the streak
        if (wilting) logs.warn("plant wilting", { plantId: id, name: plant.name });
      }
    }
    await kv.set("rounds:last", { ranAt: now, due, total: all.length });
    logs.info("morning rounds complete", { due, total: all.length });
  },
});

/** Housekeeping: prune archived photos older than 90 days, trim journals beyond 200 entries. */
export const compost_sweep = task({
  every: "12h",
  run: async () => {
    const now = Date.now();
    let sweptFiles = 0;
    let sweptKeys = 0;
    for (const { id } of await plants.all()) {
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
      const keys: string[] = [];
      let kc: string | null = null;
      do {
        const page = await kv.list({ prefix: `journal:${id}:`, limit: 200, cursor: kc ?? undefined });
        keys.push(...page.entries.map((e) => e.key));
        kc = page.nextCursor;
      } while (kc);
      // Keys sort newest-first (inverted ms) — drop everything past the newest 200.
      for (const key of keys.sort().slice(200)) {
        await kv.del(key);
        sweptKeys++;
      }
    }
    logs.debug("compost swept", { files: sweptFiles, journalEntries: sweptKeys });
  },
});
