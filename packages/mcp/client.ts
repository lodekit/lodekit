export async function scaffold(
  base: string,
  input: { slug: string; name: string; description?: string; icon?: string }
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

export async function inspectDb(base: string, slug: string) {
  const r = await fetch(`${base}/api/apps/${slug}/db/schema`);
  if (!r.ok) throw new Error(`inspect failed: ${r.status}`);
  return r.json();
}
