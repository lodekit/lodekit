# Docs Content v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill `web/docs` (Starlight) with Lodekit's first real documentation — 38 pages from non-engineer overview to full SDK reference, 6 inline-SVG diagrams, cork-amber theming.

**Architecture:** All pages are `.mdx` under `web/docs/src/content/docs/` in six sidebar groups (explicit sidebar in `astro.config.mjs`). Task 1 lands the full skeleton (stubs + sidebar + theme + splash) so the build is green from the start; every later task fills real content into existing files. Diagrams are hand-authored SVG Astro components bound to Starlight theme variables.

**Tech Stack:** Astro 7 + Starlight 0.41 (already installed), Pagefind (built-in). No new runtime deps; one optional dev dep (`starlight-links-validator`).

**Spec:** `docs/specs/2026-07-12-docs-content-v1-design.md`

## Global Constraints

- Branch: all work commits to the `docs` branch. **Never fold to `master`** — the person reviews first.
- Build command (from repo root): `pnpm --filter @lodekit/web-docs build`. Must be green at the end of every task.
- `pnpm install` only ever from the repo root (never with CWD inside `manager/`).
- Terminology is `context.md`'s, verbatim: *app* (never tool/project), *scaffold*, *Lodekit root*, *apps tree*, *data tree*, *backup tree*, *Cache*, *State*, *service* names `kv-store`/`db-store`/`file-store`/`log-store`/`event-store`/`secret-store`/`tasks`/`settings`, *agent*, *manager*, *runtime*, *dashboard*, *app id*, *app worker*, *server function*, *shared toolchain*, *stack*, *SDK*, *UI library*. "Engine" appears only when naming that dashboard Settings section.
- **Honesty policy:** document only what ships on `master`. Dashboard Data/Tasks/Themes views are stubs → say "coming soon" for exactly those three. Zero mention of gateways/integrations. Install copy is honest about the assisted alpha (ad-hoc signed, right-click → Open, Apple silicon only, artifact handed to you — no public download yet). MCP is read-only (plus scaffold/open) — never promise writes.
- No `Co-Authored-By` trailers in commits.

## Shared inputs (read before writing any page)

Every content task's implementer must read these first:

1. **This plan's Style guide and Slug map** (below).
2. **Facts packs** (ground truth extracted from code on 2026-07-12 — trust these over memory):
   - `<scratchpad>/facts/sdk-surface.md` — every SDK handle, method signature, declaration API, limits.
   - `<scratchpad>/facts/platform.md` — services behavior + numbers, dashboard views, manager, install/agent-connection snippets, MCP tools.
   - `<scratchpad>/facts/showcase-brand.md` — real Greenhouse code samples, Welcome app, brand tokens, skill headings.
3. `context.md` at the repo root (vocabulary; the Relationships section is the mental model).
4. When in doubt about a signature, the source: `packages/sdk/src/*.ts`, `packages/runtime/src/platformSettings.ts`.

## Style guide (binding for every page)

- **Voice:** second person ("you"), present tense, plain warm language — Obsidian Help register for Start here / Using Lodekit; tighter and denser for Services; precise and terse for SDK/Reference. No marketing superlatives. The AI is always "your agent".
- **Frontmatter:** every page has `title` (sentence case, no trailing period) and `description` (one sentence). Nothing else unless a task says so.
- **Headings:** `##` and `###` only. Sentence case.
- **Code blocks:** ` ```ts ` with `title="src/…"` when the snippet belongs to a file (e.g. ` ```ts title="src/db.ts" `). Shell blocks ` ```sh `. Snippets must compile against the facts-pack signatures.
- **Real code first:** prefer Greenhouse samples (facts pack 3) verbatim or lightly trimmed; invented samples only where Greenhouse lacks coverage (`defineSettings`, `defineSecrets`, `events.emit`) and must match SDK signatures exactly.
- **Starlight components:** import from `@astrojs/starlight/components` in MDX when used (`Card`, `CardGrid`, `LinkCard`, `Steps`, `Tabs`, `TabItem`, `FileTree`, `Badge`). Use asides via `:::note` / `:::tip` / `:::caution`. Don't overuse — most pages are prose + code.
- **Links:** root-relative with trailing slash: `/services/kv/`, `/sdk/db/`. Every Services page ends with a short "API" section linking its SDK page; every SDK page's intro links back to its concept page.
- **Length:** Start/Guide/Build pages ≈ 60–120 lines of MDX; Services pages ≈ 80–150; SDK pages as long as the surface demands.
- **Numbers:** any limit/default/retention stated must match the facts packs exactly (they came from code). If a page states a number, it must also appear on `/reference/limits-and-retention/` identically.
- **Diagrams:** imported Astro components (Task 2); never screenshots.

## Slug map (the interface between tasks — exact file names)

All under `web/docs/src/content/docs/`, all `.mdx`:

| File | Sidebar label |
|---|---|
| `index.mdx` | (splash, not in sidebar) |
| `start/what-is-lodekit.mdx` | What is Lodekit? |
| `start/how-lodekit-works.mdx` | How Lodekit works |
| `start/install.mdx` | Install Lodekit |
| `start/connect-your-agent.mdx` | Connect your agent |
| `start/your-first-app.mdx` | Your first app |
| `guide/dashboard.mdx` | The dashboard |
| `guide/your-lodekit-folder.mdx` | Your Lodekit folder |
| `guide/manager.mdx` | The menubar manager |
| `guide/theming.mdx` | Theming |
| `services/overview.mdx` | Overview |
| `services/database.mdx` | Database |
| `services/kv.mdx` | KV |
| `services/files.mdx` | Files |
| `services/events.mdx` | Events |
| `services/tasks.mdx` | Tasks |
| `services/logs.mdx` | Logs |
| `services/settings.mdx` | Settings |
| `services/secrets.mdx` | Secrets |
| `build/the-stack.mdx` | The stack |
| `build/app-anatomy.mdx` | App anatomy |
| `build/data-and-server-functions.mdx` | Data and server functions |
| `build/live-updates.mdx` | Live updates |
| `build/using-the-ui-library.mdx` | Using the UI library |
| `sdk/overview.mdx` | Overview |
| `sdk/kv.mdx` | kv |
| `sdk/db.mdx` | db |
| `sdk/files.mdx` | files |
| `sdk/events.mdx` | events |
| `sdk/tasks.mdx` | tasks |
| `sdk/settings.mdx` | settings |
| `sdk/secrets.mdx` | secrets |
| `sdk/logs.mdx` | logs |
| `reference/mcp-tools.mdx` | MCP tools |
| `reference/limits-and-retention.mdx` | Limits and retention |
| `reference/file-locations.mdx` | File locations |
| `reference/manifest.mdx` | The manifest |
| `reference/glossary.mdx` | Glossary |

Diagram components (Task 2), under `web/docs/src/components/`:
`BigPicture.astro`, `BuildLifecycle.astro`, `StorageTiers.astro`, `StorageDecision.astro`, `EventFlow.astro`, `TaskLifecycle.astro`.

---

### Task 1: Skeleton — stubs, sidebar, theme, splash

**Files:**
- Modify: `web/docs/astro.config.mjs`
- Create: `web/docs/src/styles/custom.css`
- Create: all 37 non-splash `.mdx` files from the Slug map (stub bodies)
- Modify: `web/docs/src/content/docs/index.mdx` (real splash)
- Delete: `web/docs/src/content/docs/getting-started.md`

**Interfaces:**
- Produces: the file skeleton + sidebar every later task fills; the theme CSS; the splash. Later tasks only edit page bodies (below the frontmatter) — never the config.

- [ ] **Step 1: Create every stub page**

For each of the 37 files in the Slug map, create it with its final frontmatter and a one-line placeholder body. Example (repeat for all, with the right title/description):

```mdx
---
title: What is Lodekit?
description: A local platform for building and running your own personal web apps with an AI agent.
---

Content coming in this docs slice.
```

Titles come from the Sidebar-label column (but keep the `?` only on What is Lodekit). Write a sensible one-line `description` per page now (it seeds search + SEO; later tasks may refine).

- [ ] **Step 2: Replace the splash page**

```mdx
---
title: Lodekit
description: Build small local apps on a unified stack — no build tooling to manage.
template: splash
hero:
  tagline: Build small local apps on a unified stack — no build tooling to manage. Lodekit is the local platform where you and your AI agent create personal web apps that run on your own machine.
  actions:
    - text: What is Lodekit?
      link: /start/what-is-lodekit/
      variant: primary
    - text: SDK reference
      link: /sdk/overview/
      variant: minimal
---

import { Card, CardGrid } from '@astrojs/starlight/components';

<CardGrid stagger>
  <Card title="Start here" icon="rocket">
    Install Lodekit, connect your agent, and build your first app —
    no programming required. [Get started](/start/what-is-lodekit/)
  </Card>
  <Card title="Services" icon="open-book">
    Storage, background tasks, events, secrets — learn what each
    service is for and when to reach for it. [Meet the services](/services/overview/)
  </Card>
  <Card title="Building apps" icon="seti:react">
    The stack, the app contract, and the SDK your agent codes
    against. [Start building](/build/the-stack/)
  </Card>
</CardGrid>
```

- [ ] **Step 3: Delete the old placeholder**

```sh
rm web/docs/src/content/docs/getting-started.md
```

- [ ] **Step 4: Write the theme CSS**

Create `web/docs/src/styles/custom.css` (values from `design.md` via the showcase-brand facts pack):

```css
/* Lodekit docs theme — cork amber + brand type (design.md) */
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,400..600,100&family=Hanken+Grotesk:wght@400;500;600&display=swap');

:root {
  /* dark scheme (Starlight default root) */
  --sl-color-accent-low: #45260e;
  --sl-color-accent: #ce6f26;
  --sl-color-accent-high: #f6ad64;
  --sl-font: 'Hanken Grotesk', system-ui, sans-serif;
}

:root[data-theme='light'] {
  --sl-color-accent-low: #f7e3cf;
  --sl-color-accent: #ce6f26;
  --sl-color-accent-high: #9c4d10;
}

.site-title,
.sl-markdown-content h1,
.sl-markdown-content h2,
.sl-markdown-content h3,
.sl-markdown-content h4,
h1[data-page-title],
.hero h1 {
  font-family: 'Fraunces', Georgia, serif;
  font-variation-settings: 'SOFT' 75;
  font-weight: 550;
}
```

- [ ] **Step 5: Configure sidebar + custom CSS**

Replace `web/docs/astro.config.mjs`:

```js
// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "Lodekit",
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "Start here",
          items: [
            "start/what-is-lodekit",
            "start/how-lodekit-works",
            "start/install",
            "start/connect-your-agent",
            "start/your-first-app",
          ],
        },
        {
          label: "Using Lodekit",
          items: [
            "guide/dashboard",
            "guide/your-lodekit-folder",
            "guide/manager",
            "guide/theming",
          ],
        },
        {
          label: "Services",
          items: [
            "services/overview",
            "services/database",
            "services/kv",
            "services/files",
            "services/events",
            "services/tasks",
            "services/logs",
            "services/settings",
            "services/secrets",
          ],
        },
        {
          label: "Building apps",
          items: [
            "build/the-stack",
            "build/app-anatomy",
            "build/data-and-server-functions",
            "build/live-updates",
            "build/using-the-ui-library",
          ],
        },
        {
          label: "SDK reference",
          items: [
            "sdk/overview",
            "sdk/kv",
            "sdk/db",
            "sdk/files",
            "sdk/events",
            "sdk/tasks",
            "sdk/settings",
            "sdk/secrets",
            "sdk/logs",
          ],
        },
        {
          label: "Reference",
          items: [
            "reference/mcp-tools",
            "reference/limits-and-retention",
            "reference/file-locations",
            "reference/manifest",
            "reference/glossary",
          ],
        },
      ],
    }),
  ],
});
```

- [ ] **Step 6: (Optional, keep only if it installs cleanly) links validator**

```sh
pnpm --filter @lodekit/web-docs add -D starlight-links-validator
```

If it installs without peer-dependency conflict, add to the config: `import starlightLinksValidator from 'starlight-links-validator'` and `plugins: [starlightLinksValidator()]` inside the `starlight({...})` options. Then rebuild; if the build errors on the plugin itself (not on links), remove the plugin and the dep — do not fight version drift.

- [ ] **Step 7: Build**

```sh
pnpm --filter @lodekit/web-docs build
```
Expected: success; 38 pages emitted under `web/docs/dist/`.

- [ ] **Step 8: Commit**

```sh
git add web/docs docs/plans/2026-07-12-docs-content-v1.md pnpm-lock.yaml
git commit -m "docs(web-docs): skeleton — 38-page IA, sidebar, cork-amber theme, splash"
```

---

### Task 2: Diagram components

**Files:**
- Create: `web/docs/src/components/BigPicture.astro`, `BuildLifecycle.astro`, `StorageTiers.astro`, `StorageDecision.astro`, `EventFlow.astro`, `TaskLifecycle.astro`
- Modify (import + place only): `start/how-lodekit-works.mdx` (BigPicture, BuildLifecycle), `guide/your-lodekit-folder.mdx` (StorageTiers), `services/overview.mdx` (StorageDecision), `services/events.mdx` (EventFlow), `services/tasks.mdx` (TaskLifecycle)

**Interfaces:**
- Produces: six self-contained Astro components, each rendering one inline `<svg>` with **no props**. Content writers keep the existing import + `<ComponentName />` placement and write prose around it.

- [ ] **Step 1: Build the components**

Shared conventions (apply to all six):
- One `<figure>` wrapping an inline `<svg viewBox="0 0 720 H" role="img" aria-labelledby="…">` (H per diagram, ~300–420) plus a `<figcaption>`.
- Colors only via Starlight variables so both themes work: boxes `fill: var(--sl-color-gray-6); stroke: var(--sl-color-gray-4)`, text `fill: var(--sl-color-white)`, muted text `fill: var(--sl-color-gray-2)`, emphasis/arrows `stroke: var(--sl-color-accent); fill: var(--sl-color-accent)` sparingly (one accent per diagram, per brand rule).
- Text as real `<text>` elements, `font-family: var(--sl-font); font-size: 13px` (11px for labels); rounded rects (`rx="8"`); arrowheads via one `<marker>` def per component.
- `svg { max-width: 100%; height: auto; }` in a scoped `<style>`.

Diagram content (boxes → arrows):

1. **BigPicture** — three lanes. Left: "You" (person) and "Your agent" (Claude, Codex, …). Middle: "Manager (menubar)" supervising "Runtime — one local Node process" which contains chips "Your apps", "Services (storage, tasks, events…)", "Dashboard". Right edge: browser at `lodekit.localhost:7777`. Arrows: You → Dashboard ("use apps, tune settings"); Agent → Runtime via "MCP" ("scaffold, inspect"); Agent → "apps/ folder" ("writes code"); Manager → Runtime ("starts & watches"). Caption: "One local process runs everything; you use the browser, your agent uses MCP and the file system."
2. **BuildLifecycle** — pipeline: "You save a file in apps/&lt;app&gt;/" → "Watcher notices" → "Build (shared toolchain)" → fork: "ready → app served at /&lt;app-id&gt;/" and "error → shown on the dashboard". Note under: "state changes stream live to the dashboard (SSE)". Caption: "Save a file; Lodekit rebuilds and serves. No terminal, no build commands."
3. **StorageTiers** — three columns with cost-of-loss subtitles: "Backup tree — precious (`~/Documents/Lodekit`: apps/ + data/)", "State — history (`~/Library/Application Support/Lodekit`: logs)", "Cache — regenerable (`~/Library/Caches/Lodekit`: built output)". Accent border on the Backup tree column. Caption: "Back up one folder. Everything else Lodekit can regrow or live without."
4. **StorageDecision** — flowchart of questions: "A credential or API key?" → yes → **Secrets**; no ↓ "Should a person tune it in the dashboard?" → yes → **Settings**; no ↓ "A domain record — fields, relations, lists?" → yes → **Database**; no ↓ "A document or binary blob?" → yes → **Files**; no ↓ **KV** ("the app's own memory: counters, cursors, flags"). Caption: "Five homes for data — pick by what the value is, not by what's convenient."
5. **EventFlow** — left: emitters ("your app", "the platform", "services' change feeds") → center: "event-store — append-only log (id 1, 2, 3, …)" drawn as a tape → right, two consumers: "watch — live over SSE" and "list — replay from any offset". Caption: "Events announce; stores remember. The log is durable, ordered, and replayable — never the system of record."
6. **TaskLifecycle** — states: `queued` → `running` → `succeeded` (accent) / `failed` / `canceled`; retry loop arrow from failed back to queued labeled "retries left? backoff 30s × 2ⁿ (cap 10m)"; side note "laptop was asleep? catch-up window replays missed schedule runs". Caption: "At-least-once: a run can execute more than once, so tasks should be safe to repeat."

- [ ] **Step 2: Wire each component into its stub page**

In each target page, keep the stub line and add (example for `services/tasks.mdx`):

```mdx
import TaskLifecycle from '../../components/TaskLifecycle.astro';

<TaskLifecycle />
```

(`how-lodekit-works.mdx` imports both of its diagrams.) Relative import depth is `../../components/…` from `docs/<dir>/<page>.mdx`.

- [ ] **Step 3: Build and eyeball**

```sh
pnpm --filter @lodekit/web-docs build
```
Expected: success. Then `pnpm --filter @lodekit/web-docs dev` briefly and load `/services/tasks/` + `/start/how-lodekit-works/` in both themes (or check dist HTML) to confirm the SVGs render with theme variables.

- [ ] **Step 4: Commit**

```sh
git add web/docs/src/components web/docs/src/content
git commit -m "docs(web-docs): six theme-aware SVG diagrams wired into their pages"
```

---

### Task 3: Start here (5 pages)

**Files:** `start/what-is-lodekit.mdx`, `start/how-lodekit-works.mdx`, `start/install.mdx`, `start/connect-your-agent.mdx`, `start/your-first-app.mdx`

**Interfaces:**
- Consumes: stubs + diagrams already placed in `how-lodekit-works.mdx`.
- Produces: the non-engineer on-ramp; other pages link to `/start/install/` and `/start/connect-your-agent/`.

- [ ] **Step 1: Write the pages** (audience: non-engineer; zero code except the two copy-paste snippets on connect-your-agent)

**what-is-lodekit** — What it is (the Welcome-app phrasing: "a local, self-hosted runtime where you — working with an AI coding agent — build and run your own personal web apps. Small, personal, yours."); what you can build (a reading tracker, a garden-care app like the bundled Greenhouse, a household inventory — personal software that big products won't build for you); how it's different (runs on your machine, your data stays in one folder you can back up, no subscriptions/cloud, apps are real web apps in your browser); the division of labor (you describe, your agent builds, Lodekit runs); what's in the box (manager, runtime, dashboard, SDK + UI library, two starter apps). End: `:::note` that Lodekit is in early access on Apple silicon Macs. Links onward to how-lodekit-works + install.

**how-lodekit-works** — the mental model, written around the two diagrams already on the page. Sections: "One process, one folder" (runtime at `lodekit.localhost:7777`; everything lives in the Lodekit root `~/Documents/Lodekit` — apps/ + data/); "Two doors" (dashboard for you, MCP for your agent — from `context.md` Relationships); "How an app gets built" (BuildLifecycle diagram: agent writes files → watcher → build → ready; you never run builds); "Where your data lives" (one paragraph, link `/guide/your-lodekit-folder/`); "The services" (one paragraph: apps don't reinvent storage/scheduling — link `/services/overview/`).

**install** — `<Steps>`: 1. Get `Lodekit.app` (early access: you'll receive the app from the Lodekit team — Apple silicon Macs). 2. Move it to Applications. 3. First launch: right-click → Open (the app is signed but not yet notarized — macOS asks once). 4. What happens next: menubar icon appears, `~/Documents/Lodekit` is created with the Greenhouse and Welcome apps, the dashboard opens at `http://lodekit.localhost:7777`. 5. Optional: turn on Launch at Login (tray menu or dashboard Settings → General). `:::tip` open the Greenhouse app and poke around. Troubleshooting mini-section: nothing at :7777 → check the menubar status / Restart; "can't be opened" dialog → you double-clicked instead of right-click → Open.

**connect-your-agent** — Lodekit is agent-agnostic (any agent that speaks MCP + can load a skill). Two things to connect, with the verbatim snippets from the platform facts pack: (1) MCP server — Claude Code one-liner (`claude mcp add lodekit -- /Applications/Lodekit.app/…`) and the JSON `mcpServers` block in `<Tabs>`; explain in one line what MCP gives the agent (list/scaffold/open apps, read logs/events/data — read-only; it never sees secret values). (2) The skill — point the agent at `/Applications/Lodekit.app/Contents/Resources/platform/skill/SKILL.md`; one line on what the skill teaches. `:::note` connecting is manual during early access; a guided setup is planned.

**your-first-app** — a narrated walkthrough, no code: pick something tiny ("track the books I'm reading"); what to say to your agent (a concrete prompt block: "Build me a Lodekit app called book-log: I want to log books with title, author, and the date I finished, and see them newest-first."); what happens (agent scaffolds via MCP → files appear in `apps/book-log/` → dashboard card shows building… → ready); open it (`lodekit.localhost:7777/book-log/`); iterate by asking for changes; where the data went (`data/book-log/` — link to your-lodekit-folder); what to try next (settings knob, a weekly-summary task — links into Services).

- [ ] **Step 2: Build**

```sh
pnpm --filter @lodekit/web-docs build
```
Expected: success, no broken-link errors.

- [ ] **Step 3: Commit**

```sh
git add web/docs/src/content/docs/start
git commit -m "docs(web-docs): Start here — overview, mental model, install, agent setup, first app"
```

---

### Task 4: Using Lodekit (4 pages)

**Files:** `guide/dashboard.mdx`, `guide/your-lodekit-folder.mdx`, `guide/manager.mdx`, `guide/theming.mdx`

**Interfaces:**
- Consumes: StorageTiers diagram already in `your-lodekit-folder.mdx`; platform facts pack §Dashboard/§Manager/§Storage tiers.

- [ ] **Step 1: Write the pages** (audience: the person; no code except theming's CSS)

**dashboard** — tour by view, from the platform facts pack. Home (app cards, live build state badges, "N secrets needed", empty state); Logs (live tail, level filter, per-app filter); Events (live tail + history, filters); Secrets (catalog: create/replace/delete; values are write-only — never shown back); Settings (General · Appearance · Services · per-app; modified markers, reset, Advanced groups, per-app service overrides). One `:::note`: Data, Tasks, and Themes appear in the services menu but are coming soon. Mention ⌘K command palette. Every view name bold, one short paragraph each.

**your-lodekit-folder** — around the StorageTiers diagram. The Lodekit root (`~/Documents/Lodekit`): `apps/` (source your agent writes; no node_modules ever) + `data/` (one namespace per app id; SQLite + real files — Greenhouse photos are normal files you can open in Finder). Backups: back up the Lodekit root, that's the whole story; restoring it restores your apps and data. What's deliberately elsewhere: Cache (`~/Library/Caches/Lodekit`, rebuilt output — deleting costs a rebuild) and State (`~/Library/Application Support/Lodekit`, logs — losing it costs history, never apps or data). Use a `<FileTree>` for the root layout. `:::caution` don't hand-edit `data/` while apps run; browse freely, edit through apps.

**manager** — what the menubar app is (ships and supervises the platform; carries its own Node — touches nothing on your system). The tray menu item by item: status line (starting → running / stopped / error), Dashboard, Settings, Launch at Login (syncs both ways with the dashboard setting; if you change it in System Settings, the OS wins), Start/Stop/Restart, Quit. Crash behavior: no silent auto-restart — status shows error and you choose Restart. Quit = apps stop until next launch.

**theming** — the person's styling surface: token overrides in plain CSS. `theme.css` at the Lodekit root (all apps + dashboard) and `apps/<app-id>/theme.css` (one app, layered after global). Small honest example:

```css title="~/Documents/Lodekit/theme.css"
:root {
  --primary: oklch(0.55 0.15 150);
  --radius: 0.5rem;
}
```

Tokens are the contract; arbitrary CSS is possible but unpromised. Ask your agent to restyle — it knows the tokens. Note the `/_ui/` catalog: every component rendered under your live theme.

- [ ] **Step 2: Verify the theming tokens are real**

Check `packages/ui/theme.css` (or `src/theme.css`) for 2–3 actual token names (`--primary`, `--radius`, …) and use only tokens that exist. If the file uses different names, match them.

- [ ] **Step 3: Build + commit**

```sh
pnpm --filter @lodekit/web-docs build
git add web/docs/src/content/docs/guide
git commit -m "docs(web-docs): Using Lodekit — dashboard, folder & backups, manager, theming"
```

---

### Task 5: Services — overview + storage services (4 pages)

**Files:** `services/overview.mdx`, `services/database.mdx`, `services/kv.mdx`, `services/files.mdx`

**Interfaces:**
- Consumes: StorageDecision diagram already in `overview.mdx`; facts packs (platform §services, sdk-surface for API shape, showcase-brand for samples).
- Produces: the five-section page shape all Services pages share (spec §5): **The idea** (general systems concept) → **When to use it** → **How it works in Lodekit** (with one real sample) → **Limits** (small table) → **API** (link to SDK page).

- [ ] **Step 1: Write the pages** (teaching register — explain the fundamental, then Lodekit's take)

**overview** — the service catalog in one table (service → one-line purpose → SDK handle). Then "Choosing where data lives" around the StorageDecision diagram — teach the four-way boundary as a fundamentals lesson: *Settings* are the person's knobs (a human edits them, the app only reads); *KV* is the app's own memory (the app writes it at runtime); the *Database* is the domain model (entities, relationships, queries); *Secrets* are credentials (encrypted, server-only); *Files* are documents and blobs. Close with the placement rule by cost of loss (precious / history / regenerable) and the principle that a service never silently promotes tiers. Link every service page.

**database** — *The idea:* relational databases and why they've carried business software for 50 years — schemas make data self-describing, relations model the real world, queries answer questions you didn't plan for. What a schema migration is, and why destructive ones are dangerous. *When:* anything that is an entity — has fields, relations, gets listed/filtered/aggregated, would hurt to lose. Decision rule vs KV. *In Lodekit:* schema declared in `src/db.ts` (Greenhouse `plants`/`careRules` sample); on save, additive changes apply automatically; destructive changes are **gated** — the app tells you what would be lost and your agent expand-copies instead (new table, copy, then retire). SQLite per app in `data/<app-id>/db.sqlite`. Foreign keys enforced. *Limits:* no retention (it's the system of record); 100kb per request. *API:* `/sdk/db/`.

**kv** — *The idea:* key–value stores as the simplest useful database — O(1) lookups by name, atomic counters, TTL-expiring values; what they're bad at (relationships, queries). "App memory" framing: counters, cursors, preferences, caches, flags. *When:* the KV-vs-Database rule from context.md, stated plainly; TTL for anything self-expiring (Greenhouse snooze sample). *In Lodekit:* per-app JSON values in the app's own SQLite; atomic `incr` (Greenhouse streaks); TTL is lazy-delete-on-read + a 60s sweep. *Limits table:* key ≤ 512 chars, value ≤ 100kb request, list ≤ 1000, change events 7-day TTL. *API:* `/sdk/kv/`.

**files** — *The idea:* blob storage vs databases — why bytes don't belong in tables; S3's contract (identity by key, PUT replaces, metadata beside bytes) as the industry shape Lodekit mirrors locally. *When:* documents, images, exports, ingested files. *In Lodekit:* slug identity; bytes are **real Finder-browsable files** (`data/<app-id>/files/<date>/<slug>-<hash>.ext`) while SQLite holds the authoritative index — teach why the index/bytes split (fast listing + integrity hash, human-browsable storage); serving URLs for `<img src>`; TTL for self-expiring exports (Greenhouse snapshot sample); streamed both directions. *Limits table:* slug 1–128, title ≤ 512, metadata ≤ 4 KB, list default 100/max 1000, no size cap — it's your disk. *API:* `/sdk/files/`.

- [ ] **Step 2: Build + commit**

```sh
pnpm --filter @lodekit/web-docs build
git add web/docs/src/content/docs/services
git commit -m "docs(web-docs): Services — overview + database, kv, files fundamentals"
```

---

### Task 6: Services — flow services (5 pages)

**Files:** `services/events.mdx`, `services/tasks.mdx`, `services/logs.mdx`, `services/settings.mdx`, `services/secrets.mdx`

**Interfaces:**
- Consumes: EventFlow diagram in `events.mdx`, TaskLifecycle in `tasks.mdx`; same page shape as Task 5.

- [ ] **Step 1: Write the pages**

**events** — *The idea:* the event bus / append-only log as a fundamental of reliable systems — producers announce facts, consumers react without coupling; ordered offsets make the log replayable (the Kafka shape); and the cardinal rule: **events announce, they are never the system of record** — the precious fact belongs in the emitting app's own store. Teach around the EventFlow diagram. *When:* react to changes (live UI refresh), announce milestones ("export finished"), audit what happened. Events vs Logs: reaction vs observation. *In Lodekit:* every event addressed (`ns`) and attributed (`source`, unforgeable); durable in `data/_platform/events.sqlite` (backed up); live over SSE (`watch`, client-side) + history/replay (`list` from any offset); the platform itself and every service's change feed emit here (`build-state`, `kv-store-change`, …) — Greenhouse watch sample. *Limits:* payload ≤ 8 KB, 30-day/50k retention, change feeds 7 days. *API:* `/sdk/events/`.

**tasks** — *The idea:* background work as a queue — why apps shouldn't do slow/scheduled work in a request; **at-least-once delivery** and its price, idempotency (teach with the diagram: a run can repeat, so "charge the card" needs a dedupe key; "recompute the summary" is naturally safe); retries with exponential backoff as the polite way to fail; cron vs intervals; and the laptop reality — machines sleep, so schedulers need a **catch-up** story. *When:* reminders, digests, sweeps, anything slow. *In Lodekit:* declared in `src/tasks.ts` (Greenhouse three-task sample — enqueueable reminder, `cron` morning rounds with `catchUp`, `every: "12h"` sweep); serial per app, parallel across apps; runs recorded with full history; defaults: 3 retries, 5m timeout, 1h catch-up, backoff 30s×2ⁿ cap 10m. *Limits:* run history last 100 / 30 days per task; min interval 1m. *API:* `/sdk/tasks/`. `:::note` dashboard Tasks view coming soon; runs visible via `tasks.runs()` and the agent.

**logs** — *The idea:* telemetry vs business events (observation vs reaction — same happening, different consumers); structured logging (fields, not string soup) and levels as a severity contract; why logs are ring-buffers not archives (retention). *When:* debugging, understanding what the app did; never for data. *In Lodekit:* `logs.info("care given", { plantId })` plus automatic `console.*` capture; platform components log to the same store; lives in **State** (not backed up — teach why: losing history ≠ losing data); dashboard Logs view; your agent reads them over MCP to debug your app. *Limits:* 7 days / 200k records, message ≤ 8192 chars. *API:* `/sdk/logs/`.

**settings** — *The idea:* configuration as a contract between builder and user — declared schema (types, labels, defaults) beats config files; who writes matters more than what's stored ("person writes, app reads"). *When:* any knob a human should turn — vs KV (the app's own writes) and vs Secrets (credentials). *In Lodekit:* apps declare in `src/settings.ts` via `defineSettings()` (invented-but-signature-exact sample: a `boolean` + a `select` + a `duration` for a garden app); person edits in the dashboard; app reads effective values (`get`/`all`) and reacts live (`watch`); platform services expose their own tuning the same way, per-app overridable (override → platform value → default = effective value). *Limits:* five field types; keys snake_case ≤ 64. *API:* `/sdk/settings/`.

**secrets** — *The idea:* why credentials are their own storage class — encrypted at rest, least privilege, never in code/chat/logs; the difference between storing a secret and granting access to it. *When:* API keys, tokens — never in Settings, KV, or the Database. *In Lodekit:* a platform-wide catalog you manage in the dashboard; apps declare **slots** (`src/secrets.ts`, `defineSecrets` sample with one `weather_api_key` slot); you **link** a catalog secret to a slot — the link is the grant; only server-side code reads values (`secrets.get`), the browser and your agent never can (agent sees existence, not values); AES-256-GCM, master key in the macOS Keychain — so your backups never contain plaintext. *Limits:* value ≤ 4 KB. *API:* `/sdk/secrets/`.

- [ ] **Step 2: Build + commit**

```sh
pnpm --filter @lodekit/web-docs build
git add web/docs/src/content/docs/services
git commit -m "docs(web-docs): Services — events, tasks, logs, settings, secrets fundamentals"
```

---

### Task 7: Building apps (5 pages)

**Files:** `build/the-stack.mdx`, `build/app-anatomy.mdx`, `build/data-and-server-functions.mdx`, `build/live-updates.mdx`, `build/using-the-ui-library.mdx`

**Interfaces:**
- Consumes: showcase-brand facts (samples), sdk-surface facts (contracts), context.md (stack/app-contract terms).
- Audience: engineers and the person reading over the agent's shoulder. Real code throughout.

- [ ] **Step 1: Write the pages**

**the-stack** — what apps are written in: TanStack Start (React 19, file-based routes, loaders, server functions, SSR) + TypeScript + Tailwind, importing `@lodekit/sdk` and `@lodekit/ui`. The **shared toolchain** teaching point: one Vite+deps install shared by every app — apps carry no `node_modules`, the backup tree stays clean, and version drift can't happen between apps. "Bundled for apps, buildless for you": apps are compiled by Lodekit on save; the person never runs a build. Why prescribe one stack at all (agents write best against one well-lit path; every app looks like one product).

**app-anatomy** — the app contract, with a `<FileTree>` of a real app:

```
apps/greenhouse/
├── manifest.json        # name, appId, icon, description
├── src/
│   ├── router.tsx       # TanStack Start wiring
│   ├── routes/          # file-based routes
│   │   ├── __root.tsx
│   │   └── index.tsx
│   ├── db.ts            # database schema (optional)
│   ├── tasks.ts         # background tasks (optional)
│   ├── settings.ts      # person-facing knobs (optional)
│   ├── secrets.ts       # credential slots (optional)
│   └── index.css        # imports the shared theme
└── routeTree.gen.ts     # generated, committed
```

Manifest sample (from facts); app id rules (`^[a-z0-9-]+$`, = folder name, = URL path, = data namespace); the three declaration files each get a one-paragraph intro + link to their service page; build lifecycle recap (link how-lodekit-works).

**data-and-server-functions** — where code runs (browser vs app worker) and why a trust boundary sits between them; `createServerFn()` with `.inputValidator(zod)` — validate at the boundary, always (Greenhouse `giveCare` trimmed to ~15 lines); loaders for read paths (Greenhouse `getConservatory` sample); the SDK is isomorphic — same `db`/`kv` calls both sides; when to reach for a server function vs calling from the client (secrets: server-only; multi-step writes: server).

**live-updates** — the pattern that makes apps feel alive: every service emits change events → the client watches → invalidate the router → loaders re-run. The Greenhouse sample (`events.watch({ type: [...] }, () => router.invalidate())` in `useEffect`); scoping watches by type; filtering in the callback (file slug sample); teach the trade-off honestly: coarse invalidation is simple and right at personal scale.

**using-the-ui-library** — `import { Button, Card } from "@lodekit/ui"` (Greenhouse import line); one shared theme = all apps look like one product; `@import "@lodekit/ui/theme.css"` in `src/index.css`; the component set is stock shadcn (link the full list → the `/_ui/` catalog on your own machine renders every component under your live theme); person-facing theming belongs in `/guide/theming/`.

- [ ] **Step 2: Build + commit**

```sh
pnpm --filter @lodekit/web-docs build
git add web/docs/src/content/docs/build
git commit -m "docs(web-docs): Building apps — stack, anatomy, server functions, live updates, UI"
```

---

### Task 8: SDK reference — overview + storage handles (4 pages)

**Files:** `sdk/overview.mdx`, `sdk/kv.mdx`, `sdk/db.mdx`, `sdk/files.mdx`

**Interfaces:**
- Consumes: sdk-surface facts pack — **every signature verbatim from there**.
- Produces: the SDK page shape: intro line (+ link to concept page) → import line → per-method sections, each with a signature code block, parameter list, return + behavior notes, and one example. Types documented in a "Types" section at the page bottom.

- [ ] **Step 1: Write the pages**

Page shape, concretely (use for every handle page):

```mdx
---
title: kv
description: Key–value storage — the kv-store service's SDK handle.
---

Per-app key–value storage. For what KV is for (and when the [Database](/sdk/db/)
fits better), see [the KV service](/services/kv/).

```ts
import { kv } from "@lodekit/sdk";
```

Works in the browser and in server functions.

## kv.get()

```ts
get<T = unknown>(key: string): Promise<T | undefined>
```

Returns the value for `key`, or `undefined` if the key doesn't exist or its
TTL has expired. …

### Example
…
```

**sdk/overview** — the import model (`import { kv, db, files, events, tasks, settings, secrets, logs, appId } from "@lodekit/sdk"`); how it works (typed HTTP client against the app's scoped API — you never configure URLs; `appId` injected at build); **the environment matrix as a table** (handle × browser/server from the facts pack's conventions section: `events.watch`/`settings.watch` client-only, `secrets.get` server-only, everything else both); error semantics (rejected promise with the server's message; `logs.*` fire-and-forget never throws; `SecretUnavailableError`); conventions (TTLs in seconds everywhere; ms-epoch timestamps; keyset cursors; 100kb request cap); `createClient` for the rare custom case.

**sdk/kv** — every method from the facts pack: `get`, `set` (ttl semantics: seconds, positive, absence clears), `del`, `has`, `incr` (atomic, preserves TTL, non-number → error, missing starts at 0), `list` (prefix/limit/cursor, keyset pagination), `getMany`, `setMany` (one transaction), `collection`. `KvEntry` type. `Collection` section with its five methods and the `name:id` / `_seq:name` key convention. Examples from Greenhouse (streak `incr`, snooze TTL, `getMany` fan-in).

**sdk/db** — `createDb(schema)` and the `src/db.ts` contract (declare drizzle tables, export them + `export const db = createDb({...})`); note it's standard drizzle — query building local, execution over HTTP; works both sides. Schema push rules (additive auto; destructive gated; `_`/`sqlite_` prefixes reserved). Query examples from Greenhouse: select+where, insert with `onConflictDoUpdate`, insert into journal, `$inferSelect` types. What's rejected (non-CRUD, `_` tables). Link `/services/database/` for the migration story.

**sdk/files** — `put` (both overloads' behavior: with slug = create/replace, without = derived slug; opts: slug/title/contentType/ttl/metadata; `FilePutBody` union; streaming), `get`, `url` (sync; `download` option), `stat`, `delete`, `list`, `copy` (resets timestamps), `move` (preserves createdAt). `FileStat` type with every field. Slug rules + `slugify` behavior + collision suffixing. Greenhouse photo-upload and TTL-export examples.

- [ ] **Step 2: Build + commit**

```sh
pnpm --filter @lodekit/web-docs build
git add web/docs/src/content/docs/sdk
git commit -m "docs(web-docs): SDK reference — overview, kv, db, files"
```

---

### Task 9: SDK reference — flow handles (5 pages)

**Files:** `sdk/events.mdx`, `sdk/tasks.mdx`, `sdk/settings.mdx`, `sdk/secrets.mdx`, `sdk/logs.mdx`

**Interfaces:**
- Consumes: sdk-surface facts pack; same page shape as Task 8.

- [ ] **Step 1: Write the pages**

**sdk/events** — `emit(type, payload?, { ttl? })` (grammar, 8 KB cap, ns/source stamped to the app — unforgeable), `watch(filter, cb)` (**client-only** — throws server-side; string or array of types; returns unsubscribe; one shared EventSource), `list({ type?, after?, before?, limit? })` (offset replay; `next` cursor). `LodekitEvent` type. The platform event types apps commonly watch: `build-state`, `server-state`, `kv-store-change`, `db-store-change`, `file-store-change`, `tasks-change`, `settings-change` (identity-only payloads). Greenhouse watch examples; invented-but-exact `emit` example ("export-finished").

**sdk/tasks** — the `src/tasks.ts` contract first: `task(config)` with every `TaskConfig` field and default (`cron` XOR `every`, `catchUp` default "1h", `retries` 3, `timeout` "5m", `run`); naming = kebab-case of the export. Then the handle: `enqueue(name, payload?, { delay? | at?, dedupeKey? })` (returns run id; dedupe semantics), `cancel(runId)` (queued only), `runs({ task?, state?, limit? })`, `list()`. `TaskRun`, `TaskInfo`, `TaskRunState` types in full. Engine behavior box: at-least-once, backoff formula, interrupted-run accounting, coalescing. Greenhouse samples (all three declaration forms + enqueue with `at`/`dedupeKey`).

**sdk/settings** — the `src/settings.ts` contract: `defineSettings(fields)` as default export; all five builders with their full option sets (`boolean`/`string`/`number`/`select`/`duration`, incl. `advanced`, `min`/`max`/`step`/`integer`, `maxLength`/`placeholder`, options, duration grammar `<n><s|m|h|d>`); key rules. Typed facade (`settings.get`/`all`/`watch` — watch client-only, `{ key }` identity payload). Effective-value resolution one-liner + link to `/services/settings/`. One full invented-but-exact `src/settings.ts` example.

**sdk/secrets** — `src/secrets.ts` contract: `defineSecrets` + `secret({ label, description })`; `secrets.get(slot)` server-only (browser throws immediately); error contract: `SecretUnavailableError` with `reason: "unlinked" | "unavailable"` — show the graceful-degradation pattern:

```ts
try {
  const key = await secrets.get("weather_api_key");
} catch (e) {
  if (e instanceof SecretUnavailableError && e.reason === "unlinked") {
    return { forecast: null }; // person hasn't linked a key yet — degrade, don't crash
  }
  throw e;
}
```

**sdk/logs** — the four methods (`debug`/`info`/`warn`/`error`), fire-and-forget contract (`void`, never throws — safe on any code path), structured `fields`, automatic `console.*` capture in workers and its level mapping, message cap 8192. Where records go + retention (link `/services/logs/`).

- [ ] **Step 2: Build + commit**

```sh
pnpm --filter @lodekit/web-docs build
git add web/docs/src/content/docs/sdk
git commit -m "docs(web-docs): SDK reference — events, tasks, settings, secrets, logs"
```

---

### Task 10: Reference (5 pages)

**Files:** `reference/mcp-tools.mdx`, `reference/limits-and-retention.mdx`, `reference/file-locations.mdx`, `reference/manifest.mdx`, `reference/glossary.mdx`

- [ ] **Step 1: Write the pages**

**mcp-tools** — intro: what the MCP server is (the agent's door; read-only plus scaffold/open; secret *values* are never readable over MCP), how it's registered (link `/start/connect-your-agent/`), `LODEKIT_BASE_URL` override. Then the 14 tools from the platform facts pack, grouped (Apps: scaffold/list_apps/open_app · Observability: logs/events · Data: kv_list/kv_get/db_schema/db_query/files_list/files_stat · Config: settings_list/settings_get/secrets_list), each with its parameters and a one-to-two-line description.

**limits-and-retention** — one table per service collecting **every** number from the facts packs (kv, files, tasks, logs, events, secrets, settings, scoped API 100kb cap), with a lead paragraph: most of these are settings you can tune in the dashboard (Settings → Services); hard limits marked as such (event payload 8 KB, event ttl ≤ 30d, secret value 4 KB).

**file-locations** — table + prose from the storage-tiers facts: Lodekit root (`~/Documents/Lodekit`, `LODEKIT_ROOT`) with `apps/` + `data/` incl. `data/_platform/` (events.sqlite, settings.sqlite, secrets.sqlite); State (`~/Library/Application Support/Lodekit` — logs.sqlite, runtime.pid); Cache (`~/Library/Caches/Lodekit`); text logs (`~/Library/Logs/Lodekit`); Keychain (master key — why it's outside every backup). What to back up (the root, nothing else) and what each loss costs.

**manifest** — `manifest.json` schema: the four fields with types/requiredness/rules (`appId` grammar + must-equal-folder), the skip-on-invalid behavior, a valid example.

**glossary** — the person-facing subset of `context.md`, alphabetized, one- to two-line definitions, rewritten for outsiders (no internal spec paths, no "Avoid" lists): app · app contract · app id · app worker · agent · backup tree · build state · bundled · Cache · dashboard · data tree · Engine · event · Lodekit root · manager · manifest · MCP server · platform · runtime · scaffold · scoped API · SDK · server function · service · settings · shared toolchain · skill · stack · State · storage tiers · UI library. Cross-link docs pages where one exists.

- [ ] **Step 2: Build + commit**

```sh
pnpm --filter @lodekit/web-docs build
git add web/docs/src/content/docs/reference
git commit -m "docs(web-docs): Reference — MCP tools, limits, file locations, manifest, glossary"
```

---

### Task 11: Accuracy verification pass

**Files:** possibly small fixes across `web/docs/src/content/docs/**`

- [ ] **Step 1: Dispatch an accuracy reviewer** (fresh subagent, read-only mandate) with this brief: "Compare every signature, method name, option name, default, and limit stated in `web/docs/src/content/docs/sdk/*.mdx` and `reference/limits-and-retention.mdx` against the source of truth: `packages/sdk/src/{client,db,task,settings,secrets,index}.ts` and `packages/runtime/src/platformSettings.ts`. Also verify: every claim in `reference/mcp-tools.mdx` against `packages/mcp/index.ts`; the manifest rules against `packages/runtime/src/registry.ts`; the theming token names in `guide/theming.mdx` against `packages/ui`'s theme.css; the MCP/skill snippets in `start/connect-your-agent.mdx` against `manager/README.md`. Report each mismatch as file:line → stated vs actual."

- [ ] **Step 2: Fix every confirmed mismatch** (edit the docs, not the code).

- [ ] **Step 3: Cross-page consistency sweep** — grep the built pages for numbers (`grep -rEo '[0-9]+ ?(days|KB|kb|chars|rows|records)' web/docs/src/content/docs | sort | uniq -c`) and reconcile any figure that appears with two different values.

- [ ] **Step 4: Build + commit**

```sh
pnpm --filter @lodekit/web-docs build
git add web/docs/src/content/docs
git commit -m "docs(web-docs): accuracy pass — align signatures, limits, and snippets with source"
```

---

### Task 12: Final review and polish

- [ ] **Step 1: Full build from clean**

```sh
rm -rf web/docs/dist && pnpm --filter @lodekit/web-docs build
```
Expected: success, 38 pages.

- [ ] **Step 2: Spot-check rendered output** — `pnpm --filter @lodekit/web-docs dev` (or serve `dist/`), then fetch and skim: `/` (splash + cards), `/start/how-lodekit-works/` (both diagrams render), `/services/tasks/` (diagram + limits table), `/sdk/kv/` (signatures render), `/reference/glossary/`. Check one page with the theme toggled to light (SVG colors must adapt).

- [ ] **Step 3: Editorial skim** — read the Start-here section end to end as the non-engineer; kill any jargon that slipped in (worker threads, SSE without explanation, package names in prose).

- [ ] **Step 4: Update the roadmap** — in `roadmap.md`, "Starlight docs" entry: mark content + IA shipped (this slice), leave theming-design-layer + deploy parked; light Starlight accent/font theming shipped with content.

- [ ] **Step 5: Commit**

```sh
git add roadmap.md web/docs
git commit -m "docs(web-docs): final polish; roadmap — docs content shipped, deploy still parked"
```

- [ ] **Step 6: STOP.** Leave everything on the `docs` branch. Report to the person for smoke testing. Do not merge, do not rebase onto master unattended.
