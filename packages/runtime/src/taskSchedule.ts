// Pure schedule/occurrence math for the tasks service (spec §7). All times epoch ms.
// Cron parsing is croner's job — 5-field expressions, machine-local timezone.
import { Cron } from "croner";
import { parseDuration } from "./duration.js";

export type ScheduleKind = "cron" | "every";

// Dispatch-latency floor for the catch-up window: an occurrence within GRACE_MS of
// `now` always fires, even with catchUp disabled — otherwise a window of 0 could
// never fire (every dispatch is at least poll-latency late).
export const GRACE_MS = 30_000;

const MIN_EVERY_MS = 60_000;

export function validateSchedule(kind: ScheduleKind, expr: string): void {
  if (kind === "cron") {
    if (expr.trim().split(/\s+/).length !== 5) {
      throw new Error(`cron "${expr}" must have exactly 5 fields`);
    }
    new Cron(expr); // throws on a bad expression
    return;
  }
  if (parseDuration(expr) < MIN_EVERY_MS) {
    throw new Error(`every "${expr}" is below the minimum interval (at least "1m")`);
  }
}

// Latest occurrence t with highWater < t <= now (occurrences strictly after the
// anchor for "every"). Coalescing is structural: only the latest can fire; the
// returned highWater skips everything considered, fired or dropped.
export function dueOccurrence(opts: {
  kind: ScheduleKind;
  expr: string;
  anchor: number;
  highWater: number;
  catchUpMs: number | null;
  now: number;
}): { occurrence: number | null; highWater: number } {
  const { kind, expr, anchor, highWater, catchUpMs, now } = opts;
  let latest: number | null = null;
  if (kind === "every") {
    const interval = parseDuration(expr);
    const k = Math.floor((now - anchor) / interval);
    const t = anchor + k * interval;
    if (k >= 1 && t > highWater) latest = t;
  } else {
    const cron = new Cron(expr);
    let cursor = new Date(highWater);
    for (;;) {
      const next = cron.nextRun(cursor);
      if (!next || next.getTime() > now) break;
      latest = next.getTime();
      cursor = next;
    }
  }
  if (latest === null) return { occurrence: null, highWater };
  const window = Math.max(catchUpMs ?? 0, GRACE_MS);
  return { occurrence: now - latest <= window ? latest : null, highWater: latest };
}

export function nextOccurrence(kind: ScheduleKind, expr: string, anchor: number, now: number): number | null {
  if (kind === "every") {
    const interval = parseDuration(expr);
    const k = Math.floor(Math.max(0, now - anchor) / interval) + 1;
    return anchor + k * interval;
  }
  const next = new Cron(expr).nextRun(new Date(now));
  return next ? next.getTime() : null;
}
