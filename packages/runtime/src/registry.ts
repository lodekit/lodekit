import fs from "node:fs";
import path from "node:path";

export interface AppManifest {
  name: string;
  slug: string;
  icon?: string;
  description?: string;
}

const SLUG_RE = /^[a-z0-9-]+$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

export function scanApps(appsDir: string): AppManifest[] {
  if (!fs.existsSync(appsDir)) return [];
  const apps: AppManifest[] = [];
  for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(appsDir, entry.name, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as AppManifest;
      if (!isValidSlug(m.slug) || m.slug !== entry.name) continue;
      apps.push({ name: m.name, slug: m.slug, icon: m.icon, description: m.description });
    } catch {
      // skip malformed manifest
    }
  }
  return apps.sort((a, b) => a.name.localeCompare(b.name));
}
