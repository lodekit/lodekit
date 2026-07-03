import express from "express";
import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import type { Config } from "./config.js";
import { apiRouter } from "./routes.js";
import { appHost } from "./appHost.js";
import { startWatcher } from "./watcher.js";
import { buildAll, buildDashboard, getDashboardState } from "./build.js";
import { every, stop } from "./scheduler.js";
import { sweepAllAndBroadcast } from "./services/kv-store.js";

const escapeHtml = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

const fallbackPage = (message?: string) => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Lodekit</title>
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:640px;margin:15vh auto;padding:0 24px;color:#0a0a0a}.muted{color:#6b7280}pre{white-space:pre-wrap;background:#f4f4f5;padding:16px;border-radius:10px;overflow:auto}</style>
</head>
<body><h1>Lodekit</h1><p class="muted">The dashboard isn't available${message ? " — its build failed" : " yet"}. Apps and the API are still running.</p>${message ? `<pre>${escapeHtml(message)}</pre>` : ""}</body>
</html>
`;

export function createServer(cfg: Config): express.Express {
  const app = express();
  const dashOut = path.join(cfg.cacheDir, "_dashboard");
  app.use("/api", apiRouter(cfg));
  app.use("/_dashboard", express.static(dashOut));
  app.get("/", (_req, res) => {
    const state = getDashboardState();
    const index = path.join(dashOut, "index.html");
    if (state?.status === "error" || !fs.existsSync(index)) {
      res
        .status(200)
        .type("html")
        .send(fallbackPage(state?.status === "error" ? state.message : undefined));
      return;
    }
    res.sendFile(index);
  });
  app.use(appHost(cfg));
  return app;
}

export async function start(cfg: Config): Promise<Server> {
  const app = createServer(cfg);
  await buildDashboard(cfg); // never throws; failures surface as the fallback page
  const watcher = startWatcher(cfg);
  every("kv-store-sweep", 60_000, sweepAllAndBroadcast);
  const server = app.listen(cfg.port, () => {
    console.log(`Lodekit running at ${cfg.baseUrl}`);
  });
  server.on("close", () => { void watcher.close(); stop("kv-store-sweep"); });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  void buildAll(cfg);
  return server;
}
