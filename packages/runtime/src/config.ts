import os from "node:os";
import path from "node:path";

export interface Config {
  root: string;
  appsDir: string;
  dataDir: string;
  cacheDir: string;
  stateDir: string;
  port: number;
  baseUrl: string;
}

// macOS-native canon (spec §3): Caches for regenerable built output, Application
// Support for platform State (logs.sqlite). A Linux/XDG branch slots in here later.
function platformPaths(homedir: string): { cacheDir: string; stateDir: string } {
  return {
    cacheDir: path.join(homedir, "Library", "Caches", "Lodekit"),
    stateDir: path.join(homedir, "Library", "Application Support", "Lodekit"),
  };
}

export function loadConfig(): Config {
  const root = process.env.LODEKIT_ROOT
    ? path.resolve(process.env.LODEKIT_ROOT)
    : path.join(os.homedir(), "Documents", "Lodekit");
  const port = Number(process.env.LODEKIT_PORT ?? 7777);
  const defaults = platformPaths(os.homedir());
  const cacheDir = process.env.LODEKIT_CACHE_DIR
    ? path.resolve(process.env.LODEKIT_CACHE_DIR)
    : defaults.cacheDir;
  const stateDir = process.env.LODEKIT_STATE_DIR
    ? path.resolve(process.env.LODEKIT_STATE_DIR)
    : defaults.stateDir;
  return {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir,
    stateDir,
    port,
    baseUrl: `http://lodekit.localhost:${port}`,
  };
}
