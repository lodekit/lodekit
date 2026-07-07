// The declaration side of the settings service (spec §5): builders + a thin
// validator/tagger, PLUS the typed read facade. appWorkerEntry scans the built
// src/settings.ts DEFAULT export for the __lodekitSettings marker and posts
// `fields` as the settings manifest; full validation is runtime-side.
// The facade methods delegate to the SDK singleton's `settings` handle
// (bound by index.ts at module init), so one import gives typed reads:
//   import settings from "./settings";  →  await settings.get("layout")
import type { Settings } from "./client.js";

interface FieldBase { label: string; description: string; advanced?: boolean }
export interface BooleanSetting extends FieldBase { type: "boolean"; default: boolean }
export interface StringSetting extends FieldBase { type: "string"; default: string; maxLength?: number; placeholder?: string }
export interface NumberSetting extends FieldBase { type: "number"; default: number; min?: number; max?: number; step?: number; integer?: boolean }
export interface SelectOption { readonly value: string; readonly label: string }
export interface SelectSetting<O extends readonly SelectOption[] = readonly SelectOption[]> extends FieldBase {
  type: "select"; options: O; default: O[number]["value"];
}
export interface DurationSetting extends FieldBase { type: "duration"; default: string; min?: string; max?: string }
export type AnySetting = BooleanSetting | StringSetting | NumberSetting | SelectSetting | DurationSetting;

export const boolean = (cfg: Omit<BooleanSetting, "type">): BooleanSetting => ({ type: "boolean", ...cfg });
export const string = (cfg: Omit<StringSetting, "type">): StringSetting => ({ type: "string", ...cfg });
export const number = (cfg: Omit<NumberSetting, "type">): NumberSetting => ({ type: "number", ...cfg });
export const duration = (cfg: Omit<DurationSetting, "type">): DurationSetting => ({ type: "duration", ...cfg });
export function select<const O extends readonly SelectOption[]>(
  cfg: Omit<SelectSetting<O>, "type">
): SelectSetting<O> {
  return { type: "select", ...cfg };
}

export type SettingValue<F> =
  F extends BooleanSetting ? boolean
  : F extends NumberSetting ? number
  : F extends SelectSetting<infer O> ? O[number]["value"]
  : string;

export type SettingsFields = Record<string, AnySetting>;

export interface DefinedSettings<S extends SettingsFields> {
  __lodekitSettings: true;
  fields: S;
  get<K extends keyof S & string>(key: K): Promise<SettingValue<S[K]> | undefined>;
  all(): Promise<{ [K in keyof S]: SettingValue<S[K]> }>;
  watch(cb: (change: { key: keyof S & string }) => void): () => void;
}

const KEY_RE = /^[a-z0-9_]+$/;

let bound: Settings | null = null;
/** @internal wired by index.ts to the SDK singleton */
export function _bindSettings(s: Settings): void { bound = s; }
function handle(): Settings {
  if (!bound) throw new Error("settings unavailable (no bound client — outside an app build?)");
  return bound;
}

export function defineSettings<S extends SettingsFields>(fields: S): DefinedSettings<S> {
  for (const [key, f] of Object.entries(fields)) {
    if (!KEY_RE.test(key) || key.length > 64) throw new Error(`defineSettings(): invalid key "${key}" (snake_case, max 64)`);
    if (typeof f?.label !== "string" || !f.label) throw new Error(`defineSettings(): "${key}" needs a label`);
    if (typeof f?.description !== "string" || !f.description) throw new Error(`defineSettings(): "${key}" needs a description`);
    if (!("default" in f)) throw new Error(`defineSettings(): "${key}" needs a default`);
  }
  return {
    __lodekitSettings: true,
    fields,
    get: (key) => handle().get(key) as never,
    all: () => handle().all() as never,
    watch: (cb) => handle().watch(cb as (c: { key: string }) => void),
  };
}
