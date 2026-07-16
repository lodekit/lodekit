# Upstream ledger

The dev process is vendored (spec: `docs/specs/2026-07-15-dev-flow-v2-design.md`).
Resyncs are deliberate — roughly quarterly, one PR each. Every local divergence from
an upstream file is recorded here; a resync diffs pinned→latest, ports what's wanted,
re-verifies (writing-skills discipline), and updates this ledger.

## Sources

| Source | Pinned | Vendored | Provides |
|---|---|---|---|
| github.com/DollarDill/beads-superpowers | v0.13.0 (`53371f69b02164640745e8c4cfa16897b93517b7`) | 2026-07-16 | 21 skills + session-start hook |
| github.com/obra/superpowers | v6.1.1 | 2026-07-16 | writing-skills |
| github.com/DietrichGebert/ponytail | `16f29800fd2681bdf24f3eb4ccffe38be3baec6b` | 2026-07-16 | ponytail, ponytail-review, ponytail-audit, ponytail-debt |
| github.com/mattpocock/skills | `9603c1cc8118d08bc1b3bf34cf714f62178dea3b` | 2026-07-16 | codebase-design, domain-modeling |

Tooling versions last verified against: `bd` 1.1.0, `codebase-memory-mcp` 0.8.1.
`bd`/`codebase-memory-mcp` upgrades are deliberate events — re-verify and update this
line.

## Divergences

### beads-superpowers
- `Skill(beads-superpowers:X)` namespace refs → bare project-skill names.
- Paths: `.internal/specs` → `docs/specs`; `.internal/plans` → `docs/plans`; all other
  `.internal/*` → `.agents/internal/*`.
- defer.md/roadmap/markdown-TODO references → `defer`-labeled beads (AGENTS.md).
- Partner-approval gate sites carry a "Session mode note" pointing at the `session`
  skill's gate table.
- session-start hook: paths as above; missing `bd` fails loud (stderr + context note).
- Not vendored: `writing-skills` (kept from obra instead), the yegge example workflow
  (its lean-router triage table is folded into our `session` skill, credited),
  `auditing-upstream-drift` (maintainer-only upstream).
- using-superpowers: added a one-line session-mode nudge (spec §4) — undeclared sessions route through the `session` skill.
- setup.mjs does not run `bd setup codex` (repo-mutating in project mode; person-approved
  spec §8 deviation) — Codex bd-priming is a defer bead.

### obra/superpowers
- writing-skills: plan-location references → `docs/plans/`; namespace refs → bare.

### ponytail
- Marker rule: `ponytail: <ceiling>, <upgrade>` comment → chore bead labeled
  `ponytail` (ceiling + upgrade path in the body) + `// ponytail: <bead-id>` anchor
  comment at the site.
- ponytail-debt: grep harvest → bd query + two-way orphan check.
- Not vendored: ponytail-gain, ponytail-help.

### mattpocock/skills
- CONTEXT.md path: repo root (matches our existing file).
- ADR guidance → `docs/decisions/` via the "Capturing Decisions" three-gate convention
  in using-superpowers (identical gate; single home).

### ours (no upstream)
- session, drain-deferrals, release.
