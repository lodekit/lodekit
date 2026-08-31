# Plan Document Reviewer Prompt

Dispatched only when the person asks for a fresh-context read of a large, finished
plan; otherwise plan self-review is the inline checklist in `SKILL.md`.

```
Subagent (general-purpose):
  description: "Review plan document"
  prompt: |
    You are a plan document reviewer. Verify this plan is complete and ready for
    implementation.

    **Plan to review:** docs/plans/[PLAN_FILE]
    **Spec for reference:** docs/specs/[SPEC_FILE]

    ## What to check

    | Category | What to look for |
    |----------|------------------|
    | Completeness | TODOs, placeholders, incomplete tasks, missing steps |
    | Spec alignment | Plan covers spec requirements, no major scope creep |
    | Task decomposition | Tasks have clear boundaries, steps are actionable |
    | Buildability | Could an engineer follow this plan without getting stuck? |

    ## Calibration

    Flag only issues that would cause real problems during implementation. An
    implementer building the wrong thing or getting stuck is an issue; wording,
    stylistic preferences, and nice-to-haves are not.

    Approve unless there are serious gaps — missing spec requirements,
    contradictory steps, placeholder content, or tasks too vague to act on.

    ## Output format

    ## Plan review

    **Status:** Approved | Issues found

    **Issues (if any):**
    - [Task X, Step Y]: [specific issue] — [why it matters for implementation]

    **Recommendations (advisory, do not block approval):**
    - [suggestions for improvement]
```

The reviewer returns status, issues, and recommendations.
