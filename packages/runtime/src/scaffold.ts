import fs from "node:fs";
import path from "node:path";
import type { Config } from "./config.js";

export interface ScaffoldInput {
  slug: string;
  name: string;
  description?: string;
  icon?: string;
}

const indexHtml = (name: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name}</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
`;

const mainTsx = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
`;

const appTsx = (name: string) => `import { db, store } from "@lodekit/sdk";

export default function App() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">${name}</h1>
      <p className="text-gray-500">Edit src/App.tsx to build this tool.</p>
    </main>
  );
}
`;

const indexCss = `@import "tailwindcss";
`;

function writeIfAbsent(filePath: string, contents: string): void {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, contents);
}

export function scaffoldApp(cfg: Config, input: ScaffoldInput) {
  const appDir = path.join(cfg.appsDir, input.slug);
  const srcDir = path.join(appDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  const manifest = {
    name: input.name,
    slug: input.slug,
    icon: input.icon ?? "📦",
    description: input.description ?? "",
  };
  fs.writeFileSync(path.join(appDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  writeIfAbsent(path.join(appDir, "index.html"), indexHtml(manifest.name));
  writeIfAbsent(path.join(srcDir, "main.tsx"), mainTsx);
  writeIfAbsent(path.join(srcDir, "App.tsx"), appTsx(manifest.name));
  writeIfAbsent(path.join(srcDir, "index.css"), indexCss);
  return {
    slug: input.slug,
    appDir,
    url: `${cfg.baseUrl}/${input.slug}`,
    files: ["manifest.json", "index.html", "src/main.tsx", "src/App.tsx", "src/index.css"],
  };
}
