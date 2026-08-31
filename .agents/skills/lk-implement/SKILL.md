---
name: lk-implement
description: Runs an approved plan with a fresh subagent per task, review scaled to risk, and a ledger that survives compaction. Load when a plan's tasks are independent enough to fan out; work that fits inline needs no skill.
---

# Implement

You are the controller. You dispatch one fresh subagent per task, keep the ledger,
rule on what the plan left open, and hand the finished branch back to AGENTS.md
§Review and §End. You never write a task's code yourself: your context stays clean for
coordination, and a controller's edits skip review.

Each implementer gets an isolated context you construct — its task, its interfaces,
the constraints that bind it, nothing else. A subagent that inherits the session's
history spends its attention on someone else's work, and whatever you paste into a
dispatch stays in your own context for the rest of the session. Hand artifacts over
as files.

Plans live at `docs/plans/YYYY-MM-DD-<slug>.md` and name their spec in the header.
Read the plan once and read the spec it names: the spec is the binding authority, the
plan is its argument, and a conflict inside the plan resolves against the spec. A plan
with no reachable spec gets a ledger note saying so — rulings made without one are
provisional.

## Rulings, not stalls

A running plan does not wait. Conflicts, ambiguities, plan defects, a cap you would
have asked to exceed — decide them, record the decision in the ledger as
`Ruling: <what you decided> — <why> — <what it costs if wrong>`, and keep going. A
wrong ruling costs rework the person can see and undo; a session parked on a question
costs their whole day and buys nothing.

Four things stop you, and only these: an irreversible or destructive operation; a
security-sensitive action; a side effect outside this worktree that norms say to ask
about first (a merge, a push to a shared branch, a publish); and a plan so broken that
every path forward is a guess.

## Setup

Three scripts in `.agents/skills/lk-implement/scripts/` keep the artifacts out of your
context:

- `sdd-workspace PLAN_FILE` prints this plan's git-ignored workspace directory,
  `.agents/internal/sdd/<plan-basename>/` — home to the ledger, briefs, reports, and
  review packages for this plan alone. Another plan's directory is never yours to read
  or write.
- `task-brief PLAN_FILE N` extracts one task's full text to a file and prints a status
  line naming it. Never make a subagent read the whole plan.
- `review-package PLAN_FILE BASE HEAD` writes the commit list, stat summary, and diff
  with context to one file and prints a status line naming it. Record BASE
  (`git rev-parse HEAD`) before every dispatch: `HEAD~1` silently drops all but the
  last commit of a multi-commit task.

The ledger at `<workspace>/progress.md` is what survives compaction. Its first line is
its identity, `# SDD ledger — plan: <plan file path>`; a ledger whose first line names
another plan is not yours, so leave it there and start your own. Tasks with a
`Task <N>: complete …` line are done — do not re-dispatch them; resume at the first
task without one, and a task whose last line is a fix round resumes at the next round.
The commits the ledger names exist in git even when you no longer remember creating
them, so after a compaction trust the ledger and `git log` over your own recollection.
`git clean -fdx` destroys the workspace, since it is git-ignored scratch; if that
happens, recover from `git log`.

Before dispatching Task 1, scan the plan for conflicts and write the scan to the
ledger as a table: one row per pair of tasks sharing a file or an interface — the two
tasks, what one produces against what the other consumes, what you found — and one row
per task for whether its own text agrees with itself, the tests it specifies against
the code it specifies, the files it creates against the files it later touches. "The
scan is clean" without those rows is not a scan you ran. Rule on everything it
surfaces before execution begins, each ruling beside its row.

## Model selection

Turn count beats token price: the cheapest model routinely takes two or three times
the turns on multi-step work, and both wall-clock and context cost scale with turns.
Pass `model` on every dispatch — an omitted model inherits the session's, usually the
most expensive one available.

- `haiku` — transcription-grade tasks worked from a complete brief: the brief carries
  the code to write, or the change is a single-file mechanical edit.
- `sonnet` — the floor for every reviewer and for implementers working from a prose
  brief, and the tier for multi-file integration.
- The session model — design judgment, broad codebase understanding, and fix rounds
  that escalate past a stuck `sonnet` implementer.

## Dispatch

A dispatch carries: one line on where the task fits; the brief path, introduced as
"read this first — it is your requirements, with the exact values to use verbatim";
the interfaces and decisions from earlier tasks the brief cannot know; your resolution
of any ambiguity you noticed in it; a pointer to any parked ledger finding in the area
this task touches; and the report-file path (`…/task-N-report.md`) with the report
contract. Exact values live in the brief, never in your prose, and prior-task
summaries go in no dispatch at all — a fresh subagent needs its task, its interfaces,
and the global constraints.

Record the agent identity the dispatch returns: fix rounds 1–3 resume it with
`SendMessage`. The harness notifies you when a subagent finishes, so keep working on
the ledger and the next review package meanwhile.

**Batch small same-shape work.** Several tasks that are each the same one-line fix,
constant change, or field addition across files go out as one dispatch listing every
file and its change, reviewed as a single diff. Reserve one dispatch per task for work
that needs its own judgment, its own tests, or its own review surface.

**Parallel dispatch is bounded.** At most three implementers in flight, and only on
tasks with disjoint file sets and no dependency between them; everything else runs
sequentially, because two agents editing one file produce a conflict neither can see.
Issue the dispatches in the same response — one per response is sequential. Give each
one focused brief covering a single domain, say what it is not to touch, and name the
report shape you want back. When they return, read each report, check that the changes
do not collide (the same files, the same interfaces), and run the full suite once over
the integrated result before reviewing any of the tasks: three suites that passed in
isolation prove nothing about the merge.

Template: [implementer-prompt.md](implementer-prompt.md)

## The report

**DONE** — proceed to review.

**DONE_WITH_CONCERNS** — read the concerns first. Concerns about correctness or scope
get addressed before review; observations get noted and the task proceeds.

**NEEDS_CONTEXT** — supply what was missing and re-dispatch.

**BLOCKED** — assess the blocker. A context problem gets more context and the same
model; a reasoning problem gets a more capable one; an oversized task gets split; a
wrong plan gets a ruling, ledgered and carried into the re-dispatch. Never force the
same model to retry unchanged: if the implementer is stuck, something has to change.

## Review, scaled to risk

Dispatch the task reviewer for tasks whose plan text carries
`**Review:** required — <reason>`, and frame that dispatch as disproving the change.
Every other task closes on the implementer's report and self-review, with a ledger
line. Uniform per-task review found nothing in roughly 98% of this repo's reviewed
tasks, and the catches were security- and parser-shaped — which is what the flag
marks. Escalate an unflagged task to reviewed when the implementer reports
DONE_WITH_CONCERNS or the diff reaches beyond what the plan described, and ledger that
escalation as a ruling.

A reviewer gets three paths — the brief, the report, and the review package — plus the
constraints that bind the task, copied verbatim from the plan or spec (exact values,
formats, stated relationships). The template carries the process rules already. Never
dispatch a reviewer without a diff file, and never pre-judge findings for it: "do not
flag", "at most Minor", or "the plan chose" in a prompt you are writing means you are
sparing yourself a review loop. Let the finding come and adjudicate it.

A reviewer's ⚠️ cannot-verify items are yours to resolve before the task closes — you
hold the plan and the cross-task context it lacks. One you confirm as a real gap
enters the fix loop with the other findings.

Template: [task-reviewer-prompt.md](task-reviewer-prompt.md)

## The fix loop

Spec ❌, any Critical or Important finding, or a ⚠️ item you confirmed opens the loop.
Two things leave it immediately: Minor findings go to the ledger as
`Task <N>: minor (deferred): <one-liner>` and never enter the loop; a finding that
conflicts with what the plan's text mandates is yours to rule on before you act on it
— weigh it against the plan with the spec as the authority, and ledger the ruling.

A round is one fix dispatch plus one scoped re-review. Five rounds at most per task.

1. Rounds 1–3 resume the original implementer with `SendMessage`, findings verbatim.
   Its context is intact: it knows the task, the code, and its own choices.
2. Rounds 4–5 dispatch a fresh implementer one tier up, with the brief path, the
   report path, the open findings, and the framing "a prior implementer attempted this
   task N times; you own it now — read the report file for what was tried." A loop
   that survives three resumes usually means the implementer cannot see its own
   problem.
3. Every round, the implementer re-runs the tests covering the amended code and
   appends a fix report naming those tests, the command, and the output; confirm all
   three are there, then run `review-package PLAN_FILE FIX_BASE HEAD` (FIX_BASE is the
   head the previous review saw) and dispatch
   [re-review-prompt.md](re-review-prompt.md) with the findings, the brief, the report,
   and the printed diff path. New Critical or Important breakage in the fix diff joins
   the open findings; out-of-scope observations go to the ledger, never into the loop.
4. Ledger each round:
   `Task <N>: fix round <R> (<X> addressed, <Y> open — <one-liners>; commits <a7>..<b7>)`.

At the cap, stop dispatching and adjudicate each open finding yourself — adjudicating
earlier to end a loop is pre-judging under another name:

- The reviewer is wrong, or the point is contestable — park it:
  `Task <N>: parked — <finding> — Ruling: <why the code stands>`.
- Real, but nothing downstream builds on it — park it the same way, with a ruling that
  says it is real and deferred.
- Real and load-bearing, because a later task builds on it or it reveals a plan defect
  — rule on the smallest change that unblocks the dependent work, ledger it as
  `Task <N>: Ruling: <finding> — <what you decided and why>`, and carry it into the
  next dispatch. Parking a structural failure silently lets every dependent task build
  on it.

Every adjudication is a ledger entry; a silent discard is not one of the options.

## Completing a task

Append the completion line when the review comes back clean, or when every open
finding is parked with a ruling:
`Task <N>: complete (commits <base7>..<head7>, review clean)` — `self-review only`
in place of `review clean` for an unflagged task, `<K> parked` when findings were
parked at the cap. Tick the plan's checkbox and move on. Never start the next task
while a Critical or Important finding is neither fixed nor parked with a ruling.

## Finish

Collect every ledger line containing `Ruling:` — the pre-dispatch scan's, escalations,
parked findings, adjudications — into your final message under "Rulings I made", in
the order you made them, each with what it costs if wrong. The list is exhaustive: it
is the only place decisions you took on the person's behalf reach them, and a ruling
that dies with the workspace was made in secret.

Then delete the workspace (`rm -rf <workspace>`) — git history is the record now, and
sibling directories belong to other plans. Hand the branch to AGENTS.md §Review:
`/code-review` over the whole branch, and `/security-review` as well when any task
carried the risk flag. §End owns what follows — plan deletion, the PR body, ready for
review. This skill stops here.
