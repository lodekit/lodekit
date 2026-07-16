---
name: drain-deferrals
description: Drain deferred work from beads into GitHub issues. Use when the engineer asks to drain, triage, or review deferrals, or mentions the defer backlog. Pair-mode only — iterates with the engineer; never runs unattended.
---

# Drain deferrals

Deferrals are beads labeled `defer` (severity/confidence stamped, provenance in the
body). This skill moves them — deliberately, with the engineer — into GitHub issues,
which are the only durable human backlog.

**Guard:** requires the engineer present. In an auto session, stop: "drain-deferrals
is pair-only — re-run in a pair session."

1. **Sync:** `bd dolt pull`; if it brought changes, `bd recompute-blocked`.
2. **Gather:** `bd list --label defer --status open --json`.
3. **Consolidate:** group related beads; check `bd duplicates`; propose merges and
   rewordings. Present a digest — counts, groups, one line per bead.
4. **Iterate:** per group, draft the issue (title, body with provenance links, labels)
   and confirm with the engineer. Park or close-as-wontfix on their call.
5. **File:** `gh issue create` per approved draft, then set backlog fields per
   `references/github-backlog.md` (project item + type / Area / Priority / Definition).
6. **Close drained beads:** `bd close <id> --reason "drained to <issue-url>"`.
7. **Push:** `bd dolt push`. Report: N drained, M parked, issue links.
