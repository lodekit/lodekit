import { hc } from "hono/client";
import type { ClientResponse } from "hono/client";
import type { KvRoutes } from "@lodekit/runtime/services/kv-store";
import type { LogRoutes } from "@lodekit/runtime/services/log-store";
import type { TasksRoutes } from "@lodekit/runtime/services/tasks";
import type { EventRoutes } from "@lodekit/runtime/services/event-store";
import type { SettingsRoutes } from "@lodekit/runtime/services/settings";
import { SecretUnavailableError } from "./secrets.js";
import { GatewayError, type GatewayErrorReason } from "./gateways.js";

export interface KvEntry<T = unknown> {
  key: string;
  value: T;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
}

export interface LodekitEvent<T extends Record<string, unknown> = Record<string, unknown>> {
  id: number;
  ts: number;
  app: string | null;
  kind: string;
  component: string;
  type: string;
  payload: T | null;
}

export interface Events {
  emit(type: string, payload?: Record<string, unknown>, opts?: { ttl?: number }): Promise<LodekitEvent>;
  watch(filter: { kind?: string | string[]; component?: string | string[]; type?: string | string[] }, cb: (event: LodekitEvent) => void): () => void;
  list(opts?: { component?: string; type?: string; since?: number; until?: number; after?: number; before?: number; limit?: number }): Promise<{ records: LodekitEvent[]; next: number | null }>;
}

export interface Settings {
  get<T = unknown>(key: string): Promise<T | undefined>;
  all(): Promise<Record<string, unknown>>;
  watch(cb: (change: { key: string }) => void): () => void;
}

export interface Secrets {
  /** Server-only: reads a linked secret's value. Throws SecretUnavailableError
   * ("unlinked" | "unavailable") or a plain Error outside server context. */
  get(slot: string): Promise<string>;
}

export interface GatewayResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  json<T = unknown>(): Promise<T>;
  text(): Promise<string>;
}

export interface GatewayRequestOpts {
  query?: Record<string, string | number>;
  headers?: Record<string, string>;
  /** string sent as-is; object JSON-serialized (content-type set); Uint8Array as base64 */
  body?: string | Uint8Array | object;
  timeoutMs?: number;
}

export interface ConnectionHandle {
  get(path: string, opts?: GatewayRequestOpts): Promise<GatewayResponse>;
  post(path: string, opts?: GatewayRequestOpts): Promise<GatewayResponse>;
  put(path: string, opts?: GatewayRequestOpts): Promise<GatewayResponse>;
  patch(path: string, opts?: GatewayRequestOpts): Promise<GatewayResponse>;
  delete(path: string, opts?: GatewayRequestOpts): Promise<GatewayResponse>;
  request(desc: { method: string; path: string } & GatewayRequestOpts): Promise<GatewayResponse>;
}

/** Server-only: each property is the app's declared alias from src/gateways.ts. */
export interface Gateways {
  [alias: string]: ConnectionHandle;
}

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

export type FilePutBody = string | Blob | ArrayBuffer | Uint8Array | ReadableStream;

export type TaskRunState = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface TaskRun {
  id: number;
  task: string;
  state: TaskRunState;
  source: "enqueue" | "schedule" | "manual";
  attempt: number;
  payload: unknown;
  notBefore: number;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number | null;
  error: string | null;
}

export interface TaskInfo {
  name: string;
  schedule: { kind: "cron" | "every"; expr: string } | null;
  retired: boolean;
  error: string | null;
  nextRun: number | null;
  lastRun: { runId: number; state: TaskRunState; finishedAt: number | null; error: string | null } | null;
}

export interface Tasks {
  /** Queue a run now (or delayed); resolves to the run id. */
  enqueue(name: string, payload?: unknown, opts?: { delay?: string; at?: number; dedupeKey?: string }): Promise<number>;
  /** Cancel a still-queued run; false when it already started/finished or doesn't exist. */
  cancel(runId: number): Promise<boolean>;
  runs(opts?: { task?: string; state?: TaskRunState; limit?: number }): Promise<TaskRun[]>;
  list(): Promise<TaskInfo[]>;
}

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
}

export interface Logs {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
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
}

export interface LodekitClient {
  kv: Kv;
  files: Files;
  logs: Logs;
  tasks: Tasks;
  events: Events;
  settings: Settings;
  secrets: Secrets;
  gateways: Gateways;
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
  };

  const filesApi = `${baseUrl}/api/apps/${appId}/file-store`;

  const files: Files = {
    async put(body, opts = {}) {
      const qs = opts.ttl != null ? `?ttl=${opts.ttl}` : "";
      const headers: Record<string, string> = {};
      if (opts.contentType) headers["Content-Type"] = opts.contentType;
      if (opts.title) headers["X-Lodekit-Title"] = encodeURIComponent(opts.title);
      if (opts.metadata) headers["X-Lodekit-Metadata"] = encodeURIComponent(JSON.stringify(opts.metadata));
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
  };

  // Fire-and-forget by contract (spec §5/§7): emitting a log must never throw
  // into app code, so failures are swallowed rather than surfaced.
  const logRpc = hc<LogRoutes>(`${baseUrl}/api/apps/${appId}/log-store`);
  const sendLog =
    (level: "debug" | "info" | "warn" | "error") =>
    (message: string, fields?: Record<string, unknown>): void => {
      void logRpc.index
        .$post({ json: fields ? { level, message, fields } : { level, message } })
        .catch(() => {});
    };
  const logs: Logs = { debug: sendLog("debug"), info: sendLog("info"), warn: sendLog("warn"), error: sendLog("error") };

  const tasksRpc = hc<TasksRoutes>(`${baseUrl}/api/apps/${appId}/tasks`);

  const tasks: Tasks = {
    async enqueue(name, payload, opts = {}) {
      const r = await parse(
        await tasksRpc[":name"].runs.$post({
          param: { name },
          json: {
            ...(payload !== undefined ? { payload } : {}),
            ...(opts.delay !== undefined ? { delay: opts.delay } : {}),
            ...(opts.at !== undefined ? { at: opts.at } : {}),
            ...(opts.dedupeKey !== undefined ? { dedupeKey: opts.dedupeKey } : {}),
          },
        })
      );
      return r.runId;
    },
    async cancel(runId) {
      const res = await tasksRpc.runs[":id"].$delete({ param: { id: String(runId) } });
      if (res.ok) return true;
      if (res.status === 404 || res.status === 409) return false; // unknown run / not queued
      return throwHttpError(res as unknown as Response);
    },
    async runs(opts = {}) {
      const query: Record<string, string> = {};
      if (opts.task !== undefined) query.task = opts.task;
      if (opts.state !== undefined) query.state = opts.state;
      if (opts.limit !== undefined) query.limit = String(opts.limit);
      return (await parse(await tasksRpc.runs.$get({ query }))).runs as TaskRun[];
    },
    async list() {
      return (await parse(await tasksRpc.index.$get())).tasks as TaskInfo[];
    },
  };

  // The event bus (event-store service): emit anywhere (plain POST), watch client-only
  // over the shared EventSource channel, list for replay/history.
  const eventsRpc = hc<EventRoutes>(`${baseUrl}/api/apps/${appId}/event-store`);
  const events: Events = {
    async emit(type, payload, opts = {}) {
      return (await parse(
        await eventsRpc.index.$post({
          json: {
            type,
            ...(payload !== undefined ? { payload } : {}),
            ...(opts.ttl != null ? { ttl: opts.ttl } : {}),
          },
        })
      )) as LodekitEvent;
    },
    watch(filter, cb) {
      const norm = (v?: string | string[]) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);
      const kinds = norm(filter.kind);
      const components = norm(filter.component);
      const types = norm(filter.type);
      return channel.on<LodekitEvent>(
        "event",
        (ev) =>
          (!kinds || kinds.includes(ev.kind)) &&
          (!components || components.includes(ev.component)) &&
          (!types || types.includes(ev.type)),
        cb
      );
    },
    async list(opts = {}) {
      const query: Record<string, string> = {};
      if (opts.component !== undefined) query.component = opts.component;
      if (opts.type !== undefined) query.type = opts.type;
      if (opts.since !== undefined) query.since = String(opts.since);
      if (opts.until !== undefined) query.until = String(opts.until);
      if (opts.after !== undefined) query.after = String(opts.after);
      if (opts.before !== undefined) query.before = String(opts.before);
      if (opts.limit !== undefined) query.limit = String(opts.limit);
      return (await parse(await eventsRpc.index.$get({ query }))) as {
        records: LodekitEvent[];
        next: number | null;
      };
    },
  };

  const settingsRpc = hc<SettingsRoutes>(`${baseUrl}/api/apps/${appId}/settings`);
  const settings: Settings = {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      const r = await parse(await settingsRpc[":key"].$get({ param: { key } }));
      return r.found ? (r.value as T) : undefined;
    },
    async all() {
      const doc = await parse(await settingsRpc.index.$get());
      return Object.fromEntries(
        doc.declared.filter((d) => d.field !== null).map((d) => [d.key, d.effective])
      );
    },
    watch(cb) {
      return channel.on<{ component: string; type: string; payload: { key: string } | null }>(
        "event",
        (ev) => ev.component === "settings" && (ev.type === "value-set" || ev.type === "value-cleared"),
        (ev) => cb({ key: ev.payload?.key ?? "" })
      );
    },
  };

  // The secret-store's server-only door (spec §7): the worker token exists only
  // in app-worker env — browser code fails fast before any request. Plain fetch
  // (not hc): the token header decides access, and values must never be typed
  // into any shared channel.
  const secrets: Secrets = {
    async get(slot: string): Promise<string> {
      const token =
        typeof window === "undefined" && typeof process !== "undefined"
          ? process.env?.LODEKIT_WORKER_TOKEN
          : undefined;
      if (!token) throw new Error("secrets are server-only; call secrets.get() from a server function");
      const r = await fetch(`${baseUrl}/api/apps/${appId}/secrets/${encodeURIComponent(slot)}/value`, {
        headers: { "x-lodekit-worker-token": token },
      });
      if (r.ok) return ((await r.json()) as { value: string }).value;
      const body = (await r.json().catch(() => null)) as { error?: string } | null;
      if (r.status === 409) throw new SecretUnavailableError("unlinked", body?.error);
      if (r.status === 503) throw new SecretUnavailableError("unavailable", body?.error);
      throw new Error(body?.error ?? `secrets.get("${slot}") failed: ${r.status}`);
    },
  };

  // The gateways door (spec §6): all external traffic flows through the
  // runtime — the worker never holds a credential. Plain fetch (not hc): the
  // token header decides access and the envelope carries arbitrary bodies.
  const gatewayCall = async (alias: string, desc: { method: string; path: string } & GatewayRequestOpts): Promise<GatewayResponse> => {
    const token =
      typeof window === "undefined" && typeof process !== "undefined"
        ? process.env?.LODEKIT_WORKER_TOKEN
        : undefined;
    if (!token) throw new Error("gateways are server-only; call from a server function or task");
    const payload: Record<string, unknown> = { method: desc.method, path: desc.path };
    if (desc.query) {
      payload.query = Object.fromEntries(Object.entries(desc.query).map(([k, v]) => [k, String(v)]));
    }
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(desc.headers ?? {})) headers[k.toLowerCase()] = v;
    if (desc.body !== undefined) {
      if (typeof desc.body === "string") payload.body = desc.body;
      else if (desc.body instanceof Uint8Array) payload.bodyBase64 = Buffer.from(desc.body).toString("base64");
      else {
        payload.body = JSON.stringify(desc.body);
        headers["content-type"] ??= "application/json";
      }
    }
    if (Object.keys(headers).length > 0) payload.headers = headers;
    if (desc.timeoutMs !== undefined) payload.timeoutMs = desc.timeoutMs;
    const r = await fetch(`${baseUrl}/api/apps/${appId}/gateways/${encodeURIComponent(alias)}/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-lodekit-worker-token": token },
      body: JSON.stringify(payload),
    });
    const data = (await r.json().catch(() => null)) as
      | { status: number; headers: Record<string, string>; body?: string; bodyBase64?: string; durationMs: number }
      | { error?: string; reason?: GatewayErrorReason }
      | null;
    if (!r.ok) {
      const err = data as { error?: string; reason?: GatewayErrorReason } | null;
      if (err?.reason) throw new GatewayError(err.reason, err.error);
      throw new Error(err?.error ?? `gateway request failed: ${r.status}`);
    }
    const env = data as { status: number; headers: Record<string, string>; body?: string; bodyBase64?: string };
    const text = () =>
      Promise.resolve(env.body ?? (env.bodyBase64 ? Buffer.from(env.bodyBase64, "base64").toString("utf8") : ""));
    return {
      status: env.status,
      ok: env.status >= 200 && env.status < 300,
      headers: env.headers,
      text,
      json: async <T>() => JSON.parse(await text()) as T,
    };
  };

  const handleCache = new Map<string, ConnectionHandle>();
  const handleFor = (alias: string): ConnectionHandle => {
    let h = handleCache.get(alias);
    if (!h) {
      const call = (method: string) => (path: string, opts: GatewayRequestOpts = {}) =>
        gatewayCall(alias, { method, path, ...opts });
      h = {
        get: call("GET"), post: call("POST"), put: call("PUT"),
        patch: call("PATCH"), delete: call("DELETE"),
        request: (desc) => gatewayCall(alias, desc),
      };
      handleCache.set(alias, h);
    }
    return h;
  };
  const gateways: Gateways = new Proxy({} as Gateways, {
    get: (_t, alias) => (typeof alias === "string" ? handleFor(alias) : undefined),
  });

  return { kv, files, logs, tasks, events, settings, secrets, gateways };
}
