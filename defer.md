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
