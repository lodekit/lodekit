import fs from "node:fs";
import path from "node:path";
import type { RequestHandler } from "express";
import { isValidSlug } from "./registry.js";

const INJECT =
  '\n<link rel="stylesheet" href="/_lodekit/design-system.css">' +
  '\n<script src="/_lodekit/sdk.js"></script>\n';

export function appHost(appsDir: string): RequestHandler {
  return (req, res, next) => {
    const segments = req.path.split("/").filter(Boolean);
    const slug = segments[0];
    if (!slug || !isValidSlug(slug)) return next();
    const appDir = path.resolve(appsDir, slug);
    if (!fs.existsSync(path.join(appDir, "manifest.json"))) return next();

    // Redirect /<slug> -> /<slug>/ so the app's relative asset URLs (e.g. app.js)
    // resolve under the app rather than the server root.
    if (segments.length === 1 && !req.path.endsWith("/")) {
      res.redirect(301, req.path + "/");
      return;
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(req.path);
    } catch (e) {
      if (e instanceof URIError) { res.status(400).end(); return; }
      throw e;
    }
    const decodedSegments = decoded.split("/").filter(Boolean);
    const rest = decodedSegments.slice(1).join("/") || "index.html";
    const filePath = path.resolve(appDir, rest);
    if (filePath !== appDir && !filePath.startsWith(appDir + path.sep)) {
      res.status(403).end();
      return;
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.status(404).end();
      return;
    }
    if (filePath.endsWith("index.html")) {
      const raw = fs.readFileSync(filePath, "utf8");
      const html = raw.includes("</head>")
        ? raw.replace("</head>", INJECT + "</head>")
        : INJECT + raw;
      res.type("html").send(html);
      return;
    }
    res.sendFile(filePath);
  };
}
