import fs from "node:fs";
import path from "node:path";
import chokidar from "chokidar";
import type { Config } from "./config.js";
import { broadcast } from "./sse.js";
import { scanApps } from "./registry.js";
import { buildAll, buildApp, buildDashboard, dropBuild } from "./build.js";
import { createLogger } from "./logger.js";

const DEBOUNCE_MS = 150;

// Start's dev-time codegen (routeTree.gen.ts, .tanstack/ scratch files) lands inside an
// app's own rootDir — watching them would retrigger the build that just wrote them.
export const isGeneratedPath = (p: string): boolean =>
  p.endsWith(path.sep + "routeTree.gen.ts") || p.split(path.sep).includes(".tanstack");

export async function startWatcher(cfg: Config): Promise<{ close(): Promise<void> }> {
  fs.mkdirSync(cfg.appsDir, { recursive: true });
  const log = createLogger("watcher");
  const timers = new Map<string, NodeJS.Timeout>();

  const appIdOf = (p: string): string | undefined => {
    const rel = path.relative(cfg.appsDir, p);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return undefined;
    return rel.split(path.sep)[0] || undefined;
  };

  const notify = () => broadcast("apps-changed", scanApps(cfg.appsDir));

  const rebuild = (appId: string) => {
    clearTimeout(timers.get(appId));
    timers.set(
      appId,
      setTimeout(() => {
        timers.delete(appId);
        // The debounced folder may since have been removed entirely (e.g. a rapid
        // rename/delete) — building it would fail on the now-missing rootDir and,
        // since build state is keyed by the bare app id, could clobber a same-named
        // app's fresh state elsewhere. Skip rather than build a folder that's gone.
        if (fs.existsSync(path.join(cfg.appsDir, appId))) {
          log.debug(`rebuilding ${appId}`);
          void buildApp(cfg, appId);
        }
      }, DEBOUNCE_MS)
    );
  };

  const onChange = (p: string) => {
    notify();
    const appId = appIdOf(p);
    if (appId) rebuild(appId);
  };

  const watcher = chokidar.watch(cfg.appsDir, {
    ignoreInitial: true,
    // No depth bound: apps/<id>/src/routes/<file> is already 3 levels down from
    // appsDir, and a shallow depth (e.g. 2) silently drops events for route-file
    // edits — the canonical editing surface — without erroring.
    ignored: (p) => isGeneratedPath(p) || p.split(path.sep).includes("node_modules"),
  });
  watcher
    .on("add", onChange)
    .on("change", onChange)
    .on("unlink", onChange)
    .on("addDir", onChange)
    .on("unlinkDir", (p) => {
      notify();
      const rel = path.relative(cfg.appsDir, p);
      if (rel && !rel.includes(path.sep)) {
        // Top-level app folder removed — cancel any rebuild the preceding file-unlink
        // events already debounced, or it fires later against a now-deleted rootDir
        // (Vite's build() throwing ENOENT) and clobbers a same-named app's fresh state.
        clearTimeout(timers.get(rel));
        timers.delete(rel);
        dropBuild(cfg, rel);
        log.info(`app folder removed: ${rel}`);
      }
    });

  // The person's global theme file sits at the Lodekit root, outside appsDir — a
  // separate depth-0 watch (apps/ and data/ churn stays ignored) that rebuilds
  // everything, since every app and the dashboard composes it in.
  const globalTheme = path.join(cfg.root, "theme.css");
  let globalTimer: NodeJS.Timeout | undefined;
  const onGlobalTheme = () => {
    clearTimeout(globalTimer);
    globalTimer = setTimeout(() => {
      void buildAll(cfg);
      void buildDashboard(cfg);
    }, DEBOUNCE_MS);
  };
  const rootWatcher = chokidar.watch(cfg.root, {
    ignoreInitial: true,
    depth: 0,
    ignored: (p) => p !== cfg.root && p !== globalTheme,
  });
  rootWatcher.on("add", onGlobalTheme).on("change", onGlobalTheme).on("unlink", onGlobalTheme);

  // Resolve only once both watchers have completed their initial scan. Chokidar with
  // ignoreInitial drops add/change events that land before "ready" fires, so returning
  // eagerly leaves a window where an app created right after boot is never built.
  await Promise.all([
    new Promise<void>((r) => watcher.once("ready", () => r())),
    new Promise<void>((r) => rootWatcher.once("ready", () => r())),
  ]);

  return {
    close: async () => {
      clearTimeout(globalTimer);
      // Cancel any in-flight per-app debounce so it can't fire buildApp after close —
      // against a root a caller is about to remove (ENOENT) and clobbering a same-named
      // app's fresh state. The unlinkDir handler clears these per app; close clears the rest.
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      await Promise.all([watcher.close(), rootWatcher.close()]);
    },
  };
}
