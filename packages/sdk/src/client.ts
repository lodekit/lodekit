export interface KvEntry<T = unknown> {
  key: string;
  value: T;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
}

export type KvChange = { key: string; op: "set" | "del" | "expire" };

export interface Collection<T> {
  add(value: T): Promise<{ id: number; value: T }>;
  all(): Promise<{ id: number; value: T }[]>;
  get(id: number): Promise<T | undefined>;
  set(id: number, value: T): Promise<void>;
  remove(id: number): Promise<boolean>;
}

export interface Kv {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, opts?: { ttl?: number }): Promise<void>;
  del(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  incr(key: string, by?: number): Promise<number>;
  list<T = unknown>(opts?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ entries: KvEntry<T>[]; nextCursor: string | null }>;
  getMany<T = unknown>(keys: string[]): Promise<KvEntry<T>[]>;
  setMany(entries: { key: string; value: unknown }[], opts?: { ttl?: number }): Promise<void>;
  collection<T>(name: string): Collection<T>;
  watch(prefix: string, cb: (change: KvChange) => void): () => void;
}

export interface LodekitClient {
  kv: Kv;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // non-JSON error body — keep statusText
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function createClient({ baseUrl, slug }: { baseUrl: string; slug: string }): LodekitClient {
  const api = `${baseUrl}/api/apps/${slug}/kv-store`;
  const keyUrl = (key: string) => `${api}/${encodeURIComponent(key)}`;

  type GetResponse<T> = { found: false } | { found: true; value: T };

  // One EventSource per client, shared by all watchers, closed with the last.
  const watchers = new Set<{ prefix: string; cb: (c: KvChange) => void }>();
  let es: { close(): void } | null = null;

  const kv: Kv = {
    async get<T>(key: string): Promise<T | undefined> {
      const r = await request<GetResponse<T>>(keyUrl(key));
      return r.found ? r.value : undefined;
    },
    async set(key, value, opts = {}) {
      await request(keyUrl(key), jsonInit("PUT", { value, ...(opts.ttl != null ? { ttl: opts.ttl } : {}) }));
    },
    async del(key) {
      const r = await request<{ deleted: boolean }>(keyUrl(key), { method: "DELETE" });
      return r.deleted;
    },
    async has(key) {
      return (await request<{ found: boolean }>(keyUrl(key))).found;
    },
    async incr(key, by) {
      const r = await request<{ value: number }>(
        `${api}/incr`,
        jsonInit("POST", by === undefined ? { key } : { key, by })
      );
      return r.value;
    },
    async list(opts = {}) {
      const q = new URLSearchParams();
      if (opts.prefix !== undefined) q.set("prefix", opts.prefix);
      if (opts.limit !== undefined) q.set("limit", String(opts.limit));
      if (opts.cursor !== undefined) q.set("cursor", opts.cursor);
      const qs = q.toString();
      return request(`${api}${qs ? `?${qs}` : ""}`);
    },
    async getMany(keys) {
      const r = await request<{ entries: KvEntry<never>[] }>(`${api}/get-many`, jsonInit("POST", { keys }));
      return r.entries as never;
    },
    async setMany(entries, opts = {}) {
      await request(`${api}/set-many`, jsonInit("POST", { entries, ...(opts.ttl != null ? { ttl: opts.ttl } : {}) }));
    },
    collection<T>(name: string): Collection<T> {
      const itemKey = (id: number) => `${name}:${id}`;
      return {
        async add(value) {
          const id = await kv.incr(`_seq:${name}`);
          await kv.set(itemKey(id), value);
          return { id, value };
        },
        async all() {
          const items: { id: number; value: T; createdAt: number }[] = [];
          let cursor: string | undefined;
          do {
            const page = await kv.list<T>({ prefix: `${name}:`, cursor });
            for (const e of page.entries) {
              items.push({ id: Number(e.key.slice(name.length + 1)), value: e.value, createdAt: e.createdAt });
            }
            cursor = page.nextCursor ?? undefined;
          } while (cursor !== undefined);
          items.sort((a, b) => a.createdAt - b.createdAt);
          return items.map(({ id, value }) => ({ id, value }));
        },
        get: (id) => kv.get<T>(itemKey(id)),
        set: (id, value) => kv.set(itemKey(id), value),
        remove: (id) => kv.del(itemKey(id)),
      };
    },
    watch(prefix, cb) {
      if (typeof EventSource === "undefined") {
        throw new Error("kv.watch requires EventSource (browser only)");
      }
      const watcher = { prefix, cb };
      if (watchers.size === 0) {
        const source = new EventSource(`${baseUrl}/api/apps/${slug}/events`);
        source.addEventListener("kv-store-change", (e) => {
          const change = JSON.parse((e as MessageEvent).data) as KvChange;
          for (const w of watchers) {
            if (change.key.startsWith(w.prefix)) w.cb(change);
          }
        });
        es = source;
      }
      watchers.add(watcher);
      return () => {
        watchers.delete(watcher);
        if (watchers.size === 0 && es) {
          es.close();
          es = null;
        }
      };
    },
  };

  return { kv };
}
