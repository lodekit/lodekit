import { spawn } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { scaffold, listApps, fetchLogs, fetchEvents, fetchSettings, fetchSecrets, fetchDbSchema, selectDb, fetchGateways } from "./client.js";
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
export const server = new McpServer({ name: "lodekit", version: pkg.version });

server.registerTool(
  "lodekit_scaffold",
  { inputSchema: { appId: z.string(), name: z.string(), description: z.string().optional(), icon: z.string().optional() } },
  async (args) => text(await scaffold(BASE, args))
);

server.registerTool("lodekit_list_apps", {}, async () => text(await listApps(BASE)));

server.registerTool("lodekit_open_app", { inputSchema: { appId: z.string() } }, async ({ appId }) => {
  const url = `${BASE}/${appId}`;
  openInBrowser(url);
  return text({ opened: url });
});

server.registerTool(
  "lodekit_logs",
  {
    inputSchema: {
      appId: z.string().optional().describe('filter to one app, or "_platform" for the runtime\'s own records; omit for everything'),
      level: z.enum(["debug", "info", "warn", "error"]).optional().describe("minimum level"),
      limit: z.number().optional(),
      q: z.string().optional().describe("substring match on the message"),
    },
  },
  async (args) => text(await fetchLogs(BASE, args))
);

server.registerTool(
  "lodekit_events",
  {
    inputSchema: {
      app: z.string().optional().describe("filter to one app's stream (an app id); omit for everything"),
      kind: z.enum(["engine", "service", "app"]).optional().describe("class of emitter: the engine, a catalog service, or an app"),
      component: z.string().optional().describe('emitting component, e.g. "kv-store", "build", or an app id'),
      type: z.string().optional().describe('event type — a past-tense fact, e.g. "key-set", or an app-defined type'),
      since: z.number().optional().describe("epoch ms lower bound on the event timestamp"),
      after: z.number().optional().describe("replay ascending from this event id (offset); omit for newest-first"),
      limit: z.number().optional(),
    },
  },
  async (args) => text(await fetchEvents(BASE, args))
);

server.registerTool(
  "lodekit_kv_list",
  { inputSchema: { appId: z.string(), prefix: z.string().optional() } },
  async ({ appId, prefix }) =>
    text(await createClient({ baseUrl: BASE, appId }).kv.list({ prefix }))
);

server.registerTool(
  "lodekit_kv_get",
  { inputSchema: { appId: z.string(), key: z.string() } },
  async ({ appId, key }) => {
    const value = await createClient({ baseUrl: BASE, appId }).kv.get(key);
    return text(value === undefined ? { found: false } : { found: true, value });
  }
);

server.registerTool(
  "lodekit_db_schema",
  { inputSchema: { appId: z.string().describe("the app whose declared tables to inspect") } },
  async ({ appId }) => text(await fetchDbSchema(BASE, appId))
);

server.registerTool(
  "lodekit_db_query",
  {
    inputSchema: {
      appId: z.string(),
      sql: z.string().describe("a single SELECT statement over the app's tables (read-only connection; _-prefixed tables are hidden)"),
      params: z.array(z.union([z.string(), z.number(), z.null()])).optional(),
    },
  },
  async ({ appId, sql, params }) => text(await selectDb(BASE, appId, sql, params))
);

server.registerTool(
  "lodekit_settings_list",
  { inputSchema: { appId: z.string().optional() } },
  async ({ appId }) => text(await fetchSettings(BASE, appId))
);

server.registerTool(
  "lodekit_settings_get",
  { inputSchema: { appId: z.string(), key: z.string() } },
  async ({ appId, key }) => {
    const value = await createClient({ baseUrl: BASE, appId }).settings.get(key);
    return text(value === undefined ? { found: false } : { found: true, value });
  }
);

// Existence and wiring only (spec §10): the catalog's slugs/labels/links, or an
// app's slots with link status. No value-read tool exists — values never reach
// the agent; the person enters and links them in the dashboard.
server.registerTool(
  "lodekit_secrets_list",
  { inputSchema: { appId: z.string().optional().describe("an app's declared slots + link status; omit for the person's secret catalog") } },
  async ({ appId }) => text(await fetchSecrets(BASE, appId))
);

// The agent's "do we already have a gateway for this provider?" answer
// (spec §13): gateways with their slots and usage, or an app's connections
// with per-slot status. Wiring and status only — credentials and tokens
// never appear; the person links and connects in the dashboard.
server.registerTool(
  "lodekit_gateways",
  { inputSchema: { appId: z.string().optional().describe("an app's gateway connections + slot status; omit for every gateway and its usage") } },
  async ({ appId }) => text(await fetchGateways(BASE, appId))
);

server.registerTool(
  "lodekit_files_list",
  { inputSchema: { appId: z.string(), prefix: z.string().optional() } },
  async ({ appId, prefix }) =>
    text(await createClient({ baseUrl: BASE, appId }).files.list({ prefix }))
);

server.registerTool(
  "lodekit_files_stat",
  { inputSchema: { appId: z.string(), slug: z.string() } },
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
