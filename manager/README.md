# @lodekit/manager

The manager: the thin menubar app that ships and supervises the platform. Packaged, it is
THE Lodekit download — `Lodekit.app` carries a pinned Lodekit-local Node and the platform
payload (engine, MCP server, skill) in its `Resources/`, and touches nothing on the
person's system (no system Node, no PATH). Spec:
`docs/specs/2026-07-02-manager-v0.1-design.md`.

## Commands

- `pnpm --filter @lodekit/manager start` — dev mode: menubar app supervising the workspace
  engine against `root/` (system Node).
- `pnpm --filter @lodekit/manager test` — vitest suite (supervisor, paths, logs).
- `pnpm --filter @lodekit/manager make` — build the payload + fetch the pinned Node
  (`scripts/prepare-bundle.mjs`, one-place version pin), then package the ad-hoc-signed
  arm64 `Lodekit.app` (zip under `out/make/`).
- **Gotcha:** always run `pnpm install` from the repo root, never from `manager/` — this
  package's `.npmrc` (`node-linker=hoisted`, required by Forge's dev-start check) would
  otherwise rewrite the whole workspace's node_modules layout and break engine builds.

## Installing the alpha (assisted)

1. Unzip and move `Lodekit.app` to `/Applications`.
2. First launch: right-click → Open (the alpha is ad-hoc signed, not notarized).
3. The "⬡" menubar item supervises the engine; the dashboard lives in your browser.
   Your apps and data live in `~/Documents/Lodekit` — that folder is the backup.
4. Logs: `~/Library/Logs/Lodekit/` (also reachable via the menu).

## Registering the MCP server with your agent (manual at v0.1)

Stable paths inside the app (contract — these do not move between releases):

- Node: `/Applications/Lodekit.app/Contents/Resources/node/bin/node`
- MCP entry: `/Applications/Lodekit.app/Contents/Resources/platform/mcp/index.ts`
- Skill: `/Applications/Lodekit.app/Contents/Resources/platform/skill/SKILL.md`

JSON config (Claude Desktop and compatible clients):

```json
{
  "mcpServers": {
    "lodekit": {
      "command": "/Applications/Lodekit.app/Contents/Resources/node/bin/node",
      "args": [
        "/Applications/Lodekit.app/Contents/Resources/platform/mcp/node_modules/tsx/dist/cli.mjs",
        "/Applications/Lodekit.app/Contents/Resources/platform/mcp/index.ts"
      ]
    }
  }
}
```

Claude Code one-liner:

```bash
claude mcp add lodekit -- /Applications/Lodekit.app/Contents/Resources/node/bin/node \
  /Applications/Lodekit.app/Contents/Resources/platform/mcp/node_modules/tsx/dist/cli.mjs \
  /Applications/Lodekit.app/Contents/Resources/platform/mcp/index.ts
```

Link the skill by pointing your agent at the `SKILL.md` path above (per-agent guides land
with the docs site; until then these snippets are the setup story — spec §8).
