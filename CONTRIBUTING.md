# Contributing

## Closed for contributions

Pull request and issue creation are **disabled prior to an initial release**.
Bug reports and other feedback should be submitted to the community chat once
the first release goes live.

## Development process

Lodekit is developed entirely with coding agents. The process tooling is checked
into the repository: `AGENTS.md` (how work is tracked, developed, and released)
plus the steering docs and specs under `docs/`. They are the context and
guardrails for the agent in every session that changes the product or the
engineering.

## How this codebase is written

Lodekit is written almost entirely by AI coding agents. Every change is
directed, reviewed, and accepted by a human maintainer, who holds editorial
control over the codebase and is accountable for what lands in it. The
specification and plan documents in `docs/` are the record of that direction.

We say this plainly because it is true and because it sets the right
expectations — see the disclaimer in the README.

## Review and audit policy

While Lodekit is in pre-alpha with no public release, a maintainer reviews the
specs and plans, not every line of code. At this stage maintainers steer
architecture, technical choices, dependencies, security guidelines, interfaces,
and the other engineering concerns that shape long-term decisions, technical
debt, and the health of the codebase. That direction is recorded in
`docs/specs/` and reflected in `docs/plans/`.

The review and audit level will increase gradually in later stages, and this
document will be updated with the new policy.
