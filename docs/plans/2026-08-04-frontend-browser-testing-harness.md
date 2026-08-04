# Frontend Browser-Testing Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** Repo-defined browser eyes on all three frontends — `pnpm install` yields a working Playwright MCP browser and a runnable `pnpm e2e` smoke gate, with zero manual developer steps.

**Architecture:** One root `playwright.config.ts` with three projects (dashboard, web-main, web-docs), each backed by a `webServer` entry that boots (or reuses) the matching dev server. Smoke specs in root `e2e/` assert the page renders, the console is clean, and one key element is visible. A guarded root `postinstall` installs Chromium; `.mcp.json` gains a pinned `@playwright/mcp` server for interactive agent inspection. AGENTS.md documents it all.

**Tech Stack:** `@playwright/test@1.62.1` (exact pin), `@playwright/mcp@0.0.78` (exact pin, same 1.62 Playwright line), pnpm workspace scripts.

**Spec:** `docs/specs/2026-08-03-frontend-browser-testing-harness-design.md`

## Global Constraints

- `@playwright/test` pinned **exactly** to `1.62.1` (no `^`). `@playwright/mcp` pinned **exactly** to `0.0.78`. The two pins bump together (spec §2, §5).
- Postinstall guard verbatim: `[ -n "$CI" ] || playwright install chromium` (spec §3).
- The smoke contract per spec §4: page responds; **zero `pageerror` events and zero `console.error` messages** (helper with explicit allowlist, empty to start); one key element visible.
- `reuseExistingServer: !process.env.CI` on every webServer entry (spec §4).
- No changelog entry — internal dev infrastructure (spec §6). No `Co-Authored-By` trailers; no "Generated with Claude Code" in the PR body (AGENTS.md).
- Surgical changes only — nothing outside the files this plan names.
- The repo root package.json is the pnpm workspace root; its own lifecycle scripts run normally under pnpm v10 (no `onlyBuiltDependencies` change).
- All commits on the current branch (`devex`); finish = push + PR; **never merge** — merging is the person's call.

---

### Task 1: Dependencies, postinstall, scripts, gitignore

**Files:**
- Modify: `package.json` (repo root)
- Modify: `.gitignore` (repo root)

**Interfaces:**
- Produces: `pnpm exec playwright` CLI available workspace-wide; Chromium in `~/Library/Caches/ms-playwright`; root scripts `e2e` and `postinstall`. Task 2+ rely on `playwright test` resolving `@playwright/test@1.62.1`.

**Acceptance Criteria:**
- `pnpm install` on a dev machine installs `@playwright/test@1.62.1` and downloads Chromium via postinstall; a repeat run is a no-op.
- `CI=1 pnpm install` skips the browser download (spec §7.4).
- `pnpm e2e --version` reports Playwright 1.62.1.
- `test-results/` and `playwright-report/` are gitignored.

- [ ] **Step 1: Add the devDependency and scripts to the root `package.json`**

In `package.json` (repo root), add to `"scripts"` (after `"test"`):

```json
    "e2e": "playwright test",
    "postinstall": "[ -n \"$CI\" ] || playwright install chromium",
```

and add a `devDependencies` block (the root currently has none) after `"scripts"`:

```json
  "devDependencies": {
    "@playwright/test": "1.62.1"
  },
```

Exact version — no `^`.

- [ ] **Step 2: Install and watch the browser arrive**

Run: `pnpm install`
Expected: lockfile updates with `@playwright/test@1.62.1`; postinstall output shows Chromium downloading into `~/Library/Caches/ms-playwright` (or an instant no-op if a matching build is already cached).

- [ ] **Step 3: Verify the CLI and the CI guard**

Run: `pnpm exec playwright --version`
Expected: `Version 1.62.1`

Run: `CI=1 pnpm install`
Expected: completes with **no** `playwright install` browser-download output (the guard short-circuits).

- [ ] **Step 4: Gitignore the artifacts**

Append to `.gitignore`:

```
test-results/
playwright-report/
```

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml .gitignore
git commit -m "feat(e2e): @playwright/test devDependency + guarded chromium postinstall (lk-8gs)"
```

---

### Task 2: Playwright config, console helper, dashboard smoke spec

**Files:**
- Create: `playwright.config.ts` (repo root)
- Create: `e2e/helpers.ts`
- Create: `e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `playwright test` CLI from Task 1.
- Produces: `watchConsole(page: Page): () => void` in `e2e/helpers.ts` — attaches `pageerror`/`console` listeners, returns an assert-clean function. Tasks 3 specs import it. Config projects named exactly `dashboard`, `web-main`, `web-docs`.

**Acceptance Criteria:**
- `pnpm e2e --project=dashboard` passes: boots the engine (or reuses a running one), dashboard renders at `/_dashboard/`, console clean, "Lodekit home" link visible.
- Config has all three projects and all three webServer entries with `reuseExistingServer: !process.env.CI`.

- [ ] **Step 1: Write the console helper**

Create `e2e/helpers.ts`:

```ts
import { expect, type Page } from "@playwright/test";

// Known-benign console noise. Empty on purpose — every addition is a reviewed line.
const ALLOWED: RegExp[] = [];

/**
 * Attach console/pageerror listeners. Call the returned function at the end of
 * the test to assert the page stayed clean (spec: zero pageerror, zero console.error).
 */
export function watchConsole(page: Page): () => void {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !ALLOWED.some((re) => re.test(msg.text()))) {
      errors.push(`console.error: ${msg.text()}`);
    }
  });
  return () => expect(errors, "page console must stay clean").toEqual([]);
}
```

- [ ] **Step 2: Write the dashboard smoke spec**

Create `e2e/dashboard.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { watchConsole } from "./helpers";

test("dashboard renders clean", async ({ page }) => {
  const assertClean = watchConsole(page);
  // The engine serves a static "building" page until the dashboard build
  // finishes, and that page does not self-refresh — poll with fresh gotos.
  await expect(async () => {
    await page.goto("/_dashboard/");
    await expect(page.getByRole("link", { name: "Lodekit home" })).toBeVisible({
      timeout: 5_000,
    });
  }).toPass({ timeout: 120_000 });
  assertClean();
});
```

(`Lodekit home` is the `aria-label` of the header's home link — `packages/engine/dashboard/src/components/header.tsx:22`.)

- [ ] **Step 3: Write the config**

Create `playwright.config.ts` (repo root):

```ts
import { defineConfig } from "@playwright/test";

const reuse = !process.env.CI;

export default defineConfig({
  testDir: "e2e",
  timeout: 150_000, // dashboard's first hit may wait out a cold dashboard build
  reporter: "list",
  use: { screenshot: "only-on-failure" },
  projects: [
    {
      name: "dashboard",
      testMatch: /dashboard\.spec\.ts/,
      use: { baseURL: "http://lodekit.localhost:7777" },
    },
    {
      name: "web-main",
      testMatch: /web-main\.spec\.ts/,
      use: { baseURL: "http://localhost:4321" },
    },
    {
      name: "web-docs",
      testMatch: /web-docs\.spec\.ts/,
      use: { baseURL: "http://localhost:4322" },
    },
  ],
  webServer: [
    {
      // Engine against the checked-in root, same as `pnpm dev`.
      command: "pnpm dev",
      // Health-check via 127.0.0.1 (deterministic in Node); the browser
      // itself uses lodekit.localhost, which Chromium resolves natively.
      // The /_dashboard/ building page answers 200 immediately; the spec
      // polls until the real shell renders.
      url: "http://127.0.0.1:7777/_dashboard/",
      reuseExistingServer: reuse,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @lodekit/web-main dev -- --port 4321",
      url: "http://localhost:4321",
      reuseExistingServer: reuse,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @lodekit/web-docs dev -- --port 4322",
      url: "http://localhost:4322",
      reuseExistingServer: reuse,
      timeout: 60_000,
    },
  ],
});
```

- [ ] **Step 4: Run the dashboard project and verify it passes**

Run: `pnpm e2e --project=dashboard`
Expected: `1 passed`. (All three servers boot — the Astro ones are idle for this run; that's the documented all-servers behavior of Playwright's webServer array.)

If the webServer health check times out even though the engine logs show it listening: the fallback is switching the first entry's `url` to `http://localhost:7777/_dashboard/` — the `/_dashboard/*` routes are host-agnostic (`packages/engine/src/server.ts:188`).

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e/helpers.ts e2e/dashboard.spec.ts
git commit -m "feat(e2e): playwright harness — config, console helper, dashboard smoke (lk-8gs)"
```

---

### Task 3: web-main + web-docs smoke specs, console-contract proof

**Files:**
- Create: `e2e/web-main.spec.ts`
- Create: `e2e/web-docs.spec.ts`
- Temporarily modify (then revert): `web/main/src/layouts/Base.astro`

**Interfaces:**
- Consumes: `watchConsole` from `e2e/helpers.ts`; projects `web-main`/`web-docs` from the Task 2 config.
- Produces: the complete three-project smoke suite Task 6 runs.

**Acceptance Criteria:**
- `pnpm e2e` passes all three projects.
- A deliberately injected `console.error` in web-main turns its project red, and removing it turns it green again (spec §7.2) — evidence captured in the task output.

- [ ] **Step 1: Write the web-main smoke spec**

Create `e2e/web-main.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { watchConsole } from "./helpers";

test("landing page renders clean", async ({ page }) => {
  const assertClean = watchConsole(page);
  await page.goto("/");
  // The hero headline (web/main/src/components/Hero.astro).
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  assertClean();
});
```

- [ ] **Step 2: Write the web-docs smoke spec**

Create `e2e/web-docs.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { watchConsole } from "./helpers";

test("docs splash renders clean", async ({ page }) => {
  const assertClean = watchConsole(page);
  await page.goto("/");
  // Starlight splash hero title "Lodekit" (web/docs/src/content/docs/index.mdx).
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "What is Lodekit?" }).first(),
  ).toBeVisible();
  assertClean();
});
```

(The spec document's §4 names "docs sidebar" as the example element; the docs root is a Starlight `splash` page without a sidebar, so the key elements are the hero heading and its primary action link. Same contract, accurate element.)

- [ ] **Step 3: Run both new projects and verify they pass**

Run: `pnpm e2e --project=web-main --project=web-docs`
Expected: `2 passed`

- [ ] **Step 4: Prove the console contract bites (spec §7.2)**

In `web/main/src/layouts/Base.astro`, add inside `<head>` (temporary, do not commit):

```html
<script>console.error("harness-proof");</script>
```

Run: `pnpm e2e --project=web-main`
Expected: **FAIL** with `page console must stay clean` listing `console.error: harness-proof`.

- [ ] **Step 5: Revert the injection and verify green**

Remove the injected `<script>` line from `Base.astro` (`git checkout -- web/main/src/layouts/Base.astro` if it was the only change there).

Run: `pnpm e2e --project=web-main`
Expected: `1 passed`

- [ ] **Step 6: Full suite**

Run: `pnpm e2e`
Expected: `3 passed`

- [ ] **Step 7: Commit**

```bash
git add e2e/web-main.spec.ts e2e/web-docs.spec.ts
git commit -m "feat(e2e): web-main + web-docs smoke specs (lk-8gs)"
```

---

### Task 4: Playwright MCP server in `.mcp.json`

**Files:**
- Modify: `.mcp.json` (repo root — already exists with `codebase-memory-mcp`; add alongside, do not replace)

**Interfaces:**
- Consumes: the Chromium install from Task 1 (shared 1.62-line browser build).
- Produces: a project-scoped `playwright` MCP server every future session discovers.

**Acceptance Criteria:**
- `.mcp.json` contains both `codebase-memory-mcp` (untouched) and the pinned `playwright` server.
- `npx -y @playwright/mcp@0.0.78 --help` exits 0 (package fetchable at the pin).

- [ ] **Step 1: Add the server entry**

Edit `.mcp.json` to:

```json
{
  "mcpServers": {
    "codebase-memory-mcp": {
      "command": "codebase-memory-mcp",
      "args": []
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@0.0.78", "--headless", "--isolated"]
    }
  }
}
```

Exact pin `0.0.78` — its bundled Playwright is the 1.62 line, matching `@playwright/test@1.62.1` (spec §5 pin rule).

- [ ] **Step 2: Verify the pinned package launches**

Run: `npx -y @playwright/mcp@0.0.78 --help`
Expected: exit 0, usage text listing `--headless` and `--isolated` among the options.

(In-session tool verification — navigate + screenshot against a frontend — needs a session restart to pick up `.mcp.json`; it goes in the PR test plan as the person's checkbox. If the MCP session ever reports a missing browser build, its bundled Playwright wants its own Chromium: `npx -y @playwright/mcp@0.0.78 --help` will not show it, the error message will — follow it once; the shared cache keeps both builds.)

- [ ] **Step 3: Commit**

```bash
git add .mcp.json
git commit -m "feat(e2e): pinned @playwright/mcp server in .mcp.json (lk-8gs)"
```

---

### Task 5: AGENTS.md documentation

**Files:**
- Modify: `AGENTS.md` (repo root; `CLAUDE.md` is a committed symlink to it — edit `AGENTS.md` only)

**Interfaces:**
- Consumes: everything Tasks 1–4 shipped (documents reality, so runs after them).
- Produces: the durable facts future sessions read instead of improvising.

**Acceptance Criteria:**
- Build & Test section documents `pnpm e2e`, the three URLs, the postinstall/CI-guard behavior, the MCP browser, and the pin-lockstep rule.
- Conventions section contains the testing-judgment ladder (spec §6).
- `CLAUDE.md` still resolves to `AGENTS.md` (symlink untouched).

- [ ] **Step 1: Add the e2e bullets to Build & Test**

In `AGENTS.md`, in the **Build & Test** section, after the `pnpm --filter @lodekit/web-docs dev | build` bullet, insert:

```markdown
- `pnpm e2e` — Playwright browser smoke across the three frontends: each page
  renders with zero console errors and its key element visible. Boots the needed
  dev servers itself (reuses ones already running). Dashboard:
  `http://lodekit.localhost:7777/_dashboard/`; web-main: `http://localhost:4321`;
  web-docs: `http://localhost:4322`. The Chromium build arrives via the root
  `postinstall` (skipped when `$CI` is set — a CI job that needs it runs
  `pnpm exec playwright install chromium` explicitly). The Playwright MCP server
  in `.mcp.json` gives sessions an interactive headless browser for visual
  inspection and screenshots. The `@playwright/test` and `@playwright/mcp` pins
  bump together (same Playwright line).
```

- [ ] **Step 2: Add the testing-judgment ladder to Conventions**

In the **Conventions** section, after the **Definition of done** bullet, insert:

```markdown
- **Testing-judgment ladder:** pick the lowest test layer that exercises the
  change — pure logic → the owning package's vitest; component render behavior →
  `@lodekit/ui` render tests; cross-frontend render/console health → `pnpm e2e`;
  visual judgment → Playwright MCP inspection in-session.
```

- [ ] **Step 3: Verify the symlink still holds**

Run: `readlink CLAUDE.md`
Expected: `AGENTS.md`

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): pnpm e2e, MCP browser, testing-judgment ladder (lk-8gs)"
```

---

### Task 6: Full verification and PR

**Files:**
- None created; verification + PR only.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: the pushed branch and open PR (the person merges).

**Acceptance Criteria:**
- `pnpm test` (full workspace vitest) still green — no regression from the new root scripts.
- `pnpm e2e` green, all three projects.
- `CI=1 pnpm install` still skips the browser download.
- PR open with Summary / Notes / Test plan, deferral `lk-too` listed; **not merged**.

- [ ] **Step 1: Workspace test suites**

Run: `pnpm test`
Expected: all package suites pass (engine, sdk, ui, manager, integration-tests) — same as before this branch.

- [ ] **Step 2: Full smoke gate**

Run: `pnpm e2e`
Expected: `3 passed`

- [ ] **Step 3: CI guard re-check**

Run: `CI=1 pnpm install`
Expected: no browser-download output.

- [ ] **Step 4: Push and raise the PR**

```bash
git push -u origin devex
gh pr create --title "feat(e2e): frontend browser-testing harness — playwright smoke + MCP browser" --body "$(cat <<'EOF'
## Summary
- Repo-defined browser eyes for all three frontends (dashboard, web-main, web-docs): `@playwright/test@1.62.1` root devDependency, guarded `postinstall` Chromium install (skipped under `$CI`), root `playwright.config.ts` with three projects + webServer entries, smoke specs asserting render + zero console errors + key element.
- Pinned `@playwright/mcp@0.0.78` project MCP server (`--headless --isolated`) for interactive in-session inspection/screenshots.
- AGENTS.md: `pnpm e2e` facts + testing-judgment ladder.
- Spec: `docs/specs/2026-08-03-frontend-browser-testing-harness-design.md`; plan: `docs/plans/2026-08-04-frontend-browser-testing-harness.md`. Beads: lk-8gs.

## Notes
- `pnpm test` stays browserless; the browser gate is the separate `pnpm e2e` (spec decision).
- Astro projects smoke `astro dev`, not the production build — deploy workflows + links validator already cover builds.
- No changelog entry: internal dev infrastructure.
- Deferrals: `lk-too` — Greenhouse/Welcome e2e through the app-worker path.

## Test plan
- [x] `pnpm e2e` — 3/3 projects green
- [x] Injected `console.error` turned web-main red; reverted, green (console contract proof)
- [x] `CI=1 pnpm install` skips the Chromium download
- [x] `pnpm test` — full workspace suites green
- [ ] Person: restart a session, confirm the `playwright` MCP tools appear and can screenshot a frontend
EOF
)"
```

Expected: PR URL printed. **Stop here — merging is the person's call.**
