# Root cause tracing

A bug usually surfaces far from where it started: `git init` runs in the wrong
directory, a file lands outside the temp dir, a query opens the wrong database. Fixing
it where the error appears leaves every caller free to send the same bad value again,
so trace the value backward, one call at a time, until you reach where it was made.

## Trace backward, one call at a time

Start at the symptom and ask what passed this value in. Ask the same of that frame's
caller, and keep going until the answer is "nothing did — this is where the value came
from". A trace like this usually runs three to five levels:

```
git init runs in process.cwd()             ← cwd was ''
  ← WorktreeManager.create(projectDir)     projectDir was ''
    ← Session.initializeWorkspace()
      ← Session.create()
        ← the test read context.tempDir before beforeEach had set it
```

The root cause is the last line, not the first: a fixture that returns `{ tempDir: '' }`
until `beforeEach` runs. Fixing `git init` to reject an empty `cwd` would have left the
same empty string flowing through four other call paths.

## Instrument when reading is not enough

When the chain is too dynamic to read — callbacks, event handlers, a framework in the
middle — capture the stack at the point of damage:

```typescript
async function gitInit(directory: string) {
  console.error('DEBUG git init', {
    directory,
    cwd: process.cwd(),
    stack: new Error().stack,
  });
  await execFileAsync('git', ['init'], { cwd: directory });
}
```

```bash
pnpm test 2>&1 | grep -A20 'DEBUG git init'
```

Log before the operation, not in its error handler: an operation that damages state
without throwing produces no handler to log from. Use `console.error` in tests, since
a logger may be suppressed by the runner. Include the value, the resolved path, and
whatever environment the operation reads, because the trace tells you who called and
the values tell you why it was wrong.

## Fix at the source, then guard the boundary

Fix where the bad value originated — in the example, `tempDir` becomes a getter that
throws when read before `beforeEach` — because that is the only change that stops every
path at once.

Then add one guard at the boundary where the bad value entered the system:
`Session.create()` rejects an empty directory, so a future caller fails immediately and
legibly rather than three layers down. One guard at the entry point is enough;
validating in every layer it crossed adds noise the next reader has to reason through,
and hides which check is the real contract.
