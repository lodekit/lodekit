---
name: lk-plan
description: Writes the implementation plan an executor runs from — ordered, self-contained tasks with exact files, interfaces, and commands. Load after the spec is approved and before implementation starts.
---

# Plan

Write for an engineer with zero context for this codebase: skilled, but knowing
nothing of our toolset, domain, or conventions. A task is the whole brief its
executor gets, so everything they need sits inside it: files to touch, code,
commands, the output to expect.

## Before writing tasks

**Scope check.** One plan per independent subsystem, each producing working, testable
software on its own. If the spec spans several, split it and say so; a spec may ship
as two or more plans, executed in order.

**File structure.** Map which files get created or modified, and what each is
responsible for, before defining any task — decomposition gets locked in here. One
responsibility per file; files that change together live together; split by
responsibility, not by technical layer. Follow the codebase's existing patterns rather
than restructuring it, though splitting a file the work already touches is fair once it
has grown unwieldy.

**Task right-sizing.** A task is the smallest unit that carries its own test cycle and
is worth a fresh reviewer's gate. Fold setup, configuration, scaffolding, and
documentation steps into the task whose deliverable needs them. Split only where a
reviewer could reject one task while approving its neighbor.

## Header

```markdown
# [Feature] Implementation Plan

> Executed inline or with `lk-implement` per AGENTS.md §Implement. Steps track
> with checkboxes (`- [ ]`).

**Goal:** [one sentence: what this builds]
**Architecture:** [2–3 sentences: the approach]
**Tech Stack:** [key packages and tools]
**Spec:** [path to the spec this plan implements — the plan argues from the spec,
so the spec travels with it; executors read both]

## Decisions already made

[One quotable line per decision the person took while specifying or planning, with
the alternative it foreclosed where that is known.]

## Global constraints

[The spec's project-wide requirements — version floors, dependency limits, naming
and copy rules — one line each, values copied verbatim from the spec. Every task's
requirements include this section.]
```

A plan never re-asks a recorded decision and never recommends against one: the person
already answered, and reopening it spends their attention twice. If a later task looks
like it needs a decision reversed, the task names the recorded decision it conflicts
with and stops there for the person to rule.

## Task structure

````markdown
### Task N: [component]

**Files:**
- Create: `packages/engine/src/thing.ts`
- Modify: `packages/engine/src/server.ts:120-145`
- Test: `packages/engine/test/thing.test.ts`

**Interfaces:**
- Consumes: [what this uses from earlier tasks — exact signatures]
- Produces: [what later tasks rely on — exact names, parameter and return types.
  An implementer sees only their own task; this block is how they learn the names
  their neighbors use.]

**Review:** required — parses untrusted request bodies

- [ ] **Step 1:** [action]

```ts
// the actual code
```

- [ ] **Step 2:** run `pnpm --filter @lodekit/engine test`

Expected: `thing.test.ts` passes, 4 assertions.
````

The **Review** line appears only when the task touches a trust boundary, a parser,
auth, network egress, or data loss; otherwise omit it. Only those tasks get a
fresh-context task review during execution — every other task is covered by the
implementer's self-review and the whole-branch review before the PR leaves draft, so
flagging everything only buys noise.

## No placeholders

Every step carries the content the engineer acts on. These are plan failures:

- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above", without the test code
- "Similar to Task N" — repeat the code, since tasks are read out of order
- Steps that say what to do without showing how (code steps need code blocks)
- References to types, functions, or methods no task defines

## Portable paths

A committed plan carries no machine-local paths: repo-relative paths for files in the
tree, `<worktree>` or `$SCRATCHPAD` placeholders for machine-local inputs. Other
sessions on other machines read this file; a home-directory path breaks for them and
leaks who wrote it.

## Self-review

Run this over the finished plan yourself, and fix what it turns up inline.

1. **Spec coverage** — walk each spec requirement and point at the task that
   implements it. A requirement with no task gets one.
2. **Placeholder scan** — search the plan for the patterns above.
3. **Type consistency** — signatures, method names, and property names in later tasks
   match what earlier tasks defined. `clearLayers()` in Task 3 and `clearFullLayers()`
   in Task 7 is a bug.

## Lifecycle

Save to `docs/plans/YYYY-MM-DD-<slug>.md`, header naming the spec it implements.
Commit and push so the plan is reviewable on the draft PR, then tick checkboxes and
push as tasks land — the PR is the live progress view across sessions. Plans are
deleted before merge and permalinked from the PR body; `docs/plans/README.md` carries
the details.

For a large plan the person may ask for a fresh-context read; dispatch
`plan-document-reviewer-prompt.md` then, and only then.
