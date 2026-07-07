import { describe, it, expect } from "vitest";
import { defineSettings, boolean, number, select, duration, _bindSettings } from "../src/settings.js";
import type { Settings } from "../src/client.js";

describe("defineSettings", () => {
  it("tags the schema and keeps fields as plain data (structured-clone-safe)", () => {
    const s = defineSettings({
      show_archived: boolean({ label: "Show archived", description: "Include archived items.", default: false }),
      layout: select({
        label: "Layout", description: "Arrangement of the home screen.",
        options: [{ value: "grid", label: "Grid" }, { value: "list", label: "List" }] as const,
        default: "grid",
      }),
      refresh_every: duration({ label: "Refresh", description: "Background refresh interval.", default: "15m", min: "1m" }),
      max_items: number({ label: "Max items", description: "Items shown on the home screen.", default: 20, min: 1, integer: true }),
    });
    expect(s.__lodekitSettings).toBe(true);
    expect(structuredClone(s.fields).layout.options).toHaveLength(2);
    expect(s.fields.refresh_every.type).toBe("duration");
  });

  it("rejects bad keys and missing copy at declaration time", () => {
    const good = { label: "L", description: "Ten chars.", default: true };
    expect(() => defineSettings({ "Bad-Key": boolean(good) } as never)).toThrow(/key/);
    expect(() => defineSettings({ k: { type: "boolean", description: "x", default: true } as never })).toThrow(/label/);
    expect(() => defineSettings({ k: { type: "boolean", label: "x", description: "y" } as never })).toThrow(/default/);
  });

  it("facade delegates to the bound Settings handle", async () => {
    const calls: string[] = [];
    const fake: Settings = {
      get: async (k) => { calls.push(`get:${k}`); return true as never; },
      all: async () => ({ show_archived: true }),
      watch: (cb) => { cb({ key: "show_archived" }); return () => {}; },
    };
    _bindSettings(fake);
    const s = defineSettings({
      show_archived: boolean({ label: "Show archived", description: "Include archived items.", default: false }),
    });
    const v: boolean | undefined = await s.get("show_archived"); // typed: boolean
    expect(v).toBe(true);
    expect(calls).toEqual(["get:show_archived"]);
    expect((await s.all()).show_archived).toBe(true);
    let seen = "";
    s.watch((c) => { seen = c.key; });
    expect(seen).toBe("show_archived");
  });
});
