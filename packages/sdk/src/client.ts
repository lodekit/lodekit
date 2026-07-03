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

// Preserves the hand-written transport's error semantics around the hc calls:
// non-OK -> throw Error carrying the server's { error } message.
async function parse<T>(res: ClientResponse<T> | Response): Promise<T> {
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

export function createClient({ baseUrl, appId }: { baseUrl: string; appId: string }): LodekitClient {
  const api = `${baseUrl}/api/apps/${appId}/kv-store`;
  // Any route/SDK mismatch (path, method, param, body shape) fails tsc at edit time.
  const rpc = hc<KvRoutes>(api);
  const key$ = rpc[":key"];

  type GetResponse<T> = { found: false } | { found: true; value: T };

  // One EventSource per client, shared by all watchers, closed with the last.
  const watchers = new Set<{ prefix: string; cb: (c: KvChange) => void }>();
  let es: { close(): void } | null = null;

  const kv: Kv = {
    async get<T>(key: string): Promise<T | undefined> {
      // zValidator's shared validationHook widens every validated route's inferred output with
      // an `{ error }` 400 variant; parse() already runtime-checks res.ok before this point, so
      // narrowing back to the SDK's own response shape needs the unknown round-trip tsc suggests.
      const r = (await parse(
        await key$.$get({ param: { key: encodeURIComponent(key) } })
      )) as unknown as GetResponse<T>;
      return r.found ? r.value : undefined;
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
      return (
        (await parse(await key$.$delete({ param: { key: encodeURIComponent(key) } }))) as unknown as {
          deleted: boolean;
        }
      ).deleted;
    },
    async has(key) {
      return (
        (await parse(
          await key$.$get({ param: { key: encodeURIComponent(key) } })
        )) as unknown as { found: boolean }
      ).found;
    },
    async incr(key, by) {
      return (
        (await parse(
          await rpc.incr.$post({ json: by === undefined ? { key } : { key, by } })
        )) as unknown as { value: number }
      ).value;
    },
    async list(opts = {}) {
      const query: Record<string, string> = {};
      if (opts.prefix !== undefined) query.prefix = opts.prefix;
      if (opts.limit !== undefined) query.limit = String(opts.limit);
      if (opts.cursor !== undefined) query.cursor = opts.cursor;
      return (await parse(await rpc.index.$get({ query }))) as never;
    },
    async getMany(keys) {
      const r = (await parse(await rpc["get-many"].$post({ json: { keys } }))) as unknown as {
        entries: KvEntry<never>[];
      };
      return r.entries as never;
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
      if (typeof EventSource === "undefined") {
        throw new Error("kv.watch requires EventSource (browser only)");
      }
      const watcher = { prefix, cb };
      if (watchers.size === 0) {
        const source = new EventSource(`${baseUrl}/api/apps/${appId}/events`);
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
