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
