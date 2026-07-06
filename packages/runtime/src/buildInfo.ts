import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// What am I running? Version from this package's own package.json; commit from the
// bundle-time build-info.json stamp (packaged), falling back to git (dev), else null.
// Diagnostics only — resolution failure must never crash the runtime (spec §3).
export interface BuildInfo {
  version: string;
  commit: string | null;
}

export function resolveBuildInfo(pkgDir: string): BuildInfo {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
  return { version: pkg.version, commit: resolveCommit(pkgDir) };
}

function resolveCommit(pkgDir: string): string | null {
  // The stamp wins over git — it describes what was actually bundled.
  try {
    const stamp = JSON.parse(fs.readFileSync(path.join(pkgDir, "build-info.json"), "utf8"));
    if (typeof stamp.commit === "string") return stamp.commit;
  } catch {
    // No stamp — dev checkout; ask git.
  }
  const git = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: pkgDir, encoding: "utf8" });
  return git.status === 0 ? git.stdout.trim() : null;
}

const PKG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let cached: BuildInfo | undefined;

export function getBuildInfo(): BuildInfo {
  return (cached ??= resolveBuildInfo(PKG_DIR));
}
