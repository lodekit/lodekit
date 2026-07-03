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

function viteOptions(rootDir: string, outDir: string, base = "/", define?: Record<string, string>) {
  return {
    // Resolve symlinks (e.g. macOS os.tmpdir()'s /var -> /private/var) so Vite's
    // root and the on-disk app files agree on a canonical path; otherwise Rollup's
    // relative-path computation for emitted HTML can produce paths that escape outDir.
    root: fs.realpathSync(rootDir),
    base,
    logLevel: "silent" as const,
    define,
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

export function getBuildState(appId: string): BuildState | undefined {
  return states.get(appId);
}

function setState(appId: string, state: BuildState): void {
  states.set(appId, state);
  broadcast(
    state.status,
    state.status === "error" ? { appId, message: state.message } : { appId }
  );
}

function appOutDir(cfg: Config, appId: string): string {
  return path.join(cfg.cacheDir, appId);
}

// Runs one Vite build for an app id. Never throws — build failures become error state.
async function runBuild(cfg: Config, appId: string): Promise<BuildState> {
  setState(appId, { status: "building" });
  try {
    await build(
      viteOptions(path.join(cfg.appsDir, appId), appOutDir(cfg, appId), "/", {
        __LODEKIT_APP_ID__: JSON.stringify(appId),
      })
    );
    setState(appId, { status: "ready" });
  } catch (e) {
    setState(appId, { status: "error", message: e instanceof Error ? e.message : String(e) });
  }
  return states.get(appId)!;
}

const chains = new Map<string, Promise<BuildState>>();

// Serialize builds per app id so concurrent triggers never run two Vite builds against the
// same outDir (emptyOutDir would race). A trigger during an in-flight build chains a single
// rebuild after it settles. runBuild never rejects, so the chain never rejects.
export function buildApp(cfg: Config, appId: string): Promise<BuildState> {
  const prev = chains.get(appId) ?? Promise.resolve(undefined as unknown as BuildState);
  const next = prev.then(() => runBuild(cfg, appId));
  chains.set(appId, next);
  void next.finally(() => { if (chains.get(appId) === next) chains.delete(appId); });
  return next;
}

export async function buildAll(cfg: Config): Promise<void> {
  for (const app of scanApps(cfg.appsDir)) {
    await buildApp(cfg, app.appId);
  }
}

export function dropBuild(cfg: Config, appId: string): void {
  states.delete(appId);
  chains.delete(appId);
  fs.rmSync(appOutDir(cfg, appId), { recursive: true, force: true });
}

export type DashboardState = { status: "ready" } | { status: "error"; message: string };

let dashboardState: DashboardState | undefined;

export function getDashboardState(): DashboardState | undefined {
  return dashboardState;
}

// Builds Lodekit's own dashboard through the same pipeline apps use. `_dashboard` sits
// outside the app id grammar, so it can never collide with an app's cache entry or URL.
export async function buildDashboard(cfg: Config): Promise<DashboardState> {
  try {
    await build(viteOptions(DASHBOARD_ROOT, path.join(cfg.cacheDir, "_dashboard"), "/_dashboard/"));
    dashboardState = { status: "ready" };
  } catch (e) {
    dashboardState = { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
  return dashboardState;
}
