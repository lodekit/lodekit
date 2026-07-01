import fs from "node:fs";
import path from "node:path";
import type { RequestHandler } from "express";
import type { Config } from "./config.js";
import { isValidSlug } from "./registry.js";
import { getBuildState } from "./build.js";

const page = (title: string, body: string, sse: boolean) => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:640px;margin:15vh auto;padding:0 24px;color:#0a0a0a}.muted{color:#6b7280}pre{white-space:pre-wrap;background:#f4f4f5;padding:16px;border-radius:10px;overflow:auto}</style>
</head>
<body>${body}${sse ? `<script>new EventSource("/api/events").addEventListener("ready",(e)=>{try{if(JSON.parse(e.data).slug===${JSON.stringify(title)})location.reload()}catch{}})</script>` : ""}</body>
</html>
`;

const buildingPage = (slug: string) =>
  page(slug, `<h1>Building…</h1><p class="muted">${slug} is compiling. This page reloads when it's ready.</p>`, true);

const errorPage = (slug: string, message: string) =>
  page(slug, `<h1>Build failed</h1><p class="muted">${slug} could not be built.</p><pre>${message.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!))}</pre>`, true);

export function appHost(cfg: Config): RequestHandler {
  return (req, res, next) => {
    const segments = req.path.split("/").filter(Boolean);
    const slug = segments[0];
    if (!slug || !isValidSlug(slug)) return next();
    if (!fs.existsSync(path.join(cfg.appsDir, slug, "manifest.json"))) return next();

    // Redirect /<slug> -> /<slug>/ so the app's relative asset URLs resolve under the app.
    if (segments.length === 1 && !req.path.endsWith("/")) {
      res.redirect(301, req.path + "/");
      return;
    }

    const state = getBuildState(slug);
    if (state?.status === "error") {
      res.status(200).type("html").send(errorPage(slug, state.message));
      return;
    }

    const outDir = path.resolve(cfg.cacheDir, slug);
    if (!fs.existsSync(path.join(outDir, "index.html"))) {
      res.status(200).type("html").send(buildingPage(slug));
      return;
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(req.path);
    } catch (e) {
      if (e instanceof URIError) { res.status(400).end(); return; }
      throw e;
    }
    const rest = decoded.split("/").filter(Boolean).slice(1).join("/") || "index.html";
    const filePath = path.resolve(outDir, rest);
    if (filePath !== outDir && !filePath.startsWith(outDir + path.sep)) {
      res.status(403).end();
      return;
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.status(404).end();
      return;
    }
    res.sendFile(filePath);
  };
}
