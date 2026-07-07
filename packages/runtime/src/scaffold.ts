import fs from "node:fs";
import path from "node:path";
import type { Config } from "./config.js";

export interface ScaffoldInput {
  appId: string;
  name: string;
  description?: string;
  icon?: string;
}

const routerTsx = `import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({ routeTree });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
`;

const rootTsx = (name: string) => `import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: "${name}" }],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: () => (
    <html lang="en">
      <head>
        <HeadContent />
        {/* Theme before hydration — no dark-mode flash. Served by the runtime
            from the effective appearance.theme setting; system mode keeps the
            OS media query (settings spec §8). */}
        <script src="/_ui/theme.js" />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
`;

const indexTsx = (name: string) => `import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { useState } from "react";
import { kv } from "@lodekit/sdk";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@lodekit/ui";

const getCount = createServerFn().handler(async () => (await kv.get<number>("count")) ?? 0);

const setCount = createServerFn()
  .inputValidator(z.object({ count: z.number().int().min(0) }))
  .handler(async ({ data }) => {
    await kv.set("count", data.count);
    return data.count;
  });

export const Route = createFileRoute("/")({
  loader: () => getCount(),
  component: Home,
});

function Home() {
  const initial = Route.useLoaderData();
  const [count, setCountState] = useState(initial);

  async function increment() {
    const next = await setCount({ data: { count: count + 1 } });
    setCountState(next);
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Card>
        <CardHeader>
          <CardTitle>${name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-muted-foreground">Edit src/routes/index.tsx to build this app.</p>
          <Button onClick={increment}>Get started ({count})</Button>
        </CardContent>
      </Card>
    </main>
  );
}
`;

const stylesCss = `@import "@lodekit/ui/theme.css";
`;

function writeIfAbsent(filePath: string, contents: string): void {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, contents);
}

export function scaffoldApp(cfg: Config, input: ScaffoldInput) {
  const appDir = path.join(cfg.appsDir, input.appId);
  const srcDir = path.join(appDir, "src");
  const routesDir = path.join(srcDir, "routes");
  fs.mkdirSync(routesDir, { recursive: true });
  const manifest = {
    name: input.name,
    appId: input.appId,
    icon: input.icon ?? "📦",
    description: input.description ?? "",
  };
  fs.writeFileSync(path.join(appDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  writeIfAbsent(path.join(srcDir, "router.tsx"), routerTsx);
  writeIfAbsent(path.join(routesDir, "__root.tsx"), rootTsx(manifest.name));
  writeIfAbsent(path.join(routesDir, "index.tsx"), indexTsx(manifest.name));
  writeIfAbsent(path.join(srcDir, "styles.css"), stylesCss);
  return {
    appId: input.appId,
    appDir,
    url: `${cfg.baseUrl}/${input.appId}`,
    files: [
      "manifest.json",
      "src/router.tsx",
      "src/routes/__root.tsx",
      "src/routes/index.tsx",
      "src/styles.css",
    ],
  };
}
