import { describe, it, expect } from "vitest";
import { RANGE_PRESETS, rangeBounds, matchesFilters, toLocalInput, fromLocalInput } from "../dashboard/src/lib/event-filters.js";

const NOW = 1_752_600_000_000;

describe("rangeBounds", () => {
  it("presets are open-ended: since = now - preset, no until", () => {
    expect(rangeBounds("24h", NOW, {})).toEqual({ since: NOW - RANGE_PRESETS["24h"] });
    expect(rangeBounds("15m", NOW, {})).toEqual({ since: NOW - 15 * 60_000 });
  });
  it("custom passes both edges through, either may be absent", () => {
    expect(rangeBounds("custom", NOW, { since: 5, until: 9 })).toEqual({ since: 5, until: 9 });
    expect(rangeBounds("custom", NOW, { until: 9 })).toEqual({ since: undefined, until: 9 });
  });
});

describe("matchesFilters", () => {
  const r = { id: 1, ts: 100, app: "notes", kind: "service", component: "kv-store", type: "key-set" };
  it("matches on every set filter, ignores unset ones", () => {
    expect(matchesFilters(r, {})).toBe(true);
    expect(matchesFilters(r, { app: "notes", kind: "service", component: "kv-store", type: "key-set" })).toBe(true);
    expect(matchesFilters(r, { app: "other" })).toBe(false);
    expect(matchesFilters(r, { kind: "engine" })).toBe(false);
    expect(matchesFilters(r, { component: "tasks" })).toBe(false);
    expect(matchesFilters(r, { type: "key-deleted" })).toBe(false);
  });
  it("drops rows at/after a custom until (closed-open)", () => {
    expect(matchesFilters(r, { until: 100 })).toBe(false);
    expect(matchesFilters(r, { until: 101 })).toBe(true);
  });
});

describe("datetime-local conversion", () => {
  it("round-trips minute precision in the local zone", () => {
    const ms = new Date(2026, 6, 16, 14, 30).getTime();
    expect(fromLocalInput(toLocalInput(ms))).toBe(ms);
    expect(toLocalInput(undefined)).toBe("");
    expect(fromLocalInput("")).toBeUndefined();
  });
});
