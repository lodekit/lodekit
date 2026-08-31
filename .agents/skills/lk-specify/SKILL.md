---
name: lk-specify
description: Carries the feature lane's design dialogue, from exploring the ask to a spec the person has approved. Load it when a feature needs a spec, after the lane is chosen.
---

# Specify

The feature lane's design method: it begins once the lane is chosen (AGENTS.md §Start)
and ends with the spec on a draft PR (§Specify). Lanes are chosen there, not here.

## Explore before asking

Read the project state first — the files the ask touches, the steering docs that govern
them, recent commits. A question asked from the code is about the real decision; one
asked cold spends the person's attention on what you could have read.

## Check the scope before refining it

Then ask whether the request is one thing. If it describes several independent
subsystems, say so and help decompose it: what the pieces are, how they relate, what
order they get built. Design the first piece here; each piece gets its own spec, plan, and
implementation. Questions refining a design the split will discard are wasted.

## Ask one question per message

Ask one question per message: a person answers a single question in one keystroke; a
list gets a paragraph that answers none of them fully. Prefer multiple choice — the
options show what you think the space is, so the person can correct the framing and not
just the answer. Use the harness's structured question tool (AskUserQuestion in Claude
Code; a numbered list where the harness has none).

Aim at purpose, constraints, and success criteria — what the person wants true
afterwards, what the design may not do, how we will know it worked. The code cannot
tell you those; the rest of it can.

## Offer two or three approaches

Propose two or three approaches with their trade-offs, lead with the one you recommend,
and say why: one approach is a decision taken without the person, a menu of five hands
it back untriaged. Apply YAGNI to each — an unrequested feature costs a sentence to drop
now and a subsystem to remove later.

## Present the design in sections

Present it in sections scaled to their complexity — a few sentences where it is
straightforward, two or three hundred words where it is nuanced — covering
architecture, components, data flow, error handling, and testing. Ask after each
section whether it holds: an assumption caught in section two costs a sentence; found
after the whole design, it costs the design. Re-open a section when a later answer
contradicts it.

## Design for isolation and clarity

Break the system into units that each have one clear purpose, talk through defined
interfaces, and can be understood and tested on their own; for each, say what it does,
how it is used, and what it depends on. If someone cannot tell what a unit does without
reading its internals, or the internals cannot change without breaking consumers, the
boundaries are wrong. Small units also fit your context better; a file that has grown
large is usually doing too much.

## Working in existing code

Follow the patterns already there. Where existing code has problems that touch this
work — a file grown too large, tangled responsibilities — put the targeted fix in the
design, the way a developer improves code they work in. Leave unrelated refactoring
out: it makes the diff hard to review and the spec hard to approve.

## Write the spec

Write `docs/specs/YYYY-MM-DD-<slug>-design.md` in the house format — Goals, Non-goals,
Decision record, numbered design sections, Rollout, Verification — with prose wrapped
at ~90 columns.

The Decision record carries one entry per choice the person made, each naming the
alternative it foreclosed: that is how the spec answers "why not the other way" months
later, and it keeps the plan from re-opening a settled question.

Scope that falls out goes to `docs/TODO.md` as one line,
`- [YYYY-MM-DD · spec:<slug>] description`, in the same PR — a dropped idea that lives
only in the transcript is lost.

## Self-review, then hand off

Read the finished spec with fresh eyes, fixing inline:

- **Placeholders** — "TBD", "TODO", or a section still vague.
- **Internal consistency** — sections that contradict each other, or an architecture
  that does not match the features it serves.
- **Scope** — one plan's worth of work, or still in need of splitting?
- **Ambiguity** — a requirement two people could read two ways. Pick one and say it.

There is no second pass. If the person asks for a fresh-context read of a large spec,
`spec-document-reviewer-prompt.md` beside this file is the brief.

Then commit the spec, push, and open the draft PR (AGENTS.md §Specify): the person
approves in session, comments on the PR, or edits the file. The spec is approved before
planning starts.
