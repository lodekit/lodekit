import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { kv } from "@lodekit/sdk";
import { Badge, Button, Card, CardContent } from "@lodekit/ui";
import { checkinsQuery, habitsQuery, streak, today } from "../lib";

export default function Today() {
  const queryClient = useQueryClient();
  const { data: habitRows = [] } = useQuery(habitsQuery);
  const { data: checkins = [] } = useQuery(checkinsQuery);

  const toggle = useMutation({
    mutationFn: async ({ habitId, done }: { habitId: number; done: boolean }) => {
      const key = `checkin:${habitId}:${today()}`;
      if (done) await kv.del(key);
      else await kv.set(key, true);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["kv", "checkins"] }),
  });

  const byHabit = new Map<number, string[]>();
  for (const c of checkins) byHabit.set(c.habit_id, [...(byHabit.get(c.habit_id) ?? []), c.day]);
  const doneToday = habitRows.filter(({ id }) => (byHabit.get(id) ?? []).includes(today())).length;

  return (
    <>
      <p className="text-muted-foreground">
        <strong>{habitRows.length ? `${doneToday} of ${habitRows.length} done today` : "No habits yet"}</strong>
      </p>
      <div className="mt-5 grid gap-3">
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
                <Button variant={done ? "secondary" : "default"} onClick={() => toggle.mutate({ habitId: id, done })}>
                  {done ? "Undo" : "Done"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
