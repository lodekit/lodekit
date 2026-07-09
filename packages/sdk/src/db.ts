// The db handle's factory (spec §6/§8): a drizzle instance on the sqlite-proxy
// driver whose "driver" is HTTP against the scoped API — full typed query
// building client-side, execution host-side, workers never touch sqlite.
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

export function createRemoteDb<TSchema extends Record<string, unknown>>(opts: {
  baseUrl: string;
  appId: string;
  schema: TSchema;
}): SqliteRemoteDatabase<TSchema> {
  const api = `${opts.baseUrl}/api/apps/${opts.appId}/db-store`;
  return drizzle<TSchema>(
    async (sql, params, method) => post(`${api}/query`, { sql, params, method }),
    async (queries) => {
      const { results } = await post<{ results: { rows: unknown[] }[] }>(`${api}/batch`, { queries });
      return results;
    },
    { schema: opts.schema }
  );
}
