import { kv } from "@lodekit/sdk";

export type CareKind = "water" | "feed" | "mist";
export const CARE_KINDS: CareKind[] = ["water", "feed", "mist"];
export const CARE_VERB: Record<CareKind, string> = { water: "Watered", feed: "Fed", mist: "Misted" };

/** kind -> human-editable interval ("3d"/"12h"), assembled from care_rules rows. */
export type CareEvery = Partial<Record<CareKind, string>>;
/** kind -> due info, assembled from care_state rows. */
export type DueByKind = Partial<Record<CareKind, { dueAt: number }>>;

export const careByKind = (rules: { kind: string; every: string }[]): CareEvery =>
  Object.fromEntries(rules.map((r) => [r.kind as CareKind, r.every]));
export const dueByKind = (states: { kind: string; dueAt: number }[]): DueByKind =>
  Object.fromEntries(states.map((s) => [s.kind as CareKind, { dueAt: s.dueAt }]));

// App memory (kv): counters and flags about the app's own behavior — the
// entities live in src/db.ts tables.
export const streakKey = (id: number) => `streak:${id}`;
export const snoozeKey = (id: number) => `snooze:${id}`;
export { kv };

/** Inverted zero-padded epoch ms — newer stamps sort FIRST under file-store's
 *  ascending prefix listing, so photo timelines read newest-first. */
export const invTs = (ms: number) => String(99_999_999_999_999 - ms).padStart(14, "0");

/** "3d" / "12h" → milliseconds. Throws on anything else. */
export function parseEvery(every: string): number {
  const m = /^(\d+)([dh])$/.exec(every.trim());
  if (!m) throw new Error(`invalid interval "${every}" — use e.g. "3d" or "12h"`);
  return Number(m[1]) * (m[2] === "d" ? 86_400_000 : 3_600_000);
}

export type MoodKey = "thriving" | "content" | "parched" | "hungry" | "dusty" | "wilting";
export interface Mood {
  key: MoodKey;
  emoji: string;
  label: string;
}

/**
 * Deterministic mood from care state: the worst-overdue kind wins.
 * over > 1 interval past due → wilting; past due → parched/hungry/dusty by kind;
 * otherwise a 7+ streak is thriving, else content.
 */
export function moodFor(care: CareEvery, due: DueByKind, streak: number, now: number): Mood {
  let worst = 0;
  let worstKind: CareKind = "water";
  for (const kind of CARE_KINDS) {
    const every = care[kind];
    const d = due[kind];
    if (!every || !d) continue;
    const over = (now - d.dueAt) / parseEvery(every);
    if (over > worst) {
      worst = over;
      worstKind = kind;
    }
  }
  if (worst > 1) return { key: "wilting", emoji: "🥀", label: "wilting — needs attention" };
  if (worst > 0) {
    if (worstKind === "water") return { key: "parched", emoji: "🏜️", label: "parched" };
    if (worstKind === "feed") return { key: "hungry", emoji: "😋", label: "hungry" };
    return { key: "dusty", emoji: "🌫️", label: "missing a misting" };
  }
  if (streak >= 7) return { key: "thriving", emoji: "🌟", label: `thriving — ${streak}-care streak` };
  return { key: "content", emoji: "🙂", label: "content" };
}
