// The gateways change feed + health signal (spec 2026-07-10-gateways §10).
// Kept in its own module so the engine, oauth, store, and service router can
// all emit without import cycles. Names only — never a credential or token.
import { emitEvent, PLATFORM_NS, CHANGE_FEED_TTL_S } from "./events.js";

/** Change feed: platform ns carries { provider } (manifest added/removed/
 *  edited); app ns carries { alias } (declaration/link/config changes). */
export function emitGatewayChange(ns: string, name: string): void {
  emitEvent({
    ns,
    source: PLATFORM_NS,
    type: "gateway-change",
    payload: ns === PLATFORM_NS ? { provider: name } : { alias: name },
    ttl: CHANGE_FEED_TTL_S,
  });
}

/** Health transitions: breaker opened/closed (platform ns, { provider,
 *  breaker }) and connection unhealthy/needs-reauth (app ns, { alias,
 *  provider, status }). Emitted once per transition, never per request. */
export function emitGatewayHealth(ns: string, payload: Record<string, unknown>): void {
  emitEvent({ ns, source: PLATFORM_NS, type: "gateway-health", payload, ttl: CHANGE_FEED_TTL_S });
}
