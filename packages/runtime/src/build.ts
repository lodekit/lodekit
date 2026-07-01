import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import type { Config } from "./config.js";
import { broadcast } from "./sse.js";
import { scanApps } from "./registry.js";

const require = createRequire(import.meta.url);
// Point Vite at the runtime's copy of each package so apps (which have no
// node_modules) resolve bare imports into Lodekit's shared install.
const pkgDir = (id: string) => path.dirname(require.resolve(`${id}/package.json`));

export type BuildState =
  | { status: "building" }
  | { status: "ready" }
  | { status: "error"; message: string };

const states = new Map<string, BuildState>();

export function getBuildState(slug: string): BuildState | undefined {
  return states.get(slug);
}

function setState(slug: string, state: BuildState): void {
  states.set(slug, state);
  broadcast(
    state.status,
    state.status === "error" ? { slug, message: state.message } : { slug }
  );
}

function appOutDir(cfg: Config, slug: string): string {
  return path.join(cfg.cacheDir, slug);
}

export async function buildApp(cfg: Config, slug: string): Promise<BuildState> {
  // Resolve symlinks (e.g. macOS os.tmpdir()'s /var -> /private/var) so Vite's
  // root and the on-disk app files agree on a canonical path; otherwise Rollup's
  // relative-path computation for emitted HTML can produce paths that escape outDir.
  const appDir = fs.realpathSync(path.join(cfg.appsDir, slug));
  setState(slug, { status: "building" });
  try {
    await build({
      root: appDir,
      logLevel: "silent",
      plugins: [react(), tailwind()],
      resolve: {
        alias: {
          react: pkgDir("react"),
          "react-dom": pkgDir("react-dom"),
          "@lodekit/sdk": pkgDir("@lodekit/sdk"),
        },
      },
      build: { outDir: appOutDir(cfg, slug), emptyOutDir: true },
    });
    setState(slug, { status: "ready" });
  } catch (e) {
    setState(slug, { status: "error", message: e instanceof Error ? e.message : String(e) });
  }
  return states.get(slug)!;
}

export async function buildAll(cfg: Config): Promise<void> {
  for (const app of scanApps(cfg.appsDir)) {
    await buildApp(cfg, app.slug);
  }
}

export function dropBuild(cfg: Config, slug: string): void {
  states.delete(slug);
  fs.rmSync(appOutDir(cfg, slug), { recursive: true, force: true });
}
