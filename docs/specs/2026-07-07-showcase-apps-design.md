# Showcase apps (Greenhouse & Welcome) — design

**Date:** 2026-07-07
**Status:** Draft, pending review
**Role:** Replaces the two example apps (habit-tracker, expense-tracker) with two apps that
have real jobs: **Greenhouse**, the SDK showcase and permanent smoke-testing ground, and
**Welcome to Lodekit**, a minimal second app that keeps the checked-in root exercising
multi-app hosting and reserves the slot for the future guided FTUX. Renames `examples/`
to **`root/`** — the directory *is* the shipped Lodekit root. Supersedes
`2026-06-30-habit-tracker-design.md`. Coordinates with the in-flight events slice
(`docs/specs/2026-07-07-events-design.md`, `stack` branch) — see §5 and §12.

## 1. Purpose and policy

The example apps have outgrown "proof the host works." This slice gives them three jobs:

1. **Showcase** — a genuinely friendly personal tool that demonstrates what a Lodekit app
   can be, shipped with the manager so a first-run user lands in a living app (§10).
2. **Smoke ground** — the app exercises the SDK end-to-end against a real UI. The
   **definition-of-done convention**: a new SDK/runtime capability is not done until
   Greenhouse exercises it. The coverage matrix (§11) is the living checklist, kept at
   `root/readme.md`.
3. **FTUX seed** — Welcome is deliberately tiny now; it grows into the guided first-time
   experience later (roadmap).

**Coverage policy (decided in review):** *every method, even if visible seams.* Every SDK
method gets a home — natural where possible, and where no natural feature exists, a
tucked-away utilities page (the Potting Shed, §7) plainly exercises the leftovers. A
regression in a long-tail method must not ship silently.

## 2. Greenhouse — concept

**Greenhouse** (appId `greenhouse`, icon 🪴): a houseplant conservatory where plants are
characters. Each plant has a name, species, photo timeline, care journal, and a **mood
derived deterministically from care state** — "Fernando is parched (last watered 9 days
ago)", "Priya is thriving — 12-day streak." Tone: warm, lightly playful copy; clean and
precise UI (personality lives in the content, not gimmicks). The domain makes every
service native: scheduled care is real background work (tasks), photo timelines are real
binary storage (files), care state and journals are real structured state (kv), and "what
happened while I was away" is the event bus's flagship trick (events). The integrations
runway is the best of the candidates considered: weather (skip watering when humid),
email digests, calendar — each future service gets an obvious chapter here.

Care model: per-plant care kinds — **water** and **feed** for every plant, **mist**
optional per species. Each kind has an interval (`every: "3d"`-style, stored per plant).
Care actions from the UI record the care, bump streaks, reschedule the reminder, and emit
an event. Moods map from the worst overdue kind: thriving → content → thirsty/hungry →
parched → wilting (very overdue, also a `warn` log from rounds).

## 3. Domain model (kv)

- `kv.collection("plants")` — the plant records: `{name, species, icon, adoptedAt,
  personality, care: {water: {every}, feed: {every}, mist?: {every}}}`. Collection CRUD
  is the plant CRUD (adopt / edit / let go).
- `state:<plantId>` — care state per kind: `{water: {lastAt, dueAt, reminderRunId?},
  feed: {...}, mist?: {...}}`. Written by care actions and tasks; read everywhere.
- `streak:<plantId>` — consecutive on-time care count via `kv.incr`; reset (`kv.set` 0)
  when rounds finds the plant overdue. `count:<kind>:<plantId>` — lifetime counters,
  also `incr`.
- `journal:<plantId>:<ts>` — journal entries (care notes, milestones), listed with
  `kv.list({prefix, cursor})` — the paginated read.
- `snooze:<plantId>` — set with **`ttl`**; while present the due badge hides. Expiry
  brings the reminder back with zero app code (the TTL sweep emits the change).
  "Unsnooze" is `kv.del`.
- `seeded` — flag checked with `kv.has` on the index loader (§8).
- `feed:last-seen` — the highest event offset the person has seen; powers While You Were
  Away (§5).
- Dashboard reads fan in with `kv.getMany` (all plants' states in one call); seeding
  writes with `kv.setMany`.

## 4. Background work (tasks)

Three task definitions in `src/tasks.ts`, deliberately spreading the `task()` config
surface (`cron` vs `every`, `catchUp` string vs `true`, explicit `retries`/`timeout`):

- **`morning_rounds`** — `cron: "0 9 * * *"`, `catchUp: true`. Walks all plants,
  recomputes due/overdue into `state:*`, resets broken streaks, `warn`-logs wilting
  plants, emits one `care-due` event per newly due plant and a `rounds-completed`
  summary. `catchUp: true` is the honest laptop demo: close the lid for a weekend and
  rounds catches up (coalesced) on wake.
- **`care_reminder`** — no schedule; enqueued dynamically. Giving care enqueues
  `tasks.enqueue("care_reminder", {plantId, kind}, {at: dueAt, dedupeKey:
  "<plantId>:<kind>"})` — dedupe coalesces double-clicks by construction. The run
  re-reads state (the plant may have been watered meanwhile), marks due, emits
  `care-due`. "Skip next" is `tasks.cancel(reminderRunId)`; "remind me in an hour"
  re-enqueues with `delay: "1h"`. Re-caring cancels the stale queued run and enqueues
  the next one.
- **`weekly_gazette`** — `cron: "0 18 * * 0"` (Sunday evening), `catchUp: "24h"`, `retries: 1`,
  `timeout: "1m"`. Composes the week's issue — care given, streaks, mood changes — by
  reading the app's own event stream (**server-side `events.list`**), writes markdown
  via **server-side `files.put`** to `gazette-<iso-week>`, emits `gazette-published`.
  Tasks writing files and reading events proves the SDK is the same on both sides of
  the wire.
- **`compost_sweep`** — `every: "12h"` (the `every` variant). Housekeeping: prunes
  `archive-` photos older than 90 days and trims each plant's journal beyond 200 entries
  (server-side `files.list`/`files.delete`, `kv.list`/`kv.del`), `debug`-logging what it
  swept.

The Almanac page (§7) surfaces `tasks.runs` (state/task filter chips — including
`source: manual` runs triggered from the dashboard's Run now), `tasks.list` (registered
tasks, schedules, `nextRun`, `lastRun`), and `tasks.watch` (live "rounds in progress…"
indicator).

## 5. Events

Greenhouse targets the post-events SDK (`docs/specs/2026-07-07-events-design.md`): one
watch surface (`events.watch`), `kv.watch`/`files.watch` gone.

**Emits** (ns = source = `greenhouse`): `plant-adopted`, `plant-departed`, `care-given
{plantId, kind}` (client-side `events.emit` from the action handlers), `care-due
{plantId, kind}` (emitted with a per-emission **`ttl`** — noisy and short-lived),
`rounds-completed {due, total}`, `gazette-published {slug}` (server-side emits from
tasks).

**Consumes:**

- **The Ledger** (Almanac tab) — the app's activity feed: backfill with
  `events.list({before, limit})` (newest-first pagination), live-tail with
  `events.watch({type: [...]}, cb)` (the array-filter variant). Rows render the envelope
  — including `_platform`-sourced lifecycle events in the app's own namespace.
- **While You Were Away** — the flagship offset demo, pairing with `catchUp`: the index
  loader reads `feed:last-seen`, replays `events.list({after})`, and renders a digest
  banner ("While you were away: rounds ran twice, Fernando hit parched, the Gazette
  published"), then advances the offset.
- **Live UI** — `events.watch({type: "kv-store-change"})` invalidates plant queries;
  `{type: "file-store-change"}` refreshes photo timelines. This is exactly the
  migration pattern the events spec documents; the skill can point at Greenhouse as the
  reference implementation.

**Sequencing:** events is specced on `stack`, awaiting review. Preferred order: events
lands first, Greenhouse builds against it. If Greenhouse must build first, it launches on
`kv.watch`/`files.watch` without the Ledger/While-You-Were-Away features, and the events
plan's "migrate the example app" step targets Greenhouse (richer than the three-line
expense-tracker migration the events spec estimates — budget accordingly).

## 6. Photos and files

Slug layout (file-store slugs are `^[a-z0-9-]{1,128}$` — no path separators; "folders"
are dash prefixes): `photo-<plantId>-<ts>` (upload with `title` = caption and `metadata:
{plantId}`, explicit `contentType`), `cover-<plantId>` (**`files.copy`** — "set as cover
photo"), `archive-<plantId>-<ts>` (**`files.move`** — archive a photo out of the
timeline), `gazette-<iso-week>` (task-written markdown, §4), `snapshot-<ts>` — the
"share a snapshot" action exports the conservatory as JSON with a **`ttl`** (a
self-expiring file) and offers `files.url(slug, {download: true})`. Timelines read with
`files.list({prefix, limit, cursor})` ("load more"); the photo detail sheet shows
`files.stat` (size, contentType, uploadedAt); delete is `files.delete`; display URLs come
from `files.url`.

## 7. Pages

Five routes (multi-route apps are themselves host coverage — deep links, shared layout):

1. **Conservatory** (`/`) — plant card grid: cover photo, mood, due badges, streak; the
   While You Were Away banner; adopt-a-plant flow. Live via the event watches.
2. **Plant** (`/plants/$plantId`) — photo timeline (upload / cover / archive / delete),
   journal (paginated, add entries), care actions (water / feed / mist), snooze /
   remind-me-later / skip-next, care-schedule editing, let-go (remove).
3. **Almanac** (`/almanac`) — care history (`tasks.runs` with filter chips), upcoming
   care (queued runs + `nextRun`), and the Ledger tab (§5).
4. **Gazette** (`/gazette`) — issue list from `files.list({prefix: "gazette-"})`,
   rendered markdown, download link.
5. **The Potting Shed** (`/shed`) — the honest seams page, utility styled in-fiction:
   reseed / reset-conservatory, the registered-task manifest, a log-level demo row
   (emit `debug`/`info`/`warn`/`error` with fields), and an "SDK exercises" corner
   reserved for any method that loses its natural home as the SDK evolves (empty at
   launch — §11 shows every method currently housed).

Styling: `@lodekit/ui` components and `theme.css` conventions throughout — the showcase
is also the theming reference. `logs` usage is woven through: `info` on care actions and
seeding, `warn` on wilting, `error` on failed uploads/exports, `debug` in task internals.

## 8. Seeding — first open

The index loader checks `kv.has("seeded")`; if absent it seeds inline (server-side, so
seeding itself is SDK exercise): four plants with personalities — e.g. Fernando
(fiddle-leaf fig, dramatic), Doris (cactus, unbothered), Priya (pothos, overachiever),
Bartholomew (fern, anxious) — with deterministic generated SVG portraits (`files.put`
with string bodies, no binary assets in the repo, no network), backdated journals and
counters (`kv.setMany`, `kv.incr`), care state with staggered due times (one plant due
soon, one snoozed, one thriving), enqueued reminders, and `plant-adopted` events. The
person lands in a living conservatory — tasks queued, streaks ticking — and can let the
demo plants go when real ones arrive. Reset-and-reseed lives in the Potting Shed
(cancel queued runs, delete files and keys, reseed).

## 9. Welcome to Lodekit

appId `welcome`, icon 👋, name "Welcome to Lodekit." One route: what Lodekit is, the
root/apps/data layout, the dashboard, and the build-with-your-agent loop — plus exactly
one live element, a `kv.incr` visit counter, proving it's a real running app rather than
a static page. Deliberately no further SDK use: Greenhouse owns coverage; Welcome owns
orientation. Its future as the guided FTUX (teaching the high-level concepts
interactively) goes on the roadmap. Second job: keeps `root/` a two-app root, so
multi-app hosting (per-app workers, data isolation, the dashboard app list) stays
manually smoke-testable.

## 10. Shipping with the manager

Today the packaged manager creates an **empty** root on first run (`main.js` already
computes `isFirstRun`). This slice makes first run land in a living app:

- `scripts/prepare-bundle.mjs` copies `root/apps/` into the payload
  (`Resources/platform/root/`) — the checked-in `root/` *is* the shipped root.
- On first run only (root directory absent), after creating `apps/` + `data/`, the
  manager copies the showcase apps in. Never on later launches — a person deleting or
  editing them is final; updates never clobber a person's copy (an "update showcase"
  story is a roadmap item alongside auto-update).
- **Deleting the showcase apps must leave a working empty platform** — the person is
  free to let them go, and an empty root (no apps) is a supported state: the dashboard
  renders its empty app list, the runtime stays healthy, nothing references the apps by
  id. No showcase app may become load-bearing.
- `data/` starts empty; the apps self-seed (§8), so no databases ship in the bundle.

Dev mode is unchanged in behavior: `root/` (renamed from `examples/`) is the dev
Lodekit root, same two apps. The rename touches the root `package.json` dev script,
`manager/src/paths.js`, the runtime e2e test paths, `CLAUDE.md`, and the pnpm-workspace
note that the directory is not a workspace member.

## 11. SDK coverage matrix

The living checklist (maintained at `root/readme.md`; this table is the launch
snapshot). *Every row must name a real feature; "Potting Shed corner" is the escape
hatch, empty at launch.*

| Surface | Home in Greenhouse |
| --- | --- |
| `kv.get` / `set` / `del` / `has` | care state, settings, snooze clear, seed flag |
| `kv.set {ttl}` | snooze (expiry = reminder returns) |
| `kv.incr` | streaks, lifetime care counters |
| `kv.getMany` | conservatory grid state fan-in |
| `kv.setMany` | seeding |
| `kv.list {prefix, cursor}` | journal pagination; compost sweep |
| `kv.collection` (all 5 ops) | plant records CRUD |
| `files.put {title, metadata, contentType}` | photo upload with caption |
| `files.put {ttl}` | self-expiring snapshot export |
| `files.put` (server-side) | gazette issues from the weekly task |
| `files.get` / `url` / `url {download}` / `stat` / `delete` | photo display & management, export download |
| `files.list {prefix, cursor}` | timeline "load more", gazette index, compost sweep |
| `files.copy` | set cover photo |
| `files.move` | archive photo |
| `tasks.enqueue {at, dedupeKey}` | care reminders |
| `tasks.enqueue {delay}` | remind me in an hour |
| `tasks.cancel` | skip next watering |
| `tasks.runs {task, state, limit}` | Almanac care history |
| `tasks.list` | Almanac + Potting Shed task manifest |
| `tasks.watch` | live rounds indicator |
| `task() cron` + `catchUp: true` | morning_rounds |
| `task() cron` + `catchUp: "24h"` + `retries`/`timeout` | weekly_gazette |
| `task() every` | compost_sweep |
| `events.emit` (client) | care-given, plant-adopted/departed |
| `events.emit` (server) + `{ttl}` | care-due, rounds-completed, gazette-published |
| `events.list {before, limit}` | the Ledger backfill |
| `events.list {after}` | While You Were Away |
| `events.list` (server-side, `{type}`) | gazette composition |
| `events.watch {type}` (string and array) | live UI invalidation; Ledger tail |
| `logs.debug` / `info` / `warn` / `error` | task internals / care & seed / wilting / failures + Shed demo row |
| `appId` export, `@lodekit/ui`, `theme.css` | throughout |

Welcome adds nothing to the matrix by design (`kv.incr` only).

## 12. Testing

- `packages/runtime/tests/e2e.test.ts` migrates: copy `greenhouse` + `welcome` into the
  temp root, wait ready, assert SSR with loader content, registry contains both, and a
  deep link (`/greenhouse/almanac`) works. This keeps multi-app + multi-route host
  coverage automated.
- One seeding smoke in the e2e: first fetch of `/greenhouse/` seeds; a follow-up scoped
  API read confirms `seeded` and a non-empty plant collection.
- Greenhouse is deliberately the *manual* smoke ground beyond that — the runtime's
  service test suites remain the automated safety net; the app must not become a second
  integration suite. `manager/smoke.md` steps that name habit-tracker update to the new
  apps.
- If events hasn't landed (§5 sequencing), the e2e migration ships without
  Ledger/While-You-Were-Away assertions and the events plan picks them up.

## 13. Docs and bookkeeping

- **Deletes:** `examples/apps/habit-tracker`, `examples/apps/expense-tracker` (their
  `data/` is gitignored — nothing else to remove); then `examples/` → `root/` (§10).
- **`root/readme.md`:** new — what the two apps are for, the DoD convention, the
  coverage matrix (§11) as the living checklist.
- **`CLAUDE.md`:** the examples bullet becomes the `root/` bullet (the checked-in
  Lodekit root: two showcase apps, their roles, shipped by the manager); add the DoD
  line: new SDK/runtime capability includes exercising it in Greenhouse.
- **`context.md`:** "Showcase app" term (Greenhouse — the SDK showcase and smoke ground,
  shipped with the manager) and "Welcome app" (orientation now, guided FTUX later).
- **`docs/specs/2026-06-30-habit-tracker-design.md`:** add a "Superseded by this spec"
  status line; the document stays as history.
- **Events spec/plan (`stack`):** its example-migration step retargets to whichever
  example apps exist when it lands (§5).
- **`roadmap.md`:** Welcome-as-guided-FTUX; showcase-update-on-manager-update (§10);
  integrations chapter for Greenhouse (weather-aware watering as the first integration
  demo when the integrations layer arrives).
