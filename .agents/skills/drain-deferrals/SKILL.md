---
name: drain-deferrals
description: Drain deferred work from beads into GitHub issues. Use when the engineer asks to drain, triage, or review deferrals, or mentions the defer backlog. Pair-mode only — iterates with the engineer; never runs unattended.
---

# Drain deferrals

Deferrals are beads labeled `defer` (severity/confidence stamped, provenance in the
body). This skill moves them — deliberately, with the engineer — into GitHub issues,
which are the only durable human backlog.

**Announce at start:** "I'm using the drain-deferrals skill to move deferred beads
into GitHub issues."

**Guard:** requires the engineer present. In an auto session, stop: "drain-deferrals
is pair-only — re-run in a pair session."

Mechanics — field and option node IDs, the issue-type table, the sub-issue and
dependency endpoints — live in `references/github-backlog.md`. This file owns the
judgment.

## 1. Pre-flight

- `bd dolt pull`; if it brought changes, `bd recompute-blocked`.
- `gh auth status` succeeds.

## 2. Gather both sides

- **Beads:** `bd list --label defer --json`. Pass no `--status`: the default already
  excludes closed, and a `--status open` filter silently drops `in_progress` and
  `blocked` beads.
- **The existing backlog:** `gh issue list --state open --limit 100 --json number,title,issueType`.
  Pull the body of any issue whose title reads close to a bead. You need this in
  context *before* drafting anything — see §3.

Report both counts. If the queue is large (roughly 10+), agree a batch with the
engineer now (§8) rather than opening a session-long drain.

## 3. Triage against what exists

**The step that stops the backlog duplicating itself.** A bead is not automatically
an issue. Decide each one against what §2 gathered:

- **Already covered** — an open issue already says it. File nothing; close the bead
  in §7 with `drained to #N (existing)`. If a bead looks like work that already
  shipped, check `--state all` before assuming it is new.
- **Overlaps** — related but distinct. File it *and* record the relationship: a
  `blocked_by` dependency where there is genuine ordering, otherwise name the sibling
  issue in the body so GitHub cross-links both.
- **New** — no counterpart. File it.

Present the split before drafting. Never file a duplicate silently — if one is
wanted anyway, say so and link it.

## 4. Consolidate

Group the survivors by theme; propose merges and rewordings. Several small beads on
one surface usually make one good issue rather than four thin ones.

`bd duplicates` matches byte-identical content only, so it catches copy-paste
accidents and nothing else. Run it if you like, but it is not the dedup step — §3 is.

## 5. Draft and confirm

Per issue: an imperative title, and a body carrying the bead's provenance plus enough
evidence (file:line, command output, the reasoning) to act on it later without
re-deriving it.

**Type** — the full table is in the reference. `chore` for maintenance (CI,
dependencies, licensing, tooling, doc accuracy), which is where most deferrals land;
`bug` when something is broken or contradicts a claim the project makes; `feature`
for new user-visible capability; `track` only for an umbrella over other issues.

**The stamp maps onto the fields.** Every deferral carries `severity=… /
confidence=…`, so two of the three fields are already decided:

| Field | Source | Mapping |
|---|---|---|
| Priority | severity | high → `high`, medium → `medium`, low → `low`. Never `urgent`. |
| Definition | confidence | high → `defined`, medium → `partial`, low → `undefined` |
| Area | the tree the work lands in | — |

Deviate where the stamp is plainly stale, and say why. Confirm every draft with the
engineer; park or close-as-wontfix on their call.

## 6. File

Create with the type set at creation (REST shape in the reference), then set the
three fields. Throttle roughly 2s per issue — secondary rate limits bite. Project
membership is automatic; never add project items by hand.

If a batch yields roughly 6+ related issues, propose a **track**: one `track` issue
holding the batch structure, with the rest attached as sub-issues. A sub-issue has at
most one parent, so an issue already owned by another track can only be
cross-referenced from the body, not adopted.

## 7. Verify, then close

- **Read back what you filed** — type and fields on each issue, and the sub-issue
  count if a track was created. `setIssueFieldValue` can fail without failing the run,
  so an unverified drain may have left every field unset.
- `bd close <id> --reason "drained to <issue-url>"` per drained bead.
- `bd dolt push`.

## 8. Partial drains

A large queue drains in batches, not in one sitting. Scope a batch by theme or by
severity, with the engineer, and finish it.

A batch is done only when its issues are verified *and* its beads are closed and
pushed. Never leave issues filed with their beads still open — the work then exists
in two places and gets counted twice on the next drain.

Report: N drained, M closed as already-covered, K parked, the issue links, and what
remains for the next batch.
