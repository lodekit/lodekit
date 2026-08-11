# 018-feat: MCP surface

**Status:** Active · **Last reviewed:** 2026-08-11

## Overview

The MCP server is the agent's door into Lodekit — the surface through which any agent
that speaks MCP drives the platform and reads an app's services on the person's behalf.
It is one half of the agent surface: the MCP server provides capability, and the skill
package provides instruction — the content an agent loads to learn the app contract,
the stack, and the rules for building on Lodekit. Both are agent-agnostic; Lodekit
assumes nothing about which agent is reading.

## Behavior

- The agent can drive Lodekit: scaffold a new app (the engine generates a conforming
  starter), list the apps in the Lodekit root, and open an app in the person's browser.
- The agent can read on the person's behalf: log records (filtered by app, level, or
  text), event history (filtered by stream, emitter, and type — the agent's "did my
  change actually work?" loop), an app's kv-store keys and values, an app's declared
  db-store tables and read-only queries over them (platform-internal tables hidden),
  declared settings with their effective values, and an app's file listing and
  per-file metadata.
- File bytes never travel through MCP: metadata hands the agent the real on-disk path
  and the served URL, and the skill instructs it to treat the path as read-only.
- Secrets and gateways expose wiring and status only — which slots exist, what is
  linked, each connection's state. Credential values and OAuth tokens are unreachable
  by construction; no value-reading tool exists.
- Service access is read-only. Writes to an app's data over MCP come later, behind
  designed guardrails; the only mutating acts today are app-shaped, not data-shaped —
  scaffolding an app and opening a browser tab.
- The MCP server reaches the engine over HTTP only, on the same doors the dashboard
  and SDK use. It starts even when the engine is down, and its base URL is
  overridable.
- The skill teaches the storage decision rules (domain records to the db-store, app
  memory to the kv-store, bytes to the file-store), the secrets and gateways hard
  rules (never ask for a credential in chat; the person links secrets and clicks
  Connect in the dashboard; the agent never handles OAuth tokens), and the debugging
  loop (read logs and events over MCP before assuming an edit worked).

## Design Decisions

### 1. HTTP-only, out of process

**Decision:** The MCP server is a thin separate process holding no engine code; it
reaches the engine exclusively over HTTP.
**Why:** No import-time dependency means it stays startable when the engine is down
and can say so usefully; and because it uses the same public doors as the dashboard
and SDK, the agent can never do anything the platform's own surfaces cannot
(spec 2026-07-02-product-overview §2.6).
**Tradeoff:** Every tool call pays a local HTTP hop, and the tool surface can only
ever be as expressive as the engine's API.

### 2. Read-only services, writes later behind guardrails

**Decision:** The agent reads app data freely; it cannot write it. Write access is
deferred until its guardrails are designed.
**Why:** Reading answers the person's questions ("show me all my recipes") and closes
the agent's verification loop with no damage potential. Uncontrolled agent writes to
the person's data are a security posture, not a feature gap.
**Tradeoff:** Fixing bad data means writing app code (or asking the person), even
when a one-line correction is obvious.

### 3. Wiring, never values, for credentials

**Decision:** Secrets and gateways tools return existence, links, and status — never
a value or token.
**Why:** The agent needs "is this configured?" and "does a gateway for this provider
exist?"; it never needs the credential itself. Values flow person → dashboard →
engine, bypassing the agent entirely (015-feat-secret-store, 014-feat-gateways).
**Tradeoff:** The agent cannot fully automate provider setup — the person's dashboard
step is deliberate friction.

### 4. Raw read-only SQL over a bespoke query vocabulary

**Decision:** The db-store tool accepts a plain SELECT statement, executed on a
read-only connection with platform tables hidden.
**Why:** Agents already write SQL well; a bespoke filter grammar would be a second
query language to teach and maintain. Read-only enforcement lives in the connection,
not in statement parsing.
**Tradeoff:** A raw-SQL door is a wider trust surface than a closed vocabulary —
acceptable for user-trusted local data.

### 5. Capability and instruction are separate packages

**Decision:** The MCP server carries no teaching; the skill carries no code. The
skill is content-only and agent-neutral.
**Why:** Any agent that can load a skill and speak MCP can drive Lodekit — the pair
is the whole coupling surface (spec 2026-07-02-product-overview §2.7). Docs remain
the human-facing sibling with the same content and a disjoint audience.
**Tradeoff:** Two artifacts to keep aligned with the platform; instruction can drift
from capability between rewrites.

## Related

- **Recs:** 010-feat-app-storage, 012-feat-settings, 014-feat-gateways,
  015-feat-secret-store
- **Specs:** docs/specs/2026-07-02-product-overview-design.md,
  docs/specs/2026-07-10-gateways-design.md, docs/specs/2026-07-07-secret-store-design.md

## Open Questions

- The skill's workflow section still describes the retired pre-contract era (plain
  HTML apps, the old manifest filename, a tool that no longer exists) and is marked
  stale pending its v0.1 rewrite; its storage, secrets, and gateways sections are
  current.
- No dedicated build-state inspection tool exists yet; the agent reconstructs build
  outcomes from events and logs. The product overview names it as a needed alignment.
