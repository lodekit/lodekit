# 002-arch: Event types are fine-grained past-tense facts, not coarse change feeds

**Date:** 2026-07-16 · **Status:** Accepted
**Spec:** `docs/specs/2026-07-16-events-canonical-model-design.md`

## Context

The bus shipped with one coarse type per service (`kv-store-change`,
`tasks-change`, …) carrying the verb in the payload (`{op: "set"}`,
`{state: "queued"}`) plus a magic `"*"` payload sentinel meaning "definitions
changed, refetch". Every consumer had to interpret payloads to know what happened,
and the sentinel was an in-band signal indistinguishable from data.

## Decision

A type is a past-tense fact, `<subject>-<verb-ed>` (`key-set`, `run-failed`,
`build-ready`) — ops and statuses move out of payloads into types; payloads carry
identity and references only. The `"*"` sentinel dies: a defs reload is its own fact
(`defs-changed`, empty payload). The two `-ready` exceptions (`build-ready`,
`server-ready`) are deliberate: "became ready" is the fact, and the symmetric
`started / ready / failed` triple beats forcing `server-succeeded`. The taxonomy
table in the spec (§4) is normative — new emitters extend it via spec.

## Rationale

One less thing to interpret from the payload — filters, dashboards, and triggers
match on the type alone. The classic objection (subscribers must enumerate fact
sets: `key-set` + `key-deleted` + `key-expired`) is dissolved by the envelope's
`component` filter (001-arch): `events.watch({component: "kv-store"})` covers all
`key-*` facts without naming them.

## Consequences

- Fact types are stored on every row and matched by every consumer — renaming one
  later is a bus-wide migration.
- Payload fields that were statuses (`{op}`, `{state}`, `{status}`) disappear;
  derived observability values (e.g. `schema-applied`'s old `{statements}` count)
  are dropped rather than grandfathered.
- Anything that used the `"*"` sentinel as a signal (SDK `settings.watch`) now keys
  on explicit fact types and no longer fires on defs reloads.
