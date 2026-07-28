# Dev Flow v2 — vendored agent process (design)

**Date:** 2026-07-15
**Status:** approved-pending-review
**Scope:** the development *process* of this repo — skills, memory, deferral, config
wiring. No product code changes.

## Goals

1. **Decouple from Claude Code.** Everything that steers an agent lives in the repo,
   harness-agnostic where possible: instructions, skills, hooks, MCP config. Claude Code
   and Codex are both first-class on day one.
2. **Define the next-generation dev flow.** A two-axis session model
   (`pair|auto × spec|task`), beads as the single memory/task substrate, ponytail-style
   laziness discipline, a code-graph MCP, and deliberate low-frequency evolution of the
   process itself.

## Non-goals

- Headless/CI automated sessions (`claude -p --permission-mode dontAsk`). The `auto`
  mode designed here runs in an ordinary interactive session the engineer walks away
  from. Headless wiring is a later slice.
- Linux support for the casing/symlink scheme (macOS case-insensitive FS assumed; if a
  Linux agent ever appears, add uppercase symlinks then).
- Splitting `CONTEXT.md`'s app contract out of the glossary (Pocock's rule says a
  context file is a pure glossary; ours also carries the app contract — noted, parked).
- Docs-site publication of the dev process.

## Decision record (settled during brainstorm)

| # | Decision |
|---|----------|
| D1 | Vendor the process into the repo: fork beads-superpowers/ponytail/Pocock/obra skill content into `.agents/skills/`, modified in place. Discard the obra/superpowers plugin. |
| D2 | Beads (`bd`, Dolt-backed) replaces Claude Code auto memory **and** `docs/defer.md`. Dolt data syncs to the GitHub origin (`bd dolt push`, `refs/dolt/data`). |
| D3 | No committed `.beads/issues.jsonl` (churn + worktree merge conflicts). `export.auto` stays off; `bd export` on demand is the human-readable escape hatch. |
| D4 | Session model: `/session [pair|auto] [spec|task]`. Default `pair`; the agent infers `spec` vs `task` and (in pair) confirms the inference. `auto` only ever by explicit declaration. |
| D5 | Ponytail markers: in-code comment carries a bead ID (`// ponytail: lk-xxxx`); ceiling + upgrade path live in the bead. |
| D6 | Vendored skill set: beads-superpowers core + research-driven-development + write-documentation + document-release; obra `writing-skills`; ponytail + ponytail-review + ponytail-audit + ponytail-debt (not gain/help); Pocock `codebase-design` + `domain-modeling`; ours: `session`, `drain-deferrals`, `release`. No yegge orchestrator agent (its lean-router triage table is folded into `/session`). |
| D7 | Transient artifacts (handoffs, SDD briefs/reports, review diffs, research scratch) live in gitignored `.agents/internal/`. Committed knowledge: `docs/specs`, `docs/plans`, `docs/decisions` (ADRs, new), beads. |
| D8 | Root steering docs go uppercase: `AGENTS.md`, `CLAUDE.md` (committed symlink), `CONTEXT.md`, `DESIGN.md`; `root/readme.md` → `root/README.md`. `docs/` stays lowercase. |
| D9 | `DESIGN.md` stays at the root with a discoverability pointer in `AGENTS.md` (it is currently referenced by nothing); the "stock shadcn, identity via tokens only" rule migrates into it from auto memory. |
| D10 | codebase-memory-mcp: manual per-project wiring only (`.mcp.json` + AGENTS.md nudge); never its `install` auto-configurator. |
| D11 | Codex day-one via `.agents/scripts/setup.mjs` (idempotent bootstrap + doctor) for the parts Codex can't read from the repo. |
| D12 | Process evolves on a slow deliberate cadence (~quarterly resync sessions), tracked in `.agents/UPSTREAM.md`. |

## 1. Repo layout after this work

```
AGENTS.md                      # renamed from agents.md — single source of truth
CLAUDE.md -> AGENTS.md         # committed symlink
CONTEXT.md                     # renamed from context.md (content unchanged)
DESIGN.md                      # renamed from design.md (+ tokens-only rule, see D9)
.agents/
  skills/                      # canonical skills, committed (~31 dirs, see §3)
  hooks/
    session-start              # vendored+adapted memory-injection hook
  scripts/
    setup.mjs                  # bootstrap + doctor (Codex config, binary checks)
  internal/                    # GITIGNORED — handoff/, sdd/, research/, scratch
  UPSTREAM.md                  # divergence ledger (see §9)
.claude/
  skills/<name> -> ../../.agents/skills/<name>   # committed symlinks, one per skill
  settings.json                # committed (see §2)
.mcp.json                      # codebase-memory-mcp, stdio (see §7)
.beads/                        # bd data — fully gitignored; syncs via Dolt refs
docs/
  specs/  plans/  changelog.md # unchanged conventions
  decisions/                   # NEW — ADRs + INDEX.md
```

Removed/retired: `docs/defer.md` (§5), `.superpowers/` (gitignore entry and dir),
the gitignored lowercase `claude.md` symlink, the `"claude.md"` line in `.gitignore`.

**`.gitignore` delta:** `- .superpowers/  - claude.md  + .agents/internal/
+ .beads/  + .codebase-memory/`.

## 2. Claude Code wiring (`.claude/`, committed)

`.claude/settings.json`:

```jsonc
{
  "autoMemoryEnabled": false,                 // beads is the memory now
  "enabledPlugins": {
    "superpowers@claude-plugins-official": false   // repo-scoped disable; other
  },                                               // projects keep the plugin
  "enabledMcpjsonServers": ["codebase-memory-mcp"],
  "hooks": {
    "SessionStart": [ { "hooks": [ {
      "type": "command",
      "command": "$CLAUDE_PROJECT_DIR/.agents/hooks/session-start"
    } ] } ]
  }
}
```

Notes:
- Committed project settings take effect after the one-time workspace-trust acceptance
  per worktree — acceptable.
- `askUserQuestionTimeout` needs nothing: blocking-forever is the default and the key is
  user-settings-only. `AGENTS.md` records "never set it" as a convention.
- Skills load via the committed `.claude/skills/<name>` symlinks (documented, verified
  pattern — same as today's `release`).

## 3. Vendored skill set

All under `.agents/skills/`, plain SKILL.md dirs (Agent Skills standard — Codex reads
`.agents/skills/` natively; Claude Code via the symlinks).

| Source (pinned) | Skills |
|---|---|
| DollarDill/beads-superpowers v0.13.0 | using-superpowers, brainstorming, writing-plans, executing-plans, subagent-driven-development, dispatching-parallel-agents, test-driven-development, systematic-debugging, verification-before-completion, requesting-code-review, receiving-code-review, using-git-worktrees, finishing-a-development-branch, getting-up-to-speed, session-handoff, memory-curator, project-init, stress-test, research-driven-development, write-documentation, document-release |
| obra/superpowers v6.1.1 | writing-skills (dropped upstream in bs v0.12.0; we maintain ~31 skills, we keep the skill for writing skills) |
| DietrichGebert/ponytail (SHA at vendor time) | ponytail, ponytail-review, ponytail-audit, ponytail-debt |
| mattpocock/skills (SHA at vendor time) | codebase-design, domain-modeling |
| ours | session (new, §4), drain-deferrals (new, §5), release (existing) |

**Uniform adaptations** (each recorded in `.agents/UPSTREAM.md`):

- **Names/namespaces:** internal `Skill(beads-superpowers:x)` references become plain
  `x` (project-skill invocation).
- **Paths:** specs → `docs/specs/`, plans → `docs/plans/`, ADRs → `docs/decisions/`,
  transient → `.agents/internal/` (upstream `.internal/` → `.agents/internal/`;
  research output dir likewise).
- **Deferral:** every "file a follow-up" site keeps the Agent-Filed Bead Discipline
  (severity/confidence stamp) and adds the `defer` label where the work is a deliberate
  descope (§5). References to `defer.md`/roadmap are removed.
- **Mode-awareness:** gate sites (spec approval, plan approval, review) reference the
  session contract (§4) instead of assuming a present partner.
- **Ponytail marker rule** rewritten per D5; `ponytail-debt` becomes a bd query (§6).
- **Pocock:** `CONTEXT.md` path kept (root), ADR guidance redirected to the
  beads-superpowers "Capturing Decisions" three-gate convention in `docs/decisions/`
  (the two conventions are word-for-word the same gate; one home).
- **Wiring pointers (pull-based, spec mode only):** brainstorming points to
  codebase-design vocabulary when a design section touches module boundaries, and to
  domain-modeling when a domain term is coined or bent; ponytail-review offered as an
  extra lens at requesting-code-review/finishing time. No new mandatory steps.

## 4. The `/session` skill — mode matrix

`/session [pair|auto] [spec|task]` — invoked at session start; bare `/session` (or no
invocation, nudged by using-superpowers) = `pair` + inferred axis 2.

**Triage first** (adapted from beads-superpowers' lean-router, credited in ledger):

| Request | Route |
|---|---|
| Quick question | Answer. No bead, no skill. |
| Simple change — ONLY typo/comment/rename/single-file obvious fix with an obvious check | Do it, verify with evidence, commit. Bead optional. |
| Research query | research-driven-development. |
| Everything else | The mode contract below. |

**Axis 1 — who approves:**

- **pair** — upstream behavior: interactive brainstorm, partner-approval gates,
  questions block indefinitely. Agent asks rather than assumes.
- **auto** — zero questions. Gates are *substituted, never deleted*: spec/plan approval
  → `stress-test` adversarial interrogation; review gates → the 4-gate subagent review +
  verification-before-completion; upfront context → research-driven-development.
  The "STOP executing immediately when…" list survives verbatim; "stop" resolves to:
  file the blocker as a `human`-labeled bead → write handoff to
  `.agents/internal/handoff/` → `bd remember` continuation key → `bd dolt push` → end
  the turn with a final message stating where and why it stopped. Never guess past a
  blocker. Resume is session-independent: any later session's getting-up-to-speed
  surfaces the continuation memory, handoff, and `bd list --label human`.

**Axis 2 — how much ceremony:**

- **spec** — full cycle: brainstorm → spec (`docs/specs/`) → plan (`docs/plans/` +
  epic/task beads) → execute. Domain-modeling and codebase-design available (§3).
- **task** — no spec, no brainstorm; always a plan, however tiny (plan doc + epic).
  Escalation valve: if scope turns out spec-worthy, pair confirms escalation with the
  engineer; auto escalates by its own judgment and says so in the handoff.

**All quadrants:** subagent-driven development is the default executor; deferral via
beads always available; ponytail active during implementation only (not brainstorm/spec
writing); beads for all tracking — TodoWrite/TaskCreate/markdown TODOs forbidden
(orchestrator-only bead writes, per upstream discipline).

## 5. Beads — memory, tasks, deferral

**Init (one-time, main checkout):** `bd init` with prefix `lk`, embedded Dolt, Dolt
remote = the GitHub origin. Worktrees share the database automatically via git
common-directory discovery (verified with bd 1.1.0). `.beads/` fully gitignored;
`export.auto` off (D3). bd's own git hooks: not installed — the session-start hook and
land-the-plane protocol cover priming and sync.

**Task graph:** writing-plans emits plan doc + atomically-created epic + child tasks
(acceptance criteria embedded, `blocks` edges); execution loops `bd ready --parent
<epic> --claim`; finishing closes the epic. Bead IDs go in commit messages and PR bodies.

**Session close ("land the plane"):** `bd close` → `bd dolt push` → `git push`. A
session isn't done until both pushes succeed.

**Deferral (replaces `docs/defer.md`):** a deliberate descope = a bead labeled `defer`
with the severity/confidence stamp and provenance (spec/plan/PR) in the body. PR bodies
list deferrals filed. The engineer's drain ritual becomes **`/drain-deferrals`** (ours,
pair-mode by design): `bd dolt pull` → gather `defer` beads → dedupe/consolidate/
interpret with the engineer → file GitHub issues with the backlog taxonomy → close
beads with issue URLs → `bd dolt push`. The GitHub project field/option node IDs and
`setIssueFieldValue` mutation currently trapped in auto memory migrate into
`.agents/skills/drain-deferrals/references/github-backlog.md`. GitHub issues remain the
only durable human backlog.

**Memory:** `bd remember` kinds (lesson/pattern/design/root-cause/research) with
`@salience` 1–5; memory-curator consolidates (propose-before-apply); the session-start
hook injects salience ≥ 4 + the latest `continuation-*` key under upstream's byte
budget (lean composition, not full `bd prime`).

**Migration from auto memory (one-time, part of rollout):** port the still-live facts
from `~/.claude/projects/<project-slug>/memory/` into `bd remember`
(feedback → lesson/pattern at high salience; live project facts → memories; shipped
status notes → skip, git history covers them); backlog node IDs → drain-deferrals
reference (above); tokens-only UI rule → `DESIGN.md` (D9). Then `autoMemoryEnabled:
false` lands. The old memory dir stays on disk, unread.

**Final defer.md drain:** existing `docs/defer.md` entries are converted to `defer`
beads during rollout (preserving provenance lines), then the file is deleted.

## 6. Ponytail

- Vendored, default intensity `full`. Active during implementation in every quadrant;
  suspended during brainstorm/spec-writing (stated in `/session`).
- **Marker rule (the modified line):** cutting a deliberate corner files a chore bead
  (label `ponytail`, ceiling + upgrade path in the body) and leaves `// ponytail:
  lk-xxxx` at the site.
- **ponytail-debt** becomes a bd query plus a two-way orphan check (comments without
  beads; beads whose anchors vanished).
- **ponytail-review** (diff, over-engineering-only findings) and **ponytail-audit**
  (repo-wide, one-shot) vendored as optional lenses. gain/help not vendored.
- `AGENTS.md`'s "Lazy, Not Negligent" section shrinks to a pointer at the skill; its
  trust-boundary/data-loss/security/accessibility floor is preserved verbatim inside
  the vendored ponytail's "When NOT to be lazy" (it already carries the same list).

## 7. codebase-memory-mcp

- Committed `.mcp.json`:

```json
{
  "mcpServers": {
    "codebase-memory-mcp": { "command": "codebase-memory-mcp", "args": [] }
  }
}
```

- **Never** run its `install` auto-configurator (rewrites global configs, installs
  user-wide hooks/skills). Manual wiring only (D10).
- `AGENTS.md` adoption nudge: graph search (`search_graph`, `trace_path`,
  `detect_changes`) first for structure/call-path/impact questions; fall back to grep
  when it returns too little. getting-up-to-speed indexes the current worktree on
  demand at session start if missing/stale.
- `.codebase-memory/` gitignored. `auto_watch` left default-on; revisit note filed as a
  bead if eight worktrees' watchers become noticeable.
- Version: ≥ 0.8.1 (current brew). 0.9.0's `semantic_query` adopted when the formula
  catches up; upgrades may require a cache wipe (`~/.cache/codebase-memory-mcp/`).

## 8. Codex, day one

Codex reads `AGENTS.md` and `.agents/skills/` natively — the layout is Codex-first by
construction. What it can't read from the repo, `.agents/scripts/setup.mjs` provides
(idempotent, re-runnable, prints a doctor report):

1. Patch `~/.codex/config.toml`: `[mcp_servers.codebase-memory-mcp]` entry.
2. Register beads' Codex hooks (`bd setup codex`).
3. Verify: `bd` ≥ 1.1.0, `codebase-memory-mcp` present, `CLAUDE.md` symlink intact,
   skills symlinks unbroken. Loud failure beats the documented silent-hook failure mode.

The script doubles as the fresh-machine doctor for the Claude Code side.

## 9. Upstream ledger and resync ritual

`.agents/UPSTREAM.md` records, per vendored source: upstream repo, pinned
version/SHA, vendor date, and every local divergence with its one-line reason
(the beads-superpowers "Known Deliberate Divergences" pattern, one level down).

A **resync** (~quarterly, or when a bd upgrade forces it) is a deliberate `/session
pair spec` piece of work: diff pinned→latest upstream, port what's wanted, re-verify
with writing-skills' testing discipline, update the ledger, one PR. `bd` and
`codebase-memory-mcp` upgrades are likewise deliberate events — the skills encode bd
CLI idioms, so the tested bd version is recorded in the ledger.

## 10. AGENTS.md rewrite (summary of edits)

Kept: architecture, build & test, surgical changes, surface-don't-assume, branching/PR
shape, releases, changelog buffer, definition-of-done.
Changed: workflow intro points at `/session`; "Lazy, Not Negligent" → ponytail pointer
(§6); deferral convention rewritten to beads + `/drain-deferrals` (§5); backlog section
notes bead IDs; adds the codebase-memory nudge (§7), the `DESIGN.md` pointer (D9), the
uppercase steering-doc convention (D8), and the "never set `askUserQuestionTimeout`"
note (§2).

## 11. Rollout — four PRs off this spec

1. **feat(dev-flow): config decoupling** — uppercase renames + committed `CLAUDE.md`
   symlink, initial `.claude/settings.json` (MCP approval only — the `autoMemoryEnabled`
   flip lands with PR 2 after migration; hook wiring and the plugin disable land with
   PR 3), `.mcp.json`, `.gitignore` delta, `DESIGN.md` pointer + tokens rule, AGENTS.md
   partial rewrite. Smallest reviewable unit; the session still runs on the plugin
   at this point.
2. **feat(dev-flow): beads adoption** — `bd init` + Dolt remote, memory migration,
   the `autoMemoryEnabled: false` flip, defer.md → defer beads + deletion,
   drain-deferrals skill (with the backlog reference), AGENTS.md deferral rewrite.
3. **feat(dev-flow): vendored skills** — the full `.agents/skills/` tree + symlinks +
   session-start hook + hook wiring + superpowers plugin disable + upstream ledger.
   The big one; review = spot-check adaptations against the ledger.
4. **feat(dev-flow): ponytail + graph + codex** — ponytail family, Pocock pair,
   `.agents/scripts/setup.mjs`, Codex verification.

(Ordering rationale: each PR leaves the repo in a working state; the plugin keeps
serving until PR 3 swaps it out atomically.)

## 12. Verification

- One smoke session per quadrant (`pair spec`, `pair task`, `auto spec`, `auto task`)
  exercising: triage short-circuits, gate substitution in auto, a STOP → resume cycle,
  a ponytail marker round-trip (bead + comment + ponytail-debt query), a deferral →
  `/drain-deferrals` dry-run.
- Fresh-worktree test: new worktree sees skills, settings, MCP after trust; `bd where`
  resolves to the shared database.
- Codex smoke: `setup.mjs` run, skills discovered from `.agents/skills/`, AGENTS.md
  loaded, one small task end-to-end.
- Hook check: session-start under the byte envelope; loud failure with `bd` renamed
  away.

## 13. Deferred (filed as beads once §5 lands)

- `semantic_query` adoption when brew ships ≥ 0.9.x.
- Watcher-load revisit if worktree count hurts.
