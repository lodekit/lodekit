# Dev-process audit & dev-flow v3 proposal — research record

**Date:** 2026-08-06 (committed 2026-08-07) · **Session type:** research-only, no repo changes during the audit itself
**Companion artifact:** the interactive HTML version of this report lives at `~/Desktop/lodekit/skills-audit-2026-08-06.html` (same content, presentation layout, usage bar chart).

This document is the complete research record for the next dev-flow iteration (v3). It was
produced by mining all 630 Claude Code session transcripts (Jul 7–Aug 6), auditing all 31
vendored skills against AGENTS.md / SOURCES.md / the dev-flow-v2 spec, measuring the two
candidate provider libraries (upstream superpowers, agent-skills), and a same-day
direction-setting discussion with the person. **Sections 12–14 carry the decisions and the
v3 proposal; sections 0–11 carry the evidence.** New sessions working on dev-flow v3 should
read §14 first, then §12–13, and treat §0–11 as the evidence base to cite rather than re-derive.

Key decisions already taken by the person (recorded in §12/§14): remove beads/Dolt and
codebase-memory-mcp; deferrals via `docs/TODO.md` + a `/lodekit-drain-todos` skill; ADR+FDR
as the only durable memory (no automemory); specs/plans stay committed; keep the SDD
executor substrate-owned; one provider active at a time (superpowers trimmed first,
agent-skills trialable), routed solely by the session skill.

---

# The skills are working where they were adapted — and dead weight everywhere else

A research-only audit of the vendored agent process (skills, hooks, beads, session model) against 630 session transcripts from Jul 7–Aug 6, the dev-flow-v2 spec, and the current repo state. Four analysis agents mined the transcript corpus; every quoted claim was spot-verified against the actual files.

| Stat | Value | Note |
|---|---|---|
| Transcripts analyzed | **630** | 193 human sessions + 437 automated security-review runs |
| Skill corpus | **73.5K** | words across 31 skills ≈ 99K tokens of process text |
| Never-invoked skills | **11** | ≈24K words, largely unadapted upstream text |
| Declared modes = pair task | **91%** | 58 of 64; auto quadrant used ~2× ever |
| Fixed context tax | **~5K** | tokens/session: 9.1KB hook injection + 10.9KB AGENTS.md |
| Open defer beads | **47** | deferral capture far outpaces the drain |
| Per-task reviews finding nothing | **~98%** | "Critical: None" ≈304× vs ~4 real critical finds |
| Process share of master | **10/45** | commits since vendoring are process maintenance |

## 0. Verdict

**The ~20% of the skill tree that was adapted to this repo is earning its keep; the rest is inert or actively wrong.** The used core — `session`, `brainstorming`, `writing-plans`, `subagent-driven-development`, `finishing-a-development-branch`, `systematic-debugging` — produced measurable wins (four pre-merge security catches on one PR, 13-minute root causes, a 96-minute issue→merged-PR cycle). But 11 of 31 skills have never been invoked once in 193 human sessions, several still describe a different project (generic `npm`/`cargo` baselines, a `packages/runtime` that doesn't exist, a "gitignored" ADR dir that is committed), the 2×2 session matrix has collapsed to a single quadrant in practice, and the least reliable component in the whole setup is the tracking substrate itself — beads/Dolt sync friction shows up in more sessions than any skill does. The person has adapted by typing "research only, no session" as a manual bypass, which is the clearest possible signal that the triage layer is missing a lane. There is also a generational mismatch: the skills were written for Claude-4-era models, and Anthropic's current guidance classifies their core idioms — pressure language, iron laws, anti-rationalization tables, mandatory verification scaffolding — as dated patterns that degrade behavior on the Claude 5 family now running these sessions (§9). Roughly 60% of the process text can be deleted without touching anything that has fired more than twice since July — and the vendor guidance says the deletion should improve output quality, not merely cost.

## 1. Usage reality vs. design

Every `Skill`-tool invocation across all lodekit transcripts (plugin era + vendored era combined). The design assumes a rich toolbox; usage is a power law with a hard floor of zero.

**Skill invocations, all sessions Jul 7 – Aug 6**Single measure (count). Skills in gray have never been invoked via the Skill tool; slash-command uses noted inline.

| Skill | Invocations |
|---|---|
| writing-plans | 38 |
| subagent-driven-development | 37 |
| brainstorming | 33 |
| session | 20 (+23 /session) |
| finishing-a-development-branch | 15 |
| systematic-debugging | 9 |
| executing-plans | 4 |
| research-driven-development | 4 |
| test-driven-development | 4 (0 since vendoring) |
| ponytail | 3 |
| stress-test | 2 |
| memory-curator | 2 |
| dispatching-parallel-agents | 2 |
| domain-modeling | 2 |
| verification-before-completion | 1 |
| requesting-code-review | 1 |
| getting-up-to-speed | 1 (+5 slash) |
| drain-deferrals | 1 |
| project-init | 1 |
| release | 0 via Skill (+4 /release) |
| session-handoff | 0 (+2 slash; model-invocation disabled) |
| codebase-design | 0 |
| document-release | 0 |
| ponytail-audit | 0 |
| ponytail-debt | 0 |
| ponytail-review | 0 |
| receiving-code-review | 0 |
| using-git-worktrees | 0 |
| write-documentation | 0 |
| writing-skills | 0 |

*using-superpowers is excluded — it auto-loads via the SessionStart hook every session rather than being invoked. Plugin-era (`superpowers:*`) and vendored-era invocations are summed.*

### The session matrix collapsed to one quadrant

Among post-vendoring *human* sessions, mode discipline is actually good — 96 of 121 (79%) declare a mode. But of 64 parseable declarations: **58 `pair task`, 4 `pair spec`, ~2 `auto`**. Consequences:

- The entire `auto` machinery — gate substitution via stress-test, the 4-gate review, the STOP protocol — has served roughly two sessions. **Zero `human`-labeled STOP beads have ever been filed.**

- `stress-test` is the sole substitute gate for spec *and* plan approval in auto mode, yet it is the least-used skill in the pipeline (2 invocations) — the safety design of half the matrix rests on the least-exercised path.

- `spec` ceremony is invoked so rarely that most of brainstorming's elaborate gate structure exists for ~4 declared sessions plus explicit design asks.

### Designed mechanisms with zero real-world footprint

- **Ponytail marker rule:** 0 `// ponytail:` anchors in the codebase, 0 `ponytail`-labeled beads ever. The skill is framed as "ACTIVE EVERY RESPONSE" and CLAUDE.md calls it the owner of the laziness discipline — it has been invoked 3 times. `ponytail-debt`, which harvests those markers, has nothing to harvest.

- **TDD:** 4 invocations pre-vendoring, zero since — while its Iron Law ("Write code before the test? Delete it. Start over.") nominally binds every implementer. A mandatory rule that is silently ignored 100% of the time corrodes the authority of every other iron law in the tree.

- **Agent-Filed Bead Discipline** is defined inside `verification-before-completion` (1 invocation) and referenced by 9 other skills — the convention's home is a skill nobody loads.

## 2. What is genuinely working

The audit's mandate was inefficiencies, but the wins define what must survive any consolidation:

- **The SDD review loop catches real, high-stakes bugs.** On the SSRF-hardening PR (#88): a critical IPv6-normalization bypass, an IPv4-compatible-IPv6 gap, and OAuth-redirect + 6to4/NAT64 gaps — four exploitable classes fixed pre-merge. Pre-vendoring, a review caught a greedy regex that let destructive `ALTER`s through an additive allowlist. A final whole-branch review also caught a Playwright-MCP Chromium-revision mismatch that would have broken first launch.

- **systematic-debugging is consistently fast and honest.** 13-minute root cause on dual 403s (missing anonymous `s3:GetObject`); 9-minute verified fix on the tray desync, correctly classified as pre-existing and filed as a bead instead of scope-creeping.

- **Brainstorming's first question routinely kills scope ambiguity** — e.g. spotting that issue #104's title and body disagreed about whether a favicon chooser UI was needed, before any code.

- **stress-test produced concrete spec changes** the two times it ran (theme-editor trust model, legacy-theme contract, edge cases).

- **Full-cycle throughput when it clicks:** issue → spec → plan → 6 reviewed subagent tasks → merged PR #108 in ~96 minutes with 2 free-text user messages. A 14-task epic shipped a whole theme library in ~4.5h at ~20 min/task including review.

- **The structured-question format works** — the person answers with single characters; questions get answered, not fought.

- **Memory captured environment truths that resurfaced** (the SSH-egress sandbox lesson demonstrably reappeared in later handoffs), and the worktree-refresh hook — built in response to a stated annoyance — now runs silently and correctly.

- **Auto mode, the two times it ran, was clean:** plan → stress-test → execute → review → PR in ~46 minutes, zero questions, correctly stamped defer bead.

## 3. Ceremony & verbosity

### Time to first line of implementation

| Session | Mode | First code | Blocking questions | Notes |
|---|---|---|---|---|
| `57bff612` engine #164 | pair task | ~7 min | 0 | task mode at its best |
| `8276c837` infra | pair task | 29 min | 3 | no plan doc, straight to SDD |
| `2a310f13` favicon #104 | pair spec | 21 min | 6 | merged PR at 96 min total — the good case |
| `cef77344` loopback #87 | pair spec | 32 min | 4+ | full ceremony for a fix the issue title already prescribed |
| `28126b68` SSRF #88 | pair spec | 46 min | 10 | ceremony arguably earned — review caught 4 vuln classes |
| `9b7c3ec0` disk cleanup | pair spec | ~2 h 10 | 12 | a chore got brainstorm→spec→stress-test→plan→SDD→memory curation |
| `1708d0af` theme editor | pair spec | 2 h 49 | 9-branch stress-test | largest feature; ceremony proportionate here |
| `9fc80841` pre-vendor logging | (plugin) | 3 h 33 | 8 | pre-vendoring era was materially slower |

Pattern: **pair-task is cheap (7–30 min); pair-spec costs 45 min–2.75 h before implementation regardless of task size.** Vendoring did make things faster than the plugin era. The problem is not the gates existing — it's that the same fixed stack lands on a disk-cleanup chore as on a security feature.

### The fixed gate stack

Each spec session carries ~7–9 blocking interactions independent of task size: per-section spec checkpoints (3–6), spec-review gate, plan-review gate, execution-method question, *two* "worth preserving — what should I capture?" gates (after spec *and* after plan — observed twice within 8–12 minutes in `2a310f13` and `cef77344`), the finishing 4-option menu, and a memory-curation offer. Findings on the capture gate specifically:

- It fired in 19+ sessions; of ~29 extracted answers, **at least 11 were "Skip"** — sometimes with the agent itself recommending "Skip (Recommended)". A question with sub-50% yield asked twice per session is a tax, not a gate.

- Brainstorming additionally creates ~8–10 ephemeral step-beads per session ("Step 1: Explore project context" … "Step 8: Stress-test gate"), each closed with a written reason — pure bookkeeping.

- In one deploy-outage hotfix the bead was created *after* the fix was written and closed one minute later — the convention satisfied retroactively.

### Process-text load if the rules were actually followed

For the modal `pair task` session, the skills' own MUSTs prescribe loading ~24–29K words (~32–39K tokens) of process text — writing-plans, SDD + its two prompt templates, using-git-worktrees, TDD per implementer, ponytail, verification, finishing, document-release. `pair spec` pushes it to ~37K words (~50K tokens) before a line of product code is read. Actual sessions don't load it all — which is precisely the point: **the corpus has quietly stopped following the parts that don't pay**, and the text no longer describes real behavior.

## 4. The opt-out incantation

The strongest ceremony signal in the corpus is not mid-session frustration — it's that the person has developed a stock preamble to route around the process, used in 9+ sessions and growing more emphatic over time:

> "research only, no session. dont use superpowers." — infra/44709bee, infra/59d7522a — Aug 4

> "skip superpowers/session - direct work task." — engine/5b566a39 — Jul 30

> "NO SESSION OR RESEARCH as we work…" — devex/e91bc6af (all-caps in original)

> "lets do a branch cleanup no /session" — github/b8e4c8bd — Jul 19

> "no /session work, just need to generate a badge" — web-main/60a45d09 — Aug 3

The session skill's triage table does have a "quick question" lane, and it occasionally works (a bare "help" was answered directly; a post-merge branch reset was correctly short-circuited: *"routine git housekeeping... I'll just execute it directly rather than opening a plan/bead cycle"*). But the table has no lane for **research/discussion** or **maintenance/housekeeping** as first-class shapes, so the person pre-declares the bypass every time rather than trusting triage. Direct mid-session pushback is rare (≈6 interruptions in the three biggest dirs) — the process is obeyed or pre-empted, not fought.

Other learned compressions: *"approved write the plans and then start directly with subagent driven"* (collapsing gates), *"spec is already written, reviewed, approved. continue from there"* (which the chain honored correctly — adaptivity works when told), and the `/session pair task <issue-url>` one-liner becoming the standard fast path by August.

## 5. Live bugs & contradictions

All verified against the current files, not just the transcripts.

|  | Finding | Evidence |
|---|---|---|
| **[breaks now]** | **SDD's helper-script path is wrong — every SDD run starts with Exit 127.** `subagent-driven-development/SKILL.md:298` says `scripts/task-brief`; the script lives at `.agents/skills/subagent-driven-development/scripts/task-brief`. Confirmed burning ~2 recovery turns in 5+ sessions (`2a310f13`, `57bff612`, `28126b68`, `346a0b09`, `35c08448`). | one-line fix |
| **[breaks now]** | **The release skill targets a package that doesn't exist.** `release/SKILL.md:24` requires lockstep versions in `packages/{runtime,mcp,sdk,skill,ui}` ("9 files") — there is no `packages/runtime` (renamed to `engine`, ADR-0005), and 10 package.json files carry 0.1.0 (`integration-tests` unlisted). Pre-flight will fail or under-bump on the next release. | not updated through the engine rename |
| **[design dead-end]** | **The auto-mode STOP protocol requires an un-invokable skill.** `session/SKILL.md:51`: "Write a handoff (session-handoff)" — but `session-handoff` carries `disable-model-invocation: true` ("stays off every agent-trigger surface by design"). The safety mechanism of half the session matrix dead-ends. | inline the 5-line recipe instead |
| **[contradiction]** | **Brainstorm-everything vs. task mode.** `brainstorming`: "Every project goes through this process. A todo list, a single-function utility, a config change — all of them." vs. `session` task mode: "No spec, no brainstorm." `using-superpowers` sides with brainstorming ("Before entering plan mode... invoke the brainstorming skill first"). Two of the three most-used skills disagree about whether the third is mandatory. | session's triage should win |
| **[contradiction]** | **TDD's Iron Law vs. ponytail vs. AGENTS.md.** "NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST / Delete it. Start over." vs. ponytail's "Trivial one-liners need no test, YAGNI applies to tests too" vs. AGENTS.md's testing-judgment ladder ("pick the lowest test layer"). Both claim to govern all implementation; TDD's zero post-vendoring invocations show which wins. | the ladder is canonical; align or cut TDD |
| **[contradiction]** | **finishing-a-development-branch leads with a forbidden action.** Its option 1 is "Merge locally" (`git checkout base && git merge`) vs. AGENTS.md: "All changes to master land via PR — no direct pushes" and "never a plain git merge". Its PR template also omits AGENTS.md's required **Notes** section. | most-used terminal skill, unadapted menu |
| **[self-defeating]** | **Research's Iron Law produces a disposable artifact.** research-driven-development: "NO RESEARCH WITHOUT A DOCUMENT... Verbal answers are prohibited" — and mandates writing it to `.agents/internal/research/`, which is gitignored. The mandated durable artifact dies with the worktree. | commit the docs or drop the law |
| **[stale]** | **document-release audits a different repo:** claims `docs/decisions/` is "gitignored, invisible to readers" (8 tracked files say otherwise), and audits a root `CHANGELOG.md`/`VERSION` that don't exist here (this repo: `docs/changelog.md` buffer + `/release`). | never invoked; cut or rewrite |
| **[stale]** | **Vestigial upstream references:** executing-plans still says "Tell your human partner that Superpowers works much better…" (the plugin spec D1 discarded); ponytail still says "pair with Caveman" (never vendored); using-git-worktrees prescribes `npm install`/`cargo build` baselines in a pnpm monorepo; writing-skills demands "Create a todo for EACH checklist item" while TodoWrite is forbidden repo-wide. | unadapted vendor text |
| **[rule vs rule]** | **The word-budget rule indicts its own tree:** writing-skills sets "Other skills: <500 words" — 26 of 31 skills exceed it; writing-skills itself is 3,807 words (13,202 with references, 18% of the whole tree). | median skill: 1,402 words |
| **[process gap]** | **Unmerged-PR dead zone.** Issue #87 was fully implemented with complete ceremony on Jul 17, never merged, and the branch was later recreated — the commits dangled until Aug 5's session recovered them forensically by cherry-pick. "The agent raises the PR and stops" has no re-entry loop for PRs that never merge. | a whole ceremony cycle evaporated |

## 6. Beads / Dolt friction

The tracking substrate is the least reliable component of the setup — it appears as friction in more sessions than any skill does.

- **The land-the-plane push dance is a ritual tax on nearly every session close:** `bd dolt push` → non-fast-forward reject → `bd dolt pull` → push again. Observed in 25+ files across all worktree dirs (~30–60s each, every session).

- **SSH hardware-key auth breaks unattended pushes in 13 sessions across 9 worktrees** (`sign_and_send_pubkey: signing failed`). The HTTPS workaround is institutionalized *in a memory* rather than fixed in the remote config — plans now bake in "HTTPS override per this machine's stored lesson." Sandboxed sessions cannot complete land-the-plane at all: *"Beads Dolt pushes cannot be worked around this way — they need the person to run them"* (`346a0b09`, recorded as a durable memory).

- **Worst single episode: ~86 minutes of recovery** (`infra/44709bee`, Aug 5): failed push → non-FF → pull → *"merge conflicts in issues require operator resolution; merge aborted"* → project-init recovery → `bd vc merge` fails twice (autocommit), blocked twice by the permission classifier → the human manually ran `dolt merge`/`dolt conflicts resolve` inside `.beads/embeddeddolt/lk`. Closing memory: *"bd 1.1.2 embedded-dolt cannot resolve merge conflicts."*

- **The `bd create --graph` edge schema was mis-guessed in 7 sessions across 3 weeks** (Jul 16 → Aug 5): planners emit `{from, to}` (and once `{source, target}`), bd wants `from_key`/`to_key` — "unknown field(s)... silently dropped". A lesson memory was recorded on Jul 16 and **did not prevent a single recurrence** — evidence that operational how-to belongs in the skill text (the thing that gets loaded), not the memory store (the thing that gets budget-truncated).

- **CLI re-learning is routine:** `bd update --help`, `bd close --help`, `--help | grep label` spelunking mid-session; "no beads database found" in fresh worktrees; the auto-mode permission classifier has denied `bd create` as an "External System Write".

- **A dedicated infra session (issue #157) existed purely to serve the tracker** — researching and planning the Dolt remote's move out of the code repo, with the user asking "is it going to break our dev flow? … will it be slower?"

- **Memory store: 56 memories, injection budget fits 5.** The session-start composer injects salience ≥ 4 + latest continuation under a 2,575-byte budget and reports "+4 more core memories over budget" — the store has outgrown the pipe. memory-curator has run twice; one mid-session run cost ~12 minutes during active feature work. Meanwhile 47 `defer` beads sit open; the Skill-tool count for drain-deferrals is 1, though the person reports a handful of recent drains consolidating themes into tracks (runs that evidently bypass the Skill tool) — either way, capture far outpaces the drain, and the consolidation step is the part with demonstrated value. Stale beads (e.g. `lk-aes`, the hook-rebranding chore) resurface as `bd ready` noise across sessions without being drained; a P0 decision bead with an Aug 1 deadline was still open on Aug 6.

## 7. Overlap & duplication

Five clusters account for most of the redundant text. Realistic consolidation: **31 skills → ~16, 73.5K words → ~28K**, touching nothing invoked more than twice since July.

| Cluster | Skills (words) | Duplicated content | Consolidation |
|---|---|---|---|
| Execution | subagent-driven-development (3,833) · executing-plans (1,326) · dispatching-parallel-agents (1,591) · using-git-worktrees (1,770) | bead-graph creation, blocker table, "Before you fan out" (verbatim ×2), worktree lifecycle (×3), bd-frugality blockquote (×5) | one executor skill (~2,000 w) · **−6,500 w** |
| Review | requesting-code-review (1,126) · receiving-code-review (1,138) · SDD's task-reviewer-prompt (1,219) · ponytail-review (339) | two competing reviewer templates; three "review is mandatory" declarations; severity taxonomies in each | reviewer template lives with SDD; cut receiving-code-review · **−2,000 w** |
| Design | brainstorming (4,597) · stress-test (1,927) · research-driven-development (4,331) · codebase-design (1,659) · domain-modeling (818) | "explore alternatives / probe assumptions" in all three big ones; brainstorming re-derives codebase-design in worse words | brainstorming + one adversarial pass; codebase-design → docs/ · **−2,500 w** |
| Completion | verification-before-completion (1,322) · TDD (2,917) · finishing (1,852) · document-release (2,116) | "evidence before claims" ×3; land-the-plane ×5; test-must-fail-first ×2 | finishing owns the gate; bead-stamp → AGENTS.md · **−2,500 w** |
| Memory | memory-curator (1,402) + 13 copies of "Capture what you learned" (~1,170) + 4 identical Capture-gate JSON blocks (~600) | same instruction, four shapes | one line in AGENTS.md + one gate at finishing · **−2,700 w** |

### Rules stated in 3+ places

| Rule | Currently stated in | Single home |
|---|---|---|
| TodoWrite/TaskCreate forbidden | AGENTS.md, using-superpowers, session, 2 platform refs — and *violated* by writing-skills | AGENTS.md |
| Land the plane | 6 files | finishing-a-development-branch |
| "Capture what you learned" | 13 SKILL.md files, ~90 w each | AGENTS.md, one line |
| Capture gate (ADR/memory JSON) | 4 skills, identical block | finishing — once per session |
| bd frugality blockquote | 5 skills, verbatim | one beads-conventions reference |
| Agent-Filed Bead Discipline | defined in verification-before-completion, referenced by 9 | AGENTS.md |
| Production-Grade Doctrine | using-superpowers + 13 restatements | AGENTS.md |
| "Announce: I'm using the X skill…" | 13 skills | delete — pure output ceremony, no consumer |

## 8. Drift from the dev-flow spec

Measured against `docs/specs/2026-07-15-dev-flow-v2-design.md`. Most drift is benign and documented; the items that matter are the ones nobody wrote down:

- **[benign]** Steering docs moved to `docs/` (spec said root) and `PRODUCT.md` was added — AGENTS.md documents the current state.

- **[net win]** The worktree-refresh SessionStart hook (#193/#196) post-dates the spec and directly fixed a stated annoyance.

- **[unwritten]** `session-handoff` gained `disable-model-invocation: true` after the spec made it a required step of auto-STOP — the contradiction in §5 is drift nobody reconciled.

- **[unwritten]** The engine rename (`packages/runtime` → `packages/engine`, ADR-0005) never propagated into the release skill.

- **[outpaced]** Spec §5's drain ritual assumed periodic small drains; reality is 47 open defers and a drain skill reworked Aug 5 "for issue types, dedup, and backlog scale."

- **[outpaced]** SOURCES.md pins were verified against bd 1.1.0; the fleet runs bd 1.1.2, whose embedded-dolt merge behavior caused the 86-minute recovery. bd upgrades were designed as "deliberate events" — this one wasn't re-verified.

- **[unexercised]** Spec §12's verification called for one smoke session per quadrant; `auto spec`/`auto task` have barely been exercised since (~2 auto sessions total), so half the matrix is running on untested design.

- **[cosmetic]** The hook still brands its injection "beads-superpowers" (cleanup bead `lk-aes` open for weeks) and cites upstream "ADR-0052" — this repo's ADRs stop at 0007. `.superpowers/` was re-added to .gitignore by #191 after the spec retired it.

## 9. Model-era fit: skills written for a previous Claude

The vendored skills were authored in the Claude 4 era (obra/superpowers and beads-superpowers, mid-2025) and pinned in July 2026. The sessions they now steer run on the Claude 5 family under a Claude Code harness that has itself absorbed much of what the skills mandate. Anthropic's current prompt-audit and model-migration guidance classifies the skills' core idioms as **dated patterns that actively degrade behavior on current models** — not just wasted tokens. This lens strengthens and reframes several findings above.

### The skills' house style is the documented anti-pattern list

| Pattern in the vendored skills | Current Anthropic guidance | Where it shows up here |
|---|---|---|
| Pressure language: `<EXTREMELY-IMPORTANT>`, "You MUST", "This is not negotiable. You cannot rationalize your way out of this." | Written to overcome older models' under-triggering; current models follow the system prompt closely, so the same text now over-triggers and produces rigid, anxious behavior. "Dial back the language" is the documented fix — and an anxious prompt register produces a cautious, hedging model. | using-superpowers (injected every session), TDD, brainstorming's HARD-GATE |
| Anti-rationalization tables (12-row "Red Flags" in using-superpowers; 11-row tables in TDD and systematic-debugging) | Prohibition walls: "describing success beats enumerating failure; a prohibition against a failure the model wasn't going to make can anchor it toward that failure." | ~3 large tables loaded per session via the hook |
| Iron Laws ("NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST… Delete it. Start over.") | Over-specification for judgment tasks. Current models follow instructions literally — an iron law that contradicts the harness or another skill produces exactly what the corpus shows: 100% silent non-compliance, which corrodes every other rule's authority. | TDD (0 invocations since vendoring), writing-skills |
| Step choreography and flowcharts for judgment work | "Skills written for prior models are often too prescriptive for Claude Fable 5 and *reduce* output quality… A/B with step-by-step scaffolding removed — prefer stating the goal and constraints over enumerating the steps." (Fable 5 migration guidance, verbatim.) | brainstorming's numbered steps + graphviz flowchart, SDD's dual digraphs, document-release's steps 0–9 |
| Mandatory announcements ("I'm using the X skill to…", in 13 skills) | Output ceremony with no downstream consumer — the harness now provides its own progress narration, and Claude 5-era guidance is to *remove* forced-narration scaffolding. | 13 skills |

### The harness and models absorbed several skills outright

- **Verification: now a documented deletion.** The Opus 5 migration checklist says it plainly: *"**Delete** verification instructions from prompts and verification steps from the harness — Claude Opus 5 verifies its own work without being asked; removing them reduces over-verification with no capability regression."* This upgrades two findings from "inefficient" to "vendor-recommended removal": the `verification-before-completion` skill (1 invocation — the models and the Claude Code system prompt already enforce evidence-before-claims), and the uniform per-task SDD review whose ~98% "Critical: None" rate is exactly what over-verification looks like. The risk-scaled review recommendation in §11 is therefore aligned with vendor guidance, not just economics.

- **Delegation guidance has inverted.** SDD's "subagents are the default executor" framing dates from models that under-delegated. Claude 5-era Opus guidance is the opposite: it *"delegates to subagents more readily… remove any 'delegate more' guidance and add an explicit cap."* The executor-cluster consolidation should encode a spawn cap and a "work you can finish in a handful of tool calls stays inline" rule, not more delegation encouragement.

- **Anti-sycophancy is trained default.** `receiving-code-review`'s forbidden-phrase lists and gratitude bans target a Claude-4-era failure mode; current models push back by default and the system prompt mandates faithful reporting. Confirms the cut.

- **The harness now ships what the skills reinvent**: structured questions (AskUserQuestion), plan mode, background agents and workflows, native task tracking, /code-review. Where a skill duplicates a harness feature the two fight for authority — visibly: the harness's own reminders repeatedly suggest `TaskCreate` while CLAUDE.md forbids it in favor of beads, a standing contradiction injected into every long session (three times in the session that produced this report alone).

- **Skill size taxes adaptive thinking directly.** Current guidance notes prompt bulk "directly inflates adaptive-thinking spend" — the 73.5K-word tree costs twice, once as context and once as reasoning the model spends reconciling duplicated, conflicting rules (e.g. the brainstorm-everything vs. no-brainstorm contradiction in §5 is not free even when it doesn't misfire).

Caveat on attribution: the mined sessions span multiple models (61 `/model` switches in the corpus) across Jul–Aug 2026, so per-model effects can't be isolated from the logs. The claims above rest on Anthropic's published migration/prompt-audit guidance plus the corpus-level symptoms it predicts (silent non-compliance with iron laws, rubber-stamp verification, announcement noise) — which the logs do show.

## 10. Fleet & context costs

- **437 of 630 transcripts (69%) are hook-spawned security-review agent runs** — the single largest consumer of session count and likely tokens in the fleet. Observed: 4 runs re-reviewing the same ~40-line worktree-refresh hook in one evening. In service/ui dirs, automated runs outnumber human sessions 5:1. Individually cheap; in aggregate, the biggest untriaged spend. One runaway: a Stop hook re-fired 45 times in ~90 seconds against an API 401 (no failure-aware backoff).

- **~9.1KB of hook injection on every session start and every `/clear`** (grew from ~3.4KB in the plugin era) — the full using-superpowers text plus beads context, duplicating discipline AGENTS.md already carries. With AGENTS.md (~10.9KB) that's ~5K tokens of fixed overhead per session; with 97 `/clear`s in the corpus, the re-injection cost is real.

- **Process maintenance is ~22% of master commits since vendoring** (10 of 45; 6 of ~41 post-rollout). The devex worktree is ~100% meta-work; Aug 3–5 spent roughly a full working day on the process rather than the product. Some of it is investment that demonstrably pays (e2e harness, worktree-refresh hook); the skill-text upkeep portion is pure overhead that shrinks with the corpus.

### Codebase-memory MCP: configured, never queried

The codebase graph is fully installed — brew binary gated by `setup.mjs`, wired into `.mcp.json` *and* the user-global Codex config, pinned in `SOURCES.md` ("upgrades are deliberate events"), and given its own convention in AGENTS.md ("for structure questions… query `search_graph`/`trace_path`/`detect_changes` first; fall back to grep"). The benefit side of that ledger is empty:

- **2 of 575 historical transcripts ever called it — both on the vendoring days (Jul 16–17), both setup, zero queries.** The complete lifetime usage is: `list_projects`, `index_status`, and one `index_repository` of the service worktree. The value tools — `search_graph`, `trace_path`, `query_graph`, `search_code`, `get_architecture`, `detect_changes`, `get_code_snippet`, `manage_adr` — have **never been invoked once**, by any session, in three weeks.

- **The convention is dead text that loses to harness-native search every time.** The tool names appear ~190 times in transcripts — that's the AGENTS.md rule riding into every session context — while actual structure questions went to Grep (226 calls), Glob (329) and Explore subagents (43 spawns). No vendored skill routes any step through the graph, so one convention line competes with skill choreography and zero-setup built-ins, and loses 575–0.

- **The index that exists is dead weight.** Two projects are indexed: web-main (6.5K nodes) and `service` — 407K nodes / **622MB** — whose worktree *no longer exists* (current worktrees: devex, engine, infra, security, ui, web-main). The worktrees where all recent work happens were never indexed, so even a willing session would find nothing to query; the rule's own fallback ("index on demand if missing") has fired exactly once, on day two. A 407K-node fast-mode index of a pnpm monorepo also strongly suggests it swallowed `node_modules` — which would make every future reindex slow enough to deter exactly the on-demand use the rule prescribes.

- **Adjacent features duplicate things the setup already does elsewhere:** ADRs are hand-authored in `docs/decisions/` (the using-superpowers doctrine owns that flow), so `manage_adr` is redundant; `detect_changes` overlaps `git diff` in a squash-merge repo with small PRs.

**Verdict: benefits collected ≈ zero; costs are real** (a brew dependency the setup gate fails without, a global Codex config append, ~600MB of orphaned index, upgrade ceremony, and a standing instruction every session reads and ignores). Either delete it from the loop entirely, or make it earn its keep — index the live worktrees automatically (session-start hook), exclude `node_modules`, and route a concrete skill step (e.g. writing-plans' impact survey) through `trace_path`. The second option adds ceremony to a setup this audit says has too much; absent a felt pain grep isn't solving, removal is the consistent call. **Decision (Aug 6): remove it fully** — see §12.

## 11. Recommendations

### Fix now (minutes each — live breakage)

1. **Fix `subagent-driven-development/SKILL.md:298`** → `.agents/skills/subagent-driven-development/scripts/task-brief`. Erases a guaranteed Exit-127 + 2-turn recovery from every SDD run.

2. **Fix the release skill's package list** — `engine` not `runtime`, include `integration-tests`, 10 files. It will misfire on the next release otherwise.

3. **Paste the correct `bd create --graph` edge JSON** (`from_key`/`to_key`/`type`, top-level `edges`) into writing-plans/SDD as a copyable block. Three weeks of recurring failure proves the memory store doesn't fix this; skill text will.

4. **Resolve the auto-STOP dead-end**: inline the 5-line handoff recipe into `session` instead of naming the un-invokable session-handoff skill.

5. **Make land-the-plane pull-before-push** (`bd dolt pull && bd dolt push`) and set the Dolt/git remotes to HTTPS in config rather than carrying the workaround as a memory.

6. **Remove "Merge locally" from finishing's menu and add the Notes section to its PR template** — align the most-used terminal skill with the repo's PR-only rule.

7. **Delete the orphaned 622MB `service` index** (`delete_project`) — its worktree no longer exists; the index is pure disk weight either way §10's codebase-memory decision goes.

### Consolidate (one deliberate session — the ~60% cut)

1. **Cut or fold the dead eleven:** receiving-code-review, document-release, write-documentation, dispatching-parallel-agents, executing-plans (100-word fallback note in SDD), ponytail-audit (a `--repo` flag on ponytail-review), using-git-worktrees (~250-word core into SDD). Relocate codebase-design to `docs/` as reference; move writing-skills' 13K-word reference payload out of the runtime tree (resync-session material).

2. **Single-home the duplicated rules** per the table in §7; delete the 13 "Capture what you learned" copies, the 13 announcement mandates, and run the capture gate once — at finishing — instead of twice per planning cycle.

3. **Trim the heavy used skills**: brainstorming to ~800 w (delete the bd-internals paragraph, the flowchart, the every-project claim — session's triage wins), SDD to ~2,600 w (drop the marketing sections and one digraph), writing-plans to ~1,600 w (dedupe gates), using-superpowers to ~200 w (drop 4 non-Codex platform refs; AGENTS.md owns the doctrine).

4. **Change the register while trimming, not just the length.** Per §9, delete the Claude-4-era scaffolding as a class: `<EXTREMELY-IMPORTANT>` blocks, red-flags/rationalization tables, iron laws, "announce the skill" mandates, MUST/NEVER walls. State each rule once, plainly, with its reason — current models follow that better than shouting, and the shouting is documented to backfire.

5. **Align or delete TDD** — AGENTS.md's testing-judgment ladder is the real, followed rule. An iron law with 100% silent non-compliance is worse than no law.

6. **A concrete way to execute this:** run `/claude-api prompt-audit` over `.agents/skills/` + `AGENTS.md` with the session's current model as target — it produces per-finding `file:line` evidence mapped to the documented pattern list, plus a proposed diff to take hunk-by-hunk.

### Rebalance the process (design decisions for a spec session)

1. **Add the missing triage lanes** — "research/discussion" and "maintenance/housekeeping" as first-class no-ceremony routes in the session skill, so "research only, no session" stops being something the person types.

2. **Scale review intensity with task risk.** ~98% of per-task reviews return "Critical: None"; the real catches were security/parser-shaped. Run per-task review only on risk-flagged tasks; always keep the final whole-branch review (it caught real vulnerabilities twice). This is also the vendor-recommended posture — Claude 5-era guidance is to *delete* harness verification scaffolding because the models self-verify (§9).

3. **Cap subagent delegation in SDD** rather than encouraging it: current Opus-tier models delegate *more* readily than the ones SDD was written for. Add an explicit spawn ceiling and a "work finishable in a handful of tool calls stays inline" rule to the consolidated executor skill.

4. **Demote stress-test from "(Recommended)" at both gates** to on-demand + the auto-mode gate — it's declined ~100% of the time and the double-offer is noise.

5. **Close the unmerged-PR dead zone:** land-the-plane files/keeps a bead pointing at the open PR; getting-up-to-speed (or the session-start hook) surfaces open PRs so a raised-but-unmerged branch can't silently orphan again.

6. **Decide what ponytail actually is.** Invoked 3× with zero markers and zero beads, it is prose-only in practice. Either give it a one-line presence in the hook injection (cheap, always-on) and delete the marker machinery, or accept it as culture and stop calling it a skill with a discipline.

7. **Right-size the memory/defer pipelines:** schedule the drain (47 open defers), raise the injection budget or lower the salience bar deliberately (56 memories, 5 injected), and adopt the rule this audit keeps proving: *operational how-to goes in skill text; memories are for environment facts and continuations.*

8. **Triage the automated security-review fleet** — dedupe per branch/commit so a 40-line hook doesn't get four reviews in an evening; 69% of all transcripts is the largest single cost center in the setup.

9. **Decide codebase-memory-mcp's fate** — three weeks, zero graph queries (§10). **Decided (Aug 6): remove it fully** — from `setup.mjs`, `.mcp.json`, the AGENTS.md convention, and SOURCES.md; delete the orphaned indexes. See §12.

## 12. Dev-flow v3 — direction

Added after a direction-setting discussion on Aug 6. The person reviewed the audit and set the outline for the next iteration of the dev flow. This section records what is settled, answers the open analysis questions (ADR/FDR, beads, unused components, portability), and lists what remains for a v3 spec session.

### Settled by the person, backed by the corpus

- **The pair|auto dial survives; the spec|task axis is replaced by entry points.** The 2×2 matrix collapsed to one quadrant (58 of 64 declarations were `pair task`, §1) because real work doesn't start in two shapes — it starts as full cycle, plan-only, small direct change, debug, research, or a question. v3 makes those the triage lanes, which also retires the opt-out incantation ("research only, no session", 9+ sessions, §4). Finishing intent joins the dial: **default is push branch + raise PR**, with an explicit "hold the PR — test and iterate locally" state; feature branches always; everything eventually lands via PR regardless of size. The hold state must be tracked, not implicit — the #87 dead zone (§5) is what an untracked hold looks like.

- **Pair sessions can flip to auto at any gate.** Mode is a starting posture, not a contract — the observed compressions ("approved, write the plans and then start directly", §4) are exactly this move done informally.

- **Worktree freshness becomes session-owned semantics.** The session knows where it is and aims to start clean; the existing worktree-refresh hook (which runs silently and correctly, §2) can stay as the mechanism underneath, but the *understanding* lives in the session skill, not in hook side-effects.

- **codebase-memory-mcp is removed, fully** — `.mcp.json`, `setup.mjs` gate, Codex config append, AGENTS.md convention, SOURCES.md pin, plus `delete_project` on both orphaned indexes. Zero graph queries in three weeks (§10) made this the easiest call in the set.

### Auto's discipline: doubt, not stress-test

v2 hangs auto mode's entire safety story on `stress-test` as the substitute for spec and plan approval — a skill invoked twice, ever (§1), and one the person actively dislikes. v3 replaces the *gate* with a *posture*, borrowed from the agent-skills library (`~/Code/sandbox/skills/agent-skills`): surface assumptions explicitly before non-trivial work, manage confusion by stopping rather than guessing, and apply **doubt-driven development** — a fresh-context reviewer prompted to *disprove*, fed the artifact and its contract but never the author's claim, bounded at three cycles. That is a materially better fit for how auto sessions actually run: an always-on discipline with a cheap bounded verifier beats a heavyweight gate that fires twice a month. Two cautions from this audit's own findings: adopt the posture, not the liturgy — doubt-driven's full checklist (five choreographed steps, a mandatory cross-model offer every interactive cycle, a rationalization table) is precisely the Claude-4-era scaffolding §9 says to delete; and keep its own "when NOT to use" list load-bearing, or doubt becomes the new capture gate.

### Decision records: ADR + FDR, not a four-record taxonomy

The person is inclined toward the hmans-skills convention (used by chatto): **ADRs** — dated, mostly-immutable records of cross-cutting decisions — plus **FDRs** (Feature Decision Records) — one living document per feature: behavior from the user's perspective, numbered design decisions each with a Why and a Tradeoff, gates, and cross-references, *rewritten in place* so the doc always describes the feature today. What that buys this repo specifically:

- **It fixes the disease specs have.** Specs are point-in-time proposals and drift immediately — this audit found the release skill targeting a renamed package and document-release auditing a repo that doesn't exist (§5). An FDR is *defined* as present-truth, and the convention ships an audit mode (verify every claim against the codebase, report verified/discrepancies/stale/missing). Drift stops being ambient and becomes a bug with an owner.

- **It replaces capture ceremony with periodic audits — the person's stated preference.** The v2 capture gate fires twice per planning cycle with sub-50% yield (§3); the ADR-offer rule adds another ask. Under ADR+FDR the in-session question disappears: the agent updates the FDR it touched (or files the ADR the change obviously warrants) as part of the change, and a periodic `fdr`/`adr` audit catches what slipped. Being lax about small details is the design, not a failure — exactly the trade the person asked for.

- **EDR/PDR aren't needed as new types.** The "adopting CI" example is an ADR under the remit most ADR practice already uses — significant *engineering* decisions, not literally architecture; one sentence in the convention widens it. Product decisions already have homes: global strategy is `docs/PRODUCT.md`; per-feature product behavior is precisely the FDR's Behavior + Design Decisions sections. Two live record types plus the existing steering docs cover the EDR/PDR intent with zero new machinery.

- **It's portable by construction** — plain committed markdown with an INDEX, no proprietary store, readable and writable by any skill library or harness. This is the property the beads move was originally chasing (shared memory in the repo) and didn't deliver.

Relation to specs and plans: **spec = proposal** (intent at a moment — history worth keeping), **FDR = outcome** (present truth, audited), **plan = scaffolding** (superseded by the PR that executes it — the natural candidate if anything moves out of the committed tree).

### Beads: what it actually earns, and where each function goes

| Function | Observed reality (three weeks) | v3 home |
|---|---|---|
| In-session task tracking | ~8–10 ephemeral step-beads per brainstorm closed with written reasons; a hotfix bead created after the fix and closed a minute later (§3) — TodoWrite with sync overhead | Harness-native tracking. The bd mandate was the *entire reason* the beads-superpowers fork exists — dropping it unblocks upstream superpowers (and flips the repo's "TodoWrite forbidden" rule) |
| Cross-session memory | 56 memories, injection budget fits 5; wins are environment lessons + continuations; the `--graph` lesson was recorded Jul 16 and failed to prevent 7 recurrences (§6) | Committed docs. Operational how-to goes in skill/AGENTS text (proven to work); environment facts + continuations in a small committed memory/handoff file the session-start hook injects verbatim |
| Deferrals | 47 open `defer` beads; the person reports the drain's real value is periodic consolidation of themes into tracks — capture still far outpaces it | Two-stage survives, retargeted: capture as a gh issue with a `defer` label at defer time (one `gh` call, conflict-free across parallel sessions, works in sandboxes where Dolt pushes don't); the drain skill reads `gh issue list -l defer` and consolidates into theme tracks (milestones / tracking issues) |
| Subagent coordination | The rule says subagents never touch beads — zero coordination value has ever flowed through bd; SDD coordinates through plan docs + task briefs | Nothing to replace |
| Epic/task graphs | Works when fed correctly, but the edge schema was mis-guessed in 7 sessions across 3 weeks, and the graph duplicates the plan doc's own task list | The plan document's checklist is the single source of truth |

Against those functions, the cost side (§6): the least reliable component in the setup — the push dance on nearly every close, SSH hardware-key stalls in 13 sessions, an 86-minute merge recovery, a dedicated infra session serving the tracker, and a permission classifier that sometimes denies `bd create` mid-flow. The original rationale — non-proprietary memory shared across agents and engineers *in the git repo* — is worth keeping, but beads doesn't deliver it: the Dolt remote is a *second* versioned store outside the repo with its own auth and merge machinery. Committed markdown serves the stated goal strictly better — same remote, PR-reviewed, readable by every harness. **Verdict: the two benefits actually collected (continuations, environment lessons) migrate to committed docs at near-zero cost; nothing else earns the Dolt tax.** The person is accordingly inclined to move from beads-superpowers back to upstream superpowers — see portability below.

### The full not-in-use inventory

The codebase-memory-mcp exercise (§10), applied to every component of the dev flow. "Use" means observed footprint in the transcript corpus, not stated intent.

| Component | Designed role | Observed use | v3 disposition |
|---|---|---|---|
| codebase-memory-mcp | graph-first structure queries (AGENTS.md convention) | 0 queries / 575 transcripts | **[remove]** decided Aug 6 |
| 10 never-invoked skills | codebase-design, document-release, ponytail-audit/-debt/-review, receiving-code-review, using-git-worktrees, write-documentation, writing-skills, session-handoff (~24K words) | 0 Skill invocations / 193 human sessions | **[cut or fold]** per §7/§11 |
| auto-mode machinery | gate substitution, 4-gate review, STOP protocol — half the 2×2 matrix | ~2 sessions; 0 STOP beads ever | **[redesign]** doubt posture, this section |
| stress-test as auto gate | sole substitute for spec + plan approval in auto | 2 invocations ever | **[replace]** doubt-driven posture |
| TDD iron law | nominally binds every implementer | 0 invocations post-vendoring | **[cut]** testing-judgment ladder is canonical |
| ponytail markers + ponytail-debt harvest | shortcut ledger: labeled beads + `// ponytail:` anchors | 0 anchors, 0 labeled beads ever | **[delete machinery]** keep the one-line culture rule |
| Agent-Filed Bead Discipline | subagent deferral protocol, referenced by 9 skills | home skill invoked once; subagents never file | **[dies with beads]** |
| drain-deferrals pipeline | defer-bead → GitHub-issue drain + theme consolidation | a handful of runs; 47 beads waiting | **[retarget to gh]** keep the consolidation step — it's the part that earns |
| memory-curator + salience injection | memory hygiene + budgeted session-start recall | run twice; 56 memories, pipe fits 5 | **[replace]** committed docs + periodic audit |
| session-handoff | auto-STOP handoff artifact | 0 (model-invocation disabled by design) | **[inline]** 5-line recipe into session |
| platform-adaptation refs | OpenCode / Copilot / Pi / Antigravity harness guides in using-superpowers | only Claude Code + Codex ever used | **[drop non-Codex refs]** |
| writing-skills reference payload | skill-authoring guide + fixtures in the runtime tree | 13.2K words, 0 invocations | **[move out of runtime tree]** |
| brainstorming step-beads | per-step progress tracking | ~8–10 beads/session of pure bookkeeping | **[dies with the bd mandate]** |
| document-release | release-notes audit | 0 invocations; describes a different repo's layout | **[cut]** /release owns the flow (fix its package list, §11) |

### Portability: repo-owned substrate, swappable process provider

The person's end-state: local conventions for docs/plans/ADRs/FDRs/memory that hold still while skill libraries — superpowers, agent-skills, mp-skills, hmans-skills — can be tried and swapped. That inverts v2's architecture, and the inversion is the design:

- **The substrate is the repo's and library-agnostic:** AGENTS.md (rules), `docs/specs/`, `docs/adr/` + `docs/fdr/` with INDEXes, a committed memory/handoff file, the branch/PR conventions, and the session/triage skill — which the corpus says is the one skill that is genuinely this repo's own (588 words, best fit in the tree, §12-appendix). Providers write *into* these paths; no provider brings its own store.

- **Providers are vendored side by side** (`.agents/skills/<provider>/`, provenance in SOURCES.md as today) with one active set routed by the session skill. Swapping providers = repointing the routing table, nothing else. A fair trial is possible only because artifacts (spec, plan, FDR, PR shape) are judged at the substrate, not inside the provider's own vocabulary.

- **The first swap is already justified:** beads-superpowers → upstream obra/superpowers. The fork's raison d'être was replacing harness task-tracking with bd; once bd stops being the mandated tracker, the fork maintains a delta with no purpose. Upstream + the repo substrate + the trimmed skill set (§11) is strictly less to maintain. For the head-to-head against agent-skills as the alternative provider, see §13.

### Second round: agent-skills as the provider, deferral capture, harness todo & memory

**Swapping superpowers for agent-skills while keeping the SPECS/PLANS discipline works — and is the substrate architecture's first real test.** Read against the actual files: agent-skills' `spec-driven-development` runs SPECIFY→PLAN→TASKS→IMPLEMENT with a human gate at each phase and explicitly mandates committing the spec ("the spec belongs in version control"); `planning-and-task-breakdown` produces a reviewable plan doc with sized, acceptance-criteria'd, dependency-ordered tasks. The discipline is native to the library. Three adaptations are load-bearing:

- **Override its output paths.** The library's convention is a single mutable `tasks/plan.md` + `tasks/todo.md` (its `/plan`/`/build` commands expect them) — that erases history and collides with running 4–5 parallel worktrees on different features. A ~10-line "output conventions" block in AGENTS.md (spec → `docs/specs/YYYY-MM-DD-slug.md`, plan → `docs/plans/…`, todo → the plan's own checkboxes) re-points it; the library's meta-skill already declares repo instructions take precedence over skills.

- **Tell it what a spec means here.** Its six-section spec template is project-onboarding-shaped — Commands, Project Structure, Code Style, Testing Strategy, Boundaries are repo *constants* that AGENTS.md already owns. Without an override every feature spec re-derives them; with one sentence ("repo-level sections live in AGENTS.md; a spec here is a per-feature design doc: Objective, design, Success Criteria, Open Questions") the template collapses to what `docs/specs/` already looks like.

- **Don't lose per-task fresh-context review in the swap.** The SDD review loop is what caught four vulnerability classes pre-merge (§2). agent-skills has the capability differently shaped (`code-review-and-quality`, doubt-driven) but its `incremental-implementation` is inline slice-by-slice, not subagent fan-out — the risk-scaled review posture (§11) must be wired into the substrate's finishing/review lane, not assumed from the provider.

Same model-era caveat as the current tree: agent-skills carries its own rationalization tables and red-flag lists — budget for the §9 trim there too.

**Deferral capture (corrected from the first round):** the person reports the drain has run a handful of times recently and its real product is *consolidating themes into tracks* — so v3 keeps the two-stage shape and swaps the substrate. Capture: when scope falls out during brainstorm/spec/plan, file a gh issue with a `defer` label + provenance line — one command, no sync, conflict-free across parallel sessions (issues are independent objects), and it works from sandboxed sessions where Dolt pushes demonstrably don't (gh credentials are the one auth path the corpus shows always working). Decide-later stays intact: the drain skill reads `gh issue list -l defer`, consolidates into tracks (milestones or tracking issues with task lists), closes what doesn't make the cut.

**Harness-native todo tracking — what it is and isn't:** every harness's todo tool is session-scoped UI ergonomics, not shared state. Claude Code: TodoWrite/task tools — a checklist bound to the session, surviving resume/compaction within it, invisible to every other session. Codex: `update_plan` — same semantics, a step list rendered in its TUI. Pi: deliberately ships no todo tool (minimal-harness philosophy; files or extensions fill the gap). None of them coordinate 4–5 parallel sessions — but neither did beads in practice: parallel-session writes are exactly what produced the Dolt merge conflicts. The v3 division of labor: *in-session steps* → whatever the harness offers (free, zero setup); *cross-session/parallel state* → the plan doc's checklist (lives in the worktree, travels with the branch) plus gh issues/PRs (the global in-flight view is `gh pr list`, which is already the person's view).

**Repo-checked memory is now the industry norm, not an experiment.** The ecosystem converged on committed instruction/memory files: the AGENTS.md standard (read natively by Codex and a growing list of harnesses — this repo already symlinks CLAUDE.md to it), Claude Code's CLAUDE.md project memory (designed to be committed and team-shared, with `@path` imports to pull other committed files in), Cursor's `.cursor/rules/`, Copilot's `.github/copilot-instructions.md`, and community patterns like Cline's Memory Bank (several committed markdown files as durable project memory). What stays local everywhere is session state and *auto*-memory (Claude Code's automemory lives under `~/.claude` — the local-only property the person wants out of). Concrete v3 wiring: `docs/memory/lessons.md` — small, curated, environment facts and gotchas — pulled into every Claude Code session via a CLAUDE.md `@docs/memory/lessons.md` import (no hook code needed) and via one "read this at session start" line in AGENTS.md for every other harness; continuations/handoffs as a per-worktree file rather than a global store. Two properties beads never had: memory edits arrive as reviewable diffs in PRs, and the injected file's size is visible and prunable at the same periodic audit as ADR/FDR — versus the invisible 2,575-byte salience pipe that silently dropped 51 of 56 memories.

### Open for the v3 spec session

1. **Specs/plans in the tree?** Recommendation: specs stay committed (cheap intent-history), plans go ephemeral (scaffolding superseded by the PR), FDRs carry present truth. The person flagged "unsure" — this is their call to confirm.

2. **Any residual bd role** (purely local scratch tracker, no Dolt sync) or full removal? Full removal is cleaner; local-only keeps CLI familiarity at zero sync cost.

3. **Audit cadence:** what triggers the periodic ADR/FDR/memory audits — the release skill, a monthly chore lane, or on-demand?

4. **Worktree freshness mechanics:** session-skill semantic over the existing hook, or fold the hook away entirely?

5. **Provider-trial protocol:** what a fair comparison looks like (e.g., the same mid-size issue run under two providers) before any wholesale switch.

6. **Handoff/continuation file placement:** committed on the feature branch (portable, survives machine moves, but finishing must remove it before the PR) vs. gitignored per worktree (zero cleanup, but local-only again).

## 13. Provider head-to-head: superpowers vs agent-skills

Both candidates read in full from `~/Code/sandbox/skills/`: **upstream obra/superpowers v6.2.0** (last commit Jul 27 — one minor version ahead of the vendored fork's v6.1.1 base) and **agent-skills v1.0.0** (ENNEADLABS; last commit Aug 5, active CI, 459+ merged PRs, ships its own evals). A framing fact first: of the 31 vendored skills, **only 14 exist in upstream superpowers** — session, stress-test, ponytail×3, RDD, memory-curator, drain-deferrals, session-handoff, getting-up-to-speed, project-init, document-release, release and the rest are beads-fork/ponytail/mattpocock additions. "Back to upstream" sheds most of the dead tree automatically; the head-to-head below is between the two clean candidates, not against the fork.

### At a glance

| Dimension | superpowers (upstream v6.2.0) | agent-skills (v1.0.0) |
|---|---|---|
| Skills / runtime tree | 14 skills · 19.0K SKILL words + 21.1K in-skill references ≈ **40K** | 24 skills · 44.3K SKILL words + 4.9K in-skill + 8.6K shared checklists ≈ **58K** |
| Per-session fixed injection | SessionStart hook injects the full using-superpowers text (~480 words upstream — the vendored 9.1KB composite is fork inflation) | SessionStart hook is a 1KB *pointer* to using-agent-skills (1,307 words loaded on demand) |
| Register (§9 lens) | Iron Laws in 4 files, `EXTREMELY` blocks in 2, the 1%-rule / "ABSOLUTELY MUST" / "not negotiable" in using-superpowers (upstream text, not fork additions), announce mandates in 6, rationalization tables in 9, 20 MUSTs | 0 iron laws, 0 EXTREMELY, 1 MUST, 3 announce — but Red Flags sections in 23/24 files and rationalization tables in 22/24: the shouting is gone, the anti-rationalization *furniture* is institutionalized |
| Tracker assumption | TodoWrite in 7 files (harness-native — fine once the bd mandate drops) | None — zero TodoWrite references; tracker-agnostic |
| Memory assumption | None (beads was the fork) | None |
| Artifact conventions | Dated plan files: `docs/superpowers/plans/YYYY-MM-DD-name.md` — one path repoint to `docs/plans/`; no dedicated spec skill (the design doc comes out of brainstorming) | `SPEC.md` at repo root (via `/spec`), `tasks/plan.md` + `tasks/todo.md` — needs the §12 output-conventions override + spec-template scoping |
| Orchestration model | SDD: fresh subagent per task + per-task review subagent; dispatching-parallel-agents for fan-out | Inline incremental implementation; "the user (or slash command) is the orchestrator — personas never invoke personas"; 4 persona subagents (code-reviewer, security-auditor, test-engineer, web-perf-auditor) |
| Review / verification | requesting/receiving-code-review + TDD iron law + verification-before-completion | code-review-and-quality (five-axis) + code-simplification + doubt-driven fresh-context adversarial review + a shared Definition-of-Done reference |
| Extras | Gemini extension + GEMINI.md (multi-harness), docs, tests | 8 slash commands (TOML), 7 shared checklists (security/a11y/perf/observability/testing), evals suite, sdd-cache + simplify-ignore hooks |
| Corpus status | **Battle-tested here** — the entire used core (§1) is this lineage: brainstorming 33, writing-plans 38, SDD 37, finishing 15, systematic-debugging 9 | Untested in this repo; doubt-driven already selected for v3's auto posture |

### Lifecycle coverage map

| Phase | superpowers | agent-skills | Corpus note |
|---|---|---|---|
| Session triage / mode | — (the fork added `session`) | — (using-agent-skills routes by phase, no pair\|auto) | repo-owned either way — the substrate's one native skill |
| Ideation / define | brainstorming (1,494 w) | interview-me (2,400 w) + idea-refine (1,278 w) | brainstorming's first question kills scope ambiguity (§2) |
| Spec | no dedicated skill — design doc via brainstorming | spec-driven-development, human-gated, "commit the spec" | substrate keeps `docs/specs/` regardless (§12) |
| Plan | writing-plans (1,034 w, dated files) | planning-and-task-breakdown (1,260 w, sized tasks, checkpoints) | writing-plans is the most-invoked skill (38) |
| Execute | SDD fan-out (4,074 w) + executing-plans | incremental-implementation (1,477 w, inline slices) | SDD's review loop caught 4 vuln classes (§2); Claude-5 guidance says cap delegation (§9) — the inline model deserves a fair run |
| Test / verify | TDD (iron law) + verification-before-completion | TDD (calmer) + browser-testing-with-devtools + DoD reference | TDD: 0 invocations post-vendoring; the repo ladder is canonical |
| Debug | systematic-debugging (1,440 w) | debugging-and-error-recovery (1,677 w) | proven here: 13-min root causes (§2) |
| Auto-mode discipline | — (stress-test was fork-only) | doubt-driven-development + context-engineering + source-driven-development | the person already picked the doubt posture (§12) |
| Domain packs | none | security, performance, frontend-UI, API design, CI/CD, observability, deprecation, shipping (~15K w) + 5 checklists | the corpus's biggest wins were security-shaped; e2e/browser harness already exists in-repo |
| Git / finishing | finishing-a-development-branch + using-git-worktrees + dispatching-parallel-agents | git-workflow-and-versioning + shipping-and-launch | finishing needs the repo rewrite (PR-only, Notes) under either provider |
| Docs / decisions | writing-skills (3.8K w authoring guide) | documentation-and-adrs (1,470 w) | v3's ADR/FDR convention comes from hmans-skills either way (§12) |

### Reading the differences

- **Philosophy: enforcement vs encyclopedia.** superpowers is a compact process *discipline* — few skills, strong gates, compliance idioms doing the enforcement. agent-skills is a senior-engineer *practice catalog* — twice the skills, calmer voice, breadth across domains superpowers never touches. The audit's evidence cuts both ways: the superpowers core demonstrably works here, and the compliance idioms are §9's documented anti-patterns; agent-skills avoids the shouting but standardizes Red-Flags/Rationalization furniture in ~95% of files — the same genus, milder species. **Both need the §9 trim; neither ships model-era-clean.**

- **The execution-model choice is the real fork in the road.** superpowers' SDD (fresh subagent per task + per-task review) produced the corpus's highest-value catches, but §11 already recommends capping delegation and scaling review to risk — which moves *toward* agent-skills' inline-implementation + on-demand-persona model ("the user is the orchestrator"). If v3 adopts risk-scaled review anyway, the practical gap between the two models shrinks to: who spawns the reviewer, and when.

- **Fixed cost favors agent-skills' mechanism, size favors superpowers' tree.** A 1KB pointer hook beats full-text injection (the current 9.1KB injection is fork inflation of superpowers' pattern, and §11 already prescribes shrinking it). But the runtime tree is 40K vs 58K words — and after the §11 consolidation, a trimmed superpowers lands near ~19K while agent-skills' breadth is only cheap if the domain packs are actually used. Loading security-and-hardening (2,926 w) + a checklist (1,640 w) for a real security slice is money well spent; carrying 8 domain skills that never fire is the dead-eleven problem §1 already diagnosed, in a new wardrobe.

- **Maintenance posture differs.** agent-skills is the more active project (CI, evals, hundreds of PRs, hooks that cache and dedupe) — a library that tests itself. superpowers is one author's steadily-versioned corpus with multi-harness packaging (Gemini extension). For a repo that vendors and diverges (SOURCES.md), upstream velocity matters less than fork friction — and the v3 substrate is designed to make either cheap to track.

- **Overrides each needs to fit the substrate (§12):** superpowers — repoint `docs/superpowers/plans/` → `docs/plans/`, delete the pressure idioms, rewrite finishing for PR-only, accept TodoWrite as the in-session tracker. agent-skills — the output-conventions block (spec/plan paths), spec-template scoping to per-feature design docs, wire per-task-or-risk-scaled review into the substrate, same idiom trim. Neither list is large; both are one AGENTS.md block plus skill edits.

### Verdict

**For v3's first iteration: trimmed upstream superpowers as the active provider; agent-skills as the source of the auto-mode posture and on-demand domain packs — then a real trial per §12's protocol.** The reasoning: every measured win in this corpus came from the superpowers lineage, its failure modes are now precisely mapped (this report), and the §11 trim turns it into a ~19K-word tree with one path repoint. Meanwhile the two things agent-skills does that superpowers structurally cannot — doubt-driven fresh-context review for auto mode, and domain checklists for security/perf/frontend slices — can be adopted *as individual skills into the substrate today* without switching providers, because v3's architecture makes single-skill imports legal. The one configuration to avoid: running both meta-skills at once — using-superpowers' 1%-rule and using-agent-skills' phase router are competing doctrines, and two routers means neither is authoritative. One active router (the repo's session skill), one provider tree, cherry-picked imports clearly homed in the substrate.

## 14. The v3 proposal — flow & tooling

The synthesis of everything above into one buildable design. Principles: **the repo's laws steer; providers conform** (AGENTS.md is the constitution, skill libraries are method text); **canonical records over synced stores** (every durable thing is a committed file a human reviews in a PR); **artifacts over ceremony** (each gate produces a document, not a question); **minimum moving pieces**; **graceful degradation across harnesses** (Claude Code, Codex, OpenCode all read the same files).

### The complete picture

| Layer | Component | Role |
|---|---|---|
| **Steering** — canonical, committed | `AGENTS.md` (=CLAUDE.md) | The laws: output paths & naming, PR-only branching, testing-judgment ladder, worktree lifecycle, the decision-record trigger, deferral rule, provider routing. The *only* place a rule lives — skills reference it, never restate it (§7). Plus environment facts that change agent behavior (the HTTPS-remote class of lesson). |
| `docs/CONTEXT.md` · `PRODUCT.md` · `DESIGN.md` · `changelog.md` | Domain language, product strategy, visual identity, release buffer — unchanged. Overextension check: each answers a distinct question no other file answers; the risk was never these four files, it was rules duplicated across skills (§7). Keep all. |  |
| **Records** — canonical, always current | `docs/decisions/` — ADRs + INDEX | Engineering forks in the road (remit widened past literal architecture — "adopt CI" qualifies). Dated, mostly immutable, superseded not edited. |
| ⤷ | `docs/fdr/` — FDRs + INDEX | One living doc per feature: behavior, numbered design decisions (Why + Tradeoff), gates. Rewritten in place — always describes the feature *today*. This is where per-feature product forks live. |
| `docs/TODO.md` | The deferral buffer — see below. |  |
| **Working docs** — point-in-time, drift is fine | `docs/specs/` | The ERD/PRD analog: per-feature design proposals, human-reviewed at a gate, committed as history of intent. Allowed to drift once shipped — the FDR carries present truth. |
| `docs/plans/` | Implementation plans: sized, ordered, verifiable tasks with acceptance criteria; human-reviewed; written so each task brief is self-contained — which is what makes delegation to cheaper executor models possible. |  |
| **Skills — repo-owned** — ~6, the stable core | `session` · `sdd-executor` · `finish` | `session`: the router — entry lanes × pair\|auto, the only meta-skill (§13's one-router rule). `sdd-executor`: vendored from upstream superpowers SDD, trimmed and path-fixed — fresh subagent per task + risk-scaled per-task review; substrate-owned so it survives provider swaps. `finish`: PR-only finishing; land-the-plane = record check → TODO check → push → PR. |
| `lodekit-drain-todos` · `release` · `records-audit` | The TODO drain (below); the existing release flow (package list fixed per §11); the periodic ADR/FDR audit, adapted from hmans-skills' audit modes. |  |
| **Provider** — one active, swappable | `.agents/skills/<provider>/` | superpowers (trimmed) *or* agent-skills — method text for ideate/spec/plan/implement/review/debug, routed by the session skill's table. Provenance and divergence in SOURCES.md, as today. Individual cross-imports (e.g. doubt-driven, a security checklist) are legal and homed in the substrate. |
| **Harness & tooling** | `gh` · git worktrees · harness todos · Playwright MCP + `pnpm e2e` | `gh`: issues (durable backlog), PRs (the global in-flight view). Worktree-refresh hook stays as the mechanism under session-owned semantics. Harness-native todos: in-session steps only, any harness's flavor. The e2e/browser harness is product tooling — untouched. |
| **Removed** | **[gone]** beads + Dolt (all five functions rehomed, §12) · codebase-memory-mcp · ponytail marker machinery + -audit/-debt/-review · stress-test · session-handoff · memory-curator · drain-deferrals (→ drain-todos) · the 10 dead skills · the 9.1KB session injection (→ ~1KB pointer) · the TodoWrite prohibition · automemory stays off |  |

Moving-piece count: v2 ran 31 skills + bd/Dolt + an MCP graph + a memory pipeline + a 9.1KB injector. v3 is 5 steering docs, 3 record surfaces, 2 working-doc dirs, ~6 repo skills, 1 provider tree, and `gh`/git — nothing that syncs, daemonizes, or lives outside the repo.

### Decision memory — the ADR/FDR answer, with a trigger rule

The person's constraint set — shared across Claude Code/Codex/OpenCode, no automemory, *not* for technical quirks or research findings, *for* "forks in the road the team decided" — is satisfied by plain committed records, because the constraint set is almost a definition of ADR+FDR. The piece that makes it work unattended is the **trigger rule**, which answers "how does the harness know something is worth noting":

- **Record when a fork was taken:** an alternative was seriously considered and foreclosed, or the choice is one a future reader could not infer from the code. Engineering-shaped → ADR; feature-behavior-shaped → the feature's FDR. **Do not record:** quirks, research findings, how-tos — environment facts that change agent behavior go to AGENTS.md; everything else deliberately has no memory home. (This narrows §12's earlier `lessons.md` sketch to AGENTS.md-only, per the person's constraint.)

- **The check runs at gates that already exist** — spec approval, plan approval, and PR assembly — as a question the agent answers itself from the trigger rule, not a question posed to the person. The record edit ships *in the same PR* as the change: definition of done, reviewed as a diff. No mid-session "worth capturing?" prompts — that gate's sub-50% yield is why v2's version failed (§3).

- **The safety net is periodic `records-audit`** — hmans-skills' audit mode: verify every FDR claim against the codebase, report verified/discrepancies/stale/missing. Lax capture + honest audit is the trade the person chose.

- **Rejected alternatives:** a single append-only DECISIONS.md (no per-feature entry point; becomes sludge), beans' archived-issues-as-memory (pre-1.0 schema churn), automemory (local-only, per-harness — the thing being escaped).

### Deferrals — `docs/TODO.md` + `/lodekit-drain-todos`

Per the person's design: descoped/postponed work from *any* phase (brainstorm, spec, plan, mid-build) is appended to `docs/TODO.md` — one line per item, dated, with provenance — and lands in the same PR as the work that descoped it, so the deferral is consistent with the code state it was deferred *from* (the drift objection to filing gh issues at dev time). Suggested line shape: `- [2026-08-06 · spec:theme-editor] per-app theme overrides — descoped from v1`. Parallel-session note: single-line appends make the rare merge conflict trivial to resolve.

**`/lodekit-drain-todos`** (replaces drain-deferrals, keeps its proven consolidation value): on invocation — branch; group TODO lines into themes/tracks with the person; create the gh issues (one per item or per consolidated track); delete the drained lines; raise a PR whose body links every issue created. The PR requirement is a feature: the drain is itself reviewed, and TODO.md's history shows exactly when each deferral became backlog.

### Keeping SDD without beads — yes, out of the box

Directly answering the question: **upstream superpowers SDD has no beads dependency** — the bead graph was the fork's addition. The executor needs exactly two things: a plan document with ordered, self-contained tasks, and a harness that can spawn subagents. So v3 makes it substrate-owned (`sdd-executor`) and provider-independent: under agent-skills, everything else (ideation, spec, plan, review method) comes from agent-skills while execution still runs fresh-subagent-per-task with the per-task review loop that caught four vulnerability classes (§2). Three wirings make it clean:

- **The reviewer's brief comes from the active provider** — superpowers' two-stage review templates, or agent-skills' code-review-and-quality axes + security checklist. The loop is substrate; the review content is provider.

- **Cheaper-model delegation is preserved** — task briefs are self-contained by construction (the plan discipline), so executor subagents can run on a cheaper model exactly as superpowers does today; the orchestrator and reviewers stay on the strong model.

- **Degradation path:** on a harness without subagent spawn (Codex today), the same plan doc runs inline via the provider's incremental-implementation skill, with review falling back to the doubt posture. Same artifacts, reduced isolation — no rewrite.

### Flat-file trackers (ticket, beans): hold in reserve

Both are essentially "beads minus the sync layer" — markdown files in the repo, merged by git, diffs visible in PRs, no daemon, no second remote, sandbox-friendly. **wedow/ticket** (`tk`): a bash CLI over `.tickets/` markdown-with-frontmatter; dependencies, `ready`/`blocked` queues, cycle detection; ~850 stars; and it ships a `migrate-beads` tool — this exact migration is a trodden path. **hmans/beans**: Go CLI over `.beans/`, TUI, a `prime` command for agent instructions, GraphQL-scoped queries; pre-1.0 with explicit schema-churn warnings; same author as the ADR/FDR skills. **Verdict: v3 starts with zero tracker.** Plan docs carry in-flight work, TODO.md carries deferrals, gh issues carry the backlog — that covers every observed need. If dependency-heavy epics ever outgrow the plan-doc checklist, `tk` is the escape hatch (one bash file, no infrastructure); adopt it on demonstrated pain, not in advance.

### The provider-interchange contract

| The substrate fixes (never moves) | The provider supplies (swappable) |
|---|---|
| Artifact paths & naming (specs, plans, ADR/FDR, TODO.md) · the gates and who approves them · the laws (PR-only, testing ladder, decision trigger, deferral rule) · the session lanes and routing · the SDD executor · finishing/release/drain/audit skills | Method text: how to ideate, spec, plan, implement, review, debug · domain checklists (security, perf, a11y, frontend) · personas/reviewer briefs · in-skill templates |

Switching provider = four steps: vendor the tree under `.agents/skills/<provider>/` → run the §9 idiom trim → update the session skill's routing table (lane → skill name) → run one trial task per lane. The overrides each candidate needs are already specified: superpowers (§13 — plan-path repoint, idiom trim, finishing rewrite), agent-skills (§12 — output-conventions block, spec-template scoping, review wiring). Never run two meta-skills at once; the session skill is the only router.

### The flow, end to end — five walkthroughs

Skill names shown as **[superpowers]** / **[agent-skills]** where the provider supplies the step; everything else is substrate and identical under both.

| Scenario | Lane & flow | Artifacts & records |
|---|---|---|
| **Large feature** — e.g. theme editor | `/session pair` → full-cycle lane. (1) Ideate — *brainstorming* / *interview-me → idea-refine*; scope that falls out → TODO.md. (2) Spec → human gate. (3) Plan — *writing-plans* / *planning-and-task-breakdown* → human gate. (4) Execute — `sdd-executor`: fresh subagent per task (cheaper model optional) + risk-scaled per-task review from the provider's brief. (5) Verify — testing ladder + `pnpm e2e`; Greenhouse DoD if it's an SDK capability. (6) `finish` → PR; person merges. **Auto variant:** same lane; human gates become doubt-driven fresh-context reviews; a genuine STOP writes the handoff file and leaves a draft PR. | spec (committed) · plan (committed) · FDR created/updated + any ADR, in the PR · changelog entry · TODO.md deltas listed in the PR body |
| **Small coding task** — e.g. add a setting | Plain ask or `/session pair task` → direct-change lane. No spec, no plan doc; harness todo for steps; implement inline — *(no ceremony)* / *incremental-implementation*; lowest-rung test; branch + PR. The 7-minutes-to-first-code case (§3) stays the benchmark. | PR only · FDR touched *only* if behavior forked · TODO.md if something was consciously left out |
| **Bug fix** | Debug lane → *systematic-debugging* / *debugging-and-error-recovery*: reproduce → localize → fix + regression test at the lowest ladder rung → PR. Adjacent pre-existing issues discovered en route → TODO.md, not scope creep (the tray-desync pattern, §2, now with a cheaper capture). | PR with regression test · ADR only if the root cause forced a design fork · TODO.md for adjacent finds |
| **Research** | Research lane — first-class now, no more "research only, no session" incantation (§4). No branch, no ceremony, no records. Output is the answer, or a doc if asked. Findings that change agent behavior → an AGENTS.md edit via PR. Explicitly *not* memory. | usually nothing — that's the point |
| **Question** | Question lane: answer directly. Zero artifacts, zero residue. The triage table finally has the lane the person kept typing by hand. | none |

### What the recap missed — the "anything else?" list

1. **The release flow** — `/release` + the changelog buffer work and are absent from the recap; they stay (with the §11 package-list fix).

2. **Handoff/continuation** — with beads gone, the resume-across-sessions story needs its home decided: per-worktree `HANDOFF.md`, stripped by `finish` before the PR (recommended), or gitignored (local-only again). It's the §12 open question, now load-bearing.

3. **The security-review fleet** — 69% of all transcripts (§10) is untouched by everything above; v3 should set the dedupe policy (one review per branch/commit) at the same time.

4. **A CI test gate** — PR-only flow with human merges deserves `pnpm test` in CI as the mechanical backstop; verify it exists, add if not.

5. **Greenhouse definition-of-done** — the showcase-coverage convention (root/README) is orthogonal to the process swap and should survive it explicitly.

6. **Worktree lifecycle text** — when using-git-worktrees dies, its three useful commands move to AGENTS.md, not to nowhere.

7. **Vendored-divergence ledger** — SOURCES.md continues under any provider; trims are divergences and get recorded, or the next re-vendor silently restores the cruft.

## 15. Appendix — per-skill verdicts

| Skill | Words (total) | Invocations | Verdict |
|---|---|---|---|
| session | 588 | 20 +23 slash | **[keep]** fix auto-STOP + triage-vs-AGENTS.md PR rule; the tightest skill in the tree |
| writing-plans | 2,460 | 38 | **[keep]** trim ~600 w; add the --graph JSON block |
| subagent-driven-development | 6,165 | 37 | **[keep]** fix script path; trim ~1,200 w of marketing/example |
| brainstorming | 4,597 | 33 | **[trim hard]** → ~800 w; drop "every project" claim, bd internals, flowchart |
| finishing-a-development-branch | 1,852 | 15 | **[rewrite for repo]** 2 options, PR-only, Notes section; single home of land-the-plane |
| systematic-debugging | 5,301 | 9 | **[keep]** delete 1,833 w of authoring fixtures from runtime tree |
| research-driven-development | 4,331 | 4 | **[trim]** → ~800 w; verifier opt-in; fix gitignored-document law |
| executing-plans | 1,326 | 4 | **[merge into SDD]** its own text says to use SDD instead |
| test-driven-development | 2,917 | 4 (0 post-vendor) | **[align or cut]** iron law vs. ponytail vs. AGENTS.md ladder |
| ponytail | 1,125 | 3 | **[decide]** never loads despite "active every response"; marker rule never fired |
| stress-test | 1,927 | 2 | **[keep on-demand]** demote from "(Recommended)"; it earns its keep when asked for |
| memory-curator | 1,402 | 2 | **[trim]** → ~500 w; kill the 13 capture-block copies |
| dispatching-parallel-agents | 1,591 | 2 | **[merge into SDD]** ~150 w of it is load-bearing |
| domain-modeling | 818 | 2 | **[keep]** trim to ~300 w; soften the glossary-only absolutism |
| verification-before-completion | 1,322 | 1 | **[split]** bead-stamp → AGENTS.md; rest folds into finishing (discipline lives on in SDD reviewer prompts) |
| requesting-code-review | 1,126 | 1 | **[merge into SDD]** superseded by task-reviewer-prompt |
| getting-up-to-speed | 1,795 | 1 +5 slash | **[keep]** trim the output template; add open-PR surfacing |
| drain-deferrals | 1,495 | 1 | **[keep]** right-sized; needs to actually run — 47 open defers |
| project-init | 2,115 | 1 | **[keep]** break-glass by design; the right kind of rarely-used |
| release | 704 | 0 +4 slash | **[fix now]** packages/runtime doesn't exist; 10 files not 9 |
| session-handoff | 895 | 0 +2 slash | **[keep]** human-only is right; un-name it from session's auto-STOP |
| using-superpowers | 1,963 | auto-loads | **[trim hard]** → ~200 w; drop 4 platform refs; AGENTS.md owns doctrine |
| codebase-design | 1,659 | 0 | **[relocate]** it's reference material — docs/, not a skill |
| ponytail-review | 339 | 0 | **[keep]** exemplary density; wire into SDD final review |
| ponytail-debt | 323 | 0 | **[fold]** into drain-deferrals; nothing to harvest yet |
| ponytail-audit | 234 | 0 | **[merge]** into ponytail-review as --repo mode |
| receiving-code-review | 1,138 | 0 | **[cut]** 3 bullets survive into finishing/AGENTS.md |
| using-git-worktrees | 1,770 | 0 | **[merge into SDD]** npm/cargo baselines in a pnpm monorepo |
| document-release | 2,116 | 0 | **[cut]** audits a repo that isn't this one |
| write-documentation | 4,856 | 0 | **[cut from tree]** keep as docs/ reference if wanted |
| writing-skills | 13,202 | 0 | **[trim + relocate refs]** → ~600 w; resync-session material, 18% of the tree |

**Method.** Quantitative pass: grep/jq mining of all 630 jsonl transcripts in `~/.claude/projects/*lodekit*` (skill invocations, slash commands, AskUserQuestion counts, session-mode declarations, dolt-push failures, human-vs-automated classification by first-message marker). Qualitative pass: four parallel analysis agents — one auditing all 31 skills' content against AGENTS.md, SOURCES.md, and the dev-flow-v2 spec; three deep-sampling ~45 sessions across service/ui/infra, stack/manager/github/engine, and web/devex/docs/security. Every file-level claim quoted here (release package list, task-brief path, brainstorming/session contradiction, session-handoff frontmatter, RDD gitignore law, document-release ADR claim, capture-block count) was independently re-verified against the working tree at `7ac6ad6`. Session IDs are transcript basename prefixes. The model-era analysis (§9) draws on Anthropic's current model-migration and prompt-audit guidance (Claude 5 family: behavioral shifts, over-verification, delegation, dated-pattern taxonomy) as shipped in the claude-api skill reference, cross-checked against corpus symptoms. Generated 2026-08-06 by a research-only session; no repo files were modified. Same-day addenda: the codebase-memory-mcp analysis (§10; 575-transcript tool-call pairing, live `list_projects`/`index_status` state) and §12, recording the dev-flow v3 direction set by the person after reviewing the audit — including the ADR/FDR analysis (hmans-skills convention), the beads function-by-function verdict, the not-in-use inventory, and a second round on agent-skills as provider (read against its actual spec/planning skill files), deferral capture via gh, and harness-native todo/memory semantics. The drain-deferrals figures were corrected in that round per the person's report of recent theme-consolidation runs. §13 (provider head-to-head) reads both candidate libraries in full from `~/Code/sandbox/skills/` — file inventories, word counts, and style-marker greps (iron laws, EXTREMELY blocks, rationalization tables, TodoWrite references) are measured from those trees, versions superpowers v6.2.0 (Jul 27) and agent-skills v1.0.0 (Aug 5). §14 (the v3 proposal) synthesizes the person's decisions from the same-day discussion — TODO.md deferrals, ADR/FDR as the only memory, provider interchange — plus assessments of wedow/ticket and hmans/beans from their GitHub repos. The side menu and §14 were the report's final additions.
