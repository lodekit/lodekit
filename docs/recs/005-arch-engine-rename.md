# 005-arch: Engine rename — the "runtime" survivor policy, and "executor" for subsystems

**Date:** 2026-07-17 · **Status:** Accepted
**Spec:** `docs/specs/2026-07-16-events-canonical-model-design.md` §8

## Context

The engine rename (spec §8: "after this spec, 'runtime' is not a Lodekit word")
needed an explicit boundary: which occurrences of the word survive, and what
happens to code where "engine" already meant something narrower. Without a
written policy, future sweeps re-litigate every hit — or worse, rewrite
history and on-disk truth to satisfy a grep.

## Decision

"Runtime" survives the rename only as:

1. **Generic English** — "at runtime" (compile-time vs run-time), never the
   product term.
2. **On-disk artifact names** — `runtime.pid`, `runtime-YYYYMMDD.log`: docs
   describe the files that actually exist; the names change only if the code
   that writes them changes (not this slice).
3. **Package/path specifiers** — `@lodekit/runtime`, `packages/runtime`,
   until the tier-3 package rename (spec §8, PR 4).
4. **Historical records** — the released changelog page, dated specs/plans,
   and prior decision records are never rewritten.

And "engine" stops meaning per-subsystem machinery: `taskEngine.ts` /
`gatewayEngine.ts` become `taskExecutor.ts` / `gatewayExecutor.ts` (with
`initTaskExecutor`, `ExecutorDeps`, `initGatewayExecutor`,
`resetGatewayExecutorForTest`) — the word "engine" names exactly one thing,
the whole process. Taglines that used "runtime" as a product-category noun
recast to **platform** (the collection running on the person's machine), not
"engine", which names only the process.

## Rationale

A rename that rewrites history or documents files that don't exist trades one
inconsistency for a worse one. Enumerating the survivor classes makes the
sweep mechanically checkable (a residual-grep allowlist) and repeatable for
PR 4. Renaming the subsystem "engines" to "executors" is what makes the
one-word-one-meaning rule enforceable at all.

## Consequences

- Sweeps are gated by grep allowlist, not judgment-per-hit; PR 4 removes
  survivor class 3.
- The docs glossary keeps a one-line `### runtime` retired-term pointer so
  older material stays legible.
- New code must not introduce "engine" for anything but the process; the
  executor naming is the precedent.
