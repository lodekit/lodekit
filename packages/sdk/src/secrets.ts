// The declaration side of the secret-store (spec 2026-07-07-secret-store §5):
// slot builders + a thin validator/tagger, PLUS the typed read facade.
// appWorkerEntry scans the built src/secrets.ts DEFAULT export for the
// __lodekitSecrets marker and posts `slots` as the secrets manifest; full
// validation is engine-side. get() delegates to the SDK singleton's
// `secrets` handle (bound by index.ts at module init) — server-only.
import type { Secrets } from "./client.js";

export interface SecretSlotDef {
  label: string;
  description: string;
}

export const secret = (cfg: SecretSlotDef): SecretSlotDef => ({ ...cfg });

export type SecretSlots = Record<string, SecretSlotDef>;

/** Thrown by secrets.get(): reason "unlinked" (link it in the dashboard) or
 * "unavailable" (secret store degraded). Render a "configure me" state. */
export class SecretUnavailableError extends Error {
  constructor(
    public readonly reason: "unlinked" | "unavailable",
    message?: string
  ) {
    super(message ?? `secret ${reason}`);
    this.name = "SecretUnavailableError";
  }
}

export interface DefinedSecrets<S extends SecretSlots> {
  __lodekitSecrets: true;
  slots: S;
  get<K extends keyof S & string>(slot: K): Promise<string>;
}

const SLOT_RE = /^[a-z0-9_]+$/;

let bound: Secrets | null = null;
/** @internal wired by index.ts to the SDK singleton */
export function _bindSecrets(s: Secrets): void { bound = s; }
function handle(): Secrets {
  if (!bound) throw new Error("secrets unavailable (no bound client — outside an app build?)");
  return bound;
}

export function defineSecrets<S extends SecretSlots>(slots: S): DefinedSecrets<S> {
  for (const [key, s] of Object.entries(slots)) {
    if (!SLOT_RE.test(key) || key.length > 64) throw new Error(`defineSecrets(): invalid slot "${key}" (snake_case, max 64)`);
    if (typeof s?.label !== "string" || !s.label) throw new Error(`defineSecrets(): "${key}" needs a label`);
    if (typeof s?.description !== "string" || !s.description) throw new Error(`defineSecrets(): "${key}" needs a description`);
  }
  return {
    __lodekitSecrets: true,
    slots,
    get: (slot) => handle().get(slot),
  };
}
