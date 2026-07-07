# Secret-store (v1) — design

**Date:** 2026-07-07
**Status:** Approved
**Fits:** the umbrella spec's service-catalog row "secret-store — Future"
(`docs/specs/2026-07-02-product-overview-design.md` §2), designed "with the lens of
powering integrations" per that spec's sequencing note (§ server-code substrate): server
functions are the read door — values never reach browser code. Closes the roadmap
Security item "Real secrets storage". Joins the catalog beside settings
(`2026-07-07-settings-design.md`), whose declaration pattern (`src/settings.ts`) and
dashboard patterns it deliberately mirrors. The three-store boundary fixed by the
settings slice (settings = person's knobs, store = app memory, secrets = credentials)
gains its third leg here.

## 1. Purpose and v1 scope

Secret-store is the service that holds the person's **credentials** — API keys, auth
tokens — encrypted at rest, and gives apps **rails** to use them without ever seeing
them outside server-side code: apps declare *slots*, the person *links* secrets to
slots in the dashboard, server functions read the linked value through the SDK.

**In v1:** a platform-level secret catalog (create/replace/delete, values write-only);
AES-256-GCM encryption at rest with the master key in the macOS Keychain; app slot
declaration via `src/secrets.ts` (typed, worker-boot manifest registration); linking
(the grant) in the dashboard with pending-slot nudges; a server-only value-read door
enforced by per-boot worker tokens; `secrets-change` on the events bus; a read-only MCP
inspection tool; skill rules that keep values away from the agent.

**Not in v1** (deferred, §12): the integrations layer itself, Greenhouse showcase
coverage (deferred in tandem with integrations — a deliberate definition-of-done
exception, see §11), master-key rotation, non-darwin keychains, secret expiry, an
audit log of reads, MCP write/link tools.

## 2. Threat model and decisions

The posture, decided up front:

- **Backups never contain plaintext.** The data tree (`~/Documents/Lodekit`, i.e.
  iCloud/Time Machine territory) holds only ciphertext; the key lives in the Keychain,
  outside the data tree.
- **Browser code never sees values.** Value reads require a worker token that only
  server-side code possesses — the "server-only" rule is enforced, not conventional.
  (A down payment on the roadmap's "local door hardening".)
- **The agent never sees values.** MCP lists names and wiring only — there is no
  value-read tool. The dashboard is write-only for values (masked input, never
  echoed back). The skill teaches Claude to never ask for a key in chat.
- **Other local processes running as the person stay trusted** — consistent with the
  platform's local-trust posture. Any local process could read the Keychain item; the
  Keychain buys backup-safety and at-rest encryption, not local-process isolation.
- **Rejected alternatives:** per-secret Keychain items (ACL prompts tied to code
  identity — the ad-hoc-signed app and the dev `tsx` runtime would re-prompt after
  every rebuild; nothing transfers to a future Linux story); key file beside the data
  (a Time Machine backup would hold key + ciphertext together); passphrase-derived key
  (unlock UX is wrong for an always-on personal runtime).

Model decisions:

- **Secrets belong to the person, not to apps.** One catalog, platform-wide. A key is
  entered once and linked to every app that needs it.
- **Indirection over a shared namespace.** Apps declare local slot names; the person
  links a catalog secret to each slot. No global name collisions, no implicit-grant
  magic, two accounts for the same provider just work, and the person names their
  secrets their way — decoupled from whatever name the agent picked in code.
- **The link is the grant.** Readable = slot linked AND secret has a value. Unlink (or
  delete the secret) and reads stop, effective on next read.
- **The same rail serves integrations later.** An integration instance declares secret
  slots and the person links secrets to them — nothing secret-store-specific to redo.

## 3. Terminology (closes with this slice)

- **Secret** — a person-owned credential in the platform catalog: label → **slug**
  (slug identity, the file-store precedent), optional description, encrypted value.
  _Avoid_: credential, key entry, token (those are what the value *is*, not the object).
- **Slot** — an app-declared named reference to a secret, declared in
  `src/secrets.ts` with label + description. Slot names are lower `snake_case` (the
  settings-key grammar) — they are SDK keys, not env vars.
- **Link** — the person's act (and the stored fact) of binding a secret to a slot:
  `(appId, slot) → slug`. The link **is** the grant; there is no separate grant
  concept. _Avoid_: grant, binding, mapping.
- **Pending** — a declared slot with no link (or whose linked secret was deleted).
- **Master key** — the runtime-generated 256-bit key encrypting all values, stored in
  the macOS Keychain.
- Catalog naming: **secret-store**; catalog-name → SDK-handle mapping
  `secret-store → secrets` (already fixed in `context.md`).
- `context.md` is amended: the Secrets line in the Store-vs-Settings boundary gains
  slot/link vocabulary; the service-catalog secret-store entry loses "future".

## 4. Storage and crypto

`data/_platform/secrets.sqlite` (beside `settings.sqlite` — the person's data, inside
the backup boundary, safe because values are ciphertext):

- `secrets` — `slug` PK, `label`, `description`, `ciphertext` BLOB, `nonce` BLOB,
  `created_at`, `updated_at`. Only the value is encrypted; metadata stays plaintext so
  the dashboard and MCP render without touching the key.
- `links` — `(app_id, slot)` PK, `slug` FK, `linked_at`. Deleting a secret cascades
  its links away — the slots fall back to pending.
- Slot declarations live in each app's own `data/<appId>/db.sqlite` as a
  `_lodekit_secret_slots` table (slot PK, label, description, field-error text,
  registered-at) — the settings `_lodekit_setting_defs` pattern; declarations follow
  the app's data lifecycle.

**Crypto.** AES-256-GCM via Node's built-in `crypto`: per-value random 12-byte nonce,
auth tag stored with the ciphertext; decrypt verifies the tag (tamper = typed error,
never a garbage value). Values are strings, capped at 4 kb. Replacing a value
re-encrypts with a fresh nonce.

**Master key.** Generated lazily on first secret write: 32 random bytes. Stored as a
Keychain generic-password item (service `Lodekit`, account `secret-store-master-key`)
via the `security` CLI — no native module (the runtime stays buildless), and because
the ACL attaches to the `security` tool rather than the runtime binary, the dev-`tsx`
vs packaged-app code-identity difference never causes prompts. Read once per process
on first secrets use, then held in memory.

**Key provider.** A two-implementation interface: `keychain` (darwin default) and
`file` (0600 key file under the State dir — non-darwin fallback and the test
provider; tests never touch the real Keychain). Config-selected, defaulting by
platform.

**Degraded mode.** If the key cannot be obtained (Keychain locked, `security`
failure), the secrets service answers 503 "secret store unavailable" — the runtime
never crashes and **never falls back to plaintext storage**. Losing the Keychain item
is recoverable by re-entering values (they exist at the source); a `DELETE` +
re-create flow is the recovery path, no special tooling in v1.

## 5. Declaration contract — `src/secrets.ts`

```ts
// apps/<id>/src/secrets.ts
import { defineSecrets, secret } from "@lodekit/sdk";

export default defineSecrets({
  weather_api_key: secret({
    label: "Weather API key",
    description: "Used by the watering forecast to fetch local weather.",
  }),
});
```

- `defineSecrets` is a thin SDK wrapper (the `defineSettings` twin): validates shape
  locally, returns the schema tagged; its type parameter drives SDK inference —
  `secrets.get("weather_api_key")` is typed, keys autocomplete.
- `label` and `description` are required — the dashboard must be able to tell the
  person what they're linking and why. A slot missing either fails that slot's
  registration with a visible per-slot error in the dashboard; other slots still
  register (the settings per-field-error pattern).
- Slot names: lower `snake_case`, no dots.
- The Start build includes `src/secrets.ts` as an additional server-bundle entry
  (exactly the settings/tasks mechanism). On worker boot the worker posts a **secrets
  manifest**; the runtime upserts durable slot declarations. Registration is wholesale
  per successful boot: slots absent from the new manifest are removed and their links
  pruned. Declarations survive a down or broken worker.
- Apps without `src/secrets.ts` have no slots — their dashboard Secrets panel is empty.

## 6. The end-to-end flow

1. The person obtains a token from a provider (OpenWeather, Anthropic, …).
2. Dashboard → **Secrets** → New secret: label ("OpenWeather key") → auto-slug
   (`openweather-key`), optional description, value. Saved = encrypted. From then on
   the value is write-only: replace or delete, never displayed.
3. The app declares slots in `src/secrets.ts`; worker boot registers them.
4. The app's dashboard page shows its slots; unlinked ones are **pending**, with a
   link-existing or create-new-secret-inline affordance. Linking writes the `links`
   row. The app card badges pending slots so the nudge is visible without hunting.
5. Server code calls `secrets.get("weather_api_key")` (worker token attached by the
   SDK) → runtime resolves slot → link → secret, decrypts, returns the value.
6. Unlink or delete the secret → the slot is pending again; reads throw the typed
   not-available error and the app renders its "configure me" state.

The future integrations layer reuses steps 3–6 verbatim with an integration instance
in place of the app.

## 7. Server-only read door — worker tokens

At each app-worker spawn the runtime generates a random per-app token and injects it
via the worker env. The SDK's server-side secrets client sends it as an
`x-lodekit-worker-token` header; the value-read route requires a valid token **matching
the `:appId` in the path**. Tokens are per-boot, in-memory only, never persisted, never
logged. Browser code has no token; the SDK's client build fails fast with "secrets are
server-only; call from a server function" before any request is made. A request with a
missing/wrong token is 401 regardless of link state (no oracle for probing).

## 8. Routes, SDK, events

`packages/runtime/src/services/secret-store.ts`, the catalog pattern: chained Hono
router, `zValidator`, `export type SecretRoutes` for the SDK, events emission on
mutation.

**Platform (dashboard-facing; no route ever returns a value):**

- `GET /api/secrets` — catalog: slug, label, description, timestamps, per-secret link
  summary (which app/slot pairs).
- `POST /api/secrets` `{ label, description?, value }` → `{ slug, … }` (slug derived
  from label, uniquified).
- `PUT /api/secrets/:slug` `{ label?, description?, value? }` — replace metadata
  and/or value.
- `DELETE /api/secrets/:slug` — cascades links to pending.

**Per app, under `/api/apps/:appId/secrets`:**

- `GET /` — declared slots + per-slot status: `linked` (with the secret's slug/label)
  | `pending`, plus any slot registration errors.
- `PUT /:slot/link` `{ slug }` / `DELETE /:slot/link` — link/unlink. Unknown slot or
  slug is 404.
- `GET /:slot/value` — **the only value-bearing route**; worker token required (§7).
  401 no/wrong token; 404 unknown slot; typed error bodies otherwise — 409 `unlinked`,
  503 `unavailable` (degraded key, §4) — so the SDK can throw distinguishable errors.

Validation at the trust boundary throughout: slug/slot grammar, 4 kb value cap,
unknown keys 404 (the settings precedent).

**SDK** (server-only; typed via `hc<SecretRoutes>` + `defineSecrets` inference):

```ts
import { secrets } from "@lodekit/sdk";

const key = await secrets.get("weather_api_key"); // string; throws SecretUnavailableError
```

`SecretUnavailableError` carries `reason: "unlinked" | "unavailable"` — enough for a
decent "configure me in the dashboard" state, nothing more. No `secrets.set`, no list:
apps read their own linked slots, nothing else.

**Events.** Mutations emit **`secrets-change`** through the events service
(`emitEvent`, the settings-change mechanism — durable event log + SSE fan-out, the
shared change-feed TTL): platform-scoped `{ slug }` for catalog changes, app-scoped
`{ slot }` for link changes. Names only — values never enter the event log, SSE, or
any log record.

## 9. Dashboard UX

- A **Secrets** section in the dashboard nav (reusing the settings page's section and
  control patterns): the person's catalog — label, slug, description, "linked to N
  slots" (expandable to the app/slot list), replace-value and delete affordances. The
  value field is a masked, write-only input: never pre-filled, never echoed.
  Delete warns when links exist ("N slots become pending").
- **App page — Secrets panel:** the app's declared slots with label + description;
  each shows `linked` (which secret, with unlink) or `pending` (a link picker over the
  catalog + a create-new-secret inline form). Slot registration errors render inline
  (the settings per-field-error pattern).
- **Pending badge** on the app card (grid) so a newly built app that needs a key is
  visible immediately.
- Live via `secrets-change` — concurrent edits reflect without reload.

## 10. MCP and skill

**MCP** — one read-only tool, `lodekit_secrets_list`: the catalog (slugs, labels,
descriptions, link summaries) and per-app slots with link status. Existence and wiring
only — **no value-read tool exists**, and the worker token never reaches the MCP
server. This lets Claude scaffold `src/secrets.ts`, see that a slot is pending, and
tell the person exactly what to link — without ever holding a credential.

**Skill** — a new `## Secrets` section: the `defineSecrets` example, server-only
`secrets.get` + `SecretUnavailableError` handling (render a "configure me" state), and
the hard rules: **never ask the person to paste a secret value into chat — direct them
to the dashboard's Secrets page**; **never log, echo, or store a secret value in app
code** (not in kv, not in files, not in events); secrets are credentials — never
Settings, never the Store (the three-store boundary verbatim).

## 11. Testing

- **Unit (pure):** AES-GCM round-trip + tamper detection (bad tag → typed error),
  nonce uniqueness across writes, slug derivation/uniquification, slot-name grammar,
  `defineSecrets` validation (missing label/description rejected), file key provider
  (creation, 0600, reuse).
- **Service (Hono router, temp root, file key provider):** catalog CRUD round-trips;
  values absent from every GET/list payload (asserted explicitly); link/unlink; 404s;
  value-read 401 without/with-wrong token, 200 with the right token, 409 `unlinked`;
  delete-cascade → pending; degraded-key 503 (provider forced to fail); 4 kb cap 400;
  `secrets-change` emission (payload carries names only).
- **Integration (real worker, e2e pattern):** fixture app declares a slot; manifest
  registration on boot and after `src/secrets.ts` edit (wholesale re-registration
  prunes removed slots and their links); link via API → typed `secrets.get` returns
  the value in a server function; browser-context read fails fast; unlink →
  `SecretUnavailableError("unlinked")`.
- **Keychain provider:** covered by one manual darwin smoke (create, read back,
  survive a runtime restart); CI/tests use the file provider throughout.

**Definition-of-done exception, decided:** Greenhouse showcase coverage is deferred —
the secrets chapter lands in tandem with the future integrations layer (weather-aware
watering, the roadmap's "Greenhouse integrations chapter"), where a linked key powers
a real call instead of a synthetic demo. The e2e fixture app covers the rail
end-to-end until then. `root/readme.md`'s pending list and the roadmap both record it.

## 12. Deferred (→ roadmap)

- **Greenhouse secrets chapter** — in tandem with the integrations layer (§11).
- **Integrations layer** — instances declaring slots, provider templates; the umbrella
  spec's lens, built on this rail.
- **Master-key rotation** — re-encrypt-all under a new key; v1 recovery is
  delete + re-enter.
- **Non-darwin key providers** — libsecret / DPAPI behind the existing provider
  interface (the file provider is the interim fallback).
- **Secret expiry / rotation reminders** — per-secret max-age with a dashboard nudge.
- **Audit log of reads** — which app read which slot when (log-store records, names
  only).
- **MCP write/link tools** — pairs with the MCP write-access guardrails (Security).
- **Import** — from env files or password managers.
- **Local door hardening, the rest** — worker tokens cover only the value-read route;
  extending token auth across the scoped API stays with the roadmap Security item.
