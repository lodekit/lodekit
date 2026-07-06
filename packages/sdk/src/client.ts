import { hc } from "hono/client";
import type { ClientResponse } from "hono/client";
import type { KvRoutes } from "@lodekit/runtime/services/kv-store";

export interface KvEntry<T = unknown> {
  key: string;
  value: T;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
}

export type KvChange = { key: string; op: "set" | "del" | "expire" };

export interface FileStat {
  slug: string;
  title: string | null;
  contentType: string;
  size: number;
  hash: string;
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
  url: string;
  path: string;
}

export type FilesChange = { slug: string; op: "put" | "del" | "expire" };
export type FilePutBody = string | Blob | ArrayBuffer | Uint8Array | ReadableStream;

export interface Files {
  put(
    body: FilePutBody,
    opts?: { slug?: string; title?: string; contentType?: string; ttl?: number; metadata?: Record<string, unknown> }
  ): Promise<FileStat>;
  get(slug: string): Promise<Blob | undefined>;
  url(slug: string, opts?: { download?: boolean }): string;
  stat(slug: string): Promise<FileStat | undefined>;
  delete(slug: string): Promise<boolean>;
  list(opts?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ entries: FileStat[]; nextCursor: string | null }>;
  copy(from: string, to: string): Promise<FileStat>;
  move(from: string, to: string): Promise<FileStat>;
  watch(prefix: string, cb: (change: FilesChange) => void): () => void;
}

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
  files: Files;
}

// Preserves the hand-written transport's error semantics around the hc calls:
// non-OK -> throw Error carrying the server's { error } message. The return type
// strips the routes' { error } 400 variant (parse throws before returning it, so
// it can never be the result) while staying structurally derived from KvRoutes —
// response-shape drift in the runtime routes fails tsc at the accesses below.
type SuccessData<R> = Exclude<R extends ClientResponse<infer O, number, "json"> ? O : never, { error: string }>;

async function parse<R extends ClientResponse<unknown>>(res: R): Promise<SuccessData<R>> {
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
  return (await res.json()) as SuccessData<R>;
}

// Twin of `parse` for the raw-body/byte routes, which can't go through `hc`
// (the hc-typed `parse` can't type raw `fetch` responses).
async function throwHttpError(res: Response): Promise<never> {
  let message = res.statusText;
  try {
    const data = (await res.json()) as { error?: string };
    if (data?.error) message = data.error;
  } catch {
    // non-JSON error body — keep statusText
  }
  throw new Error(message);
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) await throwHttpError(res);
  return (await res.json()) as T;
}

// One EventSource per client, shared by all watchers of either handle,
// lazily opened on the first watcher and closed with the last.
function createEventChannel(url: string) {
  type Sub = { event: string; match: (data: never) => boolean; cb: (data: never) => void };
  const subs = new Set<Sub>();
  const bound = new Set<string>();
  let es: EventSource | null = null;
  return {
    on<T>(event: string, match: (data: T) => boolean, cb: (data: T) => void): () => void {
      if (typeof EventSource === "undefined") {
        throw new Error("watch is client-only (no EventSource in this environment)");
      }
      if (!es) es = new EventSource(url);
      if (!bound.has(event)) {
        bound.add(event);
        es.addEventListener(event, (e) => {
          const data = JSON.parse((e as MessageEvent).data) as T;
          for (const s of subs) {
            if (s.event === event && (s.match as (d: T) => boolean)(data)) (s.cb as (d: T) => void)(data);
          }
        });
      }
      const sub = { event, match, cb } as Sub;
      subs.add(sub);
      return () => {
        subs.delete(sub);
        if (subs.size === 0 && es) {
          es.close();
          es = null;
          bound.clear();
        }
      };
    },
  };
}

export function createClient({ baseUrl, appId }: { baseUrl: string; appId: string }): LodekitClient {
  const api = `${baseUrl}/api/apps/${appId}/kv-store`;
  // Any route/SDK mismatch (path, method, param, body shape) fails tsc at edit time.
  const rpc = hc<KvRoutes>(api);
  const key$ = rpc[":key"];

  const channel = createEventChannel(`${baseUrl}/api/apps/${appId}/events`);

  const kv: Kv = {
    async get<T>(key: string): Promise<T | undefined> {
      const r = await parse(await key$.$get({ param: { key: encodeURIComponent(key) } }));
      // Cast only at the value-typed position — the server stores unknown values.
      return r.found ? (r.value as T) : undefined;
    },
    async set(key, value, opts = {}) {
      await parse(
        await key$.$put({
          param: { key: encodeURIComponent(key) },
          json: { value, ...(opts.ttl != null ? { ttl: opts.ttl } : {}) },
        })
      );
    },
    async del(key) {
      return (await parse(await key$.$delete({ param: { key: encodeURIComponent(key) } }))).deleted;
    },
    async has(key) {
      return (await parse(await key$.$get({ param: { key: encodeURIComponent(key) } }))).found;
    },
    async incr(key, by) {
      return (await parse(await rpc.incr.$post({ json: by === undefined ? { key } : { key, by } }))).value;
    },
    async list<T>(opts: { prefix?: string; limit?: number; cursor?: string } = {}) {
      const query: Record<string, string> = {};
      if (opts.prefix !== undefined) query.prefix = opts.prefix;
      if (opts.limit !== undefined) query.limit = String(opts.limit);
      if (opts.cursor !== undefined) query.cursor = opts.cursor;
      const r = await parse(await rpc.index.$get({ query }));
      // Cast only at the value-typed position — the server stores unknown values.
      return { entries: r.entries as KvEntry<T>[], nextCursor: r.nextCursor };
    },
    async getMany<T>(keys: string[]) {
      const r = await parse(await rpc["get-many"].$post({ json: { keys } }));
      // Cast only at the value-typed position — the server stores unknown values.
      return r.entries as KvEntry<T>[];
    },
    async setMany(entries, opts = {}) {
      await parse(await rpc["set-many"].$post({ json: { entries, ...(opts.ttl != null ? { ttl: opts.ttl } : {}) } }));
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
      return channel.on<KvChange>("kv-store-change", (c) => c.key.startsWith(prefix), cb);
    },
  };

  const filesApi = `${baseUrl}/api/apps/${appId}/file-store`;

  const files: Files = {
    async put(body, opts = {}) {
      const qs = opts.ttl != null ? `?ttl=${opts.ttl}` : "";
      const headers: Record<string, string> = {};
      if (opts.contentType) headers["Content-Type"] = opts.contentType;
      if (opts.title) headers["X-Lodekit-Title"] = opts.title;
      if (opts.metadata) headers["X-Lodekit-Metadata"] = JSON.stringify(opts.metadata);
      const init: RequestInit & { duplex?: "half" } = {
        method: opts.slug ? "PUT" : "POST",
        body: body as BodyInit,
        headers,
      };
      // Streamed request bodies require half-duplex in fetch (Node and browsers).
      if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) init.duplex = "half";
      return parseJson<FileStat>(await fetch(opts.slug ? `${filesApi}/${opts.slug}${qs}` : `${filesApi}${qs}`, init));
    },
    async get(slug) {
      const res = await fetch(`${filesApi}/${slug}`);
      if (res.status === 404) return undefined;
      if (!res.ok) await throwHttpError(res);
      return res.blob();
    },
    url(slug, opts = {}) {
      return `${filesApi}/${slug}${opts.download ? "?download=1" : ""}`;
    },
    async stat(slug) {
      const res = await fetch(`${filesApi}/${slug}/stat`);
      if (res.status === 404) return undefined;
      return parseJson<FileStat>(res);
    },
    async delete(slug) {
      return (await parseJson<{ deleted: boolean }>(await fetch(`${filesApi}/${slug}`, { method: "DELETE" }))).deleted;
    },
    async list(opts = {}) {
      const query = new URLSearchParams();
      if (opts.prefix !== undefined) query.set("prefix", opts.prefix);
      if (opts.limit !== undefined) query.set("limit", String(opts.limit));
      if (opts.cursor !== undefined) query.set("cursor", opts.cursor);
      const q = query.toString();
      return parseJson<{ entries: FileStat[]; nextCursor: string | null }>(await fetch(`${filesApi}${q ? `?${q}` : ""}`));
    },
    async copy(from, to) {
      return parseJson<FileStat>(
        await fetch(`${filesApi}/copy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from, to }),
        })
      );
    },
    async move(from, to) {
      return parseJson<FileStat>(
        await fetch(`${filesApi}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from, to }),
        })
      );
    },
    watch(prefix, cb) {
      return channel.on<FilesChange>("file-store-change", (c) => c.slug.startsWith(prefix), cb);
    },
  };

  return { kv, files };
}
