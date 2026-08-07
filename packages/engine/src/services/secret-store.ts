// The secret-store service (spec 2026-07-07-secret-store): the person's
// credentials. Person writes the catalog (dashboard/HTTP), apps declare slots
// (src/secrets.ts via the worker-boot manifest), the person links secrets to
// slots (the grant), and server-side app code reads values through the
// worker-token door. Catalog + links live in secretsStore; slot declarations
// live in the app's own db (settings' _setting_defs pattern).
import fs from "node:fs";
import path from "node:path";
import type { ManagedDb } from "../sqlite.js";
import { Hono, type MiddlewareHandler } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getAppDb } from "../db.js";
import { isValidAppId } from "../registry.js";
import type { Config } from "../config.js";
import { emitEvent, CHANGE_FEED_TTL_S } from "../events.js";
import { emitLog } from "../logger.js";
import { validationHook } from "../validation.js";
import { verifyWorkerToken } from "../appWorker.js";
import {
  pruneLinks, SecretsError, SecretsNotFoundError, SecretUnlinkedError, SecretsUnavailableError,
  createSecret, updateSecret, deleteSecret, listSecrets,
  setLink, deleteLink, getLinkedSecret, readValue, VALUE_MAX_BYTES,
} from "../secretsStore.js";

export const CATALOG_NAME = "secret-store";

export const SLOT_RE = /^[a-z0-9_]+$/;

export interface SlotDef {
  label: string;
  description: string;
}

// Identity-only facts (spec §4): catalog changes (app null) carry { slug }; an app's
// slot changes carry { slot } — names only, never values.
type SecretFact = "secret-created" | "secret-updated" | "secret-deleted" | "slot-linked" | "slot-unlinked" | "defs-changed";
function emitSecretEvent(app: string | null, type: SecretFact, payload?: Record<string, unknown>): void {
  emitEvent({ app, kind: "service", component: CATALOG_NAME, type, payload, ttl: CHANGE_FEED_TTL_S });
}

// ---------- slot declarations (per-app db) ----------

export function getSlotsDb(dataDir: string, appId: string): ManagedDb {
  return getAppDb(dataDir, appId);
}

function validateSlotDef(slot: string, raw: unknown): SlotDef {
  const r = raw as Partial<SlotDef> | null;
  if (!r || typeof r !== "object") throw new SecretsError(`"${slot}" is not a slot definition`);
  if (typeof r.label !== "string" || !r.label.trim()) throw new SecretsError(`"${slot}" needs a label`);
  if (typeof r.description !== "string" || !r.description.trim()) throw new SecretsError(`"${slot}" needs a description`);
  return { label: r.label, description: r.description };
}

// Wholesale per successful boot (spec §5): slots absent from the manifest are
// removed and their links pruned; a bad slot registers with its error and
// never poisons siblings.
export function applySecretsManifest(cfg: Config, appId: string, slots: Record<string, unknown>, now: number): void {
  const db = getSlotsDb(cfg.dataDir, appId);
  const kept = new Set<string>();
  const txn = db.transaction(() => {
    for (const [slot, raw] of Object.entries(slots)) {
      if (typeof slot !== "string" || !SLOT_RE.test(slot) || slot.length > 64) continue;
      kept.add(slot);
      let def: SlotDef | null = null, error: string | null = null;
      try {
        def = validateSlotDef(slot, raw);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      db.prepare(
        `INSERT INTO _secret_slots (slot, def, error, registered_at)
         VALUES (@slot, @def, @error, @now)
         ON CONFLICT(slot) DO UPDATE SET def = excluded.def, error = excluded.error, registered_at = excluded.registered_at`
      ).run({ slot, def: def ? JSON.stringify(def) : null, error, now });
    }
    const existing = db.prepare("SELECT slot FROM _secret_slots").all() as { slot: string }[];
    for (const { slot } of existing) {
      if (!kept.has(slot)) db.prepare("DELETE FROM _secret_slots WHERE slot = ?").run(slot);
    }
  });
  txn();
  try {
    pruneLinks(appId, kept);
  } catch {
    // links live in the platform store — if it's degraded, stale links are
    // harmless (readValue is equally degraded) and re-pruned next boot
  }
}

// The onSecretsManifest callback: a worker booted and reported its declared
// slots. A load error is NOT an empty manifest — previous slots survive it.
export function registerSecretsManifest(cfg: Config, appId: string, slots: Record<string, unknown>, loadError?: string): void {
  if (!isValidAppId(appId)) return; // _dashboard sits outside the app-id grammar
  if (loadError) {
    emitLog("error", "secrets", "secrets module failed to load", { stack: loadError }, appId);
    emitSecretEvent(appId, "defs-changed");
    return;
  }
  // Never materialize a data dir for an app that has never used secrets.
  if (Object.keys(slots).length === 0 && !fs.existsSync(path.join(cfg.dataDir, appId, "db.sqlite"))) return;
  applySecretsManifest(cfg, appId, slots, Date.now());
  emitSecretEvent(appId, "defs-changed"); // slots changed — dashboard refetches
}

export function listSlots(db: ManagedDb): { slot: string; def: SlotDef | null; error: string | null }[] {
  const rows = db.prepare("SELECT slot, def, error FROM _secret_slots ORDER BY slot").all() as
    { slot: string; def: string | null; error: string | null }[];
  return rows.map((r) => ({ slot: r.slot, def: r.def ? (JSON.parse(r.def) as SlotDef) : null, error: r.error }));
}

// ---------- HTTP surface (spec §8) ----------

// Spec §8 error mapping, shared by both routers (settings' onError pattern).
function errStatus(err: unknown): 400 | 404 | 409 | 500 | 503 {
  if (err instanceof SecretsUnavailableError) return 503;
  if (err instanceof SecretUnlinkedError) return 409;
  if (err instanceof SecretsNotFoundError) return 404;
  if (err instanceof SecretsError) return 400;
  return 500;
}

const slugParam = z.object({ slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(128) });
const slotParam = z.object({ slot: z.string().regex(SLOT_RE).max(64) });
const createBody = z.object({
  label: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  value: z.string().min(1).max(VALUE_MAX_BYTES),
});
const updateBody = z
  .object({
    label: z.string().min(1).max(200).optional(),
    description: z.string().max(500).optional(),
    value: z.string().min(1).max(VALUE_MAX_BYTES).optional(),
  })
  .refine((b) => b.label !== undefined || b.description !== undefined || b.value !== undefined, {
    message: "nothing to update",
  });
const linkBody = z.object({ slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(128) });

export const platformSecretsRoutes = new Hono()
  .onError((err, c) => c.json({ error: err instanceof Error ? err.message : String(err) }, errStatus(err)))
  .get("/", (c) => c.json({ secrets: listSecrets() }))
  .post("/", zValidator("json", createBody, validationHook), (c) => {
    const meta = createSecret(c.req.valid("json"));
    emitSecretEvent(null, "secret-created", { slug: meta.slug });
    return c.json(meta, 201);
  })
  .put("/:slug", zValidator("param", slugParam, validationHook), zValidator("json", updateBody, validationHook), (c) => {
    const { slug } = c.req.valid("param");
    const meta = updateSecret(slug, c.req.valid("json"));
    emitSecretEvent(null, "secret-updated", { slug });
    return c.json(meta);
  })
  .delete("/:slug", zValidator("param", slugParam, validationHook), (c) => {
    const { slug } = c.req.valid("param");
    const { removedLinks } = deleteSecret(slug);
    emitSecretEvent(null, "secret-deleted", { slug });
    for (const l of removedLinks) emitSecretEvent(l.appId, "slot-unlinked", { slot: l.slot }); // cascaded → pending
    return c.json({ ok: true as const });
  });

export type PlatformSecretsRoutes = typeof platformSecretsRoutes;

export type SecretsEnv = { Variables: { slotsDb: ManagedDb; appId: string } };

export function withSecrets(cfg: Config): MiddlewareHandler<SecretsEnv> {
  return async (c, next) => {
    const appId = c.req.param("appId");
    if (!appId || !isValidAppId(appId)) return c.json({ error: "invalid app id" }, 400);
    c.set("slotsDb", getSlotsDb(cfg.dataDir, appId));
    c.set("appId", appId);
    await next();
  };
}

// 404 gate shared by the slot routes: the slot must be declared.
function requireSlot(db: ManagedDb, slot: string): void {
  if (!db.prepare("SELECT 1 FROM _secret_slots WHERE slot = ?").get(slot)) {
    throw new SecretsNotFoundError(`unknown slot "${slot}"`);
  }
}

export const appSecretsRoutes = new Hono<SecretsEnv>()
  .onError((err, c) => c.json({ error: err instanceof Error ? err.message : String(err) }, errStatus(err)))
  .get("/", (c) => {
    const slots = listSlots(c.var.slotsDb).map((s) => {
      const secret = s.def ? getLinkedSecret(c.var.appId, s.slot) ?? null : null;
      return {
        slot: s.slot,
        label: s.def?.label ?? null,
        description: s.def?.description ?? null,
        error: s.error,
        status: secret ? ("linked" as const) : ("pending" as const),
        secret,
      };
    });
    return c.json({ slots });
  })
  .put("/:slot/link", zValidator("param", slotParam, validationHook), zValidator("json", linkBody, validationHook), (c) => {
    const { slot } = c.req.valid("param");
    requireSlot(c.var.slotsDb, slot);
    setLink(c.var.appId, slot, c.req.valid("json").slug);
    emitSecretEvent(c.var.appId, "slot-linked", { slot });
    return c.json({ ok: true as const });
  })
  .delete("/:slot/link", zValidator("param", slotParam, validationHook), (c) => {
    const { slot } = c.req.valid("param");
    requireSlot(c.var.slotsDb, slot);
    deleteLink(c.var.appId, slot);
    emitSecretEvent(c.var.appId, "slot-unlinked", { slot });
    return c.json({ ok: true as const });
  })
  // The ONLY value-bearing route in the whole service (spec §8). Token first —
  // no oracle for probing link state without server-side standing (spec §7).
  .get("/:slot/value", zValidator("param", slotParam, validationHook), (c) => {
    if (!verifyWorkerToken(c.var.appId, c.req.header("x-lodekit-worker-token"))) {
      return c.json({ error: "secrets are server-only" }, 401);
    }
    const { slot } = c.req.valid("param");
    requireSlot(c.var.slotsDb, slot);
    return c.json({ value: readValue(c.var.appId, slot) });
  });

export type SecretsRoutes = typeof appSecretsRoutes;
