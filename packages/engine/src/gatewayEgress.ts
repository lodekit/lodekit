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
