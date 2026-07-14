// Display formatting helpers (Intl only — no date/number libraries).
// Dependency-free on purpose: unit-tested from packages/runtime/tests.

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "–";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n;
  let i = -1;
  do { v /= 1024; i++; } while (v >= 1024 && i < units.length - 1);
  return `${v >= 10 ? String(Math.round(v)) : v.toFixed(1)} ${units[i]}`;
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function relativeTime(ts: number, now: number = Date.now()): string {
  const s = Math.round((ts - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(s, "second");
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}

export const formatCount = (n: number): string => new Intl.NumberFormat().format(n);
export const formatTs = (ts: number): string => new Date(ts).toLocaleString();

// Timestamp-column heuristic — mirror of the runtime's rule in
// services/data-explorer.ts (kept in sync by tests on both sides).
const TS_EXACT = new Set([
  "created_at", "createdat", "created", "inserted_at", "timestamp", "ts",
  "at", "time", "date", "updated_at", "updatedat",
]);
const TS_SUFFIX = /_(at|ts|time|date)$/;
const TS_CAMEL = /[a-z0-9](At|Ts|Time|Date)$/;

export function isTimestampColumn(name: string): boolean {
  const lower = name.toLowerCase();
  return TS_EXACT.has(lower) || TS_SUFFIX.test(lower) || TS_CAMEL.test(name);
}

// Same magnitude rules as the runtime's parseTsValue: >1e11 reads as epoch ms,
// >1e8 as epoch seconds; strings go through Date.parse.
export function parseTimestampValue(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v > 1e11) return Math.floor(v);
    if (v > 1e8) return Math.floor(v * 1000);
    return null;
  }
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}
