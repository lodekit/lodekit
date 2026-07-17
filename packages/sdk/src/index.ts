import { createClient } from "./client.js";
export { createClient } from "./client.js";
export type {
  Kv,
  KvEntry,
  Collection,
  LodekitClient,
  Files,
  FileStat,
  FilePutBody,
  Logs,
  Tasks,
  TaskRun,
  TaskInfo,
  TaskRunState,
  Events,
  LodekitEvent,
  Settings,
  Secrets,
  Gateways,
  ConnectionHandle,
  GatewayResponse,
  GatewayRequestOpts,
} from "./client.js";
export { task } from "./task.js";
export type { TaskConfig, DefinedTask } from "./task.js";
export { defineSettings, boolean, string, number, select, duration } from "./settings.js";
export type { DefinedSettings, SettingsFields, AnySetting, SettingValue } from "./settings.js";

// Injected per app by the engine's Vite build (define). Absent (e.g. under
// Node imports of this entry) it stays undefined and the singleton is inert.
declare const __LODEKIT_APP_ID__: string | undefined;
const injectedAppId = typeof __LODEKIT_APP_ID__ === "string" ? __LODEKIT_APP_ID__ : "";

// Server side of the contract (an app worker): the engine provides the loopback
// base; browser side: relative URLs against the page origin. Guarded so neither
// identifier leaks into the other environment's bundle.
const serverBaseUrl =
  typeof window === "undefined" && typeof process !== "undefined"
    ? process.env?.LODEKIT_BASE_URL ?? ""
    : "";

const client = createClient({ baseUrl: serverBaseUrl, appId: injectedAppId });
export const kv = client.kv;
export const files = client.files;
export const logs = client.logs;
export const tasks = client.tasks;
export const events = client.events;

import { _bindSettings } from "./settings.js";
export const settings = client.settings;
_bindSettings(client.settings);

import { _bindSecrets } from "./secrets.js";
export const secrets = client.secrets;
_bindSecrets(client.secrets);
export { defineSecrets, secret, SecretUnavailableError } from "./secrets.js";
export type { DefinedSecrets, SecretSlots, SecretSlotDef } from "./secrets.js";

export const gateways = client.gateways;
export { defineGateways, gateway, GatewayError } from "./gateways.js";
export type { DefinedGateways, GatewayUses, GatewayUse, GatewayErrorReason } from "./gateways.js";

/** The app's own app id, injected by the toolchain at build time ("" outside an app build). */
export const appId = injectedAppId;

import { createRemoteDb } from "./db.js";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";

/** The app's typed database handle (db-store): pass your src/db.ts tables.
 *  Schema application happens at worker boot from the same file — this factory
 *  only builds the query client. */
export function createDb<TSchema extends Record<string, unknown>>(schema: TSchema): SqliteRemoteDatabase<TSchema> {
  return createRemoteDb({ baseUrl: serverBaseUrl, appId: injectedAppId, schema });
}
