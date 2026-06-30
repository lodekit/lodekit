import express from "express";
import type { Config } from "./config.js";
import { apiRouter } from "./routes.js";
import { appHost } from "./appHost.js";

export function createServer(cfg: Config): express.Express {
  const app = express();
  app.use("/api", apiRouter(cfg));
  app.use(appHost(cfg.appsDir));
  return app;
}
