// Pure filter helpers for the Events explorer — kept JSX-free so the runtime test
// suite can exercise them directly (dashboard/ has no tsc program of its own).

export const RANGE_PRESETS = {
  "15m": 15 * 60_000,
  "1h": 3_600_000,
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
} as const;

export type RangeKey = keyof typeof RANGE_PRESETS | "custom";

// Presets are open-ended (since only — live tail keeps appending); custom uses both
// edges. Bounds are closed-open [since, until), matching the API (spec §6).
export function rangeBounds(
  range: RangeKey,
  now: number,
  custom: { since?: number; until?: number }
): { since?: number; until?: number } {
  if (range === "custom") return { since: custom.since, until: custom.until };
  return { since: now - RANGE_PRESETS[range] };
}

export interface LiveFilter {
  app?: string;
  kind?: string;
  component?: string;
  type?: string;
  until?: number;
}

// Whether a live SSE row belongs under the current filters. `since` needs no check —
// a live row is newer than any since; a custom until in the past excludes it.
export function matchesFilters(
  r: { app: string | null; kind: string; component: string; type: string; ts: number },
  f: LiveFilter
): boolean {
  return (
    (!f.app || r.app === f.app) &&
    (!f.kind || r.kind === f.kind) &&
    (!f.component || r.component === f.component) &&
    (!f.type || r.type === f.type) &&
    (f.until == null || r.ts < f.until)
  );
}

// datetime-local <-> epoch ms in the viewer's zone (the input has no zone of its own).
export function toLocalInput(ms?: number): string {
  if (ms == null) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): number | undefined {
  if (!v) return undefined;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}
