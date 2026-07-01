import os from "node:os";
import path from "node:path";

export interface Config {
  root: string;
  appsDir: string;
  dataDir: string;
  cacheDir: string;
  port: number;
  baseUrl: string;
}

export function loadConfig(): Config {
  const root = process.env.LODEKIT_ROOT
    ? path.resolve(process.env.LODEKIT_ROOT)
    : path.join(os.homedir(), "Documents", "Lodekit");
  const port = Number(process.env.LODEKIT_PORT ?? 7777);
  const cacheDir = process.env.LODEKIT_CACHE_DIR
    ? path.resolve(process.env.LODEKIT_CACHE_DIR)
    : path.join(os.homedir(), ".cache", "lodekit");
  return {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir,
    port,
    baseUrl: `http://lodekit.localhost:${port}`,
  };
}
