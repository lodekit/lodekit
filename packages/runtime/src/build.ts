import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
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
// lucide-react is @lodekit/ui's dependency, not the runtime's — resolve the exact copy
// the vendored components themselves use, so apps and components share one icon set.
const uiDir = pkgDir("@lodekit/ui");
const uiRequire = createRequire(path.join(uiDir, "package.json"));
const lucideDir = path.dirname(uiRequire.resolve("lucide-react/package.json"));

const DASHBOARD_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "dashboard"
);

function viteOptions(rootDir: string, outDir: string, base = "/") {
  return {
    // Resolve symlinks (e.g. macOS os.tmpdir()'s /var -> /private/var) so Vite's
    // root and the on-disk app files agree on a canonical path; otherwise Rollup's
    // relative-path computation for emitted HTML can produce paths that escape outDir.
    root: fs.realpathSync(rootDir),
    base,
    logLevel: "silent" as const,
    plugins: [react(), tailwind()],
    resolve: {
      alias: {
        react: pkgDir("react"),
        "react-dom": pkgDir("react-dom"),
        "@lodekit/sdk": pkgDir("@lodekit/sdk"),
        "@lodekit/ui": uiDir,
        "lucide-react": lucideDir,
      },
    },
    build: { outDir, emptyOutDir: true },
  };
}

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

// Runs one Vite build for a slug. Never throws — build failures become error state.
async function runBuild(cfg: Config, slug: string): Promise<BuildState> {
  setState(slug, { status: "building" });
  try {
    await build(viteOptions(path.join(cfg.appsDir, slug), appOutDir(cfg, slug)));
    setState(slug, { status: "ready" });
  } catch (e) {
    setState(slug, { status: "error", message: e instanceof Error ? e.message : String(e) });
  }
  return states.get(slug)!;
}

const chains = new Map<string, Promise<BuildState>>();

// Serialize builds per slug so concurrent triggers never run two Vite builds against the
// same outDir (emptyOutDir would race). A trigger during an in-flight build chains a single
// rebuild after it settles. runBuild never rejects, so the chain never rejects.
export function buildApp(cfg: Config, slug: string): Promise<BuildState> {
  const prev = chains.get(slug) ?? Promise.resolve(undefined as unknown as BuildState);
  const next = prev.then(() => runBuild(cfg, slug));
  chains.set(slug, next);
  void next.finally(() => { if (chains.get(slug) === next) chains.delete(slug); });
  return next;
}

export async function buildAll(cfg: Config): Promise<void> {
  for (const app of scanApps(cfg.appsDir)) {
    await buildApp(cfg, app.slug);
  }
}

export function dropBuild(cfg: Config, slug: string): void {
  states.delete(slug);
  chains.delete(slug);
  fs.rmSync(appOutDir(cfg, slug), { recursive: true, force: true });
}

export type DashboardState = { status: "ready" } | { status: "error"; message: string };

let dashboardState: DashboardState | undefined;

export function getDashboardState(): DashboardState | undefined {
  return dashboardState;
}

// Builds Lodekit's own dashboard through the same pipeline apps use. `_dashboard` sits
// outside the slug grammar, so it can never collide with an app's cache entry or URL.
export async function buildDashboard(cfg: Config): Promise<DashboardState> {
  try {
    await build(viteOptions(DASHBOARD_ROOT, path.join(cfg.cacheDir, "_dashboard"), "/_dashboard/"));
    dashboardState = { status: "ready" };
  } catch (e) {
    dashboardState = { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
  return dashboardState;
}
