# Frontend browser-testing harness — design

**Date:** 2026-08-03
**Status:** proposed
**Provenance:** research + brainstorming session recorded as bead `lk-8gs`
(2026-08-03); descoped app e2e filed as defer bead `lk-too`.

---

## 1. Goal & non-goals

**Goal:** give every agent session repo-defined browser eyes on all three frontends —
the dashboard, `web/main`, and `web/docs` — with zero manual developer setup:
`git clone && pnpm install` yields a working interactive browser (Playwright MCP) and a
runnable smoke gate (`pnpm e2e`).

Today the agent's feedback loop on frontend work ends at SSR and HTTP assertions — it
ships UI it has never seen render, and the human visual pass in PR test plans does
double duty as smoke test and taste review. Sessions that need a browser improvise a
throwaway `playwright-core` harness each time. This spec makes the capability a
property of the repo instead of the session.

**Non-goals:**

- **PR CI.** A separate future decision. The harness is CI-ready (one
  `playwright install chromium` step in a future workflow), but no workflow is added
  here.
- **Screenshot baselines** (`toHaveScreenshot`). Deferred until the theme stabilizes —
  intentional restyles would fight committed baselines. Adding them later is more
  specs in the same config, not new infrastructure.
- **App-worker e2e** (Greenhouse, Welcome through the engine's app-worker path).
  Different concern, deserves its own thinking against the Greenhouse
  definition-of-done. Filed as `lk-too`.
- **Rendered-page accessibility checks** (axe). Natural later layer on the same
  harness; the token-level AA contrast gate (`theme-contrast.test.ts`) remains the
  accessibility floor for now.

---

## 2. Decisions taken

| Decision | Choice | Rationale |
|---|---|---|
| Test framework | `@playwright/test`, root devDependency, **exact pin** | One dependency brings the runner, `playwright` library, and CLI bin. Exact pin because the Chromium build is keyed to the Playwright version and must stay aligned with the MCP pin (below); both bump together, deliberately. |
| Browser install | Guarded root `postinstall` | `pnpm install` is the only developer step that exists. The shared `~/Library/Caches/ms-playwright` cache makes repeats no-ops and is garbage-collected. `$CI` guard keeps the ~150 MB download out of deploy/release workflows. |
| Full Chromium vs headless shell | Full Chromium | Headed inspection via MCP needs the full build; the download-size saving of `--only-shell` is not worth a second browser variant. |
| Config layout | One root `playwright.config.ts`, root `e2e/` specs | The harness is deliberately one config serving three frontends; no single package owns it. `packages/integration-tests` stays vitest-based engine↔MCP territory. |
| Astro server mode | `astro dev`, not `build && preview` | The smoke's job is render/console errors, which manifest in dev. Production builds are already exercised by the deploy workflows and `starlight-links-validator`. Switching later is a config change. |
| Script wiring | Separate root `pnpm e2e` | `pnpm test` stays fast and browserless. The browser gate runs on demand — before raising a PR, after visual work, and later as its own CI job. |
| Interactive browser | `@playwright/mcp` in repo `.mcp.json`, exact pin, `--headless --isolated` | Project-scoped: every session gets navigate/click/screenshot/console tools after a one-time trust approval. Pinned to a version whose bundled Playwright matches the workspace's, so both share one cached Chromium build. Headless: the agent works through screenshots, no window noise. Isolated: fresh profile per session; local UIs need no logins. |
| Documentation | AGENTS.md, not a project skill | The content is a handful of durable facts (commands, URLs, pin rule) — always-in-context beats invoke-on-demand for discoverability, which was the original failure. A skill earns its place only if this grows into a multi-step procedure. |
| Scope | Dashboard, web-main, web-docs only | App smoke through the worker path is a different concern (`lk-too`). |

---

## 3. Install & dependencies

Root `package.json`:

- `devDependencies`: `@playwright/test` at an exact version (the concrete number is
  resolved at plan time — latest stable — and thereafter bumps only in lockstep with
  the MCP pin, §5).
- `scripts.postinstall`: `[ -n "$CI" ] || playwright install chromium`
- `scripts.e2e`: `playwright test`

Behavior:

- **Dev machine:** `pnpm install` downloads the pinned Chromium into
  `~/Library/Caches/ms-playwright` (shared across worktrees, keyed by browser build,
  auto-GC'd). Re-installs are no-ops. No other manual step exists.
- **CI:** `CI` is always set on GitHub Actions, so deploy/release workflows skip the
  download. A future test-CI job opts in explicitly with
  `pnpm exec playwright install chromium`.
- **pnpm v10:** this is the workspace root's own lifecycle script — it runs normally;
  the `onlyBuiltDependencies` allowlist (which gates *dependencies'* scripts) is
  untouched.

---

## 4. Playwright config & smoke specs

Root `playwright.config.ts` with three projects and three `webServer` entries
(Playwright boots all servers for a run; each project scopes its own `baseURL` and
spec file):

| Project | Server command | URL |
|---|---|---|
| `dashboard` | `pnpm dev` (engine against `root/`, warm `.cache`) | `http://lodekit.localhost:7777` |
| `web-main` | `astro dev` on a fixed port | `http://localhost:4321` |
| `web-docs` | `astro dev` on a fixed port | `http://localhost:4322` |

Config points:

- `reuseExistingServer: !process.env.CI` — locally, a running dev engine or Astro
  server is reused rather than double-booted (also avoids two engines contending over
  `root/`'s SQLite files); CI boots fresh.
- Generous `webServer` timeout (~120 s) on the engine entry: a cold first run builds
  the dashboard through the Start pipeline.
- Chromium resolves `*.localhost` to loopback natively; no `/etc/hosts` work.

**The smoke contract** — each spec asserts exactly:

1. The page responds and renders.
2. **Zero `pageerror` events and zero `console.error` messages**, collected via a
   small shared helper (`e2e/helpers.ts`) with an explicit allowlist for known-benign
   noise — empty to start; every addition is a reviewed line.
3. One key element is visible: dashboard shell nav, landing hero, docs sidebar.

A floor, not coverage. Artifacts (`test-results/`, `playwright-report/`, failure
screenshots) are gitignored.

---

## 5. Interactive browser (MCP)

Repo-root `.mcp.json`, checked in:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@<exact-version>", "--headless", "--isolated"]
    }
  }
}
```

- `npx` fetches and caches the package on first use; Claude Code prompts once to
  trust the project-scoped server, then every session has browser tools.
- **Pin rule:** the `@playwright/mcp` version is chosen so its bundled Playwright
  matches the workspace `@playwright/test` version — one shared Chromium build in the
  cache, one postinstall download covering both. The two pins bump together.
- Codex reaches the same capability through its own MCP config when wired; the
  AGENTS.md lines describe the harness tool-agnostically.

---

## 6. AGENTS.md additions

Facts only, in the existing Build & Test section (~6 lines) plus a sentence in
Conventions:

- `pnpm e2e` — browser smoke across the three frontends; what it asserts.
- The three frontend URLs/ports.
- Browser arrives via the guarded postinstall; skipped when `$CI` is set.
- Playwright MCP is available in-session for interactive inspection and screenshots.
- The `@playwright/test` / `@playwright/mcp` pins bump together.
- A **testing-judgment ladder** (a pattern observed in research on comparable
  agent-driven repos): pick the lowest test layer that exercises the change —
  pure logic → the owning package's vitest; component render behavior →
  `@lodekit/ui` render tests; cross-frontend render/console health → `pnpm e2e`;
  visual judgment → Playwright MCP inspection in-session.

No new skill. No changelog entry — internal dev infrastructure, not user-facing.

---

## 7. Verification

The harness itself is verified by:

1. `pnpm e2e` green on all three projects from a clean checkout after nothing but
   `pnpm install`.
2. A deliberately injected `console.error` in one frontend turns its project red
   (proves the console contract bites), then is removed.
3. An MCP session navigates to each frontend and captures a screenshot (proves the
   interactive path and the shared-Chromium pin).
4. `CI=1 pnpm install` skips the browser download (proves the guard).

---

## 8. Deferrals & follow-ups

| Item | Where |
|---|---|
| Greenhouse/Welcome e2e through the app-worker path | bead `lk-too` (defer) |
| Screenshot baselines once the theme stabilizes | future specs in this config; no bead — revisit at theme freeze |
| PR CI (test job running `pnpm test` + `pnpm e2e`) | separate decision, GitHub-issue territory. When it lands, use the pattern observed in research: cache `~/.cache/ms-playwright` keyed on `pnpm-lock.yaml` + an explicit `playwright install chromium --with-deps` step |
| Rendered-page accessibility (axe) layer | later layer on this harness |
