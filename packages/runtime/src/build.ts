import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createBuilder, build } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import type { Config } from "./config.js";
import { emitEvent, PLATFORM_NS } from "./events.js";
import { scanApps } from "./registry.js";
import { startAppWorker, stopAppWorker } from "./appWorker.js";
import { getBuildInfo } from "./buildInfo.js";
import { emitLog } from "./logger.js";

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
  emitEvent({ ns: appId, source: PLATFORM_NS, type: "build-state", payload: { ...state } });
  if (state.status === "error") emitLog("error", "build", "build failed", { stack: state.message }, appId);
  else if (state.status === "ready") emitLog("info", "build", "build ready", undefined, appId);
  else emitLog("debug", "build", "build started", undefined, appId);
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

// Shared by both buildApp (keyed by app id) and buildDashboard (keyed by "_dashboard",
// outside the app id grammar — see buildDashboard below). Value type is loose because the
// two build kinds resolve different state shapes; each chain only awaits its predecessor
// for ordering, never reads its resolved value.
const chains = new Map<string, Promise<unknown>>();

// Serialize builds per app id so concurrent triggers never run two Vite builds against the
// same outDir (emptyOutDir would race). A trigger during an in-flight build chains a single
// rebuild after it settles. runBuild never rejects, so the chain never rejects.
export function buildApp(cfg: Config, appId: string): Promise<BuildState> {
  const prev = chains.get(appId) ?? Promise.resolve();
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

// Runs one dashboard build. Never throws — build failures become error state.
async function runDashboardBuild(cfg: Config): Promise<DashboardState> {
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
    emitEvent({ ns: "_dashboard", source: PLATFORM_NS, type: "build-state", payload: { ...dashboardState } });
    startAppWorker(cfg, "_dashboard");
  } catch (e) {
    dashboardState = { status: "error", message: e instanceof Error ? e.message : String(e) };
    emitEvent({ ns: "_dashboard", source: PLATFORM_NS, type: "build-state", payload: { ...dashboardState } });
  }
  return dashboardState;
}

// Builds Lodekit's own dashboard through the same pipeline apps use. `_dashboard` sits
// outside the app id grammar, so it can never collide with an app's cache entry or URL —
// chained under that key in the same `chains` map buildApp uses, so concurrent triggers
// (e.g. rapid global-theme saves) never race two Vite builds against the same outDir, and
// idleBuilds' shutdown drain waits for an in-flight dashboard build too.
export function buildDashboard(cfg: Config): Promise<DashboardState> {
  const prev = chains.get("_dashboard") ?? Promise.resolve();
  const next = prev.then(() => runDashboardBuild(cfg));
  chains.set("_dashboard", next);
  void next.finally(() => { if (chains.get("_dashboard") === next) chains.delete("_dashboard"); });
  return next;
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

  // The tasks entry (spec §4): src/tasks.ts becomes a separate self-contained ssr
  // bundle beside server.js. A separate small build rather than an extra rollup
  // input — the tanstackStart plugin owns the main ssr input, and the SDK talks
  // to the runtime over loopback HTTP anyway, so the bundles share no state.
  const tasksSource = path.join(fs.realpathSync(t.rootDir), "src", "tasks.ts");
  if (fs.existsSync(tasksSource)) {
    await build({
      configFile: false,
      root: fs.realpathSync(t.rootDir),
      logLevel: "silent",
      define: { __LODEKIT_APP_ID__: JSON.stringify(t.appId), ...t.defines },
      plugins: [deepImportResolver()],
      resolve: { alias: appAliases(themeOverridesFile) },
      ssr: { noExternal: true },
      build: {
        ssr: tasksSource,
        outDir: path.join(t.outDir, "server"),
        emptyOutDir: false, // server.js from the main build lives here
        rollupOptions: {
          output: { entryFileNames: "tasks.js", chunkFileNames: "assets/tasks-[name]-[hash].js" },
        },
      },
    });
  }

  // The settings entry (settings spec §5): src/settings.ts becomes a separate
  // self-contained ssr bundle beside server.js — same mechanism as tasks.js.
  const settingsSource = path.join(fs.realpathSync(t.rootDir), "src", "settings.ts");
  if (fs.existsSync(settingsSource)) {
    await build({
      configFile: false,
      root: fs.realpathSync(t.rootDir),
      logLevel: "silent",
      define: { __LODEKIT_APP_ID__: JSON.stringify(t.appId), ...t.defines },
      plugins: [deepImportResolver()],
      resolve: { alias: appAliases(themeOverridesFile) },
      ssr: { noExternal: true },
      build: {
        ssr: settingsSource,
        outDir: path.join(t.outDir, "server"),
        emptyOutDir: false,
        rollupOptions: {
          output: { entryFileNames: "settings.js", chunkFileNames: "assets/settings-[name]-[hash].js" },
        },
      },
    });
  }

  fs.writeFileSync(path.join(t.outDir, "package.json"), JSON.stringify({ type: "module" }));
}
