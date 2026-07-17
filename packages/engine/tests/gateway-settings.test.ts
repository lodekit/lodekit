import { describe, it, expect } from "vitest";
import { PLATFORM_SETTINGS, SECTIONS } from "../src/platformSettings.js";

describe("gateways settings section", () => {
  it("declares the seven gateways.* keys in the Gateways section, all global scope", () => {
    const keys = Object.keys(PLATFORM_SETTINGS).filter((k) => k.startsWith("gateways."));
    expect(keys.sort()).toEqual([
      "gateways.breaker_cooldown",
      "gateways.breaker_failure_threshold",
      "gateways.capture_bodies",
      "gateways.default_concurrency",
      "gateways.default_rate",
      "gateways.default_timeout",
      "gateways.max_response_bytes",
    ]);
    for (const k of keys) {
      expect(PLATFORM_SETTINGS[k].section).toBe("Gateways");
      expect(PLATFORM_SETTINGS[k].scope).toBe("global");
    }
    expect(SECTIONS).toContain("Gateways");
  });
});
