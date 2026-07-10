import { describe, it, expect } from "vitest";
import { parseRate, TokenBucket, Breaker, Semaphore } from "../src/gatewayGuards.js";

describe("parseRate", () => {
  it("parses the grammar and rejects junk", () => {
    expect(parseRate("60/min")).toEqual({ capacity: 60, windowMs: 60_000 });
    expect(parseRate("2/second")).toEqual({ capacity: 2, windowMs: 1_000 });
    expect(parseRate("100/hour")).toEqual({ capacity: 100, windowMs: 3_600_000 });
    expect(() => parseRate("fast")).toThrow();
    expect(() => parseRate("0/min")).toThrow();
  });
});

describe("TokenBucket", () => {
  it("grants up to capacity, then refills continuously", () => {
    const b = new TokenBucket(2, 1_000);
    const t0 = 1_000_000;
    expect(b.tryTake(t0)).toBe(true);
    expect(b.tryTake(t0)).toBe(true);
    expect(b.tryTake(t0)).toBe(false);
    expect(b.msUntilNext(t0)).toBeGreaterThan(0);
    expect(b.tryTake(t0 + 600)).toBe(true); // 0.6s @ 2/s refilled >= 1 token
  });

  it("pauseUntil (Retry-After) blocks takes until the pause lifts", () => {
    const b = new TokenBucket(10, 1_000);
    const t0 = 2_000_000;
    b.pauseUntil(t0 + 500);
    expect(b.tryTake(t0)).toBe(false);
    expect(b.msUntilNext(t0)).toBeGreaterThanOrEqual(500);
    expect(b.tryTake(t0 + 501)).toBe(true);
  });

  it("acquire waits within its budget and gives up beyond it", async () => {
    const b = new TokenBucket(1, 200);
    expect(await b.acquire(10)).toBe(true);       // token available immediately
    expect(await b.acquire(500)).toBe(true);      // refills within the wait budget
    expect(await b.acquire(5)).toBe(false);       // 5ms can't cover a 200ms window
  });
});

describe("Breaker", () => {
  it("opens at the threshold, half-opens after cooldown, closes on a probe success", () => {
    const br = new Breaker(3, 1_000);
    const t0 = 3_000_000;
    expect(br.tryPass(t0)).toBe(true);
    expect(br.recordFailure(t0)).toBeNull();
    expect(br.recordFailure(t0)).toBeNull();
    expect(br.recordFailure(t0)).toBe("opened");
    expect(br.state).toBe("open");
    expect(br.tryPass(t0 + 500)).toBe(false);
    expect(br.tryPass(t0 + 1_001)).toBe(true);   // half-open: one probe passes
    expect(br.state).toBe("half-open");
    expect(br.tryPass(t0 + 1_002)).toBe(false);  // probe slot is taken
    expect(br.recordSuccess()).toBe("closed");
    expect(br.state).toBe("closed");
    expect(br.tryPass(t0 + 1_003)).toBe(true);
  });

  it("a failed half-open probe reopens; successes reset the failure count", () => {
    const br = new Breaker(2, 1_000);
    const t0 = 4_000_000;
    br.recordFailure(t0);
    expect(br.recordSuccess()).toBeNull(); // closed stays closed — no transition
    br.recordFailure(t0);
    expect(br.recordFailure(t0)).toBe("opened");
    expect(br.tryPass(t0 + 1_001)).toBe(true);
    expect(br.recordFailure(t0 + 1_002)).toBe("opened"); // probe failed → straight back open
    expect(br.state).toBe("open");
  });

  it("a stale success while open never closes the breaker; releaseProbe frees a wedged probe slot", () => {
    const br = new Breaker(1, 1_000);
    const t0 = 5_000_000;
    expect(br.recordFailure(t0)).toBe("opened");
    expect(br.recordSuccess()).toBeNull();      // stale pre-trip success — cooldown stands
    expect(br.state).toBe("open");
    expect(br.tryPass(t0 + 1_001)).toBe(true);  // half-open probe granted
    br.releaseProbe();                          // probe aborted before the provider (guard rejection)
    expect(br.tryPass(t0 + 1_002)).toBe(true);  // slot is free again, breaker not wedged
    expect(br.recordSuccess()).toBe("closed");
  });
});

describe("Semaphore", () => {
  it("caps concurrency and hands slots to waiters in order", async () => {
    const s = new Semaphore(2);
    const r1 = await s.acquire();
    const r2 = await s.acquire();
    let third = false;
    const p3 = s.acquire().then((r) => { third = true; return r; });
    await new Promise((r) => setTimeout(r, 10));
    expect(third).toBe(false);
    r1();
    const r3 = await p3;
    expect(third).toBe(true);
    r2(); r3();
    r3(); // double release is a no-op
    const r4 = await s.acquire();
    r4();
  });
});
