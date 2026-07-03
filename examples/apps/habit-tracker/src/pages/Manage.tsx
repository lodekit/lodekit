import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardContent, Input } from "@lodekit/ui";
import { habits, habitsQuery, today } from "../lib";

export default function Manage() {
  const queryClient = useQueryClient();
  const { data: habitRows = [] } = useQuery(habitsQuery);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["kv", "habits"] });

  const add = useMutation({
    mutationFn: () =>
      habits.add({ name: name.trim(), icon: icon.trim() || "✅", created_at: today() }),
    onSuccess: () => {
      setName("");
      setIcon("");
      invalidate();
    },
  });
  const remove = useMutation({ mutationFn: (id: number) => habits.remove(id), onSuccess: invalidate });

  return (
    <>
      <div className="my-5 flex flex-wrap gap-2">
        <Input className="w-16" placeholder="🎯" maxLength={2}
          value={icon} onChange={(e) => setIcon(e.target.value)} />
        <Input className="min-w-40 flex-1" placeholder="New habit (e.g. Meditate)"
          value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && add.mutate()} />
        <Button onClick={() => name.trim() && add.mutate()}>Add</Button>
      </div>
      <div className="grid gap-3">
        {habitRows.map(({ id, value: h }) => (
          <Card key={id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">{h.icon || "✅"}</span>
                <strong>{h.name}</strong>
              </div>
              <Button variant="ghost" onClick={() => remove.mutate(id)}>Remove</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
