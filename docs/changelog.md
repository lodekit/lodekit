# Changelog buffer

Unreleased, user-facing changes. A slice that ships something a Lodekit user can see or
do appends an entry here, in the same PR as the code; `/release` drains this file into
the docs changelog page (`web/docs/src/content/docs/changelog.md`) and resets it.

Rules:

- **Append-only for agents** — never reword or remove existing entries; editorial
  cuts and rewording happen in the release PR review.
- **Write for a person using Lodekit** — what they can do now, never how it was built.
  One entry per product change, `**Bold name** — description` shape.
- **Internal work appends nothing** — refactors, docs, bookkeeping, and tooling stay
  out; user-noticeable fixes go under `## Fixed`.
- Keep the `## New` / `## Fixed` headings; the drain lifts them verbatim. Omitting an
  empty section is fine.

---
