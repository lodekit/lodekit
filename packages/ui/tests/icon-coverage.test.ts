import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import phosphor from "../src/icons/generated/phosphor";
import tabler from "../src/icons/generated/tabler";
import { CANONICAL_NAMES, KNOWN_UNMAPPED } from "../src/icons/generated/names";

const ROOTS = ["src", "../runtime/dashboard/src", "../runtime/src/scaffold.ts", "../../root/apps"].map(
  (p) => path.resolve(__dirname, "..", p)
);

const CODE_FILE = /\.(ts|tsx)$/;
const SKIP_DIRS = new Set(["node_modules", "icons"]);

function collectFiles(root: string): string[] {
  const stat = fs.statSync(root, { throwIfNoEntry: false });
  if (!stat) return [];
  if (stat.isFile()) return CODE_FILE.test(root) ? [root] : [];

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && CODE_FILE.test(entry.name)) {
        files.push(full);
      }
    }
  };
  walk(root);
  return files;
}

it("no direct lucide-react imports remain outside the icons module", () => {
  const offenders: string[] = [];
  for (const root of ROOTS) {
    for (const file of collectFiles(root)) {
      const content = fs.readFileSync(file, "utf-8");
      if (/from ["']lucide-react["']/.test(content)) {
        offenders.push(file);
      }
    }
  }
  expect(offenders).toEqual([]);
});

it("every canonical name maps in both alternate sets", () => {
  for (const name of CANONICAL_NAMES) {
    if (KNOWN_UNMAPPED.includes(name)) continue;
    expect(phosphor[name as keyof typeof phosphor], `phosphor: ${name}`).toBeDefined();
    expect(tabler[name as keyof typeof tabler], `tabler: ${name}`).toBeDefined();
  }
});
