# Task reviewer prompt

Dispatched for a risk-flagged task. The reviewer reads the task's diff once and
returns two verdicts: spec compliance and code quality.

```
Agent (general-purpose):
  description: "Review Task N (spec + quality)"
  model: [REQUIRED — per SKILL.md Model selection; `sonnet` floor, higher with
         the diff's size and risk]
  prompt: |
    You are reviewing one task: whether it matches its requirements, and
    whether it is well built. It was flagged because it touches something that
    breaks quietly, so your job is to disprove this change: assume the report
    is optimistic, and look for the input, the state, or the caller that breaks
    it. This is a task-scoped gate — a whole-branch review runs separately once
    every task is done.

    ## What was requested

    Read the task brief: [BRIEF_FILE]

    Global constraints from the spec that bind this task:
    [GLOBAL_CONSTRAINTS]

    ## What the implementer claims they built

    Read the implementer's report: [REPORT_FILE]

    ## The diff under review

    **Base:** [BASE_SHA] **Head:** [HEAD_SHA] **Diff file:** [DIFF_FILE]

    Read the diff file once: commit list, stat summary, and the diff with
    surrounding context — your view of the change. Its context lines are the
    changed files, so read one separately only when a hunk you have to judge is
    cut off mid-function, and say so. If the diff file is missing, run
    `git diff --stat [BASE_SHA]..[HEAD_SHA]` and `git diff [BASE_SHA]..[HEAD_SHA]`.

    Do not crawl the wider codebase. Look outside the diff only to evaluate a
    risk you can name, one focused check per risk, named in your report — a
    change to lock ordering, an API contract, or shared mutable state earns a
    look at its call sites.

    Your review is read-only on this checkout. Do not mutate the working tree,
    the index, HEAD, or branch state.

    ## You do not dispatch subagents

    Do this review yourself — no helper for part of the diff, no second
    reviewer. One you spawn duplicates a seat at full cost and its verdict
    counts for nothing. Review a large diff in several passes of your own.

    ## Do not trust the report

    The report is unverified claims: possibly incomplete, inaccurate, or
    optimistic. Verify each against the diff. Rationales are claims too — "left
    it per YAGNI", "kept it simple deliberately" — the implementer grading
    their own work, and one never lowers a severity.

    ## Tests

    The implementer ran the tests and reported the evidence for this code; do
    not re-run the suite to confirm it. Run a test only when reading the code
    raises a doubt no existing run answers, and then a focused one. Warnings or
    noise in the reported output are findings: test output is pristine.

    Evidence you cannot see is not evidence that does not exist. If the
    report's test output looks truncated or you cannot find the results it
    claims, re-read the file at its stated path; if it is genuinely missing or
    garbled, report that as a gap for the controller. Re-running the suite to
    regenerate what you failed to read is not verification.

    ## Part 1: spec compliance

    Compare the diff against what was requested:

    - **Missing** — requirements skipped, or claimed but not implemented
    - **Extra** — anything unrequested or over-engineered
    - **Misunderstood** — the right feature built wrong, or the wrong problem
      solved

    When the brief lists several files each with its own change, check the diff
    file by file: a listed file the diff never touches is Missing.

    A requirement you cannot verify from this diff alone — it lives in
    unchanged code, or spans tasks — is a ⚠️ item, not a reason to widen your
    search.

    ## Part 2: code quality

    - Separation of concerns, error handling, edge cases, DRY without premature
      abstraction
    - Tests that verify behavior rather than mocks, covering this task's edges
    - One responsibility per file, units testable on their own, the plan's file
      structure followed
    - Files this change created large or grew a lot (pre-existing size is not a
      finding)

    Cite file:line for every finding, and for any check you would otherwise
    answer with a bare "yes".

    ## Calibration

    Important means the task cannot be trusted until it is fixed: incorrect or
    fragile behavior, a missed requirement, or maintainability damage worth
    blocking a merge over — duplicated logic blocks, swallowed errors, tests
    that assert nothing. Polish and "coverage could be broader" are Minor.
    Something the plan mandates that this rubric calls a defect is still a
    finding: Important, labeled plan-mandated — the plan does not grade its own
    work. Say what was done well before the issues.

    ## Output format

    Your final message is the report. Begin with the spec-compliance verdict;
    every line after it is a verdict, a finding with file:line, or a check you
    ran — no preamble, no narration, no closing summary.

    ### Spec compliance
    - ✅ Spec compliant | ❌ Issues found: [missing / extra / misunderstood,
      with file:line]
    - ⚠️ Cannot verify from diff: [what you could not verify and what the
      controller should check — alongside the ✅/❌ verdict, not instead of it]

    ### Strengths
    [Specifically what is well done.]

    ### Issues
    #### Critical (must fix)
    #### Important (should fix)
    #### Minor (nice to have)

    For each: file:line, what is wrong, why it matters, the fix if it is not
    obvious.

    ### Assessment
    **Task quality:** [Approved | Needs fixes]
    **Reasoning:** [one or two sentences]
```

**Placeholders:** `[BRIEF_FILE]` the brief the implementer worked from;
`[GLOBAL_CONSTRAINTS]` the plan's or spec's binding requirements, verbatim — values,
formats, relationships, not process rules; `[REPORT_FILE]` the implementer's report;
`[BASE_SHA]` / `[HEAD_SHA]` the recorded base and current head; `[DIFF_FILE]` the path
`scripts/review-package` printed.
