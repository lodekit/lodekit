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
import { buildAll, buildDashboard, getDashboardState, idleBuilds, uiDir } from "./build.js";
import { isValidAppId, scanApps } from "./registry.js";
import { configureWorkers, forwardToWorker, stopAllWorkers, onTasksManifest } from "./appWorker.js";
import { every, stop } from "./scheduler.js";
import { sweepAllAndBroadcast } from "./services/kv-store.js";
import { sweepFiles } from "./services/file-store.js";
import { initLogStore, sweepLogStore } from "./logStore.js";
import { initEventStore, sweepEventStore } from "./eventStore.js";
import { initSettingsStore } from "./services/settings.js";
import { createLogger } from "./logger.js";
import { initTaskEngine, registerManifest, recoverInterruptedRuns, dispatchTasks } from "./taskEngine.js";
import { sweepAllTaskRuns } from "./services/tasks.js";

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

const uiNotBuiltPage = () => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Lodekit</title>
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:640px;margin:15vh auto;padding:0 24px;color:#0a0a0a}.muted{color:#6b7280}code{background:#f4f4f5;padding:2px 6px;border-radius:6px}</style>
</head>
<body><h1>Lodekit</h1><p class="muted">The component preview isn't built. Run <code>pnpm --filter @lodekit/ui build-storybook</code> and reload.</p></body>
</html>
`;

export function createApp(cfg: Config): Hono {
  // serveStatic (here and in appHost below) checks its root's existence at
  // construction time and logs to stderr when missing — pre-create the cache
  // dir so a fresh boot stays as silent as Express's static serving was.
  fs.mkdirSync(cfg.cacheDir, { recursive: true });
  // Static Storybook build for /_ui — shipped inside the @lodekit/ui package
  // (storybook-static travels with it through pnpm deploy). Env override is for tests.
  const uiStaticDir = process.env.LODEKIT_UI_STATIC_DIR ?? path.join(uiDir, "storybook-static");
  return new Hono()
    .onError((err, c) => {
      if (err instanceof HTTPException) return err.getResponse(); // e.g. bodyLimit's 413
      if (err instanceof SyntaxError) return c.json({ error: "invalid JSON body" }, 400);
      // Uncaught route errors surface as Express's 500-with-message did — never crash.
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    })
    .route("/api", apiRoutes(cfg))
    // Registered before the /_ui/* wildcard below: that pattern also matches the bare
    // "/_ui" path, and serveStatic resolves it straight to index.html (no next() call)
    // when the build exists — this route must win first so the redirect always fires.
    .get("/_ui", (c) => c.redirect("/_ui/", 301))
    // Live theme overrides for the /_ui preview: global file, optionally composed
    // with one app's file (?app=<id>) — read per request, never cached, so theme
    // edits show on reload without rebuilding the static Storybook.
    .get("/_ui/theme.css", (c) => {
      const read = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "");
      let css = read(path.join(cfg.root, "theme.css"));
      const app = c.req.query("app");
      if (app !== undefined) {
        if (!isValidAppId(app) || !scanApps(cfg.appsDir).some((a) => a.appId === app)) {
          return c.text("unknown app", 404);
        }
        css += "\n" + read(path.join(cfg.appsDir, app, "theme.css"));
      }
      c.header("Cache-Control", "no-store");
      c.header("Content-Type", "text/css; charset=utf-8");
      return c.body(css);
    })
    .use("/_ui/*", serveStatic({
      root: uiStaticDir,
      rewriteRequestPath: (p) => p.replace(/^\/_ui/, "") || "/",
    }))
    .all("/_ui/*", (c) => c.html(uiNotBuiltPage(), 404))
    .use("/_dashboard/_build/*", serveStatic({
      root: cfg.cacheDir,
      rewriteRequestPath: (p) => p.replace(/^\/_dashboard\/_build\//, "/_dashboard/client/"),
    }))
    .all("/_dashboard/*", async (c) => {
      const state = getDashboardState();
      if (!state || state.status === "error") {
        return c.html(fallbackPage(state?.status === "error" ? state.message : undefined));
      }
      // Soft same-origin guard: mirrors appHost's _serverFn check. The dashboard defines
      // none today, but it's app #0 on the same substrate and will host privileged ones.
      const segments = new URL(c.req.url).pathname.split("/").filter(Boolean);
      if (segments[1] === "_serverFn" && c.req.header("sec-fetch-site") !== "same-origin") {
        return c.json({ error: "server functions are same-origin only" }, 403);
      }
      try {
        return await forwardToWorker("_dashboard", c.req.raw);
      } catch (e) {
        return c.html(fallbackPage(e instanceof Error ? e.message : String(e)), 502);
      }
    })
    .get("/_dashboard", (c) => c.redirect("/_dashboard/", 301))
    .get("/", (c) => c.redirect("/_dashboard/", 302))
    .use("*", appHost(cfg));
}

// The folder-watcher shuts down off the server's "close" event (async chokidar teardown).
// Exposed so a caller that must fully quiesce before touching the Lodekit root on disk —
// tests removing their temp root between runs — can await the shutdown it kicked off.
export const watcherShutdown = new WeakMap<Server, Promise<void>>();

// Returns the underlying (unlistened) Node http.Server — shutdown semantics and
// every fetch-against-listening-server test keep working unchanged.
export function createServer(cfg: Config): Server {
  return createAdaptorServer({ fetch: createApp(cfg).fetch }) as Server;
}

export async function start(cfg: Config): Promise<Server> {
  initLogStore(cfg.stateDir);
  initSettingsStore(cfg.dataDir);
  if (!initEventStore(cfg.dataDir)) {
    createLogger("event-store").error("events.sqlite unavailable — event bus degrades to live-only");
  }
  const server = createServer(cfg);
  server.listen(cfg.port, () => {
    console.log(`Lodekit running at ${cfg.baseUrl}`);
    createLogger("host").info(`listening on ${cfg.baseUrl}`, { port: cfg.port });
  });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const addr = server.address();
  configureWorkers(`http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : cfg.port}`);
  initTaskEngine(cfg);
  onTasksManifest(registerManifest);
  recoverInterruptedRuns();
  await buildDashboard(cfg); // never throws; failures surface as the fallback page
  const watcher = await startWatcher(cfg);
  every("kv-store-sweep", 60_000, sweepAllAndBroadcast);
  every("file-store-sweep", 60_000, () => sweepFiles(cfg));
  every("log-sweep", 60_000, () => sweepLogStore());
  every("event-sweep", 60_000, () => sweepEventStore());
  every("tasks-dispatch", 1_000, dispatchTasks);
  every("tasks-sweep", 60_000, sweepAllTaskRuns);
  server.on("close", () => {
    stop("kv-store-sweep");
    stop("file-store-sweep");
    stop("log-sweep");
    stop("event-sweep");
    stop("tasks-dispatch");
    stop("tasks-sweep");
    // Order matters: close the watcher (no new build triggers), let in-flight builds
    // finish — each may (re)start its app worker on success — and only THEN stop every
    // worker. Stopping first would let the drain resurrect a worker that outlives close;
    // it then crashes on the removed cache dir and schedules a backoff respawn that leaks
    // into the next boot. Draining before removing files also avoids a build running
    // against files a caller is about to delete.
    watcherShutdown.set(server, watcher.close().then(idleBuilds).then(stopAllWorkers));
  });
  void buildAll(cfg);
  return server;
}
