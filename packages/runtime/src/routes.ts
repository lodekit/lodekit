import express from "express";
import type { Config } from "./config.js";
import { scanApps, isValidSlug } from "./registry.js";
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
    const { slug, name, description, icon } = req.body ?? {};
    if (!isValidSlug(slug ?? "") || !name) {
      res.status(400).json({ error: "invalid slug or missing name" });
      return;
    }
    res.status(201).json(scaffoldApp(cfg, { slug, name, description, icon }));
  });

  r.use(`/apps/:slug/${CATALOG_NAME}`, kvRouter(cfg));

  r.get("/events", (_req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    res.write(": connected\n\n");
    addClient(res);
  });

  r.get("/apps/:slug/events", (req, res) => {
    if (!isValidSlug(req.params.slug)) {
      res.status(400).json({ error: "invalid slug" });
      return;
    }
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    res.write(": connected\n\n");
    addClient(res, req.params.slug);
  });

  return r;
}
