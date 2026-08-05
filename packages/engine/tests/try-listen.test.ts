import { describe, it, expect, afterEach } from "vitest";
import os from "node:os";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Hono } from "hono";
import { tryListen } from "../src/server.js";

const app = new Hono().get("/ping", (c) => c.text("pong"));

// A non-internal IPv4 of this machine, if it has one — lets the loopback-guard
// tests exercise a genuinely non-loopback peer address (connecting to your own
// LAN IP routes with that IP as the source). Absent on some CI runners → skipped.
const lanIp = Object.values(os.networkInterfaces())
  .flat()
  .find((i) => i && !i.internal && i.family === "IPv4")?.address;

const hasV6Loopback = Object.values(os.networkInterfaces())
  .flat()
  .some((i) => i?.address === "::1");

let servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  servers = [];
});

describe("tryListen", () => {
  it("serves the app on the requested host/port", async () => {
    const s = await tryListen(app, "127.0.0.1", 0);
    expect(s).not.toBeNull();
    servers = [s!];
    const port = (s!.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/ping`);
    expect(await res.text()).toBe("pong");
  });

  it("resolves null when the port is taken", async () => {
    const first = await tryListen(app, "127.0.0.1", 0);
    servers = [first!];
    const port = (first!.address() as AddressInfo).port;
    const second = await tryListen(app, "127.0.0.1", port);
    expect(second).toBeNull();
  });

  it("binds the wildcard when host is undefined", async () => {
    const s = await tryListen(app, undefined, 0);
    expect(s).not.toBeNull();
    servers = [s!];
    const port = (s!.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/ping`);
    expect(await res.text()).toBe("pong");
  });

  it.skipIf(!lanIp)("loopbackOnly destroys non-loopback peers before HTTP", async () => {
    const s = await tryListen(app, undefined, 0, true);
    servers = [s!];
    const port = (s!.address() as AddressInfo).port;
    // Loopback peers still get through…
    const res = await fetch(`http://127.0.0.1:${port}/ping`);
    expect(await res.text()).toBe("pong");
    // …a non-loopback peer's socket dies without a response.
    await expect(
      fetch(`http://${lanIp}:${port}/ping`, { signal: AbortSignal.timeout(2000) })
    ).rejects.toThrow();
  });

  it.skipIf(!lanIp)("without loopbackOnly the wildcard serves non-loopback peers (the guard is what blocks)", async () => {
    const s = await tryListen(app, undefined, 0);
    servers = [s!];
    const port = (s!.address() as AddressInfo).port;
    const res = await fetch(`http://${lanIp}:${port}/ping`, { signal: AbortSignal.timeout(2000) });
    expect(await res.text()).toBe("pong");
  });

  it.skipIf(!hasV6Loopback)("loopbackOnly admits ::1 peers", async () => {
    const s = await tryListen(app, undefined, 0, true);
    servers = [s!];
    const port = (s!.address() as AddressInfo).port;
    const res = await fetch(`http://[::1]:${port}/ping`, { signal: AbortSignal.timeout(2000) });
    expect(await res.text()).toBe("pong");
  });
});
