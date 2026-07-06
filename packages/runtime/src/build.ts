import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createBuilder } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import type { Config } from "./config.js";
import { broadcast } from "./sse.js";
import { scanApps } from "./registry.js";
import { startAppWorker, stopAppWorker } from "./appWorker.js";
import { getBuildInfo } from "./buildInfo.js";

const require = createRequire(import.meta.url);
// Point Vite at the runtime's copy of each package so apps (which have no
// node_modules) resolve bare imports into Lodekit's shared install.
const pkgDir = (id: string) => path.dirname(require.resolve(`${id}/package.json`));
// lucide-react is @lodekit/ui's dependency, not the runtime's — resolve the exact copy
// the vendored components themselves use, so apps and components share one icon set.
export const uiDir = pkgDir("@lodekit/ui");
const uiRequire = createRequire(path.join(uiDir, "package.json"));
const lucideDir = path.dirname(uiRequire.resolve("lucide-react/package.json"));

const DASHBOARD_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "dashboard"
);

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

// Runs one Start build for an app id. Never throws — build failures become error state.
async function runBuild(cfg: Config, appId: string): Promise<BuildState> {
  setState(appId, { status: "building" });
  try {
    await buildStart({
      rootDir: path.join(cfg.appsDir, appId),
      outDir: appOutDir(cfg, appId),
      urlBase: `/${appId}`,
      appId,
      themeOverrideFiles: [
        path.join(cfg.root, "theme.css"),
        path.join(cfg.appsDir, appId, "theme.css"),
      ],
    });
    setState(appId, { status: "ready" });
    startAppWorker(cfg, appId);
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

// Resolves once no app build is in flight. Builds are fire-and-forget (the watcher calls
// buildApp without awaiting), so a caller tearing down the runtime must drain them before
// removing files on disk — a build whose createBuilder runs after its rootDir is gone
// throws ENOENT. Chains self-delete on settle and, with the watcher already closed, no new
// ones are queued, so this terminates.
export async function idleBuilds(): Promise<void> {
  while (chains.size) await Promise.allSettled([...chains.values()]);
}

export async function buildAll(cfg: Config): Promise<void> {
  for (const app of scanApps(cfg.appsDir)) {
    await buildApp(cfg, app.appId);
  }
}

export function dropBuild(cfg: Config, appId: string): void {
  states.delete(appId);
  chains.delete(appId);
  stopAppWorker(appId);
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
    const info = getBuildInfo();
    await buildStart({
      rootDir: DASHBOARD_ROOT,
      outDir: path.join(cfg.cacheDir, "_dashboard"),
      urlBase: "/_dashboard",
      appId: "_dashboard",
      defines: {
        __LODEKIT_VERSION__: JSON.stringify(info.version),
        __LODEKIT_COMMIT__: JSON.stringify(info.commit),
      },
      themeOverrideFiles: [path.join(cfg.root, "theme.css")],
    });
    dashboardState = { status: "ready" };
    startAppWorker(cfg, "_dashboard");
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
  defines?: Record<string, string>; // extra Vite defines — dashboard-only today (spec §5)
  // Person's theme override files (absolute), cascade order — later wins. Missing
  // files are skipped; the composed result replaces @lodekit/ui/theme-overrides.css.
  themeOverrideFiles?: string[];
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

const appAliases = (themeOverridesFile: string) => [
  { find: "@lodekit/ui/theme-overrides.css", replacement: themeOverridesFile },
  { find: "@lodekit/sdk", replacement: pkgDir("@lodekit/sdk") },
  { find: "@lodekit/ui", replacement: uiDir },
  { find: "lucide-react", replacement: lucideDir },
];

export async function buildStart(t: StartBuildTarget): Promise<void> {
  const themeOverridesFile = path.join(t.outDir, "theme-overrides.css");
  fs.mkdirSync(t.outDir, { recursive: true });
  fs.writeFileSync(
    themeOverridesFile,
    (t.themeOverrideFiles ?? [])
      .filter((f) => fs.existsSync(f))
      .map((f) => `/* ${f} */\n${fs.readFileSync(f, "utf8")}`)
      .join("\n")
  );
  const builder = await createBuilder({
    root: fs.realpathSync(t.rootDir),
    base: `${t.urlBase}/_build/`, // vite-level base — the plugin's client.base does NOT do this (spike)
    logLevel: "silent",
    define: { __LODEKIT_APP_ID__: JSON.stringify(t.appId), ...t.defines },
    plugins: [
      deepImportResolver(),
      tanstackStart({
        router: { basepath: t.urlBase },
        serverFns: { base: `${t.urlBase}/_serverFn` },
      }),
      react(),
      tailwind(),
    ],
    resolve: { alias: appAliases(themeOverridesFile) },
    environments: {
      client: { build: { outDir: path.join(t.outDir, "client"), emptyOutDir: true } },
      ssr: {
        resolve: { noExternal: true },
        build: {
          outDir: path.join(t.outDir, "server"),
          emptyOutDir: true,
          // Vite's default SSR filenames pick .js vs .mjs by sniffing the nearest
          // package.json "type" field *above the app's source dir* (real Lodekit apps —
          // and even these examples — have no such ancestor, so it silently emits
          // server.mjs, breaking appWorker's fixed "server.js" lookup). Force .js here;
          // the sibling package.json below makes Node parse it as ESM regardless of
          // where the cache dir happens to sit on disk.
          rollupOptions: {
            output: { entryFileNames: "[name].js", chunkFileNames: "assets/[name]-[hash].js" },
          },
        },
      },
    },
  });
  await builder.buildApp();
  fs.writeFileSync(path.join(t.outDir, "package.json"), JSON.stringify({ type: "module" }));
}
