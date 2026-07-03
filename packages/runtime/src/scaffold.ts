import fs from "node:fs";
import path from "node:path";
import type { Config } from "./config.js";

export interface ScaffoldInput {
  appId: string;
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

const appTsx = (name: string) => `import { useEffect, useState } from "react";
import { kv } from "@lodekit/sdk";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@lodekit/ui";

export default function App() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    void kv.get<number>("count").then((v) => setCount(v ?? 0));
  }, []);

  async function increment() {
    const next = count + 1;
    setCount(next);
    await kv.set("count", next);
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Card>
        <CardHeader>
          <CardTitle>${name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-muted-foreground">Edit src/App.tsx to build this app.</p>
          <Button onClick={increment}>Get started ({count})</Button>
        </CardContent>
      </Card>
    </main>
  );
}
`;

const indexCss = `@import "@lodekit/ui/theme.css";
`;

function writeIfAbsent(filePath: string, contents: string): void {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, contents);
}

export function scaffoldApp(cfg: Config, input: ScaffoldInput) {
  const appDir = path.join(cfg.appsDir, input.appId);
  const srcDir = path.join(appDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  const manifest = {
    name: input.name,
    appId: input.appId,
    icon: input.icon ?? "📦",
    description: input.description ?? "",
  };
  fs.writeFileSync(path.join(appDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  writeIfAbsent(path.join(appDir, "index.html"), indexHtml(manifest.name));
  writeIfAbsent(path.join(srcDir, "main.tsx"), mainTsx);
  writeIfAbsent(path.join(srcDir, "App.tsx"), appTsx(manifest.name));
  writeIfAbsent(path.join(srcDir, "index.css"), indexCss);
  return {
    appId: input.appId,
    appDir,
    url: `${cfg.baseUrl}/${input.appId}`,
    files: ["manifest.json", "index.html", "src/main.tsx", "src/App.tsx", "src/index.css"],
  };
}
