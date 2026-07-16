import { describe, it, expect } from "vitest";
import { RANGE_PRESETS, rangeBounds, matchesFilters, toLocalInput, fromLocalInput } from "../dashboard/src/lib/event-filters.js";
import { BUCKET_STEPS, snapBucket, fillBuckets } from "../dashboard/src/lib/event-stats.js";

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

describe("snapBucket", () => {
  it("snaps range/60 up to the allowed steps (spec §7)", () => {
    expect(snapBucket(RANGE_PRESETS["15m"])).toBe(60_000);        // 15s -> 1m
    expect(snapBucket(RANGE_PRESETS["1h"])).toBe(60_000);         // 1m -> 1m
    expect(snapBucket(RANGE_PRESETS["24h"])).toBe(1_800_000);     // 24m -> 30m
    expect(snapBucket(RANGE_PRESETS["7d"])).toBe(21_600_000);     // 2.8h -> 6h
    expect(snapBucket(RANGE_PRESETS["30d"])).toBe(86_400_000);    // 12h -> 1d
  });
  it("clamps degenerate ranges to the largest step", () => {
    expect(snapBucket(10 * 365 * 86_400_000)).toBe(BUCKET_STEPS[BUCKET_STEPS.length - 1]);
  });
});

describe("fillBuckets", () => {
  it("zero-fills [since, until) on bucket-aligned edges", () => {
    const out = fillBuckets([{ t: 120, n: 3 }], 100, 300, 60);
    expect(out).toEqual([{ t: 60, n: 0 }, { t: 120, n: 3 }, { t: 180, n: 0 }, { t: 240, n: 0 }]);
  });
  it("caps output at 1000 bars for degenerate ranges", () => {
    expect(fillBuckets([], 0, 10_000_000, 1).length).toBe(1000);
  });
});
