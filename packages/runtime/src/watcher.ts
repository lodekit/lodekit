import fs from "node:fs";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import type { Config } from "./config.js";
import { broadcast } from "./sse.js";
import { scanApps } from "./registry.js";
import { buildApp, dropBuild } from "./build.js";

const DEBOUNCE_MS = 150;

export function startWatcher(cfg: Config): FSWatcher {
  fs.mkdirSync(cfg.appsDir, { recursive: true });
  const timers = new Map<string, NodeJS.Timeout>();

  const slugOf = (p: string): string | undefined => {
    const rel = path.relative(cfg.appsDir, p);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return undefined;
    return rel.split(path.sep)[0] || undefined;
  };

  const notify = () => broadcast("apps-changed", scanApps(cfg.appsDir));

  const rebuild = (slug: string) => {
    clearTimeout(timers.get(slug));
    timers.set(
      slug,
      setTimeout(() => {
        timers.delete(slug);
        void buildApp(cfg, slug);
      }, DEBOUNCE_MS)
    );
  };

  const onChange = (p: string) => {
    notify();
    const slug = slugOf(p);
    if (slug) rebuild(slug);
  };

  const watcher = chokidar.watch(cfg.appsDir, { ignoreInitial: true, depth: 2 });
  watcher
    .on("add", onChange)
    .on("change", onChange)
    .on("unlink", onChange)
    .on("addDir", onChange)
    .on("unlinkDir", (p) => {
      notify();
      const rel = path.relative(cfg.appsDir, p);
      if (rel && !rel.includes(path.sep)) dropBuild(cfg, rel); // top-level app folder removed
    });
  return watcher;
}
