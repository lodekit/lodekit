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

SKILL.md and templates:

- Dropped both `dot` digraphs (the fix loop is a four-step numbered list), the Common
  Rationalizations table, the Example Workflow transcript, the "When to Use"
  comparison, and the "Announce" / "your human partner" phrasings (D6).
- Dropped the using-git-worktrees and finishing hand-offs and the Final Review
  section's reviewer dispatch, including every requesting-code-review /
  `code-reviewer.md` reference: the whole-branch pass is the harness's `/code-review`
  plus `/security-review` when a task was flagged (D7, D16).
- Dropped the bounded-wait/polling paragraph — the harness notifies the controller when
  a subagent completes; live implementers are resumed with `SendMessage`, dispatched
  with `Agent`.
- Paths: workspace `.agents/internal/sdd/<plan-basename>/`; scripts invoked from
  `.agents/skills/lk-implement/scripts/` (D10). Plans at `docs/plans/YYYY-MM-DD-<slug>.md`
  with the spec as binding authority.
- Added risk-scaled review: the task reviewer is dispatched only for tasks carrying
  `**Review:** required — <reason>`, framed to disprove the change; unflagged tasks
  close on the implementer's report plus self-review with a ledger line; the
  controller may escalate on DONE_WITH_CONCERNS or an over-reaching diff, ledgered as
  a ruling. Reason in-file: uniform per-task review found nothing ~98% of the time
  here; the catches were security- and parser-shaped (D7/D8).
- Added bounded parallel dispatch: at most three implementers in flight, only on
  disjoint file sets with no dependency, plus ~150 words folded in from upstream's
  dispatching-parallel-agents (one focused brief per independent domain, constraints,
  a named report shape, conflict check and full suite after integration). Idea from
  github.com/pcvelz/superpowers @ `a98ceff` (2026-06-10) (D2/D11).
- Added the finish hand-off: rulings listed exhaustively, workspace deleted, then
  AGENTS.md §Review and §End; the skill never finishes a branch (D16).
- Model Selection rewritten as harness tiers with current names (`haiku` for
  transcription-grade briefs, `sonnet` floor for reviewers and prose-brief
  implementers, the session model for design judgment), keeping "turn count beats
  token price" and "always pass `model`" (D11).
- Templates trimmed of process rules SKILL.md states; kept the no-subagents contract,
  the under-15-line report contract, the reviewer read-only rule, "do not trust the
  report", the ⚠️ cannot-verify channel, severity calibration, output formats. The
  implementer's TDD lines → "test-first when the failing test cheaply expresses the
  change; either way `lk-implement-test` says what a test must prove"; tests via
  `pnpm --filter <pkg> test`; "TDD Evidence" → "Test evidence" (D15). The task reviewer
  gained the disprove-the-change paragraph and keeps upstream's "illegible evidence is
  not missing evidence" guard; re-review changed in paths and register only.
- Word trim: SKILL.md 4,825 → 2,069; implementer 960 → 575; task-reviewer 1,331 →
  933; re-review 709 → 484.

### lk-debug

- Dropped per D6: the iron law block and its "violating the letter" line, the Red Flags
  list, the "human partner's signals" section, the Common Rationalizations and Quick
  Reference tables, all MUST/gate phrasing, and the `dot` digraphs in both reference
  files. The four phases read as goals with their reasons, not gated steps.
- Dropped the `defense-in-depth.md` pointer (not vendored); its one rule — validate at
  the boundary you fixed, not at every layer the value crossed — folds into "Implement
  the fix". Dropped the TDD and verification skill references (D3) and the
  `find-polluter.sh` / `condition-based-waiting-example.ts` companions (not vendored).
- Added the house bug lane in one paragraph: reproduce before fixing; the regression
  test lands with the fix in the same PR at the lowest ladder rung; adjacent
  pre-existing issues → one `docs/TODO.md` line, not scope; branch + PR.
- Frontmatter renamed to `lk-debug` (D5) with a two-sentence description.
- `root-cause-tracing.md`: technique kept (trace the bad value backward to its origin,
  fix at the source, one guard at the boundary where it entered); one example; the
  four-layer defense list → the single-guard rule; `npm test` → `pnpm test`.
- `condition-based-waiting.md`: technique kept (poll for the condition under a bounded
  deadline) with one TypeScript/vitest example and the `waitFor` implementation; the
  quick-patterns table, mistakes list, and "real-world impact" stats dropped.
- Word trim: SKILL.md 1,440 → 734 (ruling: 34 over the 700 target, under the 800 cap —
  further cuts remove a rule's reason); root-cause-tracing 739 → 430;
  condition-based-waiting 498 → 316.

### lk-implement-test

- Promoted from a reference file to a process skill: frontmatter added (`name` and a
  description carrying the load trigger — writing or changing a test, adding a mock or
  a test helper), replacing upstream's "Load this reference when" line.
- D15: the "strict TDD produces both naturally" sentence and the "the TDD cycle is what
  complete means" opener rewritten to the repo's ladder rule — test-first when a
  failing test cheaply expresses the change, otherwise the lowest rung that exercises
  it, the test landing beside the code; a slice ships the tests its behavior needs and
  only those.
- D6: `superpowers:writing-skills` cross-reference dropped; the two "your human
  partner's correction/question" attributions became plain statements; "human prose" →
  "prose for people".
- Word trim 1,310 → 1,300. Ruling (2026-08-31): the plan's 1,250 target was unreachable
  without cutting kept content (the Gate Function blocks or the Warning Signs list);
  the spec's 1,300 cap governs and the tree budget holds.

## Ours

- `lk-release`, `lk-drain` — house-owned, no upstream; extracted from AGENTS.md
  §Release and §Track (Drain) on 2026-08-31 (spec D16).
