# Versioning — product semver + dashboard footer

**Date:** 2026-07-06
**Status:** Approved

## 1. Goal

Give Lodekit a product version under semantic versioning, starting at **0.1.0**, and show
it in a dashboard footer as `lodekit v0.1.0 <short commit hash>`. No HTTP surface — the
version reaches each component by hardcoded stamping (imports and build-time defines), so
logging/debugging in any module can attach it without a wire call.

## 2. Version source of truth

One product version, kept in **lockstep** across the workspace: the root `package.json`
and all seven packages (`@lodekit/runtime`, `@lodekit/mcp`, `@lodekit/sdk`,
`@lodekit/skill`, `@lodekit/ui`, `@lodekit/web`, `@lodekit/manager`) are set to `0.1.0`
and bumped together from now on. Each process reads its *own* `package.json` — lockstep
is what makes them agree; there is no cross-package version lookup.

Display is the `package.json` value **verbatim** (`v0.1.0`, not trimmed to `v0.1`), so a
future patch release is visibly distinct with zero formatting logic.

## 3. Commit hash

The short commit hash has two sources, because the packaged payload is a `pnpm deploy`
with no `.git`:

- **Packaged:** `manager/scripts/prepare-bundle.mjs` writes a stamp file
  `build-info.json` — `{ "commit": "<short hash>" }` (from `git rev-parse --short HEAD`
  at bundle time) — into **each** payload dir (`platform/runtime`, `platform/mcp`,
  `platform/skill`), next to that package's `package.json`, so every shipped component
  can resolve the same stamp locally.
- **Dev:** no stamp file exists; the runtime asks git directly
  (`git rev-parse --short HEAD`, cwd = the runtime package dir).
- **Neither** (git missing/failing and no stamp): commit is `null`; the footer shows the
  version alone. Never a crash — build info is diagnostics, not a dependency.

Stamp file wins over git when both exist (the stamp describes what was actually bundled).

## 4. Runtime `buildInfo` module

`packages/runtime/src/buildInfo.ts` exports a lazily-resolved, cached
`getBuildInfo(): { version: string; commit: string | null }`:

- `version` — read from the runtime's own `package.json` (resolved relative to the
  module, so it works from the repo and from the deployed payload alike).
- `commit` — per §3 (stamp → git → `null`).

This is the in-process answer to "what am I running?" — any runtime module (logger,
error reporting, scaffold banners) imports it directly. An HTTP endpoint is explicitly
out of scope; if one is ever needed it mounts this value on a route in one line.

## 5. Dashboard defines + footer

The dashboard is a separate process (app worker), so it gets the values at **build
time**: `buildDashboard`'s target adds two Vite defines alongside the existing
`__LODEKIT_APP_ID__` mechanism (`build.ts` per-target `define:`):

- `__LODEKIT_VERSION__` — JSON-stringified version
- `__LODEKIT_COMMIT__` — JSON-stringified short hash, or `null`

**Dashboard target only** — user-app builds do not receive these defines (no product
internals in app bundles). Freshness holds by construction: the dashboard rebuilds on
every runtime startup, which is the only time version/commit can change.

`dashboard/src/routes/__root.tsx` renders a footer:
`lodekit v0.1.0 abc1234` (hash omitted when `__LODEKIT_COMMIT__` is `null`). Styled as a
quiet single line consistent with the `@lodekit/ui` theme; ambient TS declarations for
the two globals live with the dashboard source, mirroring how `__LODEKIT_APP_ID__` is
declared.

## 6. Other components

- **MCP / manager:** no code change this slice. Each already answers version questions
  from its own (now lockstep) `package.json`; the manager additionally ships the stamp
  in its payload. Wiring version into their logging happens when that logging work
  lands.
- **Apps/SDK:** untouched.

## 7. Testing

- Unit tests for `buildInfo`: stamp file wins over git; git fallback when no stamp;
  `{ commit: null }` when neither resolves; version matches the package's own
  `package.json`.
- Dashboard footer: covered by the define wiring — assert `buildDashboard`'s target
  carries the defines (unit) rather than adding browser-level coverage (a known roadmap
  gap, out of scope here).

## 8. Out of scope

- HTTP version endpoint (add later by mounting `getBuildInfo()` if ever needed).
- Release automation (changelogs, tags, bump tooling) — versions are bumped by hand in
  lockstep for now.
- Manager menu-bar version display; MCP version reporting tools.
