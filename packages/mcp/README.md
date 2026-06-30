# Lodekit MCP

Start the Lodekit server first (`npm start`), then register this MCP server with Claude Code:

    claude mcp add lodekit -- npx tsx /ABSOLUTE/PATH/TO/lodekit/mcp/index.ts

Tools: `lodekit_scaffold`, `lodekit_list_apps`, `lodekit_open_app`, `lodekit_inspect_db`.
Override the server URL with `LODEKIT_BASE_URL` (default `http://lodekit.localhost:7777`).
