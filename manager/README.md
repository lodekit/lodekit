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

## Packaged-app smoke checklist

Manual verification of a packaged build — the part `pnpm test`/`pnpm e2e` can't cover.
Run on a clean macOS account **without** system Node or pnpm (`node -v` and `pnpm -v` both
fail). Build the artifact first: `pnpm --filter @lodekit/manager make`.

1. [ ] Install: unzip, move `Lodekit.app` to `/Applications`, right-click → Open.
2. [ ] "⬡" appears in the menu bar; no dock icon; menu reads "Lodekit — starting…" then
       "Lodekit — running".
3. [ ] First run: `~/Documents/Lodekit/apps` + `data` were created and pre-populated with
       the showcase apps (greenhouse + welcome); the dashboard opened in the browser by
       itself, showing both apps go `building… → ready`.
4. [ ] An app builds and serves: open Greenhouse from the dashboard — it renders the
       seeded conservatory page (e.g. "Fernando") — and interact with it (e.g. edit
       `~/Documents/Lodekit/apps/greenhouse` source, watch it rebuild).
5. [ ] Never-clobber / delete-to-empty: delete both `~/Documents/Lodekit/apps/greenhouse`
       and `~/Documents/Lodekit/apps/welcome`, relaunch Lodekit.app — the app grid is
       empty and stays empty (no reinstall on this or any later launch).
6. [ ] MCP: paste the snippet below into an agent's MCP config; the agent lists Lodekit
       tools and can call them. (Headless check:
       `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' | <command + args from the snippet below>`
       prints an `initialize` result.)
7. [ ] Stop/Start from the menu works; "Open Logs" shows `manager.log` + `runtime.log`.
8. [ ] Error surfacing: with Lodekit stopped, start a dev engine on the port (from the repo:
       `pnpm dev`), then Start → menu shows "Lodekit — error" with the port-in-use message;
       stop the dev engine, Restart → running. (A non-engine process squatting the port
       surfaces differently — the spawned engine exits and the menu shows "Engine exited
       unexpectedly"; both are surfaced errors, never a crash.)
9. [ ] "Launch at Login": toggle on, log out/in, Lodekit is running.
10. [ ] Quit: `pgrep -f "Resources/platform/engine"` prints nothing (no orphan).
11. [ ] Crash cleanup: `kill -9 <manager pid>` while running (find it via Activity
        Monitor), relaunch Lodekit.app — it terminates the stale engine (pid file) and
        reaches "running".

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
