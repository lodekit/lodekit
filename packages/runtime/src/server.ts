import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import type { Config } from "./config.js";
import { apiRouter } from "./routes.js";
import { appHost } from "./appHost.js";
import { startWatcher } from "./watcher.js";
import { buildAll } from "./build.js";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

export function createServer(cfg: Config): express.Express {
  const app = express();
  app.use("/_lodekit", express.static(path.join(PUBLIC, "_lodekit")));
  app.use("/api", apiRouter(cfg));
  app.get("/", (_req, res) => res.sendFile(path.join(PUBLIC, "dashboard", "index.html")));
  app.use(appHost(cfg));
  return app;
}

export function start(cfg: Config): Server {
  const app = createServer(cfg);
  startWatcher(cfg);
  const server = app.listen(cfg.port, () => {
    console.log(`Lodekit running at ${cfg.baseUrl}`);
  });
  void buildAll(cfg);
  return server;
}
