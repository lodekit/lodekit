import { Hono, type MiddlewareHandler } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { isValidAppId } from "../registry.js";
import { validationHook } from "../validation.js";
import { emitLog } from "../logger.js";
import { queryLogs } from "../logStore.js";

export const CATALOG_NAME = "log-store";

export type LogsEnv = { Variables: { appId: string } };

// Applied by the parent router on /apps/:appId/log-store/* — validates the app id.
export function withLogs(): MiddlewareHandler<LogsEnv> {
  return async (c, next) => {
    const appId = c.req.param("appId");
    if (!appId || !isValidAppId(appId)) return c.json({ error: "invalid app id" }, 400);
    c.set("appId", appId);
    await next();
  };
}

const levelSchema = z.enum(["debug", "info", "warn", "error"]);
const writeBody = z.object({
  level: levelSchema,
  message: z.string().min(1).max(8192),
  fields: z.record(z.string(), z.unknown()).optional(),
});
// Shared by the app-scoped GET and (extended with `app`) the global /api/logs.
export const logsQuery = z.object({
  level: levelSchema.optional(),
  source: z.string().optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().optional(),
  q: z.string().optional(),
});

// Chained style is normative — it is what makes hc route-type inference work.
export const logRoutes = new Hono<LogsEnv>()
  .onError((err, c) => c.json({ error: err instanceof Error ? err.message : String(err) }, 400))
  .post("/", zValidator("json", writeBody, validationHook), (c) => {
    const { level, message, fields } = c.req.valid("json");
    emitLog(level, "app", message, fields, c.var.appId);
    return c.json({ ok: true }, 201);
  })
  .get("/", zValidator("query", logsQuery, validationHook), (c) => {
    const { level, source, before, limit, q } = c.req.valid("query");
    return c.json(queryLogs({ app: c.var.appId, level, source, before, limit, q }));
  });

export type LogRoutes = typeof logRoutes;
