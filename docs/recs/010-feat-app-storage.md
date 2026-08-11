# 010-feat: App Storage

**Status:** Active · **Last reviewed:** 2026-08-11

## Overview

App storage is the trio of per-app storage services the engine provides — db-store (the
relational home for domain records), kv-store (the app's key-value memory), and
file-store (files with metadata). Apps reach all three only through the SDK, identically
in the browser and in the app worker; the agent reads them on the person's behalf over
MCP. They are why an app carries no database, ORM setup, or upload handling of its own.

## Behavior

- Every store is namespaced by app id: an app's SDK is bound to its own app id at build
  time, and one app's records, keys, and files never appear in another's reads, listings,
  or change feeds. This is organization at a local trust posture, not a security boundary.
- All of an app's persistent state lives in its namespace of the data tree — one database
  file plus a files folder — inside the Backup tree. File bytes are real,
  Finder-browsable files, foldered by date with readable names.
- db-store: the app declares its domain model as drizzle tables in one schema module in
  its source; at worker boot, before the app serves, the declared schema is pushed.
  Additive changes apply automatically; destructive changes gate — the app keeps serving
  on its previous schema and the surfaced message names what would be lost and teaches
  the expand-copy path. Queries are fully typed — joins, aggregates, insert-returning,
  upserts, updates, deletes, a raw-SQL escape hatch, a batch call as the transaction
  unit; statements touching service or system tables or changing schema are rejected.
- kv-store: get / set / del / has / incr / cursor-paginated list-by-prefix, plus
  one-round-trip getMany and setMany; a client-side collection helper adds id-sequence
  sugar. Values are JSON; missing is distinct from stored null; incr is atomic and starts
  absent keys at zero. A ttl on set expires the key (lazily on read, swept for space);
  set without ttl clears expiry, while incr preserves it.
- file-store: put streams bytes in (string, blob, or stream — never fully buffered) with
  optional title, content type, custom metadata, and ttl. A file's identity is its slug —
  chosen by the app or derived from the title, collisions suffixed; re-putting a slug
  replaces it. Apps get stat, prefix listing with cursors, copy, move, delete, and a
  stable, cache-friendly serving URL usable directly in image tags and download links.
- Every write announces itself on the event bus as an identity-only past-tense fact
  (key-set, row-inserted, file-put, …) so apps live-refresh by watching, never polling.
- The agent reads storage over MCP: kv listings, the db schema, read-only SQL queries,
  and file metadata — disk path and URL, never the bytes themselves.

## Design Decisions

### 1. Two homes, one decision rule

**Decision:** db-store is the default home for domain records — entities with fields and
relationships that get listed, filtered, aggregated; kv-store is app memory — counters,
cursors, flags, caches. The rule is glossary-level; the skill applies it by default.
**Why:** Two overlapping stores without a rule breeds arbitrary agent choices; a stated
default lets the person steer by exception (2026-07-09-db-store-design).
**Tradeoff:** The line is judgment, not enforcement — nothing stops entities living in kv.

### 2. Drizzle exposed raw, not wrapped

**Decision:** The db handle is a real drizzle instance and the schema is real drizzle
tables; Lodekit defines no query or schema DSL of its own.
**Why:** Agents know drizzle from training data and its docs are the ecosystem's — a
Lodekit wrapper would be a worse drizzle (the shadcn trade; 2026-07-09-db-store-design).
**Tradeoff:** Drizzle's surface and quirks become Lodekit's contract; version moves hit every app.

### 3. Push migrations with a destructive gate

**Decision:** Apps have no migration files. The declared schema is truth: additive diffs
apply on save, destructive diffs gate with expand-copy guidance, and a gated app keeps
serving on its previous schema.
**Why:** App schemas are authored live by an agent with no version lineage — ordered
migration journals are discipline agents get wrong under live iteration
(2026-07-09-db-store-design). The gate keeps "save and it's live" from destroying data.
**Tradeoff:** Renames and type changes can't be expressed; accepting one deliberately is unbuilt.

### 4. One database file per app, shared with the services

**Decision:** An app's tables live in the same per-app database as the services' own
bookkeeping: service tables carry a reserved underscore prefix, user tables are named
exactly as declared (underscore-prefixed names rejected).
**Why:** A second file would buy isolation the local trust posture doesn't demand, and
renamed-on-disk user tables would break raw SQL and introspection; one grammar check
replaces any reserved-word list (2026-07-09-db-store-design).
**Tradeoff:** An app can contrive raw SQL at its own service tables; the guard is
statement-text filtering, not an authorizer.

### 5. Workers never touch the database

**Decision:** Queries build client-side (typed) and execute host-side over the Scoped
API; the batch call is the transaction unit — there are no interactive transactions.
**Why:** One HTTP door on both sides keeps the app worker free of native dependencies and
the engine the single writer; interactive transactions do not exist over a request
boundary, so the batch story is stated, not simulated (2026-07-09-db-store-design).
**Tradeoff:** A round trip per statement; read-then-write logic is atomic only as one batch.

### 6. Redis and S3 re-derived, not embedded

**Decision:** kv-store keeps only the Redis capabilities that are one atomic statement
over SQLite (plus ttl and prefix scan); file-store keeps S3's core object model and drops
the rest — hashes, sorted sets, multipart, versioning, ACLs.
**Why:** Most of both APIs solves cloud problems — fleet durability, flaky networks,
many writers — that one person's single process on a real disk doesn't have
(2026-07-03-kv-store-v2-design, 2026-07-06-file-store-design).
**Tradeoff:** Apps needing dropped semantics build them in app code or wait for a proven need.

### 7. SQLite is the authority; Finder is a window

**Decision:** A file exists iff its index row exists: hand-dropped files are ignored, and
out-of-band deletions reconcile lazily on first read — no existence-polling sweep.
**Why:** Human-readable on-disk files are worth keeping, but a second write surface would
cost constant reconciliation churn to catch a rare action (2026-07-06-file-store-design).
**Tradeoff:** A Finder-deleted file lingers in listings until something reads it.

## Related

- **Recs:** 002-arch-event-fact-types
- **Specs:** docs/specs/2026-07-09-db-store-design.md,
  docs/specs/2026-07-03-kv-store-v2-design.md,
  docs/specs/2026-07-06-file-store-design.md

## Open Questions

- Accepting a destructive migration deliberately (a confirmation flow) is roadmap, not built.
- Cross-store transactions are not offered; no use case has forced the question.
