---
name: ponytail-debt
description: >
  Harvest every `ponytail:` anchor comment (each backed by a bead) in the
  codebase into a debt ledger, so the deliberate shortcuts and deferrals
  ponytail leaves behind get tracked instead of rotting into "later means
  never". Use when the user says "ponytail debt", "/ponytail-debt", "what did
  ponytail defer", "list the shortcuts", "ponytail ledger", or "what did we
  mark to do later". One-shot report, changes nothing.
---

Every deliberate ponytail shortcut is filed as a `ponytail`-labeled bead naming
its ceiling and upgrade path, anchored in code with a `// ponytail: <bead-id>`
(or `# ponytail: <bead-id>`) comment. This collects them into one ledger so a
deferral can't quietly become permanent.

## Harvest

The ledger lives in beads. Collect both sides and cross-check:

1. Beads: `bd list --label ponytail --status open --json`.
2. Anchors: `grep -rnE '(#|//) ?ponytail: ?[a-z]+-[a-z0-9]+' . --exclude-dir={node_modules,.git,dist,build}`.
3. Cross-check: a bead with no matching anchor → tag `no-anchor` (code moved or
   shortcut removed — probably closable); an anchor whose bead is missing/closed →
   tag `orphan-anchor` (comment should be deleted or the bead reopened).
4. A bead with no upgrade trigger in its body → tag `no-trigger` rot risk.

Report one row per marker grouped by file, then totals:
`<N> markers, <M> no-trigger, <K> orphans (either side).`

## Output

One row per marker, grouped by file:

`<file>:<line>, bead <id>. ceiling: <the limit named>. upgrade: <the trigger to revisit>. [tag: no-anchor|orphan-anchor|no-trigger]`

Ceiling and upgrade trigger live in the bead body, not the anchor comment —
pull them from the bead (`bd show <id>`). The anchor comment is only the
`<file>:<line>` → bead-id pointer. Want an owner per row too? add
`git blame -L<line>,<line>`.

End with `<N> markers, <M> no-trigger, <K> orphans (either side).` Nothing found: `No ponytail: debt. Clean ledger.`

## Boundaries

Reads and reports only, changes nothing. To persist it, ask and it writes the
ledger to a file (e.g. `PONYTAIL-DEBT.md`). One-shot. "stop ponytail-debt" or
"normal mode" to revert.
