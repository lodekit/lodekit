import { describe, it, expect } from "vitest";
import { PLATFORM_SETTINGS, PLATFORM_KEY_RE, SECTIONS } from "../src/platformSettings.js";
import { validateFieldDef } from "../src/settingsSchema.js";

describe("platform catalog", () => {
  it("every key matches the namespaced grammar and every field validates", () => {
    for (const [key, s] of Object.entries(PLATFORM_SETTINGS)) {
      expect(key, key).toMatch(PLATFORM_KEY_RE);
      // validateFieldDef takes a bare key — validate the field under a stand-in.
      expect(() => validateFieldDef(key.split(".")[1], s.field), key).not.toThrow();
      expect(SECTIONS, key).toContain(s.section);
    }
  });

  it("carries the spec §6 anchors with the right scope and defaults", () => {
    expect(PLATFORM_SETTINGS["general.start_at_login"]).toMatchObject({ scope: "global", section: "General" });
    expect(PLATFORM_SETTINGS["appearance.theme"].field.default).toBe("system");
    expect(PLATFORM_SETTINGS["appearance.icon_style"].field.default).toBe("b");
    expect(PLATFORM_SETTINGS["tasks.default_retries"]).toMatchObject({ scope: "per-app" });
    expect(PLATFORM_SETTINGS["tasks.default_retries"].field.default).toBe(3);
    expect(PLATFORM_SETTINGS["tasks.dispatch_poll"]).toMatchObject({ scope: "global" });
    expect(PLATFORM_SETTINGS["tasks.dispatch_poll"].field.advanced).toBe(true);
    expect(PLATFORM_SETTINGS["logs.retention_age"].field.default).toBe("7d");
    expect(PLATFORM_SETTINGS["logs.retention_max_rows"]).toMatchObject({ scope: "global" });
    expect(PLATFORM_SETTINGS["events.retention_age"].field.default).toBe("30d");
    expect(PLATFORM_SETTINGS["kv.list_limit"].field.default).toBe(1000);
    expect(PLATFORM_SETTINGS["hosting.request_timeout"].field.default).toBe("30s");
    // inherently-global loops are never per-app
    for (const k of Object.keys(PLATFORM_SETTINGS).filter((k) => k.endsWith("sweep_interval"))) {
      expect(PLATFORM_SETTINGS[k].scope, k).toBe("global");
    }
  });

  it("every setting has the one-liner description", () => {
    for (const [key, s] of Object.entries(PLATFORM_SETTINGS)) {
      expect(s.field.description.length, key).toBeGreaterThan(10);
    }
  });
});
