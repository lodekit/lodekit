# Gateways (v1) — design

**Date:** 2026-07-10
**Status:** Approved
**Fits:** the roadmap item "Integrations — gateways, outbound connections, rate
limiting" (deferred from the build-pipeline slice; the service was named **gateways**
during this design — see §3) and the umbrella spec's sequencing note that integrations
build on server functions + secrets
(`docs/specs/2026-07-02-product-overview-design.md`). Built directly on the
secret-store rail (`docs/specs/2026-07-07-secret-store-design.md` §6: "the future
integrations layer reuses steps 3–6 verbatim"), and closes the deferred secret-store
definition-of-done (the Greenhouse weather chapter, roadmap "Greenhouse integrations
chapter"). Leans on Tasks (polling), Events (health signals), log-store (traffic
observability), and Settings (service knobs).

## 1. Purpose and v1 scope

Gateways is the service through which apps **consume and act on external parties** —
with guardrails, monitoring, and security the app cannot opt out of. A person or
agent who wants to build an **integration** does it by using a **gateway** to the
**provider**: an agent authors a gateway (a declarative manifest — no code) once; any
app declares a **connection** to it; the person completes the connection in the
dashboard; all traffic then flows through the gateways service, which injects
credentials, enforces rate limits / circuit breaking / timeouts, and records every
request.

The central security property: **credentials never enter the app worker.** The worker
says "call through gateway X, path Y"; the runtime injects the secret. This is
strictly stronger than the raw `secrets.get` rail — app code physically cannot leak a
key it never holds.

**In v1:** HTTP(S) gateways only; agent-authored gateway manifests in a new
`gateways/` tree under the Lodekit root (watched, backed up); static credential auth
(API key in query/header, bearer, basic) **and OAuth 2.0** (authorization-code +
PKCE, transparent refresh) — zero new dependencies; app-side declaration via
`src/gateways.ts` (typed, worker-boot manifest registration); secret slots **linked**
and config slots **set** in the dashboard, reusing the secrets link flow; per-provider
rate limiting, 429/`Retry-After` respect, a network/5xx circuit breaker, timeouts,
response-size and concurrency caps; per-request log-store records with credential
redaction; health events on the bus; a Gateways dashboard service page; a
Settings → Services → Gateways section; a read-only MCP tool; skill guidance; two
Greenhouse chapters (weather + a live OAuth demo) as definition-of-done.

**Not in v1** (deferred, §16): non-HTTP transports (FTP etc.), scraping (its own
future service — roadmap), streaming/SSE responses, request-level retries (Tasks owns
retries), declarative gateway-level polling, inbound webhooks, response caching,
OAuth device flow and provider-specific quirk handling, per-gateway settings
overrides, MCP write tools.

## 2. Posture and decisions

- **Host-side execution, not an SDK-side wrapper.** All gateway traffic flows app
  worker → runtime → provider. One chokepoint carries the entire guardrails,
  monitoring, and security story; guardrail state (buckets, breakers) lives in one
  process; monitoring never trusts app-side self-reporting. Cost: a loopback hop per
  call — noise next to internet latency. Rejected: SDK-side fetch with a worker-token
  secret read (secrets in app space, fragmented guardrails); host-minted signed
  credentials with direct SDK calls (complexity, no local payoff).
- **Gateways are declarative, agent-authored, shared.** A gateway is a manifest —
  never code — so the runtime can fully enforce guardrails (a gateway cannot reach
  anything its manifest doesn't declare). Domain logic (parsing responses, mapping to
  the Database) stays in the app's server functions and tasks. The skill's first
  instruction: check the existing tree before authoring a new gateway.
- **Per-app connections, no shared instances.** Each app×gateway pair is its own
  connection with its own slot links and config values. The same catalog secret is
  reusable across connections (the secrets model), so "same key, several apps" costs
  one paste. Per-app revocation stays possible; "instance" dies as a person-facing
  concept.
- **Egress is allowlisted by construction.** The runtime assembles the URL from the
  gateway's `base_url` + the request path; app code can never supply an absolute URL,
  and the resolved URL must stay under the base URL.
- **Bank/brokerage reality:** these connect via aggregators (SimpleFIN, GoCardless,
  Plaid, …) rather than banks directly; generic OAuth 2.0 + static keys covers them.
  Session-cookie sources with no API (Instagram feeds) are explicitly out — parked in
  the roadmap as a future scraping service.

## 3. Terminology (closes with this slice)

- **Gateway** — the managed door to one provider: an agent-authored declarative
  manifest (name, favicon, website, base URL, auth recipe, slots, guardrail
  defaults) plus the runtime machinery that executes its traffic. Countable and
  person-facing ("the OpenWeatherMap gateway", "3 apps use this gateway"). Keyed by
  the **provider id** (the app-id grammar, `^[a-z0-9-]+$`) — one gateway per
  provider; lives at `gateways/<provider-id>/` under the Lodekit root.
  _Avoid_: proxy, connector, integration (see the flagged ambiguity), template.
- **Provider** — the external party a gateway fronts: OpenWeatherMap, an aggregator,
  a local Home Assistant. The manifest describes it (name, website, favicon); the
  provider id doubles as the gateway's key.
  _Avoid_: service (that's a catalog word), API (the surface, not the party).
- **Integration** — the *outcome* word, deliberately without an artifact: what a
  person or agent sets out to build ("integrate Greenhouse with the weather"). The
  skill's sentence is canonical: **you build an integration by using a gateway to
  the provider — reuse one if it exists, author one if not.** The domain logic of an
  integration lives in the app; the guarded transport is the gateway.
  _Avoid_: integration as the name of any stored object, route, or table.
- **Connection** — the app × gateway grant: declared by the app in
  `src/gateways.ts` under an app-local **alias**, completed by the person in the
  dashboard — **linking** a catalog secret to each secret slot (the secrets verb and
  mechanism, verbatim) and **setting** each config slot's value. The secrets
  sentence transfers: the completed connection is the grant. An app may declare two
  aliases on the same gateway (two accounts) — connections key on `(appId, alias)`.
  _Avoid_: instance (retired), integration config, fill.
- **Slot** (extended from secret-store) — a gateway-declared named input. Two kinds:
  **secret slots** (linked to a catalog secret) and **config slots** (plain
  per-connection values: a personal `base_url` for Home Assistant, an account id, a
  client id). A slot with no link/value is **pending** (the secrets word).
- **Gateways tree** — the `gateways/` directory under the Lodekit root, sibling to
  `apps/` and `data/`; part of the Backup tree.
- Catalog naming: **gateways** (like tasks/settings, no `-store`); catalog-name →
  SDK-handle mapping `gateways → gateways`.
- `context.md` is amended: Gateway / Provider / Connection entries, an Integration
  flagged-ambiguity entry (the canonical skill sentence), the gateways tree under
  Storage & filesystem, the service-catalog line, and a Relationships sentence (apps
  reach external parties only through gateways).

## 4. The gateway manifest

`gateways/<provider-id>/manifest.json` (+ `favicon.png` or `favicon.svg` beside it —
added when the gateway is built):

```jsonc
{
  "name": "OpenWeatherMap",
  "website": "https://openweathermap.org",
  "base_url": "https://api.openweathermap.org",
  "auth": { "kind": "api_key", "in": "query", "param": "appid", "slot": "api_key" },
  "slots": {
    "api_key": { "kind": "secret", "label": "API key" }
  },
  "limits": { "rate": "60/min" }
}
```

- **`base_url`** — a literal HTTPS URL, or `{ "from_slot": "<config-slot>" }` for
  personal endpoints (Home Assistant). HTTP is allowed only for
  localhost/RFC-1918 hosts (a local Home Assistant), never for public hosts.
- **`auth`** — one of:
  - `{ "kind": "none" }` — open APIs still get guardrails + monitoring;
  - `{ "kind": "api_key", "in": "query" | "header", "param" | "header": "...", "slot": "..." }`;
  - `{ "kind": "bearer", "slot": "..." }` → `Authorization: Bearer <value>`;
  - `{ "kind": "basic", "username_slot": "...", "password_slot": "..." }`;
  - `{ "kind": "oauth2", ... }` — §7.
- **`slots`** — `{ kind: "secret" | "config", label, description?, optional? }`.
  Secret slots hold credentials; config slots hold plain values (stored per
  connection, plaintext). Auth recipes reference slots by name; unreferenced slots
  are legal (a config slot consumed only via `from_slot`).
- **`limits`** — optional per-gateway overrides: `rate` (`"N/second|minute|hour"`),
  `concurrency`, `timeout_ms` (capped by the platform hard cap). Omitted values fall
  back to the Settings defaults (§11).
- Validation: a zod schema at load. An invalid manifest degrades, never dies: the
  gateway renders in the dashboard with its error; calls against it fail with a
  typed error. The runtime watches the gateways tree (the apps-tree watcher
  pattern) — manifest edits re-validate live and emit `gateway-change`.

## 5. Declaration contract — `src/gateways.ts`

```ts
// apps/<id>/src/gateways.ts
import { defineGateways, gateway } from "@lodekit/sdk";

export default defineGateways({
  weather: gateway({
    provider: "openweathermap",
    description: "Daily forecast for the watering log.",
  }),
});
```

- `defineGateways` is the `defineSecrets` twin: validates shape locally and tags the
  export so `appWorkerEntry` can find it. The `gateways` SDK handle is alias-indexed
  (`[alias: string]: ConnectionHandle`) rather than inferred per alias from the
  declaration — any string key type-checks; no `gateways.weather` autocomplete yet.
- Alias names: lower `snake_case` (the slot grammar).
- The Start build includes `src/gateways.ts` as an additional server-bundle entry
  (the settings/tasks/secrets mechanism, `build.ts`). On worker boot the worker posts
  a **gateways manifest**; the runtime upserts declarations into the app's own db
  (`_gateway_uses`: alias PK, provider id, description, registered-at) — wholesale
  per successful boot, pruned aliases drop their links and config values. Declaring
  an unknown provider id registers with a visible per-alias error (the settings
  per-field-error pattern) — the nudge to author the gateway.
- Apps without `src/gateways.ts` have no connections.

## 6. Executing requests

**Route:** `POST /api/apps/:appId/gateways/:alias/request` — worker-token gated
exactly like the secrets value route (§7 of the secret-store spec): per-boot token,
`x-lodekit-worker-token` header must match the path `:appId`; 401 regardless of
connection state on a bad token. Browser code has no token; the SDK fails fast
client-side ("gateways are server-only; call from a server function or task").

**Request descriptor** (validated at the trust boundary):

```jsonc
{
  "method": "GET",
  "path": "/data/2.5/forecast",       // must be relative; absolute URLs rejected
  "query": { "q": "Lisbon" },
  "headers": { "accept": "application/json" },
  "body": "…",                         // string; "body_base64" for binary
  "timeout_ms": 5000                   // optional, ≤ the platform hard cap
}
```

**Execution order:** resolve connection (declared? complete? manifest valid?) →
breaker check → concurrency slot → rate-limit token → assemble URL (`base_url` +
path + query; resolved URL must stay under `base_url` — traversal rejected) → inject
credentials per the auth recipe (recipe-owned headers/params win; a descriptor that
tries to set one is rejected with a typed error, not silently overwritten) → fetch
with timeout → buffer the response under the size cap → record the log → return.

**Response envelope:** `{ status, headers, body | body_base64, duration_ms }`.
Responses are buffered whole — no streaming in v1 (§16).

**SDK surface** (server-only, typed via `defineGateways` inference):

```ts
import { gateways } from "@lodekit/sdk";

const res = await gateways.weather.get("/data/2.5/forecast", {
  query: { q: "Lisbon", units: "metric" },
});
if (res.ok) {
  const forecast = await res.json();
}
```

`get/post/put/patch/delete(path, opts)` plus a raw `request(descriptor)`. The
response object is a thin `{ status, ok, headers, json(), text() }`. Failures throw
`GatewayError` with a typed `reason`: `unconfigured` (pending slots / unknown
provider / invalid manifest), `rate_limited`, `breaker_open`, `needs_reauth`,
`timeout`, `too_large`, `network` — enough for an app to render a decent state or
let a task run fail and retry on its own schedule.

## 7. OAuth 2.0

Authorization-code + PKCE, **zero new dependencies**: authorize-URL construction,
`state`/PKCE verifier via `node:crypto` (S256 = sha256 + base64url), token exchange
and refresh as plain `fetch` POSTs. (If a provider's quirks ever hurt, `arctic` is
the known escape hatch — not taken in v1.)

Manifest:

```jsonc
{
  "auth": {
    "kind": "oauth2",
    "authorization_url": "https://provider.example/oauth/authorize",
    "token_url": "https://provider.example/oauth/token",
    "scopes": ["transactions:read"],
    "pkce": true,
    "client_id_slot": "client_id",           // config slot
    "client_secret_slot": "client_secret"    // secret slot; omit for public clients
  }
}
```

**Flow:** the dashboard connection row shows **Connect** →
`POST /api/apps/:appId/gateways/:alias/oauth/start` returns the authorize URL
(state bound to `(appId, alias)` + PKCE verifier, held in memory with a 10-minute
TTL) → browser consents → provider redirects to
`GET /api/gateways/oauth/callback` on localhost → code exchange → tokens stored.

**Token storage:** access + refresh token + expiry, encrypted as one blob with the
secret-store key-provider rail (AES-256-GCM, same master key, same degraded-mode
rule: key unavailable → 503, never plaintext). Tokens live in the platform gateways
store (§8), are write-only from the dashboard's perspective, and never appear in any
route response, log, or event.

**Refresh:** the runtime injects the access token and refreshes transparently when
expired (or once on a 401 with a refresh token in hand). A failed refresh flips the
connection to **needs reauth**: a `gateway-health` event, a dashboard badge, and
`GatewayError("needs_reauth")` on subsequent calls until the person reconnects.

## 8. Storage

`data/_platform/gateways.sqlite` (beside `secrets.sqlite` — the person's data,
inside the backup boundary; credentials in it are ciphertext):

- `links` — `(app_id, alias, slot)` PK, `slug` (soft reference into the secrets
  catalog, resolved at call time — deleting the secret makes the slot pending
  again), `linked_at`. The secrets `links` table shape, one level deeper (per
  alias) — same word, same mental model, same dashboard flow.
- `config_values` — `(app_id, alias, slot)` PK, `value` (plaintext), `set_at`.
- `oauth_tokens` — `(app_id, alias)` PK, `ciphertext` BLOB, `nonce` BLOB,
  `updated_at`.

Declarations live app-side (`_gateway_uses`, §5) and follow the app's data
lifecycle. Gateway manifests live on disk in the gateways tree — the tree is the
source of truth; nothing manifest-shaped is copied into SQLite. Breaker and
rate-bucket state is in-memory only (a restart forgives).

**Connection status** (derived, never stored): `needs setup` (a required slot
pending, or OAuth not yet connected) → `connected` → `needs reauth` (OAuth refresh
failed) / `unhealthy` (latest call hit 401/403; sticky until the next success or
relink). Gateway-level: `breaker open` while the breaker is open.

## 9. Guardrails

- **Rate limiting** — a token bucket **per gateway**, shared by all its connections
  (the provider sees one client, so apps share the budget). Manifest `limits.rate`
  overrides the `gateways.default_rate` setting. A caller briefly waits for a token
  (bounded by its request timeout); beyond that, `rate_limited`.
- **429 respect** — a provider 429 with `Retry-After` pauses the bucket accordingly;
  callers in that window get `rate_limited` without touching the provider.
- **Circuit breaker, split by failure kind** — consecutive network errors / 5xx
  (threshold: `gateways.breaker_failure_threshold`) open a **per-gateway** breaker
  for `gateways.breaker_cooldown_ms`, then a single half-open probe. 4xx never
  trips it. 401/403 instead mark that one **connection** `unhealthy` — one app's
  revoked key must not block another app's working one. Breaker transitions emit
  `gateway-health` events.
- **Timeouts** — `gateways.default_timeout_ms`, overridable per gateway (manifest)
  and per request (descriptor), all under a hard platform cap.
- **Response size cap** — `gateways.max_response_bytes`, enforced while buffering;
  exceeding aborts with `too_large`.
- **Concurrency cap** — a small per-gateway parallelism limit
  (manifest `limits.concurrency`, default from settings) so a burst of tasks cannot
  stampede a provider.
- **Deliberately absent: request-level retries.** Tasks own retries at the run
  level; two retry layers multiply calls. A failed call surfaces its typed error
  and lets the task's retry/backoff policy decide.

## 10. Observability

**Traffic records ride the log-store** — no new store, no new UI. One record per
request:

- `app` = the calling app id; `source` = `gateway:<provider-id>` — so the two
  person-facing filters fall out of existing log-store querying: gateway-wide
  (`source=gateway:openweathermap`) and gateway×app (add the app filter).
- Level by outcome: 2xx/3xx `info`, 4xx `warn`, 5xx / network / timeout /
  breaker / size `error`.
- Message: `GET /data/2.5/forecast → 200 (312 ms)`.
- Structured fields: provider id, alias, method, path, status, outcome,
  `duration_ms`, request/response byte counts.
- **Bodies are not captured by default** (privacy + volume). The
  `gateways.capture_bodies` setting opts in, truncated to a small cap per side.
- **Redaction is unconditional:** the auth recipe's injection points double as the
  redaction map — injected headers/params render as `•••` in any captured data, and
  `Authorization` / `Cookie` / `Set-Cookie` are always stripped. Credential values
  never appear in logs, events, route responses, or the dashboard.

**Events** (the bus, durable + SSE):

- `gateway-change` — change feed: gateway added/removed/edited (platform-scoped),
  connection declared/linked/unlinked/set (app-scoped). Names only.
- `gateway-health` — breaker opened/closed (platform-scoped, payload names the
  gateway), connection `needs_reauth` / `unhealthy` transitions (app-scoped). Apps
  can `watch` and react; the dashboard renders live.

## 11. Settings — Services → Gateways

A new `PLATFORM_SETTINGS` section "Gateways" (global scope; per-gateway tuning
belongs in manifests, not settings). Keys use the settings grammar's duration fields
rather than raw `_ms` numbers:

- `gateways.default_timeout` (duration, default `10s`; max `60s`)
- `gateways.default_rate` (string, default `60/min`)
- `gateways.default_concurrency` (number, default 4)
- `gateways.max_response_bytes` (number, default 10 000 000)
- `gateways.capture_bodies` (boolean, default off)
- `gateways.breaker_failure_threshold` (number, default 5, advanced)
- `gateways.breaker_cooldown` (duration, default `30s`, advanced)

## 12. Dashboard UX

- **Services menu:** a **Gateways** entry in `nav.ts` `SERVICES` (lucide `Plug`;
  registered in `SERVICE_ICONS`).
- **`/gateways`** — gateway cards wearing their provider's branding: favicon, name,
  external-link icon to the website (new-tab affordance), a usage line with an icon
  (`AppWindow` + "3 apps"; icon-map registered). Gateways with manifest errors badge
  the error. Empty state points the person at their agent ("ask your agent to add a
  gateway — it knows how").
- **`/gateways/$providerId`** — header card: favicon, title, external link (new-tab
  icon), **Logs** (pre-filtered `source=gateway:<provider-id>`), and **Settings**
  (redirect icon → Settings → Services → Gateways). Below, the connections list: one
  row per app×alias with its slots — secret slots reuse the `AppSecretsCard` linking
  UI (link existing / create-new-secret inline), config slots are plain inputs — a
  status badge (`needs setup` / `connected` / `needs reauth` / `unhealthy`), a
  **Connect / Reconnect** button for OAuth gateways, and a per-row Logs link
  pre-filtered to gateway×app.
- **App cards** on the dashboard home reuse the `PendingSecretsBadge` pattern: a
  declared connection with pending slots (or pending OAuth) badges the app.
- Favicons served by the runtime from the gateway folder
  (`GET /api/gateways/:providerId/favicon`).
- Live via `gateway-change` / `gateway-health`.

## 13. MCP and skill

**MCP** — one read-only tool, `lodekit_gateways`: gateways (provider id, name,
website, auth kind, slots, limits, manifest errors, usage counts) and connections
(app, alias, provider id, per-slot status, connection status). Wiring and status
only — never a credential, never a token. This is what lets an agent answer "do we
already have a gateway for this provider?" without touching the filesystem.

**Skill** — a new `## Gateways` section:

- **The framing sentence, verbatim and first:** *you build an integration by using
  a gateway to the provider — reuse one if it exists, author one if not.* When the
  person asks to "integrate with X" or "get data from X", the gateway is how.
- The decision flow: **check existing gateways first** (`lodekit_gateways`); reuse
  by declaring a connection; only author a new manifest when none fits.
- Manifest authoring: the schema, the auth recipes, adding a favicon to the gateway
  folder, HTTPS-only for public hosts.
- The declaration contract (`defineGateways`) and the server-only call surface (from
  server functions and tasks; never from browser code).
- **The polling recipe:** a scheduled task calls through the gateway, writes domain
  records to the app's Database, emits an event. No gateway-side polling machinery
  exists — Tasks is the scheduler, the Database is the record, Events is the
  announcement.
- The OAuth handoff: the agent never handles tokens — direct the person to the
  gateway page's Connect button.
- The secrets rules verbatim: never ask for a credential in chat; direct the person
  to the dashboard.

## 14. Greenhouse definition-of-done

Two chapters — one per auth family — closing the deferred secret-store DoD in the
same stroke. The manager's first-run install copies the gateways tree alongside
`apps/`.

**Weather (static credentials):**

- An `openweathermap` gateway manifest (+ favicon) checked into
  `root/gateways/openweathermap/`.
- Greenhouse declares a `weather` connection; the person links a real API key
  through the gateway's `api_key` secret slot (the deferred secret-store DoD,
  retired).
- A daily scheduled task fetches the forecast through the gateway and records
  high / low / rained / humidity / wind into a Greenhouse db table (the polling
  recipe, exercised for real).
- A small forecast widget renders current conditions and the recent daily log.

**OAuth demo (no registration required):**

- A `duende-demo` gateway manifest checked into `root/gateways/duende-demo/`,
  pointing at Duende's public IdentityServer demo (`demo.duendesoftware.com`):
  OAuth 2.0 authorization-code + PKCE against its published interactive demo client
  (client ids and demo users — alice/bob — are public documentation on the demo
  page; the person sets the client id in a config slot), tokens from
  `/connect/token`, and the demo's protected test API called through the gateway.
- Greenhouse declares an `oauth_demo` connection and renders a small "connected
  identity" card: the claims returned by the protected API, fetched through the
  gateway — Connect/Reconnect, transparent refresh (the demo's short-lived access
  tokens exercise it), and needs-reauth all observable against a real, spec-correct
  OAuth server with zero app registration.
- Third-party-demo caveat, accepted: the host is for the manual smoke/demo only
  (automated tests use local fake endpoints, §15); if the demo host ever changes,
  the fix is one manifest file — itself a demonstration of the declarative model.

`root/readme.md` gains the coverage checklist rows for both chapters.

## 15. Testing

- **Unit (pure):** manifest zod validation (auth recipes, slot references, base-url
  rules incl. the localhost/RFC-1918 HTTP exception); rate grammar parsing; token
  bucket behavior incl. `Retry-After` pause; breaker state machine
  (trip / cooldown / half-open / 4xx-never-trips); URL assembly + traversal
  rejection; redaction mapping; PKCE challenge derivation.
- **Service (Hono router, temp root, file key provider, stub provider server):**
  auth injection per kind (query key, header key, bearer, basic); recipe-owned
  header collision rejected; absolute-URL and traversal rejection; worker-token gate
  (401 wrong/missing, matching `:appId` required); rate-limit wait then
  `rate_limited`; breaker trip on 5xx and half-open recovery; 401 → connection
  `unhealthy`, breaker untouched; timeout and size-cap aborts; log records asserted
  — fields, levels, `source=gateway:<provider-id>`, and **credential absence
  asserted explicitly** (with `capture_bodies` on); `gateway-change` /
  `gateway-health` emission.
- **OAuth (fake authorize/token endpoints):** start → state/PKCE round-trip →
  exchange → encrypted tokens at rest (ciphertext asserted); transparent refresh on
  expiry; refresh failure → `needs_reauth` + event; degraded key provider → 503.
- **Integration (real worker, e2e pattern):** fixture app declares an alias;
  manifest registration on boot and wholesale re-registration on edit; link via API
  → typed `gateways.<alias>.get` returns the stubbed body in a server function;
  browser-context call fails fast; unlinking → `GatewayError("unconfigured")`.
- **MCP:** `lodekit_gateways` lists wiring, never values.
- **Greenhouse (manual smoke):** link a real OpenWeatherMap key, watch the daily
  task record a row, see the widget render, and find the request in Logs under both
  filters; run the Duende Connect flow, see the identity card, and observe a
  transparent refresh.

## 16. Deferred (→ roadmap)

- **Scraping service** — sourcing from parties with no API; already parked in the
  roadmap with rationale.
- **Non-HTTP transports** — FTP and friends; HTTP-only is precisely what makes v1's
  guardrails enforceable.
- **Streaming / SSE responses** — v1 buffers whole responses under the size cap.
- **Declarative polling** — gateway-level "poll this endpoint every X, emit an
  event"; v1's recipe (task → gateway → db → event) covers the need app-side.
- **Request-level retries** — deliberately absent (§9); revisit only if task-level
  retries prove too coarse.
- **Inbound webhooks** — stays with the umbrella spec's server-code substrate item.
- **OAuth extras** — device flow, non-standard token endpoints, provider quirk
  handling (`arctic` as the known escape hatch), token revocation on disconnect.
- **Per-gateway settings overrides** — manifests carry per-gateway tuning for now;
  a settings surface for it would need a per-gateway scope the settings grammar
  doesn't have.
- **Response caching** — dedupe/short-TTL caching at the gateway.
- **Quota budgets** — per-gateway call/cost budgets with dashboard warnings.
- **MCP write tools** — linking slots or triggering OAuth from the agent; pairs
  with the MCP write-access guardrails (Security).
