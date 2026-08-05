import { describe, it, expect, beforeEach } from "vitest";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  beforeEach(() => {
    delete process.env.LODEKIT_ROOT;
    delete process.env.LODEKIT_PORT;
    delete process.env.LODEKIT_CACHE_DIR;
    delete process.env.LODEKIT_HOST;
  });

  it("derives apps/data dirs and base url from root + port", () => {
    process.env.LODEKIT_ROOT = "/tmp/lodekit-test";
    process.env.LODEKIT_PORT = "9999";
    const cfg = loadConfig();
    expect(cfg.appsDir).toBe(path.join("/tmp/lodekit-test", "apps"));
    expect(cfg.dataDir).toBe(path.join("/tmp/lodekit-test", "data"));
    expect(cfg.port).toBe(9999);
    expect(cfg.baseUrl).toBe("http://lodekit.localhost:9999");
  });

  it("defaults port to 7777", () => {
    process.env.LODEKIT_ROOT = "/tmp/lodekit-test";
    expect(loadConfig().port).toBe(7777);
  });

  it("uses LODEKIT_CACHE_DIR when set, resolved to an absolute path", () => {
    process.env.LODEKIT_ROOT = "/tmp/lodekit-test";
    process.env.LODEKIT_CACHE_DIR = "/tmp/lodekit-cache";
    expect(loadConfig().cacheDir).toBe("/tmp/lodekit-cache");
  });

  it("defaults cacheDir under the home cache dir, outside the root", () => {
    process.env.LODEKIT_ROOT = "/tmp/lodekit-test";
    delete process.env.LODEKIT_CACHE_DIR;
    const cfg = loadConfig();
    expect(cfg.cacheDir).toBe(path.join(os.homedir(), "Library", "Caches", "Lodekit"));
    expect(cfg.cacheDir.startsWith(cfg.root)).toBe(false);
  });

  it("defaults cache and state to the macOS-native dirs", () => {
    delete process.env.LODEKIT_CACHE_DIR;
    delete process.env.LODEKIT_STATE_DIR;
    const cfg = loadConfig();
    expect(cfg.cacheDir).toBe(path.join(os.homedir(), "Library", "Caches", "Lodekit"));
    expect(cfg.stateDir).toBe(path.join(os.homedir(), "Library", "Application Support", "Lodekit"));
  });

  it("honors LODEKIT_STATE_DIR", () => {
    process.env.LODEKIT_STATE_DIR = "/tmp/lk-state";
    expect(loadConfig().stateDir).toBe(path.resolve("/tmp/lk-state"));
    delete process.env.LODEKIT_STATE_DIR;
  });

  it("defaults secretsKeyProvider by platform", () => {
    delete process.env.LODEKIT_SECRETS_KEY_PROVIDER;
    const cfg = loadConfig();
    expect(cfg.secretsKeyProvider).toBe(process.platform === "darwin" ? "keychain" : "file");
  });

  it("honors LODEKIT_SECRETS_KEY_PROVIDER=file and ignores junk values", () => {
    process.env.LODEKIT_SECRETS_KEY_PROVIDER = "file";
    expect(loadConfig().secretsKeyProvider).toBe("file");
    process.env.LODEKIT_SECRETS_KEY_PROVIDER = "vault9000";
    expect(loadConfig().secretsKeyProvider).toBe(process.platform === "darwin" ? "keychain" : "file");
    delete process.env.LODEKIT_SECRETS_KEY_PROVIDER;
  });

  it("defaults host to IPv4 loopback", () => {
    expect(loadConfig().host).toBe("127.0.0.1");
  });

  it("honors LODEKIT_HOST", () => {
    process.env.LODEKIT_HOST = "0.0.0.0";
    expect(loadConfig().host).toBe("0.0.0.0");
    delete process.env.LODEKIT_HOST;
  });

  it("treats an empty LODEKIT_HOST as unset (fails closed to loopback)", () => {
    process.env.LODEKIT_HOST = "";
    expect(loadConfig().host).toBe("127.0.0.1");
    delete process.env.LODEKIT_HOST;
  });
});
