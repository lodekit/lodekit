import fs from "node:fs";
import path from "node:path";
import type { MiddlewareHandler } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Config } from "./config.js";
import { isValidAppId } from "./registry.js";
import { getBuildState } from "./build.js";
import { forwardToWorker, getServerState } from "./appWorker.js";
import { emitLog } from "./logger.js";

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

const page = (title: string, body: string, sse: boolean) => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:640px;margin:15vh auto;padding:0 24px;color:#0a0a0a}.muted{color:#6b7280}pre{white-space:pre-wrap;background:#f4f4f5;padding:16px;border-radius:10px;overflow:auto}</style>
</head>
<body>${body}${sse ? `<script>const es=new EventSource("/api/events");es.addEventListener("event",(e)=>{try{const d=JSON.parse(e.data);if(d.ns===${JSON.stringify(title)}&&(d.type==="ready"||d.type==="error"||d.type==="server-state"))location.reload()}catch{}});</script>` : ""}</body>
</html>
`;

const buildingPage = (appId: string) =>
  page(appId, `<h1>Building…</h1><p class="muted">${appId} is compiling. This page reloads when it's ready.</p>`, true);
const buildErrorPage = (appId: string, message: string) =>
  page(appId, `<h1>Build failed</h1><p class="muted">${appId} could not be built.</p><pre>${esc(message)}</pre>`, true);
const serverErrorPage = (appId: string, message: string) =>
  page(appId, `<h1>App error</h1><p class="muted">${appId}'s server code failed.</p><pre>${esc(message)}</pre>`, true);

export function appHost(cfg: Config): MiddlewareHandler {
  // /<app-id>/_build/<rest> maps to cache/<app-id>/client/<rest> on disk.
  const staticHandler = serveStatic({
    root: cfg.cacheDir,
    rewriteRequestPath: (p) => p.replace(/^\/([a-z0-9-]+)\/_build\//, "/$1/client/"),
  });
  return async (c, next) => {
    const reqPath = new URL(c.req.url).pathname; // still percent-encoded
    const segments = reqPath.split("/").filter(Boolean);
    const appId = segments[0];
    if (!appId || !isValidAppId(appId)) return next();
    if (!fs.existsSync(path.join(cfg.appsDir, appId, "manifest.json"))) return next();

    if (segments.length === 1 && !reqPath.endsWith("/")) return c.redirect(reqPath + "/", 301);

    const state = getBuildState(appId);
    if (state?.status === "error") return c.html(buildErrorPage(appId, state.message));
    if (!state || state.status === "building") return c.html(buildingPage(appId));

    // Static client assets.
    if (segments[1] === "_build") {
      let decoded: string;
      try {
        decoded = decodeURIComponent(reqPath);
      } catch (e) {
        if (e instanceof URIError) return c.body(null, 400);
        throw e;
      }
      const clientDir = path.resolve(cfg.cacheDir, appId, "client");
      const rest = decoded.split("/").filter(Boolean).slice(2).join("/");
      const filePath = path.resolve(clientDir, rest);
      if (filePath !== clientDir && !filePath.startsWith(clientDir + path.sep)) return c.body(null, 403);
      return staticHandler(c, next);
    }

    // Soft same-origin guard: webhooks are explicitly unsupported (spec §5).
    if (segments[1] === "_serverFn" && c.req.header("sec-fetch-site") !== "same-origin") {
      return c.json({ error: "server functions are same-origin only" }, 403);
    }

    // Everything else — pages, _serverFn — is the app worker's.
    const started = Date.now();
    try {
      const res = await forwardToWorker(appId, c.req.raw);
      emitLog("debug", "host", `${c.req.method} ${reqPath} ${res.status}`, { status: res.status, duration_ms: Date.now() - started }, appId);
      return res;
    } catch (e) {
      const state = getServerState(appId);
      const message = state?.status === "error" ? state.message : e instanceof Error ? e.message : String(e);
      emitLog("error", "host", `${c.req.method} ${reqPath} failed`, { stack: message }, appId);
      return c.html(serverErrorPage(appId, message), 502);
    }
  };
}
