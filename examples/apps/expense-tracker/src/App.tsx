import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { kv } from "@lodekit/sdk";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lodekit/ui";

interface Expense {
  amount: number;
  category: string;
  note: string;
  created_at: string;
}

const expenses = kv.collection<Expense>("expense");

const CATEGORIES = ["Food", "Transport", "Bills", "Other"];

export default function App() {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [note, setNote] = useState("");

  const { data: currency = "USD" } = useQuery({
    queryKey: ["kv", "currency"],
    queryFn: async () => {
      const c = await kv.get<string>("currency");
      if (c === undefined) {
        await kv.set("currency", "USD");
        return "USD";
      }
      return c;
    },
  });

  const { data: rows = [] } = useQuery({
    queryKey: ["kv", "expenses"],
    queryFn: async () => (await expenses.all()).reverse(), // newest first
  });

  const addExpense = useMutation({
    mutationFn: (e: Expense) => expenses.add(e),
    onSuccess: () => {
      setAmount("");
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["kv", "expenses"] });
    },
  });

  function add() {
    const value = parseFloat(amount);
    if (!value) return;
    addExpense.mutate({
      amount: value,
      category,
      note,
      created_at: new Date().toISOString().slice(0, 10),
    });
  }

  const total = rows.reduce((sum, r) => sum + r.value.amount, 0);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Expense Tracker</h1>
      <p className="text-muted-foreground">
        Total: <strong>{currency} {total.toFixed(2)}</strong>
      </p>
      <div className="my-5 flex flex-wrap gap-2">
        <Input className="w-28" type="number" step="0.01"
          placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input className="min-w-36 flex-1"
          placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button onClick={add}>Add</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Note</TableHead>
            <TableHead>Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.value.created_at}</TableCell>
              <TableCell>{r.value.category}</TableCell>
              <TableCell>{r.value.note}</TableCell>
              <TableCell>{currency} {r.value.amount.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  );
}
