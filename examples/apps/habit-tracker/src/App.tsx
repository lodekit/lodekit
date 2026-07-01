import { useEffect, useState } from "react";
import { db } from "@lodekit/sdk";

interface Habit { id: number; name: string; icon: string; created_at: string }
interface Checkin { habit_id: number; day: string }

const today = () => new Date().toISOString().slice(0, 10);
const dayOffset = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

function streak(days: string[]): number {
  const set = new Set(days);
  let count = 0;
  for (let n = set.has(today()) ? 0 : -1; ; n--) {
    if (set.has(dayOffset(n))) count++;
    else break;
  }
  return count;
}

export default function App() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");

  async function load() {
    await db.exec("CREATE TABLE IF NOT EXISTS habits (id INTEGER PRIMARY KEY, name TEXT, icon TEXT, created_at TEXT)");
    await db.exec("CREATE TABLE IF NOT EXISTS checkins (id INTEGER PRIMARY KEY, habit_id INTEGER, day TEXT, UNIQUE(habit_id, day))");
    setHabits(await db.query<Habit>("SELECT * FROM habits ORDER BY id ASC"));
    setCheckins(await db.query<Checkin>("SELECT habit_id, day FROM checkins"));
  }

  useEffect(() => {
    void load();
  }, []);

  async function add() {
    const n = name.trim();
    if (!n) return;
    await db.exec("INSERT INTO habits (name, icon, created_at) VALUES (?,?,?)", [n, icon.trim() || "✅", today()]);
    setName("");
    setIcon("");
    await load();
  }

  async function toggle(habitId: number, done: boolean) {
    if (done) await db.exec("DELETE FROM checkins WHERE habit_id = ? AND day = ?", [habitId, today()]);
    else await db.exec("INSERT OR IGNORE INTO checkins (habit_id, day) VALUES (?,?)", [habitId, today()]);
    await load();
  }

  const byHabit = new Map<number, string[]>();
  for (const c of checkins) byHabit.set(c.habit_id, [...(byHabit.get(c.habit_id) ?? []), c.day]);
  const doneToday = habits.filter((h) => (byHabit.get(h.id) ?? []).includes(today())).length;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Habit Tracker</h1>
      <p className="text-gray-500">
        <strong>{habits.length ? `${doneToday} of ${habits.length} done today` : "No habits yet"}</strong>
      </p>
      <div className="my-5 flex flex-wrap gap-2">
        <input className="w-16 rounded border border-gray-300 px-2 py-1" placeholder="🎯" maxLength={2}
          value={icon} onChange={(e) => setIcon(e.target.value)} />
        <input className="min-w-40 flex-1 rounded border border-gray-300 px-2 py-1" placeholder="New habit (e.g. Meditate)"
          value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="rounded bg-zinc-900 px-4 py-1 text-white" onClick={add}>Add</button>
      </div>
      <div className="grid gap-3">
        {habits.map((h) => {
          const days = byHabit.get(h.id) ?? [];
          const done = days.includes(today());
          const s = streak(days);
          return (
            <div key={h.id} className="flex items-center justify-between rounded border border-gray-200 p-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">{h.icon || "✅"}</span>
                <div>
                  <div><strong>{h.name}</strong></div>
                  <div className="text-gray-500">{s > 0 ? `🔥 ${s} ${s === 1 ? "day" : "days"}` : "No streak yet"}</div>
                </div>
              </div>
              <button className={`rounded bg-zinc-900 px-4 py-1 text-white ${done ? "opacity-60" : ""}`}
                onClick={() => toggle(h.id, done)}>{done ? "Undo" : "Done"}</button>
            </div>
          );
        })}
      </div>
    </main>
  );
}
