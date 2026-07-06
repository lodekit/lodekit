import { describe, it, expect, beforeEach } from "vitest";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  beforeEach(() => {
    delete process.env.LODEKIT_ROOT;
    delete process.env.LODEKIT_PORT;
    delete process.env.LODEKIT_CACHE_DIR;
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
});
