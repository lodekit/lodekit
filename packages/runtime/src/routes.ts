import express, { type Request, type Response, type NextFunction } from "express";
import type Database from "better-sqlite3";
import type { Config } from "./config.js";
import { scanApps, isValidSlug } from "./registry.js";
import * as dbsvc from "./db.js";
import { scaffoldApp } from "./scaffold.js";
import { addClient } from "./sse.js";
import { kvRouter, CATALOG_NAME } from "./services/kv-store.js";

interface DbRequest extends Request {
  db?: Database.Database;
}

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

  const withDb = (req: DbRequest, res: Response, next: NextFunction) => {
    if (!isValidSlug(req.params.slug)) {
      res.status(400).json({ error: "invalid slug" });
      return;
    }
    req.db = dbsvc.getAppDb(cfg.dataDir, req.params.slug);
    next();
  };

  r.post("/apps/:slug/db/query", withDb, (req: DbRequest, res) => {
    try {
      res.json({ rows: dbsvc.query(req.db!, req.body.sql, req.body.params ?? []) });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  r.post("/apps/:slug/db/exec", withDb, (req: DbRequest, res) => {
    try {
      res.json(dbsvc.exec(req.db!, req.body.sql, req.body.params ?? []));
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  r.get("/apps/:slug/db/schema", withDb, (req: DbRequest, res) => {
    try {
      res.json({ schema: dbsvc.schema(req.db!) });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  r.get("/apps/:slug/store/:key", withDb, (req: DbRequest, res) => {
    try {
      res.json({ value: dbsvc.storeGet(req.db!, req.params.key) });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  r.put("/apps/:slug/store/:key", withDb, (req: DbRequest, res) => {
    try {
      dbsvc.storeSet(req.db!, req.params.key, req.body.value);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

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
