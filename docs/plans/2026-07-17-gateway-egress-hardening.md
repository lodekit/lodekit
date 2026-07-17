# Gateway Egress Hardening (SSRF) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** Close the gateway SSRF seams (issue #88) — validate `from_slot` base URLs, deny internal-range egress by default with an explicit local-network opt-in, and drop forged forwarded-identity headers.

**Architecture:** A new deep module `gatewayEgress.ts` owns all network egress policy: pure address classification plus a `checkEgress(manifest, url, opts?)` that resolves the target (or classifies an IP-literal) and throws typed on denial. The request executor, the OAuth token exchange, and the config-value set-time route all call it. The manifest schema gains `local_network` (top-level) and `allowed_hosts` (inside `from_slot`), with sync literal-host checks at load time. `isPrivateHost`'s existing *permit-http* meaning is untouched — the new module is the *deny-egress* home.

**Tech Stack:** TypeScript (buildless, `tsx`), Zod (manifest schema), Node `dns/promises` + `node:net`, Vitest, Hono (routes), better-sqlite3.

## Global Constraints

- **Buildless engine** — `tsx`, no build step; `.js` import specifiers for local `.ts` files (NodeNext resolution).
- **Zero new runtime dependencies** — pre-flight resolve uses stdlib `dns/promises` + `node:net`; connection-time (undici Agent) enforcement is explicitly deferred, not built.
- **Surgical changes** — every changed line traces to issue #88; no adjacent refactors.
- **Trust-boundary discipline (ponytail never-simplify floor)** — every policy branch carries a runnable check; deny-by-default; no oracle in error text (name the address *class*, never the resolved IP of an arbitrary probe).
- **Canonical terms** — "engine", "gateway", "manifest", "connection", "slot" per `CONTEXT.md`.
- **DoD** — the checked-in `root/gateways/*` manifests must load and function unchanged (they are public-host literals).

---

## File Structure

- **Create** `packages/engine/src/gatewayEgress.ts` — address classification + `checkEgress` + host-pin matching. The single egress-policy home.
- **Create** `packages/engine/tests/gateway-egress.test.ts` — unit tests for the module (pure classify + policy matrix with stubbed lookup + a local http server for the resolve path).
- **Modify** `packages/engine/src/gatewayManifests.ts` — add `local_network` + `allowed_hosts` to the schema; sync literal-host validation in `superRefine`.
- **Modify** `packages/engine/src/gatewayExecutor.ts` — new `egress_denied` reason (+ `REASON_STATUS`); `await checkEgress` after `assembleUrl`, before `injectAuth`; move the base-URL scheme gate into `checkEgress`; extend the header drop-list (SEC-18).
- **Modify** `packages/engine/src/gatewayOauth.ts` — `await checkEgress(manifest, token_url)` before each `tokenPost` fetch.
- **Modify** `packages/engine/src/services/gateways.ts` — set-time validation on `PUT …/slots/:slot/value` when the slot feeds `base_url.from_slot`.
- **Modify** test fixtures adding `local_network: true` to `http://127.0.0.1` manifests: `gateway-executor.test.ts`, `gateway-oauth.test.ts`, `gateways-api.test.ts`, `gateways-e2e.test.ts`, `gateway-manifests.test.ts`.
- **Modify** `web/docs/src/content/docs/services/gateways.mdx` — document `from_slot`, `local_network`, `allowed_hosts`.
- **Modify** `docs/changelog.md` — one `## New` entry.

---

### Task 1: Egress policy module (`gatewayEgress.ts`)

**Files:**
- Create: `packages/engine/src/gatewayEgress.ts`
- Test: `packages/engine/tests/gateway-egress.test.ts`

**Interfaces:**
- Consumes: `GatewayManifest` type from `./gatewayManifests.js` (for the `local_network` field — added in Task 2; Task 1 only reads `manifest.local_network?: boolean`, which is structurally present even before the schema declares it, so Task 1 compiles standalone against the current type by treating it as optional).
- Produces:
  - `type AddressClass = "loopback" | "private" | "link-local" | "special" | "public"`
  - `function classifyAddress(ip: string): AddressClass` — pure, no I/O.
  - `class EgressDeniedError extends Error` — carries `addressClass: AddressClass | "scheme" | "pin"` and a class-only message (no resolved IP).
  - `type LookupFn = (hostname: string) => Promise<string[]>` — returns the IP strings for a hostname.
  - `function hostAllowedByPins(hostname: string, pins: string[]): boolean` — exact (case-insensitive) or `*.suffix` (subdomain-only) match.
  - `async function checkEgress(manifest: { local_network?: boolean }, url: URL, opts?: { pins?: string[]; lookup?: LookupFn }): Promise<void>` — throws `EgressDeniedError` on scheme/pin/policy violation; resolves void on allow.

**Acceptance Criteria:**
- `classifyAddress` classifies IPv4, IPv6, and IPv4-mapped-IPv6 into the correct class for every range in the spec table.
- `checkEgress` denies `special` always; denies `loopback`/`private`/`link-local` unless `local_network` is true; allows `public`.
- A multi-answer lookup with any denied address denies the whole request.
- `http` is allowed only for a private/loopback/link-local host *and* `local_network: true`; every other `http` and every non-http(s) scheme is denied.
- Pin mismatch is denied before any DNS resolution occurs.
- IP-literal targets are classified with no lookup call.

- [ ] **Step 1: Write the failing test for `classifyAddress`**

Create `packages/engine/tests/gateway-egress.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifyAddress, hostAllowedByPins, checkEgress, EgressDeniedError } from "../src/gatewayEgress.js";

describe("classifyAddress", () => {
  it("classifies IPv4 ranges", () => {
    expect(classifyAddress("127.0.0.1")).toBe("loopback");
    expect(classifyAddress("10.1.2.3")).toBe("private");
    expect(classifyAddress("172.16.0.1")).toBe("private");
    expect(classifyAddress("172.31.255.255")).toBe("private");
    expect(classifyAddress("172.32.0.1")).toBe("public");
    expect(classifyAddress("192.168.1.1")).toBe("private");
    expect(classifyAddress("169.254.13.37")).toBe("link-local");
    expect(classifyAddress("0.0.0.0")).toBe("special");
    expect(classifyAddress("255.255.255.255")).toBe("special");
    expect(classifyAddress("224.0.0.1")).toBe("special");
    expect(classifyAddress("8.8.8.8")).toBe("public");
    expect(classifyAddress("172.15.0.1")).toBe("public");
  });
  it("classifies IPv6 and mapped IPv4", () => {
    expect(classifyAddress("::1")).toBe("loopback");
    expect(classifyAddress("fc00::1")).toBe("private");
    expect(classifyAddress("fdff::1")).toBe("private");
    expect(classifyAddress("fe80::1")).toBe("link-local");
    expect(classifyAddress("::")).toBe("special");
    expect(classifyAddress("ff02::1")).toBe("special");
    expect(classifyAddress("::ffff:127.0.0.1")).toBe("loopback");
    expect(classifyAddress("::ffff:8.8.8.8")).toBe("public");
    expect(classifyAddress("2001:4860:4860::8888")).toBe("public");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @lodekit/engine exec vitest run tests/gateway-egress.test.ts`
Expected: FAIL — `classifyAddress` is not exported / module missing.

- [ ] **Step 3: Implement `gatewayEgress.ts` (classification + pins + checkEgress)**

Create `packages/engine/src/gatewayEgress.ts`:

```ts
// Gateway egress policy (spec 2026-07-17-gateway-egress-hardening §"Egress
// policy"): the single home for "may the engine dial this?" — deny-by-default
// for loopback/private/link-local/special, allow with an explicit
// local_network manifest opt-in. Distinct from isPrivateHost (gatewayManifests),
// which only *permits* http toward the person's network. Pre-flight resolution
// leaves a deliberate TOCTOU window (connection-time enforcement is deferred).
import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";

export type AddressClass = "loopback" | "private" | "link-local" | "special" | "public";

export class EgressDeniedError extends Error {
  constructor(
    public readonly addressClass: AddressClass | "scheme" | "pin",
    message: string
  ) {
    super(message);
    this.name = "EgressDeniedError";
  }
}

export type LookupFn = (hostname: string) => Promise<string[]>;

const defaultLookup: LookupFn = async (hostname) => {
  const res = await dnsLookup(hostname, { all: true });
  return res.map((r) => r.address);
};

function classifyV4(ip: string): AddressClass {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return "special"; // unparseable — refuse rather than treat as public
  }
  const [a, b] = parts;
  if (a === 0) return "special";
  if (a === 127) return "loopback";
  if (a === 169 && b === 254) return "link-local";
  if (a === 10) return "private";
  if (a === 172 && b >= 16 && b <= 31) return "private";
  if (a === 192 && b === 168) return "private";
  if (a >= 224) return "special"; // multicast (224/4) + reserved/broadcast (240/4, 255.255.255.255)
  return "public";
}

export function classifyAddress(ip: string): AddressClass {
  const kind = isIP(ip);
  if (kind === 4) return classifyV4(ip);
  if (kind !== 6) return "special"; // not an IP at all — refuse
  const h = ip.toLowerCase();
  // IPv4-mapped (::ffff:a.b.c.d) — classify by the embedded v4 address.
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return classifyV4(mapped[1]);
  if (h === "::1") return "loopback";
  if (h === "::" ) return "special";
  if (h.startsWith("ff")) return "special"; // ff00::/8 multicast
  if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) {
    return "link-local"; // fe80::/10
  }
  if (h.startsWith("fc") || h.startsWith("fd")) return "private"; // fc00::/7 ULA
  return "public";
}

export function hostAllowedByPins(hostname: string, pins: string[]): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return pins.some((pin) => {
    const p = pin.toLowerCase();
    if (p.startsWith("*.")) return h.endsWith(p.slice(1)) && h.length > p.length - 1;
    return h === p;
  });
}

const LOCAL_CLASSES: ReadonlySet<AddressClass> = new Set(["loopback", "private", "link-local"]);

export async function checkEgress(
  manifest: { local_network?: boolean },
  url: URL,
  opts: { pins?: string[]; lookup?: LookupFn } = {}
): Promise<void> {
  const local = manifest.local_network === true;
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new EgressDeniedError("scheme", "gateway base URL must be http(s)");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (opts.pins && opts.pins.length > 0 && !hostAllowedByPins(hostname, opts.pins)) {
    throw new EgressDeniedError("pin", "gateway base URL host is not in the manifest's allowed_hosts");
  }
  // http is legitimate only toward the person's own network, opted-in.
  if (url.protocol === "http:" && !local) {
    throw new EgressDeniedError("scheme", "http gateway URLs are allowed only for local_network gateways");
  }
  const lookup = opts.lookup ?? defaultLookup;
  const literal = isIP(hostname) !== 0;
  const addresses = literal ? [hostname] : await lookup(hostname);
  if (addresses.length === 0) {
    throw new EgressDeniedError("special", "gateway host did not resolve to any address");
  }
  for (const addr of addresses) {
    const klass = classifyAddress(addr);
    if (klass === "special") {
      throw new EgressDeniedError("special", "gateway URL resolves to a reserved address");
    }
    if (LOCAL_CLASSES.has(klass) && !local) {
      throw new EgressDeniedError(
        klass,
        `gateway URL resolves to a ${klass} address — set "local_network": true in the manifest if this gateway targets your own network`
      );
    }
    if (url.protocol === "http:" && !LOCAL_CLASSES.has(klass)) {
      // A local_network gateway whose name resolves public over http — refuse.
      throw new EgressDeniedError("scheme", "http gateway URLs are allowed only toward local addresses");
    }
  }
}
```

- [ ] **Step 4: Run the classify test to verify it passes**

Run: `pnpm --filter @lodekit/engine exec vitest run tests/gateway-egress.test.ts`
Expected: PASS.

- [ ] **Step 5: Add pin + policy-matrix tests**

Append to `packages/engine/tests/gateway-egress.test.ts`:

```ts
describe("hostAllowedByPins", () => {
  it("matches exact and wildcard, case-insensitively", () => {
    expect(hostAllowedByPins("home.example.com", ["home.example.com"])).toBe(true);
    expect(hostAllowedByPins("HOME.example.com", ["home.example.com"])).toBe(true);
    expect(hostAllowedByPins("a.ui.nabu.casa", ["*.ui.nabu.casa"])).toBe(true);
    expect(hostAllowedByPins("ui.nabu.casa", ["*.ui.nabu.casa"])).toBe(false); // bare host not matched by wildcard
    expect(hostAllowedByPins("evil.com", ["home.example.com"])).toBe(false);
    expect(hostAllowedByPins("home.example.com.evil.com", ["home.example.com"])).toBe(false);
  });
});

describe("checkEgress policy", () => {
  const pub: LookupFn = async () => ["8.8.8.8"];
  const priv: LookupFn = async () => ["192.168.1.10"];
  const mixed: LookupFn = async () => ["8.8.8.8", "127.0.0.1"];

  it("allows a public https target", async () => {
    await expect(checkEgress({}, new URL("https://api.example.com"), { lookup: pub })).resolves.toBeUndefined();
  });
  it("denies a private target without local_network", async () => {
    await expect(checkEgress({}, new URL("https://ha.example"), { lookup: priv })).rejects.toBeInstanceOf(EgressDeniedError);
  });
  it("allows a private target with local_network", async () => {
    await expect(checkEgress({ local_network: true }, new URL("https://ha.example"), { lookup: priv })).resolves.toBeUndefined();
  });
  it("denies when any answer in a multi-answer response is private", async () => {
    await expect(checkEgress({}, new URL("https://rebind.example"), { lookup: mixed })).rejects.toBeInstanceOf(EgressDeniedError);
  });
  it("denies an off-pin host before resolving", async () => {
    let called = false;
    const lk: LookupFn = async () => { called = true; return ["8.8.8.8"]; };
    await expect(checkEgress({}, new URL("https://evil.com"), { pins: ["home.example.com"], lookup: lk }))
      .rejects.toBeInstanceOf(EgressDeniedError);
    expect(called).toBe(false);
  });
  it("classifies an IP-literal without a lookup", async () => {
    let called = false;
    const lk: LookupFn = async () => { called = true; return []; };
    await expect(checkEgress({}, new URL("https://169.254.169.254"), { lookup: lk })).rejects.toBeInstanceOf(EgressDeniedError);
    expect(called).toBe(false);
  });
  it("denies http toward a public host and allows http toward a local one with the flag", async () => {
    await expect(checkEgress({ local_network: true }, new URL("http://pub.example"), { lookup: pub })).rejects.toBeInstanceOf(EgressDeniedError);
    await expect(checkEgress({ local_network: true }, new URL("http://192.168.1.10"))).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 6: Run the full module test to verify it passes**

Run: `pnpm --filter @lodekit/engine exec vitest run tests/gateway-egress.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/gatewayEgress.ts packages/engine/tests/gateway-egress.test.ts
git commit -m "feat(engine): gateway egress policy module — address classification + checkEgress (#88)"
```

---

### Task 2: Manifest schema — `local_network` + `allowed_hosts` + load-time validation

**Files:**
- Modify: `packages/engine/src/gatewayManifests.ts:57-114` (schema + `superRefine`)
- Modify: `packages/engine/tests/gateway-manifests.test.ts`

**Interfaces:**
- Consumes: `classifyAddress` from `./gatewayEgress.js` (to reject literal private/loopback/link-local IPs at load without the flag).
- Produces: `GatewayManifest` type now includes `local_network?: boolean` and, when `base_url` is `{ from_slot }`, an optional `allowed_hosts?: string[]`.

**Acceptance Criteria:**
- A literal `base_url`/`token_url`/`authorization_url` whose host is a private/loopback/link-local IP-literal, or a `localhost`/`.localhost`/`.local` name, is invalid unless `local_network: true`.
- `local_network: true` makes those manifests load clean.
- `allowed_hosts` parses only inside the `from_slot` object; each entry is a non-empty string.
- Public-host literal manifests (the checked-in `root/gateways/*`) still load with no flag.

- [ ] **Step 1: Write the failing test**

Add to `packages/engine/tests/gateway-manifests.test.ts` (follow the file's existing `loadManifest`/parse helper — inspect the top of the file for the exact helper name; the pattern below uses `manifestSchema.safeParse` directly, which the file already imports):

```ts
import { manifestSchema } from "../src/gatewayManifests.js";

describe("egress schema (#88)", () => {
  const base = { name: "X", auth: { kind: "none" }, slots: {} } as const;
  it("rejects a literal private base_url without local_network", () => {
    const r = manifestSchema.safeParse({ ...base, base_url: "https://192.168.1.10" });
    expect(r.success).toBe(false);
  });
  it("accepts a literal private base_url with local_network", () => {
    const r = manifestSchema.safeParse({ ...base, base_url: "https://192.168.1.10", local_network: true });
    expect(r.success).toBe(true);
  });
  it("rejects a loopback IdP token_url without the flag", () => {
    const r = manifestSchema.safeParse({
      ...base,
      base_url: "https://api.example.com",
      auth: { kind: "oauth2", authorization_url: "https://127.0.0.1/a", token_url: "https://127.0.0.1/t", client_id_slot: "cid" },
      slots: { cid: { kind: "config", label: "cid" } },
    });
    expect(r.success).toBe(false);
  });
  it("parses allowed_hosts inside from_slot", () => {
    const r = manifestSchema.safeParse({
      ...base,
      base_url: { from_slot: "url", allowed_hosts: ["home.example.com", "*.ui.nabu.casa"] },
      slots: { url: { kind: "config", label: "url" } },
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @lodekit/engine exec vitest run tests/gateway-manifests.test.ts -t "egress schema"`
Expected: FAIL — private literal currently parses; `allowed_hosts` currently dropped/allowed loosely.

- [ ] **Step 3: Add the schema fields**

In `packages/engine/src/gatewayManifests.ts`, import the classifier and extend the schema. Change the `base_url` union and add `local_network`:

```ts
import { classifyAddress } from "./gatewayEgress.js";
```

Replace the `base_url` line (currently line 61) inside `manifestSchema`'s object:

```ts
    base_url: z.union([
      z.string().url(),
      z.object({
        from_slot: SLOT_NAME,
        allowed_hosts: z.array(z.string().min(1).max(253)).max(20).optional(),
      }),
    ]),
```

Add `local_network` to the same object (next to `slots`):

```ts
    local_network: z.boolean().optional(),
```

- [ ] **Step 4: Add the literal-host validation in `superRefine`**

In `gatewayManifests.ts`, inside the `superRefine` callback, replace the `httpOnly` helper's body so it *also* refuses literal-private hosts without the flag. Add a shared helper near the top of `superRefine` (after the `issue` definition):

```ts
    // A literal credential/base URL pointing at the person's own network is
    // only legitimate when the manifest declares local_network — same policy
    // the runtime enforces on resolved addresses (spec §"Egress policy").
    const requiresLocalFlag = (hostname: string): boolean => {
      const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
      if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
      const klass = classifyAddress(h); // "public" for a DNS name (not an IP) — caught at runtime instead
      return klass === "loopback" || klass === "private" || klass === "link-local";
    };
    const localOk = m.local_network === true;
```

Then extend `httpOnly` (used for `website`, `authorization_url`, `token_url`, literal `base_url`) — but note `website` must stay lenient (it is just a link). Add the flag check only to the credential/base fields. Replace the existing `httpOnly` definition:

```ts
    const httpOnly = (url: string, field: string, publicHttpOk: boolean) => {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") { issue(`${field} must be http(s)`); return; }
      if (u.protocol === "http:" && !publicHttpOk && !isPrivateHost(u.hostname)) {
        issue(`http ${field} is allowed only for localhost/private hosts`);
      }
      // Credential/base fields (publicHttpOk === false) that literally target the
      // person's network need the explicit opt-in.
      if (!publicHttpOk && !localOk && requiresLocalFlag(u.hostname)) {
        issue(`${field} targets a local address — set "local_network": true if this gateway is on your own network`);
      }
    };
```

`website` is called with `publicHttpOk: true`, so it is unaffected. `authorization_url`, `token_url`, and literal `base_url` are called with `false` — they now get the flag check.

- [ ] **Step 5: Run the schema tests to verify they pass**

Run: `pnpm --filter @lodekit/engine exec vitest run tests/gateway-manifests.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/gatewayManifests.ts packages/engine/tests/gateway-manifests.test.ts
git commit -m "feat(engine): gateway manifest local_network + allowed_hosts, literal-host load validation (#88)"
```

---

### Task 3: Executor wiring — `egress_denied`, `checkEgress`, header hardening (SEC-18)

**Files:**
- Modify: `packages/engine/src/gatewayExecutor.ts` (reason taxonomy ~20-34; `assembleUrl` 188-213; header loop 364-374; `executeGatewayRequest` around 375)
- Modify: `packages/engine/tests/gateway-executor.test.ts` (add `local_network: true` to `stubManifest`; new egress + header tests)

**Interfaces:**
- Consumes: `checkEgress`, `EgressDeniedError` from `./gatewayEgress.js`.
- Produces: `GatewayFailReason` gains `"egress_denied"`; `REASON_STATUS.egress_denied = 409`.

**Acceptance Criteria:**
- A `from_slot` value resolving to a denied class → `egress_denied` (HTTP 409), and `injectAuth` never runs for it.
- With `local_network: true`, the same local target succeeds.
- A pinned `from_slot` with an off-pin value → `egress_denied`.
- `x-forwarded-for`, `forwarded`, `x-real-ip`, `true-client-ip` request headers are dropped (never reach the upstream); `authorization` stays a loud reject.
- An `egress_denied` outcome is logged via the existing `record` path.

- [ ] **Step 1: Write failing tests**

First update `stubManifest` in `gateway-executor.test.ts` to mark the stub local (it targets `127.0.0.1`):

```ts
function stubManifest(auth: unknown, slots: Record<string, unknown>, basePath = "") {
  return {
    name: "Stub", base_url: `http://127.0.0.1:${stubPort}${basePath}`,
    auth, slots, local_network: true,
  };
}
```

Then add a new describe block:

```ts
describe("egress denial + header hardening (#88)", () => {
  it("denies a from_slot base URL that resolves to a denied host", async () => {
    writeManifest("ha", {
      name: "HA", base_url: { from_slot: "base_url" },
      auth: { kind: "none" }, slots: { base_url: { kind: "config", label: "Base" } },
    });
    initGatewayManifests(cfg());
    declare("ha");
    setGatewayConfig(APP, "probe", "base_url", "http://169.254.169.254");
    expect(await reason(executeGatewayRequest(APP, "probe", { method: "GET", path: "/x" }))).toBe("egress_denied");
  });

  it("allows a from_slot local base URL when the manifest opts in", async () => {
    writeManifest("ha", {
      name: "HA", base_url: { from_slot: "base_url" }, local_network: true,
      auth: { kind: "none" }, slots: { base_url: { kind: "config", label: "Base" } },
    });
    initGatewayManifests(cfg());
    declare("ha");
    setGatewayConfig(APP, "probe", "base_url", `http://127.0.0.1:${stubPort}`);
    const env = await executeGatewayRequest(APP, "probe", { method: "GET", path: "/ok" });
    expect(env.status).toBe(200);
  });

  it("denies an off-pin from_slot value", async () => {
    writeManifest("ha", {
      name: "HA", local_network: true,
      base_url: { from_slot: "base_url", allowed_hosts: ["127.0.0.1"] },
      auth: { kind: "none" }, slots: { base_url: { kind: "config", label: "Base" } },
    });
    initGatewayManifests(cfg());
    declare("ha");
    setGatewayConfig(APP, "probe", "base_url", "http://10.0.0.5");
    expect(await reason(executeGatewayRequest(APP, "probe", { method: "GET", path: "/x" }))).toBe("egress_denied");
  });

  it("drops forwarded-identity headers", async () => {
    writeManifest("stub", stubManifest({ kind: "none" }, {}));
    initGatewayManifests(cfg());
    declare("stub");
    await executeGatewayRequest(APP, "probe", {
      method: "GET", path: "/h",
      headers: { "X-Forwarded-For": "1.2.3.4", "Forwarded": "for=1.2.3.4", "X-Real-IP": "1.2.3.4", "True-Client-IP": "1.2.3.4", "X-Trace": "keep" },
    });
    // stub records req.headers — assert forwarded gone, X-Trace kept.
    const last = lastHeaders();
    expect(last["x-forwarded-for"]).toBeUndefined();
    expect(last["forwarded"]).toBeUndefined();
    expect(last["x-real-ip"]).toBeUndefined();
    expect(last["true-client-ip"]).toBeUndefined();
    expect(last["x-trace"]).toBe("keep");
  });
});
```

The stub currently records `{ url, auth }` only. Extend the `hits` capture and add a `lastHeaders()` helper. In the `beforeEach` stub handler, change the push to also capture headers:

```ts
hits.push({ url: req.url ?? "", auth: req.headers.authorization ?? null, headers: req.headers as Record<string, string> });
```

Update the `hits` type declaration accordingly and add near the other helpers:

```ts
function lastHeaders(): Record<string, string> {
  return hits[hits.length - 1]?.headers ?? {};
}
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @lodekit/engine exec vitest run tests/gateway-executor.test.ts -t "egress denial"`
Expected: FAIL — `egress_denied` reason unknown; forwarded headers currently forwarded.

- [ ] **Step 3: Add the reason + status**

In `gatewayExecutor.ts`, extend the taxonomy:

```ts
export type GatewayFailReason =
  | "unconfigured" | "rate_limited" | "breaker_open" | "needs_reauth"
  | "timeout" | "too_large" | "network" | "unavailable" | "egress_denied";
```

```ts
export const REASON_STATUS: Record<GatewayFailReason, 409 | 429 | 502 | 503 | 504> = {
  unconfigured: 409, needs_reauth: 409, egress_denied: 409, rate_limited: 429,
  breaker_open: 503, unavailable: 503, timeout: 504, network: 502, too_large: 502,
};
```

- [ ] **Step 4: Move the scheme gate into `checkEgress` and call it**

In `assembleUrl` (lines 188-213), remove the scheme check (lines 198-200) — `checkEgress` now owns scheme policy. Keep the URL-shape and path-escape logic. `assembleUrl` stays sync and still returns a `URL`.

Import at the top:

```ts
import { checkEgress, EgressDeniedError } from "./gatewayEgress.js";
```

In `executeGatewayRequest`, immediately after `const url = assembleUrl(...)` (line 375) and *before* `injectAuth` (line 376), add:

```ts
    const pins = typeof manifest.base_url === "object" ? manifest.base_url.allowed_hosts : undefined;
    try {
      await checkEgress(manifest, url, pins ? { pins } : undefined);
    } catch (e) {
      if (e instanceof EgressDeniedError) throw new GatewayRequestError("egress_denied", e.message);
      throw new GatewayRequestError("network", "gateway host could not be resolved");
    }
```

- [ ] **Step 5: Record the `egress_denied` outcome**

In the outer `catch` of `executeGatewayRequest` (around line 473-485), extend the `unconfigured`/`needs_reauth`/`unavailable` warn branch to include `egress_denied`:

```ts
    if (e instanceof GatewayRequestError && (e.reason === "unconfigured" || e.reason === "needs_reauth" || e.reason === "unavailable" || e.reason === "egress_denied")) {
      record("warn", e.reason, null, Date.now() - started);
    }
```

- [ ] **Step 6: Extend the header drop-list (SEC-18)**

In the header-copy loop (lines 364-374), replace the `host`/`cookie` skip with the forwarded-identity class too:

```ts
    const DROP_HEADERS = new Set(["host", "cookie", "forwarded", "x-real-ip", "true-client-ip"]);
    for (const [k, v] of Object.entries(desc.headers ?? {})) {
      const lk = k.toLowerCase();
      if (DROP_HEADERS.has(lk) || lk.startsWith("x-forwarded-")) continue; // never caller-suppliable
      if (lk === "authorization" || lk === "proxy-authorization") {
        throw new GatewaysError("credentials belong in gateway slots — the gateway owns the authorization header");
      }
      headers[lk] = v;
    }
```

- [ ] **Step 7: Run the executor tests**

Run: `pnpm --filter @lodekit/engine exec vitest run tests/gateway-executor.test.ts`
Expected: PASS (existing + new; the `stubManifest` flag keeps prior local tests loading).

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/gatewayExecutor.ts packages/engine/tests/gateway-executor.test.ts
git commit -m "feat(engine): enforce egress policy in the gateway executor + drop forwarded-identity headers (#88)"
```

---

### Task 4: OAuth token-exchange egress check

**Files:**
- Modify: `packages/engine/src/gatewayOauth.ts` (`tokenPost` ~103-118; add manifest threading)
- Modify: `packages/engine/tests/gateway-oauth.test.ts` (add `local_network: true` to the `http://127.0.0.1` provider manifest; add a denied-target test)

**Interfaces:**
- Consumes: `checkEgress`, `EgressDeniedError` from `./gatewayEgress.js`; the `manifest` already available in `oauthManifest`/`tokenProvider`.
- Produces: (none new) — `tokenPost` now takes the manifest to enforce policy on `token_url`.

**Acceptance Criteria:**
- A token exchange whose `token_url` resolves to a denied class throws a typed failure and performs no fetch.
- The existing local `http://127.0.0.1` OAuth provider tests pass once the fixture opts in with `local_network: true`.

- [ ] **Step 1: Write the failing test**

The oauth test's provider manifest targets `http://127.0.0.1:${providerPort}`. Add `local_network: true` to both manifests in `gateway-oauth.test.ts` (lines ~66 and ~198). Then add a denial test — a manifest whose `token_url` is a link-local literal:

```ts
it("denies a token exchange toward a denied host (#88)", async () => {
  const dir = path.join(root, "gateways", "evil");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    name: "Evil", base_url: "https://8.8.8.8", local_network: true,
    auth: {
      kind: "oauth2",
      authorization_url: "https://8.8.8.8/a",
      token_url: "http://169.254.169.254/token",
      client_id_slot: "client_id",
    },
    slots: { client_id: { kind: "config", label: "Client id" } },
  }));
  initGatewayManifests(cfg());
  applyGatewaysManifest(cfg(), APP, { evil: { provider: "evil" } }, Date.now());
  setGatewayConfig(APP, "evil", "client_id", "cid");
  // Drive a token exchange: start + callback would hit checkEgress in tokenPost.
  const { authorizeUrl } = startOauth(APP, "evil");
  const st = new URL(authorizeUrl).searchParams.get("state")!;
  await expect(handleOauthCallback({ code: "c", state: st })).rejects.toBeInstanceOf(Error);
});
```

(Import `setGatewayConfig` and `applyGatewaysManifest` at the top of the test if not already present; `applyGatewaysManifest` is already imported in the sibling tests — mirror it.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @lodekit/engine exec vitest run tests/gateway-oauth.test.ts -t "denies a token exchange"`
Expected: FAIL — the exchange currently fetches the link-local host.

- [ ] **Step 3: Thread the manifest into `tokenPost` and check egress**

In `gatewayOauth.ts`, import:

```ts
import { checkEgress, EgressDeniedError } from "./gatewayEgress.js";
```

Change `tokenPost`'s signature to accept the manifest and check before fetch:

```ts
async function tokenPost(manifest: GatewayManifest, auth: Oauth2, params: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  try {
    await checkEgress(manifest, new URL(auth.token_url));
  } catch (e) {
    if (e instanceof EgressDeniedError) throw new GatewayRequestError("egress_denied", e.message);
    throw new GatewayRequestError("unavailable", "token endpoint could not be resolved");
  }
  const res = await fetch(auth.token_url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string } | null;
  if (!res.ok || !body?.access_token) {
    throw new GatewaysError(`token request failed: ${body?.error ?? res.status}`);
  }
  return body as { access_token: string; refresh_token?: string; expires_in?: number };
}
```

Update both callers to pass the manifest. In `handleOauthCallback`, `oauthManifest` returns `{ manifest, auth }` — use it:

```ts
  const { manifest, auth } = oauthManifest(p.appId, p.alias);
  ...
  const t = await tokenPost(manifest, auth, params);
```

In `tokenProvider`, the `manifest` parameter is already in scope:

```ts
    t = await tokenPost(manifest, auth, params);
```

- [ ] **Step 4: Run the oauth tests**

Run: `pnpm --filter @lodekit/engine exec vitest run tests/gateway-oauth.test.ts`
Expected: PASS (fixtures opted-in; denial test throws).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/gatewayOauth.ts packages/engine/tests/gateway-oauth.test.ts
git commit -m "feat(engine): enforce egress policy on the OAuth token exchange (#88)"
```

---

### Task 5: Set-time validation on the config-value route

**Files:**
- Modify: `packages/engine/src/services/gateways.ts` (`PUT /:alias/slots/:slot/value` handler, ~383-399)
- Modify: `packages/engine/tests/gateways-api.test.ts` (fixture `local_network`; new set-time tests)

**Interfaces:**
- Consumes: `checkEgress`, `EgressDeniedError` from `../gatewayEgress.js`; `getGatewayEntry` (already imported) for the manifest; the manifest's `base_url` to learn whether this slot feeds it and its pins.
- Produces: (none) — best-effort UX rejection; the request path stays authoritative.

**Acceptance Criteria:**
- `PUT …/value` with a value that fails egress policy (bad scheme, off-pin host, or a denied literal) → HTTP 400 with a message; nothing is written.
- A value that feeds `base_url.from_slot` and passes policy still writes (200).
- Setting a non-`base_url` config slot skips egress validation entirely (unchanged behavior).

- [ ] **Step 1: Write the failing test**

The `gateways-api.test.ts` stub manifest uses `http://127.0.0.1` — add `local_network: true` to it (line ~52). Then add a `from_slot`-based provider to the fixture setup and tests. Simplest: write a second gateway dir in the test and declare it. Add:

```ts
describe("set-time egress validation (#88)", () => {
  beforeEach(() => {
    const dir = path.join(root, "gateways", "ha");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
      name: "HA", base_url: { from_slot: "url", allowed_hosts: ["home.example.com"] },
      auth: { kind: "none" }, slots: { url: { kind: "config", label: "Base URL" } },
    }));
    initGatewayManifests(cfg());
    applyGatewaysManifest(cfg(), APP, { ha: { provider: "ha" } }, Date.now());
  });

  it("rejects an off-pin base URL value", async () => {
    const res = await req(`/api/apps/${APP}/gateways/ha/slots/url/value`, json({ value: "https://evil.com" }, "PUT"));
    expect(res.status).toBe(400);
  });
  it("rejects a denied-literal base URL value", async () => {
    const res = await req(`/api/apps/${APP}/gateways/ha/slots/url/value`, json({ value: "https://169.254.169.254" }, "PUT"));
    expect(res.status).toBe(400);
  });
  it("accepts a pinned public base URL value", async () => {
    const res = await req(`/api/apps/${APP}/gateways/ha/slots/url/value`, json({ value: "https://home.example.com" }, "PUT"));
    expect(res.status).toBe(200);
  });
});
```

(`home.example.com` must resolve public for the accept case. To avoid live DNS in tests, see Step 3 — the route accepts an injectable lookup via a module-level test seam, defaulting to real DNS. The accept test stubs it.)

To keep the accept test hermetic, expose a test seam. Add to the top of the new describe block:

```ts
  // home.example.com is RFC-2606-ish; stub the resolver so the accept case is hermetic.
  beforeEach(() => setGatewaysEgressLookupForTest(async (h) => (h === "home.example.com" ? ["93.184.216.34"] : ["8.8.8.8"])));
  afterEach(() => setGatewaysEgressLookupForTest(null));
```

Import `setGatewaysEgressLookupForTest` from `../src/services/gateways.js`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @lodekit/engine exec vitest run tests/gateways-api.test.ts -t "set-time egress"`
Expected: FAIL — route currently writes any non-empty value; test seam missing.

- [ ] **Step 3: Add the test seam + validation to the route**

In `services/gateways.ts`, import and add a module-level injectable lookup (defaults to the module's own default; only tests override it):

```ts
import { checkEgress, EgressDeniedError, type LookupFn } from "../gatewayEgress.js";

let egressLookupOverride: LookupFn | null = null;
/** Test seam — pins the egress resolver for set-time validation. */
export function setGatewaysEgressLookupForTest(fn: LookupFn | null): void {
  egressLookupOverride = fn;
}
```

In the `PUT /:alias/slots/:slot/value` handler, before `setGatewayConfig`, validate when this slot feeds `base_url.from_slot`:

```ts
      const { alias, slot } = c.req.valid("param");
      const def = requireSlotDef(c.var.usesDb, alias, slot);
      if (def.kind !== "config") throw new GatewaysError(`slot "${slot}" is a secret slot — link a secret instead`);
      const value = c.req.valid("json").value;
      // If this slot is the manifest's dynamic base URL, hold it to the same
      // egress policy the request path enforces (best-effort — DNS/manifest can
      // change after set-time; the executor stays authoritative). Spec §"Enforcement points".
      const useDef = requireUse(c.var.usesDb, alias);
      const entry = getGatewayEntry(useDef.provider);
      const baseUrl = entry?.manifest?.base_url;
      if (baseUrl && typeof baseUrl === "object" && baseUrl.from_slot === slot) {
        let url: URL;
        try { url = new URL(value); }
        catch { throw new GatewaysError(`"${value}" is not a valid URL`); }
        try {
          await checkEgress(entry!.manifest!, url, {
            ...(baseUrl.allowed_hosts ? { pins: baseUrl.allowed_hosts } : {}),
            ...(egressLookupOverride ? { lookup: egressLookupOverride } : {}),
          });
        } catch (e) {
          if (e instanceof EgressDeniedError) throw new GatewaysError(`base URL rejected: ${e.message}`);
          throw new GatewaysError("base URL host could not be resolved");
        }
      }
      setGatewayConfig(c.var.appId, alias, slot, value);
```

Make the handler `async` if it is not already (add `async (c) =>`). `GatewaysError` maps to 400 via `errResponse`.

- [ ] **Step 4: Run the api tests**

Run: `pnpm --filter @lodekit/engine exec vitest run tests/gateways-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/services/gateways.ts packages/engine/tests/gateways-api.test.ts
git commit -m "feat(engine): validate from_slot base URLs at set-time against egress policy (#88)"
```

---

### Task 6: Fixture sweep, e2e, docs, changelog

**Files:**
- Modify: `packages/engine/tests/gateways-e2e.test.ts` (add `local_network: true` to its `http://127.0.0.1` manifest, line ~103)
- Modify: `web/docs/src/content/docs/services/gateways.mdx`
- Modify: `docs/changelog.md`

**Acceptance Criteria:**
- The full engine suite passes: `pnpm --filter @lodekit/engine test`.
- The integration suite passes: `pnpm --filter @lodekit/integration-tests test`.
- The checked-in `root/gateways/*` manifests load clean (they are public https literals — no change).
- Docs describe `from_slot`, `local_network`, and `allowed_hosts`.
- Changelog has one user-facing `## New` entry.

- [ ] **Step 1: Sweep the last local fixture**

In `gateways-e2e.test.ts`, the manifest at line ~103 uses `base_url: \`http://127.0.0.1:${stubPort}\``. Add `local_network: true` to that object. Grep to confirm none remain:

Run: `grep -rn "127.0.0.1\|localhost" packages/engine/tests/*.ts | grep base_url`
For each hit, confirm the enclosing manifest object has `local_network: true`.

- [ ] **Step 2: Run the full engine suite**

Run: `pnpm --filter @lodekit/engine test`
Expected: PASS. Fix any remaining fixture that trips the new load/runtime policy by adding `local_network: true` (only where the target is genuinely local).

- [ ] **Step 3: Run the integration suite**

Run: `pnpm --filter @lodekit/integration-tests test`
Expected: PASS.

- [ ] **Step 4: Verify checked-in manifests still load**

Run: `pnpm dev` briefly, or a focused check that `root/gateways/openweathermap` and `root/gateways/duende-demo` parse — both are `https://` public literals, so they must load with `error: null`. (A quick assertion: `node -e` importing is buildless-awkward; instead confirm via the existing gateway-manifests test suite already exercising real-shaped manifests, plus manual read.)
Expected: both load clean, no `local_network` needed.

- [ ] **Step 5: Document the fields**

In `web/docs/src/content/docs/services/gateways.mdx`, after the `base_url` paragraph (line ~88), add:

```mdx
A gateway can also derive its base URL from a config slot —
`"base_url": { "from_slot": "url" }` — for services whose host the person
supplies (a self-hosted instance, a Home Assistant box). The engine still owns
egress: the resolved URL is held to the same policy as a literal one.

By default a gateway may only reach **public** hosts — the engine refuses any
URL that resolves to a loopback, private (RFC-1918 / ULA), or link-local
address, closing the SSRF door. A gateway that legitimately targets your own
network (a local Home Assistant, a LAN device) declares `"local_network": true`
at the top of its manifest; that opt-in also re-enables plain `http`. For a
`from_slot` base URL you can additionally pin the reachable hosts with
`"allowed_hosts": ["home.example.com", "*.ui.nabu.casa"]` — the person-supplied
value must match one of them.
```

- [ ] **Step 6: Add the changelog entry**

Append under `## New` in `docs/changelog.md`:

```markdown
- **Safer gateways** — gateways can only reach public hosts by default; a
  gateway that targets your own network (a local Home Assistant, a LAN device)
  opts in with `"local_network": true`, and a person-supplied base URL can be
  pinned to specific hosts with `allowed_hosts`. Requests to internal addresses
  are refused with a clear message.
```

- [ ] **Step 7: Commit**

```bash
git add packages/engine/tests/gateways-e2e.test.ts web/docs/src/content/docs/services/gateways.mdx docs/changelog.md
git commit -m "test(engine): egress fixture sweep + docs & changelog for gateway SSRF hardening (#88)"
```

---

## Deferrals

File after the plan lands (or at session close):

- **Connection-time egress enforcement** — replace pre-flight resolve with an undici `Agent` whose `connect.lookup` validates the address the socket actually dials, closing the TOCTOU window. `defer`-labeled bead; provenance: this plan, spec §"Known accepted limitation". Severity low / confidence high.

## Greenhouse DoD note

The showcase has no `from_slot`/`local_network` gateway today, and standing up a real local service in the showcase is out of scope for a security fix. Assess during Task 6 whether a documented `local_network` example manifest belongs in `root/README.md`'s coverage checklist; if not added, note it as a `defer` bead rather than silently skipping.
