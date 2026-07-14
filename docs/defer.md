# Defer buffer

Transient buffer for work descoped or deferred during a session. Agents append entries
here; the person periodically drains them into GitHub issues and clears the file.

Rules:

- **Append-only for agents** — never reword, resolve, or remove existing entries; only
  the person's drain clears the file.
- **Group entries under a dated session header** naming the body of work that caused
  them (spec/plan/PR/branch), so provenance survives the drain.
- **Keep entries short** — what was cut, and why it was safe to cut. No priority/area
  classification here; that happens at drain time.
- **This file is not the backlog** — the backlog is GitHub issues.

Entry template:

```markdown
## YYYY-MM-DD — <slice name> (<spec/plan path or PR>)

- **<Item>** — what was cut, and why it was safe to cut.
```

---

## 2026-07-13 — docs content v1 (PR #70, docs/specs/2026-07-12-docs-content-v1-design.md)

- **Docs screenshots** — pages ship without screenshots; parked post-v0.1 until the
  dashboard UI settles, so they aren't retaken on every visual change.
- **context.md UI-catalog entry is stale** — it still describes `/_ui/` as a live
  statically built Storybook, but since the UI revamp the runtime redirects `/_ui/` to
  the dashboard's empty Themes stub (`server.ts`); the catalog's successor is the theme
  editor / component visualizer (issue #61). Reword the entry when that surface is
  designed (docs already say "coming soon").

## 2026-07-13 — release pipeline (PR #2, docs/specs/2026-07-10-release-pipeline-design.md)

Deferred cross-platform seams (spec §8) — originally roadmap bullets, redirected here in
the PR #2 rebase after roadmap.md's retirement. Each has a designed-in seam; all are
deliberate v1 deferrals, safe to cut because macOS (arm64 + x64) ships without them.

- **Linux support** — XDG path branches (runtime config comment marks the spot),
  hand-written `.desktop` autostart, full-color tray PNGs, AppImage + deb targets, an
  `ubuntu-22.04` release-matrix row; document AppIndicator/libfuse2 caveats.
- **Windows support** — `%APPDATA%` path branches, node.exe-at-dist-root layout,
  Node-native rewrite of the bundle script's shell-outs, stdin-close shutdown sentinel
  (no graceful SIGTERM on Windows), `.ico` tray icons, unsigned NSIS + SmartScreen
  click-through docs, MCP `openInBrowser` Windows fix, a `windows-latest` matrix row;
  Azure Trusted Signing (~$10/mo) as the signing toggle when adoption justifies it.
- **Update surfacing** — notify-only first (manager polls GitHub Releases, menubar hint
  + download link, a setting to silence it); `electron-updater` later — electron-builder's
  `latest*.yml` manifests make it additive; mac auto-update stays impossible until
  Developer ID signing exists.
- **Per-PR CI tests** — natural now that all changes land via PR; not part of the
  release-pipeline slice.
- **Flathub** — the eventual Linux store channel (after Linux support).

## 2026-07-14 — data explorer (spec docs/specs/2026-07-14-data-explorer-design.md, issue #60)

- Storage panel behind the "Soon" badge: persisted per-app storage metrics + models, trends over time.
- Data explorer events view: live tail (global /events page has it; explorer is refresh-only v1).
- Table browser: URL-persisted grid state (filters/sort/page survive reload/share).
- Files view: thumbnails/media previews.
- SQL editor (read-only query console) in the explorer.
- Summary recent-list ordering: a user table whose heuristic timestamp column mixes epoch-int and ISO-text encodings can mis-order its top-5 recent candidates (raw-value ORDER BY happens before parse; silent, narrow).
- Data explorer events view removed post-build (product consistency: the global dashboard Events page at /events is the one events explorer; its revamp is a future session). The `GET /api/events/history?source=` filter stays — generic event-store API the revamp will want for app-only filtering.
