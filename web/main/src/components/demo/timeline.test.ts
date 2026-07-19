import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Beat, DemoState } from "./script";
import { beatDuration } from "./script";
import { createTimeline } from "./timeline";

const EMPTY: DemoState = { items: [], input: "", streamingIndex: null };

const BEATS: Beat[] = [
  { do: "type", text: "hi" }, // 2 * TYPE_MS = 90ms
  { do: "hold", ms: 1000 },
  { do: "post", item: { kind: "user", text: "hi" } }, // 450ms
];

describe("timeline", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("applies beats in order on their durations and finishes once", () => {
    const seen: string[] = [];
    let done = 0;
    const tl = createTimeline(
      (s) => seen.push(s.input + ":" + s.items.length),
      () => done++
    );
    tl.play(BEATS, EMPTY);
    expect(seen).toEqual(["hi:0"]); // first beat applies immediately
    vi.advanceTimersByTime(beatDuration(BEATS[0]) - 1);
    expect(seen).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(["hi:0", "hi:0"]); // hold applied
    vi.advanceTimersByTime(1000);
    expect(seen).toHaveLength(3); // post applied
    expect(seen.at(-1)).toBe(":1"); // user post cleared input
    expect(done).toBe(0);
    vi.advanceTimersByTime(450);
    expect(done).toBe(1);
    vi.advanceTimersByTime(10_000);
    expect(done).toBe(1);
  });

  it("pause freezes mid-beat and resume waits only the remainder", () => {
    const seen: number[] = [];
    const tl = createTimeline((s) => seen.push(s.items.length), () => {});
    tl.play([{ do: "hold", ms: 1000 }, { do: "post", item: { kind: "user", text: "x" } }], EMPTY);
    vi.advanceTimersByTime(600);
    tl.pause();
    expect(tl.playing()).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(seen).toHaveLength(1); // nothing fired while paused
    tl.resume();
    vi.advanceTimersByTime(399);
    expect(seen).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(seen).toHaveLength(2); // post fired after the 400ms remainder
  });

  it("stop cancels; pause/resume are no-ops when idle", () => {
    const seen: number[] = [];
    const tl = createTimeline((s) => seen.push(s.items.length), () => {});
    tl.pause(); // no-op, no throw
    tl.resume(); // no-op, no throw
    tl.play([{ do: "hold", ms: 100 }, { do: "hold", ms: 100 }], EMPTY);
    tl.stop();
    vi.advanceTimersByTime(1000);
    expect(seen).toHaveLength(1); // only the immediate first application
  });
});
