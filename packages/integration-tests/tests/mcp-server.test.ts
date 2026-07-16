import { describe, it, expect, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { server } from "@lodekit/mcp";

// Registration smoke for the MCP server itself (index.ts): the client helpers are
// exercised over HTTP in mcp.test.ts, but nothing there catches a tool falling out
// of the tools/list handshake — e.g. a bad registration call after an SDK migration.
const client = new Client({ name: "smoke", version: "0.0.0" });
afterAll(async () => {
  await client.close();
  await server.close();
});

describe("mcp server registration", () => {
  it("advertises every lodekit tool with an object input schema", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "lodekit_db_query",
      "lodekit_db_schema",
      "lodekit_events",
      "lodekit_files_list",
      "lodekit_files_stat",
      "lodekit_gateways",
      "lodekit_kv_get",
      "lodekit_kv_list",
      "lodekit_list_apps",
      "lodekit_logs",
      "lodekit_open_app",
      "lodekit_scaffold",
      "lodekit_secrets_list",
      "lodekit_settings_get",
      "lodekit_settings_list",
    ]);
    for (const tool of tools) expect(tool.inputSchema.type).toBe("object");

    // spot-check that a zod shape survived the trip into JSON Schema
    const kvGet = tools.find((t) => t.name === "lodekit_kv_get")!;
    expect(Object.keys(kvGet.inputSchema.properties ?? {}).sort()).toEqual(["appId", "key"]);
    expect(kvGet.inputSchema.required).toEqual(["appId", "key"]);
  });
});
