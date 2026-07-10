# Integrations (v1) — design

**Date:** 2026-07-10
**Status:** Approved
**Fits:** the roadmap item "Integrations — gateways, outbound connections, rate
limiting" (deferred from the build-pipeline slice) and the umbrella spec's sequencing
note that integrations build on server functions + secrets
(`docs/specs/2026-07-02-product-overview-design.md`). Built directly on the
secret-store rail (`docs/specs/2026-07-07-secret-store-design.md` §6: "the future
integrations layer reuses steps 3–6 verbatim"), and closes the deferred secret-store
definition-of-done (the Greenhouse weather chapter, roadmap "Greenhouse integrations
chapter"). Leans on Tasks (polling), Events (health signals), log-store (traffic
observability), and Settings (service knobs).

## 1. Purpose and v1 scope

Integrations is the service through which apps **consume and act on external
parties** — with guardrails, monitoring, and security the app cannot opt out of.
An agent authors a **provider** (a declarative manifest — no code) once; any app
declares a **connection** to it; the person completes the connection in the dashboard
by filling the provider's slots; all traffic then flows through a host-side
**gateway** that injects credentials, enforces rate limits / circuit breaking /
timeouts, and records every request.

The central security property: **credentials never enter the app worker.** The worker
says "call provider X, path Y"; the runtime injects the secret. This is strictly
stronger than the raw `secrets.get` rail — app code physically cannot leak a key it
never holds.

**In v1:** HTTP(S) providers only; agent-authored provider manifests in a new
`integrations/` tree under the Lodekit root (watched, backed up); static credential
auth (API key in query/header, bearer, basic) **and OAuth 2.0** (authorization-code +
PKCE, transparent refresh) — zero new dependencies; app-side declaration via
`src/integrations.ts` (typed, worker-boot manifest registration); slot fills in the
dashboard reusing the secrets link flow plus plain **config slots**; the gateway with
per-provider rate limiting, 429/`Retry-After` respect, a network/5xx circuit breaker,
timeouts, response-size and concurrency caps; per-request log-store records with
credential redaction; health events on the bus; an Integrations dashboard service
page; a Settings → Services → Integrations section; a read-only MCP tool; skill
guidance; the Greenhouse weather chapter as definition-of-done.

**Not in v1** (deferred, §16): non-HTTP transports (FTP etc.), scraping (its own
future service — roadmap), streaming/SSE responses, request-level retries (Tasks owns
retries), declarative provider-level polling, inbound webhooks, response caching,
OAuth device flow and provider-specific quirk handling, per-provider settings
overrides, MCP write tools.

## 2. Posture and decisions

- **Host-side gateway, not an SDK-side wrapper.** All integration traffic flows app
  worker → runtime → provider. One chokepoint carries the entire guardrails,
  monitoring, and security story; guardrail state (buckets, breakers) lives in one
  process; monitoring never trusts app-side self-reporting. Cost: a loopback hop per
  call — noise next to internet latency. Rejected: SDK-side fetch with a worker-token
  secret read (secrets in app space, fragmented guardrails); host-minted signed
  credentials with direct SDK calls (complexity, no local payoff).
- **Providers are declarative, agent-authored, shared.** A provider is a manifest —
  never code — so the gateway can fully enforce guardrails (a provider cannot fetch
  anything its manifest doesn't declare). Domain logic (parsing responses, mapping to
  the Database) stays in the app's server functions and tasks. The skill's first
  instruction: check the existing tree before authoring a new provider.
- **Per-app connections, no shared instances.** Each app×provider pair is its own
  connection with its own slot fills. The same catalog secret is reusable across
  connections (the secrets model), so "same key, several apps" costs one paste.
  Per-app revocation stays possible; "instance" dies as a person-facing concept.
- **Egress is allowlisted by construction.** The gateway assembles the URL from the
  provider's `base_url` + the request path; app code can never supply an absolute URL,
  and the resolved URL must stay under the base URL.
- **Bank/brokerage reality:** these connect via aggregators (SimpleFIN, GoCardless,
  Plaid, …) rather than banks directly; generic OAuth 2.0 + static keys covers them.
  Session-cookie sources with no API (Instagram feeds) are explicitly out — parked in
  the roadmap as a future scraping service.

## 3. Terminology (closes with this slice)

- **Provider** — an agent-authored declarative manifest describing one external
  party: name, favicon, website, base URL, auth recipe, slots, guardrail defaults.
  Identified by a **provider id** (the app-id grammar, `^[a-z0-9-]+$`); lives at
  `integrations/<provider-id>/` under the Lodekit root.
  _Avoid_: integration (the service, not the party), connector, template.
- **Connection** — the app × provider grant: declared by the app in
  `src/integrations.ts` under an app-local **alias**, completed by the person filling
  the provider's slots in the dashboard. The secrets sentence transfers: the filled
  connection is the grant. An app may declare two aliases on the same provider (two
  accounts) — connections key on `(appId, alias)`.
  _Avoid_: instance (retired), integration config, link (that's the secret-slot verb).
- **Slot** (extended from secret-store) — a provider-declared named input. Two kinds:
  **secret slots** (filled by linking a catalog secret — the existing flow) and
  **config slots** (plain per-connection values: a personal `base_url` for Home
  Assistant, an account id, a client id).
- **Gateway** — the runtime chokepoint that executes connection traffic: URL
  assembly, credential injection, guardrails, logging. Internal name only — never
  person-facing.
  _Avoid_: proxy (transport detail), egress service.
- **Integrations tree** — the `integrations/` directory under the Lodekit root,
  sibling to `apps/` and `data/`; part of the Backup tree.
- Catalog naming: **integrations** (like tasks/settings, no `-store`); catalog-name →
  SDK-handle mapping `integrations → integrations`.
- `context.md` is amended: Provider / Connection / Gateway entries, the integrations
  tree under Storage & filesystem, the service-catalog line, and a Relationships
  sentence (apps reach external parties only through the gateway).

## 4. The provider manifest

`integrations/<provider-id>/manifest.json` (+ `favicon.png` or `favicon.svg` beside
it — added when the provider is built):

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
- **`limits`** — optional per-provider overrides: `rate` (`"N/second|minute|hour"`),
  `concurrency`, `timeout_ms` (capped by the platform hard cap). Omitted values fall
  back to the Settings defaults (§11).
- Validation: a zod schema at load. An invalid manifest degrades, never dies: the
  provider renders in the dashboard with its error; gateway calls against it fail
  with a typed error. The runtime watches the integrations tree (the apps-tree
  watcher pattern) — manifest edits re-validate live and emit `integration-change`.

## 5. Declaration contract — `src/integrations.ts`

```ts
// apps/<id>/src/integrations.ts
import { defineIntegrations, integration } from "@lodekit/sdk";

export default defineIntegrations({
  weather: integration({
    provider: "openweathermap",
    description: "Daily forecast for the watering log.",
  }),
});
```

- `defineIntegrations` is the `defineSecrets` twin: validates shape locally, drives
  SDK type inference — `integrations.weather` is typed, aliases autocomplete.
- Alias names: lower `snake_case` (the slot grammar).
- The Start build includes `src/integrations.ts` as an additional server-bundle entry
  (the settings/tasks/secrets mechanism, `build.ts`). On worker boot the worker posts
  an **integrations manifest**; the runtime upserts declarations into the app's own
  db (`_integration_uses`: alias PK, provider id, description, registered-at) —
  wholesale per successful boot, pruned aliases drop their fills. Declaring an
  unknown provider id registers with a visible per-alias error (the settings
  per-field-error pattern) — the nudge to author the provider.
- Apps without `src/integrations.ts` have no connections.

## 6. The gateway

**Route:** `POST /api/apps/:appId/integrations/:alias/request` — worker-token gated
exactly like the secrets value route (§7 of the secret-store spec): per-boot token,
`x-lodekit-worker-token` header must match the path `:appId`; 401 regardless of
connection state on a bad token. Browser code has no token; the SDK fails fast
client-side ("integrations are server-only; call from a server function or task").

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

**Execution order:** resolve connection (declared? filled? provider valid?) →
breaker check → concurrency slot → rate-limit token → assemble URL (`base_url` +
path + query; resolved URL must stay under `base_url` — traversal rejected) → inject
credentials per the auth recipe (recipe-owned headers/params win; a descriptor that
tries to set one is rejected with a typed error, not silently overwritten) → fetch
with timeout → buffer the response under the size cap → record the log → return.

**Response envelope:** `{ status, headers, body | body_base64, duration_ms }`.
Responses are buffered whole — no streaming in v1 (§15).

**SDK surface** (server-only, typed via `defineIntegrations` inference):

```ts
import { integrations } from "@lodekit/sdk";

const res = await integrations.weather.get("/data/2.5/forecast", {
  query: { q: "Lisbon", units: "metric" },
});
if (res.ok) {
  const forecast = await res.json();
}
```

`get/post/put/patch/delete(path, opts)` plus a raw `request(descriptor)`. The
response object is a thin `{ status, ok, headers, json(), text() }`. Failures throw
`IntegrationError` with a typed `reason`: `unconfigured` (unfilled slots / unknown
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
`POST /api/apps/:appId/integrations/:alias/oauth/start` returns the authorize URL
(state bound to `(appId, alias)` + PKCE verifier, held in memory with a 10-minute
TTL) → browser consents → provider redirects to
`GET /api/integrations/oauth/callback` on localhost → code exchange → tokens stored.

**Token storage:** access + refresh token + expiry, encrypted as one blob with the
secret-store key-provider rail (AES-256-GCM, same master key, same degraded-mode
rule: key unavailable → 503, never plaintext). Tokens live in the platform
integrations store (§8), are write-only from the dashboard's perspective, and never
appear in any route response, log, or event.

**Refresh:** the gateway injects the access token and refreshes transparently when
expired (or once on a 401 with a refresh token in hand). A failed refresh flips the
connection to **needs reauth**: an `integration-health` event, a dashboard badge, and
`IntegrationError("needs_reauth")` on subsequent calls until the person reconnects.

## 8. Storage

`data/_platform/integrations.sqlite` (beside `secrets.sqlite` — the person's data,
inside the backup boundary; credentials in it are ciphertext):

- `fills` — `(app_id, alias, slot)` PK, `kind` (`secret` | `config`),
  `secret_slug` (secret fills; soft reference into the secrets catalog, resolved at
  call time — deleting the secret makes the slot pending again), `value` (config
  fills, plaintext), `filled_at`.
- `oauth_tokens` — `(app_id, alias)` PK, `ciphertext` BLOB, `nonce` BLOB,
  `updated_at`.

Declarations live app-side (`_integration_uses`, §5) and follow the app's data
lifecycle. Provider manifests live on disk in the integrations tree — the tree is the
source of truth; nothing manifest-shaped is copied into SQLite. Breaker and
rate-bucket state is in-memory only (a restart forgives).

**Connection status** (derived, never stored): `needs setup` (a required slot
unfilled, or OAuth not yet connected) → `connected` → `needs reauth` (OAuth refresh
failed) / `unhealthy` (latest call hit 401/403; sticky until the next success or
refill). Provider-level: `breaker open` while the breaker is open.

## 9. Guardrails

- **Rate limiting** — a token bucket **per provider**, shared by all its connections
  (the provider sees one client, so apps share the budget). Manifest `limits.rate`
  overrides the `integrations.default_rate` setting. A caller briefly waits for a
  token (bounded by its request timeout); beyond that, `rate_limited`.
- **429 respect** — a provider 429 with `Retry-After` pauses the bucket accordingly;
  callers in that window get `rate_limited` without touching the provider.
- **Circuit breaker, split by failure kind** — consecutive network errors / 5xx
  (threshold: `integrations.breaker_failure_threshold`) open a **per-provider**
  breaker for `integrations.breaker_cooldown_ms`, then a single half-open probe.
  4xx never trips it. 401/403 instead mark that one **connection** `unhealthy` — one
  app's revoked key must not block another app's working one. Breaker transitions
  emit `integration-health` events.
- **Timeouts** — `integrations.default_timeout_ms`, overridable per provider
  (manifest) and per request (descriptor), all under a hard platform cap.
- **Response size cap** — `integrations.max_response_bytes`, enforced while
  buffering; exceeding aborts with `too_large`.
- **Concurrency cap** — a small per-provider parallelism limit
  (manifest `limits.concurrency`, default from settings) so a burst of tasks cannot
  stampede a provider.
- **Deliberately absent: request-level retries.** Tasks own retries at the run
  level; two retry layers multiply calls. A failed gateway call surfaces its typed
  error and lets the task's retry/backoff policy decide.

## 10. Observability

**Traffic records ride the log-store** — no new store, no new UI. One record per
gateway request:

- `app` = the calling app id; `source` = `integration:<provider-id>` — so the two
  person-facing filters fall out of existing log-store querying: provider-wide
  (`source=integration:openweathermap`) and provider×app (add the app filter).
- Level by outcome: 2xx/3xx `info`, 4xx `warn`, 5xx / network / timeout /
  breaker / size `error`.
- Message: `GET /data/2.5/forecast → 200 (312 ms)`.
- Structured fields: provider, alias, method, path, status, outcome, `duration_ms`,
  request/response byte counts.
- **Bodies are not captured by default** (privacy + volume). The
  `integrations.capture_bodies` setting opts in, truncated to a small cap per side.
- **Redaction is unconditional:** the auth recipe's injection points double as the
  redaction map — injected headers/params render as `•••` in any captured data, and
  `Authorization` / `Cookie` / `Set-Cookie` are always stripped. Credential values
  never appear in logs, events, route responses, or the dashboard.

**Events** (the bus, durable + SSE):

- `integration-change` — change feed: provider added/removed/edited
  (platform-scoped), connection declared/filled/unfilled (app-scoped). Names only.
- `integration-health` — breaker opened/closed (platform-scoped, payload names the
  provider), connection `needs_reauth` / `unhealthy` transitions (app-scoped).
  Apps can `watch` and react; the dashboard renders live.

## 11. Settings — Services → Integrations

A new `PLATFORM_SETTINGS` section "Integrations" (global scope; per-provider tuning
belongs in manifests, not settings):

- `integrations.default_timeout_ms` (default 10 000; hard cap 60 000)
- `integrations.default_rate` (default `60/min`)
- `integrations.default_concurrency` (default 4)
- `integrations.max_response_bytes` (default 10 MB)
- `integrations.capture_bodies` (default off)
- `integrations.breaker_failure_threshold` (default 5)
- `integrations.breaker_cooldown_ms` (default 30 000)

## 12. Dashboard UX

- **Services menu:** an **Integrations** entry in `nav.ts` `SERVICES` (lucide `Plug`;
  registered in `SERVICE_ICONS`).
- **`/integrations`** — provider cards: favicon, name, external-link icon to the
  website (new-tab affordance), a usage line with an icon (`AppWindow` + "3 apps";
  icon-map registered). Providers with manifest errors badge the error. Empty state
  points the person at their agent ("ask your agent to add a provider — it knows
  how").
- **`/integrations/$providerId`** — header card: favicon, title, external link
  (new-tab icon), **Logs** (pre-filtered `source=integration:<provider>`), and
  **Settings** (redirect icon → Settings → Services → Integrations). Below, the
  connections list: one row per app×alias with its slot fills — secret slots reuse
  the `AppSecretsCard` linking UI (link existing / create-new-secret inline), config
  slots are plain inputs — a status badge (`needs setup` / `connected` /
  `needs reauth` / `unhealthy`), a **Connect / Reconnect** button for OAuth
  providers, and a per-row Logs link pre-filtered to provider×app.
- **App cards** on the dashboard home reuse the `PendingSecretsBadge` pattern: a
  declared connection with unfilled slots (or pending OAuth) badges the app.
- Favicons served by the runtime from the provider folder
  (`GET /api/integrations/:providerId/favicon`).
- Live via `integration-change` / `integration-health`.

## 13. MCP and skill

**MCP** — one read-only tool, `lodekit_integrations`: providers (id, name, website,
auth kind, slots, limits, manifest errors, usage counts) and connections (app, alias,
provider, per-slot fill status, connection status). Wiring and status only — never a
credential, never a token. This is what lets an agent answer "do we already have a
provider for this?" without touching the filesystem.

**Skill** — a new `## Integrations` section:

- The decision flow: **check existing providers first** (`lodekit_integrations`);
  reuse by declaring a connection; only author a new manifest when none fits.
- Manifest authoring: the schema, the auth recipes, adding a favicon to the provider
  folder, HTTPS-only for public hosts.
- The declaration contract (`defineIntegrations`) and the server-only call surface
  (from server functions and tasks; never from browser code).
- **The polling recipe:** a scheduled task calls the connection, writes domain
  records to the app's Database, emits an event. No integration-side polling
  machinery exists — Tasks is the scheduler, the Database is the record, Events is
  the announcement.
- The OAuth handoff: the agent never handles tokens — direct the person to the
  provider page's Connect button.
- The secrets rules verbatim: never ask for a credential in chat; direct the person
  to the dashboard.

## 14. Greenhouse definition-of-done

The roadmap's "Greenhouse integrations chapter", closing the deferred secret-store
DoD in the same stroke:

- An `openweathermap` provider manifest (+ favicon) checked into
  `root/integrations/openweathermap/` — the manager's first-run install copies the
  integrations tree alongside `apps/`.
- Greenhouse declares a `weather` connection; the person links a real API key
  through the provider's `api_key` secret slot (the deferred secret-store DoD,
  retired).
- A daily scheduled task fetches the forecast through the gateway and records
  high / low / rained / humidity / wind into a Greenhouse db table (the polling
  recipe, exercised for real).
- A small forecast widget renders current conditions and the recent daily log.
- `root/readme.md` gains the coverage checklist rows.

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
  — fields, levels, `source=integration:<id>`, and **credential absence asserted
  explicitly** (with `capture_bodies` on); `integration-change` /
  `integration-health` emission.
- **OAuth (fake authorize/token endpoints):** start → state/PKCE round-trip →
  exchange → encrypted tokens at rest (ciphertext asserted); transparent refresh on
  expiry; refresh failure → `needs_reauth` + event; degraded key provider → 503.
- **Integration (real worker, e2e pattern):** fixture app declares an alias;
  manifest registration on boot and wholesale re-registration on edit; fill via API
  → typed `integrations.<alias>.get` returns the stubbed body in a server function;
  browser-context call fails fast; unfilling → `IntegrationError("unconfigured")`.
- **MCP:** `lodekit_integrations` lists wiring, never values.
- **Greenhouse (manual smoke):** link a real OpenWeatherMap key, watch the daily
  task record a row, see the widget render, and find the request in Logs under both
  filters.

## 16. Deferred (→ roadmap)

- **Scraping service** — sourcing from parties with no API; already parked in the
  roadmap with rationale.
- **Non-HTTP transports** — FTP and friends; HTTP-only is precisely what makes v1's
  guardrails enforceable.
- **Streaming / SSE responses** — v1 buffers whole responses under the size cap.
- **Declarative polling** — provider-level "poll this endpoint every X, emit an
  event"; v1's recipe (task → gateway → db → event) covers the need app-side.
- **Request-level retries** — deliberately absent (§9); revisit only if task-level
  retries prove too coarse.
- **Inbound webhooks** — stays with the umbrella spec's server-code substrate item.
- **OAuth extras** — device flow, non-standard token endpoints, provider quirk
  handling (`arctic` as the known escape hatch), token revocation on disconnect.
- **Per-provider settings overrides** — manifests carry per-provider tuning for
  now; a settings surface for it would need a per-provider scope the settings
  grammar doesn't have.
- **Response caching** — dedupe/short-TTL caching at the gateway.
- **Quota budgets** — per-provider call/cost budgets with dashboard warnings.
- **MCP write tools** — filling slots or triggering OAuth from the agent; pairs
  with the MCP write-access guardrails (Security).
