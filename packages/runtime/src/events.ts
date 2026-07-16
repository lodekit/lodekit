import { insertEvent, type EventRecord } from "./eventStore.js";
import { broadcast } from "./sse.js";

// log-store's query sentinel only (its convergence is a follow-up slice) — no event
// emitter may import this. Deleted once the last emitter migrates (this PR, Task 9).
export const PLATFORM_NS = "_platform";
// App and component ids: an app id, or an underscore-prefixed internal-app id
// (_dashboard) — the app-id grammar has no underscore, so the two can never collide
// and no reserved-word check exists anywhere (spec §2/§3).
export const ID_RE = /^_?[a-z0-9-]+$/;
export const TYPE_RE = /^[a-z0-9-]+$/;
// The closed set of platform-member classes that emit (spec §2 "Kind").
export const KINDS = ["engine", "service", "app"] as const;
export type Kind = (typeof KINDS)[number];
export const PAYLOAD_MAX_BYTES = 8 * 1024;
export const TTL_MAX_S = 30 * 24 * 60 * 60;
// Change-feed events (kv/file-store &c.) are the bus's noisiest tenants — a
// service-set shorter ttl keeps the backed-up file lean (durable ≠ forever).
export const CHANGE_FEED_TTL_S = 7 * 24 * 60 * 60;

export interface EmitInput {
  app: string | null; // whose stream; null = platform-wide (global feed only, spec §3)
  kind: Kind;
  component: string;
  type: string;
  payload?: Record<string, unknown>;
  ttl?: number; // seconds
}

// The one emission path (spec §5): persist, then stream live over the shared SSE
// transport. One wire name ("event") for the whole bus — EventSource has no catch-all
// listener, so generic consumers filter on the envelope (kind/component/type). Insert
// failure still broadcasts (id 0): the gap is history, never delivery. Never throws.
export function emitEvent(e: EmitInput): EventRecord | null {
  if (e.app !== null && !ID_RE.test(e.app)) return null;
  if (!KINDS.includes(e.kind) || !ID_RE.test(e.component) || !TYPE_RE.test(e.type)) return null;
  if (e.kind === "app" && e.component !== e.app) return null;
  if (e.payload && Buffer.byteLength(JSON.stringify(e.payload)) > PAYLOAD_MAX_BYTES) return null;
  if (e.ttl != null && (!Number.isInteger(e.ttl) || e.ttl <= 0 || e.ttl > TTL_MAX_S)) return null;
  const record = insertEvent(e) ?? {
    id: 0,
    ts: Date.now(),
    app: e.app,
    kind: e.kind,
    component: e.component,
    type: e.type,
    payload: e.payload ?? null,
  };
  broadcast("event", record, record.app ?? undefined);
  return record;
}
