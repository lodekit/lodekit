import { describe, it, expect } from "vitest";
import { validateFieldDef, validateValue, type SettingField } from "../src/settingsSchema.js";

const base = { label: "Show archived", description: "Include archived items in the list." };

describe("validateFieldDef", () => {
  it("accepts each of the five types and returns the field", () => {
    expect(validateFieldDef("a_b", { type: "boolean", ...base, default: false }).type).toBe("boolean");
    expect(validateFieldDef("s", { type: "string", ...base, default: "", maxLength: 10 }).type).toBe("string");
    expect(validateFieldDef("n", { type: "number", ...base, default: 3, min: 0, max: 20, integer: true }).type).toBe("number");
    expect(
      validateFieldDef("sel", {
        type: "select", ...base, default: "grid",
        options: [{ value: "grid", label: "Grid" }, { value: "list", label: "List" }],
      }).type
    ).toBe("select");
    expect(validateFieldDef("d", { type: "duration", ...base, default: "15m", min: "1m" }).type).toBe("duration");
  });

  it("requires label, description, and a valid default", () => {
    expect(() => validateFieldDef("k", { type: "boolean", description: "x", default: true })).toThrow(/label/);
    expect(() => validateFieldDef("k", { type: "boolean", label: "x", default: true })).toThrow(/description/);
    expect(() => validateFieldDef("k", { type: "boolean", ...base })).toThrow(/default/);
    expect(() => validateFieldDef("k", { type: "number", ...base, default: "3" })).toThrow(/default/);
    expect(() => validateFieldDef("k", { type: "duration", ...base, default: "soon" })).toThrow(/default/);
  });

  it("rejects bad keys, unknown types, and bad constraints", () => {
    expect(() => validateFieldDef("Bad-Key", { type: "boolean", ...base, default: true })).toThrow(/key/);
    expect(() => validateFieldDef("k", { type: "color", ...base, default: "#fff" })).toThrow(/type/);
    expect(() => validateFieldDef("k", { type: "number", ...base, default: 5, min: 10, max: 1 })).toThrow(/min/);
    expect(() => validateFieldDef("k", { type: "select", ...base, default: "x", options: [] })).toThrow(/options/);
    expect(() =>
      validateFieldDef("k", { type: "select", ...base, default: "x", options: [{ value: "a", label: "A" }] })
    ).toThrow(/default/);
    expect(() => validateFieldDef("k", { type: "duration", ...base, default: "5m", min: "1h" })).toThrow(/default/);
  });
});

describe("validateValue", () => {
  const num: SettingField = { type: "number", ...base, default: 3, min: 0, max: 20, integer: true };
  const dur: SettingField = { type: "duration", ...base, default: "1h", min: "1m", max: "7d" };
  const sel: SettingField = {
    type: "select", ...base, default: "b",
    options: [{ value: "a", label: "A" }, { value: "b", label: "B" }],
  };

  it("accepts in-range values and returns them", () => {
    expect(validateValue(num, 20)).toBe(20);
    expect(validateValue(dur, "2d")).toBe("2d");
    expect(validateValue(sel, "a")).toBe("a");
    expect(validateValue({ type: "boolean", ...base, default: false }, true)).toBe(true);
    expect(validateValue({ type: "string", ...base, default: "", maxLength: 3 }, "abc")).toBe("abc");
  });

  it("rejects wrong types, out-of-range, non-integers, unknown options", () => {
    expect(() => validateValue(num, "5")).toThrow();
    expect(() => validateValue(num, 21)).toThrow(/at most/);
    expect(() => validateValue(num, 2.5)).toThrow(/integer/);
    expect(() => validateValue(num, NaN)).toThrow();
    expect(() => validateValue(dur, "30s")).toThrow(/at least/);
    expect(() => validateValue(dur, "8d")).toThrow(/at most/);
    expect(() => validateValue(dur, "5 minutes")).toThrow(/duration/);
    expect(() => validateValue(sel, "c")).toThrow(/one of/);
    expect(() => validateValue({ type: "string", ...base, default: "", maxLength: 3 }, "abcd")).toThrow(/at most/);
  });
});
