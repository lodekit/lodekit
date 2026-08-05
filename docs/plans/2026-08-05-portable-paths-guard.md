# Portable-Paths Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** Keep home-directory paths (`/Users/<name>/…`, `/home/<name>/…`) from re-entering tracked files by adding a portability rule to the vendored `writing-plans` skill (issue #127, option (b); the CI gate — option (a) — was deliberately descoped at plan review).

**Architecture:** A new **Portable Paths** section in `.agents/skills/writing-plans/SKILL.md` stops the paths at authoring time: repo-relative paths for tracked files, a `<worktree>` placeholder where a step must pin a directory (the executor substitutes the real path it received at dispatch — `Work from: …`), and `"$HOME/…"` / `process.env.HOME` for machine-local inputs, because `~` does not expand inside quotes or in JS strings. The skill edit is recorded as a divergence in `.agents/SOURCES.md`.

**Tech Stack:** markdown, `git grep` (verification only).

## Global Constraints

- Diagnosis correction (vs the issue text): no "Working agreements" header exists in the vendored skill or any plan's history — the leak is emergent from "Exact file paths always" + worktree context. The fix **adds** a rule; nothing is removed.
- Vendored-skill edits get a divergence entry in `.agents/SOURCES.md` under `### beads-superpowers` (writing-plans is a beads-superpowers skill).
- The new skill text must itself contain no real-username paths (placeholders like `/Users/<name>` only).
- Internal work — **no** `docs/changelog.md` entry.
- No `Co-Authored-By` trailers; PR body ends with `Closes #127`.

---

### Task 1: Portable Paths rule in writing-plans + SOURCES.md divergence

**Files:**
- Modify: `.agents/skills/writing-plans/SKILL.md` (insert new section between `## No Placeholders` and `## Remember`; amend one `## Remember` bullet)
- Modify: `.agents/SOURCES.md` (append one divergence bullet under `### beads-superpowers`)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the committed doc changes Task 2 pushes; no code interfaces.

**Acceptance Criteria:**
- `.agents/skills/writing-plans/SKILL.md` contains a `## Portable Paths` section stating: repo-relative paths for tracked files; `<worktree>` placeholder when a step must pin a directory; `"$HOME/…"` (shell, double quotes) / `process.env.HOME` (Node) for machine-local inputs; literal `/Users/<name>/…` and `/home/<name>/…` forbidden.
- The `## Remember` bullet reads "Exact repo-relative file paths always".
- `.agents/SOURCES.md` has a matching divergence bullet under `### beads-superpowers`.

- [ ] **Step 1: Insert the Portable Paths section**

In `.agents/skills/writing-plans/SKILL.md`, between the `## No Placeholders` section (ends `- References to types, functions, or methods not defined in any task`) and `## Remember`, insert:

```markdown
## Portable Paths

Plans are committed documents — they outlive the machine they were written on and
may be read publicly. No machine-local paths:

- Tracked files: repo-relative paths (`packages/engine/src/config.ts`), never absolute.
- Commands: write them to run from the worktree root. When a step must pin a
  directory (multi-worktree work), use the placeholder `<worktree>` — the executor
  substitutes the real path it received at dispatch ("Work from: …").
- Machine-local inputs outside the repo (asset drops, downloads): `"$HOME/…"` in
  shell (double quotes — `~` does not expand inside quotes) and `process.env.HOME`
  in Node (`~` never expands in JS). Never a literal `/Users/<name>/…` or
  `/home/<name>/…`.
```

- [ ] **Step 2: Amend the Remember bullet**

In the same file's `## Remember` list, change:

```markdown
- Exact file paths always
```

to:

```markdown
- Exact repo-relative file paths always
```

- [ ] **Step 3: Record the divergence**

In `.agents/SOURCES.md`, under `### beads-superpowers`, after the last existing bullet (`- requesting-code-review (+ code-reviewer.md): added the optional ponytail-review over-engineering lens (spec §3).`), append:

```markdown
- writing-plans: added `## Portable Paths` (committed plans carry no machine-local
  paths — repo-relative files, `<worktree>` placeholder, `$HOME`/`process.env.HOME`
  for machine-local inputs); the Remember bullet says repo-relative (issue #127).
```

- [ ] **Step 4: Verify the edits are self-compliant**

Run (from the worktree root):

```bash
git grep -InE '(/Users|/home)/[A-Za-z0-9._-]+' -- .agents/SOURCES.md .agents/skills/writing-plans/SKILL.md
```

Expected: no output, exit 1 (the new text uses only `<name>` placeholders, which the pattern's character class does not match).

- [ ] **Step 5: Commit**

```bash
git add .agents/skills/writing-plans/SKILL.md .agents/SOURCES.md
git commit -m "docs(skills): writing-plans Portable Paths rule (#127, lk-j3x0)"
```

### Task 2: Push and raise the PR

**Files:** none (git/gh only).

**Interfaces:**
- Consumes: Task 1 committed on `devex`.
- Produces: an open PR whose merge closes issue #127.

**Acceptance Criteria:**
- PR open against `master` with conventional title, Summary/Notes/Test plan body, ending `Closes #127`.

- [ ] **Step 1: Push**

```bash
git -c url."https://github.com/".insteadOf=git@github.com: push -u origin devex
```

(HTTPS override per this machine's stored lesson — the SSH agent refuses; `gh` credentials work.)

- [ ] **Step 2: Raise the PR**

```bash
gh pr create --title "docs(skills): writing-plans Portable Paths rule" --body "$(cat <<'EOF'
## Summary
- `writing-plans` skill: new **Portable Paths** section — repo-relative paths for tracked files, `<worktree>` placeholder for pinned directories (real path arrives at dispatch), `$HOME`/`process.env.HOME` for machine-local inputs (`~` doesn't expand in quotes or JS). The `Remember` bullet now says repo-relative.
- Divergence recorded in `.agents/SOURCES.md` under `### beads-superpowers`.

## Notes
- Diagnosis correction vs the issue text: no "Working agreements" header exists in the vendored skill or plan history — the leak was emergent from "Exact file paths always" + worktree context, so the fix adds a rule rather than removing a convention.
- The tree was already clean (the 2026-07-28 readiness sweep); this PR is guard-only, no sweep.
- The issue's option (a) — a CI grep gate — was deliberately descoped at plan review; this ships option (b) only.

## Test plan
- [ ] Skill/SOURCES edits pass the gate grep (`git grep -InE '(/Users|/home)/[A-Za-z0-9._-]+'` on both files: no hits)
- [ ] Whole tree still free of real-username paths outside `.agents/skills/`

Closes #127
EOF
)"
```

- [ ] **Step 3: Stop**

Merging is the person's call — report the PR URL and stop.
