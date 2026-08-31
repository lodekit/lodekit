# Dev Flow v4 — on-demand process skills (design)

**Date:** 2026-08-31
**Status:** draft-for-review
**Scope:** the development *process* of this repo — AGENTS.md §Develop, a small set of
vendored process skills, and their wiring. No product code changes.
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
without bringing back the router, the hooks, the register, or the dead tree.

Two harness facts found while researching this, both load-bearing:

- Claude Code 2.1.251 exposes **no** TodoWrite/TaskCreate tools here: the changelog
  for 2.1.233 turns them off by default on Fable 5-class models, re-enabled only by
  `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`. v3's §Track "use the harness's own todo tracker"
  (D11) currently points at nothing.
- The harness ships review skills of its own (`/code-review`, `/security-review`) that
  didn't exist when v2 vendored superpowers' reviewer templates.

## Goals

1. **AGENTS.md routes; skills carry the method.** AGENTS.md stays the only router and
   the only home of rules (lanes, gates, paths, laws). Each Develop phase names the
   process skill that carries its procedure, loaded at that phase — never at session
   start. AGENTS.md grows by roughly 25 lines, not 300.
2. **Five skills, trimmed to the current model era.** brainstorming, writing-plans,
   subagent-driven-development, systematic-debugging, writing-good-tests — vendored from
   upstream obra/superpowers v6.3.0, house-adapted, and rewritten in the v3 register:
   plain statements with reasons. Target ≤ 9K words for the whole runtime tree (v2
   carried 73.5K; the upstream selection is 15.7K).
3. **Review scaled to risk, seats from the harness.** Per-task fresh-context review
   only for risk-flagged tasks; the whole-branch pass uses the harness's `/code-review`
   (and `/security-review` when risk was flagged). This keeps v3's Review policy and
   the audit's finding (~98% of uniform per-task reviews found nothing).
4. **Provenance and licensing back in order.** `.agents/SOURCES.md` returns with pins
   and divergences; REUSE/LICENSING carry the MIT attribution; resyncs stay deliberate.

## Non-goals

- **No provider switch to the pcvelz fork** (decision D1). No native-task-tool
  integration, no hooks, no model-routing config files, no user-gate machinery.
- **No hooks of any kind.** v3's D4 stands. Nothing injects at session start.
- **No native task tools.** They stay off; the plan's checkboxes are the in-session
  tracker (D9). `CLAUDE_CODE_ENABLE_TODO_TOOLS` is not set.
- **No TDD skill, no verification skill, no finishing/worktree/router skills.** v3's
  D12 testing ladder stands; the harness and models absorbed verification; End owns
  finishing; the harness owns worktrees; AGENTS.md owns routing.
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
- **D3 — Skill set.** Vendored: `brainstorming`, `writing-plans`,
  `subagent-driven-development` (with its three scripts and three prompt templates:
  implementer, task-reviewer, re-review), `systematic-debugging` (with
  `root-cause-tracing.md` and `condition-based-waiting.md`), and `writing-good-tests`
  (upstream's `test-driven-development/writing-good-tests.md`, promoted to its own
  skill directory). Also vendored, tiny: `spec-document-reviewer-prompt.md` and
  `plan-document-reviewer-prompt.md` for on-request fresh-context document review
  (D13). Not vendored, with reasons: `using-superpowers` (AGENTS.md is the router;
  the 1%-rule over-triggers), `verification-before-completion` (harness/model
  absorbed; the system prompt already mandates faithful reporting),
  `test-driven-development` (its iron law contradicts v3 D12; 0 invocations after
  vendoring), `receiving-code-review` (one line survives into Conventions: reply in
  the GitHub thread), `finishing-a-development-branch` (its "merge locally" option
  contradicts PR-only; End owns finishing), `using-git-worktrees` (the person's and
  the harness's tooling), `executing-plans` (its own text says use SDD; inline
  execution is AGENTS.md's default), `dispatching-parallel-agents` (~150 words fold
  into SDD), `writing-skills` (authoring notes live in SOURCES.md), the visual
  companion, `requesting-code-review/code-reviewer.md` (D7 uses the harness).
- **D4 — Home and discovery.** Canonical files at `.agents/skills/<name>/` (the Agent
  Skills convention Codex reads natively); Claude Code discovers them through
  committed `.claude/skills/<name>` symlinks. Verified against the Claude Code docs
  (2026-08-31): project skills are read only from `.claude/skills/<name>/SKILL.md`,
  a `<name>` entry may be a symlink and is followed, and `.agents/skills/` is not
  read natively. No session-start hook, no bootstrap skill.
- **D5 — Names.** Directory and file names stay upstream's (`brainstorming`,
  `writing-plans`, `subagent-driven-development`, `systematic-debugging`) so a resync
  is a diff, not an archaeology. AGENTS.md maps phase → skill, so names need not match
  phase names. DEFINITIONS.md gains **process skill** as the term for these files,
  disambiguated from **Skill** (`@lodekit/skill`).
- **D6 — Register and adaptation rules** (the audit §9 trim, applied on vendoring and
  recorded as divergences): plain statements with their reasons; no
  `<EXTREMELY-IMPORTANT>`/`<HARD-GATE>` blocks, no iron laws, no Red-Flags or
  Rationalization tables, no "announce the skill" mandates, no flowcharts for
  judgment work (a digraph may stay where it encodes a real state machine — SDD's fix
  loop). "The person", never "your human partner". House paths (`docs/specs/`,
  `docs/plans/`, `.agents/internal/`), house tools (pnpm, `gh`, vitest), PR-only, our
  lane names, no `superpowers:` namespace. Word caps per file in §3.
- **D7 — Review seats.** Whole-branch, once per PR at ready-for-review (v3 D6):
  `/code-review` over the branch; `/security-review` additionally when any task was
  risk-flagged or the change touches a security boundary. Per-task: SDD dispatches
  its task-reviewer prompt **only for risk-flagged tasks**, framed to disprove the
  change (v3's adversarial posture becomes this prompt's framing rather than a
  separate mechanism). Every other task gets the implementer's self-review plus the
  whole-branch pass. On a harness without those skills, a fresh-context subagent with
  the task-reviewer prompt over the whole-branch review package stands in.
- **D8 — Risk flag.** writing-plans marks a task `**Review:** required — <reason>` when
  it touches a trust boundary, a parser, auth, network egress, or data loss;
  everything else omits the line. The SDD controller may escalate an unflagged task
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
  tool calls, or tightly coupled tasks, stays in the session. SDD when a plan's tasks
  are independent and each needs its own context. Cap: at most three implementers in
  flight, concurrent only on disjoint file sets (D2). Cheapest model that can do the
  task, `model` always passed explicitly — an omitted model inherits the session's.
  Tiers live in AGENTS.md; model names live in the SDD skill (they change).
- **D12 — Brainstorming is the method, not the router.** Lanes are chosen in
  AGENTS.md §Start. Upstream's spike and bounded paths correspond to our research and
  small-change lanes, which load no skill; the architectural path is our feature lane
  and is what the skill carries. The small-change lane keeps v3's stance: no design
  approval gate (the person may ask for a design in chat; the skill's question
  protocol applies then too).
- **D13 — Document review.** Spec and plan self-review are inline checklists, always
  (upstream v6.3.0 moved there for cost). The two document-reviewer prompts are
  vendored for the person to request a fresh-context read of a large spec or plan;
  nothing dispatches them unasked.
- **D14 — Provenance.** `.agents/SOURCES.md` returns: source, pinned commit, vendored
  date, provides, and every divergence per file. Resyncs are deliberate — on a
  relevant upstream release or roughly quarterly — one PR each: diff pinned → latest,
  port what is wanted, re-apply D6, update the ledger. REUSE.toml annotates
  `.agents/skills/**` as `MIT`, © 2025 Jesse Vincent and 2026 The Lodekit Authors;
  LICENSING.md and CONTRIBUTING.md name the tree.
- **D15 — Tests.** v3 D12 stands. `writing-good-tests` is the shared reference: AGENTS.md
  points at it for anyone writing or changing tests or adding mocks; the SDD
  implementer template says "test-first when the failing test cheaply expresses the
  change; either way, `writing-good-tests` governs the test".

## 1. Taxonomy after this work

One row joins the AGENTS.md map; nothing else moves:

| File | Answers | Update when |
|---|---|---|
| `.agents/skills/` | how a phase is carried out: on-demand process skills, vendored and trimmed; provenance in `.agents/SOURCES.md` | a skill is added, adapted, or resynced |

Layout:

```
.agents/
  skills/
    brainstorming/SKILL.md
    writing-plans/SKILL.md
    writing-plans/plan-document-reviewer-prompt.md
    brainstorming/spec-document-reviewer-prompt.md
    subagent-driven-development/SKILL.md
    subagent-driven-development/{implementer,task-reviewer,re-review}-prompt.md
    subagent-driven-development/scripts/{sdd-workspace,task-brief,review-package}
    systematic-debugging/SKILL.md
    systematic-debugging/{root-cause-tracing,condition-based-waiting}.md
    writing-good-tests/SKILL.md
  SOURCES.md
  internal/                      # git-ignored: sdd/<plan-basename>/ workspaces
.claude/
  skills/<name> -> ../../.agents/skills/<name>   # five committed symlinks (D4)
  settings.json                  # unchanged
```

DEFINITIONS.md §Ambiguities gains one entry: **Skill vs process skill** — the Skill is
`@lodekit/skill`, the pack an agent loads to build on Lodekit; a process skill is a
file under `.agents/skills/` that carries the method for one phase of this repo's
development flow. Never shorten the latter to "skill" in steering docs.

## 2. AGENTS.md — the edits

Register unchanged: plain statements with reasons. Proposed wording, to be tightened in
the plan; the rules are the point, not the sentences.

**Intro table:** the row in §1.

**Track → In-session steps:** the D9 sentence replaces the current one.

**Develop, after the lanes paragraph:**

> Process skills (`.agents/skills/`) carry the method for each phase; the phase says
> which to load. Load a skill when its phase begins, not at session start.

**Specify:**

> Run `brainstorming` before writing the spec: check whether the ask decomposes into
> sub-projects before refining details; ask one question at a time, multiple choice
> where it fits; propose two or three approaches with a recommendation; present the
> design in sections and get each approved before writing the file. Self-review the
> spec for placeholders, contradictions, scope, and ambiguity before pushing.

**Plan:**

> Write plans with `writing-plans`: map the files first; size tasks so a reviewer could
> reject one while approving its neighbor; give the plan a header with the spec path,
> global constraints, and decisions already made — a plan never re-asks a recorded
> decision. Mark tasks that touch a trust boundary, parser, auth, network egress, or
> data loss with `**Review:** required — <reason>`. No placeholders: every task carries
> the exact values an executor needs, because the executor sees only its own task.

**Implement:**

> Execute inline when the work fits in a handful of tool calls or the tasks are
> tightly coupled. Otherwise run the plan with `subagent-driven-development`: a fresh
> subagent per task on the cheapest model that can do it (always pass `model`), briefs
> and reports as files, a ledger that survives compaction, rulings recorded instead of
> questions parked. At most three implementers in flight, concurrent only on disjoint
> file sets. Bugs: `systematic-debugging` — root cause before any fix; three failed
> fixes mean the design is wrong, so stop and say so. Tests: read
> `writing-good-tests` when writing or changing tests or adding mocks.

**Review:**

> Risk-flagged tasks get a fresh-context task review briefed to disprove the change
> (SDD's task-reviewer); every other task gets the implementer's self-review and the
> whole-branch pass. Before a PR leaves draft: `/code-review` over the branch, plus
> `/security-review` when any task was risk-flagged.

(The existing adversarial-review bullet folds into this; the docs check stays.)

**Conventions, two additions:**

> **Process skills:** canonical files in `.agents/skills/<name>/`, committed
> `.claude/skills/<name>` symlinks; provenance and every divergence in
> `.agents/SOURCES.md`; resyncs are deliberate, one PR each; adaptation rules are in
> SOURCES.md.
>
> **PR review threads:** reply to inline review comments in their thread
> (`gh api repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies`), never as a
> top-level comment.

Budget: AGENTS.md is 222 lines today; after this work ≤ 260.

## 3. The skills — what each keeps, drops, and adds

Word caps are for `SKILL.md` unless noted; upstream counts in parentheses.

### brainstorming (≤ 900 words; upstream 2,324)

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

### writing-plans (≤ 900 words; upstream 1,059)

Keeps: the zero-context-engineer framing; scope check (one plan per independent
subsystem); File Structure mapping; Task Right-Sizing; the header (Goal, Architecture,
Tech Stack, **Spec**, Global Constraints); task structure (Files with line ranges,
Interfaces consumed/produced, steps with exact commands and expected output); the No
Placeholders list; the inline self-review (spec coverage, placeholder scan, type
consistency).

Drops: the "2–5 minute step" granularity (tasks are sized for a subagent brief, D8 of
v3 already asks for context / files / acceptance criteria / verification); the
execution-choice menu (AGENTS.md decides inline vs SDD; End owns finishing); worktree
and namespace references.

Adds: **Decisions already made** in the header and the never-re-ask rule (D2); the
`**Review:** required — <reason>` line (D8); house plan lifecycle (branch-only,
checkboxes ticked and pushed as tasks land, deleted before merge — pointer to
`docs/plans/README.md`); the plan-document-reviewer prompt kept alongside for D13.

### subagent-driven-development (≤ 2,200 words; upstream 4,825)

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

### systematic-debugging (≤ 800 words; upstream 1,440)

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

### writing-good-tests (≤ 1,300 words; upstream 1,310)

Keeps: the whole file — it is already in the target register (name the break, derive
expectations independently, no change detectors, behavior not text, your code not the
framework, the mock earns no assertions, mock at the right level, mirror real data,
production classes carry production methods, the mutation check, the quick-reference
and warning-signs tables).

Drops/edits: the `superpowers:writing-skills` reference; "your human partner's
correction/question" attributions become plain statements; the frontmatter gains a
description that triggers on writing or changing tests, adding mocks, or adding
test helpers.

## 4. SOURCES.md, licensing, contributing

`.agents/SOURCES.md` returns in its v2 shape: a Sources table (source, pinned commit,
vendored date, provides), an Adaptation rules section (D6 verbatim, so a resync applies
the same trim), and a Divergences section with one bullet per file naming what
changed and why. Pin: `github.com/obra/superpowers` at
`b36e0829c6d0140e93cfef2ca599b1b07d4a7797` (v6.3.0). The two D2 cherry-picks cite
`github.com/pcvelz/superpowers` by commit in the writing-plans and SDD divergence
bullets.

REUSE.toml: one annotation, `path = ".agents/skills/**"`, `precedence = "aggregate"`,
`SPDX-FileCopyrightText = ["2025 Jesse Vincent", "2026 The Lodekit Authors"]`,
`SPDX-License-Identifier = "MIT"`. `LICENSES/MIT.txt` is already present (shadcn).
`.agents/SOURCES.md` itself falls under the root `**` annotation, which is correct.

LICENSING.md §Third-party code gains one paragraph: the process skills under
`.agents/skills/` are adapted from obra/superpowers (MIT, © 2025 Jesse Vincent);
provenance and divergences in `.agents/SOURCES.md`. CONTRIBUTING.md §Development
process adds `.agents/skills/` to the checked-in tooling sentence.

## 5. Removed or unchanged, stated so nothing is assumed

- `.claude/settings.json`: unchanged (no hooks, no env, `autoMemoryEnabled: false`,
  playwright pre-approved). No `enabledPlugins` entry — the superpowers plugin is
  not installed and nothing disables it.
- `.mcp.json`: unchanged.
- `docs/plans/README.md`: unchanged; writing-plans points at it.
- `docs/CHANGELOG.md`: no entry — the PR is `chore(dev-flow)`, and process changes
  are not user-facing (v3 D14).
- ARCHITECTURE.md: unchanged — process skills are not product structure.

## 6. Rollout

One PR off `devex`, in this order: this spec (reviewed first — this document is the
gate) → the plan (`docs/plans/2026-08-31-dev-flow-v4.md`, branch-only) → the work:

1. Vendor the five skills and their references verbatim from the pinned upstream
   commit, then adapt each per §3 and D6; word-cap each file.
2. Re-home the three SDD scripts to `.agents/internal/sdd/` and re-verify them.
3. Symlinks, `.gitignore` (`.agents/internal/`), `.agents/SOURCES.md`.
4. AGENTS.md edits (§2), DEFINITIONS.md ambiguity entry, LICENSING.md, REUSE.toml,
   CONTRIBUTING.md.
5. Verification (§7), then delete the plan, write the PR body, flip to ready.

Follow-ups as TODO lines, filed in the PR: re-evaluate native task tools and the
pcvelz task-metadata format if Claude Code re-enables TaskCreate by default; verify
Codex reads `.agents/skills/` and the adapted skills as-is, if Codex is still in use.

## 7. Verification

- **Discovery:** a fresh Claude Code session in the worktree lists the five process
  skills; each loads through the Skill tool; `test -f .claude/skills/<name>/SKILL.md`
  passes for all five.
- **Register audit:** `grep -rEn 'EXTREMELY|HARD-GATE|Iron Law|Red Flags|Rationaliz|
  MUST |your human partner|Announce at start|superpowers:|docs/superpowers|
  \.superpowers' .agents/skills/` returns nothing.
- **Budgets:** `wc -w` per file within the §3 caps; the runtime tree (SKILL.md files
  plus references and templates) ≤ 9K words; AGENTS.md ≤ 260 lines.
- **Scripts:** in a scratch worktree, `sdd-workspace` on a sample plan prints a path
  under `.agents/internal/sdd/<plan-basename>/`; `task-brief` and `review-package`
  write there; `git status` stays clean afterwards.
- **Licensing:** the `reuse` CI job passes on the PR.
- **Smoke, one run per lane that changed:** a feature-lane dry run on a small real
  issue (brainstorming → spec → writing-plans with one risk-flagged task → SDD →
  `/code-review` → PR body with plan permalink) and a bug-lane run with
  systematic-debugging ending in a regression test. Both are checked for: the skill
  loaded at its phase and not before; no announcement lines; the ledger and workspace
  created and removed; the task reviewer dispatched only for the flagged task.
- `pnpm test` and `pnpm e2e` unaffected (no product code).
