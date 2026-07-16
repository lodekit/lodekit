// The gateways fact set (spec 2026-07-16-events §4). Kept in its own module so the
// request engine, oauth, store, and service router can all emit without import
// cycles. Names only — never a credential or token.
import { emitEvent, CHANGE_FEED_TTL_S } from "./events.js";

export type GatewayFact =
  | "connection-linked" | "connection-unlinked" | "connection-configured" | "connection-cleared" | "connection-authorized"
  | "connection-recovered" | "connection-failed" | "auth-expired"
  | "breaker-opened" | "breaker-closed" | "provider-changed" | "defs-changed";

/** Connection facts ride the app's stream ({ alias, ... }); catalog-level facts
 *  (breaker, provider manifest) are platform-wide (app null, { provider }). */
export function emitGatewayEvent(app: string | null, type: GatewayFact, payload?: Record<string, unknown>): void {
  emitEvent({ app, kind: "service", component: "gateways", type, payload, ttl: CHANGE_FEED_TTL_S });
}
