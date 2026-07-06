import { describe, it, expect } from "vitest";
import { parseDuration } from "../src/duration.js";

describe("parseDuration", () => {
  it("parses s/m/h/d", () => {
    expect(parseDuration("30s")).toBe(30_000);
    expect(parseDuration("10m")).toBe(600_000);
    expect(parseDuration("6h")).toBe(21_600_000);
    expect(parseDuration("2d")).toBe(172_800_000);
    expect(parseDuration("1.5h")).toBe(5_400_000);
  });

  it("rejects bad grammar", () => {
    for (const bad of ["", "5", "s", "5 m", "5ms", "-5m", "5mm", "1h30m", "Infinity", "0m"]) {
      expect(() => parseDuration(bad), bad).toThrow(/invalid duration/);
    }
  });
});
