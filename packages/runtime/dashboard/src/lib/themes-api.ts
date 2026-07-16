// Typed fetchers for the theme library + editor. Raw fetch + React Query is the
// dashboard idiom — no client SDK. Mutations reply 204 (no body); errors carry a
// { error } JSON payload the fetchers rethrow as Error(message).

export interface ThemesIndex {
  themes: { name: string; vendored: boolean; iconLibrary: string }[];
  config: { global?: string; apps?: Record<string, string> };
}

async function ok(r: Response): Promise<void> {
  if (r.ok) return;
  const body = (await r.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error ?? `HTTP ${r.status}`);
}

export const fetchThemes = (): Promise<ThemesIndex> =>
  fetch("/api/themes").then(async (r) => {
    await ok(r);
    return r.json() as Promise<ThemesIndex>;
  });

export const fetchThemeCss = (name: string): Promise<string> =>
  fetch(`/api/themes/${name}`).then(async (r) => {
    await ok(r);
    return r.text();
  });

export const putThemeCss = async (name: string, css: string): Promise<void> =>
  ok(await fetch(`/api/themes/${name}`, { method: "PUT", headers: { "Content-Type": "text/css" }, body: css }));

export const putThemesConfig = async (config: ThemesIndex["config"]): Promise<void> =>
  ok(await fetch("/api/themes/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) }));

export const duplicateTheme = async (name: string, to: string): Promise<void> =>
  ok(await fetch(`/api/themes/${name}/duplicate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to }) }));

export const renameTheme = async (name: string, to: string): Promise<void> =>
  ok(await fetch(`/api/themes/${name}/rename`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to }) }));

export const deleteTheme = async (name: string): Promise<void> =>
  ok(await fetch(`/api/themes/${name}`, { method: "DELETE" }));

export const putPreview = async (css: string): Promise<void> =>
  ok(await fetch("/api/themes/preview", { method: "PUT", headers: { "Content-Type": "text/css" }, body: css }));
