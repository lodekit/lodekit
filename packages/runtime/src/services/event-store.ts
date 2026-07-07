import { Hono, type MiddlewareHandler } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { isValidAppId } from "../registry.js";
import { validationHook } from "../validation.js";
import { emitEvent, PAYLOAD_MAX_BYTES, TTL_MAX_S, TYPE_RE } from "../events.js";
import { queryEvents } from "../eventStore.js";

export const CATALOG_NAME = "event-store";

export type EventsEnv = { Variables: { appId: string } };

// Applied by the parent router on /apps/:appId/event-store/* — validates the app id.
// No reserved-id check: internal namespaces are underscore-prefixed, outside this grammar.
export function withEvents(): MiddlewareHandler<EventsEnv> {
  return async (c, next) => {
    const appId = c.req.param("appId");
    if (!appId || !isValidAppId(appId)) return c.json({ error: "invalid app id" }, 400);
    c.set("appId", appId);
    await next();
  };
}

const emitBody = z
  .object({
    type: z.string().max(128).regex(TYPE_RE, "must match ^[a-z0-9-]+$"),
    payload: z.record(z.string(), z.unknown()).optional(),
    ttl: z.number().int().positive().max(TTL_MAX_S).optional(),
  })
  .refine((b) => b.payload === undefined || Buffer.byteLength(JSON.stringify(b.payload)) <= PAYLOAD_MAX_BYTES, {
    message: "payload too large (8 KB max)",
    path: ["payload"],
  });

// Shared by the app-scoped GET and (extended with `ns`) the global /api/events/history.
export const eventsQuery = z.object({
  type: z.string().optional(),
  after: z.coerce.number().int().nonnegative().optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().optional(),
});

// Chained style is normative — it is what makes hc route-type inference work.
export const eventRoutes = new Hono<EventsEnv>()
  .onError((err, c) => c.json({ error: err instanceof Error ? err.message : String(err) }, 400))
  .post("/", zValidator("json", emitBody, validationHook), (c) => {
    const { type, payload, ttl } = c.req.valid("json");
    // ns = source = the app's own id — attribution can't be forged by construction.
    const record = emitEvent({ ns: c.var.appId, source: c.var.appId, type, payload, ttl });
    if (!record) return c.json({ error: "invalid event" }, 400);
    return c.json(record, 201);
  })
  .get("/", zValidator("query", eventsQuery, validationHook), (c) => {
    const { type, after, before, limit } = c.req.valid("query");
    return c.json(queryEvents({ ns: c.var.appId, type, after, before, limit }));
  });

export type EventRoutes = typeof eventRoutes;
