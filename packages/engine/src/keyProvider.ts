// Master-key providers for the secret-store (spec 2026-07-07-secret-store §4).
// "keychain" (darwin default): one generic-password item created via the
// security CLI — the item's ACL attaches to the CLI, so the dev-tsx vs
// packaged-app code-identity difference never causes prompts. "file"
// (tests, non-darwin): a 0600 hex file under the State dir. A provider
// failure throws SecretsUnavailableError (routes 503) — never a plaintext
// fallback, and losing the key is recoverable by re-entering values.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { Config } from "./config.js";

export class SecretsUnavailableError extends Error {
  constructor(message?: string) {
    super(message ?? "secret store unavailable");
    this.name = "SecretsUnavailableError";
  }
}

const SERVICE = "Lodekit";
const ACCOUNT = "secret-store-master-key";
const KEY_BYTES = 32;

export function getMasterKey(cfg: Config): Buffer {
  try {
    return cfg.secretsKeyProvider === "keychain" ? keychainKey() : fileKey(cfg.stateDir);
  } catch (e) {
    if (e instanceof SecretsUnavailableError) throw e;
    throw new SecretsUnavailableError(
      `secret store unavailable: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

function readKeychain(): string {
  return execFileSync("security", ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function keychainKey(): Buffer {
  try {
    return parseKey(readKeychain());
  } catch {
    // Not found (first use) — create below; a lost race just means the
    // add fails and the re-read returns the winner's key.
  }
  try {
    // The new key rides in argv (-w VALUE), briefly visible to `ps` during this
    // one-time write. Accepted under the spec §2 threat model: same-user processes
    // are trusted and can read this item straight from the Keychain anyway
    // (`security find-generic-password -w`), so argv exposure ≤ the standing read;
    // macOS also hides other users' argv from non-root. `security` has no reliable
    // stdin path, and a native Keychain module would break the buildless runtime.
    execFileSync(
      "security",
      ["add-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w", randomBytes(KEY_BYTES).toString("hex")],
      { stdio: "ignore" }
    );
  } catch {
    // raced or denied — the re-read decides
  }
  return parseKey(readKeychain());
}

function fileKey(stateDir: string): Buffer {
  const file = path.join(stateDir, "secrets.key");
  if (fs.existsSync(file)) return parseKey(fs.readFileSync(file, "utf8").trim());
  fs.mkdirSync(stateDir, { recursive: true });
  const hex = randomBytes(KEY_BYTES).toString("hex");
  fs.writeFileSync(file, `${hex}\n`, { mode: 0o600 });
  return parseKey(hex);
}

function parseKey(hex: string): Buffer {
  const key = Buffer.from(hex, "hex");
  if (key.length !== KEY_BYTES) throw new SecretsUnavailableError("master key is malformed");
  return key;
}
