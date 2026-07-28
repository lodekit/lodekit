# Contributing

## Contributions are closed for now

Lodekit does not accept outside pull requests at this time. This is a
deliberate choice for the alpha, not a judgement about anyone's code, and it
will change as the project and the maintainer's review capacity mature.

Issues and pull requests are restricted to collaborators while this holds. If
you have found a bug or have an idea, forking and exploring is welcome — the
whole point of the license is that you can.

## The development process is public on purpose

`AGENTS.md`, `.agents/skills/`, `docs/specs/`, `docs/plans/`, and
`docs/decisions/` are not incidental artifacts. They are the engineering
documentation: the coding conventions, the review habits, the design reasoning,
and the workflow the agents working on this codebase are expected to follow.

If you want to understand how a decision was reached, the spec and plan for it
are in the repository. If you fork Lodekit and work on it with an agent of your
own, that process is yours to reuse — `.agents/skills/` is vendored from
upstream projects under their own licenses, recorded in `.agents/UPSTREAM.md`.

## How this codebase is written

Lodekit is written almost entirely by AI coding agents. Every change is
directed, reviewed, and accepted by a human maintainer, who holds editorial
control over the codebase and is accountable for what lands in it. The
specification and plan documents in `docs/` are the record of that direction.

We say this plainly because it is true and because it sets the right
expectations — see the disclaimer in the README.
