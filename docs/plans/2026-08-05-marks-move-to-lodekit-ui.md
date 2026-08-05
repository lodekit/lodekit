# Move the mark vectors to @lodekit/ui (issue #161)

**Problem.** `web/docs` (Apache-2.0) imports `MARK_BODIES` from `@lodekit/engine/marks`
(AGPL-3.0-only), so the deployed docs site is an AGPL-derived artifact — contradicting
`LICENSING.md`'s boundary rule. Filed as #161 (public-readiness blocker P0-6).

**Fix.** Move `packages/engine/src/marks.ts` → `packages/ui/src/marks.ts`, exposed as
`@lodekit/ui/marks`. `@lodekit/ui` is Apache-2.0 and the engine already depends on it
(no new dependency edges). `web/docs` and `web/main` each used the engine *only* for
marks, so both swap that dependency for `@lodekit/ui`; `web/docs`'s dependency graph
goes fully permissive. The engine's NodeNext resolution needs an exports map for the
extensionless subpath, so `@lodekit/ui` gains one (`.`, `./marks`, `./icons`, and a
`./*` passthrough that keeps direct-file imports like `theme.css` working).

**Decisions.**
- Wholesale move: the favicon builders (`markFaviconSvg`, `emojiFaviconSvg`) travel with
  the vector data — pure string functions, dependency-free; splitting the file would add
  a second module for no benefit.
- `favicon.test.ts` stays in `packages/engine/tests` (it boots the engine server and
  settings store — route-coupled); only its import path changes.

## Tasks

1. **Move + rewire.** `git mv` the file; update imports to `@lodekit/ui/marks` in
   engine `src/server.ts`, dashboard `logo.tsx`, engine `tests/favicon.test.ts`,
   `web/docs/src/components/SiteTitle.astro`, `web/main` (`Lockup.astro`,
   `HowItGoes.astro`, `ArchitecturePrint.astro`, `scripts/gen-brand-assets.mjs`).
   Drop `"./marks"` from engine's exports map. Swap `@lodekit/engine` → `@lodekit/ui`
   in `web/docs` deps and `web/main` deps+devDeps; retarget `web/main`'s
   `ssr.noExternal` to `@lodekit/ui`. Refresh the stale path references in the marks
   header comment and `gen-brand-assets.mjs`.
2. **Licensing bookkeeping.** `REUSE.toml`: give `packages/ui/marks.ts` its own
   annotation (Apache-2.0; Lodekit Authors + Google LLC), leaving the PR #192 block
   covering the web/main brand assets and favicon. `LICENSING.md` table needs no change
   (packages/ui is already listed Apache-2.0).
3. **Verify + PR.** `pnpm install`; engine + ui vitest; `web-docs` and `web-main`
   builds; `pnpm e2e`; `reuse lint`. PR closes #161.
