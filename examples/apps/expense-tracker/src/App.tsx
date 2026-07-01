import { useEffect, useState } from "react";
import { db, store } from "@lodekit/sdk";

interface Expense {
  id: number;
  amount: number;
  category: string;
  note: string;
  created_at: string;
}

const CATEGORIES = ["Food", "Transport", "Bills", "Other"];

export default function App() {
  const [rows, setRows] = useState<Expense[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [note, setNote] = useState("");

  async function load() {
    await db.exec(
      "CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY, amount REAL, category TEXT, note TEXT, created_at TEXT)"
    );
    if ((await store.get("currency")) === null) await store.set("currency", "USD");
    setCurrency((await store.get<string>("currency")) ?? "USD");
    setRows(await db.query<Expense>("SELECT * FROM expenses ORDER BY id DESC"));
  }

  useEffect(() => {
    void load();
  }, []);

  async function add() {
    const value = parseFloat(amount);
    if (!value) return;
    await db.exec(
      "INSERT INTO expenses (amount, category, note, created_at) VALUES (?,?,?,?)",
      [value, category, note, new Date().toISOString().slice(0, 10)]
    );
    setAmount("");
    setNote("");
    await load();
  }

  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Expense Tracker</h1>
      <p className="text-gray-500">
        Total: <strong>{currency} {total.toFixed(2)}</strong>
      </p>
      <div className="my-5 flex flex-wrap gap-2">
        <input className="w-28 rounded border border-gray-300 px-2 py-1" type="number" step="0.01"
          placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select className="rounded border border-gray-300 px-2 py-1" value={category}
          onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input className="min-w-36 flex-1 rounded border border-gray-300 px-2 py-1"
          placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="rounded bg-zinc-900 px-4 py-1 text-white" onClick={add}>Add</button>
      </div>
      <table className="w-full text-left text-sm">
        <thead><tr className="text-gray-500"><th>Date</th><th>Category</th><th>Note</th><th>Amount</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-gray-100">
              <td>{r.created_at}</td><td>{r.category}</td><td>{r.note}</td>
              <td>{currency} {r.amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
