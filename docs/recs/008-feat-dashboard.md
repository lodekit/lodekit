# 008-feat: Dashboard

**Status:** Active · **Last reviewed:** 2026-08-11

## Overview

The dashboard is Lodekit's built-in web UI — the person's door into the platform, as the
MCP server is the agent's. It shows every app with its live build state and health, and
carries a page per person-facing surface: the data explorer, events, secrets, gateways,
logs, themes, and settings. It exists so the person can observe and steer their instance
without ever touching a terminal: what the agent builds, the dashboard makes visible.

## Behavior

- Served by the engine at a reserved underscore-prefixed path outside the app-id grammar,
  so it can never collide with a person's app; the engine's root URL redirects to it.
- The default page is the apps overview: a card grid of installed apps (icon, name,
  description). The whole card opens the app itself. Badges surface what needs attention:
  build state (building / ready / error), server error, pending secret slots, and gateway
  connections awaiting setup — each nudge links to where it is resolved. With no apps
  installed, the page tells the person to ask their agent for one.
- A shared shell wraps every page: a header with the Lodekit mark (its style follows the
  appearance setting, live), a command bar (⌘K) that jumps to any app or page, a services
  menu (Data, Tasks, Events, Secrets, Gateways, Logs, Themes), and a settings button; a
  footer names the running version. On narrow viewports the shell collapses gracefully.
- Live state rides one SSE connection per dashboard tab: bus events refresh the affected
  page data — apps appearing or vanishing, settings edits, secret links, data changes,
  task runs — without reload. Build and server state accumulate from the live stream.
- The dashboard is an internal app on the same substrate as the person's apps: built by
  the same pipeline, hosted the same way, themed by the same theme system. If its own
  build fails, a dependency-free plain-HTML fallback page explains what happened while
  apps and the API keep running.
- The Tasks page is currently a placeholder awaiting its service view (see 013-feat-tasks
  for the service itself); every other page is a working surface with its own record
  where depth warrants it.

## Design Decisions

### 1. The dashboard is an internal app on the app substrate

**Decision:** The dashboard is built and hosted exactly like a person's app — same build
pipeline, same per-app worker hosting — mounted at a reserved internal-app id whose
underscore prefix sits outside the app-id grammar.
**Why:** It exercises the substrate continuously (the dashboard is app #0), and the
cohesion invariant that Lodekit looks and behaves like its apps holds by construction
(2026-07-02 product overview). The underscore makes collisions impossible rather than
policed.
**Tradeoff:** The debug surface depends on the machinery it debugs. Mitigated by the
plain-HTML fallback page, which depends on nothing.

### 2. HTTP + SSE are the dashboard's only inputs

**Decision:** The dashboard drives the engine solely through the same HTTP API and SSE
feed every other client uses — no privileged in-process access.
**Why:** One uniform, testable, guardable door (product overview cohesion invariant);
whatever the dashboard can show, the MCP server and tests can reach too.
**Tradeoff:** Every dashboard feature must first exist as an API surface, and build/server
state is stream-only — a card shows no state badge until the next event arrives.

### 3. One SSE connection, translated into query refreshes

**Decision:** A single shell-level event source owns the live feed; it maps bus events to
data refreshes by the event's component, and pages that need the raw stream (live tails)
subscribe to the shared connection rather than opening their own.
**Why:** Pages once opened parallel connections with duplicated wiring; consolidation was
a stated goal of the UI revamp (2026-07-09) and keeps the connection budget at one.
**Tradeoff:** The event-to-refresh mapping is centralized and must be extended as
services grow; a missed mapping means a stale page, not an error.

### 4. A shell with consolidated navigation, no per-app detail page

**Decision:** One shared shell owns all navigation (command bar, services menu); the apps
overview links each card to the app itself, and per-app management (settings, secrets,
service overrides) lives in sections of the Settings page rather than a per-app detail
page.
**Why:** The dashboard had grown organically — every page hand-rolled its own header and
back-links, and the apps page doubled as the navigation hub (2026-07-09 revamp).
**Tradeoff:** There is no single per-app health page; an app's story is assembled from
overview badges plus the relevant service pages.

### 5. Command bar is navigation-only

**Decision:** The ⌘K command bar lists apps and pages; it carries no verbs or per-app
actions.
**Why:** Scoped deliberately in the revamp — navigation was the felt gap; actions need
design of their own.
**Tradeoff:** Power users get fast travel but no command-driven operations yet.

## Related

- **Recs:** 001-arch-event-envelope-kind-component, 011-feat-data-explorer,
  012-feat-settings, 013-feat-tasks, 015-feat-secret-store, 016-feat-themes,
  019-feat-logging-events
- **Specs:** docs/specs/2026-07-09-dashboard-ui-revamp-design.md,
  docs/specs/2026-07-02-product-overview-design.md

## Open Questions

- The Tasks page remains a stub; the tasks service has run history and schedules the
  dashboard does not yet show anywhere.
