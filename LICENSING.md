# Licensing

Lodekit is licensed in two parts.

**The product is copyleft.** The engine, the manager, and the marketing site are
`AGPL-3.0-only`. If you run a modified Lodekit as a network service, the AGPL
asks you to publish your source.

**Everything your own apps touch is permissive.** The SDK, the UI library, the
MCP server, the Claude skill, the example apps, and the documentation are
`Apache-2.0`. Apps you build on Lodekit are yours, under whatever license you
choose.

| Tree | License |
| --- | --- |
| `packages/engine/`, `packages/integration-tests/` | `AGPL-3.0-only` |
| `manager/` | `AGPL-3.0-only` |
| `web/main/` | `AGPL-3.0-only` |
| `packages/sdk/`, `packages/ui/`, `packages/mcp/`, `packages/skill/` | `Apache-2.0` |
| `root/` (example apps, gateways, themes) | `Apache-2.0` |
| `docs/`, `web/docs/` | `Apache-2.0` |

`packages/ui` vendors the shadcn/ui components (`packages/ui/src/components/`
and `shadcn-tailwind.css`, MIT, © shadcn), so its `package.json` declares
`Apache-2.0 AND MIT` — `REUSE.toml` draws the per-file boundary.

Licensing follows the [REUSE](https://reuse.software/) specification:
`REUSE.toml` records the license and copyright holder of every path, including
vendored third-party code.

## Third-party code

Vendored code keeps its own license and copyright notice.

Dependencies keep their own licenses, which travel with them inside
`node_modules` in the packaged app.

The landing site self-hosts three webfonts (M PLUS 1 Code, Spline Sans Mono,
Zen Kaku Gothic New — all `OFL-1.1`). Their copyright and license notice ships
with the site at `/font-licenses.txt` (`web/main/public/font-licenses.txt`).

## Packaged app

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
