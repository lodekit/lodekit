// Shared short-duration grammar (spec §4): "<number><s|m|h|d>", e.g. "30s", "10m", "6h".
const RE = /^(\d+(?:\.\d+)?)(s|m|h|d)$/;
const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

export function parseDuration(input: string): number {
  const m = RE.exec(input);
  const value = m ? Number(m[1]) : 0;
  if (!m || !(value > 0)) throw new Error(`invalid duration "${input}" (expected e.g. "30s", "10m", "6h")`);
  return Math.round(value * UNIT_MS[m[2] as keyof typeof UNIT_MS]);
}
