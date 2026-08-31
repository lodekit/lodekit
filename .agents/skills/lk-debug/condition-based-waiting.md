# Condition-based waiting

A flaky test usually contains a guess about timing — `await sleep(50)` before the
assertion. It passes on an idle machine and fails under load or in CI, and lengthening
the sleep slows every run without removing the race. Wait for the condition itself,
under a deadline that turns a hang into a readable failure.

## The pattern

```typescript
// A guess: passes until the machine is busy.
await new Promise((r) => setTimeout(r, 50));
expect(registry.get('greenhouse')).toBeDefined();

// The condition: passes as soon as it is true, fails with a reason if it never is.
await waitFor(() => registry.get('greenhouse') !== undefined, 'greenhouse to register');
expect(registry.get('greenhouse')).toBeDefined();
```

```typescript
async function waitFor(
  condition: () => boolean,
  description: string,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for ${description}`);
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}
```

Poll about every 10ms: tighter burns CPU for no gain, looser adds latency to every
wait in the suite. Keep the deadline — without one a condition that never holds hangs
the run instead of failing it — and name the condition in the error, since "timed out"
alone does not say what never happened. Evaluate the state inside the loop; a value
read once before the loop never changes, and the wait spins until the deadline.

## When a fixed delay is right

Sometimes timing is the behavior under test — a debounce window, a poll interval, a
retry backoff. Wait for the triggering condition first, then sleep a duration derived
from the interval you know, and write the derivation in a comment beside it — "the
watcher polls every 100ms, so 250ms guarantees two ticks". An undocumented sleep is
indistinguishable from a guess, and the next person to see it fail will lengthen it
rather than fix it.
