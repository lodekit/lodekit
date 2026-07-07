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
| `kv.get` / `set` / `del` / `has` | care state, snooze clear, seed flag |
| `kv.set {ttl}` | snooze (expiry = reminder returns) |
| `kv.incr` | streaks, lifetime care counters, Welcome's visit counter |
| `kv.getMany` | conservatory grid state fan-in, snapshot export |
| `kv.setMany` | seeding |
| `kv.list {prefix, cursor}` | journal pagination; compost sweep; reset |
| `kv.collection` (all 5 ops) | plant records CRUD |
| `events.watch {type: "kv-store-change"}` | conservatory live refresh |
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
`events.list` (`before`/`after`/server-side), `events.watch` with a type array, the
Ledger, While You Were Away, and `weekly_gazette` (`cron` + `catchUp: "24h"` +
`retries`/`timeout`).
