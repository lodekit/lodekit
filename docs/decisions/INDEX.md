# Architecture Decision Records

ADRs are scarce and high-value — the three-gate (hard to reverse, surprising without
context, genuine trade-off) must hold. Format: `ADR-NNNN-<kebab-title>.md`.

| ADR | Title | Date |
|---|---|---|
| [ADR-0001](./ADR-0001-event-envelope-kind-component.md) | Event envelope addresses emitters as `kind` + `component`, retiring `source` | 2026-07-16 |
| [ADR-0002](./ADR-0002-fine-grained-event-fact-types.md) | Event types are fine-grained past-tense facts, not coarse change feeds | 2026-07-16 |
| [ADR-0003](./ADR-0003-events-stats-caller-bucketed-sparse.md) | Event stats are caller-bucketed and sparse; facet maps are complete | 2026-07-16 |
| [ADR-0004](./ADR-0004-pnpm-global-virtual-store-worktrees.md) | Worktree installs share one pnpm global virtual store | 2026-07-17 |
