import { createClient } from "./client.js";
export { createClient } from "./client.js";
export type { Kv, KvEntry, KvChange, Collection, LodekitClient } from "./client.js";

// Injected per app by the runtime's Vite build (define). Absent (e.g. under
// Node imports of this entry) it stays undefined and the singleton is inert.
declare const __LODEKIT_APP_ID__: string | undefined;
const injectedAppId = typeof __LODEKIT_APP_ID__ === "string" ? __LODEKIT_APP_ID__ : "";

export const kv = createClient({ baseUrl: "", appId: injectedAppId }).kv;
