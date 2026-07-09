# Dashboard UI Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the dashboard around a shared app shell (floating header with logo / command bar / services menu / settings), simplified app cards, stub Data/Tasks pages, one shared SSE connection, and a redesigned settings page — per `docs/specs/2026-07-09-dashboard-ui-revamp-design.md`.

**Architecture:** All UI lives in `packages/runtime/dashboard/` (TanStack Start + React 19 + `@lodekit/ui` shadcn components + Tailwind 4). The root route (`__root.tsx`) renders the shell; shared pieces go in a new `dashboard/src/components/` directory. One runtime-side change: the `"App hosting"` settings section is renamed `"Engine"`.

**Tech Stack:** React 19, TanStack Router/Start/Query, `@lodekit/ui` (shadcn), `lucide-react`, Tailwind 4, vitest (runtime tests).

## Global Constraints

- Work on the **`ui` branch** of this worktree. Commit to `ui`; **never fold into `master`** (person's call — CLAUDE.md).
- No `Co-Authored-By` trailers in commit messages.
- Package manager is **pnpm**, from the repo root. Runtime is buildless (`tsx`); the dashboard is built by the runtime's own Vite pipeline.
- **There is no component-test infra for the dashboard and Vite strips (does not check) types.** The compile gate for dashboard changes is the real build:
  `pnpm --filter @lodekit/runtime test tests/dashboard.test.ts`
  (builds the dashboard through the Start pipeline; ~2–3 min). Run it at the end of every dashboard task. The tanstackStart plugin **regenerates `dashboard/src/routeTree.gen.ts` in-place during this build** — after adding/removing route files, run the build test and commit the regenerated file.
- Surgical changes: touch only what each task names. Match existing style (2-space indent, double quotes, comments only for non-obvious constraints).
- The dashboard talks to the runtime via same-origin `fetch("/api/…")` and one `EventSource("/api/events")`. Do not add new runtime endpoints.
- lucide icons used across tasks: `Search`, `LayoutGrid`, `Settings`, `Database`, `ListChecks`, `Zap`, `KeyRound`, `ScrollText`, `Palette`, `RotateCcw`, `Check`. Import from `"lucide-react"` (aliased by the build).
- Breakpoint for the responsive header/sidebar switch: Tailwind `md` (768px). Shell column: `max-w-4xl`, `min-w-80`.

---

### Task 1: Rename the "App hosting" settings section to "Engine"

The person-facing name for the runtime's app-hosting service becomes **Engine**. Setting **keys** (`hosting.*`) do not change — only the display-section string.

**Files:**
- Modify: `packages/runtime/src/platformSettings.ts` (line 15 `SECTIONS`, and the three `"App hosting"` section strings around lines 164–174)
- Modify: `packages/runtime/tests/platform-settings.test.ts`
- Modify: `context.md` (vocabulary entry)

**Interfaces:**
- Produces: `/api/settings` entries whose `section === "Engine"` for the three `hosting.*` keys. Task 9's sidebar lists a service named `Engine`.

- [ ] **Step 1: Write the failing test**

In `packages/runtime/tests/platform-settings.test.ts`, inside the `"carries the spec §6 anchors with the right scope and defaults"` test, extend the existing `hosting.request_timeout` line:

```ts
    expect(PLATFORM_SETTINGS["hosting.request_timeout"].field.default).toBe("30s");
    // Engine is the person-facing name for the runtime (UI revamp spec §4)
    expect(PLATFORM_SETTINGS["hosting.request_timeout"].section).toBe("Engine");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lodekit/runtime test tests/platform-settings.test.ts`
Expected: FAIL — `expected 'App hosting' to be 'Engine'`

- [ ] **Step 3: Rename in platformSettings.ts**

In `packages/runtime/src/platformSettings.ts`:

```ts
export const SECTIONS = ["General", "Appearance", "Tasks", "Logs", "Store", "Files", "Events", "Engine"] as const;
```

and replace all three `}, "App hosting"),` occurrences with `}, "Engine"),`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lodekit/runtime test tests/platform-settings.test.ts tests/settings-api.test.ts tests/settings-e2e.test.ts`
Expected: PASS (no other test asserts the old string — verify with `grep -rn "App hosting" packages/runtime` → only comments/docs, fix any stragglers found).

- [ ] **Step 5: Add the vocabulary entry to context.md**

`context.md` holds the canonical domain language. Find the **Runtime** entry (~line 17) and add a sibling term directly after it, matching the file's `**Term**:` format:

```markdown
**Engine**:
The person-facing name for the runtime wherever the dashboard shows it (the
Settings "Engine" section — `hosting.*` keys). Same thing as the runtime; "Engine"
is what the person reads, "runtime" is what the code and docs say.
```

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/platformSettings.ts packages/runtime/tests/platform-settings.test.ts context.md
git commit -m "feat(settings): rename App hosting section to Engine — person-facing name for the runtime"
```

---

### Task 2: Shared SSE provider

One `EventSource` per dashboard tab. The provider owns the connection, performs all React Query invalidations centrally, and lets pages subscribe to the raw `"event"` / `"log"` streams (the events and logs pages do live tailing, not just invalidation).

**Files:**
- Create: `packages/runtime/dashboard/src/components/sse.tsx`

**Interfaces:**
- Consumes: `EventSource("/api/events")` — emits named SSE events `"event"` (bus events: `{ ns, type, payload }`) and `"log"` (log records).
- Produces:
  - `SSEProvider({ children })` — mount once inside `QueryClientProvider` (Task 6).
  - `useSSEEvent(name: "event" | "log", handler: (e: MessageEvent) => void): void` — subscribe through the shared connection; handler identity may change freely (kept in a ref).
  - Central invalidations (pages stop doing these): `apps-changed → ["apps"]`, `settings-change → ["settings", ns]`, `secrets-change → ["secrets", ns]`, `kv-store-change → ["kv", ns]`, `tasks-change → ["tasks", ns] + ["task-runs", ns]`.

- [ ] **Step 1: Write the component**

```tsx
// packages/runtime/dashboard/src/components/sse.tsx
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

type Handler = (e: MessageEvent) => void;
type StreamName = "event" | "log";

const SSEContext = createContext<{ subscribe: (name: StreamName, h: Handler) => () => void } | null>(null);

// One EventSource per dashboard tab. Owns every React Query invalidation the bus
// drives; pages needing the raw stream (events/logs live tail) subscribe via
// useSSEEvent instead of opening their own connection.
export function SSEProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const listeners = useRef(new Map<StreamName, Set<Handler>>());

  const subscribe = useCallback((name: StreamName, h: Handler) => {
    let set = listeners.current.get(name);
    if (!set) listeners.current.set(name, (set = new Set()));
    set.add(h);
    return () => { set.delete(h); };
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/events");
    const fan = (name: StreamName) => (e: Event) => {
      listeners.current.get(name)?.forEach((h) => h(e as MessageEvent));
    };
    const onLog = fan("log");
    const onEvent = fan("event");
    es.addEventListener("log", onLog);
    es.addEventListener("event", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { ns: string; type: string };
      if (d.type === "apps-changed") void queryClient.invalidateQueries({ queryKey: ["apps"] });
      if (d.type === "settings-change") void queryClient.invalidateQueries({ queryKey: ["settings", d.ns] });
      if (d.type === "secrets-change") void queryClient.invalidateQueries({ queryKey: ["secrets", d.ns] });
      if (d.type === "kv-store-change") void queryClient.invalidateQueries({ queryKey: ["kv", d.ns] });
      if (d.type === "tasks-change") {
        void queryClient.invalidateQueries({ queryKey: ["tasks", d.ns] });
        void queryClient.invalidateQueries({ queryKey: ["task-runs", d.ns] });
      }
      onEvent(e);
    });
    return () => es.close();
  }, [queryClient]);

  return <SSEContext.Provider value={{ subscribe }}>{children}</SSEContext.Provider>;
}

export function useSSEEvent(name: StreamName, handler: Handler) {
  const ctx = useContext(SSEContext);
  if (!ctx) throw new Error("useSSEEvent must be used inside SSEProvider");
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => ctx.subscribe(name, (e) => ref.current(e)), [ctx, name]);
}
```

- [ ] **Step 2: Commit**

The file is not imported yet, so the build gate is deferred to Task 6 (Vite only compiles reachable modules).

```bash
git add packages/runtime/dashboard/src/components/sse.tsx
git commit -m "feat(dashboard): shared SSE provider — one EventSource, central query invalidations"
```

---

### Task 3: Logo components

The jar-cloud marks as inline React SVGs (`running` variation only), `#000` → `currentColor`, variant chosen by the effective `appearance.icon_style` setting.

**Files:**
- Create: `packages/runtime/dashboard/src/components/logo.tsx`

**Interfaces:**
- Consumes: React Query key `["settings", "_platform"]` → `GET /api/settings` → `{ settings: { key: string; effective: unknown }[] }` (invalidated live by Task 2's provider on `settings-change`).
- Produces: `Logo({ className }: { className?: string })` — renders the mark for the effective icon style (`a`|`b`|`c`, falls back to `b`). Color comes from CSS `currentColor` — callers pass `text-primary`.

- [ ] **Step 1: Write the component**

The three source SVGs are `menubar-icons/svg/jar-cloud-{a,b,c}-running.svg` (person's asset folder); their path data is reproduced verbatim below — no asset copying step needed.

```tsx
// packages/runtime/dashboard/src/components/logo.tsx
import { useQuery } from "@tanstack/react-query";

type SvgProps = { className?: string };

// jar-cloud marks (running variation), fills/strokes converted to currentColor
// so the theme's --primary carries through. Source: menubar-icons/svg.

function MarkA({ className }: SvgProps) { // "Solid": outline jar, solid cork + cloud
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path fill="currentColor" d="M10.4 8.6 L9.9 4.6 C9.77 3.6 10.5 3 11.4 3 L20.6 3 C21.5 3 22.23 3.6 22.1 4.6 L21.6 8.6 Z" />
      <rect fill="currentColor" x="9" y="8.6" width="14" height="2.9" rx="1.45" />
      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        d="M10 11.5 C7.8 11.6 6.2 11.9 5.3 12.6 C4.1 13.5 3.5 14.8 3.5 16.5 L3.5 25.5 C3.5 28.8 5.7 30.5 9.3 30.5 L22.7 30.5 C26.3 30.5 28.5 28.8 28.5 25.5 L28.5 16.5 C28.5 14.8 27.9 13.5 26.7 12.6 C25.8 11.9 24.2 11.6 22 11.5" />
      <path fill="currentColor" transform="translate(6.64 12.2) scale(0.78)"
        d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
    </svg>
  );
}

function MarkB({ className }: SvgProps) { // "Knockout": solid jar, cloud as negative space
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path fill="currentColor" d="M10.4 8.6 L9.9 4.6 C9.77 3.6 10.5 3 11.4 3 L20.6 3 C21.5 3 22.23 3.6 22.1 4.6 L21.6 8.6 Z" />
      <rect fill="currentColor" x="9" y="8.6" width="14" height="2.9" rx="1.45" />
      <path fill="currentColor" fillRule="evenodd" d="
        M10 11.5 L22 11.5 C24.2 11.6 25.8 11.9 26.7 12.6 C27.9 13.5 28.5 14.8 28.5 16.5 L28.5 25.5 C28.5 28.8 26.3 30.5 22.7 30.5 L9.3 30.5 C5.7 30.5 3.5 28.8 3.5 25.5 L3.5 16.5 C3.5 14.8 4.1 13.5 5.3 12.6 C6.2 11.9 7.8 11.6 10 11.5 Z
        M21.733 20.031 C21.203 17.34 18.839 15.32 16 15.32 C13.746 15.32 11.788 16.599 10.813 18.471 C8.465 18.721 6.64 20.71 6.64 23.12 C6.64 25.702 8.738 27.8 11.32 27.8 L21.46 27.8 C23.613 27.8 25.36 26.053 25.36 23.9 C25.36 21.841 23.761 20.172 21.733 20.031 Z" />
    </svg>
  );
}

function MarkC({ className }: SvgProps) { // "Outline": outline jar + outline cloud
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path fill="currentColor" d="M10.4 8.6 L9.9 4.6 C9.77 3.6 10.5 3 11.4 3 L20.6 3 C21.5 3 22.23 3.6 22.1 4.6 L21.6 8.6 Z" />
      <rect fill="currentColor" x="9" y="8.6" width="14" height="2.9" rx="1.45" />
      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        d="M10 11.5 C7.8 11.6 6.2 11.9 5.3 12.6 C4.1 13.5 3.5 14.8 3.5 16.5 L3.5 25.5 C3.5 28.8 5.7 30.5 9.3 30.5 L22.7 30.5 C26.3 30.5 28.5 28.8 28.5 25.5 L28.5 16.5 C28.5 14.8 27.9 13.5 26.7 12.6 C25.8 11.9 24.2 11.6 22 11.5" />
      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
        transform="translate(7.6 13.4) scale(0.7)"
        d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
    </svg>
  );
}

const MARKS = { a: MarkA, b: MarkB, c: MarkC } as const;

// Tracks the effective appearance.icon_style setting (live via settings-change SSE).
// Always the "running" mark — the logo does not reflect runtime state.
export function Logo({ className }: SvgProps) {
  const q = useQuery<{ settings: { key: string; effective: unknown }[] }>({
    queryKey: ["settings", "_platform"],
    queryFn: async () => (await fetch("/api/settings")).json(),
  });
  const style = q.data?.settings.find((s) => s.key === "appearance.icon_style")?.effective;
  const Mark = MARKS[style === "a" || style === "c" ? style : "b"];
  return <Mark className={className} />;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/runtime/dashboard/src/components/logo.tsx
git commit -m "feat(dashboard): jar-cloud logo marks — currentColor, variant from appearance.icon_style"
```

---

### Task 4: Navigation constants, empty-state stub, and /data + /tasks routes

**Files:**
- Create: `packages/runtime/dashboard/src/components/nav.ts`
- Create: `packages/runtime/dashboard/src/components/empty-stub.tsx`
- Create: `packages/runtime/dashboard/src/routes/data.tsx`
- Create: `packages/runtime/dashboard/src/routes/tasks.tsx`
- Modify (generated): `packages/runtime/dashboard/src/routeTree.gen.ts`

**Interfaces:**
- Produces:
  - `SERVICES: ServiceEntry[]` where `ServiceEntry = { label: string; icon: LucideIcon } & ({ to: string } | { href: string })` — Data, Tasks, Events, Secrets, Logs, Themes in that order; `href` marks full-page navigation (Themes → `/_ui/`).
  - `EmptyStub({ icon, title })` — centered icon + title + "Nothing here yet."
  - Routes `/data` and `/tasks` render `EmptyStub`.

- [ ] **Step 1: Write nav.ts**

```ts
// packages/runtime/dashboard/src/components/nav.ts
import { Database, KeyRound, ListChecks, Palette, ScrollText, Zap, type LucideIcon } from "lucide-react";

// The services menu / command-bar page list (UI revamp spec §2). `to` navigates
// inside the SPA; `href` is a full-page navigation (Themes is the static
// Storybook build at /_ui/ — it cannot render inside the router).
export type ServiceEntry = { label: string; icon: LucideIcon } & ({ to: string; href?: never } | { href: string; to?: never });

export const SERVICES: ServiceEntry[] = [
  { label: "Data", icon: Database, to: "/data" },
  { label: "Tasks", icon: ListChecks, to: "/tasks" },
  { label: "Events", icon: Zap, to: "/events" },
  { label: "Secrets", icon: KeyRound, to: "/secrets" },
  { label: "Logs", icon: ScrollText, to: "/logs" },
  { label: "Themes", icon: Palette, href: "/_ui/" },
];
```

- [ ] **Step 2: Write empty-stub.tsx**

```tsx
// packages/runtime/dashboard/src/components/empty-stub.tsx
import type { LucideIcon } from "lucide-react";

export function EmptyStub({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <Icon className="size-10 text-muted-foreground/50" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">Nothing here yet.</p>
    </div>
  );
}
```

- [ ] **Step 3: Write the stub routes**

```tsx
// packages/runtime/dashboard/src/routes/data.tsx
import { createFileRoute } from "@tanstack/react-router";
import { Database } from "lucide-react";
import { EmptyStub } from "../components/empty-stub";

export const Route = createFileRoute("/data")({
  component: () => <EmptyStub icon={Database} title="Data" />,
});
```

```tsx
// packages/runtime/dashboard/src/routes/tasks.tsx
import { createFileRoute } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { EmptyStub } from "../components/empty-stub";

export const Route = createFileRoute("/tasks")({
  component: () => <EmptyStub icon={ListChecks} title="Tasks" />,
});
```

- [ ] **Step 4: Build to regenerate the route tree and verify compile**

Run: `pnpm --filter @lodekit/runtime test tests/dashboard.test.ts`
Expected: PASS; `git status` shows `routeTree.gen.ts` modified with `/data` and `/tasks` entries.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/dashboard/src/components/nav.ts packages/runtime/dashboard/src/components/empty-stub.tsx packages/runtime/dashboard/src/routes/data.tsx packages/runtime/dashboard/src/routes/tasks.tsx packages/runtime/dashboard/src/routeTree.gen.ts
git commit -m "feat(dashboard): /data and /tasks stub routes, shared nav constants"
```

---

### Task 5: Command bar and services menu components

**Files:**
- Create: `packages/runtime/dashboard/src/components/command-bar.tsx`
- Create: `packages/runtime/dashboard/src/components/services-menu.tsx`

**Interfaces:**
- Consumes: `SERVICES` from `./nav` (Task 4); React Query key `["apps"]` → `GET /api/apps` → `{ appId, name, icon?, description? }[]`.
- Produces:
  - `CommandBar()` — desktop input-lookalike trigger + narrow icon trigger + `CommandDialog` (⌘K / Ctrl-K global shortcut). Apps group opens `/{appId}/` full-page; Pages group = `SERVICES` + Settings.
  - `ServicesGrid({ onNavigate })` — the tile grid (shared between popover and narrow panel).
  - `ServicesMenu()` — desktop-only Popover wrapper around `ServicesGrid` (Task 6 renders the narrow panel itself).

- [ ] **Step 1: Write command-bar.tsx**

```tsx
// packages/runtime/dashboard/src/components/command-bar.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Settings } from "lucide-react";
import {
  Button,
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@lodekit/ui";
import { SERVICES } from "./nav";

interface AppInfo { appId: string; name: string; icon?: string }

const PAGES = [...SERVICES, { label: "Settings", icon: Settings, to: "/settings" as const }];

export function CommandBar() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const apps = useQuery<AppInfo[]>({
    queryKey: ["apps"],
    queryFn: async () => (await fetch("/api/apps")).json(),
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      {/* Desktop: input-lookalike trigger. Narrow: bare icon (spec §1). */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-8 w-56 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent md:inline-flex"
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="pointer-events-none rounded border bg-muted px-1.5 font-mono text-[10px]">⌘K</kbd>
      </button>
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search" onClick={() => setOpen(true)}>
        <Search className="size-4" />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search apps and pages…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          {(apps.data ?? []).length > 0 && (
            <CommandGroup heading="Apps">
              {(apps.data ?? []).map((a) => (
                <CommandItem
                  key={a.appId}
                  onSelect={() => { setOpen(false); window.location.assign(`/${a.appId}/`); }}
                >
                  <span aria-hidden="true">{a.icon || "📦"}</span> {a.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading="Pages">
            {PAGES.map((p) => (
              <CommandItem
                key={p.label}
                onSelect={() => {
                  setOpen(false);
                  if (p.href) window.location.assign(p.href);
                  else void navigate({ to: p.to });
                }}
              >
                <p.icon className="size-4" aria-hidden="true" /> {p.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
```

- [ ] **Step 2: Write services-menu.tsx**

```tsx
// packages/runtime/dashboard/src/components/services-menu.tsx
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@lodekit/ui";
import { SERVICES } from "./nav";

const tileClass =
  "flex flex-col items-center gap-1.5 rounded-lg p-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

// The Gmail-style tile grid — shared by the desktop popover and the narrow
// under-header panel (spec §2). onNavigate lets the container close itself.
export function ServicesGrid({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {SERVICES.map((s) =>
        s.href ? (
          <a key={s.label} href={s.href} className={tileClass} onClick={onNavigate}>
            <s.icon className="size-5" aria-hidden="true" />
            {s.label}
          </a>
        ) : (
          <Link key={s.label} to={s.to} className={tileClass} onClick={onNavigate}>
            <s.icon className="size-5" aria-hidden="true" />
            {s.label}
          </Link>
        )
      )}
    </div>
  );
}

// Desktop container: a popover card anchored to the grid button. The narrow
// variant is rendered by the header itself (full-width panel under the bar).
export function ServicesMenu() {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Services">
          <LayoutGrid className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <ServicesGrid onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Commit**

(Compile gate lands with Task 6, which imports these.)

```bash
git add packages/runtime/dashboard/src/components/command-bar.tsx packages/runtime/dashboard/src/components/services-menu.tsx
git commit -m "feat(dashboard): command bar (⌘K) and services menu components"
```

---

### Task 6: Header and app shell in __root.tsx

**Files:**
- Create: `packages/runtime/dashboard/src/components/header.tsx`
- Modify: `packages/runtime/dashboard/src/routes/__root.tsx`

**Interfaces:**
- Consumes: `Logo` (Task 3), `CommandBar`, `ServicesMenu`, `ServicesGrid` (Task 5), `SSEProvider` (Task 2).
- Produces: the shell every route renders inside — header, `<main class="mx-auto w-full max-w-4xl min-w-80 flex-1 px-4 py-6 md:px-8">`, footer. Routes must stop rendering their own `<main>` wrappers (Tasks 7–9).

- [ ] **Step 1: Write header.tsx**

Desktop (`md+`): floating — static position, top margin, rounded, bordered, shadowed. Narrow: sticky, full-width, border-bottom, with the services panel expanding from the bar's bottom edge.

```tsx
// packages/runtime/dashboard/src/components/header.tsx
import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, Settings } from "lucide-react";
import { Button } from "@lodekit/ui";
import { Logo } from "./logo";
import { CommandBar } from "./command-bar";
import { ServicesGrid, ServicesMenu } from "./services-menu";

export function Header() {
  // Narrow-only services panel, expanding below the sticky bar (spec §1).
  const [panelOpen, setPanelOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => setPanelOpen(false), [pathname]); // close on navigation

  return (
    <header className="sticky top-0 z-40 mx-auto w-full min-w-80 max-w-4xl bg-background md:static md:px-8 md:pt-6">
      <div className="flex items-center gap-1 border-b bg-card px-4 py-2 md:rounded-xl md:border md:shadow-sm">
        <Link to="/" aria-label="Lodekit home" className="mr-1">
          <Logo className="size-7 text-primary" />
        </Link>
        <div className="flex-1" />
        <CommandBar />
        <div className="flex-1" />
        {/* Desktop: popover. Narrow: plain toggle for the under-bar panel. */}
        <div className="hidden md:block">
          <ServicesMenu />
        </div>
        <Button
          variant="ghost" size="icon" className="md:hidden" aria-label="Services"
          aria-expanded={panelOpen} onClick={() => setPanelOpen((o) => !o)}
        >
          <LayoutGrid className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" asChild aria-label="Settings">
          <Link to="/settings">
            <Settings className="size-4" />
          </Link>
        </Button>
      </div>
      {panelOpen && (
        <div className="border-b bg-card px-4 py-2 md:hidden">
          <ServicesGrid onNavigate={() => setPanelOpen(false)} />
        </div>
      )}
    </header>
  );
}
```

- [ ] **Step 2: Rewrite __root.tsx as the shell**

Full new content (footer/version logic unchanged from today):

```tsx
// packages/runtime/dashboard/src/routes/__root.tsx
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import appCss from "../index.css?url";
import { SSEProvider } from "../components/sse";
import { Header } from "../components/header";

const queryClient = new QueryClient();

// Injected by the runtime's dashboard build (build.ts defines) — never present in app builds.
declare const __LODEKIT_VERSION__: string;
declare const __LODEKIT_COMMIT__: string | null;

const versionLine = `lodekit v${__LODEKIT_VERSION__}${__LODEKIT_COMMIT__ ? ` ${__LODEKIT_COMMIT__}` : ""}`;

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: "Lodekit" }],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: () => (
    <html lang="en">
      <head>
        <HeadContent />
        {/* Theme before hydration — no dark-mode flash. Served by the runtime
            from the effective appearance.theme setting; system mode keeps the
            OS media query (settings spec §8). */}
        <script src="/_ui/theme.js" />
      </head>
      <body className="flex min-h-screen flex-col">
        <QueryClientProvider client={queryClient}>
          <SSEProvider>
            <Header />
            <main className="mx-auto w-full min-w-80 max-w-4xl flex-1 px-4 py-6 md:px-8">
              <Outlet />
            </main>
          </SSEProvider>
        </QueryClientProvider>
        <footer className="text-muted-foreground py-4 text-center text-xs">{versionLine}</footer>
        <Scripts />
      </body>
    </html>
  ),
});
```

- [ ] **Step 3: Build gate**

Run: `pnpm --filter @lodekit/runtime test tests/dashboard.test.ts`
Expected: PASS. (Pages still render their own `<main class="mx-auto max-w-4xl p-8">` wrappers inside the shell — visually doubled padding until Tasks 7–9 strip them; that's fine mid-flight.)

- [ ] **Step 4: Commit**

```bash
git add packages/runtime/dashboard/src/components/header.tsx packages/runtime/dashboard/src/routes/__root.tsx
git commit -m "feat(dashboard): app shell — floating/sticky header, single column, shared SSE"
```

---

### Task 7: Apps page revamp (index.tsx)

Cards become icon + title + description with the whole card clickable; **all** status badges stay; inline Store/Tasks panels and per-card links are deleted; apps come from React Query.

**Files:**
- Modify: `packages/runtime/dashboard/src/routes/index.tsx` (full rewrite below)

**Interfaces:**
- Consumes: `["apps"]` query (invalidated by SSE provider on `apps-changed`); `useSSEEvent("event", …)` for `build-state` / `server-state` accumulation; `["secrets", appId]` query (existing `PendingSecretsBadge` behavior).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Rewrite index.tsx**

Full new content. `StateBadge`, `ServerStateBadge`, `PendingSecretsBadge` keep today's logic; `StorePanel`, `TasksPanel`, `StateBadgeForRun`, the panel open-state, the header link row, and the app-count are deleted. Clickability uses the stretched-link pattern (no nested anchors): the title `<a>` grows an `after:` overlay across the card; the badge row is `relative` so its own links stack above the overlay.

```tsx
// packages/runtime/dashboard/src/routes/index.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, CardDescription, CardHeader, CardTitle, Skeleton } from "@lodekit/ui";
import { useSSEEvent } from "../components/sse";

export const Route = createFileRoute("/")({
  component: DashboardHome,
});

interface AppInfo {
  appId: string;
  name: string;
  icon?: string;
  description?: string;
}

type BuildStatus =
  | { status: "building" }
  | { status: "ready" }
  | { status: "error"; message?: string };

type ServerStatus =
  | { status: "starting" }
  | { status: "running" }
  | { status: "error"; message?: string };

function StateBadge({ state }: { state: BuildStatus | undefined }) {
  if (!state) return null;
  if (state.status === "building") return <Badge variant="outline">building…</Badge>;
  if (state.status === "ready") return <Badge variant="secondary">ready</Badge>;
  return <Badge variant="destructive">error: {state.message ?? ""}</Badge>;
}

function ServerStateBadge({ state }: { state: ServerStatus | undefined }) {
  if (!state || state.status !== "error") return null;
  return (
    <Badge variant="destructive" title={state.message}>
      server error
    </Badge>
  );
}

// The "app needs a key" nudge (secret-store spec §9): pending slots, visible
// without hunting. Clicking lands on the app's settings section (slots panel).
function PendingSecretsBadge({ appId }: { appId: string }) {
  const q = useQuery<{ slots: { status: string }[] }>({
    queryKey: ["secrets", appId],
    queryFn: async () => (await fetch(`/api/apps/${appId}/secrets`)).json(),
  });
  const pending = (q.data?.slots ?? []).filter((s) => s.status === "pending").length;
  if (pending === 0) return null;
  return (
    <Link to="/settings" search={{ section: appId }}>
      <Badge variant="outline">{pending} secret{pending === 1 ? "" : "s"} needed</Badge>
    </Link>
  );
}

function DashboardHome() {
  const apps = useQuery<AppInfo[]>({
    queryKey: ["apps"],
    queryFn: async () => (await fetch("/api/apps")).json(),
  });
  const [states, setStates] = useState<Record<string, BuildStatus>>({});
  const [serverStates, setServerStates] = useState<Record<string, ServerStatus>>({});

  // build/server state is stream-only (no fetchable snapshot) — accumulate from SSE.
  useSSEEvent("event", (e) => {
    const d = JSON.parse(e.data) as {
      ns: string;
      type: string;
      payload: Record<string, unknown> | null;
    };
    if (d.type === "build-state") {
      const p = d.payload as { status: BuildStatus["status"]; message?: string } | null;
      if (p) setStates((s) => ({ ...s, [d.ns]: { status: p.status, message: p.message } }));
    }
    if (d.type === "server-state") {
      const p = d.payload as { status: ServerStatus["status"]; message?: string } | null;
      if (p) setServerStates((s) => ({ ...s, [d.ns]: { status: p.status, message: p.message } }));
    }
  });

  if (apps.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (apps.isError) return <p className="text-sm text-muted-foreground">Failed to load apps.</p>;
  const list = apps.data ?? [];
  if (list.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No apps yet</CardTitle>
          <CardDescription>Ask your agent to build an app with Lodekit.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((a) => (
        <Card key={a.appId} className="relative h-full transition-colors hover:bg-accent/50">
          <CardHeader>
            <div className="text-3xl">{a.icon || "📦"}</div>
            <CardTitle>
              {/* Stretched link: the after-overlay makes the whole card clickable
                  without nesting anchors; the badge row re-stacks above it. */}
              <a href={`/${a.appId}/`} className="after:absolute after:inset-0">{a.name}</a>
            </CardTitle>
            <CardDescription>{a.description || ""}</CardDescription>
            <div className="relative flex flex-wrap items-center gap-2 empty:hidden">
              <StateBadge state={states[a.appId]} />
              <ServerStateBadge state={serverStates[a.appId]} />
              <PendingSecretsBadge appId={a.appId} />
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Build gate**

Run: `pnpm --filter @lodekit/runtime test tests/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/runtime/dashboard/src/routes/index.tsx
git commit -m "feat(dashboard): apps page — clickable cards, badges kept, inline panels removed"
```

---

### Task 8: Events, Logs, Secrets pages join the shell

Each page: drop its own `<main class="mx-auto max-w-4xl p-8">` wrapper and title-bar link row (keep the `h1`), and replace its private `EventSource` with `useSSEEvent`. Page logic is otherwise untouched.

**Files:**
- Modify: `packages/runtime/dashboard/src/routes/events.tsx`
- Modify: `packages/runtime/dashboard/src/routes/logs.tsx`
- Modify: `packages/runtime/dashboard/src/routes/secrets.tsx`

**Interfaces:**
- Consumes: `useSSEEvent` from `../components/sse` (Task 2). Signature: `useSSEEvent("event" | "log", (e: MessageEvent) => void)` — call unconditionally at component top level; the handler may close over changing state (it's ref-wrapped).

- [ ] **Step 1: events.tsx**

Three edits:

1. Add the import: `import { useSSEEvent } from "../components/sse";`
2. Replace the live-tail effect (the `useEffect` containing `new EventSource("/api/events")`, lines ~114–131) with a top-level hook call — the handler body is identical to today's listener:

```tsx
  useSSEEvent("event", (e) => {
    const r = JSON.parse(e.data) as EventRecord;
    const { ns, type, q } = filtersRef.current;
    if ((ns && r.ns !== ns) || (type && r.type !== type) || !matchesQ(r, q)) return;
    if (!hasRecordsRef.current) {
      pendingRef.current.push(r);
      return;
    }
    setRecords((rs) =>
      rs && !(r.id !== 0 && rs.some((x) => x.id === r.id))
        ? [r, ...rs].slice(0, Math.max(MAX_LIVE_ROWS, rs.length))
        : rs
    );
  });
```

3. In the returned JSX: change `<main className="mx-auto max-w-4xl p-8">` to `<div>` (and the closing tag), and replace the title-bar block

```tsx
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Events</h1>
        <Link to="/" className="text-sm text-muted-foreground hover:underline">← Apps</Link>
      </div>
```

with

```tsx
      <h1 className="mb-6 text-2xl font-semibold">Events</h1>
```

Remove `Link` from the `@tanstack/react-router` import if it is now unused in the file.

- [ ] **Step 2: logs.tsx — same three edits**

Import `useSSEEvent`; replace the `useEffect` holding `new EventSource("/api/events")` + `es.addEventListener("log", …)` with `useSSEEvent("log", (e) => { …same handler body… })` (keep the existing comment about the persistent connection and non-shrinking window); swap the `<main>` wrapper for `<div>`; collapse the title bar to `<h1 className="mb-6 text-2xl font-semibold">Logs</h1>`; drop the unused `Link` import if applicable.

- [ ] **Step 3: secrets.tsx**

The page's `EventSource` effect only invalidated `["secrets", ns]` — the SSE provider now does that centrally. **Delete the whole `useEffect` (lines ~123–130) with no replacement** (keep the `invalidate` helper used by mutations). Swap `<main className="mx-auto max-w-4xl p-8">` for `<div>`; collapse the title bar to `<h1 className="mb-6 text-2xl font-semibold">Secrets</h1>`; remove now-unused imports (`useEffect`, `Link` — check each).

- [ ] **Step 4: Build gate**

Run: `pnpm --filter @lodekit/runtime test tests/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/dashboard/src/routes/events.tsx packages/runtime/dashboard/src/routes/logs.tsx packages/runtime/dashboard/src/routes/secrets.tsx
git commit -m "refactor(dashboard): events/logs/secrets render in the shell, share the SSE connection"
```

---

### Task 9: Settings page revamp

Floating sidebar with grouped nav; icon Reset button (faint at default) left of each control; blue dot removed; saved-checkmark fade; `Advanced · N` accordion; Engine appears via Task 1's rename automatically.

**Files:**
- Modify: `packages/runtime/dashboard/src/routes/settings.tsx`

**Interfaces:**
- Consumes: `["settings", "_platform"]`, `["settings", appId]`, `["secrets", …]` queries — all invalidated centrally by the SSE provider now (the page's own `EventSource` effect is deleted).
- Produces: nothing consumed later.

- [ ] **Step 1: Update imports and delete the page's EventSource effect**

- Import changes at the top of the file:
  - Add: `Accordion, AccordionContent, AccordionItem, AccordionTrigger` to the `@lodekit/ui` import; add `import { Check, RotateCcw } from "lucide-react";`
  - Remove from the `@lodekit/ui` import: `Collapsible, CollapsibleContent, CollapsibleTrigger` (replaced by the accordion).
  - Remove `useEffect` from the react import **after** step 1's deletion makes it unused (verify).
- In `SettingsView`, delete the entire `useEffect` that opens `new EventSource("/api/events")` (lines ~312–320) — the shell's provider handles both invalidation types.

- [ ] **Step 2: Replace SettingRow — icon reset (left of control), no dot, saved check**

Replace the whole `SettingRow` function with:

```tsx
// A setting row: label, one-liner description, [saved ✓] [reset ↺] [control].
// The reset icon is faint+disabled at default and lights up when modified —
// it carries the "modified" signal (the old dot is gone). A successful write
// fades a check in beside the control for ~1.5s.
function SettingRow(props: {
  field: Field; value: unknown; effective: unknown; inheritedLabel?: string; drifted?: boolean;
  onWrite: (v: unknown | undefined) => Promise<void>;
}) {
  const modified = props.value !== null && props.value !== undefined;
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const commit = (v: unknown | undefined) => {
    props.onWrite(v)
      .then(() => {
        setError(null);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  return (
    <div className="flex items-start justify-between gap-6 border-b py-3 last:border-b-0">
      <div className="min-w-0">
        <Label className="flex items-center gap-2">
          {props.field.label}
          {props.drifted && <Badge variant="outline">was reset to default</Badge>}
        </Label>
        <p className="mt-1 text-sm text-muted-foreground">{props.field.description}</p>
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
        {props.inheritedLabel && !modified && (
          <p className="mt-0.5 text-xs text-muted-foreground">{props.inheritedLabel}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Check
          aria-hidden="true"
          className={`size-4 text-muted-foreground transition-opacity duration-500 ${saved ? "opacity-100" : "opacity-0"}`}
        />
        <Button
          variant="ghost" size="icon"
          disabled={!modified}
          title="Reset to default" aria-label="Reset to default"
          className={modified ? "" : "opacity-30"}
          onClick={() => commit(undefined)}
        >
          <RotateCcw className="size-4" />
        </Button>
        <FieldControl key={`${props.field.type}:${String(props.effective)}`} field={props.field} value={props.effective} onChange={commit} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Replace SettingsGroup's Collapsible with the accordion**

Replace the whole `SettingsGroup` function with:

```tsx
function SettingsGroup({ title, entries, render }: { title: string; entries: { advanced: boolean }[]; render: (advanced: boolean) => ReactNode }) {
  const advanced = entries.filter((e) => e.advanced);
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {render(false)}
        {advanced.length > 0 && (
          <Accordion type="single" collapsible>
            <AccordionItem value="advanced" className="border-b-0">
              <AccordionTrigger className="py-2 text-sm text-muted-foreground hover:no-underline">
                Advanced · {advanced.length}
              </AccordionTrigger>
              <AccordionContent>{render(true)}</AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Rebuild SettingsView's layout — floating sidebar, grouped nav, no page header**

Replace the `SettingsView` function's returned JSX (everything inside `return (…)`) and the nav-derivation lines above it. The service order is pinned; `?section=` navigation is unchanged:

```tsx
  const entries = platform.data?.settings ?? [];
  // Pinned display order (UI revamp spec §4); unknown future sections append.
  const SERVICE_ORDER = ["Store", "Files", "Tasks", "Events", "Logs", "Engine"];
  const present = [...new Set(entries.map((e) => e.section))].filter((s) => s !== "General" && s !== "Appearance");
  const services = [
    ...SERVICE_ORDER.filter((s) => present.includes(s)),
    ...present.filter((s) => !SERVICE_ORDER.includes(s)),
  ];
  const app = apps.data?.find((a) => a.appId === section);

  const itemClass = (active: boolean) =>
    `block shrink-0 rounded px-2 py-1 hover:bg-accent ${active ? "bg-accent font-medium" : "text-muted-foreground"}`;
  const groupLabel = "hidden pt-3 px-2 text-xs uppercase text-muted-foreground md:block";

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-8">
      {/* Floating sidebar; below md it becomes a horizontal scrollable picker. */}
      <nav className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-3 text-sm shadow-sm md:sticky md:top-24 md:block md:w-48 md:shrink-0 md:space-y-1 md:self-start">
        <div className="hidden px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:block">
          Settings
        </div>
        {["General", "Appearance"].map((s) => (
          <Link key={s} to="/settings" search={{ section: s }} className={itemClass(section === s)}>{s}</Link>
        ))}
        <div className={groupLabel}>Apps</div>
        {(apps.data ?? []).map((a) => (
          <Link key={a.appId} to="/settings" search={{ section: a.appId }} className={itemClass(section === a.appId)}>
            {a.icon} {a.name}
          </Link>
        ))}
        <div className={groupLabel}>Services</div>
        {services.map((s) => (
          <Link key={s} to="/settings" search={{ section: s }} className={itemClass(section === s)}>{s}</Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1 space-y-4">
        {platform.isLoading ? (
          <Skeleton className="h-40" />
        ) : app ? (
          <AppSection app={app} />
        ) : (
          <PlatformSection
            section={section} entries={entries}
            invalidate={() => void queryClient.invalidateQueries({ queryKey: ["settings", "_platform"] })}
          />
        )}
      </div>
    </div>
  );
```

(The old `<main>` wrapper, `<h1>Settings</h1>`, "Dashboard" back-link, and the flat `nav` array are all gone.)

- [ ] **Step 5: Build gate**

Run: `pnpm --filter @lodekit/runtime test tests/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/dashboard/src/routes/settings.tsx
git commit -m "feat(dashboard): settings revamp — floating grouped sidebar, icon reset, saved check, Advanced accordion"
```

---

### Task 10: Full verification and human smoke

**Files:**
- Modify: `roadmap.md` (one line)

- [ ] **Step 1: Full test suite**

Run from the repo root: `pnpm test`
Expected: all packages PASS (`@lodekit/runtime` incl. dashboard/settings/secrets suites, `@lodekit/sdk`, `@lodekit/manager`).

- [ ] **Step 2: Update the roadmap's SSE note**

In `roadmap.md`, find the "SSE connection budget" item (parked from the settings slice) and amend it to record that the dashboard now holds a single shared `EventSource` per tab; the remaining scope is manager subscribe hygiene. Keep the item (don't delete it) unless it listed only the dashboard half.

```bash
git add roadmap.md
git commit -m "docs(roadmap): dashboard now single SSE connection per tab; manager hygiene remains"
```

- [ ] **Step 3: Human browser smoke (person does this — list what to check)**

Start: `pnpm dev` → open the dashboard. Checklist to hand to the person:

- Header floats with margin on desktop; logo shows the knockout mark in the theme color; clicking it returns home.
- Change Settings → Appearance → Menu bar icon → logo mark swaps live (SSE).
- ⌘K opens the command dialog; apps and pages navigate; Themes leaves the SPA for `/_ui/`.
- Services grid popover on desktop; below 768px the header sticks full-width, search collapses to an icon, services opens the under-header panel, apps list is one per row.
- App cards: whole card opens the app; badges render; "N secrets needed" badge goes to the app's settings section, not the app.
- `/data` and `/tasks` show the stub empty states.
- Settings: sidebar shows SETTINGS / General / Appearance / Apps / Services (…Engine last); reset icon faint at default, lights up when modified, resets on click; check fades in on save; Advanced · N accordion opens/closes; no blue dot anywhere.
- Events/Logs/Secrets pages render inside the shell with live updates still working (one `EventSource` in the network tab).

- [ ] **Step 4: Leave the branch for review**

Per CLAUDE.md, work stays on the `ui` branch — the person reviews and decides when to fold into `master`. Do not rebase-integrate unattended.
