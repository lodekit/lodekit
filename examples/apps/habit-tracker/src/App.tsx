import { useEffect, useState } from "react";
import { kv } from "@lodekit/sdk";
import { Badge, Button, Card, CardContent, Input } from "@lodekit/ui";

interface Habit { name: string; icon: string; created_at: string }
interface Checkin { habit_id: number; day: string }

const habits = kv.collection<Habit>("habit");

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
  const [habitRows, setHabitRows] = useState<{ id: number; value: Habit }[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");

  async function load() {
    setHabitRows(await habits.all());
    const { entries } = await kv.list({ prefix: "checkin:" });
    setCheckins(
      entries.map((e) => {
        const [, id, day] = e.key.split(":"); // day is an ISO date — no ":" inside
        return { habit_id: Number(id), day };
      })
    );
  }

  useEffect(() => {
    void load();
  }, []);

  async function add() {
    const n = name.trim();
    if (!n) return;
    await habits.add({ name: n, icon: icon.trim() || "✅", created_at: today() });
    setName("");
    setIcon("");
    await load();
  }

  async function toggle(habitId: number, done: boolean) {
    const key = `checkin:${habitId}:${today()}`;
    if (done) await kv.del(key);
    else await kv.set(key, true);
    await load();
  }

  const byHabit = new Map<number, string[]>();
  for (const c of checkins) byHabit.set(c.habit_id, [...(byHabit.get(c.habit_id) ?? []), c.day]);
  const doneToday = habitRows.filter(({ id }) => (byHabit.get(id) ?? []).includes(today())).length;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Habit Tracker</h1>
      <p className="text-muted-foreground">
        <strong>{habitRows.length ? `${doneToday} of ${habitRows.length} done today` : "No habits yet"}</strong>
      </p>
      <div className="my-5 flex flex-wrap gap-2">
        <Input className="w-16" placeholder="🎯" maxLength={2}
          value={icon} onChange={(e) => setIcon(e.target.value)} />
        <Input className="min-w-40 flex-1" placeholder="New habit (e.g. Meditate)"
          value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button onClick={add}>Add</Button>
      </div>
      <div className="grid gap-3">
        {habitRows.map(({ id, value: h }) => {
          const days = byHabit.get(id) ?? [];
          const done = days.includes(today());
          const s = streak(days);
          return (
            <Card key={id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{h.icon || "✅"}</span>
                  <div>
                    <div><strong>{h.name}</strong></div>
                    <div className="text-muted-foreground">
                      {s > 0 ? <Badge variant="secondary">🔥 {s} {s === 1 ? "day" : "days"}</Badge> : "No streak yet"}
                    </div>
                  </div>
                </div>
                <Button variant={done ? "secondary" : "default"} onClick={() => toggle(id, done)}>
                  {done ? "Undo" : "Done"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
