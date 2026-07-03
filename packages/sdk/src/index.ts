import { createClient } from "./client.js";
export { createClient } from "./client.js";
export type { Kv, KvEntry, KvChange, Collection, LodekitClient } from "./client.js";

// Injected per app by the runtime's Vite build (define). Absent (e.g. under
// Node imports of this entry) it stays undefined and the singleton is inert.
declare const __LODEKIT_SLUG__: string | undefined;
const injectedSlug = typeof __LODEKIT_SLUG__ === "string" ? __LODEKIT_SLUG__ : "";

export const kv = createClient({ baseUrl: "", slug: injectedSlug }).kv;

export interface DbExecResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

function apiBase(): string {
  const slug = window.location.pathname.split("/").filter(Boolean)[0] ?? "";
  return `/api/apps/${slug}`;
}

async function jpost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiBase() + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // non-JSON error body — keep statusText
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const db = {
  async query<Row = unknown>(sql: string, params: unknown[] = []): Promise<Row[]> {
    const { rows } = await jpost<{ rows: Row[] }>("/db/query", { sql, params });
    return rows;
  },
  async exec(sql: string, params: unknown[] = []): Promise<DbExecResult> {
    return jpost<DbExecResult>("/db/exec", { sql, params });
  },
};

export const store = {
  async get<T = unknown>(key: string): Promise<T | null> {
    const res = await fetch(`${apiBase()}/store/${encodeURIComponent(key)}`);
    if (!res.ok) throw new Error(res.statusText);
    const { value } = await res.json();
    return (value ?? null) as T | null;
  },
  async set(key: string, value: unknown): Promise<void> {
    const res = await fetch(`${apiBase()}/store/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    if (!res.ok) throw new Error(res.statusText);
  },
};
