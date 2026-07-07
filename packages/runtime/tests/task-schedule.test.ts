import { describe, it, expect } from "vitest";
import { dueOccurrence, nextOccurrence, validateSchedule, GRACE_MS } from "../src/taskSchedule.js";

const HOUR = 3_600_000;
// Anchor all cron tests at a fixed local-midnight so "0 9 * * *" is deterministic.
const midnight = new Date(2026, 0, 5, 0, 0, 0, 0).getTime(); // Mon Jan 5 2026, local
const nineAm = new Date(2026, 0, 5, 9, 0, 0, 0).getTime();

describe("validateSchedule", () => {
  it("accepts 5-field cron and >=1m every", () => {
    validateSchedule("cron", "0 9 * * *");
    validateSchedule("every", "30m");
  });
  it("rejects bad cron, bad duration, sub-minute every", () => {
    expect(() => validateSchedule("cron", "not a cron")).toThrow();
    expect(() => validateSchedule("every", "nope")).toThrow(/invalid duration/);
    expect(() => validateSchedule("every", "30s")).toThrow(/at least/);
    expect(() => validateSchedule("cron", "*/30 * * * * *")).toThrow(/5 fields/);
  });
});

describe("dueOccurrence — cron", () => {
  const base = { kind: "cron" as const, expr: "0 9 * * *", anchor: midnight, catchUpMs: HOUR };

  it("no occurrence yet: null, high-water unchanged", () => {
    const r = dueOccurrence({ ...base, highWater: midnight, now: nineAm - 1 });
    expect(r).toEqual({ occurrence: null, highWater: midnight });
  });

  it("due within the window: fires and advances high-water", () => {
    const r = dueOccurrence({ ...base, highWater: midnight, now: nineAm + 5 * 60_000 });
    expect(r).toEqual({ occurrence: nineAm, highWater: nineAm });
  });

  it("outside the window: drops but still advances high-water", () => {
    const r = dueOccurrence({ ...base, highWater: midnight, now: nineAm + 2 * HOUR });
    expect(r).toEqual({ occurrence: null, highWater: nineAm });
  });

  it("multiple missed occurrences coalesce to the latest", () => {
    // Two 9ams missed (runtime off for two days); only the latest fires.
    const now = nineAm + 24 * HOUR + 10 * 60_000;
    const r = dueOccurrence({ ...base, highWater: midnight, now });
    expect(r).toEqual({ occurrence: nineAm + 24 * HOUR, highWater: nineAm + 24 * HOUR });
  });

  it("catchUp disabled (null): only fires within the grace floor", () => {
    const late = dueOccurrence({ ...base, catchUpMs: null, highWater: midnight, now: nineAm + GRACE_MS + 1 });
    expect(late.occurrence).toBeNull();
    expect(late.highWater).toBe(nineAm);
    const onTime = dueOccurrence({ ...base, catchUpMs: null, highWater: midnight, now: nineAm + 1_000 });
    expect(onTime.occurrence).toBe(nineAm);
  });

  it("catchUp always (Infinity): an arbitrarily late miss still fires the latest occurrence", () => {
    const now = nineAm + 100 * HOUR;
    const r = dueOccurrence({ ...base, catchUpMs: Number.POSITIVE_INFINITY, highWater: midnight, now });
    expect(r.occurrence).toBe(nineAm + 96 * HOUR);
    expect(r.highWater).toBe(nineAm + 96 * HOUR);
  });
});

describe("dueOccurrence — every", () => {
  const base = { kind: "every" as const, expr: "1h", anchor: midnight, catchUpMs: HOUR };

  it("fires at anchor + k*interval, never at the anchor itself", () => {
    expect(dueOccurrence({ ...base, highWater: midnight, now: midnight + HOUR - 1 }).occurrence).toBeNull();
    const r = dueOccurrence({ ...base, highWater: midnight, now: midnight + HOUR + 1_000 });
    expect(r).toEqual({ occurrence: midnight + HOUR, highWater: midnight + HOUR });
  });

  it("coalesces a gap to the latest interval tick", () => {
    const r = dueOccurrence({ ...base, highWater: midnight, now: midnight + 5 * HOUR + 1_000 });
    expect(r).toEqual({ occurrence: midnight + 5 * HOUR, highWater: midnight + 5 * HOUR });
  });
});

describe("nextOccurrence", () => {
  it("cron: next match strictly after now", () => {
    expect(nextOccurrence("cron", "0 9 * * *", midnight, nineAm)).toBe(nineAm + 24 * HOUR);
    expect(nextOccurrence("cron", "0 9 * * *", midnight, midnight)).toBe(nineAm);
  });
  it("every: anchor + next interval tick", () => {
    expect(nextOccurrence("every", "1h", midnight, midnight)).toBe(midnight + HOUR);
    expect(nextOccurrence("every", "1h", midnight, midnight + 90 * 60_000)).toBe(midnight + 2 * HOUR);
  });
});
