# ![Lodekit](web/main/public/brand/lodekit-lockup-paper-bg.svg)

**The local platform for agent-built apps.**

Lodekit runs personal web apps on the computer you already own. You ask your AI
coding agent for an app and the agent writes it. Lodekit builds it, serves it in
your browser, and keeps it running. Apps get what they would otherwise need a
cloud for: a real database, file storage, secrets, scheduled tasks, and a
dashboard to launch and inspect your apps. Everything worth keeping is files in
one folder, so a backup is simply a copy of that folder.

## Status and disclaimer

Lodekit is free, open-source software supplied outside the course of any
commercial activity, in the hope that it is useful but WITHOUT ANY WARRANTY —
see the LICENSE file.

You should also know how it was built and what it does not yet do:

- The codebase was written almost entirely by AI coding agents, directed,
  curated, and reviewed by a human maintainer.
- It has not yet been independently reviewed or security-audited.
- It stores your data locally in SQLite, not encrypted. Take your own backups.

Do not run Lodekit for anything where a defect would cause real damage you
can't absorb. Report vulnerabilities via SECURITY.md.

## Install

Lodekit ships as a packaged menubar app on GitHub Releases.

1. Download the latest `Lodekit-darwin-*.zip` from
   [Releases](https://github.com/lodekit/lodekit/releases): `arm64` for Apple
   silicon, `x64` for Intel.
2. Unzip it and move `Lodekit.app` into `/Applications`.

Lodekit then lives in the menubar. Its first run creates `~/Documents/Lodekit`,
the folder holding your apps and their data, and installs two apps to look at:
Greenhouse, which exercises every service, and a small Welcome app. The menubar
icon opens the dashboard.

## Quickstart

Go to [docs.lodekit.com](https://docs.lodekit.com) to start building your first
app with Lodekit.

## How it works

One process does the work: the **engine**, a Node server that watches your apps
folder, builds each app it finds, runs it in its own worker thread, and serves
it in your browser next to the dashboard. Apps are TanStack Start projects
carrying no dependencies of their own, because the engine owns the toolchain and
provides storage, secrets, tasks, and gateways to outside providers as
**services** an app reaches through the SDK. Your agent writes app source
straight into that folder and drives the platform over **MCP**, scaffolding apps
and reading back their data, logs, and build state; the skill teaches it how.

## Development

The repository is a pnpm workspace. The engine and the MCP server are buildless:
they run from source through `tsx`.

```bash
pnpm install   # every package; also builds the better-sqlite3 native module
pnpm dev       # the engine against the checked-in root/, at localhost:7777
pnpm test      # every package's tests
```

## Licensing

The product is copyleft: the engine, the manager, and the marketing site are
`AGPL-3.0-only`. Everything an app touches is permissive (the SDK, the UI
library, the MCP server, the skill, the example apps, and the docs are
`Apache-2.0`), so apps you build on Lodekit stay yours under whatever license you
choose. Details in [`LICENSING.md`](LICENSING.md).

## Contributing

While Lodekit is not released yet, it is closed for contributions. Check
[`CONTRIBUTING.md`](CONTRIBUTING.md) to learn more.

## Security

[`SECURITY.md`](SECURITY.md) covers the known limits of app isolation and how
to report a vulnerability privately through the repository's Security tab.
