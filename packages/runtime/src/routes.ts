import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import type { Config } from "./config.js";
import { scanApps, isValidAppId } from "./registry.js";
import { scaffoldApp } from "./scaffold.js";
import { addClient } from "./sse.js";
import { kvRoutes, withDb, CATALOG_NAME } from "./services/kv-store.js";

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
    .get("/events", (c) => sseHandler()(c))
    .get("/apps/:appId/events", (c) => {
      const appId = c.req.param("appId");
      if (!isValidAppId(appId)) return c.json({ error: "invalid app id" }, 400);
      return sseHandler(appId)(c);
    });
}
