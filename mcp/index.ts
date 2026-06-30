import { spawn } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = process.env.LODEKIT_BASE_URL ?? "http://lodekit.localhost:7777";

export async function scaffold(
  base: string,
  input: { slug: string; name: string; description?: string; icon?: string }
) {
  const r = await fetch(base + "/api/apps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`scaffold failed: ${r.status}`);
  return r.json();
}

export async function listApps(base: string) {
  const r = await fetch(base + "/api/apps");
  return r.json();
}

export async function inspectDb(base: string, slug: string) {
  const r = await fetch(`${base}/api/apps/${slug}/db/schema`);
  if (!r.ok) throw new Error(`inspect failed: ${r.status}`);
  return r.json();
}

function openInBrowser(url: string) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
}

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

const server = new McpServer({ name: "lodekit", version: "0.0.1" });

server.tool(
  "lodekit_scaffold",
  { slug: z.string(), name: z.string(), description: z.string().optional(), icon: z.string().optional() },
  async (args) => text(await scaffold(BASE, args))
);

server.tool("lodekit_list_apps", {}, async () => text(await listApps(BASE)));

server.tool("lodekit_open_app", { slug: z.string() }, async ({ slug }) => {
  const url = `${BASE}/${slug}`;
  openInBrowser(url);
  return text({ opened: url });
});

server.tool("lodekit_inspect_db", { slug: z.string() }, async ({ slug }) =>
  text(await inspectDb(BASE, slug))
);

// Only connect stdio when run directly (not when imported by tests).
if (process.argv[1] && process.argv[1].endsWith("index.ts")) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
