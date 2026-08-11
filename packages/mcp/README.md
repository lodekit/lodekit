# @lodekit/mcp

The MCP server: the agent-facing surface of Lodekit. It reaches the engine over
HTTP only (default `http://lodekit.localhost:7777`; override with
`LODEKIT_BASE_URL`) and is buildless — it runs from source via `tsx`.

Run the engine first (`pnpm dev` from the repo root), then register the server
with your agent. Claude Code:

    claude mcp add lodekit -- npx tsx /ABSOLUTE/PATH/TO/lodekit/packages/mcp/index.ts

Tools: drive the platform with `lodekit_scaffold`, `lodekit_list_apps`, and
`lodekit_open_app`; read an app's services with `lodekit_db_schema`,
`lodekit_db_query`, `lodekit_kv_get`, `lodekit_kv_list`, `lodekit_files_list`,
`lodekit_files_stat`, `lodekit_settings_list`, `lodekit_settings_get`,
`lodekit_secrets_list`, `lodekit_gateways`, `lodekit_logs`, and
`lodekit_events`.

For registering against the packaged `Lodekit.app` (stable in-app paths), see
`manager/README.md`.
