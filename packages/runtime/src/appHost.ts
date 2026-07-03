import fs from "node:fs";
import path from "node:path";
import type { MiddlewareHandler } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Config } from "./config.js";
import { isValidAppId } from "./registry.js";
import { getBuildState } from "./build.js";

const page = (title: string, body: string, sse: boolean) => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:640px;margin:15vh auto;padding:0 24px;color:#0a0a0a}.muted{color:#6b7280}pre{white-space:pre-wrap;background:#f4f4f5;padding:16px;border-radius:10px;overflow:auto}</style>
</head>
<body>${body}${sse ? `<script>const es=new EventSource("/api/events");const r=(e)=>{try{if(JSON.parse(e.data).appId===${JSON.stringify(title)})location.reload()}catch{}};es.addEventListener("ready",r);es.addEventListener("error",r);</script>` : ""}</body>
</html>
`;

const buildingPage = (appId: string) =>
  page(appId, `<h1>Building…</h1><p class="muted">${appId} is compiling. This page reloads when it's ready.</p>`, true);

const errorPage = (appId: string, message: string) =>
  page(appId, `<h1>Build failed</h1><p class="muted">${appId} could not be built.</p><pre>${message.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!))}</pre>`, true);

export function appHost(cfg: Config): MiddlewareHandler {
  // serveStatic's root accepts an absolute path in the installed v2 (path.join
  // handles it directly); the URL path (/<app-id>/<rest>) mirrors the cache
  // layout, so no path rewrite is needed.
  const staticHandler = serveStatic({ root: cfg.cacheDir });
  return async (c, next) => {
    // Raw (still percent-encoded) pathname — the decode/containment checks below
    // must see the encoded form, exactly as Express's req.path did.
    const reqPath = new URL(c.req.url).pathname;
    const segments = reqPath.split("/").filter(Boolean);
    const appId = segments[0];
    if (!appId || !isValidAppId(appId)) return next();
    if (!fs.existsSync(path.join(cfg.appsDir, appId, "manifest.json"))) return next();

    // Redirect /<app-id> -> /<app-id>/ so the app's relative asset URLs resolve under the app.
    if (segments.length === 1 && !reqPath.endsWith("/")) {
      return c.redirect(reqPath + "/", 301);
    }

    const state = getBuildState(appId);
    if (state?.status === "error") return c.html(errorPage(appId, state.message));

    const outDir = path.resolve(cfg.cacheDir, appId);
    if (!fs.existsSync(path.join(outDir, "index.html"))) return c.html(buildingPage(appId));

    let decoded: string;
    try {
      decoded = decodeURIComponent(reqPath);
    } catch (e) {
      if (e instanceof URIError) return c.body(null, 400);
      throw e;
    }
    const rest = decoded.split("/").filter(Boolean).slice(1).join("/") || "index.html";
    const filePath = path.resolve(outDir, rest);
    if (filePath !== outDir && !filePath.startsWith(outDir + path.sep)) {
      return c.body(null, 403);
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return c.body(null, 404);
    }
    return staticHandler(c, next);
  };
}
