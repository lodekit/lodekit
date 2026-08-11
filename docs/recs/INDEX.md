# Records

Why forks were taken. Two kinds share one flat directory and one number sequence,
`###-<kind>-<slug>.md`:

- **arch** — engineering decisions, ADR-shaped: dated, mostly immutable,
  superseded by a new record rather than edited. Remit is engineering broadly,
  not literally architecture — "adopt CI" qualifies.
- **feat** — living feature records, FDR-shaped: one per feature, rewritten in
  place so the record always describes the feature *today*. Never a changelog.

Cite records by stem (`recs/005-arch-engine-rename`) or shorthand in prose
(`005-arch`, `013-feat`).

## When to record

Record when a fork was taken: an alternative was seriously considered and
foreclosed, or the choice is one a future reader could not infer from the code.
Engineering-shaped → an arch record; feature-behavior-shaped → the feature's feat
record. **Do not record** quirks, how-tos, or research findings — environment
facts that change agent behavior go to AGENTS.md; everything else deliberately
has no memory home.

The check runs at gates that already exist — spec approval and PR assembly — as a
question the agent answers itself, never a prompt to the person. The record edit
ships in the same PR as the change (part of the Definition of Done); the
release-time records audit (AGENTS.md §Release) is the safety net. Update this
INDEX in the same PR as any record change.

A record is **not** a code walkthrough, a file index, or an implementation guide —
behavior and rationale only. If it names function signatures or schemas, pull back.

## Records

| # | Kind | Title | Status | Date / Last reviewed |
|---|------|-------|--------|----------------------|
| [001](001-arch-event-envelope-kind-component.md) | arch | Event envelope addresses emitters as `kind` + `component` | Accepted | 2026-07-16 |
| [002](002-arch-event-fact-types.md) | arch | Event types are fine-grained past-tense facts | Accepted | 2026-07-16 |
| [003](003-arch-event-stats-sparse.md) | arch | Event stats are caller-bucketed and sparse; facets complete | Accepted | 2026-07-16 |
| [004](004-arch-pnpm-global-virtual-store.md) | arch | Worktree installs share one pnpm global virtual store | Accepted | 2026-07-17 |
| [005](005-arch-engine-rename.md) | arch | Engine rename — "runtime" survivor policy, "executor" subsystems | Accepted | 2026-07-17 |
| [006](006-arch-font-mono-theme-token.md) | arch | `--font-mono` is a typed token of the canonical theme format | Accepted | 2026-07-19 |
| [007](007-arch-landing-cta-download-led.md) | arch | The landing CTA is download-led; email capture retired | Accepted | 2026-07-30 |
| [008](008-feat-dashboard.md) | feat | Dashboard | Active | 2026-08-11 |
| [009](009-feat-app-lifecycle.md) | feat | App Lifecycle | Active | 2026-08-11 |
| [010](010-feat-app-storage.md) | feat | App Storage | Active | 2026-08-11 |
| [011](011-feat-data-explorer.md) | feat | Data Explorer | Active | 2026-08-11 |
| [012](012-feat-settings.md) | feat | Settings | Active | 2026-08-11 |
| [013](013-feat-tasks.md) | feat | Tasks | Active | 2026-08-11 |
| [014](014-feat-gateways.md) | feat | Gateways | Active | 2026-08-11 |
| [015](015-feat-secret-store.md) | feat | Secret Store | Active | 2026-08-11 |
| [016](016-feat-themes.md) | feat | Themes | Active | 2026-08-11 |
| [017](017-feat-favicons.md) | feat | Per-app favicons | Active | 2026-08-11 |
| [018](018-feat-mcp-surface.md) | feat | MCP surface | Active | 2026-08-11 |
| [019](019-feat-logging-events.md) | feat | Logging & Events | Active | 2026-08-11 |

## Templates

### arch

```markdown
# NNN-arch: {Decision title}

**Date:** YYYY-MM-DD · **Status:** Accepted
**Spec:** docs/specs/... (when one applies)

## Context

The forces: what made a decision necessary, and what the live alternatives were.

## Decision

What was chosen, stated plainly.

## Rationale        <!-- optional; fold into Decision when short -->

## Consequences

What this binds, costs, or enables — including what a future change would take.
```

Statuses: `Accepted` · `Superseded by NNN` · `Partially superseded by NNN`.

### feat

```markdown
# NNN-feat: {Feature Name}

**Status:** Active · **Last reviewed:** YYYY-MM-DD

## Overview

One paragraph: what the feature is, who uses it, why it exists.

## Behavior

Bullets describing observable behavior. No implementation details.

## Design Decisions

### 1. {Short decision title}

**Decision:** What was chosen.
**Why:** The reasoning. Cite an arch rec or spec when one applies.
**Tradeoff:** What this costs.

## Related

- **Recs:** {records by stem}
- **Specs:** {the proposals that shaped it}

## Open Questions    <!-- optional; delete when empty -->
```

Statuses: `Active` · `Experimental` · `Retired` (kept only when the prior design
is worth remembering; usually delete instead). `Last reviewed` is stamped by
whichever PR or audit last verified the record against the code.
