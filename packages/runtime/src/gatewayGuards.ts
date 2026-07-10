// Pure guardrail primitives for the gateways engine (spec 2026-07-10-gateways §9).
// All per-provider state (buckets, breakers, semaphores) is in-memory only —
// a restart forgives (spec §8).

const UNITS: Record<string, number> = {
  second: 1_000, sec: 1_000, s: 1_000,
  minute: 60_000, min: 60_000, m: 60_000,
  hour: 3_600_000, hr: 3_600_000, h: 3_600_000,
};

export function parseRate(rate: string): { capacity: number; windowMs: number } {
  const m = /^(\d+)\/(second|sec|s|minute|min|m|hour|hr|h)$/.exec(rate);
  const capacity = m ? Number(m[1]) : 0;
  if (!m || capacity < 1) throw new Error(`invalid rate "${rate}" (want e.g. "60/min")`);
  return { capacity, windowMs: UNITS[m[2]] };
}

/** Continuous-refill token bucket. pauseUntil() is the Retry-After hook: while
 *  paused, no takes succeed and msUntilNext reports the pause. */
export class TokenBucket {
  private available: number;
  private lastRefill: number;
  private pausedUntil = 0;

  constructor(private capacity: number, private windowMs: number) {
    this.available = capacity;
    this.lastRefill = 0;
  }

  private refill(now: number): void {
    if (now <= this.lastRefill) return;
    this.available = Math.min(this.capacity, this.available + ((now - this.lastRefill) * this.capacity) / this.windowMs);
    this.lastRefill = now;
  }

  pauseUntil(ts: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, ts);
  }

  tryTake(now = Date.now()): boolean {
    if (now < this.pausedUntil) return false;
    this.refill(now);
    if (this.available < 1) return false;
    this.available -= 1;
    return true;
  }

  msUntilNext(now = Date.now()): number {
    const pause = Math.max(0, this.pausedUntil - now);
    this.refill(now);
    const need = this.available >= 1 ? 0 : ((1 - this.available) * this.windowMs) / this.capacity;
    return Math.ceil(Math.max(pause, need));
  }

  /** Briefly wait for a token, bounded by the caller's budget (the request timeout). */
  async acquire(maxWaitMs: number): Promise<boolean> {
    const deadline = Date.now() + maxWaitMs;
    for (;;) {
      const now = Date.now();
      if (this.tryTake(now)) return true;
      const wait = Math.min(this.msUntilNext(now), deadline - now);
      if (wait <= 0) return false;
      await new Promise((r) => setTimeout(r, Math.min(wait + 1, 250)));
    }
  }
}

/** Consecutive-failure circuit breaker: closed → open (threshold hit) →
 *  half-open (cooldown elapsed, one probe) → closed | open. The transition
 *  return values let the engine emit gateway-health exactly once per change. */
export class Breaker {
  private failures = 0;
  private openedAt = 0;
  private probing = false;
  private _state: "closed" | "open" | "half-open" = "closed";

  constructor(private threshold: number, private cooldownMs: number) {}

  get state(): "closed" | "open" | "half-open" {
    return this._state;
  }

  tryPass(now = Date.now()): boolean {
    if (this._state === "closed") return true;
    if (this._state === "open" && now - this.openedAt >= this.cooldownMs) this._state = "half-open";
    if (this._state === "half-open" && !this.probing) {
      this.probing = true;
      return true;
    }
    return false;
  }

  recordSuccess(): "closed" | null {
    const reopened = this._state !== "closed";
    this.failures = 0;
    this.probing = false;
    this._state = "closed";
    return reopened ? "closed" : null;
  }

  recordFailure(now = Date.now()): "opened" | null {
    if (this._state === "half-open") {
      this.probing = false;
      this._state = "open";
      this.openedAt = now;
      return "opened";
    }
    if (this._state === "open") return null;
    this.failures += 1;
    if (this.failures >= this.threshold) {
      this._state = "open";
      this.openedAt = now;
      this.failures = 0;
      return "opened";
    }
    return null;
  }
}

/** Counting semaphore — the per-provider concurrency cap. */
export class Semaphore {
  private active = 0;
  private queue: (() => void)[] = [];

  constructor(private limit: number) {}

  async acquire(): Promise<() => void> {
    if (this.active >= this.limit) await new Promise<void>((r) => this.queue.push(r));
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.queue.shift()?.();
    };
  }
}
