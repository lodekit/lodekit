import fs from "node:fs";
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
import { initGatewayExecutor } from "./gatewayExecutor.js";
import { initGatewayOauth } from "./gatewayOauth.js";
import { registerGatewaysManifest } from "./services/gateways.js";
import { applySchemaPush } from "./services/db-store.js";
import { parseDuration } from "./duration.js";
import { createLogger } from "./logger.js";
import { initTaskExecutor, registerManifest, recoverInterruptedRuns, dispatchTasks } from "./taskExecutor.js";
import { sweepAllTaskRuns } from "./services/tasks.js";
import { resolveThemeCss, extractIconLibrary, getPreviewCss, warnLegacyThemeFiles } from "./services/themes.js";
import { markFaviconSvg, emojiFaviconSvg, isMarkStyle } from "@lodekit/ui/marks";

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

  const link = document.querySelector('link[href^="/_ui/theme.css"]');
  const icon = document.querySelector('link[rel="icon"]');
  const iconBase = icon ? icon.getAttribute("href") : null;
  const KEY = "lodekit-theme-preview";
  try { if (new URLSearchParams(location.search).has(KEY)) sessionStorage.setItem(KEY, "1"); } catch {}
  let preview = false;
  try { preview = sessionStorage.getItem(KEY) === "1"; } catch {}
  const baseQuery = preview ? "?preview=1" : (link ? new URL(link.href, location.origin).search : "");
  const themeHref = (bust) => "/_ui/theme.css" + baseQuery + (bust ? (baseQuery ? "&" : "?") + "v=" + bust : "");
  if (link && preview) link.href = themeHref();

  const sync = () => {
    fetch("/_ui/theme.json" + baseQuery).then((r) => r.json()).then((t) => {
      mode = t.theme; apply();
      if (t.iconLibrary) document.documentElement.setAttribute("data-icon-library", t.iconLibrary);
    }).catch(() => {});
  };
  sync();

  if (typeof EventSource !== "undefined") {
    const es = new EventSource("/api/events");
    es.addEventListener("event", (e) => {
      const d = JSON.parse(e.data);
      if (
        d.component === "settings" &&
        (d.type === "value-set" || d.type === "value-cleared") &&
        d.app === null &&
        d.payload?.key === "appearance.icon_style"
      ) {
        if (icon && iconBase) icon.href = iconBase + (iconBase.includes("?") ? "&" : "?") + "v=" + Date.now();
        return;
      }
      if (
        d.component === "settings" &&
        (d.type === "value-set" || d.type === "value-cleared") &&
        d.app === null &&
        d.payload?.key === "appearance.theme"
      ) { sync(); return; }
      if (d.component !== "themes" || d.type !== "theme-change") return;
      if (link) link.href = themeHref(Date.now());
      sync();
    });
  }
})();
`;

export function createApp(cfg: Config): Hono {
  // serveStatic (here and in appHost below) checks its root's existence at
  // construction time and logs to stderr when missing — pre-create the cache
  // dir so a fresh boot stays as silent as Express's static serving was.
  fs.mkdirSync(cfg.cacheDir, { recursive: true, mode: 0o700 });
  return new Hono()
    .onError((err, c) => {
      if (err instanceof HTTPException) return err.getResponse(); // e.g. bodyLimit's 413
      if (err instanceof SyntaxError) return c.json({ error: "invalid JSON body" }, 400);
      // Uncaught route errors surface as Express's 500-with-message did — never crash.
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    })
    .route("/api", apiRoutes(cfg))
    .get("/_ui", (c) => c.redirect("/_ui/", 301))
    // Serve-time theme delivery: the resolved whole theme for the target
    // (?app=<id>, absent → global; ?preview=1 → the in-memory draft), read per
    // request, never cached. Always 200 with usable CSS — blocking resource.
    .get("/_ui/theme.css", (c) => {
      c.header("Cache-Control", "no-store");
      c.header("Content-Type", "text/css; charset=utf-8");
      if (c.req.query("preview") === "1") {
        const draft = getPreviewCss();
        if (draft !== null) return c.body(draft);
      }
      const app = c.req.query("app");
      const appId = app !== undefined && isValidAppId(app) && scanApps(cfg.appsDir).some((a) => a.appId === app) ? app : undefined;
      return c.body(resolveThemeCss(cfg, appId));
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
      const preview = c.req.query("preview") === "1" ? getPreviewCss() : null;
      const app = c.req.query("app");
      const appId = app !== undefined && isValidAppId(app) ? app : undefined;
      const css = preview ?? resolveThemeCss(cfg, appId);
      return c.json({ theme: effectiveString("appearance.theme"), iconLibrary: extractIconLibrary(css) });
    })
    // Shell chrome data (app-shell spec §5): the app inventory + mark style the
    // @lodekit/ui AppShell fetches when its data props are absent. Chrome
    // namespace by decision — interim until a proper app-registry API exists
    // (TODO.md); the dashboard's own pages keep using /api.
    .get("/_ui/shell.json", (c) => {
      c.header("Cache-Control", "no-store");
      const style = effectiveString("appearance.icon_style");
      return c.json({
        // scanApps doesn't validate icon's type — omit anything but a
        // non-empty string so the client's 📦 fallback applies.
        apps: scanApps(cfg.appsDir).map(({ appId, name, icon }) => ({
          appId,
          name,
          ...(typeof icon === "string" && icon ? { icon } : {}),
        })),
        iconStyle: isMarkStyle(style) ? style : "b",
      });
    })
    // Favicons (spec: docs/specs/2026-07-17-per-app-favicon-design.md). All
    // serve-time and never cached, like theme delivery. /favicon.ico serves
    // SVG — browsers select by content-type, and it makes the mark the
    // origin-wide default for pages without an explicit icon link.
    .get("/favicon.svg", (c) => {
      c.header("Cache-Control", "no-store");
      c.header("Content-Type", "image/svg+xml");
      return c.body(markFaviconSvg(effectiveString("appearance.icon_style")));
    })
    .get("/favicon.ico", (c) => {
      c.header("Cache-Control", "no-store");
      c.header("Content-Type", "image/svg+xml");
      return c.body(markFaviconSvg(effectiveString("appearance.icon_style")));
    })
    // Per-app favicon: the manifest emoji (user-authored — emojiFaviconSvg
    // escapes it). Unknown app → the mark, same as everywhere else.
    .get("/_ui/favicon.svg", (c) => {
      c.header("Cache-Control", "no-store");
      c.header("Content-Type", "image/svg+xml");
      const app = c.req.query("app");
      const manifest =
        app !== undefined && isValidAppId(app)
          ? scanApps(cfg.appsDir).find((a) => a.appId === app)
          : undefined;
      return c.body(
        manifest
          // scanApps doesn't validate icon's type — guard so a malformed
          // manifest (non-string, empty) gets 📦 instead of a 500.
          ? emojiFaviconSvg(typeof manifest.icon === "string" && manifest.icon ? manifest.icon : "📦")
          : markFaviconSvg(effectiveString("appearance.icon_style"))
      );
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

const LOOPBACK_HOSTS = ["127.0.0.1", "::1", "localhost"];

// Best-effort single listener sharing an app (exported for tests). Any bind error
// (port taken, EACCES) resolves null — a convenience URL is never a boot blocker.
// An undefined host binds the wildcard; loopbackOnly then destroys any
// non-loopback peer's socket on accept, before HTTP ever parses a byte, so the
// served surface stays loopback even on a wildcard bind. The guard attaches
// before listen() — no window where an unguarded socket is reachable.
export function tryListen(
  app: Hono,
  host: string | undefined,
  port: number,
  loopbackOnly = false
): Promise<Server | null> {
  return new Promise((resolve) => {
    const s = createAdaptorServer({ fetch: app.fetch }) as Server;
    if (loopbackOnly) {
      s.on("connection", (sock) => {
        const a = sock.remoteAddress;
        if (a !== "127.0.0.1" && a !== "::1" && a !== "::ffff:127.0.0.1") sock.destroy();
      });
    }
    s.once("error", () => resolve(null));
    s.listen(port, host, () => resolve(s));
  });
}

export async function start(cfg: Config): Promise<Server> {
  initLogStore(cfg.stateDir);
  initSettingsStore(cfg.dataDir);
  initSecretStore(cfg);
  initGatewaysStore(cfg);
  initGatewayManifests(cfg);
  initGatewayExecutor(cfg);
  initGatewayOauth(cfg);
  if (!initEventStore(cfg.dataDir)) {
    createLogger("event-store").error("events.sqlite unavailable — event bus degrades to live-only");
  }
  const app = createApp(cfg);
  const server = createAdaptorServer({ fetch: app.fetch }) as Server;
  // Loopback unless LODEKIT_HOST says otherwise (issue #87); an absent host fails
  // closed to loopback. The escape hatch works, but never silently.
  const host = cfg.host ?? "127.0.0.1";
  if (!LOOPBACK_HOSTS.includes(host)) {
    createLogger("host").warn(
      `LODEKIT_HOST=${host} binds beyond loopback — the HTTP API is unauthenticated; anything that can reach this machine gets full read/write access to app data`
    );
  }
  server.listen(cfg.port, host, () => {
    console.log(`Lodekit running at ${cfg.baseUrl}`);
    createLogger("host").info(`listening on ${cfg.baseUrl}`, { port: cfg.port, host });
  });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  // Port-free URL (#87 follow-on): http://lodekit.localhost/ needs no :7777 when 80
  // is bindable. Loopback only — never attempted when LODEKIT_HOST widened the bind —
  // skipped silently when taken, and LODEKIT_PORT_FREE=0 opts out entirely (port 80
  // is popular; other local tools may want it). macOS quirk (verified on Darwin 25):
  // Mojave's unprivileged low-port exemption covers only the wildcard address —
  // 127.0.0.1:80 gets EACCES — so after the kernel loopback bind fails, fall back to
  // a wildcard bind whose non-loopback peers are destroyed pre-HTTP (loopbackOnly).
  let convenience: Server | null = null;
  if (cfg.portFree !== false && LOOPBACK_HOSTS.includes(host) && cfg.port !== 0 && cfg.port !== 80) {
    convenience = await tryListen(app, "127.0.0.1", 80);
    const mode = convenience ? "kernel-loopback" : "guarded-wildcard";
    convenience ??= await tryListen(app, undefined, 80, true);
    if (convenience) {
      console.log(`Also at http://lodekit.localhost/`);
      createLogger("host").info("port-80 convenience listener up", { mode });
    }
  }
  const addr = server.address();
  configureWorkers(`http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : cfg.port}`);
  initTaskExecutor(cfg);
  onTasksManifest(registerManifest);
  onSettingsManifest((appId, fields, error) => registerSettingsManifest(cfg, appId, fields, error));
  onSecretsManifest((appId, slots, error) => registerSecretsManifest(cfg, appId, slots, error));
  onGatewaysManifest((appId, uses, error) => registerGatewaysManifest(cfg, appId, uses, error));
  onDbManifest((appId, snapshot, error) => applySchemaPush(cfg.dataDir, appId, snapshot, error));
  recoverInterruptedRuns();
  // Before any build runs or the watcher arms: apps removed while the engine was
  // down never got their dropBuild, so their cache output would accumulate forever.
  pruneBuildCache(cfg);
  await buildDashboard(cfg); // never throws; failures surface as the fallback page
  warnLegacyThemeFiles(cfg);
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
    convenience?.close();
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
