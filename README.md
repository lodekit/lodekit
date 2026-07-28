# Lodekit

**The local platform for agent-built apps.**

Lodekit runs personal web apps on the computer you already own. You ask your AI
coding agent for an app and the agent writes it. Lodekit builds it, serves it in
your browser, and keeps it running. Apps get what they would otherwise need a
cloud for: a real database, file storage, secrets, scheduled tasks, and a
dashboard showing the state of every app. Everything worth keeping is files in
one folder, so a backup is a copy of that folder.

## Status and disclaimer

Lodekit is free, open-source software supplied outside the course of any
commercial activity, in the hope that it is useful but WITHOUT ANY WARRANTY —
see the LICENSE file.

You should also know how it was built and what it does not yet do:

- The codebase was written almost entirely by AI coding agents, directed,
  curated, and reviewed by a human maintainer.
- It has not been independently reviewed or security-audited.
- **App isolation is cooperative, not enforced.** Apps run in worker threads
  with your full user privileges and unrestricted access to the filesystem,
  the network, and child processes. An app can do anything you can do.
- macOS binaries are currently ad-hoc signed and NOT notarized by Apple.
  macOS will warn you, and you must explicitly allow the app under
  System Settings → Privacy & Security → "Open Anyway".
- It is macOS-only today.
- It stores your data locally in SQLite. Take your own backups.

Do not run Lodekit for anything where a defect would cause real damage you
can't absorb. Report vulnerabilities via SECURITY.md.

## Install

Lodekit ships as a packaged menubar app on GitHub Releases. There is no Homebrew
cask and no installer.

1. Download the latest `Lodekit-darwin-*.zip` from
   [Releases](https://github.com/lodekit/lodekit/releases): `arm64` for Apple
   silicon, `x64` for Intel.
2. Unzip it and move `Lodekit.app` into `/Applications`.
3. Open it. macOS blocks the first launch, because the app is ad-hoc signed
   rather than notarized. Open **System Settings → Privacy & Security**, find
   the notice naming Lodekit, and choose **Open Anyway**.

Lodekit then lives in the menubar. Its first run creates `~/Documents/Lodekit`,
the folder holding your apps and their data, and installs two apps to look at:
Greenhouse, which exercises every service, and a small Welcome app. The menubar
icon opens the dashboard.

## Quickstart

Getting from an installed Lodekit to a first working app is the job of
[docs.lodekit.com](https://docs.lodekit.com), which is not published yet; until
it is, the closest thing is the skill under `packages/skill/` and the design
documents in [`docs/specs/`](docs/specs/).

## How it works

One process does the work: the **engine**, a Node server that watches your apps
folder, builds each app it finds, runs it in its own worker thread, and serves
it in your browser next to the dashboard. Apps are TanStack Start projects
carrying no dependencies of their own, because the engine owns the toolchain and
provides storage, secrets, tasks, and gateways to outside providers as
**services** an app reaches through the SDK. Your agent writes app source
straight into that folder and drives the platform over **MCP**, scaffolding apps
and reading back their data, logs, and build state; the skill teaches it how.

[`docs/CONTEXT.md`](docs/CONTEXT.md) fixes the vocabulary this codebase uses, and
[`docs/specs/`](docs/specs/) holds the design document behind each subsystem.

## Development

The repository is a pnpm workspace. The engine and the MCP server are buildless:
they run from source through `tsx`.

```bash
pnpm install   # every package; also builds the better-sqlite3 native module
pnpm dev       # the engine against the checked-in root/, at localhost:7777
pnpm test      # every package's tests
```

[`AGENTS.md`](AGENTS.md) is the working agreement for anyone changing code here,
human or agent: architecture, conventions, and how work is tracked.

## Licensing

The product is copyleft: the engine, the manager, and the marketing site are
`AGPL-3.0-only`. Everything an app touches is permissive (the SDK, the UI
library, the MCP server, the skill, the example apps, and the docs are
`Apache-2.0`), so apps you build on Lodekit stay yours under whatever license you
choose. Details in [`LICENSING.md`](LICENSING.md).

## Contributing

Lodekit is not taking outside pull requests during the alpha, though the
development process is public and forking is welcome —
[`CONTRIBUTING.md`](CONTRIBUTING.md) explains what that means.

## Security

[`SECURITY.md`](SECURITY.md) covers the scope, the known limits of app
isolation, and how to report a vulnerability privately through the repository's
Security tab.
