import { insertEvent, type EventRecord } from "./eventStore.js";
import { broadcast } from "./sse.js";

export const PLATFORM_NS = "_platform";
// Namespaces: an app id, or an underscore-prefixed internal namespace (_platform,
// _manager, _dashboard) — the app-id grammar has no underscore, so the two can never
// collide and no reserved-word check exists anywhere (spec §2).
export const NS_RE = /^_?[a-z0-9-]+$/;
export const TYPE_RE = /^[a-z0-9-]+$/;
export const PAYLOAD_MAX_BYTES = 8 * 1024;
export const TTL_MAX_S = 30 * 24 * 60 * 60;
// Change-feed events (kv/file-store) are the bus's noisiest tenant — a service-set
// shorter ttl keeps the backed-up file lean (durable ≠ forever, spec §4). Lifecycle
// server-state events ride the same ttl (crash cycles are churn of the same kind).
export const CHANGE_FEED_TTL_S = 7 * 24 * 60 * 60;

export interface EmitInput {
  ns: string;
  source: string;
  type: string;
  payload?: Record<string, unknown>;
  ttl?: number; // seconds
}

// The one emission path (spec §4): persist, then stream live over the shared SSE
// transport. One wire name ("event") for the whole bus — EventSource has no catch-all
// listener, so generic consumers filter on the envelope's `type`. Insert failure still
// broadcasts (id 0): the gap is history, never delivery. Never throws into its caller.
export function emitEvent(e: EmitInput): EventRecord | null {
  if (!NS_RE.test(e.ns) || !NS_RE.test(e.source) || !TYPE_RE.test(e.type)) return null;
  if (e.payload && Buffer.byteLength(JSON.stringify(e.payload)) > PAYLOAD_MAX_BYTES) return null;
  if (e.ttl != null && (!Number.isInteger(e.ttl) || e.ttl <= 0 || e.ttl > TTL_MAX_S)) return null;
  const record = insertEvent(e) ?? {
    id: 0,
    ts: Date.now(),
    ns: e.ns,
    source: e.source,
    type: e.type,
    payload: e.payload ?? null,
  };
  broadcast("event", record, e.ns);
  return record;
}
