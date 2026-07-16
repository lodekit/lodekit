import fs from "node:fs";
import path from "node:path";
import chokidar from "chokidar";
import type { Config } from "./config.js";
import { emitEvent } from "./events.js";
import { isValidAppId } from "./registry.js";
import { buildApp, dropBuild } from "./build.js";
import { evictApp } from "./taskEngine.js";
import { createLogger } from "./logger.js";
import { reloadGatewayManifests } from "./gatewayManifests.js";
import { emitGatewayEvent } from "./gatewayEvents.js";

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

  let notifyTimer: NodeJS.Timeout | undefined;
  const notify = () => {
    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => {
      emitEvent({ app: null, kind: "engine", component: "registry", type: "apps-changed" });
    }, DEBOUNCE_MS);
  };

  const rebuild = (appId: string) => {
    clearTimeout(timers.get(appId));
    timers.set(
      appId,
      setTimeout(() => {
        timers.delete(appId);
        // The debounced folder may since have been removed entirely (e.g. a rapid
        // rename/delete) — building it would fail on the now-missing rootDir and,
        // since build state is keyed by the bare app id, could clobber a same-named
        // app's fresh state elsewhere. Must also be a real directory: a stray FILE
        // in apps/ with a valid-id shape is never an app root.
        if (fs.statSync(path.join(cfg.appsDir, appId), { throwIfNoEntry: false })?.isDirectory()) {
          log.debug(`rebuilding ${appId}`);
          void buildApp(cfg, appId);
        }
      }, DEBOUNCE_MS)
    );
  };

  const onChange = (p: string) => {
    notify();
    const appId = appIdOf(p);
    // Invalid ids (Finder's .DS_Store, stray dotfiles) can never be apps — scanApps
    // already excludes them; the rebuild path must too.
    if (appId && isValidAppId(appId)) rebuild(appId);
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
      if (rel && !rel.includes(path.sep) && isValidAppId(rel)) {
        // Top-level app folder removed — cancel any rebuild the preceding file-unlink
        // events already debounced, or it fires later against a now-deleted rootDir
        // (Vite's build() throwing ENOENT) and clobbers a same-named app's fresh state.
        clearTimeout(timers.get(rel));
        timers.delete(rel);
        dropBuild(cfg, rel);
        evictApp(rel); // the tasks engine must stop polling the gone app's db
        log.info(`app folder removed: ${rel}`);
      }
    });

  // Themes: <root>/themes/ (theme CSS + config.json). Any change emits a
  // theme-change event on the bus — serve-time delivery means no rebuilds.
  const themesDir = path.join(cfg.root, "themes");
  fs.mkdirSync(themesDir, { recursive: true });
  let themesTimer: NodeJS.Timeout | undefined;
  const themesWatcher = chokidar.watch(themesDir, { ignoreInitial: true, depth: 1 });
  themesWatcher.on("all", () => {
    clearTimeout(themesTimer);
    themesTimer = setTimeout(() => {
      emitEvent({ app: null, kind: "service", component: "themes", type: "theme-change" });
    }, 150);
  });

  // The gateways tree (spec §4): manifest edits re-validate live and announce
  // themselves — the dashboard refetches, the engine reads the new registry
  // entry on the next request. mkdir first: chokidar's ready never fires for
  // a missing path, and materializing an empty gateways/ is harmless.
  fs.mkdirSync(cfg.gatewaysDir, { recursive: true });
  let gatewaysTimer: NodeJS.Timeout | undefined;
  const onGateways = () => {
    clearTimeout(gatewaysTimer);
    gatewaysTimer = setTimeout(() => {
      for (const id of reloadGatewayManifests()) emitGatewayEvent(null, "provider-changed", { provider: id });
    }, DEBOUNCE_MS);
  };
  const gatewaysWatcher = chokidar.watch(cfg.gatewaysDir, { ignoreInitial: true });
  gatewaysWatcher
    .on("add", onGateways).on("change", onGateways).on("unlink", onGateways)
    .on("addDir", onGateways).on("unlinkDir", onGateways);

  // Resolve only once both watchers have completed their initial scan. Chokidar with
  // ignoreInitial drops add/change events that land before "ready" fires, so returning
  // eagerly leaves a window where an app created right after boot is never built.
  await Promise.all([
    new Promise<void>((r) => watcher.once("ready", () => r())),
    new Promise<void>((r) => themesWatcher.once("ready", () => r())),
    new Promise<void>((r) => gatewaysWatcher.once("ready", () => r())),
  ]);

  return {
    close: async () => {
      clearTimeout(themesTimer);
      clearTimeout(notifyTimer);
      clearTimeout(gatewaysTimer);
      // Cancel any in-flight per-app debounce so it can't fire buildApp after close —
      // against a root a caller is about to remove (ENOENT) and clobbering a same-named
      // app's fresh state. The unlinkDir handler clears these per app; close clears the rest.
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      await Promise.all([watcher.close(), themesWatcher.close(), gatewaysWatcher.close()]);
    },
  };
}
