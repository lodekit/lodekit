# Sources ledger

The process skills under `.agents/skills/lk-*` are either vendored — copied from an
upstream at a pinned commit, then adapted and owned — or ours. The design is
`docs/specs/2026-08-31-dev-flow-v4-design.md`. Resyncs are deliberate: on a relevant
upstream release or roughly quarterly, one PR each — diff pinned → latest per the Map,
port what is wanted, re-apply the Adaptation rules, update this ledger.

## Sources

| Source | Pinned | Vendored | Provides |
|---|---|---|---|
| github.com/obra/superpowers | v6.3.0 (`b36e0829c6d0140e93cfef2ca599b1b07d4a7797`) | 2026-08-31 | lk-specify, lk-plan, lk-implement, lk-debug, lk-implement-test |
| github.com/pcvelz/superpowers | per-commit citations in Divergences | 2026-08-31 | two ideas only: the "Decisions already made" plan header; bounded parallel dispatch |

## Map

One row per vendored file: ours → the upstream path (under `skills/`) a resync diffs
it against.

| Ours (`.agents/skills/`) | Upstream (`skills/`) |
|---|---|
| `lk-specify/SKILL.md` | `brainstorming/SKILL.md` |
| `lk-specify/spec-document-reviewer-prompt.md` | `brainstorming/spec-document-reviewer-prompt.md` |
| `lk-plan/SKILL.md` | `writing-plans/SKILL.md` |
| `lk-plan/plan-document-reviewer-prompt.md` | `writing-plans/plan-document-reviewer-prompt.md` |
| `lk-implement/SKILL.md` | `subagent-driven-development/SKILL.md` |
| `lk-implement/implementer-prompt.md` | `subagent-driven-development/implementer-prompt.md` |
| `lk-implement/task-reviewer-prompt.md` | `subagent-driven-development/task-reviewer-prompt.md` |
| `lk-implement/re-review-prompt.md` | `subagent-driven-development/re-review-prompt.md` |
| `lk-implement/scripts/sdd-workspace` | `subagent-driven-development/scripts/sdd-workspace` |
| `lk-implement/scripts/task-brief` | `subagent-driven-development/scripts/task-brief` |
| `lk-implement/scripts/review-package` | `subagent-driven-development/scripts/review-package` |
| `lk-debug/SKILL.md` | `systematic-debugging/SKILL.md` |
| `lk-debug/root-cause-tracing.md` | `systematic-debugging/root-cause-tracing.md` |
| `lk-debug/condition-based-waiting.md` | `systematic-debugging/condition-based-waiting.md` |
| `lk-implement-test/SKILL.md` | `test-driven-development/writing-good-tests.md` |

## Adaptation rules

Applied on vendoring and on every resync; each application is recorded under
Divergences.

- Plain statements with their reasons. No `<EXTREMELY-IMPORTANT>` or `<HARD-GATE>`
  blocks, no iron laws, no Red-Flags or Rationalization tables, no "announce the
  skill" mandates, no flowcharts for judgment work (a digraph may stay where it
  encodes a real state machine).
- "The person", never "your human partner".
- House paths (`docs/specs/`, `docs/plans/`, `.agents/internal/`), house tools (pnpm,
  `gh`, vitest), PR-only branching, our lane names (question / research / small
  change / bug / feature), no `superpowers:` namespace, no upstream skill names in a
  skill body (this file is the one place they appear).
- Frontmatter: `name` equals the directory name; `description` says which phase or
  procedure the skill carries and when to load it, two sentences at most.
- Prose wraps at ~90 columns. Word targets per file are in the vendoring plan and
  restated in the Divergences entry that trimmed the file.
- No machine-local paths anywhere; placeholders for machine-local inputs.

## Divergences

One bullet per change class: what was dropped and why (citing the spec decision),
what was added and why, path and register changes.

### lk-specify

### lk-plan

### lk-implement

### lk-debug

### lk-implement-test

## Ours

- `lk-release`, `lk-drain` — house-owned, no upstream; extracted from AGENTS.md
  §Release and §Track (Drain) on 2026-08-31 (spec D16).
