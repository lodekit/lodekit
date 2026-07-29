# Changelog buffer

Unreleased, user-facing changes. A slice that ships something a Lodekit user can see or
do appends an entry here, in the same PR as the code; `/release` drains this file into
the docs changelog page (`web/docs/src/content/docs/changelog.md`) and resets it.

Rules:

- **Append-only for agents** — never reword or remove existing entries; editorial
  cuts and rewording happen in the release PR review.
- **Write for a person using Lodekit** — what they can do now, never how it was built.
  One entry per product change, `**Bold name** — description` shape.
- **Internal work appends nothing** — refactors, docs, bookkeeping, and tooling stay
  out; user-noticeable fixes go under `## Fixed`.
- Keep the `## New` / `## Fixed` headings; the drain lifts them verbatim. Omitting an
  empty section is fine.

---

## New

- **A new look: the Sky in a Jar** — Lodekit's woodblock-print identity lands across
  the dashboard and every app: plum ink on aged parchment by day, pale gold on deep
  indigo by night, a persimmon accent reserved for actions (gold by night), and a
  mono voice for ids and data. Themes gain a third font slot (`--font-mono`),
  editable in the theme editor.

- **Charts and data tables** — the UI library gains charts (recharts via the stock
  shadcn chart port, themed by the `--chart-*` tokens) and a reusable data table
  (`useDataTable` + `DataTable`: sorting, filtering, pagination — client-side or
  server-driven). The Greenhouse Almanac shows both: a Sky Journal temperature chart
  and a sortable care-history table.

- **Data explorer.** The dashboard's Data page is now a real explorer: pick an
  app and browse its tables (filter, multi-column sort, search, paging),
  key-value entries, files, and events — read-only, with storage insights and
  recent activity on the overview.

- **Events say who did what** — every event names its app, the platform member that
  emitted it (engine / service / app + component), and a past-tense fact type
  (`key-set`, `run-failed`, `build-ready`) — visible in the dashboard Events view,
  the SDK (`events.watch` can filter by component), and the `lodekit_events` MCP tool.

- **Switchable themes, served live.** Drop self-contained theme files in
  `<root>/themes/` and pick which one applies globally or per app via
  `themes/config.json` — the runtime serves the resolved theme at
  `/_ui/theme.css` and swaps it live when you switch, with no rebuild. **Break:**
  the old `<root>/theme.css` and `apps/<id>/theme.css` override files are no
  longer read (a startup warning points you to `themes/`); move their token
  overrides into a `themes/<name>.css` file. Apps scaffolded before this release
  need the one-line theme `<link>` (`{ rel: "stylesheet", href:
  "/_ui/theme.css?app=<id>" }`) added to their `__root.tsx` `head().links` to
  follow theme switching.

- **Five themes in the box.** Alongside the Lodekit default, the runtime now
  ships four faithful ports — Dracula, Catppuccin, Nord, and Rosé Pine — each
  with a light and dark mode. Select one globally or per app via
  `themes/config.json`, no files to write. A theme can also switch the whole
  UI's icon set: Nord uses Tabler and Rosé Pine uses Phosphor, while the rest
  stay on Lucide.

- **Events explorer** — the dashboard Events view can now filter by app, kind (engine / services / apps), component, event type, and date range, with a live filtered count and time histogram.

- **Theme library in the dashboard.** The dashboard's Themes page shows every
  installed theme as a card — its palette swatches and a light/dark preview,
  parsed from the theme itself. Switch a theme on everywhere, assign one to a
  specific app (with inline unassign), and duplicate, rename, or delete your own
  themes — all applied live, no rebuild.

- **Theme editor in the dashboard.** Open any theme from the library to edit its
  colors, typography, icon set, corner radius, and density with a live preview —
  a components canvas that restyles as you tweak, plus a real-app tab that renders
  one of your apps in an iframe following your unsaved edits. Vendored themes are
  read-only; duplicate one to get an editable copy. Saving applies the theme
  everywhere live, and unsaved edits are guarded when you navigate away.

- **Favicons** — browser tabs now show your chosen menubar icon on the
  dashboard (and anywhere without its own icon), and each app's emoji on that
  app's pages. Changing the menubar icon in Settings updates open tabs live.

- **Safer gateways** — gateways can only reach public hosts by default; a
  gateway that targets your own network (a local Home Assistant, a LAN device)
  opts in with `"local_network": true`, and a person-supplied base URL can be
  pinned to specific hosts with `allowed_hosts`. Requests to internal addresses
  are refused with a clear message.

## Fixed

- **kv-store error statuses** — internal faults in the kv API now return 500
  instead of masquerading as 400; bad requests (invalid keys, `incr` on a
  non-number, malformed JSON) still return 400.

- **Deleting an app stops its scheduled tasks immediately** — the task engine
  used to keep materializing a deleted app's schedule runs (and emitting their
  events) until the next restart.

- **Oversized requests to apps are refused** — a request body over 5 MB sent to
  an app page or server function now gets a 413 instead of being buffered
  without limit.

- **Apps get a real not-found page** — newly scaffolded apps (and Welcome and
  Greenhouse) now render a styled 404 with a link back home instead of a bare
  "Not Found" fallback.

- **Jar-cloud icons regenerated** — small rendering artifacts fixed in the menubar icons, dashboard logo, and favicons.

- **Menubar icon follows the style setting live** — changing the icon style in the
  dashboard now restyles the menubar icon immediately; it used to take a manager
  restart.
