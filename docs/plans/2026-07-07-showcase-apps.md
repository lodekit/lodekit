# Showcase Apps (Greenhouse & Welcome) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two example apps with the Greenhouse showcase app (full SDK coverage) and a minimal Welcome app, rename `examples/` to `root/`, and make the packaged manager install the showcase into a fresh Lodekit root on first run.

**Architecture:** Two TanStack Start apps living in the checked-in Lodekit root (`root/apps/`), served buildless by the runtime. Greenhouse exercises every kv/files/tasks/logs SDK method through real features (plants-as-characters domain); Welcome is a one-page orientation app with a `kv.incr` counter. The manager copies `root/apps/` into `~/Documents/Lodekit/apps` on first packaged run only.

**Tech Stack:** TanStack Start + React (app code), `@lodekit/sdk` (kv/files/tasks/logs), `@lodekit/ui` components, zod for server-fn validation, vitest (runtime e2e + manager tests).

**Spec:** `docs/specs/2026-07-07-showcase-apps-design.md` — read it before starting. This plan covers **Part 1** (everything buildable on today's SDK). **Part 2** (events-service integration: Ledger, While You Were Away, event emissions, `weekly_gazette`, watch migration) is gated on the events slice landing (spec §5) and gets its own plan then — see the final section.

## Global Constraints

- Branch: work happens on the current `manager` worktree branch. Commit per task. **Never fold into `master`** — the person integrates.
- App IDs: `greenhouse` (icon 🪴), `welcome` (icon 👋). Task names are snake_case (`morning_rounds`, `care_reminder`, `compost_sweep`).
- File-store slugs match `^[a-z0-9-]{1,128}$` — **no slashes or dots**. Layout: `cover-<plantId>`, `photo-<plantId>-<paddedTs>`, `archive-<plantId>-<paddedTs>`, `snapshot-<ts>`.
- kv/files `ttl` options are **seconds** (converted to ms epoch internally).
- Apps are NOT workspace members (`root/` is excluded from `pnpm-workspace.yaml` membership just as `examples/` was) — they get no `node_modules`; all imports resolve through the runtime's build. No per-app `package.json`.
- Apps import only: `@lodekit/sdk`, `@lodekit/ui`, `@tanstack/react-router`, `@tanstack/react-start`, `@tanstack/react-query`, `react`, `zod`. (Same set the old examples used.)
- Do not commit `root/data/` (its `.gitignore` covers `data/`) or any `routeTree.gen.ts` (generated at build).
- Tone: warm, lightly playful copy; personality in content, not UI gimmicks (spec §2).
- The dev-server smoke used by several tasks: `LODEKIT_ROOT=$(pwd)/root LODEKIT_CACHE_DIR=$(pwd)/.cache LODEKIT_PORT=7788 pnpm --filter @lodekit/runtime start` (run in background), then poll `curl -s http://127.0.0.1:7788/<appId>/` until the HTML contains `/_build/` (the built shell) — first build takes ~30–60s. Kill the server when done.

---

### Task 1: Rename `examples/` → `root/`

The directory *is* the shipped Lodekit root now (spec §10). Pure rename + reference updates; the old apps keep working inside it until Task 7 deletes them.

**Files:**
- Rename: `examples/` → `root/` (git mv; includes `apps/habit-tracker`, `apps/expense-tracker`, `theme.css`, `.gitignore`)
- Modify: `package.json:6` (dev script)
- Modify: `manager/src/paths.js:35`
- Modify: `manager/tests/paths.test.js:33-36`
- Modify: `packages/runtime/tests/e2e.test.ts:48,52`
- Modify: `CLAUDE.md` (lines mentioning `examples/`)

**Interfaces:**
- Produces: `root/` as the checked-in Lodekit root path; every later task creates apps under `root/apps/`.

- [ ] **Step 1: git mv and reference updates**

```bash
git mv examples root
```

In `package.json` change the dev script:

```json
"dev": "LODEKIT_ROOT=$(pwd)/root LODEKIT_CACHE_DIR=$(pwd)/.cache pnpm --filter @lodekit/runtime start",
```

In `manager/src/paths.js` (dev branch of `getPaths`):

```js
    lodekitRoot: path.join(repoRoot, "root"),
```

In `manager/tests/paths.test.js` update the dev-mode expectation:

```js
  it("dev mode runs the workspace runtime against root/ on the system node", () => {
```
and
```js
    expect(p.lodekitRoot).toBe("/repo/root");
```

In `packages/runtime/tests/e2e.test.ts` update both copy paths:

```ts
    path.join(__dirname, "../../../root/apps/expense-tracker"),
```
```ts
    path.join(__dirname, "../../../root/apps/habit-tracker"),
```

In `CLAUDE.md`, update the four `examples/` mentions (workspace-members line, manager dev-mode line, the `examples/` bullet, and the manager start line) to say `root/` — keep the wording otherwise, e.g. the bullet becomes:

```markdown
- **`root/`** — the checked-in Lodekit root: showcase Start apps (no per-app dependencies)
  used in dev via `LODEKIT_ROOT=./root` and shipped by the manager on first run.
```

(Task 9 rewrites this bullet properly for the new apps; here just make paths truthful.)

- [ ] **Step 2: Run the affected tests**

Run: `pnpm --filter @lodekit/manager test`
Expected: PASS (paths tests green).

Run: `pnpm --filter @lodekit/runtime test -- --run tests/e2e.test.ts`
Expected: PASS (builds three apps; takes a few minutes).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: rename examples/ to root/ — the checked-in Lodekit root"
```

---

### Task 2: Welcome app

Spec §9. One page, one live element (`kv.incr` visit counter). Keeps the root a two-app root.

**Files:**
- Create: `root/apps/welcome/manifest.json`
- Create: `root/apps/welcome/src/router.tsx`
- Create: `root/apps/welcome/src/index.css`
- Create: `root/apps/welcome/src/routes/__root.tsx`
- Create: `root/apps/welcome/src/routes/index.tsx`

**Interfaces:**
- Produces: app `welcome` served at `/welcome/`; page contains the literal strings `Welcome to Lodekit` and `<span id="visit-count">N</span>` (Task 7's e2e parses that span).

- [ ] **Step 1: Create the app files**

`root/apps/welcome/manifest.json`:

```json
{
  "name": "Welcome to Lodekit",
  "appId": "welcome",
  "icon": "👋",
  "description": "Start here — what Lodekit is and how to build with it."
}
```

`root/apps/welcome/src/router.tsx`:

```tsx
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({ routeTree });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
```

`root/apps/welcome/src/index.css`:

```css
@import "@lodekit/ui/theme.css";
```

`root/apps/welcome/src/routes/__root.tsx`:

```tsx
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import appCss from "../index.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: "Welcome to Lodekit" }],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: () => (
    <html lang="en">
      <head>
        <HeadContent />
        {/* Theme before hydration — no dark-mode flash (spec §2 / shadcn item 2).
            dangerouslySetInnerHTML is safe ONLY because this is a fixed string
            literal; never interpolate anything into it. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.toggle("dark",matchMedia("(prefers-color-scheme: dark)").matches)`,
          }}
        />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
```

`root/apps/welcome/src/routes/index.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { kv } from "@lodekit/sdk";
import { Card, CardContent, CardHeader, CardTitle } from "@lodekit/ui";

// The page's one live element: each visit bumps a counter in this app's own kv store.
const visit = createServerFn().handler(async () => kv.incr("visits"));

export const Route = createFileRoute("/")({
  loader: () => visit(),
  component: WelcomePage,
});

function WelcomePage() {
  const visits = Route.useLoaderData();
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Welcome to Lodekit 👋</h1>
      <p className="text-muted-foreground">
        Lodekit is a local, self-hosted runtime where you — working with an AI coding
        agent — build and run your own personal web tools.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Your Lodekit root</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Everything lives in one folder: <code>apps/</code> holds each app&apos;s source,
            <code> data/</code> holds its storage. Apps are plain TanStack Start projects —
            edit the source and the runtime rebuilds them on save.
          </p>
          <p>
            Try the <strong>Greenhouse</strong> app next door: a small conservatory that
            shows what an app here can do — storage, files, scheduled work, logs.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Build with your agent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Ask your coding agent for the tool you wish existed. It scaffolds an app in
            <code> apps/</code>, and the dashboard shows it building and running. Small,
            personal, yours.
          </p>
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        You&apos;ve opened this page <span id="visit-count">{visits}</span>{" "}
        {visits === 1 ? "time" : "times"} — that number lives in this app&apos;s own
        key-value store.
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Smoke it against the dev server**

Start the dev server in the background (see Global Constraints), then:

Run: `curl -s http://127.0.0.1:7788/welcome/ | grep -o 'Welcome to Lodekit' | head -1`
Expected: `Welcome to Lodekit` (poll until the page contains `/_build/` first).

Run: `curl -s http://127.0.0.1:7788/welcome/ | grep -o 'id="visit-count">[0-9]*'` twice.
Expected: the number increments between the two fetches.

Kill the dev server.

- [ ] **Step 3: Commit**

```bash
git add root/apps/welcome
git commit -m "feat(root): Welcome to Lodekit app — orientation page with kv.incr visit counter"
```

---

### Task 3: Greenhouse — domain core, tasks, seeding, Conservatory page

Spec §2–§4, §8. The app skeleton plus everything the index page needs: domain lib, the three task definitions, self-seeding, plant grid with moods, and the adopt flow. Care actions/detail page come in Task 4 (they import `care.ts` created here).

**Files:**
- Create: `root/apps/greenhouse/manifest.json`
- Create: `root/apps/greenhouse/theme.css`
- Create: `root/apps/greenhouse/src/router.tsx`
- Create: `root/apps/greenhouse/src/index.css`
- Create: `root/apps/greenhouse/src/lib.ts`
- Create: `root/apps/greenhouse/src/tasks.ts`
- Create: `root/apps/greenhouse/src/seed.ts`
- Create: `root/apps/greenhouse/src/care.ts`
- Create: `root/apps/greenhouse/src/routes/__root.tsx`
- Create: `root/apps/greenhouse/src/routes/index.tsx`

**Interfaces:**
- Produces (consumed by Tasks 4–6):
  - `lib.ts`: types `CareKind`, `CareConfig`, `Plant`, `KindState`, `CareState`, `JournalEntry`, `Mood`; consts `CARE_KINDS: CareKind[]`, `CARE_VERB: Record<CareKind,string>`, `plants` (kv collection); key helpers `stateKey(id)`, `streakKey(id)`, `countKey(id,kind)`, `snoozeKey(id)`, `journalPrefix(id)`, `journalKey(id,at)`, `padTs(ms)`; `parseEvery(every: string): number` (ms); `moodFor(plant, state, streak, now): Mood`.
  - `seed.ts`: `portraitSvg(icon: string, seed: number): string`, `seedIfNeeded(): Promise<boolean>`.
  - `care.ts` server fns: `giveCare({plantId, kind})`, `adoptPlant({name, species, icon, personality, waterEvery, feedEvery, mistEvery?})`, `updateCare({plantId, kind, every})`, `snoozePlant({plantId, hours})`, `remindLater({plantId, kind})`, `skipNext({plantId, kind})`, `letGo({plantId})`.
  - `tasks.ts` exports `morning_rounds`, `care_reminder`, `compost_sweep`.
  - Route `/` (Conservatory) with server fn `getConservatory()`.

- [ ] **Step 1: Skeleton files**

`root/apps/greenhouse/manifest.json`:

```json
{
  "name": "Greenhouse",
  "appId": "greenhouse",
  "icon": "🪴",
  "description": "Your plants, as characters — care schedules, photo timelines, and a journal."
}
```

`root/apps/greenhouse/theme.css` (per-app theme override example — green, thematically right; preserves the theming-layering demo the deleted habit-tracker carried):

```css
/* Per-app theme — applies only to greenhouse, layered after the root's global
   theme.css (so these values win over its indigo). Green primary, of course. */
:root {
  --primary: oklch(0.6 0.17 150);
  --primary-foreground: oklch(0.985 0 0);
  --ring: oklch(0.68 0.13 150);
}

@media (prefers-color-scheme: dark) {
  :root {
    --primary: oklch(0.72 0.17 150);
    --primary-foreground: oklch(0.22 0.05 150);
    --ring: oklch(0.58 0.11 150);
  }
}
```

`root/apps/greenhouse/src/router.tsx` — identical to Welcome's (Task 2 Step 1).

`root/apps/greenhouse/src/index.css`:

```css
@import "@lodekit/ui/theme.css";
```

`root/apps/greenhouse/src/routes/__root.tsx`:

```tsx
import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import appCss from "../index.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: "Greenhouse" }],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: () => (
    <html lang="en">
      <head>
        <HeadContent />
        {/* Theme before hydration — no dark-mode flash (spec §2 / shadcn item 2).
            dangerouslySetInnerHTML is safe ONLY because this is a fixed string
            literal; never interpolate anything into it. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.toggle("dark",matchMedia("(prefers-color-scheme: dark)").matches)`,
          }}
        />
      </head>
      <body>
        <nav className="mx-auto flex max-w-4xl items-center gap-4 p-4">
          <span className="text-lg">🪴</span>
          <Link to="/" className="font-medium">Conservatory</Link>
          <Link to="/almanac">Almanac</Link>
          <Link to="/shed">Potting Shed</Link>
        </nav>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
```

- [ ] **Step 2: Domain lib**

`root/apps/greenhouse/src/lib.ts`:

```ts
import { kv } from "@lodekit/sdk";

export type CareKind = "water" | "feed" | "mist";
export const CARE_KINDS: CareKind[] = ["water", "feed", "mist"];
export const CARE_VERB: Record<CareKind, string> = { water: "Watered", feed: "Fed", mist: "Misted" };

export interface CareConfig {
  /** Human-editable interval, e.g. "3d" or "12h". */
  every: string;
}

export interface Plant {
  name: string;
  species: string;
  icon: string;
  personality: string;
  adoptedAt: number;
  care: Partial<Record<CareKind, CareConfig>>;
}

export interface KindState {
  lastAt: number;
  dueAt: number;
  /** Set by care_reminder / morning_rounds once the kind became due. */
  dueSince?: number;
  /** The queued care_reminder run for this kind — canceled on re-care/skip. */
  reminderRunId?: number;
}
export type CareState = Partial<Record<CareKind, KindState>>;

export interface JournalEntry {
  at: number;
  text: string;
}

export const plants = kv.collection<Plant>("plants");

export const stateKey = (id: number) => `state:${id}`;
export const streakKey = (id: number) => `streak:${id}`;
export const countKey = (id: number, kind: CareKind) => `count:${kind}:${id}`;
export const snoozeKey = (id: number) => `snooze:${id}`;
export const journalPrefix = (id: number) => `journal:${id}:`;
/** Zero-padded epoch ms — keys sort chronologically under prefix listing. */
export const padTs = (ms: number) => String(ms).padStart(14, "0");
export const journalKey = (id: number, at: number) => `${journalPrefix(id)}${padTs(at)}`;

/** "3d" / "12h" → milliseconds. Throws on anything else. */
export function parseEvery(every: string): number {
  const m = /^(\d+)([dh])$/.exec(every.trim());
  if (!m) throw new Error(`invalid interval "${every}" — use e.g. "3d" or "12h"`);
  return Number(m[1]) * (m[2] === "d" ? 86_400_000 : 3_600_000);
}

export type MoodKey = "thriving" | "content" | "parched" | "hungry" | "dusty" | "wilting";
export interface Mood {
  key: MoodKey;
  emoji: string;
  label: string;
}

/**
 * Deterministic mood from care state: the worst-overdue kind wins.
 * over > 1 interval past due → wilting; past due → parched/hungry/dusty by kind;
 * otherwise a 7+ streak is thriving, else content.
 */
export function moodFor(plant: Plant, state: CareState, streak: number, now: number): Mood {
  let worst = 0;
  let worstKind: CareKind = "water";
  for (const kind of CARE_KINDS) {
    const cfg = plant.care[kind];
    const ks = state[kind];
    if (!cfg || !ks) continue;
    const over = (now - ks.dueAt) / parseEvery(cfg.every);
    if (over > worst) {
      worst = over;
      worstKind = kind;
    }
  }
  if (worst > 1) return { key: "wilting", emoji: "🥀", label: "wilting — needs attention" };
  if (worst > 0) {
    if (worstKind === "water") return { key: "parched", emoji: "🏜️", label: "parched" };
    if (worstKind === "feed") return { key: "hungry", emoji: "😋", label: "hungry" };
    return { key: "dusty", emoji: "🌫️", label: "missing a misting" };
  }
  if (streak >= 7) return { key: "thriving", emoji: "🌟", label: `thriving — ${streak}-care streak` };
  return { key: "content", emoji: "🙂", label: "content" };
}
```

- [ ] **Step 3: Task definitions**

`root/apps/greenhouse/src/tasks.ts`:

```ts
import { task, kv, files, logs } from "@lodekit/sdk";
import {
  CARE_KINDS,
  type CareKind,
  type CareState,
  plants,
  parseEvery,
  stateKey,
  streakKey,
} from "./lib";

/** Reminder for one plant + care kind, enqueued by care actions at the next due time. */
export const care_reminder = task({
  run: async (p: { plantId: number; kind: CareKind }) => {
    const plant = await plants.get(p.plantId);
    if (!plant) return; // let go before the reminder fired
    const state = (await kv.get<CareState>(stateKey(p.plantId))) ?? {};
    const ks = state[p.kind];
    const now = Date.now();
    if (!ks || ks.dueAt > now) return; // re-cared meanwhile — nothing due
    if (!ks.dueSince) {
      ks.dueSince = now;
      await kv.set(stateKey(p.plantId), state);
    }
    logs.info("care due", { plantId: p.plantId, kind: p.kind, name: plant.name });
  },
});

/** Daily rounds: mark overdue kinds, break streaks, warn on wilting plants. */
export const morning_rounds = task({
  cron: "0 9 * * *",
  catchUp: true,
  run: async () => {
    const now = Date.now();
    const all = await plants.all();
    let due = 0;
    for (const { id, value: plant } of all) {
      const state = (await kv.get<CareState>(stateKey(id))) ?? {};
      let overdue = false;
      let wilting = false;
      let changed = false;
      for (const kind of CARE_KINDS) {
        const cfg = plant.care[kind];
        const ks = state[kind];
        if (!cfg || !ks || ks.dueAt > now) continue;
        overdue = true;
        if (!ks.dueSince) {
          ks.dueSince = now;
          changed = true;
        }
        if (now - ks.dueAt > parseEvery(cfg.every)) wilting = true;
      }
      if (changed) await kv.set(stateKey(id), state);
      if (overdue) {
        due++;
        await kv.set(streakKey(id), 0); // a missed round breaks the streak
        if (wilting) logs.warn("plant wilting", { plantId: id, name: plant.name });
      }
    }
    await kv.set("rounds:last", { ranAt: now, due, total: all.length });
    logs.info("morning rounds complete", { due, total: all.length });
  },
});

/** Housekeeping: prune archived photos older than 90 days, trim journals beyond 200 entries. */
export const compost_sweep = task({
  every: "12h",
  run: async () => {
    const now = Date.now();
    let sweptFiles = 0;
    let sweptKeys = 0;
    for (const { id } of await plants.all()) {
      let fc: string | null = null;
      do {
        const page = await files.list({ prefix: `archive-${id}-`, limit: 200, cursor: fc ?? undefined });
        for (const f of page.entries) {
          if (now - f.createdAt > 90 * 86_400_000) {
            await files.delete(f.slug);
            sweptFiles++;
          }
        }
        fc = page.nextCursor;
      } while (fc);
      const keys: string[] = [];
      let kc: string | null = null;
      do {
        const page = await kv.list({ prefix: `journal:${id}:`, limit: 200, cursor: kc ?? undefined });
        keys.push(...page.entries.map((e) => e.key));
        kc = page.nextCursor;
      } while (kc);
      // Keys sort chronologically (zero-padded ms) — drop the oldest beyond 200.
      for (const key of keys.sort().slice(0, Math.max(0, keys.length - 200))) {
        await kv.del(key);
        sweptKeys++;
      }
    }
    logs.debug("compost swept", { files: sweptFiles, journalEntries: sweptKeys });
  },
});
```

- [ ] **Step 4: Seeding**

`root/apps/greenhouse/src/seed.ts`:

```ts
import { files, kv, logs, tasks } from "@lodekit/sdk";
import {
  type CareKind,
  type CareState,
  type Plant,
  CARE_VERB,
  plants,
  parseEvery,
  padTs,
  stateKey,
  streakKey,
  countKey,
  snoozeKey,
  journalKey,
} from "./lib";

/** Deterministic SVG portrait — no binary assets, no network. Icon is stripped of
 *  markup-significant characters (it lands inside an SVG text node). */
export function portraitSvg(icon: string, seed: number): string {
  const safe = icon.replace(/[<>&"']/g, "");
  const hues = [150, 95, 200, 270, 25, 330];
  const hue = hues[Math.abs(seed) % hues.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="hsl(${hue} 45% 88%)"/>
  <circle cx="200" cy="170" r="110" fill="hsl(${hue} 50% 78%)"/>
  <text x="200" y="210" font-size="120" text-anchor="middle">${safe}</text>
</svg>`;
}

interface SeedPlant {
  plant: Omit<Plant, "adoptedAt">;
  daysAgo: number;
  streak: number;
  story: "overdue" | "dueSoon" | "fine" | "snoozed";
}

const SEEDS: SeedPlant[] = [
  {
    plant: {
      name: "Fernando",
      species: "Fiddle-leaf fig",
      icon: "🌿",
      personality: "Dramatic. Sheds a leaf to make a point.",
      care: { water: { every: "3d" }, feed: { every: "14d" }, mist: { every: "2d" } },
    },
    daysAgo: 120,
    streak: 0,
    story: "overdue",
  },
  {
    plant: {
      name: "Doris",
      species: "Golden barrel cactus",
      icon: "🌵",
      personality: "Unbothered. Thrives on neglect, mildly disappointed by attention.",
      care: { water: { every: "14d" }, feed: { every: "30d" } },
    },
    daysAgo: 400,
    streak: 3,
    story: "fine",
  },
  {
    plant: {
      name: "Priya",
      species: "Golden pothos",
      icon: "🪴",
      personality: "Overachiever. Will trellis your bookshelf without asking.",
      care: { water: { every: "5d" }, feed: { every: "21d" } },
    },
    daysAgo: 60,
    streak: 12,
    story: "dueSoon",
  },
  {
    plant: {
      name: "Bartholomew",
      species: "Boston fern",
      icon: "🌱",
      personality: "Anxious. Checks the humidity forecast twice a day.",
      care: { water: { every: "2d" }, feed: { every: "14d" }, mist: { every: "1d" } },
    },
    daysAgo: 30,
    streak: 1,
    story: "snoozed",
  },
];

/** Idempotent first-open seed (spec §8). Returns true when it seeded. */
export async function seedIfNeeded(): Promise<boolean> {
  if (await kv.has("seeded")) return false;
  const now = Date.now();
  for (const seed of SEEDS) {
    const adoptedAt = now - seed.daysAgo * 86_400_000;
    const { id } = await plants.add({ ...seed.plant, adoptedAt });
    await files.put(portraitSvg(seed.plant.icon, id), {
      slug: `cover-${id}`,
      contentType: "image/svg+xml",
      title: `${seed.plant.name}'s portrait`,
    });
    await files.put(portraitSvg(seed.plant.icon, id + 1), {
      slug: `photo-${id}-${padTs(adoptedAt)}`,
      contentType: "image/svg+xml",
      title: "Adoption day",
      metadata: { plantId: id },
    });
    const state: CareState = {};
    const backdated: { key: string; value: unknown }[] = [];
    for (const [kind, cfg] of Object.entries(seed.plant.care) as [CareKind, { every: string }][]) {
      const every = parseEvery(cfg.every);
      // Stagger due times per the seed's story: an overdue plant is past due, a
      // dueSoon plant comes due within hours, the rest are comfortably ahead.
      const dueAt =
        seed.story === "overdue"
          ? now - Math.floor(every / 2)
          : seed.story === "dueSoon"
            ? now + Math.floor(Math.min(every, 86_400_000) / 4)
            : now + every;
      const lastAt = dueAt - every;
      const reminderRunId = await tasks.enqueue(
        "care_reminder",
        { plantId: id, kind },
        { at: dueAt, dedupeKey: `${id}:${kind}` }
      );
      state[kind] = { lastAt, dueAt, reminderRunId };
      backdated.push({
        key: journalKey(id, lastAt),
        value: { at: lastAt, text: `${CARE_VERB[kind]} ${seed.plant.name}.` },
      });
    }
    backdated.push({
      key: journalKey(id, adoptedAt),
      value: { at: adoptedAt, text: `${seed.plant.name} joined the conservatory.` },
    });
    await kv.setMany([
      { key: stateKey(id), value: state },
      { key: streakKey(id), value: seed.streak },
      { key: countKey(id, "water"), value: Math.max(1, Math.floor(seed.daysAgo / 3)) },
      ...backdated,
    ]);
    if (seed.story === "snoozed") await kv.set(snoozeKey(id), true, { ttl: 86_400 });
  }
  await kv.set("seeded", { at: now, version: 1 });
  logs.info("conservatory seeded", { plants: SEEDS.length });
  return true;
}
```

- [ ] **Step 5: Care server functions**

`root/apps/greenhouse/src/care.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { kv, files, tasks, logs } from "@lodekit/sdk";
import {
  CARE_KINDS,
  CARE_VERB,
  type CareKind,
  type CareState,
  type Plant,
  plants,
  parseEvery,
  stateKey,
  streakKey,
  countKey,
  snoozeKey,
  journalPrefix,
  journalKey,
} from "./lib";
import { portraitSvg } from "./seed";

const kindSchema = z.enum(["water", "feed", "mist"]);
const careInput = z.object({ plantId: z.number().int(), kind: kindSchema });

async function requeueReminder(plantId: number, kind: CareKind, at: number): Promise<number> {
  return tasks.enqueue("care_reminder", { plantId, kind }, { at, dedupeKey: `${plantId}:${kind}` });
}

export const giveCare = createServerFn()
  .inputValidator(careInput)
  .handler(async ({ data }) => {
    const { plantId, kind } = data;
    const plant = await plants.get(plantId);
    if (!plant) throw new Error(`no plant ${plantId}`);
    const cfg = plant.care[kind];
    if (!cfg) throw new Error(`${plant.name} doesn't take "${kind}"`);
    const now = Date.now();
    const state = (await kv.get<CareState>(stateKey(plantId))) ?? {};
    const prev = state[kind];
    // Streak: on-time care extends it; late care restarts it at 1.
    if (prev && now > prev.dueAt) await kv.set(streakKey(plantId), 0);
    const streak = await kv.incr(streakKey(plantId));
    await kv.incr(countKey(plantId, kind));
    // One live reminder per plant+kind: drop the stale queued run, then requeue.
    if (prev?.reminderRunId != null) await tasks.cancel(prev.reminderRunId).catch(() => false);
    const dueAt = now + parseEvery(cfg.every);
    const reminderRunId = await requeueReminder(plantId, kind, dueAt);
    state[kind] = { lastAt: now, dueAt, reminderRunId };
    await kv.set(stateKey(plantId), state);
    await kv.del(snoozeKey(plantId));
    await kv.set(journalKey(plantId, now), { at: now, text: `${CARE_VERB[kind]} ${plant.name}.` });
    logs.info("care given", { plantId, kind, streak });
    return { dueAt, streak };
  });

const adoptInput = z.object({
  name: z.string().min(1).max(60),
  species: z.string().min(1).max(80),
  icon: z.string().min(1).max(8),
  personality: z.string().max(200).default(""),
  waterEvery: z.string(),
  feedEvery: z.string(),
  mistEvery: z.string().optional(),
});

export const adoptPlant = createServerFn()
  .inputValidator(adoptInput)
  .handler(async ({ data }) => {
    // Validate intervals before writing anything.
    parseEvery(data.waterEvery);
    parseEvery(data.feedEvery);
    if (data.mistEvery) parseEvery(data.mistEvery);
    const now = Date.now();
    const care: Plant["care"] = {
      water: { every: data.waterEvery },
      feed: { every: data.feedEvery },
    };
    if (data.mistEvery) care.mist = { every: data.mistEvery };
    const { id } = await plants.add({
      name: data.name,
      species: data.species,
      icon: data.icon,
      personality: data.personality,
      adoptedAt: now,
      care,
    });
    await files.put(portraitSvg(data.icon, id), {
      slug: `cover-${id}`,
      contentType: "image/svg+xml",
      title: `${data.name}'s portrait`,
    });
    const state: CareState = {};
    for (const kind of Object.keys(care) as CareKind[]) {
      const dueAt = now + parseEvery(care[kind]!.every);
      state[kind] = { lastAt: now, dueAt, reminderRunId: await requeueReminder(id, kind, dueAt) };
    }
    await kv.set(stateKey(id), state);
    await kv.set(journalKey(id, now), { at: now, text: `${data.name} joined the conservatory.` });
    logs.info("plant adopted", { plantId: id, name: data.name });
    return id;
  });

export const updateCare = createServerFn()
  .inputValidator(z.object({ plantId: z.number().int(), kind: kindSchema, every: z.string() }))
  .handler(async ({ data }) => {
    parseEvery(data.every);
    const plant = await plants.get(data.plantId);
    if (!plant) throw new Error("plant not found");
    plant.care[data.kind] = { every: data.every };
    await plants.set(data.plantId, plant);
    // Reschedule from lastAt under the new interval.
    const state = (await kv.get<CareState>(stateKey(data.plantId))) ?? {};
    const ks = state[data.kind];
    if (ks) {
      if (ks.reminderRunId != null) await tasks.cancel(ks.reminderRunId).catch(() => false);
      ks.dueAt = ks.lastAt + parseEvery(data.every);
      delete ks.dueSince;
      ks.reminderRunId = await requeueReminder(data.plantId, data.kind, ks.dueAt);
      await kv.set(stateKey(data.plantId), state);
    }
  });

export const snoozePlant = createServerFn()
  .inputValidator(z.object({ plantId: z.number().int(), hours: z.number().int().min(1).max(72) }))
  .handler(async ({ data }) => {
    // TTL key: while present the due badge hides; expiry brings it back by itself.
    await kv.set(snoozeKey(data.plantId), true, { ttl: data.hours * 3600 });
    logs.info("plant snoozed", { plantId: data.plantId, hours: data.hours });
  });

export const remindLater = createServerFn()
  .inputValidator(careInput)
  .handler(async ({ data }) => {
    const runId = await tasks.enqueue("care_reminder", data, {
      delay: "1h",
      dedupeKey: `${data.plantId}:${data.kind}:later`,
    });
    logs.info("reminder deferred an hour", { ...data, runId });
    return runId;
  });

export const skipNext = createServerFn()
  .inputValidator(careInput)
  .handler(async ({ data }) => {
    const state = (await kv.get<CareState>(stateKey(data.plantId))) ?? {};
    const ks = state[data.kind];
    if (!ks) return false;
    if (ks.reminderRunId != null) await tasks.cancel(ks.reminderRunId).catch(() => false);
    const plant = await plants.get(data.plantId);
    const cfg = plant?.care[data.kind];
    if (!cfg) return false;
    // Push the due time one interval out and queue the next reminder.
    ks.dueAt = ks.dueAt + parseEvery(cfg.every);
    delete ks.dueSince;
    ks.reminderRunId = await requeueReminder(data.plantId, data.kind, ks.dueAt);
    await kv.set(stateKey(data.plantId), state);
    logs.info("next care skipped", { plantId: data.plantId, kind: data.kind });
    return true;
  });

export const letGo = createServerFn()
  .inputValidator(z.object({ plantId: z.number().int() }))
  .handler(async ({ data }) => {
    const { plantId } = data;
    const plant = await plants.get(plantId);
    const state = (await kv.get<CareState>(stateKey(plantId))) ?? {};
    for (const ks of Object.values(state)) {
      if (ks?.reminderRunId != null) await tasks.cancel(ks.reminderRunId).catch(() => false);
    }
    await kv.del(stateKey(plantId));
    await kv.del(streakKey(plantId));
    await kv.del(snoozeKey(plantId));
    for (const kind of CARE_KINDS) await kv.del(countKey(plantId, kind));
    let cursor: string | null = null;
    do {
      const page = await kv.list({ prefix: journalPrefix(plantId), limit: 200, cursor: cursor ?? undefined });
      for (const e of page.entries) await kv.del(e.key);
      cursor = page.nextCursor;
    } while (cursor);
    for (const prefix of [`photo-${plantId}-`, `archive-${plantId}-`]) {
      let fc: string | null = null;
      do {
        const page = await files.list({ prefix, limit: 200, cursor: fc ?? undefined });
        for (const f of page.entries) await files.delete(f.slug);
        fc = page.nextCursor;
      } while (fc);
    }
    await files.delete(`cover-${plantId}`).catch(() => false);
    await plants.remove(plantId);
    logs.info("plant let go", { plantId, name: plant?.name });
  });
```

- [ ] **Step 6: Conservatory page**

`root/apps/greenhouse/src/routes/index.tsx`:

```tsx
import { useEffect, useState, type ChangeEvent } from "react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { kv, files } from "@lodekit/sdk";
import { Badge, Button, Card, CardContent, Input } from "@lodekit/ui";
import {
  CARE_KINDS,
  type CareState,
  moodFor,
  plants,
  stateKey,
  streakKey,
  snoozeKey,
} from "../lib";
import { seedIfNeeded } from "../seed";
import { adoptPlant } from "../care";

export const getConservatory = createServerFn().handler(async () => {
  await seedIfNeeded();
  const rows = await plants.all();
  const now = Date.now();
  const keys = rows.flatMap(({ id }) => [stateKey(id), streakKey(id), snoozeKey(id)]);
  const entries = keys.length ? await kv.getMany(keys) : [];
  const byKey = new Map(entries.map((e) => [e.key, e.value]));
  return rows.map(({ id, value: plant }) => {
    const state = (byKey.get(stateKey(id)) as CareState | undefined) ?? {};
    const streak = (byKey.get(streakKey(id)) as number | undefined) ?? 0;
    const snoozed = byKey.get(snoozeKey(id)) != null;
    const dueKinds = CARE_KINDS.filter((k) => plant.care[k] && state[k] && state[k]!.dueAt <= now);
    return { id, plant, streak, snoozed, dueKinds, mood: moodFor(plant, state, streak, now) };
  });
});

export const Route = createFileRoute("/")({
  loader: () => getConservatory(),
  component: Conservatory,
});

function Conservatory() {
  const cards = Route.useLoaderData();
  const router = useRouter();

  // useEffect (not module scope) keeps kv.watch off the SSR path — it's client-only.
  // NOTE: migrates to events.watch({type: "kv-store-change"}) when the events slice lands.
  useEffect(
    () => kv.watch("", () => void router.invalidate()),
    [router]
  );

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map(({ id, plant, streak, snoozed, dueKinds, mood }) => (
          <Card key={id}>
            <CardContent className="flex gap-4 p-4">
              <img
                src={files.url(`cover-${id}`)}
                alt={`${plant.name}'s portrait`}
                className="h-24 w-32 rounded-md object-cover"
              />
              <div className="min-w-0 space-y-1">
                <Link to="/plants/$plantId" params={{ plantId: String(id) }} className="font-medium">
                  {plant.icon} {plant.name}
                </Link>
                <p className="text-sm text-muted-foreground">{plant.species}</p>
                <p className="text-sm">
                  {mood.emoji} {plant.name} is {mood.label}
                </p>
                <div className="flex flex-wrap gap-1">
                  {snoozed ? (
                    <Badge variant="secondary">😴 snoozed</Badge>
                  ) : (
                    dueKinds.map((k) => (
                      <Badge key={k} variant="destructive">
                        {k} due
                      </Badge>
                    ))
                  )}
                  {streak > 0 && <Badge variant="secondary">🔥 {streak}</Badge>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <AdoptForm onAdopted={() => void router.invalidate()} />
    </main>
  );
}

function AdoptForm({ onAdopted }: { onAdopted: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    species: "",
    icon: "🪴",
    personality: "",
    waterEvery: "3d",
    feedEvery: "14d",
    mistEvery: "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  if (!open) return <Button onClick={() => setOpen(true)}>Adopt a plant</Button>;

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <p className="font-medium">New arrival</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input placeholder="Name (e.g. Fernando)" value={form.name} onChange={set("name")} />
          <Input placeholder="Species" value={form.species} onChange={set("species")} />
          <Input placeholder="Icon (emoji)" value={form.icon} onChange={set("icon")} />
          <Input placeholder="Personality (optional)" value={form.personality} onChange={set("personality")} />
          <Input placeholder='Water every (e.g. "3d")' value={form.waterEvery} onChange={set("waterEvery")} />
          <Input placeholder='Feed every (e.g. "14d")' value={form.feedEvery} onChange={set("feedEvery")} />
          <Input placeholder='Mist every (optional, e.g. "2d")' value={form.mistEvery} onChange={set("mistEvery")} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button
            onClick={async () => {
              try {
                setError(null);
                await adoptPlant({
                  data: {
                    name: form.name,
                    species: form.species,
                    icon: form.icon,
                    personality: form.personality,
                    waterEvery: form.waterEvery,
                    feedEvery: form.feedEvery,
                    mistEvery: form.mistEvery || undefined,
                  },
                });
                setOpen(false);
                onAdopted();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            Adopt
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 7: Smoke it**

Start the dev server (Global Constraints), poll `/greenhouse/` until built, then:

Run: `curl -s http://127.0.0.1:7788/greenhouse/ | grep -o 'Fernando' | head -1`
Expected: `Fernando` (seeding ran in the loader).

Run: `curl -s http://127.0.0.1:7788/api/apps/greenhouse/kv-store/seeded`
Expected: JSON with `"found":true`.

Run: `curl -s "http://127.0.0.1:7788/api/apps/greenhouse/tasks/runs?state=queued" | head -c 400`
Expected: a non-empty JSON array of queued `care_reminder` runs.

Note: `care_reminder` for Fernando (the overdue seed) has `at` in the past, so it runs immediately — that is intended (it marks the kind due and logs "care due").

Kill the dev server.

- [ ] **Step 8: Commit**

```bash
git add root/apps/greenhouse
git commit -m "feat(root): greenhouse showcase app — domain core, tasks, self-seeding, conservatory page"
```

---

### Task 4: Greenhouse — plant detail page

Spec §6–§7. Photo timeline (upload/cover/archive/delete/load-more), journal (paginated + add), care actions, snooze/remind-later/skip, schedule editing, let go.

**Files:**
- Create: `root/apps/greenhouse/src/routes/plants.$plantId.tsx`

**Interfaces:**
- Consumes: everything from Task 3's `lib.ts` and `care.ts` (exact names in Task 3's Interfaces block).
- Produces: route `/plants/$plantId`; server fn `getPlant({plantId})`.

- [ ] **Step 1: Write the route**

`root/apps/greenhouse/src/routes/plants.$plantId.tsx`:

```tsx
import { useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { kv, files, logs } from "@lodekit/sdk";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from "@lodekit/ui";
import {
  CARE_KINDS,
  type CareKind,
  type CareState,
  type JournalEntry,
  type Plant,
  moodFor,
  plants,
  padTs,
  stateKey,
  streakKey,
  countKey,
  snoozeKey,
  journalPrefix,
  journalKey,
} from "../lib";
import { giveCare, updateCare, snoozePlant, remindLater, skipNext, letGo } from "../care";

export const getPlant = createServerFn()
  .inputValidator(z.object({ plantId: z.number().int() }))
  .handler(async ({ data }) => {
    const plant = await plants.get(data.plantId);
    if (!plant) throw new Error("plant not found");
    const now = Date.now();
    const state = (await kv.get<CareState>(stateKey(data.plantId))) ?? {};
    const streak = (await kv.get<number>(streakKey(data.plantId))) ?? 0;
    const snoozed = await kv.has(snoozeKey(data.plantId));
    const counts: Partial<Record<CareKind, number>> = {};
    for (const kind of CARE_KINDS) {
      counts[kind] = (await kv.get<number>(countKey(data.plantId, kind))) ?? 0;
    }
    const photos = await files.list({ prefix: `photo-${data.plantId}-`, limit: 12 });
    const journal = await kv.list<JournalEntry>({ prefix: journalPrefix(data.plantId), limit: 10 });
    const cover = await files.stat(`cover-${data.plantId}`);
    return { plant, state, streak, snoozed, counts, photos, journal, cover, mood: moodFor(plant, state, streak, now) };
  });

export const Route = createFileRoute("/plants/$plantId")({
  loader: ({ params }) => getPlant({ data: { plantId: Number(params.plantId) } }),
  component: PlantPage,
});

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString();

function PlantPage() {
  const data = Route.useLoaderData();
  const { plantId } = Route.useParams();
  const id = Number(plantId);
  const router = useRouter();
  const { plant, state, streak, snoozed, counts, cover, mood } = data;
  const refresh = () => void router.invalidate();

  // NOTE: migrates to events.watch({type: "file-store-change"}) when the events slice lands.
  useEffect(() => files.watch(`photo-${id}-`, refresh), [id]);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4">
      <Card>
        <CardContent className="flex gap-4 p-4">
          {cover && (
            <img src={files.url(cover.slug)} alt={`${plant.name}'s portrait`} className="h-32 w-44 rounded-md object-cover" />
          )}
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">
              {plant.icon} {plant.name}
            </h1>
            <p className="text-sm text-muted-foreground">{plant.species}</p>
            {plant.personality && <p className="text-sm italic">{plant.personality}</p>}
            <p className="text-sm">
              {mood.emoji} {plant.name} is {mood.label}
            </p>
            <div className="flex gap-1">
              {snoozed && <Badge variant="secondary">😴 snoozed</Badge>}
              {streak > 0 && <Badge variant="secondary">🔥 {streak}-care streak</Badge>}
              <Badge variant="outline">with you since {fmtDate(plant.adoptedAt)}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <CareCard id={id} plant={plant} state={state} counts={counts} onChange={refresh} />
      <PhotoTimeline id={id} initial={data.photos} onChange={refresh} />
      <JournalCard id={id} initial={data.journal} />

      <Button
        variant="destructive"
        onClick={async () => {
          await letGo({ data: { plantId: id } });
          void router.navigate({ to: "/" });
        }}
      >
        Let {plant.name} go
      </Button>
    </main>
  );
}

function CareCard({
  id,
  plant,
  state,
  counts,
  onChange,
}: {
  id: number;
  plant: Plant;
  state: CareState;
  counts: Partial<Record<CareKind, number>>;
  onChange: () => void;
}) {
  const kinds = CARE_KINDS.filter((k) => plant.care[k]);
  const [editing, setEditing] = useState(false);
  const [every, setEvery] = useState<Record<string, string>>(
    Object.fromEntries(kinds.map((k) => [k, plant.care[k]!.every]))
  );
  const now = Date.now();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Care</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {kinds.map((kind) => {
          const ks = state[kind];
          const due = ks != null && ks.dueAt <= now;
          return (
            <div key={kind} className="flex flex-wrap items-center gap-2">
              <span className="w-16 capitalize">{kind}</span>
              <Button size="sm" onClick={async () => { await giveCare({ data: { plantId: id, kind } }); onChange(); }}>
                {kind === "water" ? "💧 Water" : kind === "feed" ? "🍽️ Feed" : "💨 Mist"} now
              </Button>
              <span className="text-sm text-muted-foreground">
                every {plant.care[kind]!.every}
                {ks && ` · ${due ? "due since" : "next"} ${fmtDate(ks.dueAt)}`}
                {` · ${counts[kind] ?? 0}× so far`}
              </span>
              {due && (
                <>
                  <Button size="sm" variant="secondary" onClick={async () => { await remindLater({ data: { plantId: id, kind } }); onChange(); }}>
                    Remind me in 1h
                  </Button>
                  <Button size="sm" variant="secondary" onClick={async () => { await skipNext({ data: { plantId: id, kind } }); onChange(); }}>
                    Skip this one
                  </Button>
                </>
              )}
              {editing && (
                <Input
                  className="w-24"
                  value={every[kind]}
                  onChange={(e) => setEvery((m) => ({ ...m, [kind]: e.target.value }))}
                />
              )}
            </div>
          );
        })}
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={async () => { await snoozePlant({ data: { plantId: id, hours: 24 } }); onChange(); }}>
            😴 Snooze reminders for a day
          </Button>
          {editing ? (
            <Button
              size="sm"
              onClick={async () => {
                for (const kind of kinds) {
                  if (every[kind] !== plant.care[kind]!.every) {
                    await updateCare({ data: { plantId: id, kind, every: every[kind] } });
                  }
                }
                setEditing(false);
                onChange();
              }}
            >
              Save schedule
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit schedule
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PhotoTimeline({
  id,
  initial,
  onChange,
}: {
  id: number;
  initial: Awaited<ReturnType<typeof files.list>>;
  onChange: () => void;
}) {
  const [entries, setEntries] = useState(initial.entries);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [caption, setCaption] = useState("");
  useEffect(() => {
    setEntries(initial.entries);
    setCursor(initial.nextCursor);
  }, [initial]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Photo timeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="w-56" placeholder="Caption (optional)" value={caption} onChange={(e) => setCaption(e.target.value)} />
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                await files.put(file, {
                  slug: `photo-${id}-${padTs(Date.now())}`,
                  title: caption || file.name,
                  contentType: file.type || "application/octet-stream",
                  metadata: { plantId: id },
                });
                setCaption("");
                onChange();
              } catch (err) {
                logs.error("photo upload failed", { plantId: id, error: String(err) });
              } finally {
                e.target.value = "";
              }
            }}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {entries.map((f) => (
            <figure key={f.slug} className="space-y-1">
              <img src={files.url(f.slug)} alt={f.title ?? f.slug} className="aspect-[4/3] w-full rounded-md object-cover" />
              <figcaption className="text-xs text-muted-foreground">
                {f.title ?? "Untitled"} · {fmtDate(f.createdAt)} · {(f.size / 1024).toFixed(1)} KB
              </figcaption>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={async () => { await files.copy(f.slug, `cover-${id}`); onChange(); }}>
                  Set cover
                </Button>
                <Button size="sm" variant="outline" onClick={async () => { await files.move(f.slug, f.slug.replace(`photo-${id}-`, `archive-${id}-`)); onChange(); }}>
                  Archive
                </Button>
                <Button size="sm" variant="outline" onClick={async () => { await files.delete(f.slug); onChange(); }}>
                  Delete
                </Button>
              </div>
            </figure>
          ))}
        </div>
        {entries.length === 0 && <p className="text-sm text-muted-foreground">No photos yet — add the first one.</p>}
        {cursor && (
          <Button
            variant="secondary"
            onClick={async () => {
              const page = await files.list({ prefix: `photo-${id}-`, limit: 12, cursor });
              setEntries((cur) => [...cur, ...page.entries]);
              setCursor(page.nextCursor);
            }}
          >
            Load more
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function JournalCard({
  id,
  initial,
}: {
  id: number;
  initial: { entries: { key: string; value: JournalEntry }[]; nextCursor: string | null };
}) {
  const [entries, setEntries] = useState(initial.entries);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [text, setText] = useState("");
  useEffect(() => {
    setEntries(initial.entries);
    setCursor(initial.nextCursor);
  }, [initial]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Journal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder="A note for the record…" value={text} onChange={(e) => setText(e.target.value)} />
          <Button
            onClick={async () => {
              if (!text.trim()) return;
              const at = Date.now();
              await kv.set(journalKey(id, at), { at, text: text.trim() });
              setEntries((cur) => [...cur, { key: journalKey(id, at), value: { at, text: text.trim() } }]);
              setText("");
            }}
          >
            Add
          </Button>
        </div>
        <ul className="space-y-1 text-sm">
          {[...entries].reverse().map((e) => (
            <li key={e.key}>
              <span className="text-muted-foreground">{fmtDate(e.value.at)}</span> — {e.value.text}
            </li>
          ))}
        </ul>
        {cursor && (
          <Button
            variant="secondary"
            onClick={async () => {
              const page = await kv.list<JournalEntry>({ prefix: journalPrefix(id), limit: 10, cursor });
              setEntries((cur) => [...cur, ...page.entries]);
              setCursor(page.nextCursor);
            }}
          >
            Load more
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Smoke it**

Start the dev server, poll `/greenhouse/` until built (that also seeds), then:

Run: `curl -s http://127.0.0.1:7788/greenhouse/plants/1 | grep -oE 'Water now|plant not found' | head -1`
Expected: `Water now` (plant 1 exists from seeding; SSR renders the care card).

Kill the dev server.

- [ ] **Step 3: Commit**

```bash
git add root/apps/greenhouse/src/routes/plants.\$plantId.tsx
git commit -m "feat(greenhouse): plant detail — photo timeline, journal, care actions, schedule editing"
```

---

### Task 5: Greenhouse — Almanac page

Spec §4/§7: care history (`tasks.runs` with filter chips), upcoming care (queued runs, cancel), registered-task manifest (`tasks.list`), live indicator (`tasks.watch`).

**Files:**
- Create: `root/apps/greenhouse/src/routes/almanac.tsx`

**Interfaces:**
- Consumes: `tasks` handle from `@lodekit/sdk` only.
- Produces: route `/almanac`; page contains the literal heading `Almanac` (Task 7's e2e asserts it).

- [ ] **Step 1: Write the route**

`root/apps/greenhouse/src/routes/almanac.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { tasks, type TaskInfo, type TaskRun, type TaskRunState } from "@lodekit/sdk";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@lodekit/ui";

export const getAlmanac = createServerFn().handler(async () => ({
  defs: await tasks.list(),
  runs: await tasks.runs({ limit: 50 }),
}));

export const Route = createFileRoute("/almanac")({
  loader: () => getAlmanac(),
  component: Almanac,
});

const STATES: TaskRunState[] = ["queued", "running", "succeeded", "failed", "canceled"];
const fmt = (ms: number | null) => (ms == null ? "—" : new Date(ms).toLocaleString());

function Almanac() {
  const initial = Route.useLoaderData();
  const [runs, setRuns] = useState<TaskRun[]>(initial.runs);
  const [defs] = useState<TaskInfo[]>(initial.defs);
  const [state, setState] = useState<TaskRunState | "all">("all");
  const [task, setTask] = useState<string | "all">("all");
  const [live, setLive] = useState(false);

  const refetch = useCallback(async () => {
    setRuns(
      await tasks.runs({
        limit: 50,
        ...(state !== "all" ? { state } : {}),
        ...(task !== "all" ? { task } : {}),
      })
    );
  }, [state, task]);

  useEffect(() => void refetch(), [refetch]);
  useEffect(
    () =>
      tasks.watch((change) => {
        setLive(change.state === "running");
        void refetch();
      }),
    [refetch]
  );

  const upcoming = runs.filter((r) => r.state === "queued").sort((a, b) => a.notBefore - b.notBefore);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">
        Almanac {live && <Badge>🌀 rounds in progress…</Badge>}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming care</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 && <p className="text-sm text-muted-foreground">Nothing queued — the conservatory rests.</p>}
          {upcoming.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-sm">
              <Badge variant="outline">{r.task}</Badge>
              <span>{fmt(r.notBefore)}</span>
              <span className="text-muted-foreground">{JSON.stringify(r.payload)}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await tasks.cancel(r.id).catch(() => false);
                  void refetch();
                }}
              >
                Cancel
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Care history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant={state === "all" ? "default" : "outline"} onClick={() => setState("all")}>
              all
            </Button>
            {STATES.map((s) => (
              <Button key={s} size="sm" variant={state === s ? "default" : "outline"} onClick={() => setState(s)}>
                {s}
              </Button>
            ))}
            <span className="mx-2" />
            <Button size="sm" variant={task === "all" ? "default" : "outline"} onClick={() => setTask("all")}>
              every task
            </Button>
            {defs.map((d) => (
              <Button key={d.name} size="sm" variant={task === d.name ? "default" : "outline"} onClick={() => setTask(d.name)}>
                {d.name}
              </Button>
            ))}
          </div>
          <ul className="space-y-1 text-sm">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={r.state === "failed" ? "destructive" : r.state === "succeeded" ? "secondary" : "outline"}
                >
                  {r.state}
                </Badge>
                <span className="font-medium">{r.task}</span>
                <span className="text-muted-foreground">
                  {r.source} · attempt {r.attempt} · {fmt(r.finishedAt ?? r.startedAt ?? r.createdAt)}
                  {r.durationMs != null && ` · ${r.durationMs}ms`}
                </span>
                {r.error && <span className="text-destructive">{r.error}</span>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>The rota</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {defs.map((d) => (
              <li key={d.name} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{d.name}</span>
                <span className="text-muted-foreground">
                  {d.schedule ? `${d.schedule.kind}: ${d.schedule.expr}` : "on demand"} · next {fmt(d.nextRun)}
                  {d.lastRun && ` · last ${d.lastRun.state}`}
                </span>
                {d.error && <span className="text-destructive">{d.error}</span>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Smoke it**

Start the dev server, poll `/greenhouse/` until built, then:

Run: `curl -s http://127.0.0.1:7788/greenhouse/almanac | grep -oE 'Almanac|Upcoming care' | sort -u`
Expected: both strings present.

Kill the dev server.

- [ ] **Step 3: Commit**

```bash
git add root/apps/greenhouse/src/routes/almanac.tsx
git commit -m "feat(greenhouse): almanac — run history with filters, upcoming care, task rota, live watch"
```

---

### Task 6: Greenhouse — Potting Shed page

Spec §7 item 5 + §6: reset/reseed, snapshot export (`files.put` + `ttl`, `files.url({download:true})`), log demo row, SDK-exercises corner (empty at launch).

**Files:**
- Create: `root/apps/greenhouse/src/routes/shed.tsx`

**Interfaces:**
- Consumes: `seedIfNeeded` from `../seed`; `plants`, `stateKey`, `streakKey` from `../lib`.
- Produces: route `/shed`; server fns `resetConservatory()`, `exportSnapshot()`.

- [ ] **Step 1: Write the route**

`root/apps/greenhouse/src/routes/shed.tsx`:

```tsx
import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { kv, files, tasks, logs } from "@lodekit/sdk";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@lodekit/ui";
import { plants, stateKey, streakKey } from "../lib";
import { seedIfNeeded } from "../seed";

export const resetConservatory = createServerFn().handler(async () => {
  // Cancel anything queued so reseeded reminders don't collide with stale ones.
  for (const run of await tasks.runs({ state: "queued", limit: 1000 })) {
    await tasks.cancel(run.id).catch(() => false);
  }
  for (const { id } of await plants.all()) await plants.remove(id);
  let cursor: string | null = null;
  do {
    const page = await kv.list({ limit: 200, cursor: cursor ?? undefined });
    for (const e of page.entries) await kv.del(e.key);
    cursor = page.nextCursor;
  } while (cursor);
  let fc: string | null = null;
  do {
    const page = await files.list({ limit: 200, cursor: fc ?? undefined });
    for (const f of page.entries) await files.delete(f.slug);
    fc = page.nextCursor;
  } while (fc);
  logs.warn("conservatory reset", {});
  await seedIfNeeded();
});

export const exportSnapshot = createServerFn().handler(async () => {
  const rows = await plants.all();
  const keys = rows.flatMap(({ id }) => [stateKey(id), streakKey(id)]);
  const entries = keys.length ? await kv.getMany(keys) : [];
  const stat = await files.put(
    JSON.stringify({ exportedAt: Date.now(), plants: rows, care: entries }, null, 2),
    {
      slug: `snapshot-${Date.now()}`,
      contentType: "application/json",
      title: "Conservatory snapshot",
      ttl: 3600, // self-expires in an hour — a temporary export, not a record
    }
  );
  logs.info("snapshot exported", { slug: stat.slug });
  return stat.slug;
});

export const Route = createFileRoute("/shed")({
  component: Shed,
});

function Shed() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(null);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">The Potting Shed</h1>
      <p className="text-sm text-muted-foreground">
        Tools and rummage. Everything in here is honest utility — and a plain look at the
        SDK underneath the conservatory.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Start over</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Clears every plant, photo, journal, and queued reminder, then reseeds the demo
            conservatory.
          </p>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await resetConservatory();
                void router.invalidate();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Repotting…" : "Reset & reseed"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Share a snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Exports the conservatory as JSON. The file self-expires in an hour.
          </p>
          <Button
            onClick={async () => {
              setSnapshot(await exportSnapshot());
            }}
          >
            Export snapshot
          </Button>
          {snapshot && (
            <p className="text-sm">
              <a className="underline" href={files.url(snapshot, { download: true })} download>
                Download {snapshot}
              </a>{" "}
              (expires in an hour)
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test the log pipes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Each button emits one record at that level — watch them arrive in the
            dashboard&apos;s Logs view.
          </p>
          <div className="flex gap-2">
            {(["debug", "info", "warn", "error"] as const).map((level) => (
              <Button
                key={level}
                variant="outline"
                size="sm"
                onClick={() => logs[level](`shed test log (${level})`, { from: "potting-shed" })}
              >
                {level}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SDK exercises</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Reserved for SDK methods that lose their natural home as the platform grows.
            Currently empty — every method has a real feature (see <code>root/readme.md</code>).
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Smoke it**

Start the dev server, poll `/greenhouse/` until built, then:

Run: `curl -s http://127.0.0.1:7788/greenhouse/shed | grep -oE 'Potting Shed|Reset & reseed|snapshot' | sort -u`
Expected: all three strings present (the `&` renders as `&amp;` in HTML — grep for `Reset` alone if needed).

Kill the dev server.

- [ ] **Step 3: Commit**

```bash
git add root/apps/greenhouse/src/routes/shed.tsx
git commit -m "feat(greenhouse): potting shed — reset/reseed, ttl snapshot export, log demo, exercises corner"
```

---

### Task 7: e2e migration + delete the old example apps

Spec §12–§13. Rewrite the runtime e2e around the new apps (multi-app + multi-route + seeding smoke), then delete habit-tracker and expense-tracker. Update `manager/smoke.md`.

**Files:**
- Modify: `packages/runtime/tests/e2e.test.ts`
- Delete: `root/apps/habit-tracker/`, `root/apps/expense-tracker/`
- Modify: `manager/smoke.md` (the step that copies `examples/apps/habit-tracker`)

**Interfaces:**
- Consumes: `/greenhouse/` SSR contains `Fernando`; `/greenhouse/almanac` contains `Almanac`; `/welcome/` contains `Welcome to Lodekit` and `<span id="visit-count">N</span>`; kv API `GET /api/apps/greenhouse/kv-store/seeded` → `{found: true, ...}`; tasks API `GET /api/apps/greenhouse/tasks/runs?state=queued` → JSON array.

- [ ] **Step 1: Rewrite the example-app blocks in the e2e**

In `packages/runtime/tests/e2e.test.ts`, replace the two example-app `copyDir` calls in `beforeEach` with:

```ts
  copyDir(
    path.join(__dirname, "../../../root/apps/greenhouse"),
    path.join(root, "apps", "greenhouse")
  );
  copyDir(
    path.join(__dirname, "../../../root/apps/welcome"),
    path.join(root, "apps", "welcome")
  );
```

and the two `waitReady` calls with:

```ts
  await waitReady(base, "greenhouse", 60000);
  await waitReady(base, "welcome", 60000);
```

Replace the whole `describe("example apps e2e (Start)", ...)` block with:

```ts
describe("showcase apps e2e (Start)", () => {
  it("greenhouse / is server-rendered with seeded content, and is registered", async () => {
    const list = await (await fetch(base + "/api/apps")).json();
    expect(list.map((a: { appId: string }) => a.appId)).toContain("greenhouse");
    const html = await (await fetch(base + "/greenhouse/")).text();
    // SSR'd: the loader seeds on first fetch and renders the demo plants.
    expect(html).toContain("Fernando");
    expect(html).toContain("Conservatory");
  }, 45000);

  it("greenhouse seeding wrote the flag and queued care reminders", async () => {
    await (await fetch(base + "/greenhouse/")).text(); // ensure the loader ran
    const seeded = await (await fetch(base + "/api/apps/greenhouse/kv-store/seeded")).json();
    expect(seeded.found).toBe(true);
    const runs = await (
      await fetch(base + "/api/apps/greenhouse/tasks/runs?state=queued")
    ).json();
    expect(Array.isArray(runs)).toBe(true);
    expect(runs.length).toBeGreaterThan(0);
  }, 45000);

  it("greenhouse /almanac is a working deep link (multi-route)", async () => {
    const res = await fetch(base + "/greenhouse/almanac");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Almanac");
  }, 45000);

  it("emits app-prefixed /_build/ asset URLs that resolve as written in the shell", async () => {
    const html = await (await fetch(base + "/greenhouse/")).text();
    const src = html.match(/src="([^"]+\.js)"/)?.[1];
    expect(src).toBeTruthy();
    expect(src!.startsWith("/greenhouse/_build/")).toBe(true);
    expect((await fetch(base + src!)).status).toBe(200);
  }, 45000);

  it("welcome / is server-rendered and its visit counter increments across fetches", async () => {
    const countOf = async () => {
      const html = await (await fetch(base + "/welcome/")).text();
      const m = html.match(/id="visit-count">(\d+)</);
      if (!m) throw new Error(`visit count not found in page: ${html.slice(0, 300)}`);
      return Number(m[1]);
    };
    const html = await (await fetch(base + "/welcome/")).text();
    expect(html).toContain("Welcome to Lodekit");
    const first = await countOf();
    const second = await countOf();
    expect(second).toBe(first + 1);
  }, 45000);
});
```

Keep the `app worker loopback round-trip` describe block and the `start-app` fixture copy exactly as they are.

- [ ] **Step 2: Run the e2e**

Run: `pnpm --filter @lodekit/runtime test -- --run tests/e2e.test.ts`
Expected: PASS. If the seeded-content assertion flakes because seeding raced the first fetch, note that `waitReady` polls `/greenhouse/` — by the time it returns built HTML, the loader (and seed) already ran; a genuine failure here is a bug to investigate, not to paper over.

- [ ] **Step 3: Delete the old apps and update the smoke doc**

```bash
git rm -r root/apps/habit-tracker root/apps/expense-tracker
```

In `manager/smoke.md`, update the step that copies `examples/apps/habit-tracker` to copy `root/apps/greenhouse` instead, and adjust any expected-content wording in that step (it should expect the Greenhouse conservatory page, e.g. "Fernando", rather than habits).

- [ ] **Step 4: Full test sweep**

Run: `pnpm test`
Expected: PASS across `@lodekit/runtime`, `@lodekit/sdk`, `@lodekit/manager`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(root): e2e covers greenhouse + welcome; delete habit-tracker and expense-tracker"
```

---

### Task 8: Manager first-run install

Spec §10. The packaged manager copies the bundled showcase apps into a freshly created Lodekit root — first run only, never clobbering. Deleting them later must leave a working empty platform (that's the existing behavior for an empty root; the copy is strictly additive on create).

**Files:**
- Create: `manager/src/firstRun.js`
- Create: `manager/tests/first-run.test.js`
- Modify: `manager/src/paths.js` (add `showcaseAppsDir` in packaged mode)
- Modify: `manager/src/main.js` (`ensureLodekitRoot`)
- Modify: `manager/scripts/prepare-bundle.mjs` (copy `root/apps` into the payload)
- Modify: `manager/tests/paths.test.js` (assert the new path)

**Interfaces:**
- Produces: `installShowcase(showcaseAppsDir, lodekitRoot)` — copies each app dir under `showcaseAppsDir` into `<lodekitRoot>/apps/`, skipping any that already exist; returns the list of app ids installed. `paths.showcaseAppsDir` — packaged: `<resourcesPath>/platform/root/apps`; dev: `null` (the dev root already *is* `root/`).

- [ ] **Step 1: Write the failing test**

`manager/tests/first-run.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installShowcase } from "../src/firstRun.js";

let src, root;
beforeEach(() => {
  src = fs.mkdtempSync(path.join(os.tmpdir(), "lk-showcase-src-"));
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-showcase-root-"));
  fs.mkdirSync(path.join(root, "apps"), { recursive: true });
  for (const app of ["greenhouse", "welcome"]) {
    fs.mkdirSync(path.join(src, app, "src"), { recursive: true });
    fs.writeFileSync(path.join(src, app, "manifest.json"), JSON.stringify({ appId: app }));
    fs.writeFileSync(path.join(src, app, "src", "router.tsx"), "// app source\n");
  }
});
afterEach(() => {
  fs.rmSync(src, { recursive: true, force: true });
  fs.rmSync(root, { recursive: true, force: true });
});

describe("installShowcase", () => {
  it("copies every bundled app into the root's apps/", () => {
    const installed = installShowcase(src, root);
    expect(installed.sort()).toEqual(["greenhouse", "welcome"]);
    expect(fs.existsSync(path.join(root, "apps", "greenhouse", "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "apps", "welcome", "src", "router.tsx"))).toBe(true);
  });

  it("never clobbers an existing app dir", () => {
    fs.mkdirSync(path.join(root, "apps", "greenhouse"), { recursive: true });
    fs.writeFileSync(path.join(root, "apps", "greenhouse", "manifest.json"), '{"mine":true}');
    const installed = installShowcase(src, root);
    expect(installed).toEqual(["welcome"]);
    expect(fs.readFileSync(path.join(root, "apps", "greenhouse", "manifest.json"), "utf8")).toBe('{"mine":true}');
  });

  it("is a no-op when the showcase dir is missing", () => {
    expect(installShowcase(path.join(src, "nope"), root)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @lodekit/manager test -- --run tests/first-run.test.js`
Expected: FAIL — cannot find module `../src/firstRun`.

- [ ] **Step 3: Implement**

`manager/src/firstRun.js`:

```js
"use strict";
const fs = require("node:fs");
const path = require("node:path");

// First-run showcase install (showcase-apps spec §10): copy each bundled app into the
// root's apps/ — additive only, existing dirs are the person's and are never touched.
function installShowcase(showcaseAppsDir, lodekitRoot) {
  if (!showcaseAppsDir || !fs.existsSync(showcaseAppsDir)) return [];
  const installed = [];
  for (const entry of fs.readdirSync(showcaseAppsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dst = path.join(lodekitRoot, "apps", entry.name);
    if (fs.existsSync(dst)) continue;
    fs.cpSync(path.join(showcaseAppsDir, entry.name), dst, { recursive: true });
    installed.push(entry.name);
  }
  return installed;
}

module.exports = { installShowcase };
```

In `manager/src/paths.js`, add to the **packaged** return object (after `mcpEntry`):

```js
      showcaseAppsDir: path.join(platformDir, "root", "apps"),
```

and to the **dev** return object:

```js
    showcaseAppsDir: null,
```

In `manager/src/main.js`, extend `ensureLodekitRoot` (requires `installShowcase` at the top of the file next to the other requires: `const { installShowcase } = require("./firstRun");`):

```js
// Returns true when this launch created the root (= first run).
function ensureLodekitRoot() {
  const isFirstRun = !fs.existsSync(paths.lodekitRoot);
  fs.mkdirSync(path.join(paths.lodekitRoot, "apps"), { recursive: true });
  fs.mkdirSync(path.join(paths.lodekitRoot, "data"), { recursive: true });
  if (isFirstRun) {
    const installed = installShowcase(paths.showcaseAppsDir, paths.lodekitRoot);
    if (installed.length) log(`first run: installed showcase apps ${installed.join(", ")}`);
  }
  return isFirstRun;
}
```

In `manager/tests/paths.test.js`, add assertions to the existing packaged- and dev-mode tests:

```js
    // packaged-mode test:
    expect(p.showcaseAppsDir).toBe("/res/platform/root/apps");
```
```js
    // dev-mode test:
    expect(p.showcaseAppsDir).toBe(null);
```
(Adjust `/res` to whatever `resourcesPath` value that test already passes.)

In `manager/scripts/prepare-bundle.mjs`, at the end of `buildPayload()` (after the build-info stamping loop), add:

```js
  // The shipped Lodekit root's apps (showcase-apps spec §10): installed into
  // ~/Documents/Lodekit/apps on the manager's first run.
  fs.cpSync(path.join(repoRoot, "root", "apps"), path.join(platformDir, "root", "apps"), {
    recursive: true,
    filter: (src) => !src.includes("node_modules") && !src.endsWith("routeTree.gen.ts"),
  });
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @lodekit/manager test`
Expected: PASS (first-run, paths, and the pre-existing suites).

- [ ] **Step 5: Commit**

```bash
git add manager/src/firstRun.js manager/tests/first-run.test.js manager/src/paths.js manager/src/main.js manager/scripts/prepare-bundle.mjs manager/tests/paths.test.js
git commit -m "feat(manager): install showcase apps into a fresh Lodekit root on first run"
```

---

### Task 9: Docs & bookkeeping

Spec §13. The living coverage checklist, CLAUDE.md, context.md terms, the superseded note, roadmap entries.

**Files:**
- Create: `root/readme.md`
- Modify: `CLAUDE.md` (root/ bullet + DoD line)
- Modify: `context.md` (Showcase app, Welcome app terms)
- Modify: `docs/specs/2026-06-30-habit-tracker-design.md` (superseded note)
- Modify: `roadmap.md` (three entries)

**Interfaces:** none — documentation only.

- [ ] **Step 1: Write `root/readme.md`**

```markdown
# The Lodekit root

This directory is the checked-in Lodekit root: the runtime serves it in dev
(`LODEKIT_ROOT=./root`), and the packaged manager installs `apps/` into
`~/Documents/Lodekit/apps` on first run. Deleting any of these apps from your own root is
fine — an empty root is a fully supported state.

- **`apps/greenhouse`** — the showcase app and permanent smoke-testing ground: a houseplant
  conservatory where plants are characters. Spec:
  `docs/specs/2026-07-07-showcase-apps-design.md`.
- **`apps/welcome`** — orientation: what Lodekit is, plus one live element (a kv visit
  counter). Grows into the guided first-time experience later.
- **`theme.css`** — the root-level global theme example; `apps/greenhouse/theme.css` shows
  the per-app layer that wins over it.

## Definition of done

A new SDK or runtime capability is **not done** until Greenhouse exercises it. This table
is the living checklist — extend it with every new surface.

| Surface | Home in Greenhouse |
| --- | --- |
| `kv.get` / `set` / `del` / `has` | care state, snooze clear, seed flag |
| `kv.set {ttl}` | snooze (expiry = reminder returns) |
| `kv.incr` | streaks, lifetime care counters, Welcome's visit counter |
| `kv.getMany` | conservatory grid state fan-in, snapshot export |
| `kv.setMany` | seeding |
| `kv.list {prefix, cursor}` | journal pagination; compost sweep; reset |
| `kv.collection` (all 5 ops) | plant records CRUD |
| `kv.watch` | conservatory live refresh *(migrates to `events.watch` when events lands)* |
| `files.put {title, metadata, contentType}` | photo upload with caption |
| `files.put {ttl}` | self-expiring snapshot export |
| `files.put` (server-side) | seeded SVG portraits |
| `files.get` / `url` / `url {download}` / `stat` / `delete` | photo display & management, export download |
| `files.list {prefix, cursor}` | timeline "load more", compost sweep, reset |
| `files.copy` | set cover photo |
| `files.move` | archive photo |
| `files.watch` | photo timeline live refresh *(migrates to `events.watch` when events lands)* |
| `tasks.enqueue {at, dedupeKey}` | care reminders |
| `tasks.enqueue {delay}` | remind me in an hour |
| `tasks.cancel` | skip next / re-care / reset |
| `tasks.runs {task, state, limit}` | almanac care history |
| `tasks.list` | almanac rota |
| `tasks.watch` | almanac live indicator |
| `task() cron` + `catchUp: true` | morning_rounds |
| `task() every` | compost_sweep |
| `logs.debug` / `info` / `warn` / `error` | compost sweep / care & seed / wilting & reset / upload failures + Shed demo row |
| `appId` export, `@lodekit/ui`, `theme.css` | throughout |

**Pending (events slice, spec §5):** `events.emit` (client+server, `{ttl}`), `events.list`
(`before`/`after`/server-side), `events.watch` (string + array types), the Ledger, While
You Were Away, `weekly_gazette` (`cron` + `catchUp: "24h"` + `retries`/`timeout`), and the
kv/files watch migration.
```

- [ ] **Step 2: CLAUDE.md**

Replace the `root/` bullet (rewritten in Task 1) with:

```markdown
- **`root/`** — the checked-in Lodekit root: the Greenhouse showcase app (the SDK's
  smoke-testing ground — see `root/readme.md` for the definition-of-done convention) and
  the Welcome app. Used in dev via `LODEKIT_ROOT=./root`; the packaged manager installs
  its apps into a fresh `~/Documents/Lodekit` on first run.
```

Add one line to the **Conventions** section:

```markdown
- **Definition of done:** a new SDK/runtime capability is not done until the Greenhouse
  showcase app exercises it (`root/readme.md` holds the living coverage checklist).
```

- [ ] **Step 3: context.md terms**

Add two entries following the file's existing term format (read a neighboring entry first
and match its structure exactly):

> **Showcase app**: The Greenhouse app in the checked-in root (`root/apps/greenhouse`) —
> the SDK showcase and permanent smoke-testing ground, shipped by the manager on first
> run. Definition-of-done: new SDK/runtime capability isn't done until Greenhouse
> exercises it. _Avoid_: example app, demo app, sample app

> **Welcome app**: The orientation app in the checked-in root (`root/apps/welcome`) —
> deliberately tiny (one page, one `kv.incr` counter); reserved to become the guided
> first-time experience. _Avoid_: FTUX app (until it is one)

- [ ] **Step 4: Superseded note + roadmap**

At the top of `docs/specs/2026-06-30-habit-tracker-design.md`, directly under the title,
add:

```markdown
> **Superseded** by `2026-07-07-showcase-apps-design.md` — the example apps were replaced
> by the Greenhouse and Welcome showcase apps. Kept as history.
```

In `roadmap.md`, add (matching the file's existing entry style):

- **Welcome → guided FTUX**: grow `root/apps/welcome` into the interactive first-time
  experience teaching the high-level concepts (showcase-apps spec §9).
- **Showcase update on manager update**: first-run install never clobbers a person's
  copy; an "update showcase apps" story belongs with auto-update (showcase-apps spec §10).
- **Greenhouse integrations chapter**: when the integrations layer lands, weather-aware
  watering is the first integration demo (showcase-apps spec §13).

Also, per spec §13: the events plan's example-migration step (on `stack`) retargets to
Greenhouse — that edit happens on the `stack` branch when events lands, not here; note it
in the roadmap entry for events if one exists, otherwise skip.

- [ ] **Step 5: Full check + commit**

Run: `pnpm test`
Expected: PASS.

```bash
git add root/readme.md CLAUDE.md context.md docs/specs/2026-06-30-habit-tracker-design.md roadmap.md
git commit -m "docs: showcase apps bookkeeping — coverage checklist, DoD convention, terms, roadmap"
```

---

## Part 2 (gated — do NOT execute in this plan)

Blocked on the events slice (`docs/specs/2026-07-07-events-design.md`, `stack` branch)
landing. When it does, write a follow-up plan covering (spec §5, §11):

1. Watch migration: `kv.watch`/`files.watch` calls in `index.tsx` and `plants.$plantId.tsx`
   become `events.watch({type: "kv-store-change" | "file-store-change"})` (both call sites
   carry `NOTE:` comments).
2. Event emissions: `care-given`/`plant-adopted`/`plant-departed` (client), `care-due`
   (+ per-emission `ttl`), `rounds-completed` (server, from tasks).
3. The Ledger tab in the Almanac (`events.list({before})` + `events.watch` with a type array).
4. While You Were Away (`feed:last-seen` offset + `events.list({after})`).
5. `weekly_gazette` task (`cron: "0 18 * * 0"`, `catchUp: "24h"`, `retries: 1`,
   `timeout: "1m"`; server-side `events.list` + `files.put` to `gazette-<iso-week>`) and the
   `/gazette` route.
6. Move the pending rows of `root/readme.md`'s coverage table into the main table.
