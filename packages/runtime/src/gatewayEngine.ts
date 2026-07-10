// The gateways engine (spec 2026-07-10-gateways §6/§9/§10): the one execution
// path for connection traffic. Order: resolve → breaker → concurrency → rate
// token → assemble URL (egress by construction) → inject credentials → fetch
// with timeout → buffer under the size cap → record the log → return.
// Credentials are resolved host-side and never enter the envelope, the log,
// or the worker. Guard state (buckets, breakers, semaphores, health) is
// in-memory only — a restart forgives.
import type { Config } from "./config.js";
import { emitLog } from "./logger.js";
import { PLATFORM_NS } from "./events.js";
import { emitGatewayHealth } from "./gatewayEvents.js";
import { getGatewayEntry, isPrivateHost, type GatewayManifest } from "./gatewayManifests.js";
import { parseRate, TokenBucket, Breaker, Semaphore } from "./gatewayGuards.js";
import {
  getGatewayLink, getGatewayConfig, GatewaysError, GatewaysNotFoundError,
} from "./gatewaysStore.js";
import { readValueBySlug, SecretsNotFoundError, SecretsUnavailableError } from "./secretsStore.js";
import { getUsesDb, listUses } from "./services/gateways.js";
import { effectiveMs, effectiveNumber, effectiveString, effectiveBoolean } from "./services/settings.js";

export type GatewayFailReason =
  | "unconfigured" | "rate_limited" | "breaker_open" | "needs_reauth"
  | "timeout" | "too_large" | "network" | "unavailable";

export class GatewayRequestError extends Error {
  constructor(public readonly reason: GatewayFailReason, message?: string) {
    super(message ?? `gateway request failed: ${reason}`);
    this.name = "GatewayRequestError";
  }
}

export const REASON_STATUS: Record<GatewayFailReason, 409 | 429 | 502 | 503 | 504> = {
  unconfigured: 409, needs_reauth: 409, rate_limited: 429,
  breaker_open: 503, unavailable: 503, timeout: 504, network: 502, too_large: 502,
};

export interface GatewayRequestDescriptor {
  method: string;
  path: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string;
  bodyBase64?: string;
  timeoutMs?: number;
}

export interface GatewayResponseEnvelope {
  status: number;
  headers: Record<string, string>;
  body?: string;
  bodyBase64?: string;
  durationMs: number;
}

const HARD_TIMEOUT_CAP_MS = 60_000;
const RETRY_AFTER_PAUSE_CAP_MS = 15 * 60_000;
const CAPTURE_TRUNCATE = 2048;

interface Tuning {
  timeoutMs: number;
  rate: string;
  concurrency: number;
  maxResponseBytes: number;
  captureBodies: boolean;
  breakerThreshold: number;
  breakerCooldownMs: number;
}

let cfgRef: Config | null = null;
let tuningOverride: Partial<Tuning> | null = null;
const buckets = new Map<string, { rate: string; bucket: TokenBucket }>();
const breakers = new Map<string, Breaker>();
const semaphores = new Map<string, { limit: number; sem: Semaphore }>();
const unhealthy = new Set<string>(); // `${appId}\n${alias}`

// Task 8 wires the OAuth module in here; until then oauth2 is unconfigured.
type OauthTokenProvider = (providerId: string, manifest: GatewayManifest, appId: string, alias: string) => Promise<{ token: string; redact: string[] }>;
let oauthTokenProvider: OauthTokenProvider | null = null;
/** @internal seam for gatewayOauth.ts */
export function _setOauthTokenProvider(fn: OauthTokenProvider | null): void {
  oauthTokenProvider = fn;
}

export function initGatewayEngine(cfg: Config): void {
  cfgRef = cfg;
  buckets.clear();
  breakers.clear();
  semaphores.clear();
  unhealthy.clear();
}

export function resetGatewayEngineForTest(): void {
  cfgRef = null;
  tuningOverride = null;
  buckets.clear();
  breakers.clear();
  semaphores.clear();
  unhealthy.clear();
}

/** Test hook — pins guard tuning without writing settings. */
export function setGatewayTuningForTest(t: Partial<Tuning> | null): void {
  tuningOverride = t;
  breakers.clear(); // tuning affects breaker construction
  semaphores.clear();
}

function tuning(): Tuning {
  return {
    timeoutMs: effectiveMs("gateways.default_timeout"),
    rate: effectiveString("gateways.default_rate"),
    concurrency: effectiveNumber("gateways.default_concurrency"),
    maxResponseBytes: effectiveNumber("gateways.max_response_bytes"),
    captureBodies: effectiveBoolean("gateways.capture_bodies"),
    breakerThreshold: effectiveNumber("gateways.breaker_failure_threshold"),
    breakerCooldownMs: effectiveMs("gateways.breaker_cooldown"),
    ...tuningOverride,
  };
}

export function getConnectionHealth(appId: string, alias: string): "ok" | "unhealthy" {
  return unhealthy.has(`${appId}\n${alias}`) ? "unhealthy" : "ok";
}

function bucketFor(providerId: string, manifest: GatewayManifest, t: Tuning): TokenBucket {
  const rate = manifest.limits?.rate ?? t.rate;
  const cached = buckets.get(providerId);
  if (cached && cached.rate === rate) return cached.bucket;
  let parsed;
  try {
    parsed = parseRate(rate);
  } catch {
    parsed = parseRate("60/min"); // an unparseable settings value degrades to the default
  }
  const bucket = new TokenBucket(parsed.capacity, parsed.windowMs);
  buckets.set(providerId, { rate, bucket });
  return bucket;
}

function breakerFor(providerId: string, t: Tuning): Breaker {
  let b = breakers.get(providerId);
  if (!b) {
    b = new Breaker(t.breakerThreshold, t.breakerCooldownMs);
    breakers.set(providerId, b);
  }
  return b;
}

function semaphoreFor(providerId: string, manifest: GatewayManifest, t: Tuning): Semaphore {
  const limit = manifest.limits?.concurrency ?? t.concurrency;
  const cached = semaphores.get(providerId);
  if (cached && cached.limit === limit) return cached.sem;
  const sem = new Semaphore(limit);
  semaphores.set(providerId, { limit, sem });
  return sem;
}

// Resolve a slot the auth recipe (or base_url) references. Missing values are
// "unconfigured" — the person hasn't finished the connection; a degraded
// secret store is "unavailable".
function slotValue(manifest: GatewayManifest, appId: string, alias: string, slot: string): string {
  const def = manifest.slots[slot];
  if (!def) throw new GatewayRequestError("unconfigured", `gateway manifest references undeclared slot "${slot}"`);
  try {
    if (def.kind === "config") {
      const v = getGatewayConfig(appId, alias, slot);
      if (v === undefined) throw new GatewayRequestError("unconfigured", `config slot "${slot}" is not set — set it in the dashboard`);
      return v;
    }
    const link = getGatewayLink(appId, alias, slot);
    if (!link) throw new GatewayRequestError("unconfigured", `secret slot "${slot}" is not linked — link it in the dashboard`);
    return readValueBySlug(link.slug);
  } catch (e) {
    if (e instanceof GatewayRequestError) throw e;
    if (e instanceof SecretsNotFoundError) throw new GatewayRequestError("unconfigured", `secret slot "${slot}" points at a deleted secret`);
    if (e instanceof SecretsUnavailableError) throw new GatewayRequestError("unavailable", e.message);
    throw e;
  }
}

function assembleUrl(manifest: GatewayManifest, appId: string, alias: string, desc: GatewayRequestDescriptor): URL {
  const baseRaw = typeof manifest.base_url === "string"
    ? manifest.base_url
    : slotValue(manifest, appId, alias, manifest.base_url.from_slot);
  let base: URL;
  try {
    base = new URL(baseRaw);
  } catch {
    throw new GatewayRequestError("unconfigured", `gateway base URL "${baseRaw}" is not a valid URL`);
  }
  if (base.protocol !== "https:" && !(base.protocol === "http:" && isPrivateHost(base.hostname))) {
    throw new GatewayRequestError("unconfigured", "gateway base URL must be https (http only for private hosts)");
  }
  if (!desc.path.startsWith("/") || desc.path.includes("://")) {
    throw new GatewaysError("path must be relative and start with /");
  }
  const basePath = base.pathname.replace(/\/$/, "");
  const url = new URL(base.origin + basePath + desc.path);
  // URL construction normalized any ../ segments — the resolved path must
  // still live under the base path (egress by construction, spec §2).
  if (url.origin !== base.origin || !(url.pathname === basePath || url.pathname.startsWith(basePath + "/") || basePath === "")) {
    throw new GatewaysError("path escapes the gateway base URL");
  }
  for (const [k, v] of Object.entries(desc.query ?? {})) url.searchParams.set(k, v);
  return url;
}

// Injects credentials per the auth recipe. Returns the redaction list —
// every injected value, masked in anything captured. Recipe-owned headers/
// params win: a descriptor that tries to set one is rejected, not overwritten.
async function injectAuth(
  providerId: string, manifest: GatewayManifest, appId: string, alias: string,
  url: URL, headers: Record<string, string>
): Promise<string[]> {
  const ownedHeader = (name: string) => {
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === name.toLowerCase()) {
        throw new GatewaysError(`the gateway owns the "${name}" header`);
      }
    }
  };
  const a = manifest.auth;
  if (a.kind === "none") return [];
  if (a.kind === "api_key") {
    const v = slotValue(manifest, appId, alias, a.slot);
    if (a.in === "query") {
      if (url.searchParams.has(a.param!)) throw new GatewaysError(`the gateway owns the "${a.param}" query param`);
      url.searchParams.set(a.param!, v);
    } else {
      ownedHeader(a.header!);
      headers[a.header!] = v;
    }
    return [v];
  }
  if (a.kind === "bearer") {
    const v = slotValue(manifest, appId, alias, a.slot);
    headers["authorization"] = `Bearer ${v}`;
    return [v];
  }
  if (a.kind === "basic") {
    const user = slotValue(manifest, appId, alias, a.username_slot);
    const pass = slotValue(manifest, appId, alias, a.password_slot);
    // The composed header value rides the redact list too — providers echo
    // Authorization back often enough (debug endpoints, error pages).
    const composed = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
    headers["authorization"] = composed;
    return [user, pass, composed];
  }
  // oauth2 — Task 8's module provides tokens (and transparent refresh).
  if (!oauthTokenProvider) throw new GatewayRequestError("unconfigured", "OAuth is not available");
  const { token, redact } = await oauthTokenProvider(providerId, manifest, appId, alias);
  headers["authorization"] = `Bearer ${token}`;
  return [token, ...redact];
}

async function readCapped(res: Response, cap: number): Promise<Buffer> {
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => {});
      throw new GatewayRequestError("too_large", `response exceeds ${cap} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

const TEXTUAL = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded)|application\/[a-z0-9.+-]*\+(json|xml))/i;

// Value masking only — headers must stay intact apart from the redaction.
function mask(s: string, redact: string[]): string {
  let out = s;
  for (const v of redact) {
    if (v) out = out.split(v).join("•••");
  }
  return out;
}

// Capture scrubbing — masked AND truncated (log records, not envelopes).
function scrub(s: string, redact: string[]): string {
  return mask(s, redact).slice(0, CAPTURE_TRUNCATE);
}

// Injected values plus their URL-encoded forms — a credential that went out in
// a query param comes back percent-encoded in Location headers and error bodies.
function expandRedact(values: string[]): string[] {
  const out = [...values];
  for (const v of values) {
    const enc = encodeURIComponent(v);
    if (enc !== v) out.push(enc);
  }
  return out;
}

function parseRetryAfter(h: string | null, now: number): number | null {
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs) && secs > 0) return now + Math.min(secs * 1000, RETRY_AFTER_PAUSE_CAP_MS);
  const date = Date.parse(h);
  if (!Number.isNaN(date) && date > now) return Math.min(date, now + RETRY_AFTER_PAUSE_CAP_MS);
  return null;
}

export async function executeGatewayRequest(
  appId: string, alias: string, desc: GatewayRequestDescriptor
): Promise<GatewayResponseEnvelope> {
  if (!cfgRef) throw new GatewayRequestError("unavailable", "gateway engine not initialized");
  const use = listUses(getUsesDb(cfgRef.dataDir, appId)).find((u) => u.alias === alias);
  if (!use) throw new GatewaysNotFoundError(`unknown gateway alias "${alias}"`);
  if (use.error || !use.def) throw new GatewayRequestError("unconfigured", use.error ?? "invalid gateway declaration");
  const providerId = use.def.provider;
  const entry = getGatewayEntry(providerId);
  if (!entry) {
    throw new GatewayRequestError("unconfigured", `no gateway "${providerId}" — author gateways/${providerId}/manifest.json`);
  }
  if (!entry.manifest) throw new GatewayRequestError("unconfigured", `gateway manifest invalid: ${entry.error}`);
  const manifest = entry.manifest;
  const t = tuning();
  const timeoutMs = Math.min(desc.timeoutMs ?? manifest.limits?.timeout_ms ?? t.timeoutMs, HARD_TIMEOUT_CAP_MS);
  const source = `gateway:${providerId}`;
  const healthKey = `${appId}\n${alias}`;

  const record = (
    level: "info" | "warn" | "error", outcome: string, status: number | null,
    durationMs: number, extra: Record<string, unknown> = {}
  ) => {
    emitLog(level, source, `${desc.method} ${desc.path} → ${status ?? outcome} (${durationMs} ms)`, {
      provider: providerId, alias, method: desc.method, path: desc.path,
      status: status ?? undefined, outcome, durationMs, ...extra,
    }, appId);
  };

  const breaker = breakerFor(providerId, t);
  if (!breaker.tryPass()) {
    record("error", "breaker_open", null, 0);
    throw new GatewayRequestError("breaker_open", `the ${manifest.name} gateway's circuit breaker is open`);
  }
  // From here on, the breaker holds a granted probe/pass slot. Exactly one of
  // recordSuccess / recordFailure / releaseProbe must run before we return or
  // throw — the `finally` below releases the probe whenever neither ran (any
  // guard/config rejection between here and the fetch outcome), so a rejected
  // half-open probe never wedges the breaker open forever.
  let breakerSettled = false;
  const release = await semaphoreFor(providerId, manifest, t).acquire();
  const started = Date.now();
  try {
    if (!(await bucketFor(providerId, manifest, t).acquire(timeoutMs))) {
      record("warn", "rate_limited", null, Date.now() - started);
      throw new GatewayRequestError("rate_limited", `the ${manifest.name} gateway's rate limit is exhausted`);
    }
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(desc.headers ?? {})) {
      const lk = k.toLowerCase();
      if (lk === "host" || lk === "cookie") continue; // never caller-suppliable
      if (lk === "authorization" || lk === "proxy-authorization") {
        // Unconditional, whatever the manifest's auth kind — credentials are
        // host-side by invariant, never smuggled in from the worker.
        throw new GatewaysError("credentials belong in gateway slots — the gateway owns the authorization header");
      }
      headers[lk] = v;
    }
    const url = assembleUrl(manifest, appId, alias, desc);
    const redact = expandRedact(await injectAuth(providerId, manifest, appId, alias, url, headers));
    // Network/timeout failures — during fetch or mid-body. Settles the breaker
    // (a provider failure), logs the scrubbed detail host-side, and returns a
    // typed error with a STATIC message: undici messages can embed the request
    // URL, which may carry an injected query credential.
    const upstreamFailure = (e: unknown): GatewayRequestError => {
      const timedOut = e instanceof Error && e.name === "TimeoutError";
      breakerSettled = true;
      const opened = breaker.recordFailure();
      if (opened) emitGatewayHealth(PLATFORM_NS, { provider: providerId, breaker: "open" });
      const outcome = timedOut ? "timeout" : "network";
      record("error", outcome, null, Date.now() - started, {
        error: scrub(String(e instanceof Error ? e.message : e), redact),
      });
      return new GatewayRequestError(
        timedOut ? "timeout" : "network",
        timedOut ? `gateway request timed out after ${timeoutMs} ms` : "upstream network error"
      );
    };
    const body = desc.bodyBase64 !== undefined ? Buffer.from(desc.bodyBase64, "base64")
      : desc.body !== undefined ? desc.body : undefined;
    let res: Response;
    try {
      res = await fetch(url, {
        method: desc.method,
        headers,
        body: body as BodyInit | undefined,
        redirect: "manual", // a redirect off-base must not be followed silently
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw upstreamFailure(e);
    }
    let bytes: Buffer;
    try {
      bytes = await readCapped(res, t.maxResponseBytes);
    } catch (e) {
      // The timeout signal can fire mid-body (headers fast, body trickling),
      // and resets mid-stream reject reader.read() with raw errors — both must
      // stay inside the taxonomy, with breaker accounting and a log record.
      if (e instanceof GatewayRequestError) throw e; // too_large — the outer catch records it
      throw upstreamFailure(e);
    }
    const durationMs = Date.now() - started;

    // Breaker accounting: 5xx/network are provider failures; everything else
    // (incl. 4xx) is a completed conversation (spec §9).
    breakerSettled = true;
    if (res.status >= 500) {
      const opened = breaker.recordFailure();
      if (opened) emitGatewayHealth(PLATFORM_NS, { provider: providerId, breaker: "open" });
    } else {
      const closed = breaker.recordSuccess();
      if (closed) emitGatewayHealth(PLATFORM_NS, { provider: providerId, breaker: "closed" });
    }
    // Connection health: 401/403 mark this connection, one event per transition.
    if (res.status === 401 || res.status === 403) {
      if (!unhealthy.has(healthKey)) {
        unhealthy.add(healthKey);
        emitGatewayHealth(appId, { alias, provider: providerId, status: "unhealthy" });
      }
    } else if (res.status < 400 && unhealthy.delete(healthKey)) {
      emitGatewayHealth(appId, { alias, provider: providerId, status: "ok" });
    }
    // Retry-After: pause the shared bucket so nobody hammers a throttling provider.
    if (res.status === 429) {
      const until = parseRetryAfter(res.headers.get("retry-after"), Date.now());
      if (until) bucketFor(providerId, manifest, t).pauseUntil(until);
    }

    // Every outgoing header value is masked: with redirect "manual", a
    // provider's Location can echo the query string — injected key included.
    const outHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      if (k.toLowerCase() !== "set-cookie") outHeaders[k.toLowerCase()] = mask(v, redact);
    });
    const contentType = res.headers.get("content-type") ?? "";
    const textual = TEXTUAL.test(contentType);
    const envelope: GatewayResponseEnvelope = {
      status: res.status,
      headers: outHeaders,
      durationMs,
      ...(textual ? { body: bytes.toString("utf8") } : { bodyBase64: bytes.toString("base64") }),
    };

    const level = res.status >= 500 ? "error" : res.status >= 400 ? "warn" : "info";
    const outcome = res.status >= 500 ? "server_error" : res.status >= 400 ? "client_error" : "ok";
    const extra: Record<string, unknown> = {
      reqBytes: body === undefined ? 0 : Buffer.byteLength(body as string | Buffer),
      resBytes: bytes.byteLength,
    };
    if (t.captureBodies) {
      if (typeof body === "string") extra.requestBody = scrub(body, redact);
      if (textual) extra.responseBody = scrub(bytes.toString("utf8"), redact);
    }
    record(level, outcome, res.status, durationMs, extra);
    return envelope;
  } catch (e) {
    if (e instanceof GatewayRequestError && (e.reason === "unconfigured" || e.reason === "needs_reauth" || e.reason === "unavailable")) {
      record("warn", e.reason, null, Date.now() - started);
    }
    if (e instanceof GatewayRequestError && e.reason === "too_large") {
      record("error", "too_large", null, Date.now() - started);
    }
    // Guard rejections after entry resolution (path escape, owned header/param)
    // leave evidence too; pre-resolution throws (unknown alias) never get here.
    if (e instanceof GatewaysError) {
      record("warn", "rejected", null, Date.now() - started);
    }
    throw e;
  } finally {
    if (!breakerSettled) breaker.releaseProbe();
    release();
  }
}
