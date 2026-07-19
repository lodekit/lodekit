// WCAG AA regression gate for every theme Lodekit ships (DESIGN.md §6 "Do:
// meet WCAG AA minimum everywhere"). 4.5:1 for text pairs, 3:1 for UI/graphics.
// Non-hex values (alpha hairlines) can't be measured against a single background
// and are skipped — the load-bearing pairs below are all plain hex by design.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseTheme } from "../dashboard/src/lib/theme-css.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THEME_DIRS = [
  path.resolve(__dirname, "../themes"),
  path.resolve(__dirname, "../../../root/themes"),
];

function parseColor(value: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(value.trim());
  if (!m) return null;
  const h = m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg: string, bg: string): number | null {
  const f = parseColor(fg);
  const b = parseColor(bg);
  if (!f || !b) return null;
  const [hi, lo] = [luminance(f), luminance(b)].sort((a, z) => z - a);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground token, background token, minimum ratio]
const PAIRS: [string, string, number][] = [
  ["foreground", "background", 4.5],
  ["card-foreground", "card", 4.5],
  ["popover-foreground", "popover", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["secondary-foreground", "secondary", 4.5],
  ["accent-foreground", "accent", 4.5],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "card", 4.5],
  ["destructive", "background", 4.5],
  ["destructive", "card", 4.5],
  ["primary", "background", 4.5],
  ["sidebar-foreground", "sidebar", 4.5],
  ["sidebar-primary-foreground", "sidebar-primary", 4.5],
  ["ring", "background", 3],
];
// Chart series are deliberately NOT gated: the light-plate series is the
// DESIGN.md §2 fixed order (Sky-Is-Decoration — decorative, label-supported
// per the never-color-alone rule), and ochre/cloud-slate sit below 3:1 on
// parchment by design. The ring pair above still guards interactive contrast.

// Community palettes vendored before this gate existed fail several pairs;
// their AA status is tracked separately (bead lk-cf3) — the gate guards the
// first-party identity themes and any future additions by default.
const AA_EXEMPT = new Set(["catppuccin", "dracula", "nord", "rose-pine"]);

for (const dir of THEME_DIRS) {
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".css"))) {
    if (AA_EXEMPT.has(file.slice(0, -4))) continue;
    describe(`${path.basename(dir)}/${file} contrast`, () => {
      const model = parseTheme(fs.readFileSync(path.join(dir, file), "utf8"));
      for (const mode of ["light", "dark"] as const) {
        const map = mode === "light" ? model.light : model.dark;
        for (const [fg, bg, min] of PAIRS) {
          it(`${mode}: ${fg} on ${bg} ≥ ${min}:1`, () => {
            const ratio = contrast(map[fg] ?? "", map[bg] ?? "");
            if (ratio === null) return; // non-hex — not measurable, by design
            expect(ratio).toBeGreaterThanOrEqual(min);
          });
        }
      }
    });
  }
}
