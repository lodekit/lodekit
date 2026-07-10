import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { kv, secrets, SecretUnavailableError, gateways, GatewayError } from "@lodekit/sdk";

export const ping = createServerFn()
  .inputValidator(z.object({ echo: z.string() }))
  .handler(async ({ data }) => ({ echo: data.echo, pid: process.pid }));

// Reads through the SDK's loopback door — exercised by Task 4's e2e.
export const bump = createServerFn().handler(async () => {
  const n = ((await kv.get<number>("bumps")) ?? 0) + 1;
  await kv.set("bumps", n);
  return n;
});

// Kills the worker mid-request — Task 2's crash-containment case.
export const crash = createServerFn().handler(async () => {
  process.exit(1);
});

// Reads a secret slot through the worker-token door — secrets-e2e's probe.
export const readSecret = createServerFn().handler(async () => {
  try {
    return { ok: true as const, value: await secrets.get("api_key") };
  } catch (e) {
    return {
      ok: false as const,
      reason: e instanceof SecretUnavailableError ? e.reason : "other",
      message: e instanceof Error ? e.message : String(e),
    };
  }
});

// Calls through the gateways door — gateways-e2e's probe. The stub provider
// echoes the URL it saw, so the assertion proves host-side key injection.
export const probeGateway = createServerFn().handler(async () => {
  try {
    const res = await gateways.probe.get("/hello", { query: { name: "greenhouse" } });
    return { ok: true as const, status: res.status, data: await res.json<{ url: string }>() };
  } catch (e) {
    return {
      ok: false as const,
      reason: e instanceof GatewayError ? e.reason : "other",
      message: e instanceof Error ? e.message : String(e),
    };
  }
});
