# 001-arch: Event envelope addresses emitters as `kind` + `component`, retiring `source`

**Date:** 2026-07-16 · **Status:** Accepted
**Spec:** `docs/specs/2026-07-16-events-canonical-model-design.md`

## Context

The event bus shipped with `ns` / `source` / `type` addressing. An audit of every
emitter and both live databases (2026-07-16) showed `source` carried no information
(`"_platform"` on 100 % of rows), the concept people actually filter by — which
service emitted — was smuggled into `type` prefixes inconsistently, and log-store
used the word `source` for a different concept than event-store did.

A single "who emitted this" column cannot be bare: the app-id grammar admits
`tasks`, `engine`, `kv-store` as legitimate app names, so an instance name alone is
ambiguous by construction — an app named `tasks` is indistinguishable from the tasks
service. The alternatives were a reserved-word list (enforcement code, growing
forever) or prefixed values (`service:kv-store` — machine-readable, human-hostile).

## Decision

Every event names its emitter with two columns: **`kind`** — the class of platform
member, a closed set (`engine` | `service` | `app`) — and **`component`** — the
instance within that kind (engine subsystem, catalog service name, or app id).
`source` is retired from events entirely. The scheme is collision-free with no
reserved words: `kind` disambiguates, raw values stay human-readable, and it matches
precedent (Kubernetes `kind`, ECS `event.kind`).

Corollaries: engine subsystems (`build`, `lifecycle`, `registry`) are components *of
the engine* — the engine itself is never a component; log-store converges on the same
vocabulary in a follow-up slice, dissolving the `source` word collision instead of
managing it.

## Alternatives rejected

- **Bare `source`/instance column** — ambiguous by construction (see Context).
- **Reserved-word list** — enforcement code plus a list that must grow with the
  catalog; the `_` prefix trick used for internal apps doesn't extend to services.
- **"Module" as the classifier's name** — already means app source files in this
  codebase's informal language ("the tasks module").

## Consequences

- `kind` is stored on every bus row and exposed in the SDK, MCP, HTTP, and the
  explorer — changing the scheme later means a data migration plus every consumer.
- New emitting member classes (manager, MCP) extend the `kind` set by spec, not by
  convention.
- Filtering by component replaces enumerating fine-grained types
  (`events.watch({component: "kv-store"})` covers all `key-*` facts).
