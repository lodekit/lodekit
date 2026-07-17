// Pure schedule/occurrence math for the tasks service (spec §7). All times epoch ms.
// Cron parsing is croner's job — 5-field expressions, machine-local timezone.
import { Cron } from "croner";
import { parseDuration } from "./duration.js";

export type ScheduleKind = "cron" | "every";

export function validateSchedule(kind: ScheduleKind, expr: string, minEveryMs: number): void {
  if (kind === "cron") {
    if (expr.trim().split(/\s+/).length !== 5) {
      throw new Error(`cron "${expr}" must have exactly 5 fields`);
    }
    new Cron(expr); // throws on a bad expression
    return;
  }
  if (parseDuration(expr) < minEveryMs) {
    throw new Error(`every "${expr}" is below the minimum interval`);
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
  catchUpMs: number; // 0 = disabled (grace floor only); Infinity = unbounded window (always catch up)
  graceMs: number;   // dispatch-latency floor: an occurrence this close to `now` always fires
  now: number;
}): { occurrence: number | null; highWater: number } {
  const { kind, expr, anchor, highWater, catchUpMs, graceMs, now } = opts;
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
  const window = Math.max(catchUpMs, graceMs);
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
