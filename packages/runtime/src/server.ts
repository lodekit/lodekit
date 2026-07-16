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
import { buildAll, buildDashboard, getDashboardState, idleBuilds, pruneBuildCache } from "./build.js";
import { isValidAppId, scanApps } from "./registry.js";
import { configureWorkers, forwardToWorker, stopAllWorkers, onTasksManifest, onSettingsManifest, onSecretsManifest, onGatewaysManifest, onDbManifest } from "./appWorker.js";
import { every, stop } from "./scheduler.js";
import { sweepAllAndBroadcast } from "./services/kv-store.js";
import { sweepFiles } from "./services/file-store.js";
import { initLogStore, sweepLogStore } from "./logStore.js";
import { initEventStore, sweepEventStore } from "./eventStore.js";
import {
  initSettingsStore, registerSettingsManifest,
  effectiveMs, effectiveNumber, effectiveString, onSettingsWrite, collectAppOverrides,
} from "./services/settings.js";
import { initSecretStore } from "./secretsStore.js";
import { registerSecretsManifest } from "./services/secret-store.js";
import { initGatewaysStore } from "./gatewaysStore.js";
import { initGatewayManifests } from "./gatewayManifests.js";
import { initGatewayEngine } from "./gatewayEngine.js";
import { initGatewayOauth } from "./gatewayOauth.js";
import { registerGatewaysManifest } from "./services/gateways.js";
import { applySchemaPush } from "./services/db-store.js";
import { parseDuration } from "./duration.js";
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

const themeResolverJs = (mode: string) => `(() => {
  let mode = ${JSON.stringify(mode)};
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const apply = () => document.documentElement.classList.toggle("dark", mode === "dark" || (mode === "system" && mq.matches));
  apply();
  mq.addEventListener("change", apply);
  if (typeof EventSource !== "undefined") {
    const es = new EventSource("/api/events");
    es.addEventListener("event", (e) => {
      const d = JSON.parse(e.data);
      if (d.type !== "settings-change" || d.payload?.key !== "appearance.theme") return;
      fetch("/_ui/theme.json").then((r) => r.json()).then((t) => { mode = t.theme; apply(); }).catch(() => {});
    });
  }
})();
`;

export function createApp(cfg: Config): Hono {
  // serveStatic (here and in appHost below) checks its root's existence at
  // construction time and logs to stderr when missing — pre-create the cache
  // dir so a fresh boot stays as silent as Express's static serving was.
  fs.mkdirSync(cfg.cacheDir, { recursive: true });
  return new Hono()
    .onError((err, c) => {
      if (err instanceof HTTPException) return err.getResponse(); // e.g. bodyLimit's 413
      if (err instanceof SyntaxError) return c.json({ error: "invalid JSON body" }, 400);
      // Uncaught route errors surface as Express's 500-with-message did — never crash.
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    })
    .route("/api", apiRoutes(cfg))
    .get("/_ui", (c) => c.redirect("/_ui/", 301))
    // Live theme overrides for the /_ui preview: global file, optionally composed
    // with one app's file (?app=<id>) — read per request, never cached, so theme
    // edits show on reload.
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
    // Theme mode resolver (settings spec §8): a classic blocking script so the
    // class lands before paint. Generated per request from the effective
    // appearance.theme; the interpolation is safe — a validated 3-value enum,
    // JSON-encoded. Live changes re-apply via the bus without app code.
    .get("/_ui/theme.js", (c) => {
      c.header("Cache-Control", "no-store");
      c.header("Content-Type", "text/javascript; charset=utf-8");
      return c.body(themeResolverJs(effectiveString("appearance.theme")));
    })
    .get("/_ui/theme.json", (c) => {
      c.header("Cache-Control", "no-store");
      return c.json({ theme: effectiveString("appearance.theme") });
    })
    // The Themes stub inside the dashboard (the future theme editor's slot)
    // replaced the standalone /_ui/ page; keep old links landing somewhere.
    .get("/_ui/", (c) => c.redirect("/_dashboard/themes", 302))
    .all("/_ui/*", (c) => c.text("not found", 404))
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
  initSecretStore(cfg);
  initGatewaysStore(cfg);
  initGatewayManifests(cfg);
  initGatewayEngine(cfg);
  initGatewayOauth(cfg);
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
  onSettingsManifest((appId, fields, error) => registerSettingsManifest(cfg, appId, fields, error));
  onSecretsManifest((appId, slots, error) => registerSecretsManifest(cfg, appId, slots, error));
  onGatewaysManifest((appId, uses, error) => registerGatewaysManifest(cfg, appId, uses, error));
  onDbManifest((appId, snapshot, error) => applySchemaPush(cfg.dataDir, appId, snapshot, error));
  recoverInterruptedRuns();
  // Before any build runs or the watcher arms: apps removed while the runtime was
  // down never got their dropBuild, so their cache output would accumulate forever.
  pruneBuildCache(cfg);
  await buildDashboard(cfg); // never throws; failures surface as the fallback page
  const watcher = await startWatcher(cfg);
  // Loop intervals and retention are settings (spec §6): every() is last-wins by
  // name, so re-arming on a relevant write is a plain re-registration. Retention
  // inputs are resolved per sweep call, not at arm time.
  const armLoops = () => {
    every("kv-store-sweep", effectiveMs("kv.sweep_interval"), sweepAllAndBroadcast);
    every("file-store-sweep", effectiveMs("files.sweep_interval"), () => sweepFiles(cfg));
    every("log-sweep", effectiveMs("logs.sweep_interval"), () =>
      sweepLogStore({
        maxAgeMs: effectiveMs("logs.retention_age"),
        maxRows: effectiveNumber("logs.retention_max_rows"),
        appAges: new Map([...collectAppOverrides(cfg, "logs.retention_age")].map(([a, v]) => [a, parseDuration(v as string)])),
      })
    );
    every("event-sweep", effectiveMs("events.sweep_interval"), () =>
      sweepEventStore({
        maxAgeMs: effectiveMs("events.retention_age"),
        maxRows: effectiveNumber("events.retention_max_rows"),
        appAges: new Map([...collectAppOverrides(cfg, "events.retention_age")].map(([a, v]) => [a, parseDuration(v as string)])),
      })
    );
    every("tasks-dispatch", effectiveMs("tasks.dispatch_poll"), dispatchTasks);
    every("tasks-sweep", effectiveMs("tasks.sweep_interval"), sweepAllTaskRuns);
  };
  armLoops();
  onSettingsWrite((key) => {
    if (key.endsWith(".sweep_interval") || key === "tasks.dispatch_poll") armLoops();
  });
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
