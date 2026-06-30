# Lodekit Roadmap

Deferred work and known gaps. Parked items from the POC design
(`docs/specs/2026-06-30-lodekit-poc-design.md`).

## Guiding principle

The user should never rely on dev servers or terminal build commands. Lodekit ships a
runtime / web server, and tools are built *on Lodekit as the SDK* and run inside that
instance (one shared instance; per-app instances only if ever proven necessary). Lodekit
controls the build chain **programmatically (via code, not shell commands)** — to the
point of possibly shipping with an internal Node runtime, or downloading one on first
run.

## Next major step: Lodekit-owned shared build toolchain

The POC is buildless, which rules out the real component ecosystem. The intended v2:

- Lodekit ships **Vite + React + TypeScript + Tailwind** in its own `node_modules` (in the
  Lodekit install dir), **shared by every app** — so the user still never runs a build, but
  apps get the full ecosystem. No per-app `node_modules` (backup tree stays clean).
- Build chain driven **programmatically via the Vite JS API**, not terminal commands.
- Possibly ship/download an **internal Node runtime** so the user needs nothing
  preinstalled.
- A themed **shadcn library exposed as `@lodekit/ui`** via a Vite alias — `import { Button }
  from "@lodekit/ui"`. One theme imported everywhere = consistent design across tools,
  through real shadcn instead of hand-rolled CSS.
- **TanStack** in the toolchain: **Table** (typed, sortable lists) and **Router**
  (once apps go multi-page).
- A **typed `@lodekit/sdk`** package replacing `window.lodekit` — `import { db, store } from
  "@lodekit/sdk"` — so Claude writes correctly-typed code.
- Lodekit watches `apps/`, runs Vite per changed app, serves output from `.cache/<slug>/`
  (disposable, regenerable, outside the backup tree). Dashboard shows
  `building… → ready` over SSE.
- Decide: build-on-change → serve static output, vs. Vite dev-server/HMR per app.

## Other deferred items
- **SSE client registry is a process singleton** — `src/sse.ts` keeps one module-level
  `clients` Set shared across all server instances. Fine for the single-process server,
  but SSE integration tests must tear down client connections before `server.close()`,
  and a multi-instance setup would need per-instance registries.

- **Electron shell + autostart** — clickable desktop app; Lodekit runs at login.
- **True `lodekit.local` / port-free access** — mDNS/Bonjour or a local reverse proxy,
  instead of `lodekit.localhost:7777`.
- **Real secrets storage** — back the `lodekit.secrets.get()` stub with actual encrypted
  storage + a UI to manage secrets.
- **Blob storage** — per-app `data/<slug>/blobs/` for images/files, exposed via the SDK
  and easily browsable in Finder.
- **Multi-page apps + client-side routing** — expand the app contract beyond
  single-page.
- **Per-app git** — initialize/manage a git repo per app or a Lodekit-apps monorepo.
- **Runtime auto-install** — Lodekit checks for / installs Node and other runtime deps.
- **Image/file app icons** — beyond emoji in `lodekit.json`.
- **Monorepo init** — `lodekit init` to set up a pre-existing Lodekit-apps git monorepo.
- **Harden app/dashboard rendering** — the POC builds DOM via `innerHTML` with
  app-controlled strings (manifest name/description, expense notes). Acceptable for a
  single-user local tool, but switch to `textContent`/safe DOM (or sanitize) before any
  multi-user or shared exposure.
