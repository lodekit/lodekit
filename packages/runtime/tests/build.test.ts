import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp, getBuildState, pruneBuildCache } from "../src/build.js";
import { stopAppWorker } from "../src/appWorker.js";
import type { Config } from "../src/config.js";

let root: string, cache: string, cfg: Config;

function cfgFor(root: string, cache: string): Config {
  return {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: cache,
    stateDir: path.join(root, ".state"),
    port: 0,
    baseUrl: "http://lodekit.localhost:0", secretsKeyProvider: "file",
    gatewaysDir: path.join(root, "gateways"),
  };
}

// Fixture-shaped Start app (see tests/fixtures/start-app): manifest + src/router.tsx +
// src/routes/{__root,index}.tsx — no HTML entry, routeTree.gen.ts generated at build time.
function writeStartApp(appId: string, indexRoute: string, opts?: { css?: boolean }) {
  const src = path.join(root, "apps", appId, "src");
  const routes = path.join(src, "routes");
  fs.mkdirSync(routes, { recursive: true });
  fs.writeFileSync(
    path.join(root, "apps", appId, "manifest.json"),
    JSON.stringify({ name: appId, appId })
  );
  fs.writeFileSync(
    path.join(src, "router.tsx"),
    `import { createRouter } from "@tanstack/react-router";\nimport { routeTree } from "./routeTree.gen";\n\nexport function getRouter() {\n  return createRouter({ routeTree });\n}\n\ndeclare module "@tanstack/react-router" {\n  interface Register {\n    router: ReturnType<typeof getRouter>;\n  }\n}\n`
  );
  if (opts?.css) {
    fs.writeFileSync(path.join(src, "index.css"), `@import "@lodekit/ui/theme.css";\n`);
    fs.writeFileSync(
      path.join(routes, "__root.tsx"),
      `import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";\nimport appCss from "../index.css?url";\n\nexport const Route = createRootRoute({\n  head: () => ({ meta: [{ title: "${appId}" }], links: [{ rel: "stylesheet", href: appCss }] }),\n  component: () => (\n    <html>\n      <head><HeadContent /></head>\n      <body><Outlet /><Scripts /></body>\n    </html>\n  ),\n});\n`
    );
  } else {
    fs.writeFileSync(
      path.join(routes, "__root.tsx"),
      `import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";\n\nexport const Route = createRootRoute({\n  head: () => ({ meta: [{ title: "${appId}" }] }),\n  component: () => (\n    <html>\n      <head><HeadContent /></head>\n      <body><Outlet /><Scripts /></body>\n    </html>\n  ),\n});\n`
    );
  }
  fs.writeFileSync(path.join(routes, "index.tsx"), indexRoute);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-root-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-cache-"));
  cfg = cfgFor(root, cache);
});
afterEach(() => {
  for (const appId of ["demo", "broken", "concurrent", "themed"]) stopAppWorker(appId);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
});

describe("buildApp", () => {
  it("builds a fixture Start app to cacheDir and marks it ready", async () => {
    writeStartApp(
      "demo",
      `import { createFileRoute } from "@tanstack/react-router";\nimport { kv } from "@lodekit/sdk";\nexport const Route = createFileRoute("/")({\n  component: () => <h1>demo {typeof kv}</h1>,\n});\n`
    );
    const state = await buildApp(cfg, "demo");
    expect(state).toEqual({ status: "ready" });
    expect(getBuildState("demo")).toEqual({ status: "ready" });
    const outDir = path.join(cache, "demo");
    expect(fs.existsSync(path.join(outDir, "server", "server.js"))).toBe(true);
    expect(fs.readdirSync(path.join(outDir, "client"), { recursive: true }).length).toBeGreaterThan(0);
  }, 60000);

  it("marks a broken app as error without throwing", async () => {
    writeStartApp(
      "broken",
      `import { createFileRoute } from "@tanstack/react-router";\nexport const Route = createFileRoute("/")({\n  component: () => <h1>oops</h1>  // missing brace\n`
    );
    const state = await buildApp(cfg, "broken");
    expect(state.status).toBe("error");
    if (state.status === "error") expect(state.message.length).toBeGreaterThan(0);
    expect(getBuildState("broken")?.status).toBe("error");
  }, 60000);

  it("serializes concurrent builds of the same app id without racing the outDir", async () => {
    writeStartApp(
      "concurrent",
      `import { createFileRoute } from "@tanstack/react-router";\nimport { kv } from "@lodekit/sdk";\nexport const Route = createFileRoute("/")({\n  component: () => <h1>c {typeof kv}</h1>,\n});\n`
    );
    const [a, b] = await Promise.all([buildApp(cfg, "concurrent"), buildApp(cfg, "concurrent")]);
    expect(a.status).toBe("ready");
    expect(b.status).toBe("ready");
    const outDir = path.join(cache, "concurrent");
    expect(fs.existsSync(path.join(outDir, "server", "server.js"))).toBe(true);
    expect(fs.readdirSync(path.join(outDir, "client"), { recursive: true }).length).toBeGreaterThan(0);
  }, 60000);

  it("builds an app importing @lodekit/ui, lucide-react, and the theme", async () => {
    writeStartApp(
      "themed",
      `import { createFileRoute } from "@tanstack/react-router";\nimport { Button, Card, CardContent } from "@lodekit/ui";\nimport { Plus } from "lucide-react";\nexport const Route = createFileRoute("/")({\n  component: () => <Card><CardContent><Button><Plus /> Add</Button></CardContent></Card>,\n});\n`,
      { css: true }
    );
    const state = await buildApp(cfg, "themed");
    expect(state).toEqual({ status: "ready" });
    const assets = fs.readdirSync(path.join(cache, "themed", "client", "assets"));
    const cssFile = assets.find((f) => f.endsWith(".css"));
    expect(cssFile).toBeTruthy();
    const css = fs.readFileSync(path.join(cache, "themed", "client", "assets", cssFile!), "utf8");
    expect(css).toContain("--primary");
    // inline-flex comes from Button's classes in @lodekit/ui source — proves @source scanning worked
    expect(css).toContain("inline-flex");
  }, 60000);

  it("applies a global theme override to an app build", async () => {
    fs.writeFileSync(path.join(root, "theme.css"), ":root { --primary: #ff3456; }\n");
    writeStartApp(
      "themed",
      `import { createFileRoute } from "@tanstack/react-router";\nimport { Button } from "@lodekit/ui";\nexport const Route = createFileRoute("/")({\n  component: () => <Button>hi</Button>,\n});\n`,
      { css: true }
    );
    const state = await buildApp(cfg, "themed");
    expect(state).toEqual({ status: "ready" });
    const assets = fs.readdirSync(path.join(cache, "themed", "client", "assets"));
    const cssFile = assets.find((f) => f.endsWith(".css"));
    const css = fs.readFileSync(path.join(cache, "themed", "client", "assets", cssFile!), "utf8");
    // hex chosen so minifiers can't shorten it (#ff3456 has no doubled-pair form)
    expect(css).toContain("ff3456");
  }, 60000);

  it("layers a per-app theme override after the global one", async () => {
    fs.writeFileSync(path.join(root, "theme.css"), ":root { --primary: #ff3456; }\n");
    writeStartApp(
      "themed",
      `import { createFileRoute } from "@tanstack/react-router";\nimport { Button } from "@lodekit/ui";\nexport const Route = createFileRoute("/")({\n  component: () => <Button>hi</Button>,\n});\n`,
      { css: true }
    );
    fs.writeFileSync(path.join(root, "apps", "themed", "theme.css"), ":root { --primary: #22cc78; }\n");
    const state = await buildApp(cfg, "themed");
    expect(state).toEqual({ status: "ready" });
    const assets = fs.readdirSync(path.join(cache, "themed", "client", "assets"));
    const cssFile = assets.find((f) => f.endsWith(".css"));
    const css = fs.readFileSync(path.join(cache, "themed", "client", "assets", cssFile!), "utf8");
    // the app value must be present; if the minifier kept both declarations, the
    // app's must come later (cascade order = later wins)
    expect(css).toContain("22cc78");
    const g = css.indexOf("ff3456");
    if (g !== -1) expect(css.indexOf("22cc78")).toBeGreaterThan(g);
  }, 60000);
});

describe("pruneBuildCache", () => {
  it("removes cache entries whose app folder no longer exists", () => {
    fs.mkdirSync(path.join(cache, "gone-app", "client"), { recursive: true });
    fs.writeFileSync(path.join(cache, "gone-app", "client", "index.html"), "<html></html>");
    pruneBuildCache(cfg);
    expect(fs.existsSync(path.join(cache, "gone-app"))).toBe(false);
  });

  it("keeps cache entries whose app folder still exists", () => {
    // Directory existence is the keep criterion — mirrors the watcher's unlinkDir
    // semantics, which drops a build only when the top-level folder goes away.
    fs.mkdirSync(path.join(root, "apps", "alive"), { recursive: true });
    fs.mkdirSync(path.join(cache, "alive"), { recursive: true });
    pruneBuildCache(cfg);
    expect(fs.existsSync(path.join(cache, "alive"))).toBe(true);
  });

  it("leaves entries outside the app id grammar alone", () => {
    fs.mkdirSync(path.join(cache, "_dashboard"), { recursive: true });
    pruneBuildCache(cfg);
    expect(fs.existsSync(path.join(cache, "_dashboard"))).toBe(true);
  });

  it("leaves stray files alone", () => {
    fs.writeFileSync(path.join(cache, "notes"), "not a build dir");
    pruneBuildCache(cfg);
    expect(fs.existsSync(path.join(cache, "notes"))).toBe(true);
  });

  it("prunes everything app-shaped when appsDir is missing", () => {
    fs.rmSync(path.join(root, "apps"), { recursive: true, force: true });
    fs.mkdirSync(path.join(cache, "orphan"), { recursive: true });
    pruneBuildCache(cfg);
    expect(fs.existsSync(path.join(cache, "orphan"))).toBe(false);
  });

  it("is a no-op when cacheDir is missing", () => {
    fs.rmSync(cache, { recursive: true, force: true });
    expect(() => pruneBuildCache(cfg)).not.toThrow();
  });
});
