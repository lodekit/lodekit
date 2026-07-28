# Security

## Status

Lodekit is alpha software. It has not been independently reviewed or
security-audited, and it does not yet offer stability or security-support
guarantees. Known security work in progress is tracked in the public issue
tracker.

Two properties are worth knowing before you run it:

- **Apps are not sandboxed.** App code runs in worker threads with your full
  user privileges and unrestricted access to the filesystem, the network, and
  child processes. Treat installing an app the way you would treat running any
  program on your machine.
- **Everything is local.** Lodekit stores data in SQLite on your own disk and
  does not send it anywhere.

## Reporting a vulnerability

Report privately through GitHub: go to the **Security** tab and choose
**Report a vulnerability**. This opens a private advisory visible only to the
maintainers.

Please do not open a public issue for a security problem.

Include what you need to make the problem reproducible: affected version,
platform, steps, and what an attacker gains. A proof of concept helps.

## What to expect

A single maintainer reads these. Expect an acknowledgement within a week. Fixes
are prioritised by what an attacker actually gains and how reachable the flaw is
in a default install.

There is no bug bounty, and none is planned.

## Scope

In scope: the engine, the manager, the MCP server, the SDK, and the UI library
in this repository.

Out of scope: apps you or your agent write on top of Lodekit; the documented
absence of app sandboxing described above; vulnerabilities in dependencies that
have no exploitable path through Lodekit (report those upstream).
