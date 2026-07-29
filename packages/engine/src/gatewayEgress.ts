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

// Expand a valid (isIP === 6) IPv6 string into its 8 numeric 16-bit hextets.
// Handles "::" elision and a trailing dotted-decimal tail (v4-in-v6), so that
// e.g. "::ffff:7f00:1" and "::ffff:127.0.0.1" normalize to the same 8 groups —
// classification below then works from numbers, not string prefixes, closing
// the gap where alternate spellings of the same address slipped past fixed
// canonical-string matches.
function expandIPv6(ip: string): number[] | null {
  let body = ip;
  // A trailing dotted-decimal quad occupies the last two hextets.
  const v4tail = body.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4tail) {
    const octets = v4tail[1].split(".").map(Number);
    if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const hex = `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
    body = body.slice(0, body.length - v4tail[1].length) + hex;
  }
  const parts = body.split("::");
  if (parts.length > 2) return null;
  const left = parts[0] === "" ? [] : parts[0].split(":");
  const right = parts.length === 2 ? (parts[1] === "" ? [] : parts[1].split(":")) : [];
  let groups: string[];
  if (parts.length === 2) {
    const fill = 8 - (left.length + right.length);
    if (fill < 0) return null;
    groups = [...left, ...Array(fill).fill("0"), ...right];
  } else {
    groups = left;
  }
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => parseInt(g, 16));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffff)) return null;
  return nums;
}

// Extract the embedded v4 address from the last two hextets, dotted-decimal.
function embeddedV4(g: number[]): string {
  return [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff].join(".");
}

export function classifyAddress(ip: string): AddressClass {
  const kind = isIP(ip);
  if (kind === 4) return classifyV4(ip);
  if (kind !== 6) return "special"; // not an IP at all — refuse
  const g = expandIPv6(ip);
  if (!g) return "special"; // deny-by-default if expansion ever fails
  // IPv4-mapped (::ffff:0:0/96) — classify by the embedded v4 address.
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) {
    return classifyV4(embeddedV4(g));
  }
  if (g.every((n) => n === 0)) return "special"; // ::
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0 && g[6] === 0 && g[7] === 1) {
    return "loopback"; // ::1
  }
  // Deprecated RFC-4291 IPv4-compatible form (::a.b.c.d, no ffff marker).
  // Reached only after the all-zero (::) and ::1 special-cases above, so
  // those are not swallowed by this broader zero-prefix match.
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) {
    return classifyV4(embeddedV4(g));
  }
  // 6to4 (2002::/16) — the embedded v4 target sits in the next two hextets.
  if (g[0] === 0x2002) {
    return classifyV4([g[1] >> 8, g[1] & 0xff, g[2] >> 8, g[2] & 0xff].join("."));
  }
  // NAT64 well-known prefix (64:ff9b::/96) — embedded v4 in the last two hextets.
  if (g[0] === 0x0064 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) {
    return classifyV4(embeddedV4(g));
  }
  if ((g[0] & 0xfe00) === 0xfc00) return "private"; // fc00::/7 ULA
  if ((g[0] & 0xffc0) === 0xfe80) return "link-local"; // fe80::/10
  if ((g[0] & 0xff00) === 0xff00) return "special"; // ff00::/8 multicast
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
