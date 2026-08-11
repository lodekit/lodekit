# Dev Flow v3 — skill-less process, consolidated steering (design)

**Date:** 2026-08-10 · **Updated:** 2026-08-11
**Status:** draft-for-review
**Scope:** the development *process* of this repo — steering docs, deferrals, config
wiring. No product code changes.
**Evidence base:** `docs/research/2026-08-06-dev-process-audit-and-v3-proposal.md`
(the audit of 630 session transcripts and the direction set from it). This spec cites
it as "the audit" and does not re-derive its findings.

## Goals

1. **One steering doc instead of a skill tree.** All process guidance lives in a short
   AGENTS.md that states goals and constraints, not choreography. The audit showed the
   skill corpus was ~99K tokens of process text of which ~60% was never followed, and
   that current models do better with plain stated rules than with step scaffolding,
   iron laws, and pressure language (audit §9). This iteration runs **zero skills** and
   **zero hooks** — deliberately, to find the real floor before adding anything back.
2. **Every durable thing is a committed, PR-reviewed file.** Deferrals, architecture,
   terminology — plain markdown in `docs/`, edited in the same PR as the change that
   motivates the edit. Nothing that syncs, daemonizes, or lives outside the repo
   (beads/Dolt was the least reliable component in the whole setup — audit §6).
3. **Ceremony scales with the shape of the work, and review can be asynchronous.**
   Questions get answers, research gets findings, small changes get a branch and a PR,
   features get a spec and a plan — and the spec and plan are on a draft PR from the
   moment they exist, so the person can review them in session, in GitHub comments, or
   by editing the files in a worktree.

## Non-goals

- **Environment changes.** The bd/Dolt data and the `codebase-memory-mcp` binary and
  its user-global config stay untouched on the person's machine. This spec removes
  *repo* references only.
- **Provider trials.** No superpowers/agent-skills vendoring this iteration. If the
  skill-less floor shows a real gap, individual skills come back on demonstrated pain,
  not in advance (the audit's not-in-use inventory is the cautionary tale).
- **Product code.** The only workflow-adjacent code candidate (per-PR CI) is
  deliberately deferred to `docs/TODO.md`.

## Decision record (settled during brainstorm, 2026-08-10/11)

- **D1 — No decision-record layer.** v3 deliberately ships without ADR/FDR-style
  records: the dated specs carry rationale history, `ARCHITECTURE.md` and
  `DEFINITIONS.md` carry present truth, and nothing else claims to be memory. The
  seven `docs/decisions/` ADRs retire with their directory (git history keeps
  them). Revisit only on demonstrated pain.
- **D2 — Plans:** implementation plans are branch-only documents in `docs/plans/`
  (`YYYY-MM-DD-<slug>.md`; a spec may be implemented as multiple plans — the agent
  splits when the work comes in slices), committed and pushed while the work is in
  flight so they are reviewable on the draft PR, and **deleted before merge — plans
  never land on master.** The PR body's Notes section keeps a blob permalink to each
  plan's final version — GitHub's `refs/pull/*` keep those commits reachable after
  the branch auto-deletes, so the executed plan stays consultable during final review
  and after merge. Accepted tradeoff: the archive lives in GitHub, not the repo. On
  master the directory holds only a README describing this lifecycle; the existing
  plan corpus (~50 docs) is deleted in this PR. Draft PRs are raised early — at spec
  commit when a spec exists, at first plan commit otherwise.
- **D3 — DESIGN.md:** shared foundations, two registers. One token base (**Cloud
  Captured**); `Marketing` (web-main) and `Product` (dashboard, web-docs, manager) as
  register sections layered on it.
- **D4 — Worktree freshness:** text-only. The Start section instructs it; no hooks.
- **D5 — Backlog mechanics:** semantics in AGENTS.md §Track; the field/node-ID table
  and mutation mechanics in `docs/TRACK.md`.
- **D6 — Automated review policy:** if an automated security-review layer is wired, it
  fires **once per PR, at ready-for-review**; drafts and intermediate pushes are
  exempt. Verified 2026-08-11: no such layer currently exists — the fleet the audit
  measured (69% of all transcripts) is no longer present in user-level, worktree-local,
  or repo config. The policy is recorded for whenever one returns; a TODO line carries
  the re-wire decision.
- **D7 — Per-PR CI:** stays a TODO line (ports the existing `lk-bv3` deferral).
- **D8 — Build & Test:** stays in AGENTS.md. Agents are the only developers
  (CONTRIBUTING.md); README keeps its three-command public summary.
- **D9 — Principles:** DEFINITIONS.md's Principles section moves to
  `docs/ARCHITECTURE.md` as **Invariants**. DEFINITIONS keeps Terms / Relationships /
  **Ambiguities** (renamed from "Flagged ambiguities") plus the Definition of Done
  (D13).
- **D10 — Beads port:** straight-port the open beads to TODO.md (mechanical, ids kept
  for traceability); triage happens later as a normal drain. Dropped instead of
  ported: the two codebase-memory-mcp adoption beads, plus the two mooted by this PR
  itself (the session-hook rebranding and bd session priming).
- **D11 — In-session tracking:** the TodoWrite/TaskCreate prohibition is dropped;
  harness-native todos are the in-session tracker. They are session-scoped UI, not
  shared state — cross-session state lives in draft PRs and TODO.md.
- **D12 — TDD stance:** test-first where a failing test cheaply expresses the change
  (bug regressions, pure logic); otherwise the testing-judgment ladder picks the layer
  and the test lands with the change. No universal test-first law (the audit's iron law
  had 100% silent non-compliance).
- **D13 — Definition of Done:** becomes its own section in `docs/DEFINITIONS.md` (the
  canonical definition home), replacing the one-line Greenhouse convention in
  AGENTS.md. Contents in §4.
- **D14 — Changelog taxonomy:** the buffer and the released changelog follow chatto's
  structure — `⚠ BREAKING CHANGES` / `Features` / `Bug Fixes` /
  `Performance Improvements` / `Code Refactoring` — with entries derived from the PR's
  conventional prefix. Details in §Release.

## 1. Document taxonomy after this work

| File | Answers | Updated when |
|---|---|---|
| `AGENTS.md` (= `CLAUDE.md` symlink) | how we work: track, develop, release, conventions | the process changes (via PR, like everything) |
| `docs/DEFINITIONS.md` | what words mean — canonical terms, relationships, ambiguity rulings, the Definition of Done | a term is coined, renamed, or disputed |
| `docs/ARCHITECTURE.md` | what exists and how it fits — system map, package inventory, invariants | structure changes, in the same PR |
| `docs/specs/` | what we intended and why (design history; may drift once shipped) | a feature is specified |
| `docs/PRODUCT.md` | positioning, narrative, voice | strategy changes |
| `docs/DESIGN.md` | visual identity: Cloud Captured foundations + Marketing/Product registers | the design system changes |
| `docs/CHANGELOG.md` | unreleased changes (buffer; chatto-style categories, append-only) | a slice ships a loggable change |
| `docs/TODO.md` | parked work: deferred, descoped, postponed | scope falls out, in the same PR |
| `docs/TRACK.md` | GitHub backlog mechanics: issue types, fields, node IDs | the backlog schema changes |
| `docs/research/` | committed research outputs | a research lane is asked for a doc |

Transient, never on master: plan documents under **`docs/plans/`** — branch-only
(D2), deleted before merge and permalinked from the PR body; on master the directory
carries only its lifecycle README.

The relationships, stated once in AGENTS.md so sessions route updates correctly:
**spec = proposal and rationale history** (point-in-time, allowed to drift) ·
**ARCHITECTURE.md + DEFINITIONS.md = present truth** (rewritten in place, audited) ·
**plan = in-flight scaffolding** (dies with the branch; archived as a PR permalink) ·
**TODO.md = parked** · **gh issues = backlog**.

Gone from the tree: `docs/CONTEXT.md` (→ `DEFINITIONS.md`), `docs/changelog.md`
(→ `CHANGELOG.md`, a case-only rename — explicit `git mv` on macOS), the
`docs/plans/` corpus (~50 docs deleted; the directory stays, README-only — D2),
`docs/decisions/` (retired with the no-records decision, D1),
`.agents/` (skills, hooks, scripts, SOURCES.md), `.claude/skills/`.

## 2. AGENTS.md — the rewrite

Structure: intro (what lodekit is + the taxonomy table above) → **Track** →
**Develop** (Start / Specify / Plan / Implement / Review / End) → **Release** →
**Conventions**. The Architecture section moves to `docs/ARCHITECTURE.md`, leaving a
three-line orientation + pointer. Build & Test stays as-is (D8). Register throughout:
plain statements with their reasons — no MUST walls, no red-flag tables (audit §9).

### Track

- **Backlog** = GitHub issues. The four org types (`bug`, `feature`, `chore`,
  `track`) and the three fields (Priority — never `urgent`; Area; Definition =
  undefined/partial/defined) with one-line semantics; titles imperative and short.
  Mechanics — node IDs, sub-issue and dependency endpoints, the GraphQL mutation and
  its syntax traps — live in `docs/TRACK.md` (D5).
- **Deferrals** = `docs/TODO.md`. When scope falls out at any phase, append one line,
  in the same PR as the work that descoped it:
  `- [YYYY-MM-DD · <provenance>] description` — provenance is the spec/PR/session
  shape it fell out of; an optional leading `P0`/`P1` marks urgency; ported items keep
  their bead id as a `(was lk-xxx)` suffix. Single-line appends keep parallel-worktree
  merges trivial.
- **Drain** = a periodic consolidation the person asks for (no skill): group TODO
  lines into themes, create gh issues or tracks per `docs/TRACK.md`, delete the
  drained lines, raise a PR linking every issue created. The PR is the audit trail.
- **In-session steps** = harness-native todos (D11). Never a tracking file.

### Develop → Start

Match ceremony to the shape of the ask, and say which lane you're taking:
a **question** gets an answer (no artifacts); **research** gets findings, committed to
`docs/research/` only if asked (no branch); a **small change** gets a branch, the
change, and a PR; a **bug** gets reproduced before it gets fixed; a **feature** gets a
spec first — *probe the person* when the ask looks feature-shaped but no spec exists.
This paragraph is what retires the "research only, no session" incantation (audit §4).

Mechanics: always a feature branch (the person may name a different finishing intent
at session start — see End); never commit to master. Before starting:
`git fetch origin --prune`; if the worktree branch is stale or already merged, reset
to a fresh branch off `origin/master` (D4 — this replaces the worktree-refresh hook).

### Develop → Specify

Spec-worthy: a new user-visible capability, a cross-cutting change, or anything
security-boundary-shaped. The spec goes to `docs/specs/YYYY-MM-DD-<slug>-design.md`
(house format: Goals / Non-goals / Decision record / numbered sections / Rollout /
Verification). Commit it on the branch, push, and **open the draft PR now** — from
this moment the spec is reviewable on GitHub: the person approves in session, comments
on the PR, or checks the branch out in a worktree and edits the file directly. The
spec is approved before planning. Small fixes and chores skip this entirely.

### Develop → Plan

For multi-task work, plans are documents on the branch — never on master (D2):

1. Write `docs/plans/YYYY-MM-DD-<slug>.md`, with the full plan-doc discipline: ordered
   tasks, each self-contained (context, files touched, acceptance criteria, how to
   verify), sized so a task brief can be handed to an executor subagent as-is. This is
   what keeps subagent fan-out and cheap-model delegation possible. A header line
   names the spec it implements. One plan is the norm; the agent may split a spec's
   implementation into two or more plans when the work comes in slices — each its own
   file, executed in order.
2. Commit and push; open the draft PR here if Specify didn't already. Spec and plans
   are now both on the PR for review — comments or direct file edits in a worktree.
3. Approval gate: ask in session by default. The person may defer ("proceed, I'll
   review on GitHub"), in which case implementation continues and review arrives
   asynchronously as PR comments or file edits to reconcile.
4. Tick the plan's checkboxes and push as tasks land — the draft PR stays a live view
   of progress, and together with the plan files it is the cross-session continuation
   artifact (any fresh session finds in-flight work via `gh pr list`).

`docs/plans/README.md` (committed, permanent) documents this lifecycle and is the
directory's only resident on master.

Single-sitting tasks need no plan.

### Develop → Implement

- Execute the plans if there are any — inline by default; delegate tasks to subagents
  when the work genuinely fans out (the briefs are self-contained by construction).
- **Tests (D12):** write the failing test first when it cheaply expresses the change —
  bug fixes (the regression test is the reproduction) and pure logic. Otherwise pick
  the lowest layer of the testing-judgment ladder and land the test with the change:
  pure logic → owning package's vitest; component render → `@lodekit/ui` render tests;
  cross-frontend health → `pnpm e2e`; visual judgment → Playwright MCP in-session.
- If a simpler path exists than the one requested, say so before building it.

### Develop → Review

- Before flipping to ready: a whole-branch self-review of the diff — correctness plus
  a security lens (the whole-branch pass is the one that caught real vulnerabilities;
  per-task review scaffolding found nothing ~98% of the time — audit §2/§11).
- Risk-flagged work (trust boundaries, parsers, auth, network egress) additionally
  gets a fresh-context adversarial review — a subagent briefed to *disprove* the
  change, not confirm it.
- Automated review (D6): none is currently wired; the standing policy if one returns
  is once per PR, at ready-for-review, drafts exempt.
- Docs check, run silently as part of assembling the PR: structure changed →
  ARCHITECTURE.md. Term coined or changed → DEFINITIONS.md. Loggable → CHANGELOG.md
  entry. Scope fell out → TODO.md line. All in this same PR.

### Develop → End

- Delete the plan files in the final commit — `docs/plans/` goes back to README-only;
  plans never reach master (the squash takes the branch's final tree, and the repo
  squashes with `PR_TITLE`/`PR_BODY`, so the PR body becomes master's commit message).
- Write the PR body: **Summary** (what and why), **Notes** (decisions, follow-ups,
  TODO lines filed, and a **blob permalink to each plan's final version** — via
  GitHub's PR refs the executed plans stay consultable during final review and after
  merge), **Test plan** (checklist of what was verified). Check the Definition of
  Done (`docs/DEFINITIONS.md`) before flipping to ready.
- The person may set a different finishing intent at session start — commit-don't-push,
  hold-and-iterate. A held branch is already tracked by its draft PR, which closes the
  unmerged-PR dead zone (audit §5) with no extra machinery.
- Merging is the person's call, always. Squash-merge only; `git rebase master` for
  conflicts, never a plain merge; conventional-prefixed PR titles are load-bearing
  (they become master's commit subjects).

### Release

The `/release` skill's content, folded in and corrected:

- Pre-flight: on `master`, clean, up to date; `pnpm test` passes; version lockstep
  across all **10** package.json files (root,
  `packages/{engine,mcp,sdk,skill,ui,integration-tests}`, `web/{main,docs}`,
  `manager`); `gh auth status`; no open `release: vX.Y.Z` PR; `docs/CHANGELOG.md`
  has at least one entry.
- Bump all 10 together (features → minor, fixes → patch, breaking → major once out of
  0.x; confirm with the person).
- Notes = the buffer drained verbatim under a
  `## [X.Y.Z](compare-url) (YYYY-MM-DD)` heading (chatto structure, D14) prepended to
  `web/docs/src/content/docs/changelog.md`; cross-check merged PRs for missing entries
  and *surface* gaps, never silently add. Reset the buffer to its rules header.
- Branch `release/vX.Y.Z`, single commit `release: vX.Y.Z`, PR title the same (the
  workflow's trigger — it alone creates `v*` tags). The person merges.
- **Steering audit** rides the release: verify ARCHITECTURE.md and DEFINITIONS.md
  claims against the codebase; report verified / stale / missing. Lax capture +
  honest periodic audit is the chosen trade.

**Changelog buffer format (D14).** `docs/CHANGELOG.md` keeps a rules header, then
chatto's category taxonomy:

```markdown
### ⚠ BREAKING CHANGES        # only when present, always first
### Features
### Bug Fixes
### Performance Improvements
### Code Refactoring
```

A slice appends one entry under the category matching its PR's conventional prefix
(`feat` → Features, `fix` → Bug Fixes, `perf` → Performance Improvements,
`refactor` → Code Refactoring; a `!` prefix additionally adds a ⚠ line describing the
break and migration). Entry shape: `* **scope:** what changed ([#PR])` — phrased for a
person using Lodekit. `chore`/`docs`/`test`/`ci` PRs append nothing. Append-only for
agents; rewording happens in the release PR review.

### Conventions

Survivors: no `Co-Authored-By` trailers, no "Generated with" attribution ·
conventional PR titles · `pnpm install --lockfile-only` for lockfile conflicts ·
CHANGELOG.md is append-only for agents · steering docs are uppercase; `CLAUDE.md` is a
committed symlink to `AGENTS.md`, never diverged.
New: multiline gh bodies via `--body-file` (never escaped `\n`), and verify the stored
body after create/edit · TODO.md appends are single lines · plan files never reach
master (`docs/plans/` is README-only there) · canonical docs (ARCHITECTURE,
DEFINITIONS, DESIGN, PRODUCT) never link to specs — they carry present truth on their
own terms · prose wraps at ~90 columns (tables, code, frontmatter, and TODO.md's
single-line entries exempt).
Dropped: the TodoWrite prohibition (D11), the beads rules, the codebase-graph
convention, the `askUserQuestionTimeout` note, the Lazy/Surgical/Surface sections
(current-model defaults; the one surviving line moved to Implement).

## 3. `docs/ARCHITECTURE.md`

Single file (expandable later), RFC-shaped, present-tense, no exhaustive API/schema
lists — decision rationale and feature designs stay in the dated `docs/specs/`:

1. **System map** — how manager / engine / MCP / skill / dashboard / apps relate at
   runtime, as a short numbered flow.
2. **Packages** — the inventory currently in AGENTS.md §Architecture, trimmed to
   responsibilities and boundaries.
3. **Invariants** (D9) — the ex-Principles content ("no dev servers, no terminal
   builds; Lodekit controls the build chain programmatically, down to its own Node")
   plus any standing boundary rules worth stating once (e.g. MCP reaches the engine
   over HTTP only).
4. **Deferred subsystems** — the designed-in-not-built paragraph, moved from AGENTS.md.

Upkeep: structural changes update it in the same PR; audited at release time
(§Release's steering audit).

## 4. DEFINITIONS.md and DESIGN.md

**DEFINITIONS.md** is officially the place ambiguity goes to die: canonical terms,
relationships, and rulings, technical and non-technical, in a near key-value
register — no bodies of text. Sections after this work: **Terms / Relationships /
Ambiguities / Definition of Done**. Principles moves out (D9); "Flagged ambiguities"
is renamed "Ambiguities". AGENTS.md keeps the one-line pointer ("use its canonical
terms in code, docs, and specs; unsure or disputed → resolve here first"). Entries
whose claims the migration found stale against the code are corrected in the same
pass — DEFINITIONS carries present truth or nothing.

**Definition of Done (D13)** — the new section, verbatim:

```markdown
## Definition of Done

A slice is done when all of these hold:

- **Complete** — every plan task is done or explicitly moved to TODO.md.
- **Tested** — a test exists at the lowest ladder rung that exercises the change,
  and `pnpm test` passes.
- **Showcased** — a new SDK/engine capability is exercised by the Greenhouse app
  (`root/README.md` coverage checklist).
- **Recorded** — ARCHITECTURE.md and DEFINITIONS.md are current for any structure
  change or term this slice introduced.
- **Logged** — docs/CHANGELOG.md has an entry if the PR's conventional type calls
  for one.
- **Parked** — descoped scope has a TODO.md line.
- **Clean** — docs/plans/ is README-only; the branch is pushed; the PR body carries
  Summary / Notes (with plan permalinks) / Test plan.
```

**DESIGN.md** restructures to **Foundations / Marketing / Product** (D3): the
frontmatter tokens and the palette/typography/elevation sections are the shared
**Cloud Captured** foundations; Marketing carries web-main's register and component
treatments; Product carries dashboard/web-docs/manager register, components, and
density. The existing "Register divergences" content dissolves into the two register
sections. Content work beyond the restructure (actually designing the Product
register) is its own future slice, not this PR.

## 5. TODO.md port and TRACK.md

- **Port (D10):** every open bead becomes one TODO.md line with today's date,
  `bead` provenance, and its `(was lk-xxx)` suffix; P2 beads carry a `P1` marker,
  P3 none (the old P2/P3 split collapses — TODO.md is a buffer, not a tracker).
  Dropped, not ported: `lk-8i3`, `lk-9la` (codebase-memory-mcp adoption),
  `lk-aes`, `lk-u3y` (mooted by this PR — the injected-text hook and bd priming no
  longer exist). New lines added at port time: the automated-review re-wire
  decision (D6), the DESIGN Product register (D3), and the missing dashboard Tasks
  page (surfaced while verifying steering-doc claims against the code). The bd
  database itself is untouched (environment; `.beads/` was never tracked).
- **TRACK.md:** the retired `drain-deferrals/references/github-backlog.md` content,
  carried over intact — project number, the four issue types, sub-issue and dependency
  endpoints, the field/option node-ID table, the `setIssueFieldValue` mutation with
  the `fields[][…]` syntax note, the worked example, and the ~2s/issue throttle note.

## 6. Removal & edit sweep

Beyond the sections above, the same PR:

- Deletes `.agents/` (skills, hooks, scripts, SOURCES.md) and the `.claude/skills/`
  symlinks.
- `.claude/settings.json`: hooks and plugin blocks removed;
  `enabledMcpjsonServers` becomes `["playwright"]` (drops codebase-memory-mcp, keeps
  the remaining server pre-approved).
- `.mcp.json`: the `codebase-memory-mcp` server entry is removed; playwright stays.
- `.gitignore`: the dead agent-state entries go (`.beads/`, `.superpowers/`,
  `.codebase-memory/`, `.agents/internal/`).
- `CONTRIBUTING.md` §Development process: rewritten — no skills or SOURCES.md; the
  checked-in tooling is AGENTS.md plus the `docs/` steering docs and specs.
- `LICENSING.md` + `REUSE.toml`: the vendored-skills licensing rows and annotation
  blocks go with the tree.
- `README.md`: pointer check only (its Development section already matches D8).
- `docs/plans/`: the ~50 committed plan docs are deleted; `docs/plans/README.md`
  (the D2 lifecycle note) is added.
- `docs/changelog.md` → `docs/CHANGELOG.md` via explicit `git mv` (case-insensitive
  FS); the buffer's rules header is rewritten for the D14 taxonomy, and the Release
  section's paths update with it.
- `docs/CONTEXT.md` → `docs/DEFINITIONS.md` lands as a rename (content mostly intact,
  so git's rename detection preserves blame).
- Canonical docs drop their spec links (the stand-alone convention above);
  PRODUCT.md's stale `CONTEXT.md` pointer updates to DEFINITIONS.md.

## 7. Rollout

One PR off this branch (`devex`), containing: this spec · the AGENTS.md rewrite ·
`docs/ARCHITECTURE.md` · DEFINITIONS/DESIGN restructures (including the DoD
section) · TODO.md port · TRACK.md · the §6 sweep. The person reviews the spec
first (this document is the gate), then the rest of the diff lands behind it.

Follow-ups, each its own session, captured as TODO lines: first TODO drain · per-PR
CI · the automated-review re-wire decision · Product register design in DESIGN.md.

## 8. Verification

- `pnpm test` and `pnpm e2e` unaffected (no product code).
- `CLAUDE.md` still resolves to `AGENTS.md`; no dangling `.claude/skills` symlinks.
- A fresh session smoke per lane: a question, a research ask, and a small change —
  checking the session routes by shape, finds the docs it needs, and (for the change)
  produces the early-draft-PR + plan flow unprompted, with the plan deleted and
  permalinked from Notes before ready.
- `git log --follow` shows continuity across the CONTEXT→DEFINITIONS and
  changelog→CHANGELOG renames.
- TODO.md line count matches the ported bead count minus the four dropped, plus the
  three filed at port time.

## 9. Deferred (TODO.md lines, filed with the port)

- Automated-review fleet: decide whether to re-wire one (policy if so: once per PR,
  at ready-for-review — D6).
- Per-PR CI running `pnpm test` (D7, was `lk-bv3`).
- DESIGN.md Product register: design the actual token/component treatments (D3 created
  the section, not the system).
