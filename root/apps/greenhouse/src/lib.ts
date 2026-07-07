import { kv } from "@lodekit/sdk";

export type CareKind = "water" | "feed" | "mist";
export const CARE_KINDS: CareKind[] = ["water", "feed", "mist"];
export const CARE_VERB: Record<CareKind, string> = { water: "Watered", feed: "Fed", mist: "Misted" };

export interface CareConfig {
  /** Human-editable interval, e.g. "3d" or "12h". */
  every: string;
}

export interface Plant {
  name: string;
  species: string;
  icon: string;
  personality: string;
  adoptedAt: number;
  care: Partial<Record<CareKind, CareConfig>>;
}

export interface KindState {
  lastAt: number;
  dueAt: number;
  /** Set by care_reminder / morning_rounds once the kind became due. */
  dueSince?: number;
  /** The queued care_reminder run for this kind — canceled on re-care/skip. */
  reminderRunId?: number;
}
export type CareState = Partial<Record<CareKind, KindState>>;

export interface JournalEntry {
  at: number;
  text: string;
}

export const plants = kv.collection<Plant>("plants");

export const stateKey = (id: number) => `state:${id}`;
export const streakKey = (id: number) => `streak:${id}`;
export const countKey = (id: number, kind: CareKind) => `count:${kind}:${id}`;
export const snoozeKey = (id: number) => `snooze:${id}`;
export const journalPrefix = (id: number) => `journal:${id}:`;
/** Inverted zero-padded epoch ms — newer stamps sort FIRST under the stores'
 *  ascending prefix listing, so timeline pages read newest-first. */
export const invTs = (ms: number) => String(99_999_999_999_999 - ms).padStart(14, "0");
/** Keys sort reverse-chronologically (newest first) under prefix listing. */
export const journalKey = (id: number, at: number) => `${journalPrefix(id)}${invTs(at)}`;

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
export function moodFor(plant: Plant, state: CareState, streak: number, now: number): Mood {
  let worst = 0;
  let worstKind: CareKind = "water";
  for (const kind of CARE_KINDS) {
    const cfg = plant.care[kind];
    const ks = state[kind];
    if (!cfg || !ks) continue;
    const over = (now - ks.dueAt) / parseEvery(cfg.every);
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
