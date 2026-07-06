# Logging — Design

**Date:** 2026-07-06
**Status:** Draft, pending review
**Role:** Slice-spec for the platform's logging capability: structured logs from every
platform component and from apps, persisted with retention, queryable from the dashboard
and over MCP. Introduces the log-store service (catalog) and the platform **State**
storage concept, and makes the machine-local path convention canonical (macOS-native).

## 1. Goals & scope

Today the platform has no logging abstraction: three bare `console.*` calls in the
runtime, app-worker output pouring untagged into the runtime's stdout, and the manager
piping that combined stream into one flat `runtime.log`. Nothing is per-app, structured,
queryable, retained by policy, visible in the dashboard, or reachable by Claude. This
slice builds the whole vertical:

1. **Platform components log structurally** — host, watcher, build, scheduler, services,
   worker lifecycle — with defined levels.
2. **Apps emit logs** two ways: automatic capture of worker `console.*` output, and an
   explicit SDK `logs` handle (the log-store service).
3. **Both consumers are first-class**: a dashboard Logs view (global and per-app, live
   tail) and an MCP tool so Claude can read an app's logs while debugging it — the loop
   the product's core workflow currently lacks.

**Scope decisions made in review:**

- **Metrics are deferred, but the schema is designed for derivation.** Structured fields
  with conventional keys (`duration_ms`, `status`) mean request counts, error rates, and
  build times are later derivable with plain SQL — no schema change, no pipeline now.
  Roadmap entry.
- **Dedicated `logs.sqlite`, deliberately not generalized.** No shared `platform.sqlite`,
  no `getPlatformDb(name)` helper. Logs are the platform's noisiest tenant
  (append-heavy, delete-heavy); a dedicated file isolates writer contention and freelist
  bloat from anything precious that may exist later. Revisit generalization when a second
  platform-level store actually appears.
- **Zero dependencies.** The logger is ~100 lines over better-sqlite3, which is already
  the stack. pino's strengths (stdout JSON transports, serializers) don't match a
  direct-to-SQLite in-process sink, and its worker-thread transport model would fight the
  existing postMessage channel.

**Non-goals:** metrics (deferred as above); browser-side console capture (too invasive —
the SDK handle covers intentional client-side logging); retention values as dashboard
settings (constants now, roadmap); log write access over MCP.

## 2. Two-tier taxonomy

The design splits logging by what can observe it:

- **System stream** — the runtime *as a process*, in text, written from outside. The
  manager keeps piping the runtime child's stdout/stderr into
  `~/Library/Logs/Lodekit/runtime.log` exactly as today (`manager/src/logs.js` unchanged).
  What lands there: bootstrap lines before the log service exists, port-bind failures,
  top-level crashes, supervisor respawns. Deliberately minimal — a healthy day is a few
  lines. This tier exists because of the bootstrap/observer problem: the structured
  pipeline cannot record its own failure to start (ABI mismatch, unwritable state dir,
  corrupt DB).
- **Platform log** — the runtime *as a system*, structured, in `logs.sqlite`: everything
  observable once the runtime is up. Host requests, watcher events, build lifecycle,
  scheduler runs, service warnings, worker lifecycle, and all app output.

One stitch between tiers: the structured logger **tees error-level records to stderr**,
so even a failing SQLite sink leaves evidence in the system stream. Only errors cross
over, keeping `runtime.log` minimal.

## 3. Machine-local paths — macOS-native, made canonical

The repo currently has no single convention: the runtime is XDG-flavored
(`~/.cache/lodekit`) while the manager is macOS-native (`~/Library/Logs/Lodekit`,
Electron's Application Support). This slice picks **macOS-native** and refactors the
runtime to match. Rationale: Lodekit ships as a Mac menubar app to a Mac person; the OS
ecosystem cooperates with `~/Library` (Time Machine auto-excludes `~/Library/Caches`,
uninstallers and Console.app find app dirs by name) and ignores dotdirs; and XDG is a
freedesktop/Linux spec, not a cross-platform standard. A ~15-line `platformPaths()`
helper in `config.ts` resolves the dirs so a Linux/XDG branch is one function later, not
a migration.

| Dir | Path | Notes |
| --- | --- | --- |
| Cache | `~/Library/Caches/Lodekit` | **Moved** from `~/.cache/lodekit`; `LODEKIT_CACHE_DIR` override kept, so dev/tests are unaffected. Old dir is abandoned, not migrated — it is regenerable by definition. |
| State | `~/Library/Application Support/Lodekit` | **New**; holds `logs.sqlite`. `LODEKIT_STATE_DIR` override. |
| Text logs | `~/Library/Logs/Lodekit` | Manager-owned, unchanged. Rule: `Logs/` holds human-readable text streams; Application Support holds structured state. |

**New `context.md` storage term** (alongside Lodekit root / Apps tree / Data tree /
Backup tree / Cache):

> **State**:
> Machine-local operational data the platform keeps about itself — currently the logs
> database. Lives outside the Lodekit root (`~/Library/Application Support/Lodekit`,
> `LODEKIT_STATE_DIR`), never backed up. Unlike the Cache it isn't regenerable; unlike
> the Data tree it isn't precious — losing it costs history, never apps or data.
> _Avoid_: app data (that's the Data tree), cache, logs dir

Like the cache, the state DB is global across Lodekit roots: records carry `app_id`, and
a dev root (`./examples`) mingles with the real one unless `LODEKIT_STATE_DIR` is set —
the exact precedent the cache already established.

## 4. Data model

One table in a dedicated `logs.sqlite` (WAL). The `_lodekit_` table prefix is a per-app-DB
convention to avoid colliding with app tables; the platform owns this file, so the table
is plainly `logs`:

```sql
CREATE TABLE logs (
  id      INTEGER PRIMARY KEY,   -- rowid: cheap monotonic cursor for tail/pagination
  ts      INTEGER NOT NULL,      -- epoch ms
  level   INTEGER NOT NULL,      -- 10 debug / 20 info / 30 warn / 40 error
  source  TEXT NOT NULL,         -- emitter, see below
  app_id  TEXT,                  -- NULL = platform record
  message TEXT NOT NULL,
  fields  TEXT                   -- JSON object or NULL
);
CREATE INDEX logs_app   ON logs(app_id, id);
CREATE INDEX logs_level ON logs(level, id);
```

- **Levels** — `debug` / `info` / `warn` / `error`, platform-wide. Stored as pino-style
  numbers so `level >= 30` range queries work; the API speaks names. Four levels, no
  `trace`/`fatal`: fewer levels get used consistently, and a worker crash is an `error`
  record from the lifecycle source, not a fifth level. All levels are stored (no
  write-time gate — the cap bounds volume); filtering happens at query time.
- **Sources** — platform records name the subsystem (`host`, `watcher`, `build`,
  `scheduler`, `kv-store`, `file-store`, `lifecycle`); app records are `console`
  (captured) or `app` (explicit SDK call). Source + `app_id` distinguish every origin.
- **Fields** — optional structured extras. Conventional keys: `duration_ms`, `status`,
  `stack`. This is the metrics-ready surface.

## 5. Ingestion

All records flow through the host process; there is exactly one writer to `logs.sqlite`.

**Runtime logger** (`packages/runtime/src/logger.ts`): `createLogger(source)` returns
`{debug, info, warn, error}(message, fields?)`. Each call synchronously inserts via a
prepared statement, broadcasts a `log` SSE event (on the app's channel when `app_id` is
set; the global channel sees everything — existing `sse.ts` semantics), and tees `error`
records to stderr. The three existing bare `console.*` sites convert. Existing SSE
*state* broadcasts (`server-state`, build events) are untouched — state is not logs —
but state transitions also get logged, including the worker's fatal stack, which today
is lost when the exit handler overwrites it (closes that roadmap item as a side effect).

**Worker console capture** (`appWorkerEntry.mjs` + `appWorker.ts`): the worker entry
patches `console.debug/log/warn/error` (mapping `log`→info) and installs
`uncaughtException`/`unhandledRejection` handlers, sending
`{type: "log", level, message, fields}` over the existing postMessage protocol; the host
stamps `app_id` and writes. Zero-effort logs for any app code — including the dashboard
itself (`_dashboard` is an app worker too). Console arguments are formatted
`util.inspect`-style into `message`; an `Error` argument contributes `fields.stack`.

**SDK `logs` handle — the log-store service.** New catalog entry **log-store → `logs`**
(mapping table pattern: `file-store→files`, `secret-store→secrets`), following the
service conventions end-to-end: service module `services/log-store.ts` with
`CATALOG_NAME = "log-store"`, a chained Hono router mounted at
`/api/apps/:appId/log-store` in `routes.ts`, and the route type exported from the runtime
`package.json` (properly — unlike file-store, whose types the SDK currently
hand-duplicates). The handle is isomorphic: `logs.info(message, fields?)` (and `debug`/
`warn`/`error`) POSTs fire-and-forget — over loopback from server functions, over the
page origin from the browser. That last part is what console capture can't give:
first-class client-side logging.

**Host access logs:** app page and `_serverFn` requests are logged at `debug` from
`appHost.ts` (`method`, `path`, `status`, `duration_ms`, app-tagged). Scoped-API calls
are not logged per-request — services log their own warnings/errors.

## 6. Query surfaces

**HTTP.** Two read endpoints sharing query params — `level` (minimum, by name), `source`,
`before` (id cursor), `limit` (default 100, capped at 1000), `q` (substring match on
message) — returning newest-first:

- `GET /api/logs` — global: platform records and all apps. Dashboard- and MCP-facing.
- `GET /api/apps/:appId/log-store` — app-scoped; part of the service router.

**Dashboard.** A **Logs view** — the dashboard's second route. Live-following tail fed by
the already-wired `EventSource` (`log` events), backfilled by `GET /api/logs`; filter
chips for app (including "platform"), level, and free-text search; error rows expand to
show `fields`/stack. App cards on the home view link into the Logs view pre-filtered to
that app.

**MCP.** One new read-only tool, `lodekit_logs` (`appId?`, `level?`, `limit?`, `q?`),
calling `GET /api/logs` over HTTP like the existing tools. This is the debug loop: Claude
builds an app, the page errors, Claude reads that app's logs. The skill documentation
gains the corresponding "check the logs" guidance.

## 7. Retention & failure handling

A scheduler task (same pattern as the TTL sweeps, every 60s): delete records older than
**7 days**, then trim oldest-first beyond **200k rows** total. Time bounds staleness; the
cap bounds a runaway logger inside the window. Both are constants in this slice; the
roadmap notes they become dashboard settings later.

Logging never takes down its caller:

- Insert failures are caught, reported to stderr (the tee), and counted; never thrown
  into request handling.
- The SDK handle swallows network errors silently.
- If `logs.sqlite` cannot open at startup, the runtime still boots — logging degrades to
  stderr-only, with one system-stream line saying so.

## 8. Testing

Vitest in the runtime package: log-store service tests (insert, level filtering, cursor
pagination, `q`), retention sweep (time + cap), worker console-capture integration (spawn
a real worker, assert tagged records land), logger degradation with an unopenable DB, and
a `lodekit_logs` case in the runtime↔MCP integration test. Manager tests unchanged.

## 9. Docs & bookkeeping

- **`context.md`:** the State term (§3); Cache path amended; the log-store catalog entry
  and `log-store→logs` in the handle mapping; the level set.
- **`roadmap.md`:** retention values as settings; derived metrics from the log schema;
  close the "respawn loses fatal stack" item; note the abandoned `~/.cache/lodekit` dir.
- **Skill (`packages/skill`):** document the `logs` handle and the check-the-logs
  debugging step.
