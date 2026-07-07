import { kv } from "@lodekit/sdk";

export interface Habit { name: string; icon: string; created_at: string }
export interface Checkin { habit_id: number; day: string }

export const habits = kv.collection<Habit>("habit");

export const today = () => new Date().toISOString().slice(0, 10);
export const dayOffset = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export function streak(days: string[]): number {
  const set = new Set(days);
  let count = 0;
  for (let n = set.has(today()) ? 0 : -1; ; n--) {
    if (set.has(dayOffset(n))) count++;
    else break;
  }
  return count;
}

export const habitsQuery = {
  queryKey: ["kv", "habits"] as const,
  queryFn: () => habits.all(),
};

export const checkinsQuery = {
  queryKey: ["kv", "checkins"] as const,
  queryFn: async (): Promise<Checkin[]> => {
    const { entries } = await kv.list({ prefix: "checkin:" });
    return entries.map((e) => {
      const [, id, day] = e.key.split(":"); // day is an ISO date — no ":" inside
      return { habit_id: Number(id), day };
    });
  },
};
