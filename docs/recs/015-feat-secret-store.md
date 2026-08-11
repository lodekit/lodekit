# 015-feat: Secret Store

**Status:** Active · **Last reviewed:** 2026-08-11

## Overview

The secret-store holds the person's credentials — API keys, auth tokens — encrypted at
rest, and gives apps rails to use them without ever seeing them outside server-side
code. There is one platform-wide catalog, owned by the person. Apps declare slots in
`src/secrets.ts`; the person links a catalog secret to each slot in the dashboard —
the link is the grant — and server-side app code reads the linked value through the
SDK. Credentials are never Settings and never kv-store entries: the person provides
them, the platform encrypts them, and only server code ever holds a value.

## Behavior

- A secret is a label (auto-slugged for identity), an optional description, and an
  encrypted value. From the moment of save the value is write-only: replaced or
  deleted, never displayed. The dashboard's inputs are masked and never echoed back,
  and no list, catalog, event, or log surface ever carries a value.
- Values are encrypted with AES-256-GCM, a fresh nonce per write; a failed integrity
  check yields a typed refusal, never garbage bytes. The master key lives in the
  macOS Keychain (a file provider serves tests and non-darwin), outside the Lodekit
  root — a backup of the data tree holds only ciphertext.
- If the key or the store cannot be reached, the service answers "unavailable" and
  the engine keeps running — there is no plaintext fallback. A lost key is recovered
  by re-entering values, which still exist at their sources.
- Apps declare slots (snake_case names; label and description required) in
  `src/secrets.ts`. Worker boot registers them wholesale: slots absent from the new
  declaration are removed and their links pruned; a bad slot shows a per-slot error
  without blocking siblings; a load error never wipes previous declarations.
- A declared slot is pending until the person links a secret to it — picking from
  the catalog or creating one inline on the app's Secrets panel; the app card badges
  pending slots ("N secrets needed") so the nudge is visible without hunting. The
  catalog page shows each secret's links; deleting a secret warns, then cascades —
  its links vanish and those slots fall back to pending.
- Readable means linked and valued. Server code reads a slot through the SDK; unlink
  or delete stops reads on the next call with a typed error distinguishing
  "unlinked" from "unavailable" — enough to render a calm "configure me in the
  dashboard" state, nothing more. There is no set and no list in the app-facing SDK.
- The server-only rule is enforced, not conventional: each app-worker boot mints a
  random in-memory token, and the single value-bearing read requires a token
  matching that app. Browser code fails fast before any request leaves; a missing or
  wrong token is refused identically regardless of link state — no probing oracle.
- Catalog and link changes reach the event bus as identity-only facts
  (`secret-created`, `secret-updated`, `secret-deleted`, `slot-linked`,
  `slot-unlinked`, `defs-changed`) — names only, never values.
- The agent's view is wiring-only: MCP lists the catalog and per-app slot status; no
  value-read tool exists, so an agent scaffolds slots and points the person at the
  dashboard — never asking for, or holding, a value.
- Gateways reuse the same catalog: a connection's secret slots link catalog secrets,
  and the engine injects them into provider requests host-side — on either rail,
  credentials never enter the app worker.

## Design Decisions

### 1. One person-owned catalog, reached through app-local slots

**Decision:** Secrets belong to the person, platform-wide; apps declare local slot
names and the person binds a catalog secret to each.
**Why:** A key is entered once and linked everywhere it's needed; no global name
collisions, no implicit-grant magic; two accounts for one provider just work; the
person names their secrets independently of the agent's code names (spec §2).
**Tradeoff:** An extra indirection (slot → link → secret) and a linking chore per app.

### 2. The link is the grant

**Decision:** Readable = slot linked and secret valued; unlinking or deleting stops
reads on the next call. No separate grant or ACL concept exists.
**Why:** One concept the dashboard can render and the person can reason about; the
same rail was designed to serve integrations, and gateways later reused it verbatim.
**Tradeoff:** No finer-grained permissions (expiry, read budgets, per-route grants)
without introducing new concepts.

### 3. Master key in the Keychain, written through the security CLI

**Decision:** A generated 256-bit key in a Keychain generic-password item, created
and read via the CLI; a key file under the State dir is the test/non-darwin provider
behind the same interface.
**Why:** Backups never contain plaintext (key and ciphertext separate); the CLI's
ACL attaches to the tool, not the engine binary, so dev vs packaged identity never
re-prompts; a native Keychain module would break the buildless engine. Rejected:
per-secret Keychain items, a key file beside the data, a passphrase-derived key.
**Tradeoff:** Same-user local processes stay trusted — the Keychain buys backup
safety, not local-process isolation; the key briefly rides argv on first write.

### 4. Server-only reads enforced by per-boot worker tokens

**Decision:** The one value-bearing route demands a per-app, per-boot, in-memory
token that only the app worker's environment holds.
**Why:** "Values never reach browser code" had to be enforced rather than
conventional — a down payment on hardening the local door.
**Tradeoff:** The token gate covers only the value read (and gateways); the rest of
the scoped API remains open on loopback.

### 5. Values are write-only for everyone, the agent included

**Decision:** No surface — dashboard, HTTP list, MCP, events, logs — ever returns a
value; replacement is the only edit.
**Why:** The person can't leak by viewing, and the agent can do all its work
(scaffold, detect pending, instruct) without ever holding a credential.
**Tradeoff:** No "show me the key" recovery — a forgotten value is re-obtained from
its source and re-entered.

## Related

- **Recs:** 001-arch-event-envelope-kind-component, 002-arch-event-fact-types,
  008-feat-dashboard, 012-feat-settings (the three-store boundary),
  014-feat-gateways (host-side injection over the same catalog)
- **Specs:** `docs/specs/2026-07-07-secret-store-design.md`,
  `docs/specs/2026-07-10-gateways-design.md`,
  `docs/specs/2026-07-16-events-canonical-model-design.md`

## Open Questions

- Greenhouse exercises the catalog through the gateway rail (the OpenWeatherMap key
  slot); the direct `src/secrets.ts` app-slot rail is covered by integration
  fixtures only and has no showcase home.
- Master-key rotation, non-darwin key providers beyond the file fallback, secret
  expiry, and an audit log of reads remain deferred.
