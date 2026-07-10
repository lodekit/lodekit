// The declaration side of the gateways service (spec 2026-07-10-gateways §5):
// alias builders + a thin validator/tagger. appWorkerEntry scans the built
// src/gateways.ts DEFAULT export for the __lodekitGateways marker and posts
// `uses` as the gateways manifest; full validation is runtime-side. The call
// surface is the SDK singleton's `gateways` handle (client.ts) — server-only.

export interface GatewayUse {
  provider: string;
  description?: string;
}

export const gateway = (cfg: GatewayUse): GatewayUse => ({ ...cfg });

export type GatewayUses = Record<string, GatewayUse>;

export type GatewayErrorReason =
  | "unconfigured" | "rate_limited" | "breaker_open" | "needs_reauth"
  | "timeout" | "too_large" | "network" | "unavailable";

/** Thrown by gateway calls. `unconfigured`/`needs_reauth` mean the person
 * finishes the connection in the dashboard — render a "configure me" state;
 * the transient reasons are fair game for a task's own retry policy. */
export class GatewayError extends Error {
  constructor(
    public readonly reason: GatewayErrorReason,
    message?: string
  ) {
    super(message ?? `gateway ${reason}`);
    this.name = "GatewayError";
  }
}

export interface DefinedGateways<G extends GatewayUses> {
  __lodekitGateways: true;
  uses: G;
}

const ALIAS_RE = /^[a-z0-9_]+$/;
const PROVIDER_ID_RE = /^[a-z0-9-]+$/;

export function defineGateways<G extends GatewayUses>(uses: G): DefinedGateways<G> {
  for (const [alias, u] of Object.entries(uses)) {
    if (!ALIAS_RE.test(alias) || alias.length > 64) {
      throw new Error(`defineGateways(): invalid alias "${alias}" (snake_case, max 64)`);
    }
    if (typeof u?.provider !== "string" || !PROVIDER_ID_RE.test(u.provider) || u.provider.length > 64) {
      throw new Error(`defineGateways(): "${alias}" needs a valid provider id (lowercase letters, digits, dashes)`);
    }
  }
  return { __lodekitGateways: true, uses };
}
