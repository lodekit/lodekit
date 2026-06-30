function today() {
  return new Date().toISOString().slice(0, 10);
}

function dayOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Current streak: consecutive days with a check-in, counting back from today.
// If today isn't done yet, count back from yesterday so the streak isn't zeroed early.
function streak(days) {
  const set = new Set(days);
  let start = set.has(today()) ? 0 : -1;
  let count = 0;
  for (let n = start; ; n--) {
    if (set.has(dayOffset(n))) count++;
    else break;
  }
  return count;
}

async function init() {
  await lodekit.db.exec(
    "CREATE TABLE IF NOT EXISTS habits (id INTEGER PRIMARY KEY, name TEXT, icon TEXT, created_at TEXT)"
  );
  await lodekit.db.exec(
    "CREATE TABLE IF NOT EXISTS checkins (id INTEGER PRIMARY KEY, habit_id INTEGER, day TEXT, UNIQUE(habit_id, day))"
  );
  document.getElementById("add").addEventListener("click", addHabit);
  document.getElementById("name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addHabit();
  });
  await render();
}

async function addHabit() {
  const nameEl = document.getElementById("name");
  const iconEl = document.getElementById("icon");
  const name = nameEl.value.trim();
  if (!name) return;
  await lodekit.db.exec(
    "INSERT INTO habits (name, icon, created_at) VALUES (?,?,?)",
    [name, iconEl.value.trim() || "✅", today()]
  );
  nameEl.value = "";
  iconEl.value = "";
  await render();
}

async function toggle(habitId, done) {
  if (done) {
    await lodekit.db.exec("DELETE FROM checkins WHERE habit_id = ? AND day = ?", [habitId, today()]);
  } else {
    await lodekit.db.exec(
      "INSERT OR IGNORE INTO checkins (habit_id, day) VALUES (?,?)",
      [habitId, today()]
    );
  }
  await render();
}

async function render() {
  const habits = await lodekit.db.query("SELECT * FROM habits ORDER BY id ASC");
  const checkins = await lodekit.db.query("SELECT habit_id, day FROM checkins");

  const byHabit = {};
  for (const c of checkins) (byHabit[c.habit_id] ||= []).push(c.day);

  const t = today();
  const doneToday = habits.filter((h) => (byHabit[h.id] || []).includes(t)).length;
  document.getElementById("summary").textContent = habits.length
    ? `${doneToday} of ${habits.length} done today`
    : "No habits yet";

  const list = document.getElementById("list");
  if (!habits.length) {
    list.innerHTML = `<div class="lk-card"><p class="lk-muted">Add your first habit above to start a streak.</p></div>`;
    return;
  }

  list.innerHTML = habits
    .map((h) => {
      const days = byHabit[h.id] || [];
      const done = days.includes(t);
      const s = streak(days);
      return (
        `<div class="lk-card">` +
          `<div class="lk-row" style="justify-content:space-between; align-items:center;">` +
            `<div class="lk-row" style="align-items:center; gap:8px;">` +
              `<span style="font-size:22px">${escapeHtml(h.icon || "✅")}</span>` +
              `<div>` +
                `<div><strong>${escapeHtml(h.name)}</strong></div>` +
                `<div class="lk-muted">${s > 0 ? "🔥 " + s + (s === 1 ? " day" : " days") : "No streak yet"}</div>` +
              `</div>` +
            `</div>` +
            `<button class="lk-btn" data-id="${h.id}" data-done="${done ? 1 : 0}"` +
              `${done ? ' style="opacity:.6"' : ""}>${done ? "Undo" : "Done"}</button>` +
          `</div>` +
        `</div>`
      );
    })
    .join("");

  for (const btn of list.querySelectorAll("button[data-id]")) {
    btn.addEventListener("click", () =>
      toggle(Number(btn.dataset.id), btn.dataset.done === "1")
    );
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

init();
