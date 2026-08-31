# Dev Flow v4 — on-demand process skills (design)

**Date:** 2026-08-31 · **Updated:** 2026-08-31 (lk- naming, release and drain extracted)
**Status:** approved (2026-08-31, in session, after one revision round)
**Scope:** the development *process* of this repo — AGENTS.md §Develop, §Track (drain),
§Release, a small set of process skills, and their wiring. No product code changes.
**Evidence base:** `docs/research/2026-08-06-dev-process-audit-and-v3-proposal.md`
("the audit") and `docs/specs/2026-08-10-dev-flow-v3-design.md` ("v3"). This spec does
not re-derive their findings; it records the v3 floor and what comes back.

## Why now

v3 ran zero skills and zero hooks on purpose: "to find the real floor before adding
anything back", with individual skills returning "on demonstrated pain, not in
advance". Three weeks in, the floor is known. The Develop section compressed the four
skills that did the measurable work in the audit — writing-plans (38 invocations), SDD
(37), brainstorming (33), systematic-debugging (9) — to one bullet each, and sessions
lost the method behind those bullets: the question protocol that killed scope
ambiguity, the plan-doc template that made task briefs self-contained, the executor
loop that caught four vulnerability classes pre-merge, the debugging phases that
produced 13-minute root causes. This spec brings the *method* back as on-demand text,
without bringing back the router, the hooks, the register, or the dead tree. It also
moves two procedures AGENTS.md carries today but runs rarely — the release and the
TODO drain — into skills of their own, so the always-loaded file holds rules, not
runbooks.

Two harness facts found while researching this, both load-bearing:

- Claude Code 2.1.251 exposes **no** TodoWrite/TaskCreate tools here: the changelog
  for 2.1.233 turns them off by default on Fable 5-class models, re-enabled only by
  `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`. v3's §Track "use the harness's own todo tracker"
  (D11) currently points at nothing.
- The harness ships review skills of its own (`/code-review`, `/security-review`) that
  didn't exist when v2 vendored superpowers' reviewer templates.

## Goals

1. **AGENTS.md routes; skills carry the method.** AGENTS.md stays the only router and
   the only home of rules (lanes, gates, paths, laws). Each phase or procedure names
   the process skill that carries it, loaded at that moment — never at session start.
   AGENTS.md ends this work no longer than it starts it (222 lines): the Develop
   additions are paid for by the Release and Drain text that moves out.
2. **Seven `lk-` skills, in the current model era's register.** Five vendored from
   upstream obra/superpowers v6.3.0 and house-adapted — `lk-specify`, `lk-plan`,
   `lk-implement`, `lk-debug`, `lk-implement-test` — plus two house-owned ones
   extracted from AGENTS.md — `lk-release`, `lk-drain`. All written as plain
   statements with reasons. Target ≤ 10K words for the whole runtime tree (v2 carried
   73.5K; the upstream selection alone is 15.7K).
3. **Review scaled to risk, seats from the harness.** Per-task fresh-context review
   only for risk-flagged tasks; the whole-branch pass uses the harness's `/code-review`
   (and `/security-review` when risk was flagged). This keeps v3's Review policy and
   the audit's finding (~98% of uniform per-task reviews found nothing).
4. **Provenance and licensing back in order.** `.agents/SOURCES.md` returns with pins,
   an upstream-origin map, and divergences; REUSE/LICENSING carry the MIT attribution
   for the vendored five; resyncs stay deliberate.

## Non-goals

- **No provider switch to the pcvelz fork** (decision D1). No native-task-tool
  integration, no hooks, no model-routing config files, no user-gate machinery.
- **No hooks of any kind.** v3's D4 stands. Nothing injects at session start.
- **No native task tools.** They stay off; the plan's checkboxes are the in-session
  tracker (D9). `CLAUDE_CODE_ENABLE_TODO_TOOLS` is not set.
- **No TDD skill, no verification skill, no finishing/worktree/router skills.** v3's
  D12 testing ladder stands; the harness and models absorbed verification; §End owns
  finishing (D16); the harness owns worktrees; AGENTS.md owns routing.
- **No visual companion** (brainstorming's browser mockup server). Artifacts and the
  Playwright MCP cover visual questions.
- **No changes to lanes, records, plan lifecycle, or the Definition of Done.** v3's
  taxonomy is untouched; this spec adds one row to it.
- **No agent-skills trial.** One provider tree; cherry-picks only where noted.

## Decision record (settled 2026-08-31, in session)

- **D1 — Source: upstream obra/superpowers v6.3.0** (commit `b36e0829`, 2026-08-12),
  not the pcvelz "Superpowers Extended for Claude Code" fork (v6.4.4, 847 ahead / 647
  behind upstream). The fork's delta is one bet — native TaskCreate tasks with
  `json:metadata` fences plus PreToolUse hooks as enforcement (model-tier gate,
  commit-strategy gate, dispatch routing gate, handoff guard, user-gate revalidation).
  Both halves cut against v3: the tools are off in the harness and here (and Anthropic
  turned them off by default), and "gates, not prose" is the opposite of "state goals
  and constraints" (audit §9). Its writing-plans also adds *more* MUST/HARD-GATE text
  than upstream. Re-evaluate only if task tools return by default (TODO line).
- **D2 — Two cherry-picks from the fork,** both harness-native and tool-independent:
  the plan header's **"Decisions already made"** block with the rule that a plan never
  re-asks a recorded decision; and **bounded parallel dispatch** — implementers may run
  concurrently only on tasks with disjoint file sets and no dependency between them
  (upstream forbids all parallel implementers). Considered and not taken: the architect
  pattern (executor session consults the plan-author session via `SendMessage` —
  execution is in-session here), the commit-strategy switch (End already squashes),
  task metadata, hooks.
- **D3 — Skill set.** Vendored and adapted: `lk-specify` (upstream `brainstorming`),
  `lk-plan` (`writing-plans`), `lk-implement` (`subagent-driven-development`, with its
  three scripts and three prompt templates: implementer, task-reviewer, re-review),
  `lk-debug` (`systematic-debugging`, with `root-cause-tracing.md` and
  `condition-based-waiting.md`), `lk-implement-test` (upstream's
  `test-driven-development/writing-good-tests.md`, promoted to a skill of its own).
  Also vendored, tiny, inside `lk-specify` and `lk-plan`: the spec- and plan-document
  reviewer prompts for on-request fresh-context document review (D13). House-owned:
  `lk-release` and `lk-drain` (D16). Not vendored, with reasons: `using-superpowers`
  (AGENTS.md is the router; the 1%-rule over-triggers), `verification-before-completion`
  (harness/model absorbed; the system prompt already mandates faithful reporting),
  `test-driven-development` (its iron law contradicts v3 D12; 0 invocations after
  vendoring), `receiving-code-review` (one line survives into Conventions: reply in
  the GitHub thread), `finishing-a-development-branch` (its "merge locally" option
  contradicts PR-only; §End owns finishing), `using-git-worktrees` (the person's and
  the harness's tooling), `executing-plans` (its own text says use SDD; inline
  execution is AGENTS.md's default), `dispatching-parallel-agents` (~150 words fold
  into `lk-implement`), `writing-skills` (authoring notes live in SOURCES.md), the
  visual companion, `requesting-code-review/code-reviewer.md` (D7 uses the harness).
- **D4 — Home and discovery.** Canonical files at `.agents/skills/<name>/` (the Agent
  Skills convention Codex reads natively); Claude Code discovers them through
  committed `.claude/skills/<name>` symlinks. Verified against the Claude Code docs
  (2026-08-31): project skills are read only from `.claude/skills/<name>/SKILL.md`,
  a `<name>` entry may be a symlink and is followed, and `.agents/skills/` is not
  read natively. No session-start hook, no bootstrap skill.
- **D5 — Names.** Every process skill is `lk-<phase>`: the prefix marks them as this
  repo's (vendored means adapted and owned, not mirrored), and the name says which
  phase or procedure it carries — `lk-specify`, `lk-plan`, `lk-implement`,
  `lk-debug`, `lk-implement-test`, `lk-release`, `lk-drain`. Upstream names do not
  survive; `.agents/SOURCES.md` maps each vendored skill to its upstream path so a
  resync still diffs the right pair of files. DEFINITIONS.md gains **process skill**
  as the term for these files, disambiguated from **Skill** (`@lodekit/skill`).
- **D6 — Register and adaptation rules** (the audit §9 trim, applied on vendoring and
  recorded as divergences): plain statements with their reasons; no
  `<EXTREMELY-IMPORTANT>`/`<HARD-GATE>` blocks, no iron laws, no Red-Flags or
  Rationalization tables, no "announce the skill" mandates, no flowcharts for
  judgment work (a digraph may stay where it encodes a real state machine — SDD's fix
  loop). "The person", never "your human partner". House paths (`docs/specs/`,
  `docs/plans/`, `.agents/internal/`), house tools (pnpm, `gh`, vitest), PR-only, our
  lane names, no `superpowers:` namespace. Word caps per file in §3. The two
  house-owned skills follow the same rules from birth.
- **D7 — Review seats.** Whole-branch, once per PR at ready-for-review (v3 D6):
  `/code-review` over the branch; `/security-review` additionally when any task was
  risk-flagged or the change touches a security boundary. Per-task: `lk-implement`
  dispatches its task-reviewer prompt **only for risk-flagged tasks**, framed to
  disprove the change (v3's adversarial posture becomes this prompt's framing rather
  than a separate mechanism). Every other task gets the implementer's self-review
  plus the whole-branch pass. On a harness without those skills, a fresh-context
  subagent with the task-reviewer prompt over the whole-branch review package stands
  in. A standalone `lk-review` skill was considered and not taken: the adversarial
  brief lives inside `lk-implement`; a risk-flagged change outside a plan uses
  `/security-review`.
- **D8 — Risk flag.** `lk-plan` marks a task `**Review:** required — <reason>` when it
  touches a trust boundary, a parser, auth, network egress, or data loss; everything
  else omits the line. The `lk-implement` controller may escalate an unflagged task
  to reviewed when the implementer reports `DONE_WITH_CONCERNS` or the diff reaches
  somewhere the plan did not — recorded in the ledger as a ruling.
- **D9 — Task tools stay off; §Track reworded.** "In-session steps — the plan's
  checkboxes when a plan exists; otherwise none. Never a tracking file; the harness's
  task tools stay off." No settings change.
- **D10 — SDD workspace.** `.agents/internal/sdd/<plan-basename>/` (git-ignored; the
  `.agents/internal/` entry returns to `.gitignore`), holding the ledger, briefs,
  reports, and review packages for one plan. The ledger is what survives compaction;
  the workspace is deleted when the final review is clean.
- **D11 — Delegation posture.** Inline by default: work finishable in a handful of
  tool calls, or tightly coupled tasks, stays in the session. `lk-implement` when a
  plan's tasks are independent and each needs its own context. Cap: at most three
  implementers in flight, concurrent only on disjoint file sets (D2). Cheapest model
  that can do the task, `model` always passed explicitly — an omitted model inherits
  the session's. Tiers live in AGENTS.md; model names live in the skill (they change).
- **D12 — `lk-specify` is the method, not the router.** Lanes are chosen in AGENTS.md
  §Start. Upstream's spike and bounded paths correspond to our research and
  small-change lanes, which load no skill; the architectural path is our feature lane
  and is what the skill carries. The small-change lane keeps v3's stance: no design
  approval gate (the person may ask for a design in chat; the skill's question
  protocol applies then too).
- **D13 — Document review.** Spec and plan self-review are inline checklists, always
  (upstream v6.3.0 moved there for cost). The two document-reviewer prompts are
  vendored for the person to request a fresh-context read of a large spec or plan;
  nothing dispatches them unasked.
- **D14 — Provenance.** `.agents/SOURCES.md` returns: source, pinned commit, vendored
  date, the `lk-<name>` → upstream-path map, and every divergence per file. Resyncs
  are deliberate — on a relevant upstream release or roughly quarterly — one PR each:
  diff pinned → latest per the map, port what is wanted, re-apply D6, update the
  ledger. REUSE.toml annotates the five vendored skill directories as `MIT`, © 2025
  Jesse Vincent and 2026 The Lodekit Authors; the two house-owned skills fall under
  the root annotation. LICENSING.md and CONTRIBUTING.md name the tree.
- **D15 — Tests.** v3 D12 stands. `lk-implement-test` is the shared reference: AGENTS.md
  points at it for anyone writing or changing tests or adding mocks; the
  `lk-implement` implementer template says "test-first when the failing test cheaply
  expresses the change; either way, `lk-implement-test` governs the test".
- **D16 — Two procedures leave AGENTS.md; the rest stays.** `lk-release` takes the
  §Release runbook (pre-flight, the 10-file bump, the buffer drain, the release
  branch and PR, the steering audit as its last step); AGENTS.md keeps three lines —
  what merging a release PR triggers, that the workflow alone creates tags, that the
  person merges. `lk-drain` takes §Track's drain procedure and reads `docs/TRACK.md`
  for the mechanics; AGENTS.md keeps one line naming it. Considered and kept in
  AGENTS.md: §End, the docs check, and the Definition of Done (an `lk-finish` skill
  would move the laws out of the always-loaded file — they apply to every PR); the
  steering audit as a standalone `lk-audit` (it runs at release; `lk-release` carries
  it). Considered and not taken: `lk-review` (D7) and `lk-resume` (a draft PR plus
  `gh pr list` is the continuation artifact, v3 D2).

## 1. Taxonomy after this work

One row joins the AGENTS.md map; nothing else moves:

| File | Answers | Update when |
|---|---|---|
| `.agents/skills/` | how a phase or procedure is carried out: on-demand process skills (`lk-*`), vendored and trimmed or house-owned; provenance in `.agents/SOURCES.md` | a skill is added, adapted, or resynced |

Layout:

```
.agents/
  skills/
    lk-specify/SKILL.md
    lk-specify/spec-document-reviewer-prompt.md
    lk-plan/SKILL.md
    lk-plan/plan-document-reviewer-prompt.md
    lk-implement/SKILL.md
    lk-implement/{implementer,task-reviewer,re-review}-prompt.md
    lk-implement/scripts/{sdd-workspace,task-brief,review-package}
    lk-debug/SKILL.md
    lk-debug/{root-cause-tracing,condition-based-waiting}.md
    lk-implement-test/SKILL.md
    lk-release/SKILL.md
    lk-drain/SKILL.md
  SOURCES.md
  internal/                      # git-ignored: sdd/<plan-basename>/ workspaces
.claude/
  skills/lk-<name> -> ../../.agents/skills/lk-<name>   # seven committed symlinks (D4)
  settings.json                  # unchanged
```

DEFINITIONS.md §Ambiguities gains one entry: **Skill vs process skill** — the Skill is
`@lodekit/skill`, the pack an agent loads to build on Lodekit; a process skill is an
`lk-*` directory under `.agents/skills/` that carries the method for one phase or
procedure of this repo's development flow. Never shorten the latter to "skill" in
steering docs.

## 2. AGENTS.md — the edits

Register unchanged: plain statements with reasons. Proposed wording, to be tightened in
the plan; the rules are the point, not the sentences.

**Intro table:** the row in §1.

**Track → Drain:** the paragraph becomes one line —

> **Drain** — periodically, when the person asks, run `lk-drain`: it turns TODO.md
> lines into backlog issues and tracks and opens the PR that deletes them.

**Track → In-session steps:** the D9 sentence replaces the current one.

**Develop, after the lanes paragraph:**

> Process skills (`.agents/skills/lk-*`) carry the method for each phase; the phase
> says which to load. Load a skill when its phase begins, not at session start.

**Specify:**

> Run `lk-specify` before writing the spec: check whether the ask decomposes into
> sub-projects before refining details; ask one question at a time, multiple choice
> where it fits; propose two or three approaches with a recommendation; present the
> design in sections and get each approved before writing the file. Self-review the
> spec for placeholders, contradictions, scope, and ambiguity before pushing.

**Plan:**

> Write plans with `lk-plan`: map the files first; size tasks so a reviewer could
> reject one while approving its neighbor; give the plan a header with the spec path,
> global constraints, and decisions already made — a plan never re-asks a recorded
> decision. Mark tasks that touch a trust boundary, parser, auth, network egress, or
> data loss with `**Review:** required — <reason>`. No placeholders: every task carries
> the exact values an executor needs, because the executor sees only its own task.

**Implement:**

> Execute inline when the work fits in a handful of tool calls or the tasks are
> tightly coupled. Otherwise run the plan with `lk-implement`: a fresh subagent per
> task on the cheapest model that can do it (always pass `model`), briefs and reports
> as files, a ledger that survives compaction, rulings recorded instead of questions
> parked. At most three implementers in flight, concurrent only on disjoint file
> sets. Bugs: `lk-debug` — root cause before any fix; three failed fixes mean the
> design is wrong, so stop and say so. Tests: read `lk-implement-test` when writing
> or changing tests or adding mocks.

**Review:**

> Risk-flagged tasks get a fresh-context task review briefed to disprove the change
> (`lk-implement`'s task-reviewer); every other task gets the implementer's
> self-review and the whole-branch pass. Before a PR leaves draft: `/code-review`
> over the branch, plus `/security-review` when any task was risk-flagged.

(The existing adversarial-review bullet folds into this; the docs check stays.)

**End:** unchanged (D16).

**Release:** the section shrinks to —

> Merging a `release: vX.Y.Z` PR triggers `.github/workflows/release.yml`, which
> builds the mac zips, tags `vX.Y.Z`, and publishes the GitHub Release with the PR
> body as notes. The workflow is the only creator of `v*` tags; never tag manually.
> `lk-release` assembles the release PR — pre-flight, the lockstep bump (confirmed
> with the person), the changelog drain, the steering audit — and the person merges
> it; never merge a release PR yourself.

**Conventions, three additions** (the third added 2026-08-31 after the plan for this
spec leaked a home-directory path; v2's SOURCES.md carried the same rule):

> **Process skills:** canonical files in `.agents/skills/lk-<name>/`, committed
> `.claude/skills/lk-<name>` symlinks; provenance, the upstream map, and every
> divergence in `.agents/SOURCES.md`; resyncs are deliberate, one PR each;
> adaptation rules are in SOURCES.md.
>
> **PR review threads:** reply to inline review comments in their thread
> (`gh api repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies`), never as a
> top-level comment.
>
> **Portable paths:** committed files and PR bodies carry no machine-local paths —
> repo-relative paths, or `<worktree>` / `$SCRATCHPAD` placeholders for machine-local
> inputs. A home-directory path leaks who wrote it and breaks on every other machine.

Budget: AGENTS.md is 222 lines today; the Release and Drain text leaving (~25 lines)
pays for the Develop additions (~25 lines). After this work: ≤ 225 lines.

## 3. The skills — what each keeps, drops, and adds

Word caps are for `SKILL.md` unless noted; upstream counts in parentheses.

### lk-specify (≤ 900 words; upstream `brainstorming`, 2,324)

Keeps: explore project state first; decomposition check before detailed questions;
one question per message, multiple choice preferred; purpose / constraints / success
criteria; two or three approaches with trade-offs and a recommendation, YAGNI applied;
design presented in sections scaled to complexity, approval per section; "design for
isolation and clarity" and "working in existing codebases" paragraphs; the spec
self-review checklist (placeholders, internal consistency, scope, ambiguity); the
hand-off to Specify's commit-push-draft-PR step.

Drops: the three-path router and its red-flag table (D12); the HARD-GATE; the "too
simple to need approval" anti-pattern section; the process digraph; the visual
companion section and its 700-line server; `docs/superpowers/specs/` paths;
`elements-of-style` and `writing-plans` skill hand-offs (AGENTS.md sequences phases).

Adds: the house spec format (Goals / Non-goals / Decision record / numbered sections /
Rollout / Verification) as the output shape; scope that falls out → TODO.md line.

### lk-plan (≤ 900 words; upstream `writing-plans`, 1,059)

Keeps: the zero-context-engineer framing; scope check (one plan per independent
subsystem); File Structure mapping; Task Right-Sizing; the header (Goal, Architecture,
Tech Stack, **Spec**, Global Constraints); task structure (Files with line ranges,
Interfaces consumed/produced, steps with exact commands and expected output); the No
Placeholders list; the inline self-review (spec coverage, placeholder scan, type
consistency).

Drops: the "2–5 minute step" granularity (tasks are sized for a subagent brief; v3
already asks for context / files / acceptance criteria / verification); the
execution-choice menu (AGENTS.md decides inline vs `lk-implement`; §End owns
finishing); worktree and namespace references.

Adds: **Decisions already made** in the header and the never-re-ask rule (D2); the
`**Review:** required — <reason>` line (D8); house plan lifecycle (branch-only,
checkboxes ticked and pushed as tasks land, deleted before merge — pointer to
`docs/plans/README.md`); the portable-paths rule (no machine-local paths in a plan;
placeholders for machine-local inputs); the plan-document-reviewer prompt kept
alongside for D13.

### lk-implement (≤ 2,200 words; upstream `subagent-driven-development`, 4,825)

Keeps: fresh implementer per task with isolated context; the workspace scripts
(`sdd-workspace`, `task-brief`, `review-package`) and their reason (artifacts as files
keep the controller's context clean; `HEAD~1` silently truncates multi-commit tasks);
the ledger — identity line, `Task N: complete` lines, resume rules, "trust the ledger
and `git log` over recollection"; the pre-dispatch conflict scan written to the ledger
as a table; rulings not stalls, with the four stop conditions; Model Selection (tiers,
turn count beats token price, always pass `model`); batching same-shape tasks; the
four report statuses and how to handle each; the fix loop (rounds 1–3 resume the
implementer, 4–5 fresh implementer one tier up, scoped re-review each round, the
five-round breaker with adjudication rules); "Rulings I made" in the final message;
workspace deletion at the end; the implementer, task-reviewer, and re-review templates
(each trimmed of duplicated process rules; the implementer's TDD line becomes D15's).

Drops: the two digraphs (the fix loop keeps a short state list instead); the
Rationalizations table; the example workflow transcript; worktree and finishing
hand-offs; `requesting-code-review` and its `code-reviewer.md` (D7); the
`.superpowers/` paths and `superpowers:` namespace; bounded-wait guidance specific to
other harnesses (the harness notifies on subagent completion).

Adds: risk-scaled task review — the task reviewer is dispatched only for tasks
carrying `**Review:** required`, with the prompt's framing "your job is to disprove
this change"; unflagged tasks close on the implementer's report and self-review with a
ledger line (D7/D8); bounded parallel dispatch with the three-in-flight cap (D2/D11);
the final step: the controller reports rulings and hands to AGENTS.md §Review
(`/code-review`, `/security-review` when flagged) and §End; ~150 words of
`dispatching-parallel-agents` (independent domains, focused briefs, verify no
conflicts, run the full suite after integration) as the parallel-dispatch paragraph;
the workspace path `.agents/internal/sdd/<plan-basename>/` (D10) in the scripts.

### lk-debug (≤ 800 words; upstream `systematic-debugging`, 1,440)

Keeps: the four phases (root cause → pattern → hypothesis → implementation) as
stated goals with their reasons; multi-component evidence gathering; the backward
data-flow trace (pointer to `root-cause-tracing.md`); one hypothesis, smallest change,
one variable at a time; the regression test as the reproduction, at the lowest
ladder rung; "three failed fixes → question the architecture, with the person";
the "no root cause" clause and its 95% caveat; `condition-based-waiting.md` for
timeout-shaped flakiness.

Drops: the iron law, the Red Flags list, the Rationalizations table, the "signals
you're doing it wrong" section, the quick-reference table; `defense-in-depth.md`
(its useful sentence — validate at the boundary you fixed, not everywhere — moves
into Phase 4); the CREATION-LOG and four test-pressure fixtures (authoring material).

Adds: the house bug lane (reproduce → fix → regression test → PR; adjacent finds go to
TODO.md, not scope).

### lk-implement-test (≤ 1,300 words; upstream `writing-good-tests.md`, 1,310)

Keeps: the whole file — it is already in the target register (name the break, derive
expectations independently, no change detectors, behavior not text, your code not the
framework, the mock earns no assertions, mock at the right level, mirror real data,
production classes carry production methods, the mutation check, the quick-reference
and warning-signs tables).

Drops/edits: the `superpowers:writing-skills` reference; "your human partner's
correction/question" attributions become plain statements; the frontmatter gains a
description that triggers on writing or changing tests, adding mocks, or adding
test helpers.

### lk-release (≤ 600 words; house-owned, from AGENTS.md §Release)

Carries, verbatim in substance from today's AGENTS.md: the pre-flight (on `master`,
clean and up to date; `pnpm test` passes; the same version in all 10 package.json
files — root, `packages/{engine,mcp,sdk,skill,ui,integration-tests}`, `web/{main,docs}`,
`manager`; `gh auth status`; no release PR open; at least one CHANGELOG.md entry —
stop and report on any failure); the bump rule (features → minor, fixes only → patch;
confirmed with the person); the drain of `docs/CHANGELOG.md` verbatim into
`web/docs/src/content/docs/changelog.md` under a prepended
`## [X.Y.Z](compare-url) (YYYY-MM-DD)` heading, the merged-PR cross-check that
reports gaps and never adds entries silently, the buffer reset to its rules header;
branch `release/vX.Y.Z`, single commit and PR title `release: vX.Y.Z`; the steering
audit (ARCHITECTURE.md and DEFINITIONS.md claims checked against the code, each
reported verified / stale / missing) as the last step, its report in the PR body.

Adds: the exact commands (version bump across the 10 files, compare-url shape), so
the next release does not rediscover them; a `disable-model-invocation: true`
frontmatter line — the release runs when the person asks, never on the model's
initiative.

### lk-drain (≤ 500 words; house-owned, from AGENTS.md §Track and `docs/TRACK.md`)

Carries: branch; read TODO.md; group lines into themes with the person; create gh
issues or tracks per `docs/TRACK.md` (types, fields, sub-issues, the
`setIssueFieldValue` mutation, the ~2s/issue throttle — the skill points at TRACK.md
rather than restating it); delete the drained lines; open the PR whose body links
every issue created. `disable-model-invocation: true` as well: the drain is the
person's call.

## 4. SOURCES.md, licensing, contributing

`.agents/SOURCES.md` returns in its v2 shape with one addition. Sections: **Sources**
(source, pinned commit, vendored date, provides); **Map** — one row per vendored skill,
`lk-<name>` → upstream path (`skills/brainstorming/SKILL.md`, …), so a resync diffs
the right pair; **Adaptation rules** (D6 verbatim, so a resync applies the same trim);
**Divergences** — one bullet per file naming what changed and why; **Ours** —
`lk-release`, `lk-drain` (no upstream). Pin: `github.com/obra/superpowers` at
`b36e0829c6d0140e93cfef2ca599b1b07d4a7797` (v6.3.0). The two D2 cherry-picks cite
`github.com/pcvelz/superpowers` by commit in the `lk-plan` and `lk-implement`
divergence bullets.

REUSE.toml: one annotation listing the five vendored directories
(`.agents/skills/lk-specify/**`, `lk-plan`, `lk-implement`, `lk-debug`,
`lk-implement-test`), `precedence = "aggregate"`,
`SPDX-FileCopyrightText = ["2025 Jesse Vincent", "2026 The Lodekit Authors"]`,
`SPDX-License-Identifier = "MIT"`. `LICENSES/MIT.txt` is already present (shadcn).
`lk-release`, `lk-drain`, and `SOURCES.md` fall under the root `**` annotation,
which is correct.

LICENSING.md §Third-party code gains one paragraph: five process skills under
`.agents/skills/` are adapted from obra/superpowers (MIT, © 2025 Jesse Vincent);
provenance and divergences in `.agents/SOURCES.md`. CONTRIBUTING.md §Development
process adds `.agents/skills/` to the checked-in tooling sentence.

## 5. Removed or unchanged, stated so nothing is assumed

- `.claude/settings.json`: unchanged (no hooks, no env, `autoMemoryEnabled: false`,
  playwright pre-approved). No `enabledPlugins` entry — the superpowers plugin is
  not installed and nothing disables it.
- `.mcp.json`: unchanged.
- `docs/plans/README.md`: unchanged; `lk-plan` points at it.
- `docs/TRACK.md`: unchanged; `lk-drain` reads it.
- `docs/CHANGELOG.md`: no entry — the PR is `chore(dev-flow)`, and process changes
  are not user-facing (v3 D14).
- ARCHITECTURE.md: unchanged — process skills are not product structure.
- AGENTS.md §End, the docs check, and the Definition of Done: unchanged (D16).

## 6. Rollout

One PR off `devex`, in this order: this spec (reviewed first — this document is the
gate) → the plan (`docs/plans/2026-08-31-dev-flow-v4.md`, branch-only) → the work:

1. Vendor the five skills and their references verbatim from the pinned upstream
   commit into their `lk-` directories, then adapt each per §3 and D6; word-cap each
   file.
2. Write `lk-release` and `lk-drain` from today's AGENTS.md and TRACK.md text.
3. Re-home the three SDD scripts to `.agents/internal/sdd/` and re-verify them.
4. Symlinks, `.gitignore` (`.agents/internal/`), `.agents/SOURCES.md`.
5. AGENTS.md edits (§2), DEFINITIONS.md ambiguity entry, LICENSING.md, REUSE.toml,
   CONTRIBUTING.md.
6. Verification (§7), then delete the plan, write the PR body, flip to ready.

Follow-ups as TODO lines, filed in the PR: re-evaluate native task tools and the
pcvelz task-metadata format if Claude Code re-enables TaskCreate by default; verify
Codex reads `.agents/skills/` and the adapted skills as-is, if Codex is still in use.

## 7. Verification

- **Discovery:** a fresh Claude Code session in the worktree lists the seven `lk-*`
  process skills; each loads through the Skill tool; `test -f
  .claude/skills/lk-<name>/SKILL.md` passes for all seven. `lk-release` and
  `lk-drain` do not fire on their own (`disable-model-invocation`).
- **Register audit:** `grep -rEn 'EXTREMELY|HARD-GATE|Iron Law|Red Flags|Rationaliz|
  MUST |your human partner|Announce at start|superpowers:|docs/superpowers|
  \.superpowers|brainstorming|writing-plans|subagent-driven|systematic-debugging'
  .agents/skills/` returns nothing (the last four confirm no upstream name leaks
  into a skill body; SOURCES.md is the one place they appear).
- **Budgets:** `wc -w` per file within the §3 caps; the runtime tree (SKILL.md files
  plus references and templates) ≤ 10K words; AGENTS.md ≤ 225 lines.
- **Scripts:** in a scratch worktree, `sdd-workspace` on a sample plan prints a path
  under `.agents/internal/sdd/<plan-basename>/`; `task-brief` and `review-package`
  write there; `git status` stays clean afterwards.
- **Runbooks:** `lk-release`'s pre-flight, run against the current tree, reports each
  check correctly and stops before any bump (no release is cut); `lk-drain`, run to
  the grouping step on the current TODO.md, proposes themes without filing an issue.
- **Licensing:** the `reuse` CI job passes on the PR.
- **Smoke, one run per lane that changed:** a feature-lane dry run on a small real
  issue (`lk-specify` → spec → `lk-plan` with one risk-flagged task → `lk-implement`
  → `/code-review` → PR body with plan permalink) and a bug-lane run with `lk-debug`
  ending in a regression test. Both are checked for: the skill loaded at its phase
  and not before; no announcement lines; the ledger and workspace created and
  removed; the task reviewer dispatched only for the flagged task.
- `pnpm test` and `pnpm e2e` unaffected (no product code).
