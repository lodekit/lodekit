async function init() {
  await lodekit.db.exec(
    "CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY, amount REAL, category TEXT, note TEXT, created_at TEXT)"
  );
  if ((await lodekit.store.get("currency")) === null) {
    await lodekit.store.set("currency", "USD");
  }
  document.getElementById("add").addEventListener("click", addExpense);
  await render();
}

async function addExpense() {
  const amount = parseFloat(document.getElementById("amount").value);
  if (!amount) return;
  const category = document.getElementById("category").value;
  const note = document.getElementById("note").value;
  await lodekit.db.exec(
    "INSERT INTO expenses (amount, category, note, created_at) VALUES (?,?,?,?)",
    [amount, category, note, new Date().toISOString().slice(0, 10)]
  );
  document.getElementById("amount").value = "";
  document.getElementById("note").value = "";
  await render();
}

async function render() {
  const rows = await lodekit.db.query("SELECT * FROM expenses ORDER BY id DESC");
  const total = await lodekit.db.query("SELECT COALESCE(SUM(amount),0) AS t FROM expenses");
  const currency = (await lodekit.store.get("currency")) || "USD";
  document.getElementById("total").textContent = currency + " " + total[0].t.toFixed(2);
  document.getElementById("rows").innerHTML = rows
    .map(
      (r) =>
        "<tr><td>" + r.created_at + "</td><td>" + r.category + "</td><td>" +
        (r.note || "") + "</td><td>" + currency + " " + r.amount.toFixed(2) + "</td></tr>"
    )
    .join("");
}

init();
