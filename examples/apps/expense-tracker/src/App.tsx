import { useEffect, useState } from "react";
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
  const [rows, setRows] = useState<{ id: number; value: Expense }[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [note, setNote] = useState("");

  async function load() {
    if ((await kv.get("currency")) === undefined) await kv.set("currency", "USD");
    setCurrency((await kv.get<string>("currency")) ?? "USD");
    setRows((await expenses.all()).reverse()); // newest first
  }

  useEffect(() => {
    void load();
  }, []);

  async function add() {
    const value = parseFloat(amount);
    if (!value) return;
    await expenses.add({
      amount: value,
      category,
      note,
      created_at: new Date().toISOString().slice(0, 10),
    });
    setAmount("");
    setNote("");
    await load();
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
