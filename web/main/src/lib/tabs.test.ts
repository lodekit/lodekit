import { describe, expect, it } from "vitest";
import { nextTabIndex } from "./tabs";

describe("nextTabIndex", () => {
  it("advances and wraps forward on ArrowDown/ArrowRight", () => {
    expect(nextTabIndex(0, "ArrowDown", 4)).toBe(1);
    expect(nextTabIndex(3, "ArrowRight", 4)).toBe(0);
  });
  it("retreats and wraps backward on ArrowUp/ArrowLeft", () => {
    expect(nextTabIndex(2, "ArrowUp", 4)).toBe(1);
    expect(nextTabIndex(0, "ArrowLeft", 4)).toBe(3);
  });
  it("jumps to the ends on Home/End", () => {
    expect(nextTabIndex(2, "Home", 4)).toBe(0);
    expect(nextTabIndex(1, "End", 4)).toBe(3);
  });
  it("returns null for keys it doesn't own", () => {
    expect(nextTabIndex(1, "Enter", 4)).toBeNull();
    expect(nextTabIndex(1, "Tab", 4)).toBeNull();
  });
});
