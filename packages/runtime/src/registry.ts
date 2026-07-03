import fs from "node:fs";
import path from "node:path";

export interface AppManifest {
  name: string;
  appId: string;
  icon?: string;
  description?: string;
}

const APP_ID_RE = /^[a-z0-9-]+$/;

export function isValidAppId(appId: string): boolean {
  return APP_ID_RE.test(appId);
}

export function scanApps(appsDir: string): AppManifest[] {
  if (!fs.existsSync(appsDir)) return [];
  const apps: AppManifest[] = [];
  for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(appsDir, entry.name, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as AppManifest & { slug?: string };
      const appId = raw.appId ?? raw.slug ?? "";
      if (!isValidAppId(appId) || appId !== entry.name) continue;
      apps.push({ name: raw.name, appId, icon: raw.icon, description: raw.description });
    } catch {
      // skip malformed manifest
    }
  }
  return apps.sort((a, b) => a.name.localeCompare(b.name));
}
