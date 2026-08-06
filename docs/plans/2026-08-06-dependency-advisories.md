# Dependency Advisories Patch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** Clear all 14 `pnpm audit --prod` findings (issue #163) — 13 by version bumps within/alongside existing semver ranges, 1 (esbuild via drizzle-kit's archived loader chain) by a documented conscious accept — with the full test suite and browser smoke passing on the bumped tree.

**Architecture:** No code changes — only dependency ranges and the lockfile move. Two direct-dep range edits are required (`sharp` `^0.34.5` → `^0.35.0` in both Astro sites, because a 0.x caret pins the minor); everything else resolves inside existing ranges via a targeted lockfile refresh. The one unfixable finding (esbuild 0.18.20 pinned by `drizzle-kit`'s archived `@esbuild-kit` chain) is suppressed via `pnpm.auditConfig.ignoreGhsas` with the rationale recorded in the PR body and a `defer` bead to revisit.

**Tech Stack:** pnpm 10 workspaces, `pnpm audit`, vitest, Playwright (`pnpm e2e`).

## Global Constraints

- Surgical: only the packages named below move; no opportunistic `pnpm update -r` of the whole tree.
- Lockfile conflicts (if rebase needed): regenerate with `pnpm install --lockfile-only`, never hand-merge.
- Branch `security` (this worktree), PR to `master`, squash-merge; conventional PR title `chore(deps): …`.
- Bead IDs in commit messages; no `Co-Authored-By` trailers.
- No changelog entry: dependency patching is internal work — "Internal work appends nothing" (`docs/changelog.md` rules). Flagged for engineer veto at plan review.
- Done-when (from #163): `pnpm audit --prod` clean or every remaining finding consciously accepted with a note, and `pnpm test` passes.

### Advisory → resolution map (all 14 findings)

| Finding (severity) | Locked | Fix | How |
|---|---|---|---|
| `hono` CORS ReDoS (moderate) | 4.12.27 | ≥4.12.34 | refresh within `^4.12.0` (engine, sdk) |
| `@hono/node-server` abort DoS ×1, traversal ×1 (moderate ×2) | 2.0.8 | ≥2.0.10 | refresh within `^2.0.0` (engine) |
| `@hono/node-server` 1.x under MCP SDK (moderate) | 1.19.14 | ≥2.0.5 | bump `@modelcontextprotocol/sdk` to 1.30.0 (within `^1.29.0`) — its range widens to `^1.19.9 \|\| ^2.0.5`, resolver picks 2.0.10 |
| `astro` XSS (moderate) | 7.0.6 | ≥7.1.0 | refresh within `^7.0.6` → 7.2.0 (web/main, web/docs) |
| `sharp` libvips CVEs (high) | 0.34.5 | ≥0.35.0 | **range edit** `^0.34.5` → `^0.35.0` (web/main, web/docs); astro 7.2.0 accepts `^0.34.0 \|\| ^0.35.0`; sharp 0.35 needs Node ≥20.9 — repo runs Node 24 |
| `svgo` removeScripts bypass (high) | 4.0.1 | ≥4.0.2 | transitive refresh (via astro) |
| `fast-uri` host confusion ×2 (high ×2) | 3.1.3 | ≥3.1.5 | transitive refresh (via ajv) |
| `ip-address` SSRF ×3 (high ×1, moderate ×2) | 10.2.0 | ≥10.3.1 | transitive refresh (via express-rate-limit) |
| `postcss` source-map traversal ×2 (high ×1, moderate ×1) | 8.5.16 | ≥8.5.23 | transitive refresh (via vite) |
| `esbuild` dev-server CORS, GHSA-67mh-4wv8-2f99 (moderate) | 0.18.20 | ≥0.25.0 | **conscious accept** — pinned `^0.18` by archived `@esbuild-kit/core-utils` under `drizzle-kit` 0.31.10 (latest); vulnerable code is `esbuild serve`, which drizzle-kit never invokes (it only transforms config files) |

---

### Task 1: Version bumps and targeted lockfile refresh

**Files:**
- Modify: `web/main/package.json` (sharp range)
- Modify: `web/docs/package.json` (sharp range)
- Modify: `pnpm-lock.yaml` (via pnpm commands only — never by hand)

**Interfaces:**
- Consumes: nothing.
- Produces: a tree where `pnpm audit --prod` reports exactly 1 finding (esbuild moderate, GHSA-67mh-4wv8-2f99). Task 2 relies on that being the only remainder.

**Acceptance Criteria:**
- `web/main/package.json` and `web/docs/package.json` declare `"sharp": "^0.35.0"`.
- `pnpm-lock.yaml` resolves: hono ≥4.12.34, `@hono/node-server` ≥2.0.10 (no 1.x entry remaining), astro ≥7.1.0, sharp ≥0.35.0, svgo ≥4.0.2, fast-uri ≥3.1.5, ip-address ≥10.3.1, postcss ≥8.5.23, `@modelcontextprotocol/sdk` ≥1.30.0.
- `pnpm audit --prod` reports exactly 1 vulnerability: moderate, esbuild.
- `pnpm install` exits 0 (lockfile and node_modules consistent).

- [ ] **Step 1: Bump the sharp ranges (the only package.json dependency edits)**

In `web/main/package.json` and `web/docs/package.json`, change:

```json
"sharp": "^0.34.5"
```

to:

```json
"sharp": "^0.35.0"
```

- [ ] **Step 2: Refresh the direct deps within their ranges**

Run from the worktree root:

```bash
pnpm --filter @lodekit/engine --filter @lodekit/sdk update hono
pnpm --filter @lodekit/engine update @hono/node-server
pnpm --filter @lodekit/mcp update @modelcontextprotocol/sdk
pnpm --filter @lodekit/web-main --filter @lodekit/web-docs update astro sharp
```

Expected: lockfile entries move to hono 4.12.x ≥.34, @hono/node-server 2.0.x ≥.10, @modelcontextprotocol/sdk 1.30.0 (which drags its `@hono/node-server` dep from 1.19.14 to 2.0.10), astro 7.2.0, sharp 0.35.x.

- [ ] **Step 3: Refresh the transitive deps within their parents' ranges**

```bash
pnpm -r update --depth Infinity postcss fast-uri ip-address svgo
```

Expected: lockfile entries move to postcss ≥8.5.23, fast-uri ≥3.1.5, ip-address ≥10.3.1, svgo ≥4.0.2.

**Fallback** (only if Step 4's audit shows one of these four did not move): add a targeted override to the root `package.json` `pnpm.overrides` block for the straggler only, e.g. `"fast-uri": ">=3.1.5"`, then `pnpm install`. Do not use `pnpm audit --fix` (it writes blanket overrides for everything).

- [ ] **Step 4: Verify the audit remainder and install consistency**

```bash
pnpm install
pnpm audit --prod
```

Expected: `pnpm install` exits 0. Audit reports **exactly 1 vulnerability — moderate, esbuild** (path `packages__engine>drizzle-kit>@esbuild-kit/esm-loader>@esbuild-kit/core-utils>esbuild`). If anything else remains, apply the Step 3 fallback for that package and re-run.

Sanity-check the resolved versions:

```bash
/usr/bin/grep -E "^  (hono@|astro@|sharp@|svgo@|fast-uri@|ip-address@|postcss@|'@hono/node-server@|'@modelcontextprotocol/sdk@)" pnpm-lock.yaml
```

Expected: no `@hono/node-server@1.` line, no `sharp@0.34.` line, versions at or above the map's Fix column.

- [ ] **Step 5: Commit**

```bash
git add web/main/package.json web/docs/package.json pnpm-lock.yaml
git commit -m "chore(deps): patch reachable dependency advisories (lk-y8eq)"
```

> **Deviation (2026-08-06, approved at execution):** the workspace's supply-chain
> cooldown (`minimumReleaseAge: 10080` in `pnpm-workspace.yaml`) quarantined two of
> the patched releases (hono 4.12.34, pub. Aug 3; fast-uri 3.1.5, pub. Jul 31) and
> steered the MCP SDK's `@hono/node-server` union range onto its vulnerable 1.x
> branch. Resolution, per engineer choice at the gate: `minimumReleaseAgeExclude`
> entries for `hono` and `fast-uri`, each bounded by an exact pin (hono `4.12.34`
> in engine+sdk; `"fast-uri": "3.1.5"` and
> `"@modelcontextprotocol/sdk>@hono/node-server": "2.0.12"` in `pnpm.overrides`) —
> all removable after 2026-08-10 (defer bead). The cooldown comment claiming an
> exact pin alone bypasses the quarantine was empirically wrong (pnpm 10.30 rejects
> the resolution) and was corrected in place. astro resolved to 7.1.6, not 7.2.0
> (peer constraint via Starlight) — still ≥7.1.0, which the advisory requires.
> `@lodekit/integration-tests`' own `@modelcontextprotocol/sdk` dep was bumped to
> `^1.30.0` alongside `@lodekit/mcp`'s so the tree carries a single SDK copy.

---

### Task 2: Conscious accept of the esbuild advisory

**Files:**
- Modify: `package.json` (root — `pnpm.auditConfig`)

**Interfaces:**
- Consumes: Task 1's tree where esbuild is the only remaining finding.
- Produces: `pnpm audit --prod` fully clean; the accepted-risk note text for the PR body.

**Acceptance Criteria:**
- Root `package.json` gains `pnpm.auditConfig.ignoreGhsas` containing exactly `["GHSA-67mh-4wv8-2f99"]`.
- `pnpm audit --prod` reports no known vulnerabilities.
- A `defer` bead exists to revisit the accept when drizzle-kit drops the `@esbuild-kit` chain (orchestrator files it — subagents never touch beads; a subagent executor reports the need back instead).

- [ ] **Step 1: Add the audit ignore**

In the root `package.json`, inside the existing `"pnpm"` block (alongside `"overrides"`), add:

```json
"auditConfig": {
  "ignoreGhsas": ["GHSA-67mh-4wv8-2f99"]
}
```

Rationale (goes in the PR body, since package.json can't hold comments): esbuild 0.18.20 is pinned by the archived `@esbuild-kit/core-utils` under `drizzle-kit` 0.31.10 (the latest release — no upstream fix path). The advisory's vulnerable surface is esbuild's dev server (`esbuild serve`); drizzle-kit only uses esbuild to transform TypeScript config files and never starts that server, so the vulnerable code is unreachable.

- [ ] **Step 2: Verify the audit is clean**

```bash
pnpm audit --prod
```

Expected: `No known vulnerabilities found`.

- [ ] **Step 3: File the revisit bead (orchestrator)**

```bash
bd create "Revisit esbuild GHSA-67mh-4wv8-2f99 accept when drizzle-kit drops @esbuild-kit" -t chore -p 3 --label defer
```

Body must carry the severity/confidence stamp and provenance (this plan + issue #163) per Agent-Filed Bead Discipline.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore(deps): accept esbuild GHSA-67mh-4wv8-2f99 via auditConfig (lk-56mg)"
```

---

### Task 3: Verify the bumped tree and raise the PR

**Files:**
- No source changes — verification and PR only.

**Interfaces:**
- Consumes: Tasks 1–2 committed on branch `security`.
- Produces: green `pnpm test` + `pnpm e2e` evidence; the PR for #163.

**Acceptance Criteria:**
- `pnpm test` passes across all workspace packages.
- `pnpm e2e` passes (dashboard, web-main, web-docs render with zero console errors) — exercises astro 7.2 + sharp 0.35 on both sites and hono 4.12.34 in the engine.
- PR raised against `master`, title `chore(deps): patch reachable dependency advisories (#163)`, body with Summary / Notes (incl. the esbuild accept rationale and the defer bead id) / Test plan. **Not merged — merging is the person's call.**

- [ ] **Step 1: Run the unit/integration suites**

```bash
pnpm test
```

Expected: every package suite passes (`@lodekit/engine`, `@lodekit/sdk`, `@lodekit/ui`, `@lodekit/manager`, `@lodekit/integration-tests`). If `better-sqlite3` throws `NODE_MODULE_VERSION` mismatch, run `pnpm rebuild better-sqlite3` and re-run.

- [ ] **Step 2: Run the browser smoke**

```bash
pnpm e2e
```

Expected: all Playwright checks pass — each frontend renders its key element with zero console errors.

- [ ] **Step 3: Push and raise the PR**

```bash
git push -u origin security
gh pr create --title "chore(deps): patch reachable dependency advisories (#163)" --body "$(cat <<'EOF'
## Summary
- Patches all 14 `pnpm audit --prod` findings from #163: hono 4.12.34 (CORS ReDoS), @hono/node-server 2.0.10 (path traversal, abort DoS — incl. the 1.x copy under the MCP SDK via SDK 1.30.0), astro 7.2.0 (XSS), sharp 0.35.x (libvips CVEs), plus transitives svgo, fast-uri, ip-address, postcss.
- Only package.json edits: sharp `^0.34.5` → `^0.35.0` (0.x caret pins the minor) and the audit ignore below; everything else moved inside existing ranges via lockfile refresh.
- Consciously accepts esbuild GHSA-67mh-4wv8-2f99 (`pnpm.auditConfig.ignoreGhsas`): pinned to 0.18 by the archived `@esbuild-kit` chain under drizzle-kit 0.31.10 (latest — no upstream fix); the vulnerable surface is `esbuild serve`, which drizzle-kit never invokes. Revisit bead: <defer-bead-id>.

## Notes
- No changelog entry: dependency patching is internal work per the changelog buffer rules.
- Deferrals filed: <defer-bead-id> (revisit the esbuild accept when drizzle-kit drops @esbuild-kit).

## Test plan
- [ ] `pnpm audit --prod` — no known vulnerabilities
- [ ] `pnpm test` — all package suites pass
- [ ] `pnpm e2e` — dashboard, web-main, web-docs render clean
EOF
)"
```

Expected: PR URL printed. Stop — the person merges.
