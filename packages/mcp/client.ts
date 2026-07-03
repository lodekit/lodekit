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
