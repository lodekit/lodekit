import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getMasterKey, SecretsUnavailableError } from "../src/keyProvider.js";
import type { Config } from "../src/config.js";

function fileCfg(stateDir: string): Config {
  return {
    root: "/x", appsDir: "/x/apps", dataDir: "/x/data", cacheDir: "/x/cache",
    stateDir, port: 0, baseUrl: "http://localhost:0", secretsKeyProvider: "file", gatewaysDir: "/x/gateways",
  };
}

describe("file key provider", () => {
  it("creates a 32-byte key on first use, 0600, and returns the same key thereafter", () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-key-"));
    const k1 = getMasterKey(fileCfg(stateDir));
    expect(k1.length).toBe(32);
    const mode = fs.statSync(path.join(stateDir, "secrets.key")).mode & 0o777;
    expect(mode).toBe(0o600);
    const k2 = getMasterKey(fileCfg(stateDir));
    expect(k2.equals(k1)).toBe(true);
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  it("creates the state dir if missing", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "lk-key-"));
    const stateDir = path.join(base, "nested", "state");
    expect(getMasterKey(fileCfg(stateDir)).length).toBe(32);
    fs.rmSync(base, { recursive: true, force: true });
  });

  it("throws SecretsUnavailableError on a malformed key file", () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-key-"));
    fs.writeFileSync(path.join(stateDir, "secrets.key"), "not-hex-at-all\n");
    expect(() => getMasterKey(fileCfg(stateDir))).toThrow(SecretsUnavailableError);
    fs.rmSync(stateDir, { recursive: true, force: true });
  });
});
