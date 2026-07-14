// Typed fetchers for the data explorer. Raw fetch + React Query is the
// dashboard idiom — no client SDK.

export interface AppManifest { appId: string; name: string; icon?: string; description?: string }
export interface SchemaColumn { name: string; type: string; notNull: boolean; default: unknown; pk: boolean }
export interface SchemaTable { name: string; columns: SchemaColumn[]; indexes: string[] }
export interface DataSummary {
  tables: { name: string; rows: number; sizeBytes: number | null }[];
  kv: { count: number };
  files: { count: number; totalBytes: number };
  events: { count: number };
  dbFileBytes: number;
  recent: { store: "table" | "kv" | "file" | "event"; label: string; detail?: string; at: number }[];
}
export interface KvEntry { key: string; value: unknown; createdAt: number; updatedAt: number; expiresAt: number | null }
export interface FileStat {
  slug: string; title: string | null; contentType: string; size: number; hash: string;
  metadata: Record<string, unknown> | null; createdAt: number; updatedAt: number; expiresAt: number | null;
  url: string; path: string;
}
export interface EventRecord { id: number; ts: number; ns: string; source: string; type: string; payload: Record<string, unknown> | null }

async function json<T>(r: Response): Promise<T> {
  const body: unknown = await r.json().catch(() => null);
  if (!r.ok) throw new Error((body as { error?: string } | null)?.error ?? `HTTP ${r.status}`);
  return body as T;
}

export const fetchApps = (): Promise<AppManifest[]> => fetch("/api/apps").then((r) => json<AppManifest[]>(r));

export const fetchSchema = (appId: string): Promise<{ tables: SchemaTable[] }> =>
  fetch(`/api/apps/${appId}/db-store/schema`).then((r) => json<{ tables: SchemaTable[] }>(r));

export const fetchSummary = (appId: string): Promise<DataSummary> =>
  fetch(`/api/apps/${appId}/data/summary`).then((r) => json<DataSummary>(r));

// 404 = "no database for this app yet" — surfaces as an empty result, not an error.
export async function selectRows(appId: string, q: { sql: string; params: (string | number | null)[] }): Promise<Record<string, unknown>[]> {
  const r = await fetch(`/api/apps/${appId}/db-store/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(q),
  });
  if (r.status === 404) return [];
  return (await json<{ rows: Record<string, unknown>[] }>(r)).rows;
}

export function fetchKv(appId: string, opts: { prefix?: string; cursor?: string; limit?: number } = {}): Promise<{ entries: KvEntry[]; nextCursor: string | null }> {
  const q = new URLSearchParams();
  if (opts.prefix) q.set("prefix", opts.prefix);
  if (opts.cursor) q.set("cursor", opts.cursor);
  q.set("limit", String(opts.limit ?? 50));
  return fetch(`/api/apps/${appId}/kv-store?${q}`).then((r) => json<{ entries: KvEntry[]; nextCursor: string | null }>(r));
}

export function fetchFiles(appId: string, opts: { prefix?: string; cursor?: string; limit?: number } = {}): Promise<{ entries: FileStat[]; nextCursor: string | null }> {
  const q = new URLSearchParams();
  if (opts.prefix) q.set("prefix", opts.prefix);
  if (opts.cursor) q.set("cursor", opts.cursor);
  q.set("limit", String(opts.limit ?? 50));
  return fetch(`/api/apps/${appId}/file-store?${q}`).then((r) => json<{ entries: FileStat[]; nextCursor: string | null }>(r));
}

// App events only: ns = source = appId (design §2.2).
export function fetchAppEvents(appId: string, opts: { type?: string; before?: number; limit?: number } = {}): Promise<{ records: EventRecord[]; next: number | null }> {
  const q = new URLSearchParams({ ns: appId, source: appId, limit: String(opts.limit ?? 50) });
  if (opts.type) q.set("type", opts.type);
  if (opts.before != null) q.set("before", String(opts.before));
  return fetch(`/api/events/history?${q}`).then((r) => json<{ records: EventRecord[]; next: number | null }>(r));
}
