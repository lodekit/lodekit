import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineSecrets, secret, SecretUnavailableError } from "../src/secrets.js";
import { createClient } from "../src/client.js";

describe("defineSecrets", () => {
  it("tags and validates", () => {
    const d = defineSecrets({ api_key: secret({ label: "API key", description: "For the API." }) });
    expect(d.__lodekitSecrets).toBe(true);
    expect(d.slots.api_key.label).toBe("API key");
  });

  it("rejects bad keys and missing label/description", () => {
    expect(() => defineSecrets({ "Bad-Key": secret({ label: "x", description: "y" }) })).toThrow(/invalid slot/);
    expect(() => defineSecrets({ ok: { label: "", description: "y" } })).toThrow(/label/);
    expect(() => defineSecrets({ ok: { label: "x", description: "" } })).toThrow(/description/);
  });
});

describe("secrets.get", () => {
  const client = () => createClient({ baseUrl: "http://runtime.test", appId: "app-a" }).secrets;

  beforeEach(() => {
    delete process.env.LODEKIT_WORKER_TOKEN;
  });
  afterEach(() => {
    delete process.env.LODEKIT_WORKER_TOKEN;
    vi.unstubAllGlobals();
  });

  it("fails fast without a worker token (browser / non-worker context)", async () => {
    await expect(client().get("api_key")).rejects.toThrow(/server-only/);
  });

  it("sends the token header and returns the value", async () => {
    process.env.LODEKIT_WORKER_TOKEN = "tok";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ value: "v" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await client().get("api_key")).toBe("v");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://runtime.test/api/apps/app-a/secrets/api_key/value");
    expect((init.headers as Record<string, string>)["x-lodekit-worker-token"]).toBe("tok");
  });

  it("maps 409 → unlinked and 503 → unavailable", async () => {
    process.env.LODEKIT_WORKER_TOKEN = "tok";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "not linked" }), { status: 409 })));
    await expect(client().get("api_key")).rejects.toMatchObject({ name: "SecretUnavailableError", reason: "unlinked" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "degraded" }), { status: 503 })));
    await expect(client().get("api_key")).rejects.toMatchObject({ name: "SecretUnavailableError", reason: "unavailable" });
    expect(SecretUnavailableError.name).toBe("SecretUnavailableError");
  });
});
