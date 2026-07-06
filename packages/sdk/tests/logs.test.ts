import { describe, it, expect, afterEach, vi } from "vitest";
import { createClient } from "../src/client.js";

afterEach(() => vi.unstubAllGlobals());

describe("logs handle", () => {
  it("POSTs level/message/fields to the app's log-store", async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    });
    const { logs } = createClient({ baseUrl: "http://h", appId: "notes" });
    logs.warn("low disk", { free: 12 });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe("http://h/api/apps/notes/log-store");
    expect(calls[0].body).toEqual({ level: "warn", message: "low disk", fields: { free: 12 } });
  });

  it("swallows network failures — logging never throws into app code", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("refused"); });
    const { logs } = createClient({ baseUrl: "http://h", appId: "notes" });
    expect(() => logs.error("boom")).not.toThrow();
    await new Promise((r) => setTimeout(r, 10)); // rejection must be absorbed, not unhandled
  });
});
