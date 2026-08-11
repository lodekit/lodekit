# 009-feat: App Lifecycle

**Status:** Active · **Last reviewed:** 2026-08-11

## Overview

The app lifecycle is how a folder in the Lodekit root becomes a running web app. The
engine discovers apps in the apps tree, builds each one through the shared toolchain into
the Cache, and serves it — pages and server functions executing in a per-app app worker
inside the single engine process. The agent creates and edits apps as plain files; the
person watches build and server states in the dashboard and uses the app at its URL.
Neither ever runs a build or a dev server.

## Behavior

- An app is a folder in the apps tree whose manifest names it and declares an app id equal
  to the folder name. That app id is simultaneously the app's URL path and its data
  namespace. Folders without a valid manifest or id are ignored, never an error.
- There is no install or registration step: writing the folder (scaffolded through the MCP
  server, or by hand) is installation. The folder-watcher notices, builds, and serves. The
  packaged manager seeds the showcase and welcome apps into a fresh root on first run; an
  empty root is a fully supported state.
- Edits debounce into a rebuild of just the touched app. Build-generated files inside the
  app are ignored, so a build never retriggers itself.
- On boot the dashboard builds first; every app then builds in the background while the
  engine is already accepting traffic.
- Build state is spoken as past-tense facts — build-started → build-ready | build-failed —
  and the server lifecycle mirrors the triple (server-started / server-ready /
  server-failed). The dashboard's app cards accumulate these live and badge each app.
- While an app is building — first build or any rebuild — its URL serves a "Building…"
  page that reloads itself on ready. A failed build serves a build-failed page carrying
  the compiler error. A ready app whose server code fails serves an app-error page with
  the failure message.
- A successful build (re)starts the app's worker: terminate and respawn, so every rebuild
  begins from clean module state. A crashing worker respawns with exponential backoff and,
  after five consecutive crashes, stops retrying until the next build; a hung request
  times out and surfaces as an error. None of this affects sibling apps or the engine.
- Removing an app is deleting its folder: built output is dropped, the worker stopped,
  scheduled work evicted. The app's data namespace survives — removal never deletes data.
  Built output for apps removed while the engine was off is pruned at the next boot.

## Design Decisions

### 1. The app contract is TanStack Start, hosted

**Decision:** An app *is* a TanStack Start application — file-based routes, loaders,
server functions, SSR — that the engine builds and hosts; Lodekit defines no framework of
its own.
**Why:** Agents already know Start from training data and its docs are the ecosystem's;
a Lodekit-shaped SPA contract was built first and deliberately cut over
(2026-07-03-tanstack-start-host-design). The coupling is the positioning, not a liability
to abstract away.
**Tradeoff:** Start's relative immaturity is accepted without a hedging layer — when
Start moves, Lodekit moves.

### 2. The filesystem is the interface

**Decision:** Discovery is watching the apps tree; a folder appearing is install, a folder
disappearing is removal; app id = folder name = URL path = data namespace.
**Why:** One identity end to end keeps every surface (URL, scoped API, data tree,
dashboard) trivially correlated, and lets any agent that can write files drive the whole
lifecycle (2026-06-30-lodekit-poc-design).
**Tradeoff:** Renaming an app is a remove-plus-install (its data namespace does not
follow), and there is no place to hang install-time hooks or confirmation.

### 3. Build-on-change to static output, never dev servers

**Decision:** The engine rebuilds an app's complete artifact into the Cache on every
change; there is no HMR and no per-app dev server
(2026-07-01-build-pipeline-and-sdk-design).
**Why:** The person never builds — invariant. A complete, disposable artifact keeps the
Cache regenerable and the serving path identical in dev and production.
**Tradeoff:** Edit-to-refresh latency is a full app build (seconds), not an HMR patch.

### 4. Fault containment via per-app worker threads

**Decision:** An app's server bundle executes in a worker thread inside the one engine
process — never a per-app server process. Crash → error state → respawn with backoff;
the engine and sibling apps are untouched.
**Why:** One shared instance is an invariant; worker threads buy fault containment
without a process fleet to supervise (2026-07-03-tanstack-start-host-design). This is
containment, not a security sandbox — apps are the person's own trusted code.
**Tradeoff:** No isolation against a malicious app, and requests cross a message-channel
boundary (bodies are buffered and capped rather than streamed in).

### 5. Honest interstitials over stale output

**Decision:** During a rebuild the app's URL shows the building page, and a failed build
shows the error — the engine never serves the last good output.
**Why:** Silent staleness is the worst failure mode for an agent-driven loop: the agent
saves, reloads, and must trust that what renders is what it wrote
(2026-07-01-build-pipeline-and-sdk-design).
**Tradeoff:** The person sees a brief interstitial on every save instead of an
uninterrupted (but possibly lying) page.

### 6. Server functions are same-origin only

**Decision:** The engine rejects server-function calls that lack same-origin browser
markers — a soft guard, stated as "webhooks are unsupported."
**Why:** It makes the missing inbound-trigger story an explicit fact instead of an
accidental open door, until a real webhook slice designs auth and reachability
(2026-07-03-tanstack-start-host-design).
**Tradeoff:** No external system can call into an app; the guard is soft by design and
blocks legitimate curl-style testing too.

## Related

- **Recs:** 005-arch-engine-rename
- **Specs:** docs/specs/2026-06-30-lodekit-poc-design.md,
  docs/specs/2026-07-01-build-pipeline-and-sdk-design.md,
  docs/specs/2026-07-03-tanstack-start-host-design.md

## Open Questions

- App add/remove is announced only as a coarse "apps changed" fact; per-app
  installed/removed facts wait for the watcher to compute diffs.
- Inbound triggers (webhooks) remain a designed-out gap behind the same-origin guard.
