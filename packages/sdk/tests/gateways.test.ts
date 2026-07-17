import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineGateways, gateway, GatewayError } from "../src/gateways.js";
import { createClient } from "../src/client.js";

describe("defineGateways", () => {
  it("tags and validates", () => {
    const d = defineGateways({ weather: gateway({ provider: "openweathermap", description: "d" }) });
    expect(d.__lodekitGateways).toBe(true);
    expect(d.uses.weather.provider).toBe("openweathermap");
  });

  it("rejects bad aliases and bad provider ids", () => {
    expect(() => defineGateways({ "Bad-Alias": gateway({ provider: "x" }) })).toThrow(/invalid alias/);
    expect(() => defineGateways({ ok: gateway({ provider: "Not Valid!" }) })).toThrow(/provider/);
  });
});

describe("gateways handle", () => {
  const handle = () => createClient({ baseUrl: "http://engine.test", appId: "app-a" }).gateways;

  beforeEach(() => {
    delete process.env.LODEKIT_WORKER_TOKEN;
  });
  afterEach(() => {
    delete process.env.LODEKIT_WORKER_TOKEN;
    vi.unstubAllGlobals();
  });

  it("fails fast without a worker token (browser / non-worker context)", async () => {
    await expect(handle().weather.get("/x")).rejects.toThrow(/server-only/);
  });

  it("posts the descriptor with the token and parses the envelope", async () => {
    process.env.LODEKIT_WORKER_TOKEN = "tok";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ status: 200, headers: { "content-type": "application/json" }, body: '{"hello":"world"}', durationMs: 12 }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await handle().weather.get("/data", { query: { q: "Lisbon", units: "metric" } });
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: "world" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://engine.test/api/apps/app-a/gateways/weather/request");
    expect((init.headers as Record<string, string>)["x-lodekit-worker-token"]).toBe("tok");
    const sent = JSON.parse(init.body as string);
    expect(sent).toEqual({ method: "GET", path: "/data", query: { q: "Lisbon", units: "metric" } });
  });

  it("serializes object bodies as JSON and Uint8Array as base64", async () => {
    process.env.LODEKIT_WORKER_TOKEN = "tok";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ status: 204, headers: {}, durationMs: 1 }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    await handle().hooks.post("/event", { body: { a: 1 } });
    let sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.body).toBe('{"a":1}');
    expect(sent.headers["content-type"]).toBe("application/json");
    await handle().hooks.post("/blob", { body: new Uint8Array([1, 2, 3]) });
    sent = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.bodyBase64).toBe(Buffer.from([1, 2, 3]).toString("base64"));
  });

  it("maps typed reasons from error bodies to GatewayError", async () => {
    process.env.LODEKIT_WORKER_TOKEN = "tok";
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ error: "rate limit exhausted", reason: "rate_limited" }), { status: 429 })
    ));
    await expect(handle().weather.get("/x")).rejects.toMatchObject({ name: "GatewayError", reason: "rate_limited" });
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ error: "link it", reason: "unconfigured" }), { status: 409 })
    ));
    await expect(handle().weather.get("/x")).rejects.toMatchObject({ reason: "unconfigured" });
    expect(GatewayError.name).toBe("GatewayError");
  });
});
