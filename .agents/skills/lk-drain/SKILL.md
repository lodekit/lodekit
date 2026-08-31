---
name: lk-drain
description: Turns `docs/TODO.md`'s parked lines into GitHub issues and tracks, then opens the PR that deletes the drained lines. Runs when the person asks for a drain.
disable-model-invocation: true
---

# Drain

`docs/TODO.md` holds parked work: one line per item,
`- [YYYY-MM-DD · <provenance>] description`, appended in the same PR as the work that
dropped it. A drain happens periodically, when the person asks, and moves those lines
into the backlog, where they can be prioritized against everything else.

Start on a branch — the drain edits TODO.md and ends in a PR, like any other change.

## Group with the person

Read `docs/TODO.md` whole, then propose a grouping: themes that would each become a
track, and the lines that stand alone as single issues. Ask one structured question at a
time and let the person re-cut the grouping, drop lines, or keep lines parked. Their
themes win over yours — they know which of these they still intend to do.

A line the person keeps stays exactly as it is, untouched by the rest of this.

## File the issues

One issue per item, one track per theme, per `docs/TRACK.md` — it carries the mechanics
and this skill does not restate them: the four issue types (`bug`, `feature`, `chore`,
`track`), the three fields (Priority, never `urgent`; Area; Definition), the field and
option node IDs, the `setIssueFieldValue` mutation with its `fields[][subkey]` syntax
trap, sub-issue links from a track to its children, and the ~2s/issue throttle that
keeps GitHub's secondary rate limit quiet.

Titles are short and imperative. The body carries the TODO line's provenance verbatim —
its date and where it fell out (`spec:slug`, `PR #N`, `session`) — so the issue still
says who parked it and when, long after the line is gone. A leading `P0`/`P1` on the
line is the person's urgency marker; carry it into Priority.

Create the track first when a theme has one, so its children can be linked as they are
filed.

## Delete and open the PR

Delete each drained line from `docs/TODO.md`. Entries are single lines — which is what
keeps parallel-worktree merges on this file trivial — so the diff reads as one deleted
line per issue filed, and a reviewer can check the mapping by eye.

Open the PR with `--body-file`, then read the stored body back
(`gh pr view --json body`). The body lists every issue created — its number and the
TODO line it came from. That listing is the audit trail: paired with TODO.md's history
it shows when each deferral stopped being parked work and became backlog.

The person merges.
