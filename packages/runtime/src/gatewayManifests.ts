// Gateway manifests (spec 2026-07-10-gateways §4): the gateways tree
// (<root>/gateways/<provider-id>/manifest.json + favicon) loaded into an
// in-memory registry. The tree on disk is the source of truth — nothing
// manifest-shaped is copied into SQLite. An invalid manifest degrades, never
// dies: the entry carries its error; calls against it fail typed.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Config } from "./config.js";

export const PROVIDER_ID_RE = /^[a-z0-9-]+$/;
const SLOT_RE = /^[a-z0-9_]+$/;
const RATE_RE = /^\d+\/(second|sec|s|minute|min|m|hour|hr|h)$/;
const SLOT_NAME = z.string().regex(SLOT_RE).max(64);
const FAVICON_NAMES = ["favicon.svg", "favicon.png", "favicon.ico"];

// http:// is allowed only toward the person's own network (a local Home
// Assistant) — loopback, RFC-1918, and mDNS .local names. Public hosts get https.
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h === "::1" || h.endsWith(".local")) return true;
  const m = h.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

const slotDef = z.object({
  kind: z.enum(["secret", "config"]),
  label: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  optional: z.boolean().optional(),
});

const auth = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({
    kind: z.literal("api_key"),
    in: z.enum(["query", "header"]),
    param: z.string().min(1).max(100).optional(),
    header: z.string().min(1).max(100).optional(),
    slot: SLOT_NAME,
  }),
  z.object({ kind: z.literal("bearer"), slot: SLOT_NAME }),
  z.object({ kind: z.literal("basic"), username_slot: SLOT_NAME, password_slot: SLOT_NAME }),
  z.object({
    kind: z.literal("oauth2"),
    authorization_url: z.string().url(),
    token_url: z.string().url(),
    scopes: z.array(z.string().min(1).max(100)).max(20).optional(),
    pkce: z.boolean().optional(), // default true, applied at use
    client_id_slot: SLOT_NAME,
    client_secret_slot: SLOT_NAME.optional(),
  }),
]);

export const manifestSchema = z
  .object({
    name: z.string().min(1).max(100),
    website: z.string().url().optional(),
    base_url: z.union([z.string().url(), z.object({ from_slot: SLOT_NAME })]),
    auth,
    slots: z.record(SLOT_NAME, slotDef).default({}),
    limits: z
      .object({
        rate: z.string().regex(RATE_RE).optional(),
        concurrency: z.number().int().min(1).max(32).optional(),
        timeout_ms: z.number().int().min(100).max(60_000).optional(),
      })
      .optional(),
  })
  .superRefine((m, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    // z.string().url() accepts any scheme (javascript: included) — every URL the
    // dashboard renders as a link or opens must be pinned to http(s) here.
    // publicHttpOk: website is just a link, so plain http is fine anywhere;
    // credential endpoints get the base_url rule (https, or http toward the
    // person's own network only — a local IdP is legit).
    const httpOnly = (url: string, field: string, publicHttpOk: boolean) => {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") issue(`${field} must be http(s)`);
      else if (u.protocol === "http:" && !publicHttpOk && !isPrivateHost(u.hostname)) {
        issue(`http ${field} is allowed only for localhost/private hosts`);
      }
    };
    if (m.website) httpOnly(m.website, "website", true);
    // Every slot the auth recipe (or base_url) references must be declared with
    // the right kind: credentials are secret slots; client ids / base URLs are config.
    const needs: [string, "secret" | "config"][] = [];
    const a = m.auth;
    if (a.kind === "api_key") {
      if (a.in === "query" && !a.param) issue('api_key in "query" needs "param"');
      if (a.in === "header" && !a.header) issue('api_key in "header" needs "header"');
      needs.push([a.slot, "secret"]);
    }
    if (a.kind === "bearer") needs.push([a.slot, "secret"]);
    if (a.kind === "basic") needs.push([a.username_slot, "secret"], [a.password_slot, "secret"]);
    if (a.kind === "oauth2") {
      httpOnly(a.authorization_url, "authorization_url", false);
      httpOnly(a.token_url, "token_url", false);
      needs.push([a.client_id_slot, "config"]);
      if (a.client_secret_slot) needs.push([a.client_secret_slot, "secret"]);
    }
    if (typeof m.base_url === "string") {
      httpOnly(m.base_url, "base_url", false);
    } else {
      needs.push([m.base_url.from_slot, "config"]);
    }
    for (const [slot, kind] of needs) {
      const def = m.slots[slot];
      if (!def) issue(`referenced slot "${slot}" is not declared`);
      else if (def.kind !== kind) issue(`slot "${slot}" must be kind "${kind}"`);
    }
  });

export type GatewayManifest = z.infer<typeof manifestSchema>;

export interface GatewayEntry {
  providerId: string;
  manifest: GatewayManifest | null;
  error: string | null;
  dir: string;
  faviconFile: string | null;
}

let registry = new Map<string, GatewayEntry>();
let cfgRef: Config | null = null;

function loadEntry(gatewaysDir: string, providerId: string): GatewayEntry {
  const dir = path.join(gatewaysDir, providerId);
  const faviconFile = FAVICON_NAMES.map((f) => path.join(dir, f)).find((f) => fs.existsSync(f)) ?? null;
  const file = path.join(dir, "manifest.json");
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    const parsed = manifestSchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
      return { providerId, manifest: null, error: msg, dir, faviconFile };
    }
    return { providerId, manifest: parsed.data, error: null, dir, faviconFile };
  } catch (e) {
    return { providerId, manifest: null, error: e instanceof Error ? e.message : String(e), dir, faviconFile };
  }
}

function scan(gatewaysDir: string): Map<string, GatewayEntry> {
  const next = new Map<string, GatewayEntry>();
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(gatewaysDir, { withFileTypes: true });
  } catch {
    return next; // no gateways tree yet — an empty registry, not an error
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (!PROVIDER_ID_RE.test(e.name) || e.name.length > 64) continue; // .DS_Store-class noise
    next.set(e.name, loadEntry(gatewaysDir, e.name));
  }
  return next;
}

export function initGatewayManifests(cfg: Config): void {
  cfgRef = cfg;
  registry = scan(cfg.gatewaysDir);
}

/** Rescan the tree; returns the provider ids whose entry changed, appeared, or vanished. */
export function reloadGatewayManifests(): string[] {
  if (!cfgRef) return [];
  const next = scan(cfgRef.gatewaysDir);
  const changed: string[] = [];
  for (const id of new Set([...registry.keys(), ...next.keys()])) {
    const a = registry.get(id), b = next.get(id);
    if (!a || !b || JSON.stringify(a) !== JSON.stringify(b)) changed.push(id);
  }
  registry = next;
  return changed.sort();
}

export function listGatewayEntries(): GatewayEntry[] {
  return [...registry.values()].sort((a, b) => a.providerId.localeCompare(b.providerId));
}

export function getGatewayEntry(providerId: string): GatewayEntry | undefined {
  return registry.get(providerId);
}

export function resetGatewayManifestsForTest(): void {
  registry = new Map();
  cfgRef = null;
}
