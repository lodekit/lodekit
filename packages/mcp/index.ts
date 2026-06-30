import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { scaffold, listApps, inspectDb } from "./client.js";

const BASE = process.env.LODEKIT_BASE_URL ?? "http://lodekit.localhost:7777";

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
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
