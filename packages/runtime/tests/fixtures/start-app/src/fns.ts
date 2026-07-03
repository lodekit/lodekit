import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { kv } from "@lodekit/sdk";

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
