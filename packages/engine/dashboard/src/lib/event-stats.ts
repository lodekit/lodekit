// Pure histogram helpers for the Events explorer header — JSX-free for the same
// reason as event-filters.ts (engine tests import these directly).

export const BUCKET_STEPS = [60_000, 300_000, 1_800_000, 3_600_000, 21_600_000, 86_400_000] as const;

// Range ÷ ~60 bars, snapped up to the nearest allowed step (spec §7).
export function snapBucket(rangeMs: number): number {
  const target = rangeMs / 60;
  return BUCKET_STEPS.find((s) => s >= target) ?? BUCKET_STEPS[BUCKET_STEPS.length - 1];
}

// Zero-fill the server's sparse buckets across [since, until). The first bar starts at
// floor(since/bucket)*bucket — the same edge the server buckets by. Capped at 1000 bars
// as a guard against degenerate custom ranges.
export function fillBuckets(
  sparse: { t: number; n: number }[],
  since: number,
  until: number,
  bucket: number
): { t: number; n: number }[] {
  const byT = new Map(sparse.map((b) => [b.t, b.n]));
  const out: { t: number; n: number }[] = [];
  for (let t = Math.floor(since / bucket) * bucket; t < until && out.length < 1000; t += bucket) {
    out.push({ t, n: byT.get(t) ?? 0 });
  }
  return out;
}
