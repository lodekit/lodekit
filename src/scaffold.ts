import fs from "node:fs";
import path from "node:path";
import type { Config } from "./config.js";

export interface ScaffoldInput {
  slug: string;
  name: string;
  description?: string;
  icon?: string;
}

const stubHtml = (name: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name}</title>
</head>
<body>
  <main class="lk-container">
    <h1 class="lk-h1">${name}</h1>
    <p class="lk-muted">Edit app.js to build this tool.</p>
  </main>
  <script src="app.js"></script>
</body>
</html>
`;

const stubJs = `// window.lodekit: db.query(sql,params), db.exec(sql,params), store.get(key), store.set(key,value)
console.log("Lodekit app ready", window.lodekit);
`;

export function scaffoldApp(cfg: Config, input: ScaffoldInput) {
  const appDir = path.join(cfg.appsDir, input.slug);
  fs.mkdirSync(appDir, { recursive: true });
  const manifest = {
    name: input.name,
    slug: input.slug,
    icon: input.icon ?? "📦",
    description: input.description ?? "",
  };
  fs.writeFileSync(path.join(appDir, "lodekit.json"), JSON.stringify(manifest, null, 2) + "\n");
  const indexPath = path.join(appDir, "index.html");
  if (!fs.existsSync(indexPath)) fs.writeFileSync(indexPath, stubHtml(manifest.name));
  const jsPath = path.join(appDir, "app.js");
  if (!fs.existsSync(jsPath)) fs.writeFileSync(jsPath, stubJs);
  return {
    slug: input.slug,
    appDir,
    url: `${cfg.baseUrl}/${input.slug}`,
    files: ["lodekit.json", "index.html", "app.js"],
  };
}
