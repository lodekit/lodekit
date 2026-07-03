import { describe, it, expect, afterEach, vi } from "vitest";
import { every, tick, stop, stopAll } from "../src/scheduler.js";

afterEach(() => stopAll());

describe("scheduler", () => {
  it("tick runs a registered task immediately", () => {
    let runs = 0;
    every("t", 60_000, () => runs++);
    tick("t");
    tick("t");
    expect(runs).toBe(2);
  });

  it("a throwing task logs and does not propagate", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    every("boom", 60_000, () => { throw new Error("nope"); });
    expect(() => tick("boom")).not.toThrow();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("re-registering a name replaces the task; stop removes it", () => {
    let a = 0, b = 0;
    every("x", 60_000, () => a++);
    every("x", 60_000, () => b++);
    tick("x");
    expect(a).toBe(0);
    expect(b).toBe(1);
    stop("x");
    tick("x"); // no-op after stop
    expect(b).toBe(1);
  });

  it("runs on the interval with fake timers", () => {
    vi.useFakeTimers();
    let runs = 0;
    every("i", 1000, () => runs++);
    vi.advanceTimersByTime(3500);
    expect(runs).toBe(3);
    vi.useRealTimers();
  });
});
