import { spawn } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { scaffold, listApps, fetchLogs, fetchEvents, fetchSettings, fetchSecrets } from "./client.js";
import { createClient } from "@lodekit/sdk";

const BASE = process.env.LODEKIT_BASE_URL ?? "http://lodekit.localhost:7777";

function openInBrowser(url: string) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
}

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const server = new McpServer({ name: "lodekit", version: pkg.version });

server.tool(
  "lodekit_scaffold",
  { appId: z.string(), name: z.string(), description: z.string().optional(), icon: z.string().optional() },
  async (args) => text(await scaffold(BASE, args))
);

server.tool("lodekit_list_apps", {}, async () => text(await listApps(BASE)));

server.tool("lodekit_open_app", { appId: z.string() }, async ({ appId }) => {
  const url = `${BASE}/${appId}`;
  openInBrowser(url);
  return text({ opened: url });
});

server.tool(
  "lodekit_logs",
  {
    appId: z.string().optional().describe('filter to one app, or "_platform" for the runtime\'s own records; omit for everything'),
    level: z.enum(["debug", "info", "warn", "error"]).optional().describe("minimum level"),
    limit: z.number().optional(),
    q: z.string().optional().describe("substring match on the message"),
  },
  async (args) => text(await fetchLogs(BASE, args))
);

server.tool(
  "lodekit_events",
  {
    appId: z.string().optional().describe('filter to one namespace — an app id, or "_platform" for the runtime; omit for everything'),
    type: z.string().optional().describe('event type, e.g. "kv-store-change" or an app-defined type'),
    after: z.number().optional().describe("replay ascending from this event id (offset); omit for newest-first"),
    limit: z.number().optional(),
  },
  async (args) => text(await fetchEvents(BASE, args))
);

server.tool(
  "lodekit_kv_list",
  { appId: z.string(), prefix: z.string().optional() },
  async ({ appId, prefix }) =>
    text(await createClient({ baseUrl: BASE, appId }).kv.list({ prefix }))
);

server.tool(
  "lodekit_kv_get",
  { appId: z.string(), key: z.string() },
  async ({ appId, key }) => {
    const value = await createClient({ baseUrl: BASE, appId }).kv.get(key);
    return text(value === undefined ? { found: false } : { found: true, value });
  }
);

server.tool(
  "lodekit_settings_list",
  { appId: z.string().optional() },
  async ({ appId }) => text(await fetchSettings(BASE, appId))
);

server.tool(
  "lodekit_settings_get",
  { appId: z.string(), key: z.string() },
  async ({ appId, key }) => {
    const value = await createClient({ baseUrl: BASE, appId }).settings.get(key);
    return text(value === undefined ? { found: false } : { found: true, value });
  }
);

// Existence and wiring only (spec §10): the catalog's slugs/labels/links, or an
// app's slots with link status. No value-read tool exists — values never reach
// the agent; the person enters and links them in the dashboard.
server.tool(
  "lodekit_secrets_list",
  { appId: z.string().optional().describe("an app's declared slots + link status; omit for the person's secret catalog") },
  async ({ appId }) => text(await fetchSecrets(BASE, appId))
);

server.tool(
  "lodekit_files_list",
  { appId: z.string(), prefix: z.string().optional() },
  async ({ appId, prefix }) =>
    text(await createClient({ baseUrl: BASE, appId }).files.list({ prefix }))
);

server.tool(
  "lodekit_files_stat",
  { appId: z.string(), slug: z.string() },
  async ({ appId, slug }) => {
    const stat = await createClient({ baseUrl: BASE, appId }).files.stat(slug);
    return text(stat === undefined ? { found: false } : { found: true, ...stat });
  }
);

// Only connect stdio when run directly (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
