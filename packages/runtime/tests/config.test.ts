import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  beforeEach(() => {
    delete process.env.LODEKIT_ROOT;
    delete process.env.LODEKIT_PORT;
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
});
