import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { kv, files } from "@lodekit/sdk";
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

// Server function: totals by category over the expenses collection (canonical pattern).
export const getSummary = createServerFn().handler(async () => {
  const rows = await expenses.all();
  const totals: Record<string, number> = {};
  for (const r of rows) totals[r.value.category] = (totals[r.value.category] ?? 0) + r.value.amount;
  return totals;
});

// Server function: renders the expenses to CSV in the file-store with a 7-day TTL.
// Derived slug ("Expenses 2026-07" -> "expenses-2026-07"); re-exports the same
// month become expenses-2026-07-2, -3, ... (derive-collision suffixing).
export const exportCsv = createServerFn().handler(async () => {
  const rows = await expenses.all();
  const month = new Date().toISOString().slice(0, 7);
  const lines = rows.map((r) =>
    [r.value.created_at, r.value.category, JSON.stringify(r.value.note ?? ""), r.value.amount].join(",")
  );
  return await files.put(["date,category,note,amount", ...lines].join("\n"), {
    title: `Expenses ${month}`,
    contentType: "text/csv",
    ttl: 7 * 24 * 3600,
  });
});

export const Route = createFileRoute("/")({
  loader: () => getSummary(),
  component: ExpenseTrackerPage,
});

function ExpenseTrackerPage() {
  const summary = Route.useLoaderData();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [note, setNote] = useState("");

  // Canonical live-data pattern: store change events invalidate queries; Query refetches.
  // useEffect (not module scope) keeps kv.watch off the SSR path — it's client-only.
  useEffect(
    () => kv.watch("", () => void queryClient.invalidateQueries({ queryKey: ["kv"] })),
    [queryClient]
  );

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

  const { data: exports = [] } = useQuery({
    queryKey: ["files", "exports"],
    queryFn: async () => (await files.list({ prefix: "expenses-" })).entries,
  });

  const runExport = useMutation({
    mutationFn: () => exportCsv(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["files"] }),
  });

  const total = rows.reduce((sum, r) => sum + r.value.amount, 0);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Expense Tracker</h1>
      <p className="text-muted-foreground">
        Total: <strong>{currency} {total.toFixed(2)}</strong>
      </p>
      <ul className="text-muted-foreground text-sm">
        {Object.entries(summary).map(([cat, amt]) => (
          <li key={cat}>{cat}: {currency} {amt.toFixed(2)}</li>
        ))}
      </ul>
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
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Exports</h2>
          <Button variant="outline" onClick={() => runExport.mutate()}>Export CSV</Button>
        </div>
        <ul className="text-muted-foreground mt-2 text-sm">
          {exports.map((f) => (
            <li key={f.slug}>
              <a className="underline" href={files.url(f.slug, { download: true })} download>
                {f.title ?? f.slug}
              </a>{" "}
              ({new Date(f.createdAt).toLocaleDateString()})
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
