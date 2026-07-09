# The Lodekit root

This directory is the checked-in Lodekit root: the runtime serves it in dev
(`LODEKIT_ROOT=./root`), and the packaged manager installs `apps/` into
`~/Documents/Lodekit/apps` on first run. Deleting any of these apps from your own root is
fine — an empty root is a fully supported state.

- **`apps/greenhouse`** — the showcase app and permanent smoke-testing ground: a houseplant
  conservatory where plants are characters. Spec:
  `docs/specs/2026-07-07-showcase-apps-design.md`.
- **`apps/welcome`** — orientation: what Lodekit is, plus one live element (a kv visit
  counter). Grows into the guided first-time experience later.
- **`theme.css`** — the root-level global theme example; `apps/greenhouse/theme.css` shows
  the per-app layer that wins over it.

## Definition of done

A new SDK or runtime capability is **not done** until Greenhouse exercises it. This table
is the living checklist — extend it with every new surface.

| Surface | Home in Greenhouse |
| --- | --- |
| `kv.get` / `set` / `del` / `has` | streak reset, snooze clear, seed flag |
| `kv.set {ttl}` | snooze (expiry = reminder returns) |
| `kv.incr` | streaks, Welcome's visit counter |
| `kv.getMany` | conservatory grid fan-in (streaks + snoozes) |
| `kv.list {prefix, cursor}` | reset sweep |
| `kv.collection` | **removed** — entities live in db-store now; the SDK keeps the API |
| `src/db.ts` schema + boot push | plants / care_rules / care_state / journal |
| `db.select` + joins | conservatory grid, morning rounds |
| aggregates (`count`, `groupBy`) | lifetime care counts, rounds total |
| `db.insert … returning` | adopt / seed |
| `onConflictDoUpdate` (upsert) | care state on give-care |
| `db.update` / `db.delete` | schedules, skip next, let go |
| FK `onDelete: "cascade"` | let go — rules/state/journal follow the plant |
| `db.batch` (transaction) | seeding a plant's dependents |
| `` sql`…` `` escape hatch | snapshot stats (`db.values`) |
| client-side `db` queries | journal add + load-more (browser) |
| `events.watch {type: array}` | conservatory refresh on `["db-store-change", "kv-store-change"]` |
| `files.put {title, metadata, contentType}` | photo upload with caption |
| `files.put {ttl}` | self-expiring snapshot export |
| `files.put` (server-side) | seeded SVG portraits |
| `files.url` / `url {download}` / `stat` / `delete` | photo display & management, export download |
| `files.get` | snapshot round-trip check (Potting Shed) |
| `files.list {prefix, cursor}` | timeline "load more", compost sweep, reset |
| `files.copy` | set cover photo |
| `files.move` | archive photo |
| `events.watch {type: "file-store-change"}` | photo timeline live refresh (slug filter in the callback) |
| `tasks.enqueue {at, dedupeKey}` | care reminders |
| `tasks.enqueue {delay}` | remind me in an hour |
| `tasks.cancel` | skip next / re-care / reset |
| `tasks.runs {task, state, limit}` | almanac care history |
| `tasks.list` | almanac rota |
| `events.watch {type: "tasks-change"}` | almanac live indicator |
| `task() cron` + `catchUp: true` | morning_rounds |
| `task() every` | compost_sweep |
| `logs.debug` / `info` / `warn` / `error` | compost sweep / care & seed / wilting & reset / upload failures + Shed demo row |
| `appId` export | Potting Shed's SDK exercises card |
| `@lodekit/ui`, `theme.css` | throughout |

**Pending (showcase Part 2, spec §5):** `events.emit` (client+server, `{ttl}`),
`events.list` (`before`/`after`/server-side), the Ledger, While You Were Away, and
`weekly_gazette` (`cron` + `catchUp: "24h"` + `retries`/`timeout`).

**Pending (settings slice, `2026-07-07-settings-design.md`):** `defineSettings()` in
`src/settings.ts` (all five field types have a plausible Greenhouse home) and the typed
`settings.get`/`all`/`watch` reads — landed in parallel with the showcase slice; needs a
Greenhouse chapter of its own.

**Pending (secret-store slice, `2026-07-07-secret-store-design.md` §11):** declare a
`weather_api_key` slot + linked server-side read — deferred to the Greenhouse
integrations chapter (roadmap.md).
