import { createClient } from "./client.js";
export { createClient } from "./client.js";
export type { Kv, KvEntry, KvChange, Collection, LodekitClient } from "./client.js";

// Injected per app by the runtime's Vite build (define). Absent (e.g. under
// Node imports of this entry) it stays undefined and the singleton is inert.
declare const __LODEKIT_APP_ID__: string | undefined;
const injectedAppId = typeof __LODEKIT_APP_ID__ === "string" ? __LODEKIT_APP_ID__ : "";

// Server side of the contract (an app worker): the runtime provides the loopback
// base; browser side: relative URLs against the page origin. Guarded so neither
// identifier leaks into the other environment's bundle.
const serverBaseUrl =
  typeof window === "undefined" && typeof process !== "undefined"
    ? process.env?.LODEKIT_BASE_URL ?? ""
    : "";

export const kv = createClient({ baseUrl: serverBaseUrl, appId: injectedAppId }).kv;

/** The app's own app id, injected by the toolchain at build time ("" outside an app build). */
export const appId = injectedAppId;
