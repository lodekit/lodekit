# agents

lodekit is a <TODO>. See `readme.md` and `docs/specs/` for detail.

Behavioral guardrails for development workflow.
Standard workflow uses the Superpowers skills.
For trivial tasks, use judgment.

## Architecture

TODO

## Build & Test

TODO

## Lazy, Not Negligent

Simplicity never means cutting safety.

- Always keep trust-boundary validation, data-loss handling, security, and accessibility.
- A single smoke test or assert is the minimum, not bloat.
- Only unnecessary complexity gets removed.

## Surgical Changes

- Every changed line must trace directly to the request.
- Touch only what you must. Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken. Match existing style, even if you'd do it differently.
- Remove imports, variables, and functions that YOUR changes made unused.
- Don't delete pre-existing dead code. If you notice it, mention it.


## Surface, Don't Assume

- When something is genuinely ambiguous and the plan doesn't settle it, name the ambiguity and present the options.
- Don't pick an interpretation silently.
- If a simpler path exists than the one requested, say so before building.

## Conventions

- **Branching:** Trunk-based — commit directly to `master`. No feature branches.
- **Commits:** Do not add `Co-Authored-By` trailers to commit messages.
- **Docs:** Specs live in `docs/specs/`. Plans live in `docs/plans/`.
- **Roadmap:** `roadmap.md` is the roadmap file — it tracks deferred work and known gaps. Add parked items there.