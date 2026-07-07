# Habit Tracker — Design

> **Superseded** by `2026-07-07-showcase-apps-design.md` — the example apps were replaced
> by the Greenhouse and Welcome showcase apps. Kept as history.

**Date:** 2026-06-30
**Status:** Approved, pre-implementation

## 1. Purpose

A Lodekit single-page app to track daily **binary** habits: add habits, check them
off for today, and see each habit's current streak. Built on the Lodekit app contract
(`window.lodekit` SQLite SDK + `lk-` design system), mirroring the expense-tracker demo.

## 2. Data model (per-app SQLite)

```sql
CREATE TABLE IF NOT EXISTS habits (
  id INTEGER PRIMARY KEY, name TEXT, icon TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY, habit_id INTEGER, day TEXT,
  UNIQUE(habit_id, day)
);
```

- One `checkins` row per habit per completed day. `day` is local `YYYY-MM-DD`.
- `UNIQUE(habit_id, day)` makes toggling idempotent (INSERT OR IGNORE / DELETE).
- No `lodekit.store` use — SQLite is the honest, sufficient model here.

## 3. UI (single page, `lk-` classes)

- **Header** — title + summary "N of M done today".
- **Add-habit row** — emoji input (optional) + name input + `lk-btn` "Add".
- **Today list** — one row per habit: icon, name, current streak (🔥 N), and a
  toggle button (Done / Undo). Toggling writes/deletes today's check-in and re-renders.
- **Empty state** — friendly prompt when no habits exist.

## 4. Streak logic

Current streak = consecutive days with a check-in counting back from today; if today is
not yet done, count back from yesterday (so an unfinished today doesn't zero the streak).
Computed in JS from the habit's `checkins` rows.

## 5. Scope (v1)

- **In:** add habit, toggle today, per-habit current streak, today summary.
- **Out (YAGNI):** delete/edit habit, weekly grid, reminders, per-habit targets.

## 6. Testing

The Lodekit server smoke test already covers the SDK round-trip. For this app: manual
end-to-end — add a habit, mark done, reload (persists), confirm streak increments.
