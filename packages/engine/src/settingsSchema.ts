// The closed field grammar for the settings service (spec §4): five types, each
// rendering to exactly one dashboard component. label/description/default are
// REQUIRED — the dashboard never shows an undocumented knob.
import { parseDuration } from "./duration.js";

export interface FieldBase {
  label: string;
  description: string;
  advanced?: boolean;
}
export interface BooleanField extends FieldBase { type: "boolean"; default: boolean }
export interface StringField extends FieldBase { type: "string"; default: string; maxLength?: number; placeholder?: string }
export interface NumberField extends FieldBase { type: "number"; default: number; min?: number; max?: number; step?: number; integer?: boolean }
export interface SelectField extends FieldBase { type: "select"; default: string; options: { value: string; label: string }[] }
export interface DurationField extends FieldBase { type: "duration"; default: string; min?: string; max?: string }
export type SettingField = BooleanField | StringField | NumberField | SelectField | DurationField;

export const APP_KEY_RE = /^[a-z0-9_]+$/;   // bare snake_case; dots are the platform namespace
const TYPES = new Set(["boolean", "string", "number", "select", "duration"]);
const STRING_HARD_CAP = 4_096;

function fail(key: string, why: string): never {
  throw new Error(`setting "${key}": ${why}`);
}

// Declaration-time validation: shape, required copy, constraint sanity, and a
// default that passes its own value validation.
export function validateFieldDef(key: string, raw: unknown): SettingField {
  if (!APP_KEY_RE.test(key) || key.length > 64) fail(key, "invalid key (snake_case, max 64 chars)");
  if (typeof raw !== "object" || raw === null) fail(key, "field must be an object");
  const f = raw as Record<string, unknown>;
  if (typeof f.type !== "string" || !TYPES.has(f.type)) fail(key, `unknown type "${String(f.type)}"`);
  if (typeof f.label !== "string" || !f.label.trim() || f.label.length > 80) fail(key, "label is required (max 80 chars)");
  if (typeof f.description !== "string" || !f.description.trim() || f.description.length > 240) {
    fail(key, "description is required (max 240 chars)");
  }
  if (f.advanced !== undefined && typeof f.advanced !== "boolean") fail(key, "advanced must be a boolean");
  if (f.type === "number") {
    for (const k of ["min", "max", "step"] as const) {
      if (f[k] !== undefined && typeof f[k] !== "number") fail(key, `${k} must be a number`);
    }
    if (f.integer !== undefined && typeof f.integer !== "boolean") fail(key, "integer must be a boolean");
    if (typeof f.min === "number" && typeof f.max === "number" && f.min > f.max) fail(key, "min exceeds max");
  }
  if (f.type === "string") {
    if (f.maxLength !== undefined && (typeof f.maxLength !== "number" || !Number.isInteger(f.maxLength) || f.maxLength < 1)) {
      fail(key, "maxLength must be a positive integer");
    }
    if (f.placeholder !== undefined && typeof f.placeholder !== "string") fail(key, "placeholder must be a string");
  }
  if (f.type === "select") {
    const opts = f.options;
    if (!Array.isArray(opts) || opts.length === 0) fail(key, "options must be a non-empty array");
    const values = new Set<string>();
    for (const o of opts) {
      const opt = o as Record<string, unknown>;
      if (typeof opt?.value !== "string" || !opt.value || typeof opt?.label !== "string" || !opt.label) {
        fail(key, "each option needs a value and a label");
      }
      if (values.has(opt.value as string)) fail(key, `duplicate option value "${opt.value}"`);
      values.add(opt.value as string);
    }
  }
  if (f.type === "duration") {
    for (const k of ["min", "max"] as const) {
      if (f[k] !== undefined) {
        if (typeof f[k] !== "string") fail(key, `${k} must be a duration string`);
        try { parseDuration(f[k] as string); } catch { fail(key, `${k} is not a valid duration`); }
      }
    }
    if (typeof f.min === "string" && typeof f.max === "string" && parseDuration(f.min) > parseDuration(f.max)) {
      fail(key, "min exceeds max");
    }
  }
  const field = f as unknown as SettingField;
  if (!("default" in f)) fail(key, "default is required");
  try {
    validateValue(field, f.default);
  } catch (e) {
    fail(key, `default: ${e instanceof Error ? e.message : String(e)}`);
  }
  return field;
}

// Write-time (and read-drift) validation of a value against its field. Returns
// the value; throws with a person-readable reason.
export function validateValue(field: SettingField, value: unknown): boolean | string | number {
  switch (field.type) {
    case "boolean":
      if (typeof value !== "boolean") throw new Error("expected a boolean");
      return value;
    case "string": {
      if (typeof value !== "string") throw new Error("expected a string");
      const cap = Math.min(field.maxLength ?? STRING_HARD_CAP, STRING_HARD_CAP);
      if (value.length > cap) throw new Error(`at most ${cap} characters`);
      return value;
    }
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("expected a number");
      if (field.integer && !Number.isInteger(value)) throw new Error("expected an integer");
      if (field.min !== undefined && value < field.min) throw new Error(`at least ${field.min}`);
      if (field.max !== undefined && value > field.max) throw new Error(`at most ${field.max}`);
      return value;
    case "select":
      if (typeof value !== "string" || !field.options.some((o) => o.value === value)) {
        throw new Error(`one of: ${field.options.map((o) => o.value).join(", ")}`);
      }
      return value;
    case "duration": {
      if (typeof value !== "string") throw new Error("expected a duration string");
      const ms = parseDuration(value); // throws "invalid duration ..." on bad grammar
      if (field.min !== undefined && ms < parseDuration(field.min)) throw new Error(`at least "${field.min}"`);
      if (field.max !== undefined && ms > parseDuration(field.max)) throw new Error(`at most "${field.max}"`);
      return value;
    }
  }
}
