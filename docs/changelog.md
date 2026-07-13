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

## New

- **Lodekit 0.1.0 — the first release.** A local, self-hosted runtime for building and
  running your own personal web tools with an AI coding agent: a menubar manager
  supervising the platform, apps served from your `~/Documents/Lodekit` folder, a
  dashboard at `lodekit.localhost:7777`, and a full service catalog — database, kv,
  files, events, tasks, settings, secrets, logging, and gateways to external services —
  reachable from apps through the SDK and from your agent through MCP. Ships as a
  signed-for-local-use mac app for Apple silicon and Intel.
