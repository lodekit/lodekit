// The gateways service (spec 2026-07-10-gateways): apps consume external
// providers through a host-side door. Manifests live on disk
// (gatewayManifests.ts), connection state in the platform store
// (gatewaysStore.ts), declarations here in the app's own db
// (the secrets _secret_slots pattern) — an app's `src/gateways.ts` aliases,
// registered wholesale per successful worker boot.
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { Hono, type MiddlewareHandler } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getAppDb } from "../db.js";
import { isValidAppId, scanApps } from "../registry.js";
import type { Config } from "../config.js";
import { emitLog } from "../logger.js";
import { validationHook } from "../validation.js";
import { verifyWorkerToken } from "../appWorker.js";
import { emitGatewayEvent } from "../gatewayEvents.js";
import {
  GatewaysError, GatewaysNotFoundError, pruneGatewayConnections,
  setGatewayLink, deleteGatewayLink, getGatewayLink,
  setGatewayConfig, deleteGatewayConfig, getGatewayConfig,
  oauthState, CONFIG_VALUE_MAX_BYTES,
} from "../gatewaysStore.js";
import { getGatewayEntry, listGatewayEntries, PROVIDER_ID_RE, type GatewayEntry } from "../gatewayManifests.js";
import { executeGatewayRequest, getConnectionHealth, clearConnectionHealth, GatewayRequestError, REASON_STATUS } from "../gatewayExecutor.js";
import { SecretsUnavailableError } from "../secretsStore.js";
import { startOauth, handleOauthCallback } from "../gatewayOauth.js";
import { checkEgress, EgressDeniedError, type LookupFn } from "../gatewayEgress.js";

let egressLookupOverride: LookupFn | null = null;
/** Test seam — pins the egress resolver for set-time validation. */
export function setGatewaysEgressLookupForTest(fn: LookupFn | null): void {
  egressLookupOverride = fn;
}

export const CATALOG_NAME = "gateways";

export const ALIAS_RE = /^[a-z0-9_]+$/;

export interface UseDef {
  provider: string;
  description: string | null;
}

// ---------- declarations (per-app db) ----------

export function getUsesDb(dataDir: string, appId: string): Database.Database {
  return getAppDb(dataDir, appId);
}

function validateUseDef(alias: string, raw: unknown): UseDef {
  const r = raw as { provider?: unknown; description?: unknown } | null;
  if (!r || typeof r !== "object") throw new GatewaysError(`"${alias}" is not a gateway declaration`);
  if (typeof r.provider !== "string" || !PROVIDER_ID_RE.test(r.provider) || r.provider.length > 64) {
    throw new GatewaysError(`"${alias}" needs a valid provider id (lowercase letters, digits, dashes)`);
  }
  const description = typeof r.description === "string" && r.description.trim() ? r.description : null;
  return { provider: r.provider, description };
}

// Wholesale per successful boot (spec §5): aliases absent from the manifest
// are removed and their links/config/tokens pruned; a bad def registers with
// its error and never poisons siblings.
export function applyGatewaysManifest(cfg: Config, appId: string, uses: Record<string, unknown>, now: number): void {
  const db = getUsesDb(cfg.dataDir, appId);
  db.exec(
    `CREATE TABLE IF NOT EXISTS _gateway_uses (
      alias         TEXT PRIMARY KEY,
      def           TEXT,          -- JSON UseDef; NULL when the declaration failed
      error         TEXT,          -- per-alias declaration error (spec §5)
      registered_at INTEGER NOT NULL
    );`
  );
  const kept = new Set<string>();
  const txn = db.transaction(() => {
    for (const [alias, raw] of Object.entries(uses)) {
      if (typeof alias !== "string" || !ALIAS_RE.test(alias) || alias.length > 64) continue;
      kept.add(alias);
      let def: UseDef | null = null, error: string | null = null;
      try {
        def = validateUseDef(alias, raw);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      db.prepare(
        `INSERT INTO _gateway_uses (alias, def, error, registered_at)
         VALUES (@alias, @def, @error, @now)
         ON CONFLICT(alias) DO UPDATE SET def = excluded.def, error = excluded.error, registered_at = excluded.registered_at`
      ).run({ alias, def: def ? JSON.stringify(def) : null, error, now });
    }
    const existing = db.prepare("SELECT alias FROM _gateway_uses").all() as { alias: string }[];
    for (const { alias } of existing) {
      if (!kept.has(alias)) db.prepare("DELETE FROM _gateway_uses WHERE alias = ?").run(alias);
    }
  });
  txn();
  try {
    pruneGatewayConnections(appId, kept);
  } catch {
    // connection state lives in the platform store — if it's degraded, stale
    // rows are harmless (the engine is equally degraded) and re-pruned next boot
  }
}

// The onGatewaysManifest callback: a worker booted and reported its declared
// aliases. A load error is NOT an empty manifest — previous uses survive it.
export function registerGatewaysManifest(cfg: Config, appId: string, uses: Record<string, unknown>, loadError?: string): void {
  if (!isValidAppId(appId)) return; // _dashboard sits outside the app-id grammar
  if (loadError) {
    emitLog("error", "gateways", "gateways module failed to load", { stack: loadError }, appId);
    emitGatewayEvent(appId, "defs-changed");
    return;
  }
  // Never materialize a data dir for an app that has never used gateways.
  if (Object.keys(uses).length === 0 && !fs.existsSync(path.join(cfg.dataDir, appId, "db.sqlite"))) return;
  applyGatewaysManifest(cfg, appId, uses, Date.now());
  emitGatewayEvent(appId, "defs-changed"); // declarations changed — dashboard refetches
}

export function listUses(db: Database.Database): { alias: string; def: UseDef | null; error: string | null }[] {
  const hasTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_gateway_uses'").get();
  if (!hasTable) return [];
  const rows = db.prepare("SELECT alias, def, error FROM _gateway_uses ORDER BY alias").all() as
    { alias: string; def: string | null; error: string | null }[];
  return rows.map((r) => ({ alias: r.alias, def: r.def ? (JSON.parse(r.def) as UseDef) : null, error: r.error }));
}

// ---------- HTTP surface (spec §6/§8/§12) ----------

// For the oauth callback's HTML pages (server.ts's fallback-page escape):
// failure messages can echo provider-controlled strings (?error=, token-
// endpoint error codes) — never render them unescaped.
const escapeHtml = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

// Error mapping shared by both routers: typed engine failures carry their
// reason in the body so the SDK maps them without status-code archaeology.
function errResponse(err: unknown) {
  if (err instanceof GatewayRequestError) {
    return { body: { error: err.message, reason: err.reason }, status: REASON_STATUS[err.reason] };
  }
  if (err instanceof SecretsUnavailableError) return { body: { error: err.message }, status: 503 as const };
  if (err instanceof GatewaysNotFoundError) return { body: { error: err.message }, status: 404 as const };
  if (err instanceof GatewaysError) return { body: { error: err.message }, status: 400 as const };
  return { body: { error: err instanceof Error ? err.message : String(err) }, status: 500 as const };
}

const providerParam = z.object({ providerId: z.string().regex(PROVIDER_ID_RE).max(64) });
const aliasParam = z.object({ alias: z.string().regex(ALIAS_RE).max(64) });
const aliasSlotParam = z.object({
  alias: z.string().regex(ALIAS_RE).max(64),
  slot: z.string().regex(ALIAS_RE).max(64),
});
const linkBody = z.object({ slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(128) });
const valueBody = z.object({ value: z.string().min(1).max(CONFIG_VALUE_MAX_BYTES) });
const requestBody = z
  .object({
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]),
    path: z.string().regex(/^\//).max(2048),
    query: z.record(z.string().max(200), z.string().max(4096)).optional(),
    headers: z.record(z.string().max(100), z.string().max(4096)).optional(),
    body: z.string().optional(),
    bodyBase64: z.string().optional(),
    timeoutMs: z.number().int().positive().optional(),
  })
  .refine((b) => !(b.body !== undefined && b.bodyBase64 !== undefined), { message: "body and bodyBase64 are exclusive" });

function gatewaySummary(e: GatewayEntry) {
  const m = e.manifest;
  return {
    providerId: e.providerId,
    name: m?.name ?? e.providerId,
    website: m?.website ?? null,
    authKind: m?.auth.kind ?? null,
    error: e.error,
    hasFavicon: e.faviconFile !== null,
    limits: m?.limits ?? null,
  };
}

function slotDefs(e: GatewayEntry) {
  return Object.entries(e.manifest?.slots ?? {}).map(([slot, d]) => ({
    slot, kind: d.kind, label: d.label, description: d.description ?? null, optional: d.optional ?? false,
  }));
}

/** One app's connection docs — slot state, oauth state, derived status. */
export function connectionDocsForApp(cfg: Config, appId: string) {
  return listUses(getUsesDb(cfg.dataDir, appId)).map(({ alias, def, error }) => {
    const entry = def ? getGatewayEntry(def.provider) : undefined;
    const m = entry?.manifest ?? null;
    const slots = m
      ? Object.entries(m.slots).map(([slot, d]) => {
          if (d.kind === "secret") {
            const secret = getGatewayLink(appId, alias, slot) ?? null;
            return {
              slot, kind: d.kind, label: d.label, description: d.description ?? null,
              optional: d.optional ?? false,
              status: secret ? ("linked" as const) : ("pending" as const), secret, value: null,
            };
          }
          const value = getGatewayConfig(appId, alias, slot) ?? null;
          return {
            slot, kind: d.kind, label: d.label, description: d.description ?? null,
            optional: d.optional ?? false,
            status: value !== null ? ("set" as const) : ("pending" as const), secret: null, value,
          };
        })
      : [];
    const oauth = m?.auth.kind === "oauth2" ? { status: oauthState(appId, alias) } : null;
    const declError =
      error ??
      (def && !entry
        ? `no gateway "${def.provider}" — ask your agent to author gateways/${def.provider}/manifest.json`
        : def && entry && entry.error
          ? `gateway manifest invalid: ${entry.error}`
          : null);
    let status: "error" | "needs_setup" | "needs_reauth" | "unhealthy" | "connected";
    if (declError) status = "error";
    else if (slots.some((s) => !s.optional && s.status === "pending") || oauth?.status === "none") status = "needs_setup";
    else if (oauth?.status === "needs_reauth") status = "needs_reauth";
    else if (getConnectionHealth(appId, alias) === "unhealthy") status = "unhealthy";
    else status = "connected";
    return {
      alias, provider: def?.provider ?? null, providerName: m?.name ?? def?.provider ?? null,
      description: def?.description ?? null, error: declError, status, slots, oauth,
    };
  });
}

function collectConnections(cfg: Config): { appId: string; alias: string; provider: string }[] {
  const out: { appId: string; alias: string; provider: string }[] = [];
  for (const app of scanApps(cfg.appsDir)) {
    for (const u of listUses(getUsesDb(cfg.dataDir, app.appId))) {
      if (u.def) out.push({ appId: app.appId, alias: u.alias, provider: u.def.provider });
    }
  }
  return out;
}

const FAVICON_TYPES: Record<string, string> = {
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};

export function platformGatewaysRoutes(cfg: Config) {
  return new Hono()
    .onError((err, c) => {
      const { body, status } = errResponse(err);
      return c.json(body, status);
    })
    .get("/", (c) => {
      const connections = collectConnections(cfg);
      const gateways = listGatewayEntries().map((e) => ({
        ...gatewaySummary(e),
        apps: connections
          .filter((x) => x.provider === e.providerId)
          .map(({ appId, alias }) => ({ appId, alias })),
      }));
      return c.json({ gateways });
    })
    .get("/oauth/callback", async (c) => {
      // Belt-and-braces on top of the escaping: these pages need no scripts,
      // no fetches, nothing but their inline styles.
      c.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
      try {
        const { appId, alias } = await handleOauthCallback({
          code: c.req.query("code"), state: c.req.query("state"), error: c.req.query("error"),
        });
        return c.html(
          `<!doctype html><meta charset="utf-8"><title>Lodekit</title>
           <body style="font-family:ui-sans-serif,system-ui;max-width:480px;margin:20vh auto;text-align:center">
           <h2>Connected</h2><p>${escapeHtml(appId)} · ${escapeHtml(alias)} is connected. You can close this tab.</p></body>`
        );
      } catch (e) {
        return c.html(
          `<!doctype html><meta charset="utf-8"><title>Lodekit</title>
           <body style="font-family:ui-sans-serif,system-ui;max-width:480px;margin:20vh auto;text-align:center">
           <h2>Connection failed</h2><p>${escapeHtml(e instanceof Error ? e.message : String(e))}</p></body>`,
          400
        );
      }
    })
    .get("/:providerId/favicon", zValidator("param", providerParam, validationHook), (c) => {
      const e = getGatewayEntry(c.req.valid("param").providerId);
      if (!e?.faviconFile) return c.json({ error: "no favicon" }, 404);
      const ext = path.extname(e.faviconFile).toLowerCase();
      c.header("Content-Type", FAVICON_TYPES[ext] ?? "application/octet-stream");
      c.header("Cache-Control", "no-store");
      return c.body(fs.readFileSync(e.faviconFile));
    })
    .get("/:providerId", zValidator("param", providerParam, validationHook), (c) => {
      const { providerId } = c.req.valid("param");
      const e = getGatewayEntry(providerId);
      if (!e) throw new GatewaysNotFoundError(`unknown gateway "${providerId}"`);
      const connections = collectConnections(cfg)
        .filter((x) => x.provider === providerId)
        .flatMap(({ appId }) =>
          connectionDocsForApp(cfg, appId)
            .filter((d) => d.provider === providerId)
            .map((d) => ({ appId, ...d }))
        );
      // An app may hold several aliases on one provider; dedupe identical rows.
      const seen = new Set<string>();
      const deduped = connections.filter((x) => {
        const k = `${x.appId}\n${x.alias}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return c.json({ gateway: gatewaySummary(e), slots: slotDefs(e), connections: deduped });
    });
}

export type PlatformGatewaysRoutes = ReturnType<typeof platformGatewaysRoutes>;

export type GatewaysEnv = { Variables: { usesDb: Database.Database; appId: string } };

export function withGateways(cfg: Config): MiddlewareHandler<GatewaysEnv> {
  // appGatewaysRoutes is a plain chained const (for hc type inference), so it
  // has no cfg of its own — bind it here, at mount construction, once.
  bindGatewaysConfig(cfg);
  return async (c, next) => {
    const appId = c.req.param("appId");
    if (!appId || !isValidAppId(appId)) return c.json({ error: "invalid app id" }, 400);
    c.set("usesDb", getUsesDb(cfg.dataDir, appId));
    c.set("appId", appId);
    await next();
  };
}

// 404 gate shared by the per-alias routes: the alias must be declared; slot
// routes additionally resolve the provider's slot def (kind decides the verb).
function requireUse(db: Database.Database, alias: string): UseDef {
  const use = listUses(db).find((u) => u.alias === alias);
  if (!use) throw new GatewaysNotFoundError(`unknown gateway alias "${alias}"`);
  if (!use.def) throw new GatewaysError(use.error ?? "invalid gateway declaration");
  return use.def;
}

function requireSlotDef(db: Database.Database, alias: string, slot: string) {
  const def = requireUse(db, alias);
  const entry = getGatewayEntry(def.provider);
  if (!entry?.manifest) throw new GatewaysError(`gateway "${def.provider}" is missing or invalid`);
  const slotDef = entry.manifest.slots[slot];
  if (!slotDef) throw new GatewaysNotFoundError(`gateway "${def.provider}" declares no slot "${slot}"`);
  return slotDef;
}

let appCfg: Config | null = null;
/** The app router reads cfg through withGateways' closure sibling — set once at mount. */
export function bindGatewaysConfig(cfg: Config): void {
  appCfg = cfg;
}

export const appGatewaysRoutes = new Hono<GatewaysEnv>()
  .onError((err, c) => {
    const { body, status } = errResponse(err);
    return c.json(body, status);
  })
  .get("/", (c) => {
    if (!appCfg) return c.json({ error: "gateways not initialized" }, 503);
    return c.json({ connections: connectionDocsForApp(appCfg, c.var.appId) });
  })
  .put(
    "/:alias/slots/:slot/link",
    zValidator("param", aliasSlotParam, validationHook),
    zValidator("json", linkBody, validationHook),
    (c) => {
      const { alias, slot } = c.req.valid("param");
      const def = requireSlotDef(c.var.usesDb, alias, slot);
      if (def.kind !== "secret") throw new GatewaysError(`slot "${slot}" is a config slot — set a value instead`);
      setGatewayLink(c.var.appId, alias, slot, c.req.valid("json").slug);
      clearConnectionHealth(c.var.appId, alias);
      emitGatewayEvent(c.var.appId, "connection-linked", { alias, slot });
      return c.json({ ok: true as const });
    }
  )
  .delete("/:alias/slots/:slot/link", zValidator("param", aliasSlotParam, validationHook), (c) => {
    const { alias, slot } = c.req.valid("param");
    const def = requireSlotDef(c.var.usesDb, alias, slot);
    if (def.kind !== "secret") throw new GatewaysError(`slot "${slot}" is a config slot`);
    deleteGatewayLink(c.var.appId, alias, slot);
    clearConnectionHealth(c.var.appId, alias);
    emitGatewayEvent(c.var.appId, "connection-unlinked", { alias, slot });
    return c.json({ ok: true as const });
  })
  .put(
    "/:alias/slots/:slot/value",
    zValidator("param", aliasSlotParam, validationHook),
    zValidator("json", valueBody, validationHook),
    async (c) => {
      const { alias, slot } = c.req.valid("param");
      const def = requireSlotDef(c.var.usesDb, alias, slot);
      if (def.kind !== "config") throw new GatewaysError(`slot "${slot}" is a secret slot — link a secret instead`);
      const value = c.req.valid("json").value;
      // If this slot is the manifest's dynamic base URL, hold it to the same
      // egress policy the request path enforces (best-effort — DNS/manifest can
      // change after set-time; the executor stays authoritative). Spec §"Enforcement points".
      const useDef = requireUse(c.var.usesDb, alias);
      const entry = getGatewayEntry(useDef.provider);
      const baseUrl = entry?.manifest?.base_url;
      if (baseUrl && typeof baseUrl === "object" && baseUrl.from_slot === slot) {
        let url: URL;
        try { url = new URL(value); }
        catch { throw new GatewaysError(`"${value}" is not a valid URL`); }
        try {
          await checkEgress(entry!.manifest!, url, {
            ...(baseUrl.allowed_hosts ? { pins: baseUrl.allowed_hosts } : {}),
            ...(egressLookupOverride ? { lookup: egressLookupOverride } : {}),
          });
        } catch (e) {
          if (e instanceof EgressDeniedError) throw new GatewaysError(`base URL rejected: ${e.message}`);
          throw new GatewaysError("base URL host could not be resolved");
        }
      }
      setGatewayConfig(c.var.appId, alias, slot, value);
      clearConnectionHealth(c.var.appId, alias);
      emitGatewayEvent(c.var.appId, "connection-configured", { alias, slot });
      return c.json({ ok: true as const });
    }
  )
  .delete("/:alias/slots/:slot/value", zValidator("param", aliasSlotParam, validationHook), (c) => {
    const { alias, slot } = c.req.valid("param");
    const def = requireSlotDef(c.var.usesDb, alias, slot);
    if (def.kind !== "config") throw new GatewaysError(`slot "${slot}" is a secret slot`);
    deleteGatewayConfig(c.var.appId, alias, slot);
    clearConnectionHealth(c.var.appId, alias);
    emitGatewayEvent(c.var.appId, "connection-cleared", { alias, slot });
    return c.json({ ok: true as const });
  })
  .post("/:alias/oauth/start", zValidator("param", aliasParam, validationHook), (c) => {
    const { alias } = c.req.valid("param");
    requireUse(c.var.usesDb, alias);
    return c.json(startOauth(c.var.appId, alias));
  })
  // The ONLY traffic route (spec §6). Token first — no oracle for probing
  // connection state without server-side standing.
  .post(
    "/:alias/request",
    zValidator("param", aliasParam, validationHook),
    zValidator("json", requestBody, validationHook),
    async (c) => {
      if (!verifyWorkerToken(c.var.appId, c.req.header("x-lodekit-worker-token"))) {
        return c.json({ error: "gateways are server-only" }, 401);
      }
      const { alias } = c.req.valid("param");
      requireUse(c.var.usesDb, alias);
      return c.json(await executeGatewayRequest(c.var.appId, alias, c.req.valid("json")));
    }
  );

export type GatewaysRoutes = typeof appGatewaysRoutes;
