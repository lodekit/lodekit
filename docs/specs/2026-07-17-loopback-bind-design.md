# Loopback bind for the engine listener — design

**Date:** 2026-07-17
**Source:** GitHub issue #87 (security-audit SEC-01, Critical). Related: #5 (local-door
auth umbrella), #8.

## Problem

The engine's HTTP listener binds all network interfaces: `server.listen(cfg.port, cb)`
(`packages/engine/src/server.ts:233`) passes no host, so Node binds `0.0.0.0`/`::`.
On a shared network (café/hotel WiFi) any device on the subnet can reach
`http://<machine-ip>:7777/api/…`; combined with the unauthenticated API (#5) that is
full read/write to every app's data — no browser, no user interaction.

`baseUrl` (`http://lodekit.localhost:<port>`) is display-only; the socket bind governs
reachability. Every internal client already dials loopback explicitly — workers call
back via `http://127.0.0.1:<port>` (`server.ts:239`), the manager health-checks
`127.0.0.1` (`manager/src/main.js:53`), and the MCP server uses the same base — so
binding loopback costs nothing.

## Change

Two files.

1. **`packages/engine/src/config.ts`** — `Config` gains `host: string`. `loadConfig()`
   resolves it as `process.env.LODEKIT_HOST ?? "127.0.0.1"`, following the existing
   pattern where all env resolution lives in `loadConfig()` (`port`, `cacheDir`,
   `stateDir`).
2. **`packages/engine/src/server.ts`** — `start()` calls
   `server.listen(cfg.port, cfg.host, cb)`. When `cfg.host` is not a loopback address
   (not one of `127.0.0.1`, `::1`, `localhost`), log a prominent startup warning that
   the engine is reachable from the network and the API is unauthenticated (#5). The
   escape hatch works, but never silently.

Untouched: the worker callback URL stays a hard-coded `127.0.0.1`; manager and MCP
already use loopback; `baseUrl` stays display-only; engine tests bind their own
servers via `createServer(cfg).listen(0, …)` and never go through `start()`.

## Decisions

- **`LODEKIT_HOST` escape hatch, default loopback.** Issue #87 asked for a
  *non-overridable* loopback bind; this design deliberately diverges (engineer's
  call, 2026-07-17): an explicit env var allows deliberate LAN exposure — e.g. a
  trusted home network — with the non-loopback startup warning as the guardrail.
  Anyone not setting `LODEKIT_HOST` gets loopback unconditionally.
- **IPv4 loopback only.** The issue mentions `::1` too, but one Node `http.Server`
  binds exactly one address; dual-stack loopback would need a second server instance
  sharing the app, complicating the shutdown/watcher semantics keyed on the single
  `Server` (`watcherShutdown` WeakMap). All internal clients dial `127.0.0.1`
  explicitly, and browsers resolving `lodekit.localhost` fall back between loopbacks
  (Happy Eyeballs), so nothing needs `::1`.

## Testing

- Config test: default `host` is `127.0.0.1`; `LODEKIT_HOST` overrides it.
- Bind test: a server listened with the default config reports
  `address().address === "127.0.0.1"`.

## Docs

`docs/changelog.md` gets a `## Fixed` entry (user-visible security fix). No other
doc surface exists for engine env vars today.

## Out of scope

The rest of the local-door hardening tracked by #5: API auth token (SEC-02),
Host-header allowlist / CORS deny-by-default against DNS rebinding (SEC-03, which
survives a loopback bind), and app-to-app data isolation (#8 / SEC-04).
