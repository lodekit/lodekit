# KMR Roadmap

Deferred work and known gaps. Parked items from the POC design
(`docs/specs/2026-06-30-kmr-poc-design.md`).

## Guiding principle

The user should never rely on dev servers or terminal build commands. KMR ships a
runtime / web server, and tools are built *on KMR as the SDK* and run inside that
instance (one shared instance; per-app instances only if ever proven necessary). KMR
controls the build chain **programmatically (via code, not shell commands)** — to the
point of possibly shipping with an internal Node runtime, or downloading one on first
run.

## Next major step: KMR-owned shared build toolchain

The POC is buildless, which rules out the real component ecosystem. The intended v2:

- KMR ships **Vite + React + TypeScript + Tailwind** in its own `node_modules` (in the
  KMR install dir), **shared by every app** — so the user still never runs a build, but
  apps get the full ecosystem. No per-app `node_modules` (backup tree stays clean).
- Build chain driven **programmatically via the Vite JS API**, not terminal commands.
- Possibly ship/download an **internal Node runtime** so the user needs nothing
  preinstalled.
- A themed **shadcn library exposed as `@kmr/ui`** via a Vite alias — `import { Button }
  from "@kmr/ui"`. One theme imported everywhere = consistent design across tools,
  through real shadcn instead of hand-rolled CSS.
- **TanStack** in the toolchain: **Table** (typed, sortable lists) and **Router**
  (once apps go multi-page).
- A **typed `@kmr/sdk`** package replacing `window.kmr` — `import { db, store } from
  "@kmr/sdk"` — so Claude writes correctly-typed code.
- KMR watches `apps/`, runs Vite per changed app, serves output from `.cache/<slug>/`
  (disposable, regenerable, outside the backup tree). Dashboard shows
  `building… → ready` over SSE.
- Decide: build-on-change → serve static output, vs. Vite dev-server/HMR per app.

## Other deferred items

- **Electron shell + autostart** — clickable desktop app; KMR runs at login.
- **True `kmr.local` / port-free access** — mDNS/Bonjour or a local reverse proxy,
  instead of `kmr.localhost:7777`.
- **Real secrets storage** — back the `kmr.secrets.get()` stub with actual encrypted
  storage + a UI to manage secrets.
- **Blob storage** — per-app `data/<slug>/blobs/` for images/files, exposed via the SDK
  and easily browsable in Finder.
- **Multi-page apps + client-side routing** — expand the app contract beyond
  single-page.
- **Per-app git** — initialize/manage a git repo per app or a KMR-apps monorepo.
- **Runtime auto-install** — KMR checks for / installs Node and other runtime deps.
- **Image/file app icons** — beyond emoji in `kmr.json`.
- **Monorepo init** — `kmr init` to set up a pre-existing KMR-apps git monorepo.
