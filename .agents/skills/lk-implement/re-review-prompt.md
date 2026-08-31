# Re-review prompt

Dispatched after a fix round. The re-reviewer verdicts each finding and checks the fix
diff for new breakage; the full review already happened.

```
Agent (general-purpose):
  description: "Re-review Task N fix round R"
  model: [REQUIRED — per SKILL.md Model selection; a small fix diff takes the
         cheap-to-mid tier]
  prompt: |
    You are re-reviewing one task's fix round. A previous review produced
    findings and an implementer has attempted to fix them. Verdict each
    finding and inspect the fix diff — nothing else.

    ## The task

    Read the task brief: [BRIEF_FILE]

    ## The findings under verification

    [FINDINGS]

    ## The fix

    Read the implementer's report, with fix reports appended at the end:
    [REPORT_FILE]

    **Fix base:** [FIX_BASE_SHA] (the head the previous review saw)
    **Head:** [HEAD_SHA] **Diff file:** [DIFF_FILE]

    Read the diff file once: it holds the fix commits, a stat summary, and the
    fix diff with context. If it is missing, run
    `git diff --stat [FIX_BASE_SHA]..[HEAD_SHA]` and
    `git diff [FIX_BASE_SHA]..[HEAD_SHA]`.

    Your review is read-only on this checkout: do not mutate the working tree,
    the index, HEAD, or branch state. Do this review yourself — a reviewer you
    spawn duplicates a seat at full cost and its verdict counts for nothing.

    ## Scope

    Your scope is the findings list and the fix diff. Verdict every finding,
    and look for problems the fix itself introduced. Do not re-review code the
    fix did not touch: an issue entirely outside the fix diff goes under
    Out-of-scope observations, where it neither blocks this task nor extends
    the loop. The whole-branch review comes later.

    ## Tests

    The implementer re-ran the tests covering the amended code and appended the
    results. Treat that as unverified claims: confirm the fix report names
    those tests and shows their output, and check the claims against the diff
    rather than re-running the suite. Run a focused test only when reading the
    code raises a doubt no existing run answers.

    ## Output format

    Your final message is the report. Begin with the first finding's verdict;
    every line is a verdict, a finding with file:line, or a check you ran.

    ### Finding verdicts
    For each finding, in order: **[the finding]** — ADDRESSED | NOT ADDRESSED,
    with file:line evidence. "Attempted" is not addressed — the specific defect
    has to be gone.

    ### New breakage in the fix diff
    What the fix broke or introduced, with severity (Critical / Important /
    Minor) and file:line. "None" if clean.

    ### Out-of-scope observations
    Issues entirely outside the fix diff; the controller ledgers these. "None"
    if none.

    ### Verdict
    **Fix round:** [all findings addressed, no new Critical or Important
    breakage | findings remain open — list them]
```

**Placeholders:** `[BRIEF_FILE]` the task brief; `[FINDINGS]` the previous review's
Critical and Important findings and spec gaps, verbatim, one per bullet;
`[REPORT_FILE]` the implementer's report with fix reports appended; `[FIX_BASE_SHA]`
the head the previous review saw; `[HEAD_SHA]` the current commit; `[DIFF_FILE]` the
path `scripts/review-package PLAN_FILE FIX_BASE HEAD` printed.
