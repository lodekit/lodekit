---
name: session
description: Establish the session's operating mode — pair or auto (who approves) × spec or task (how much ceremony). Use at session start, when invoked as /session [pair|auto] [spec|task], or whenever the operating mode is unclear.
---

# session — operating mode

Resolve the mode, announce it ("Session mode: pair task"), then follow its contract
for the rest of the session.

## Resolving the mode

- **Axis 1 (who approves):** `pair` unless `auto` was explicitly given. Never infer
  auto.
- **Axis 2 (ceremony):** if not given, infer from the request — new feature, new
  component, large refactor, unclear scope → `spec`; small fix, minor change, minor
  refactor → `task`. In pair, confirm the inference before proceeding; in auto, state
  it and proceed.

## Triage before ceremony

| Request | Route |
|---|---|
| Quick question ("what does X do?", "explain this error") | Answer. No bead, no skill. |
| Simple change — ONLY: typo, comment, rename, or a single-file obvious fix with an obvious check | Do it, verify with evidence, commit. Bead optional. Anything that doesn't fit this list is not simple. |
| Research query ("how does X work?", "compare A vs B") | research-driven-development. |
| Everything else | The mode contract below. |

## pair

Skills run unmodified: interactive brainstorming, partner approval at every gate,
questions block until answered. Ask rather than assume.

## auto

The engineer is absent; you decide. Never raise a question. Invest more before
deciding: gather context, research, adversarially verify your own conclusions — you
are the only reviewer present. Gates are substituted, never deleted:

| Gate | pair | auto |
|---|---|---|
| Unknowns before design | ask the engineer | research-driven-development, verified findings |
| Spec approval | engineer approves | stress-test interrogation; revise until it passes |
| Plan approval | engineer approves | stress-test interrogation |
| Code review | engineer + subagent gates | full 4-gate subagent review; reject and re-delegate on failure |

**STOP conditions apply verbatim** (blocker; critical plan gap; instruction you don't
understand; verification fails repeatedly). In auto, "stop and ask for help" means:

1. File the blocker as a bead labeled `human` (severity/confidence stamp).
2. Write a handoff (session-handoff).
3. `bd remember "continuation-<date>-<topic>: <state>"`, then `bd dolt push`.
4. End with a final message stating exactly where and why you stopped.

Never guess past a blocker. Resume is session-independent: the next session's
getting-up-to-speed surfaces the continuation memory, the handoff, and
`bd list --label human`.

## spec

Full cycle: brainstorming → spec in `docs/specs/` → writing-plans → plan in
`docs/plans/` + epic/task beads → execution. Use codebase-design vocabulary when a
design touches module boundaries; invoke domain-modeling when a domain term is coined
or bent.

## task

No spec, no brainstorm. Always a plan, however small — a plan doc and its epic, even
for an afternoon's work. Escalation valve: if the work turns out spec-worthy (new
component, cross-cutting change, genuine design choice), escalate to `spec` — in pair,
confirm with the engineer; in auto, decide, and record the escalation in the handoff.

## All modes

- subagent-driven-development is the default executor.
- Beads for ALL tracking (AGENTS.md convention) — bead IDs in commit messages.
- Deferral always available: `defer`-labeled bead, stamped, provenance in the body;
  list deferrals in the PR body.
- ponytail is active while implementing; it does not apply to brainstorming or
  spec/plan writing.
- Session close = land the plane: `bd close` → `bd dolt push` → `git push`. Not done
  until both pushes succeed.
