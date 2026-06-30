import fs from "node:fs";
import chokidar, { type FSWatcher } from "chokidar";
import type { Config } from "./config.js";
import { broadcast } from "./sse.js";
import { scanApps } from "./registry.js";

export function startWatcher(cfg: Config): FSWatcher {
  fs.mkdirSync(cfg.appsDir, { recursive: true });
  const notify = () => broadcast("apps-changed", scanApps(cfg.appsDir));
  const watcher = chokidar.watch(cfg.appsDir, { ignoreInitial: true, depth: 2 });
  watcher
    .on("add", notify)
    .on("change", notify)
    .on("unlink", notify)
    .on("addDir", notify)
    .on("unlinkDir", notify);
  return watcher;
}
