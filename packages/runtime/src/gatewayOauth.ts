// OAuth 2.0 for gateways (spec 2026-07-10-gateways §7): authorization-code +
// PKCE with zero dependencies — authorize-URL construction, state/verifier via
// node:crypto, token exchange/refresh as plain fetch POSTs. Tokens are
// encrypted at rest (gatewaysStore) and never leave the runtime process; the
// engine injects them via the token-provider seam. The agent never handles
// tokens — the person clicks Connect in the dashboard.
import { createHash, randomBytes } from "node:crypto";
import type { Config } from "./config.js";
import type { GatewayManifest } from "./gatewayManifests.js";
import { GatewayRequestError, _setOauthTokenProvider } from "./gatewayEngine.js";
import { getGatewayEntry } from "./gatewayManifests.js";
import {
  GatewaysError, getGatewayConfig, getGatewayLink, loadOauthTokens, saveOauthTokens, setNeedsReauth, oauthState,
} from "./gatewaysStore.js";
import { readValueBySlug } from "./secretsStore.js";
import { getUsesDb, listUses } from "./services/gateways.js";
import { emitGatewayChange, emitGatewayHealth } from "./gatewayEvents.js";

const PENDING_TTL_MS = 10 * 60_000;
const EXPIRY_SKEW_MS = 30_000;

interface Pending {
  appId: string;
  alias: string;
  providerId: string;
  verifier: string | null;
  createdAt: number;
}

let cfgRef: Config | null = null;
const pending = new Map<string, Pending>(); // state → Pending, in-memory only

type Oauth2 = Extract<GatewayManifest["auth"], { kind: "oauth2" }>;

function oauthManifest(appId: string, alias: string): { providerId: string; manifest: GatewayManifest; auth: Oauth2 } {
  if (!cfgRef) throw new GatewayRequestError("unavailable", "oauth not initialized");
  const use = listUses(getUsesDb(cfgRef.dataDir, appId)).find((u) => u.alias === alias);
  if (!use?.def) throw new GatewayRequestError("unconfigured", `unknown gateway alias "${alias}"`);
  const entry = getGatewayEntry(use.def.provider);
  if (!entry?.manifest) throw new GatewayRequestError("unconfigured", `gateway "${use.def.provider}" is missing or invalid`);
  if (entry.manifest.auth.kind !== "oauth2") throw new GatewaysError(`gateway "${use.def.provider}" does not use OAuth`);
  return { providerId: use.def.provider, manifest: entry.manifest, auth: entry.manifest.auth };
}

function clientId(auth: Oauth2, appId: string, alias: string): string {
  const v = getGatewayConfig(appId, alias, auth.client_id_slot);
  if (!v) throw new GatewayRequestError("unconfigured", `set the "${auth.client_id_slot}" config slot before connecting`);
  return v;
}

function clientSecret(auth: Oauth2, appId: string, alias: string): string | null {
  if (!auth.client_secret_slot) return null;
  const link = getGatewayLink(appId, alias, auth.client_secret_slot);
  if (!link) throw new GatewayRequestError("unconfigured", `link the "${auth.client_secret_slot}" secret slot before connecting`);
  return readValueBySlug(link.slug);
}

function redirectUri(): string {
  if (!cfgRef) throw new GatewayRequestError("unavailable", "oauth not initialized");
  return `${cfgRef.baseUrl}/api/gateways/oauth/callback`;
}

function sweepPending(now: number): void {
  for (const [state, p] of pending) {
    if (now - p.createdAt > PENDING_TTL_MS) pending.delete(state);
  }
}

export function initGatewayOauth(cfg: Config): void {
  cfgRef = cfg;
  pending.clear();
  _setOauthTokenProvider(tokenProvider);
}

export function resetGatewayOauthForTest(): void {
  cfgRef = null;
  pending.clear();
  _setOauthTokenProvider(null);
}

export function startOauth(appId: string, alias: string): { authorizeUrl: string } {
  const { providerId, auth } = oauthManifest(appId, alias);
  const id = clientId(auth, appId, alias);
  clientSecret(auth, appId, alias); // fail unconfigured now, not at the callback
  const now = Date.now();
  sweepPending(now);
  const state = randomBytes(16).toString("hex");
  const usePkce = auth.pkce !== false;
  const verifier = usePkce ? randomBytes(32).toString("base64url") : null;
  pending.set(state, { appId, alias, providerId, verifier, createdAt: now });
  const u = new URL(auth.authorization_url);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", id);
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("state", state);
  if (auth.scopes?.length) u.searchParams.set("scope", auth.scopes.join(" "));
  if (verifier) {
    u.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
    u.searchParams.set("code_challenge_method", "S256");
  }
  return { authorizeUrl: u.toString() };
}

async function tokenPost(auth: Oauth2, params: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const res = await fetch(auth.token_url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string } | null;
  if (!res.ok || !body?.access_token) {
    throw new GatewaysError(`token request failed: ${body?.error ?? res.status}`);
  }
  return body as { access_token: string; refresh_token?: string; expires_in?: number };
}

export async function handleOauthCallback(query: { code?: string; state?: string; error?: string }): Promise<{ appId: string; alias: string }> {
  sweepPending(Date.now());
  const p = query.state ? pending.get(query.state) : undefined;
  if (query.state) pending.delete(query.state); // single-use, success or not
  if (!p) throw new GatewaysError("this connection request is unknown or expired — go back and click Connect again");
  if (query.error || !query.code) throw new GatewaysError(`the provider declined: ${query.error ?? "no code returned"}`);
  const { auth } = oauthManifest(p.appId, p.alias);
  const params: Record<string, string> = {
    grant_type: "authorization_code",
    code: query.code,
    redirect_uri: redirectUri(),
    client_id: clientId(auth, p.appId, p.alias),
  };
  const secret = clientSecret(auth, p.appId, p.alias);
  if (secret) params.client_secret = secret;
  if (p.verifier) params.code_verifier = p.verifier;
  const t = await tokenPost(auth, params);
  saveOauthTokens(p.appId, p.alias, {
    accessToken: t.access_token,
    ...(t.refresh_token ? { refreshToken: t.refresh_token } : {}),
    ...(t.expires_in ? { expiresAt: Date.now() + t.expires_in * 1000 } : {}),
  });
  emitGatewayChange(p.appId, p.alias);
  return { appId: p.appId, alias: p.alias };
}

// The engine's token provider (spec §7): stored token, refreshed transparently
// when expired; a failed refresh flips the connection to needs-reauth.
async function tokenProvider(
  providerId: string, manifest: GatewayManifest, appId: string, alias: string
): Promise<{ token: string; redact: string[] }> {
  const auth = manifest.auth as Oauth2;
  if (oauthState(appId, alias) === "needs_reauth") {
    throw new GatewayRequestError("needs_reauth", `reconnect the ${manifest.name} gateway in the dashboard`);
  }
  const tokens = loadOauthTokens(appId, alias);
  if (!tokens) throw new GatewayRequestError("unconfigured", `connect the ${manifest.name} gateway in the dashboard`);
  const redact = [tokens.refreshToken ?? ""].filter(Boolean);
  const expired = tokens.expiresAt !== undefined && tokens.expiresAt - EXPIRY_SKEW_MS <= Date.now();
  if (!expired) return { token: tokens.accessToken, redact };
  if (!tokens.refreshToken) {
    setNeedsReauth(appId, alias, true);
    emitGatewayHealth(appId, { alias, provider: providerId, status: "needs_reauth" });
    throw new GatewayRequestError("needs_reauth", `the ${manifest.name} token expired and no refresh token exists — reconnect`);
  }
  // clientId/clientSecret can throw GatewayRequestError (unconfigured) or
  // SecretsUnavailableError (degraded keychain) — those propagate untouched,
  // the engine maps them without a durable flag. Only a refresh the provider
  // itself answered and declined (tokenPost's GatewaysError) is sticky.
  const params: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
    client_id: clientId(auth, appId, alias),
  };
  const secret = clientSecret(auth, appId, alias);
  if (secret) params.client_secret = secret;
  let t: { access_token: string; refresh_token?: string; expires_in?: number };
  try {
    t = await tokenPost(auth, params);
  } catch (e) {
    if (e instanceof GatewaysError) {
      setNeedsReauth(appId, alias, true);
      emitGatewayHealth(appId, { alias, provider: providerId, status: "needs_reauth" });
      throw new GatewayRequestError("needs_reauth", `the ${manifest.name} session could not be refreshed — reconnect in the dashboard`);
    }
    // A network/timeout failure reaching the provider — transient, not the
    // person's problem to fix by reconnecting. Leave needs_reauth untouched.
    throw new GatewayRequestError("unavailable", "token refresh could not reach the provider");
  }
  saveOauthTokens(appId, alias, {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? tokens.refreshToken, // rotate when offered
    ...(t.expires_in ? { expiresAt: Date.now() + t.expires_in * 1000 } : {}),
  });
  return { token: t.access_token, redact: [t.refresh_token ?? tokens.refreshToken] };
}
