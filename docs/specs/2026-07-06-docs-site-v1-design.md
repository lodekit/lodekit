# Docs Site v1 (Placeholder) — Design

**Date:** 2026-07-06
**Status:** Approved

## 1. Goal

Ship a working placeholder of the Lodekit docs site on the specced stack (Astro +
Starlight). "Working placeholder" means: the app scaffolds, runs in dev, and builds —
no real content, no visual/theme customization, no deploy config.

This slice also resolves the placement contradiction between earlier specs: the
monorepo spec (§7.4) put Starlight *inside* `web/`; the landing-page spec made docs a
*separate package/deployment*. **Decision: two separate Astro apps, organized as
sibling packages under a `web/` directory.** Two deployments (`lodekit.com`,
`docs.lodekit.com`) remain the target.

## 2. Structure

```
web/
  main/   # @lodekit/web-main — the landing site (current web/, moved)
  docs/   # @lodekit/web-docs — new Starlight docs app
```

- `pnpm-workspace.yaml`: member `web` → `web/*`.
- Root `package.json` scripts and CLAUDE.md references to `@lodekit/web` update to
  `@lodekit/web-main`.
- `web/docs` is a stock Starlight app: default theme, minimal sidebar, 2–3 stub pages
  (index + a "Getting started" stub). Docs serve at the root of their own deployment,
  so no `/docs` subpath routing is needed.

## 3. Upgrades

- **Astro 4.16 → 7.0.6** on both apps. Current Starlight (0.41.3) requires Astro ^7;
  Node 24 satisfies Astro 7's `>=22.12.0` engine requirement. The landing is static
  pages + React islands + Tailwind-via-Vite — the shape modern Astro expects — so the
  jump is expected to be a version bump plus fixing any config/`env.d.ts` fallout,
  verified against the real build.
- Everything else in the web stack is already at its latest published version
  (`@astrojs/react` 6.0.1, Tailwind 4.3.2, React 19.2, lucide-react, radix-ui, cva,
  clsx, tailwind-merge) — only a lockfile refresh within existing ranges.

## 4. Out of scope (parked on roadmap)

- Docs content and information architecture.
- Starlight theming / shared design layer with the landing site.
- Deployment/hosting config and `docs.lodekit.com` wiring.

## 5. Verification

- `pnpm --filter @lodekit/web-main dev` / `build` — landing renders unchanged on
  Astro 7.
- `pnpm --filter @lodekit/web-docs dev` / `build` — Starlight serves the stub pages.
- `pnpm install` from the repo root stays clean; root `pnpm test` stays green
  (neither web app is in it).
- `roadmap.md` "Starlight docs" entry updated: scaffold shipped; content, theming,
  and deploy still parked.
