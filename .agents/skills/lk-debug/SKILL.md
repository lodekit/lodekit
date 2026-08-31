---
name: lk-debug
description: Carries the bug lane's method — reproduce, find the root cause, fix that, and land a regression test with it. Load on any bug, test failure, or unexpected behavior, before proposing a fix.
---

# Debug

The lane (AGENTS.md §Develop): reproduce the bug before fixing it, find the cause, fix
that, and land the regression test with the fix in the same PR, at the lowest rung of
the testing ladder that catches the break — pure logic → the owning package's vitest;
component render → `@lodekit/ui` render tests; cross-frontend health → `pnpm e2e`.
Pre-existing problems found on the way are not this bug's scope: each becomes one
`docs/TODO.md` line, `- [YYYY-MM-DD · session] description`, in the same PR. The fix
ships on a branch and through a PR, like any change.

Four goals, each narrowing the next: the root cause, the pattern around it, one
hypothesis, then the fix. Skipping ahead produces the change that moves the symptom
and leaves the cause.

## Find the root cause

Read the error and the whole stack trace: they often name the file, the line, and the
condition outright, and a skimmed trace is how an afternoon goes into a bug the first
screen described.

Reproduce it consistently before anything else: without a trigger you can pull on
demand there is no telling a fix from a coincidence. When it will not reproduce, gather
more data — logs, inputs, environment — rather than guess.

Check what changed recently — `git log`, the diff since last known-good, new
dependencies, config: most bugs arrive with a change, and that change is the shortest
path to the cause.

When the failure crosses components — request → engine → SDK → database — instrument
every boundary at once, logging what enters and leaves each, then run once and read
where the data first goes wrong. One layer per run costs a run per layer and still
misses the interaction between them.

When the bad value shows up deep in a call stack, trace it backward to where it
originated rather than patch it where it surfaced; `root-cause-tracing.md` beside this
file carries the technique. Flakiness shaped like timing — passes locally, fails under
load — is usually an arbitrary sleep; `condition-based-waiting.md` carries that fix.

## Find the pattern

Find code in this repo that does the same thing and works, and read it completely
rather than skim for the part you expect to differ. List every difference between it
and the broken path, the ones that look irrelevant included: "that can't matter" is the
assumption a bug hides behind.

## State one hypothesis

Write the cause down as a plain sentence — "X is the root cause, because Y". A
hypothesis you can state is one you can be wrong about; a vague hunch absorbs whatever
happens next.

Test it with the smallest change that could confirm or refute it, one variable at a
time: change two things and a pass says nothing about which one mattered. If it is
refuted, form a new hypothesis rather than stack a second fix on the first.

## Implement the fix

Fix the cause at its source, in one change — no bundled refactoring, nothing "while I'm
here"; a mixed diff hides which line fixed the bug.

Validate at the boundary you fixed, not every layer the value crossed: one guard where
bad input enters closes the class of bug; guards everywhere are noise for the next
reader.

The regression test is the reproduction, made automatic: write it so it fails on the
old code for the reason the bug did, then confirm it passes and the suite still does.

## When three fixes have failed

Count the attempts. Three failed fixes mean the design is wrong, not that a fourth
guess is due — especially when each fix reveals new coupling somewhere else. Stop and
discuss it with the person: that pattern is a wrong architecture, not a failed
hypothesis, and another attempt adds to what has to be undone.

## When there is no root cause

Some issues really are environmental, timing-dependent, or external. Say what you
investigated, handle the failure explicitly (a retry, a timeout, a clear error), and
log enough for the next occurrence. But 95% of "no root cause" conclusions are
incomplete investigation, so treat it as a finding to justify rather than an exit.
