# 014-feat: Gateways

**Status:** Active · **Last reviewed:** 2026-08-11

## Overview

Gateways is the service through which an app reaches external providers — with
guardrails, monitoring, and credential safety the app cannot opt out of. All three
actors touch it: the agent authors a gateway (a declarative manifest, one per provider,
in the gateways tree under the Lodekit root) and declares an app's connection to it;
the person completes the connection in the dashboard; the app calls through the gateway
from its server-side code. "Integration" is deliberately not an artifact: the domain
logic of an integration lives in the app, and the guarded transport is the gateway.

## Behavior

- An app can only reach a provider a gateway's manifest declares: app code supplies a
  relative path, the engine assembles the full URL under the manifest's base URL, and a
  path that escapes the base is rejected. Redirects are never followed silently.
- Public providers must be HTTPS; plain HTTP is allowed only toward the person's own
  network (localhost, private ranges, `.local` names — a local Home Assistant).
- Provider secrets are injected host-side per the manifest's auth recipe (API key,
  bearer, basic, or OAuth 2.0). Credentials never enter the app worker: app code
  cannot read them, and a request supplying its own authorization header is rejected.
- Gateway calls are server-only — server functions and tasks. Browser code fails fast.
- A connection is completed by the person in the dashboard: linking a catalog secret
  to each secret slot, setting each config slot, clicking Connect for OAuth gateways.
  OAuth tokens are encrypted at rest, refreshed transparently, and never shown to
  anyone; a failed refresh flips the connection to needs-reauth.
- Every gateway carries guardrails: a per-provider rate limit (provider `Retry-After`
  respected), a circuit breaker on repeated network/server failures, timeouts under a
  hard cap, a response-size cap, and a concurrency cap. Failures surface to the app as
  typed reasons it can render or let a task retry on.
- An auth failure marks only that app's connection unhealthy — one app's revoked key
  never blocks another app's working one. Guard state is in-memory; a restart forgives.
- Every request leaves a Log Store record under a per-gateway source, filterable
  gateway-wide or per app. Credential values are redacted unconditionally; bodies are
  captured only when the person opts in. Gateway/connection changes and health
  transitions ride the event bus, so the dashboard renders live and apps can react.
- The dashboard shows a Gateways service page (per-gateway cards with provider
  branding and usage), a per-gateway detail page with each connection's slots and
  status badge (needs setup / connected / needs reauth / unhealthy), and a nudge
  badge on app cards when a connection still needs the person.
- An invalid manifest degrades, never dies: the gateway renders with its error, calls
  against it fail typed, and edits in the gateways tree re-validate live.
- The agent can list gateways and connection status over MCP — wiring only, never a
  credential or token.

## Design Decisions

### 1. Host-side execution, not an SDK-side wrapper

**Decision:** All gateway traffic flows app worker → engine → provider; the engine is
the single chokepoint (the executor's naming follows 005-arch-engine-rename).
**Why:** One chokepoint carries the whole guardrails, monitoring, and security story;
guardrail state lives in one process; monitoring never trusts app-side self-reporting
(spec 2026-07-10-gateways §2).
**Tradeoff:** A loopback hop per call — noise next to internet latency.

### 2. Gateways are declarative manifests, never code

**Decision:** A gateway is a manifest the engine executes; "integration" names no
stored artifact — domain logic stays in the app.
**Why:** The engine can fully enforce what a manifest declares (a gateway cannot reach
anything beyond its base URL), and manifests are shareable, diffable, and
agent-authorable. The skill's first instruction is to reuse an existing gateway.
**Tradeoff:** Provider quirks that need code (odd auth dances, scraping) are out of
reach; they become future services rather than gateway extensions.

### 3. Egress allowlisted by construction, not by inspection

**Decision:** App code can never supply an absolute URL; the resolved URL must stay
under the manifest's base URL; redirects return to the caller rather than follow.
**Why:** Constructing the only reachable URL is stronger than filtering arbitrary ones
— there is nothing to bypass (spec §2).
**Tradeoff:** Apps that need a provider's redirect chains must handle them explicitly,
and multi-host providers need one gateway per host.

### 4. Credentials never enter the app worker

**Decision:** Slots are resolved and injected host-side; the injected values double as
the redaction map for everything captured.
**Why:** Strictly stronger than letting app code read a secret — code physically
cannot leak a key it never holds (spec §1; the slot/link model is
015-feat-secret-store's, one level deeper).
**Tradeoff:** Providers whose auth doesn't fit a declared recipe can't be reached
until the recipe vocabulary grows.

### 5. Per-app connections over shared per-provider budgets

**Decision:** Each app×alias pair is its own connection (own links, own health); rate
limits and the circuit breaker are shared per gateway.
**Why:** The provider sees one client, so apps share the budget; revocation and auth
failures must stay per-app (spec §2, §9).
**Tradeoff:** A chatty app can exhaust a quieter app's shared rate budget.

### 6. No request-level retries

**Decision:** A failed call surfaces its typed reason; Tasks own retries at the run
level.
**Why:** Two retry layers multiply calls against providers with real quotas (spec §9).
**Tradeoff:** Interactive (non-task) callers must handle transient failures themselves.

## Related

- **Recs:** 001-arch-event-envelope-kind-component, 005-arch-engine-rename,
  008-feat-dashboard, 012-feat-settings, 015-feat-secret-store, 018-feat-mcp-surface
- **Specs:** docs/specs/2026-07-10-gateways-design.md,
  docs/specs/2026-07-17-loopback-bind-design.md (the ingress counterpart: the engine
  listener binds loopback by default, with an explicit, warned escape hatch),
  docs/specs/2026-07-07-secret-store-design.md

## Open Questions

- A deeper egress-hardening pass — normalized address classification for IPv6 and
  embedded-IPv4 forms, plus explicit local-network / allowed-hosts manifest scopes —
  is implemented on a branch but not landed (issue #88 open). Present behavior
  classifies private hosts textually (loopback, RFC-1918 literals, `.local`).
- Streaming responses, inbound webhooks, and declarative polling remain deferred; the
  polling recipe (scheduled task → gateway → db-store → event) covers the need.
