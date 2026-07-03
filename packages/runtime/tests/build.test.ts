import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp, getBuildState } from "../src/build.js";
import type { Config } from "../src/config.js";

let root: string, cache: string, cfg: Config;

function cfgFor(root: string, cache: string): Config {
  return {
    root,
    appsDir: path.join(root, "apps"),
    dataDir: path.join(root, "data"),
    cacheDir: cache,
    port: 0,
    baseUrl: "http://lodekit.localhost:0",
  };
}

function writeApp(slug: string, appTsx: string) {
  const dir = path.join(root, "apps", slug, "src");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(root, "apps", slug, "manifest.json"),
    JSON.stringify({ name: slug, slug })
  );
  fs.writeFileSync(
    path.join(root, "apps", slug, "index.html"),
    `<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`
  );
  fs.writeFileSync(
    path.join(dir, "main.tsx"),
    `import { createRoot } from "react-dom/client";\nimport App from "./App";\ncreateRoot(document.getElementById("root")!).render(<App />);\n`
  );
  fs.writeFileSync(path.join(dir, "App.tsx"), appTsx);
}

function writeUiApp(slug: string) {
  const dir = path.join(root, "apps", slug, "src");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(root, "apps", slug, "manifest.json"),
    JSON.stringify({ name: slug, slug })
  );
  fs.writeFileSync(
    path.join(root, "apps", slug, "index.html"),
    `<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`
  );
  fs.writeFileSync(path.join(dir, "index.css"), `@import "@lodekit/ui/theme.css";\n`);
  fs.writeFileSync(
    path.join(dir, "main.tsx"),
    `import { createRoot } from "react-dom/client";\nimport "./index.css";\nimport App from "./App";\ncreateRoot(document.getElementById("root")!).render(<App />);\n`
  );
  fs.writeFileSync(
    path.join(dir, "App.tsx"),
    `import { Button, Card, CardContent } from "@lodekit/ui";\nimport { Plus } from "lucide-react";\nexport default function App() {\n  return <Card><CardContent><Button><Plus /> Add</Button></CardContent></Card>;\n}\n`
  );
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-root-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-cache-"));
  cfg = cfgFor(root, cache);
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
});

describe("buildApp", () => {
  it("builds a fixture app to cacheDir and marks it ready", async () => {
    writeApp("demo", `import { kv } from "@lodekit/sdk";\nexport default function App() { return <h1>demo {typeof kv}</h1>; }\n`);
    const state = await buildApp(cfg, "demo");
    expect(state).toEqual({ status: "ready" });
    expect(getBuildState("demo")).toEqual({ status: "ready" });
    const outDir = path.join(cache, "demo");
    expect(fs.existsSync(path.join(outDir, "index.html"))).toBe(true);
    const assets = fs.readdirSync(path.join(outDir, "assets"));
    expect(assets.some((f) => /\.js$/.test(f))).toBe(true);
  }, 30000);

  it("marks a broken app as error without throwing", async () => {
    writeApp("broken", `export default function App() { return <h1>oops</h1>  // missing brace\n`);
    const state = await buildApp(cfg, "broken");
    expect(state.status).toBe("error");
    if (state.status === "error") expect(state.message.length).toBeGreaterThan(0);
    expect(getBuildState("broken")?.status).toBe("error");
  }, 30000);

  it("serializes concurrent builds of the same slug without racing the outDir", async () => {
    writeApp("concurrent", `import { kv } from "@lodekit/sdk";\nexport default function App() { return <h1>c {typeof kv}</h1>; }\n`);
    const [a, b] = await Promise.all([buildApp(cfg, "concurrent"), buildApp(cfg, "concurrent")]);
    expect(a.status).toBe("ready");
    expect(b.status).toBe("ready");
    const outDir = path.join(cache, "concurrent");
    expect(fs.existsSync(path.join(outDir, "index.html"))).toBe(true);
    expect(fs.readdirSync(path.join(outDir, "assets")).some((f) => /\.js$/.test(f))).toBe(true);
  }, 30000);

  it("builds an app importing @lodekit/ui, lucide-react, and the theme", async () => {
    writeUiApp("themed");
    const state = await buildApp(cfg, "themed");
    expect(state).toEqual({ status: "ready" });
    const assets = fs.readdirSync(path.join(cache, "themed", "assets"));
    const cssFile = assets.find((f) => f.endsWith(".css"));
    expect(cssFile).toBeTruthy();
    const css = fs.readFileSync(path.join(cache, "themed", "assets", cssFile!), "utf8");
    expect(css).toContain("--primary");
    // inline-flex comes from Button's classes in @lodekit/ui source — proves @source scanning worked
    expect(css).toContain("inline-flex");
  }, 60000);
});
