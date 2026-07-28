# Licensing

Lodekit is licensed in two halves.

**The product is copyleft.** The engine, the manager, and the marketing site are
`AGPL-3.0-only`. If you run a modified Lodekit as a network service, the AGPL
asks you to publish your source.

**Everything your own apps touch is permissive.** The SDK, the UI library, the
MCP server, the Claude skill, the example apps, and the documentation are
`Apache-2.0`. Apps you build on Lodekit are yours, under whatever license you
choose — nothing here reaches into them.

| Tree | License |
| --- | --- |
| `packages/engine/`, `packages/integration-tests/` | `AGPL-3.0-only` |
| `manager/` | `AGPL-3.0-only` |
| `web/main/` | `AGPL-3.0-only` |
| `packages/sdk/`, `packages/ui/`, `packages/mcp/`, `packages/skill/` | `Apache-2.0` |
| `root/` (example apps, gateways, themes) | `Apache-2.0` |
| `docs/`, `web/docs/` | `Apache-2.0` |
| `.agents/skills/` (vendored dev process) | `MIT`, per upstream |

`REUSE.toml` is the authoritative source, and it is machine-readable — it
records the license and copyright holder of every path, including vendored
third-party files that differ from the tree they sit in. CI runs `reuse lint`
on every push.

## Third-party code

Vendored code keeps its own license and copyright notice; `REUSE.toml` names
each holder. `.agents/UPSTREAM.md` records where the vendored development
process came from and how it diverges.

Dependencies keep their own licenses, which travel with them inside
`node_modules` in the packaged app.

## The packaged app

`Lodekit.app` redistributes two third-party binaries:

- **Node.js**, whose aggregate `LICENSE` (covering Node, OpenSSL, V8, ICU, zlib
  and others) ships at `Contents/Resources/node/LICENSE`.
- **Electron**, whose `LICENSE` and `LICENSES.chromium.html` ship at
  `Contents/Resources/LICENSE.electron` and
  `Contents/Resources/LICENSES.chromium.html`.

Electron bundles an ffmpeg build under LGPL-2.1. Corresponding source for the
exact version used is published with that Electron release at
https://github.com/electron/electron/releases — find the tag matching the
Electron version in `manager/package.json`.

## Trademarks

The name and the logos are not covered by these licenses. See `NOTICE`.
