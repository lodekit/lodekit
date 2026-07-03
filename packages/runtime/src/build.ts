import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build, createBuilder } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
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
        "@tanstack/react-query": pkgDir("@tanstack/react-query"),
        "@tanstack/react-router": pkgDir("@tanstack/react-router"),
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
      // Base must match the app's URL prefix so emitted asset paths resolve through appHost.
      viteOptions(path.join(cfg.appsDir, appId), appOutDir(cfg, appId), `/${appId}/`, {
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

// One Start build target: an app (urlBase "/<app-id>") or the dashboard ("/_dashboard").
export interface StartBuildTarget {
  rootDir: string;
  outDir: string;   // cache/<app-id> — client/ and server/ land inside
  urlBase: string;  // no trailing slash
  appId: string;    // __LODEKIT_APP_ID__ define value
}

// Packages the Start ecosystem reaches via deep subpaths (e.g. "@tanstack/react-start/client",
// "@tanstack/react-router/ssr/server") whose exports map redirects into a nested dist folder.
// A plain resolve.alias entry does a literal prefix substitution (pkgDir + "/client"), which
// only happens to work for packages whose subpaths sit flat at the package root (react-dom's
// do); it 404s for anything exports-mapped into a subfolder. Resolve these through Node's own
// ESM exports algorithm instead, anchored at this module's own install.
const DEEP_IMPORT_PACKAGES = [
  "react",
  "react-dom",
  "@tanstack/react-query",
  "@tanstack/react-router",
  "@tanstack/react-start",
  "zod",
];

function packageNameOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

function deepImportResolver() {
  const packages = new Set(DEEP_IMPORT_PACKAGES);
  return {
    name: "lodekit:deep-import-resolver",
    enforce: "pre" as const,
    // import.meta.resolve is environment-blind: it does not consult Vite's per-environment
    // resolve.conditions (client vs ssr). This is safe for the current DEEP_IMPORT_PACKAGES
    // because their condition branches don't diverge; extending the list requires care.
    resolveId(source: string) {
      if (!packages.has(packageNameOf(source))) return undefined;
      try {
        // Synchronous import.meta.resolve (stable since Node ~20.6); earlier versions
        // would silently fall through to default resolution.
        return fileURLToPath(import.meta.resolve(source));
      } catch {
        return undefined;
      }
    },
  };
}

const appAliases = () => ({
  "@lodekit/sdk": pkgDir("@lodekit/sdk"),
  "@lodekit/ui": uiDir,
  "lucide-react": lucideDir,
});

export async function buildStart(t: StartBuildTarget): Promise<void> {
  const builder = await createBuilder({
    root: fs.realpathSync(t.rootDir),
    base: `${t.urlBase}/_build/`, // vite-level base — the plugin's client.base does NOT do this (spike)
    logLevel: "silent",
    define: { __LODEKIT_APP_ID__: JSON.stringify(t.appId) },
    plugins: [
      deepImportResolver(),
      tanstackStart({
        router: { basepath: t.urlBase },
        serverFns: { base: `${t.urlBase}/_serverFn` },
      }),
      react(),
      tailwind(),
    ],
    resolve: { alias: appAliases() },
    environments: {
      client: { build: { outDir: path.join(t.outDir, "client"), emptyOutDir: true } },
      ssr: {
        resolve: { noExternal: true },
        build: { outDir: path.join(t.outDir, "server"), emptyOutDir: true },
      },
    },
  });
  await builder.buildApp();
}
