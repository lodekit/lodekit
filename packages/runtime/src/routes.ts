import express from "express";
import type { Config } from "./config.js";
import { scanApps, isValidAppId } from "./registry.js";
import { scaffoldApp } from "./scaffold.js";
import { addClient } from "./sse.js";
import { kvRouter, CATALOG_NAME } from "./services/kv-store.js";

export function apiRouter(cfg: Config): express.Router {
  const r = express.Router();
  r.use(express.json());

  r.get("/apps", (_req, res) => {
    res.json(scanApps(cfg.appsDir));
  });

  r.post("/apps", (req, res) => {
    const { appId, name, description, icon } = req.body ?? {};
    if (!isValidAppId(appId ?? "") || !name) {
      res.status(400).json({ error: "invalid app id or missing name" });
      return;
    }
    res.status(201).json(scaffoldApp(cfg, { appId, name, description, icon }));
  });

  r.use(`/apps/:appId/${CATALOG_NAME}`, kvRouter(cfg));

  r.get("/events", (_req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    res.write(": connected\n\n");
    const remove = addClient((payload) => { res.write(payload); });
    res.on("close", remove);
  });

  r.get("/apps/:appId/events", (req, res) => {
    if (!isValidAppId(req.params.appId)) {
      res.status(400).json({ error: "invalid app id" });
      return;
    }
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    res.write(": connected\n\n");
    const remove = addClient((payload) => { res.write(payload); }, req.params.appId);
    res.on("close", remove);
  });

  return r;
}
