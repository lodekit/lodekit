# Gateway egress hardening — SSRF (design)

**Date:** 2026-07-17
**Issue:** [#88](https://github.com/lodekit/lodekit/issues/88) — SEC-05 (High), SEC-10 (Medium), SEC-18 (Low)
**Amends:** `2026-07-10-gateways-design.md` (manifest format §4, executor §6/§9)

## Problem

"Egress by construction" (the app supplies only a relative path; the engine owns the
host) holds for literal `base_url` manifests but has three seams:

1. **SEC-05 — `from_slot` base URL.** A manifest may declare
   `base_url: { from_slot: "<config-slot>" }`, resolved at request time
   (`gatewayExecutor.ts`). The config value feeding it is stored with only a
   non-empty + 4096-byte check (`gatewaysStore.ts`), and at assembly any https host
   is accepted. Whoever can write the slot chooses the destination —
   `https://169.254.169.254/…`, `https://127.0.0.1:<port>`, an internal LAN IP —
   and the response body is returned to the caller. Full read-SSRF.
2. **SEC-10 — no internal-range denylist.** `isPrivateHost`
   (`gatewayManifests.ts`) is only ever used to *permit* http toward the person's
   own network, never to *deny* egress. Even a literal
   `base_url: "https://169.254.169.254"` loads clean. The OAuth token exchange
   (`gatewayOauth.ts`) is a second engine-side fetch with the same gap.
3. **SEC-18 — forwarded-identity header forgery.** An app can set arbitrary
   non-owned request headers, e.g. `X-Forwarded-For` toward a local device.

Tension to design around: local-network gateways (Home Assistant on RFC-1918 or
`.local`) are a first-class product pattern — a blanket private-range denial would
break the product's own use case. The design must deny by default and allow by
explicit declaration.

Out of scope, tracked separately: #89 (auth/origin gate on the slot-mutation
routes), #91 (http + mDNS MITM of local gateways).

## Address classes

Every IP is classified into exactly one class. IPv6-mapped IPv4 (`::ffff:a.b.c.d`)
is classified by the embedded v4 address.

| Class | Ranges |
|---|---|
| `loopback` | `127.0.0.0/8`, `::1` |
| `private` | `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7` (ULA) |
| `link-local` | `169.254.0.0/16`, `fe80::/10` |
| `special` | `0.0.0.0`, `::`, multicast (`224.0.0.0/4`, `ff00::/8`), broadcast (`255.255.255.255`) |
| `public` | everything else |

## Egress policy

Evaluated per request against **every** address `dns.lookup {all: true}` returns
for the target hostname. An IP-literal hostname classifies directly — no lookup,
no network.

- `special` → always denied. Never a legitimate gateway target.
- `loopback` / `private` / `link-local` → denied **unless** the manifest sets
  `"local_network": true`. With the flag all three are allowed: a person-authored
  local gateway is an explicit opt-in, and real LAN devices do live on
  self-assigned `169.254.*`.
- `public` → allowed.
- **Any** denied address in a multi-answer DNS response denies the whole request
  (mixed-answer rebinding defense).
- Scheme rule unchanged in spirit: https everywhere; http only toward private
  hosts — which now also requires `local_network` (an http base URL only makes
  sense on a local gateway).

### Known accepted limitation (TOCTOU)

Pre-flight resolution leaves a race against a deliberate DNS-rebinding attacker:
the answer can flip between our check and undici's own lookup inside `fetch`.
Chosen deliberately for v1 — no new dependency, no per-request dispatcher.
Connection-time enforcement (an undici `Agent` whose `connect.lookup` validates
the address the socket actually dials) is the future tightening; filed as a
defer-bead. Pre-flight also adds a second DNS resolution per request; getaddrinfo
caching absorbs this on macOS, and no engine-side cache is added in v1.

## Manifest schema changes

Two additions to the manifest format (gateways spec §4):

- **`local_network`** (top-level, `boolean`, optional, default `false`) — declares
  the gateway targets the person's own network; exempts it from the
  private-range denial and permits http per the existing `isPrivateHost` rule.
- **`allowed_hosts`** (inside the `from_slot` object, `string[]`, optional) —
  host pins for a dynamic base URL:

  ```json
  "base_url": { "from_slot": "url", "allowed_hosts": ["home.example.com", "*.ui.nabu.casa"] }
  ```

  An entry is an exact hostname (case-insensitive) or a `*.suffix` wildcard
  matching subdomains only (list the bare host too if wanted). When present, the
  hostname of the URL read from the slot must match an entry — checked before
  DNS resolution. Scoped inside `from_slot` because it pins exactly the thing that is
  dynamic; a literal base_url's host is already pinned by being literal.

**Load-time validation** (zod `superRefine`, sync — no DNS): a *literal*
`base_url`, `token_url`, or `authorization_url` whose hostname is a
private/loopback/link-local IP-literal or a `localhost`/`.localhost`/`.local`
name requires `local_network: true`; the error message tells the author to add
the flag. Literal DNS names that *resolve* private are caught at request time by
the same runtime policy. Existing checked-in manifests (`root/gateways/*`) are
public-host literals — unaffected.

## Module design

**New module `packages/engine/src/gatewayEgress.ts`** — the single home for
network egress policy. Exports:

- `classifyAddress(ip: string): AddressClass` — pure, no I/O; all v4/v6/mapped
  parsing lives here.
- `checkEgress(manifest, url, opts?): Promise<void>` — hostname pin check →
  resolve (or classify the literal) → policy verdict; throws typed on denial.
  `opts.lookup` injects the resolver (test seam — tests stub DNS; IP-literal
  paths need no network at all).

`isPrivateHost` stays in `gatewayManifests.ts` with its existing permit-http
meaning. The permit-http list and the deny-egress policy are different jobs;
conflating them is what the audit flagged. Dependency direction:
`gatewayManifests` ← `gatewayEgress` ← executor / oauth / routes. No cycles.

## Enforcement points

1. **Request path** — `assembleUrl` stays sync and URL-shaped;
   `executeGatewayRequest` awaits `checkEgress` immediately after assembly,
   before `injectAuth` — a denied request never resolves credentials.
2. **OAuth token exchange** — `gatewayOauth.ts` calls
   `checkEgress(manifest, token_url)` before its fetch. Same policy, same flag
   (a local IdP is legitimate under `local_network`).
3. **Set-time validation** — `PUT /:alias/slots/:slot/value`
   (`services/gateways.ts`): when the slot is the manifest's
   `base_url.from_slot`, validate the value as a URL — parse, scheme rule, pin
   match, resolve + classify — and reject the write. Best-effort UX layer; the
   request path stays authoritative (manifests and DNS both change after
   set-time).
4. **Manifest load** — the literal-IP/local-name checks above.

## Error taxonomy

- New `GatewayFailReason` **`"egress_denied"`** → HTTP **409** (the
  fix-your-configuration family, alongside `unconfigured`). Runtime denial
  messages name the address *class*, never the resolved IP of an arbitrary probe
  (no oracle): e.g. *"gateway base URL resolves to a link-local address — set
  local_network in the manifest if this gateway targets your own network"*.
- Pre-flight DNS resolution failure → existing `"network"` reason.
- Set-time rejection → plain `GatewaysError` → 400; the message may be specific
  (the person typed the value; nothing to hide).
- Denials produce a log record with `outcome: "egress_denied"` via the existing
  `record` path.

## Header hardening (SEC-18)

Extend the executor's silent-drop list (`host`, `cookie`) with the
forwarded-identity class: `forwarded`, any `x-forwarded-*` (prefix match),
`x-real-ip`, `true-client-ip`. Silent drop matches the established
never-caller-suppliable pattern; `authorization`/`proxy-authorization` stay loud
rejects (credential smuggling, not identity spoofing).

## Testing

Trust-boundary work — the matrix is explicit (never-simplify floor):

- **Unit (`gatewayEgress.test.ts`):** `classifyAddress` across all classes and
  encodings — v4 dotted, `::1`, ULA, `fe80::`, `::ffff:127.0.0.1`, `0.0.0.0`,
  multicast; pin matching (exact, `*.suffix`, non-match, case-insensitivity);
  the policy matrix (each class × flag on/off) with a stubbed lookup; a mixed
  public+private DNS answer → denied.
- **Executor:** from_slot value at `127.0.0.1` → `egress_denied` without the
  flag, succeeds with it (local test server); literal-private manifest without
  the flag → invalid at load; pinned from_slot with an off-pin value → denied;
  forwarded-class headers dropped (test server asserts absence).
- **Route:** `PUT …/value` with a denied URL → 400 with message; a good value
  still writes.
- **OAuth:** token exchange toward a denied target → typed failure.

## Docs, changelog, DoD

- This spec documents the manifest-format deltas; the docs-site gateway
  authoring page (if present) gains `local_network` and `allowed_hosts`.
- `docs/changelog.md` — entry under `## New` (new manifest fields, clearer
  denial errors).
- Greenhouse DoD: the checked-in manifests must load and function unchanged;
  assess adding a `local_network` example manifest to `root/README.md`'s
  coverage checklist during implementation.

## Deferrals

- Connection-time egress enforcement (undici `Agent` custom lookup) — closes the
  TOCTOU window. Defer-bead at implementation time.
