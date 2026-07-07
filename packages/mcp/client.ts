export async function scaffold(
  base: string,
  input: { appId: string; name: string; description?: string; icon?: string }
) {
  const r = await fetch(base + "/api/apps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`scaffold failed: ${r.status}`);
  return r.json();
}

export async function listApps(base: string) {
  const r = await fetch(base + "/api/apps");
  return r.json();
}

export async function fetchLogs(
  base: string,
  params: { appId?: string; level?: "debug" | "info" | "warn" | "error"; limit?: number; q?: string } = {}
) {
  const query = new URLSearchParams();
  if (params.appId) query.set("app", params.appId);
  if (params.level) query.set("level", params.level);
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.q) query.set("q", params.q);
  const qs = query.toString();
  const r = await fetch(`${base}/api/logs${qs ? `?${qs}` : ""}`);
  if (!r.ok) throw new Error(`logs fetch failed: ${r.status}`);
  return r.json();
}

export async function fetchEvents(
  base: string,
  params: { appId?: string; type?: string; after?: number; limit?: number } = {}
) {
  const query = new URLSearchParams();
  if (params.appId) query.set("ns", params.appId);
  if (params.type) query.set("type", params.type);
  if (params.after != null) query.set("after", String(params.after));
  if (params.limit != null) query.set("limit", String(params.limit));
  const qs = query.toString();
  const r = await fetch(`${base}/api/events/history${qs ? `?${qs}` : ""}`);
  if (!r.ok) throw new Error(`events fetch failed: ${r.status}`);
  return r.json();
}

export async function fetchSettings(base: string, appId?: string) {
  const url = appId ? `${base}/api/apps/${appId}/settings` : `${base}/api/settings`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`settings fetch failed: ${r.status}`);
  return r.json();
}
