import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createAdaptorServer } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Config } from "./config.js";
import { apiRoutes } from "./routes.js";
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

export function createApp(cfg: Config): Hono {
  // serveStatic (here and in appHost below) checks its root's existence at
  // construction time and logs to stderr when missing — pre-create the cache
  // dir so a fresh boot stays as silent as Express's static serving was.
  fs.mkdirSync(cfg.cacheDir, { recursive: true });
  const dashOut = path.join(cfg.cacheDir, "_dashboard");
  return new Hono()
    .onError((err, c) => {
      if (err instanceof HTTPException) return err.getResponse(); // e.g. bodyLimit's 413
      if (err instanceof SyntaxError) return c.json({ error: "invalid JSON body" }, 400);
      // Uncaught route errors surface as Express's 500-with-message did — never crash.
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    })
    .route("/api", apiRoutes(cfg))
    // serveStatic joins its root with the full (unstripped) request path, so the
    // root must be cacheDir (the parent of dashOut) — the "/_dashboard" segment
    // in the URL is what selects dashOut on disk.
    .use("/_dashboard/*", serveStatic({ root: cfg.cacheDir }))
    .get("/", (c) => {
      const state = getDashboardState();
      const index = path.join(dashOut, "index.html");
      if (state?.status === "error" || !fs.existsSync(index)) {
        return c.html(fallbackPage(state?.status === "error" ? state.message : undefined));
      }
      return c.html(fs.readFileSync(index, "utf8"));
    })
    .use("*", appHost(cfg));
}

// Returns the underlying (unlistened) Node http.Server — shutdown semantics and
// every fetch-against-listening-server test keep working unchanged.
export function createServer(cfg: Config): Server {
  return createAdaptorServer({ fetch: createApp(cfg).fetch }) as Server;
}

export async function start(cfg: Config): Promise<Server> {
  const server = createServer(cfg);
  await buildDashboard(cfg); // never throws; failures surface as the fallback page
  const watcher = startWatcher(cfg);
  every("kv-store-sweep", 60_000, sweepAllAndBroadcast);
  server.on("close", () => { void watcher.close(); stop("kv-store-sweep"); });
  server.listen(cfg.port, () => {
    console.log(`Lodekit running at ${cfg.baseUrl}`);
  });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  void buildAll(cfg);
  return server;
}
