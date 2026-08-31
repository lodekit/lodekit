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

- Dropped the three-path router (spike / bounded / architectural), its Red-Flags
  table, the per-path checklist variants, the process digraph, the HARD-GATE block,
  and the "Too Simple To Need Approval" section: lanes are chosen in AGENTS.md §Start,
  not in a skill (D12); gates and flowcharts for judgment work are out of register (D6).
- Dropped the Visual Companion section and every reference to its browser server
  (spec Non-goals: Artifacts and the Playwright MCP cover visual questions).
- Dropped the `elements-of-style` and writing-plans hand-offs and all "announce the
  path/skill" lines: AGENTS.md sequences the phases (D6, D12).
- Re-pathed `docs/superpowers/specs/` → `docs/specs/`; upstream's generic "design doc"
  became the house spec shape (Goals / Non-goals / Decision record / numbered sections
  / Rollout / Verification, ~90-column prose).
- Added: the Decision record rule (one entry per choice the person made, naming the
  alternative it foreclosed); scope that falls out → one `docs/TODO.md` line in the
  §Track format; the hand-off (commit, push, draft PR; approved before planning).
- Register: "your human partner" → "the person"; every rule carries its reason; the
  question protocol names the harness's structured question tool (AskUserQuestion).
- Kept in substance: explore first, decomposition check before detailed questions,
  purpose / constraints / success criteria, 2–3 approaches with YAGNI and a
  recommendation, sectioned design with approval per section, "design for isolation
  and clarity", "working in existing codebases", the four-item inline self-review.
- Word trim: SKILL.md 2,324 → 799. Reviewer prompt 235 → 220: content kept, re-pathed,
  prefaced as dispatch-on-request only (D13), redundant "Reviewer returns" trailer cut.

### lk-plan

- Dropped the "Bite-Sized Task Granularity" 2–5-minute step rule: tasks are sized for
  a subagent brief, not timed steps (spec §3; v3 D12 asks for context / files /
  acceptance / verify).
- Dropped the Execution Handoff section and its two-option menu, the
  using-git-worktrees reference, and the "REQUIRED SUB-SKILL" header line: AGENTS.md
  §Implement decides inline vs `lk-implement`, §End owns finishing (D3, D16). The
  header now reads "Executed inline or with `lk-implement` per AGENTS.md §Implement".
- Added the **Decisions already made** header block and the never-re-ask /
  never-recommend-against rule, cherry-picked from github.com/pcvelz/superpowers @
  `a98ceff` (2026-06-10) (D2).
- Added the per-task `**Review:** required — <reason>` line, present only for trust
  boundary / parser / auth / network egress / data loss tasks, with the reason it is
  not universal (D7/D8).
- Added the house plan lifecycle (`docs/plans/YYYY-MM-DD-<slug>.md`, spec named in the
  header, commit-push-tick, deleted before merge, pointer to `docs/plans/README.md`)
  and the portable-paths rule (`<worktree>` / `$SCRATCHPAD`, no machine-local paths).
- Paths and tools rehoused: `docs/superpowers/plans|specs/` → `docs/plans/`,
  `docs/specs/`; the pytest example → a `pnpm --filter @lodekit/engine test` /
  TypeScript one.
- Register per D6: plain statements each carrying its reason; no announce line, no
  MUST walls, no "your human partner", no `superpowers:` namespace.
- Reviewer prompt kept in substance, re-pathed, prefaced as dispatch-on-request only
  for a large plan (D13); 235 → 219 words.
- Word trim: SKILL.md 1,059 → 848.

### lk-implement

Scripts (`scripts/sdd-workspace`, `task-brief`, `review-package`):

- The plan workspace resolves to `.agents/internal/sdd/<plan-basename>/`, not
  upstream's `.superpowers/sdd/` (spec D10).
- Dropped `sdd-workspace`'s self-ignoring `.gitignore` write: `.agents/internal/` is
  git-ignored at the tree level, so the per-workspace file was redundant.
- "superpowers" in comments → "lk-implement" or plain wording. No functional or
  CLI-contract change; verified in a scratch worktree (workspace path, Task-N-only
  brief, two-commit review package, clean `git status`, shellcheck clean).

### lk-debug

### lk-implement-test

## Ours

- `lk-release`, `lk-drain` — house-owned, no upstream; extracted from AGENTS.md
  §Release and §Track (Drain) on 2026-08-31 (spec D16).
