import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Config } from "./config.js";
import { scanApps, isValidAppId } from "./registry.js";
import { scaffoldApp } from "./scaffold.js";
import { addClient } from "./sse.js";
import { validationHook } from "./validation.js";
import { kvRoutes, withDb, CATALOG_NAME } from "./services/kv-store.js";
import { filesRoutes, withFiles, CATALOG_NAME as FILES } from "./services/file-store.js";
import { logRoutes, withLogs, logsQuery, CATALOG_NAME as LOGS } from "./services/log-store.js";
import { queryLogs } from "./logStore.js";
import { tasksRoutes, withTasks, CATALOG_NAME as TASKS } from "./services/tasks.js";
import { eventRoutes, withEvents, eventsQuery, CATALOG_NAME as EVENTS } from "./services/event-store.js";
import { queryEvents } from "./eventStore.js";
import { NS_RE } from "./events.js";

// Holds the stream open until the client disconnects; the abort callback
// removes the client from the SSE registry.
function sseHandler(appId?: string) {
  return (c: Parameters<typeof streamSSE>[0]) =>
    streamSSE(c, async (stream) => {
      await stream.write(": connected\n\n");
      const remove = addClient((payload) => void stream.write(payload), appId);
      stream.onAbort(remove);
      await new Promise<void>((resolve) => stream.onAbort(resolve));
    });
}

export function apiRoutes(cfg: Config) {
  return new Hono()
    .use(`/apps/:appId/${FILES}/*`, withFiles(cfg))
    .route(`/apps/:appId/${FILES}`, filesRoutes)
    // Express's express.json() default (100 kb), preserved explicitly.
    .use(bodyLimit({ maxSize: 100 * 1024 }))
    .get("/apps", (c) => c.json(scanApps(cfg.appsDir)))
    .post("/apps", async (c) => {
      let body: { appId?: string; name?: string; description?: string; icon?: string } = {};
      try {
        body = await c.req.json();
      } catch {
        // empty or malformed body — falls through to the 400 below
      }
      const { appId, name, description, icon } = body ?? {};
      if (!isValidAppId(appId ?? "") || !name) {
        return c.json({ error: "invalid app id or missing name" }, 400);
      }
      return c.json(scaffoldApp(cfg, { appId: appId!, name, description, icon }), 201);
    })
    .use(`/apps/:appId/${CATALOG_NAME}/*`, withDb(cfg))
    .route(`/apps/:appId/${CATALOG_NAME}`, kvRoutes)
    .use(`/apps/:appId/${LOGS}/*`, withLogs())
    .route(`/apps/:appId/${LOGS}`, logRoutes)
    .use(`/apps/:appId/${EVENTS}/*`, withEvents())
    .route(`/apps/:appId/${EVENTS}`, eventRoutes)
    // Global log read (dashboard + MCP). `app=_platform` selects the runtime's own
    // records — the internal-namespace sentinel (spec 2026-07-07-events §2/§8).
    .get("/logs", zValidator("query", logsQuery.extend({ app: z.string().optional() }), validationHook), (c) => {
      const { app, level, source, before, limit, q } = c.req.valid("query");
      return c.json(queryLogs({ app, level, source, before, limit, q }));
    })
    .use(`/apps/:appId/${TASKS}/*`, withTasks(cfg))
    .route(`/apps/:appId/${TASKS}`, tasksRoutes)
    // Global event history (dashboard + MCP); /api/events itself stays the SSE feed.
    .get(
      "/events/history",
      zValidator("query", eventsQuery.extend({ ns: z.string().regex(NS_RE).optional() }), validationHook),
      (c) => {
        const { ns, type, after, before, limit } = c.req.valid("query");
        return c.json(queryEvents({ ns, type, after, before, limit }));
      }
    )
    .get("/events", (c) => sseHandler()(c))
    .get("/apps/:appId/events", (c) => {
      const appId = c.req.param("appId");
      if (!isValidAppId(appId)) return c.json({ error: "invalid app id" }, 400);
      return sseHandler(appId)(c);
    });
}
