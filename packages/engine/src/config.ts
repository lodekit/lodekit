import os from "node:os";
import path from "node:path";

export interface Config {
  root: string;
  appsDir: string;
  dataDir: string;
  cacheDir: string;
  stateDir: string;
  port: number;
  // Bind host for the HTTP listener. Loopback by default (issue #87); LODEKIT_HOST is
  // the deliberate LAN-exposure escape hatch. Optional so test Config literals need not
  // set it — start() falls back to loopback when absent.
  host?: string;
  baseUrl: string;
  secretsKeyProvider: "keychain" | "file";
  gatewaysDir: string;
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
  // Secret-store master-key provider (secret-store spec §4): keychain on darwin,
  // 0600 key file elsewhere; tests force "file" to never touch the real Keychain.
  const envProvider = process.env.LODEKIT_SECRETS_KEY_PROVIDER;
  const secretsKeyProvider: "keychain" | "file" =
    envProvider === "keychain" || envProvider === "file"
      ? envProvider
      : process.platform === "darwin" ? "keychain" : "file";
  const gatewaysDir = path.join(root, "gateways");
  return {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir,
    stateDir,
    port,
    // || not ??: an empty LODEKIT_HOST must fail closed to loopback — Node treats
    // a falsy listen host as the wildcard (every interface).
    host: process.env.LODEKIT_HOST || "127.0.0.1",
    baseUrl: `http://lodekit.localhost:${port}`,
    secretsKeyProvider,
    gatewaysDir,
  };
}
