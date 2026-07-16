// Parses and serializes the canonical Lodekit theme CSS format (docs/specs theme
// editor §4): a leading /* … */ header comment, optional @import lines, a :root
// block (color-scheme + typed --font-*/--radius/--spacing/--icon-library fields +
// the shadcn color-token set) and a .dark block (color-scheme + color tokens),
// with any unrecognized trailing CSS preserved verbatim. serializeTheme is the
// exact inverse of parseTheme for the vendored themes: the round-trip is
// byte-identical. Fidelity beats normalization — inline comments and the exact
// whitespace before them are stored as per-token "trivia" and re-emitted verbatim.
//
// Dependency-free on purpose: this file is unit-tested from packages/runtime/tests
// under the NodeNext tsc program.

// --- Model ---------------------------------------------------------------

// Round-trip metadata for one declaration line. `before` holds any standalone
// comment/blank lines that precede the declaration (verbatim, each with its
// trailing newline, "" if none). `after` holds the exact text between the value's
// terminating ";" and the newline — typically alignment whitespace + a trailing
// /* … */ comment, "" if none. Not consumed by the editor; carried only so the
// serializer can reproduce the source byte-for-byte.
export interface Trivia {
  before: string;
  after: string;
}

export interface ThemeModel {
  header: string; // leading /* … */ comment, verbatim, no trailing newline ("" if none)
  imports: string[]; // @import statements, verbatim (one per line, incl. trailing ";")
  fontUi: string;
  fontDisplay: string;
  radius: string;
  spacing: string;
  iconLibrary: string;
  light: Record<string, string>; // token → value (no leading --), insertion-ordered
  dark: Record<string, string>;
  lightTrivia: Record<string, Trivia>; // round-trip metadata, keyed by token
  darkTrivia: Record<string, Trivia>;
  custom: string; // unrecognized trailing CSS, preserved verbatim ("" if none)
}

// --- Tokens & roles ------------------------------------------------------

// Canonical color-token order (matches every vendored theme file).
export const COLOR_TOKENS: readonly string[] = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
];

const TYPED_FIELDS: Record<string, keyof ThemeModel> = {
  "font-ui": "fontUi",
  "font-display": "fontDisplay",
  radius: "radius",
  spacing: "spacing",
  "icon-library": "iconLibrary",
};

export interface Role {
  key: string;
  label: string;
  tokens: string[];
}

// The spec §4 role table, verbatim. Grouping tokens that a person edits together:
// each role's first token is its "base"; tokens ending in -foreground are derived.
export const ROLES: readonly Role[] = [
  { key: "brand", label: "Brand", tokens: ["primary", "primary-foreground", "ring", "sidebar-primary", "sidebar-primary-foreground"] },
  { key: "background", label: "Background", tokens: ["background", "foreground"] },
  { key: "surface", label: "Surface", tokens: ["card", "card-foreground", "popover", "popover-foreground", "sidebar", "sidebar-foreground"] },
  { key: "muted", label: "Muted", tokens: ["muted", "muted-foreground", "secondary", "secondary-foreground", "accent", "accent-foreground", "sidebar-accent", "sidebar-accent-foreground"] },
  { key: "border", label: "Border", tokens: ["border", "input", "sidebar-border", "sidebar-ring"] },
  { key: "destructive", label: "Destructive", tokens: ["destructive"] },
  { key: "charts", label: "Charts", tokens: ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] },
];

// A role's "lead" tokens are the ones a shared color would drive — every token
// except the derived foregrounds. roleValue agrees only when all leads match.
function leadTokens(role: Role): string[] {
  return role.tokens.filter((t) => !t.endsWith("-foreground"));
}

// roleValue returns the color shared by all of the role's lead tokens, or "mixed"
// when they diverge. Non-hex values (oklch etc.) participate as plain strings and
// are never coerced: a role whose leads hold different strings reads "mixed".
export function roleValue(model: ThemeModel, mode: "light" | "dark", role: Role): string | "mixed" {
  const map = mode === "light" ? model.light : model.dark;
  const leads = leadTokens(role);
  const first = map[leads[0]];
  for (const t of leads) {
    if (map[t] !== first) return "mixed";
  }
  return first;
}

// applyRole writes `color` to every lead token of the role and an auto-derived
// readable foreground to every -foreground token, returning a NEW model (immutable
// style, for React state). The supplied color is written as given — hex stays hex;
// pre-existing non-hex values are simply overwritten, never round-tripped.
export function applyRole(model: ThemeModel, mode: "light" | "dark", role: Role, color: string): ThemeModel {
  const src = mode === "light" ? model.light : model.dark;
  const next = { ...src };
  const fg = readableForeground(color);
  for (const t of role.tokens) {
    next[t] = t.endsWith("-foreground") ? fg : color;
  }
  return mode === "light" ? { ...model, light: next } : { ...model, dark: next };
}

// Near-black / near-white foregrounds chosen for legibility on any accent while
// staying softer than pure #000/#fff (matching the shadcn convention).
const DARK_FG = "#0a0a0a";
const LIGHT_FG = "#fafafa";

// readableForeground returns DARK_FG for light backgrounds (relative luminance
// > 0.5) and LIGHT_FG for dark ones. Non-hex input can't be measured, so it
// defaults to LIGHT_FG.
export function readableForeground(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return LIGHT_FG;
  const lum = relativeLuminance(rgb);
  return lum > 0.5 ? DARK_FG : LIGHT_FG;
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// --- Parse ---------------------------------------------------------------

const DECL_RE = /^ {2}--([A-Za-z0-9-]+): (.*?);(.*)$/;

interface Block {
  colors: Record<string, string>;
  trivia: Record<string, Trivia>;
  typed: Record<string, string>; // typed-field name → value (only meaningful for :root)
}

export function parseTheme(css: string): ThemeModel {
  const rootIdx = css.indexOf(":root {");
  const prefix = css.slice(0, rootIdx);

  let header = "";
  if (prefix.startsWith("/*")) {
    header = prefix.slice(0, prefix.indexOf("*/") + 2);
  }
  const imports = prefix
    .slice(header.length)
    .split("\n")
    .filter((l) => l.startsWith("@import"));

  const root = readBlock(css, ":root");
  const dark = readBlock(css, ".dark");
  const custom = css.slice(dark.end);

  return {
    header,
    imports,
    fontUi: root.block.typed["font-ui"] ?? "",
    fontDisplay: root.block.typed["font-display"] ?? "",
    radius: root.block.typed["radius"] ?? "",
    spacing: root.block.typed["spacing"] ?? "",
    iconLibrary: root.block.typed["icon-library"] ?? "",
    light: root.block.colors,
    dark: dark.block.colors,
    lightTrivia: root.block.trivia,
    darkTrivia: dark.block.trivia,
    custom,
  };
}

// Locate `selector { … }`, returning its parsed body and the index just past the
// closing "}\n" (so the region after the last block is whatever remains).
function readBlock(css: string, selector: string): { block: Block; end: number } {
  const start = css.indexOf(selector + " {");
  const bodyStart = css.indexOf("\n", start) + 1;
  const braceNL = css.indexOf("\n}", bodyStart); // the newline that ends the last body line
  const body = css.slice(bodyStart, braceNL + 1);
  let end = braceNL + 2; // past the "}"
  if (css[end] === "\n") end += 1;
  return { block: parseBlock(body), end };
}

function parseBlock(body: string): Block {
  const colors: Record<string, string> = {};
  const trivia: Record<string, Trivia> = {};
  const typed: Record<string, string> = {};
  let pendingBefore = "";

  // body ends with a trailing "\n", so the final split element is "".
  const lines = body.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    if (line.startsWith("  color-scheme:")) continue; // re-emitted canonically
    const m = DECL_RE.exec(line);
    if (m) {
      const [, name, value, after] = m;
      if (name in TYPED_FIELDS) {
        typed[name] = value;
      } else {
        colors[name] = value;
        trivia[name] = { before: pendingBefore, after };
        pendingBefore = "";
      }
    } else {
      // standalone comment (or blank) line — attach to the next declaration.
      pendingBefore += line + "\n";
    }
  }
  return { colors, trivia, typed };
}

// --- Serialize -----------------------------------------------------------

export function serializeTheme(model: ThemeModel): string {
  let out = "";
  if (model.header) out += model.header + "\n";
  for (const imp of model.imports) out += imp + "\n";
  out += "\n";

  out += ":root {\n";
  out += "  color-scheme: light;\n";
  out += `  --font-ui: ${model.fontUi};\n`;
  out += `  --font-display: ${model.fontDisplay};\n`;
  out += `  --radius: ${model.radius};\n`;
  out += `  --spacing: ${model.spacing};\n`;
  out += `  --icon-library: ${model.iconLibrary};\n`;
  out += renderTokens(model.light, model.lightTrivia);
  out += "}\n";

  out += "\n";
  out += ".dark {\n";
  out += "  color-scheme: dark;\n";
  out += renderTokens(model.dark, model.darkTrivia);
  out += "}\n";

  out += model.custom;
  return out;
}

function renderTokens(map: Record<string, string>, trivia: Record<string, Trivia>): string {
  let out = "";
  for (const name of Object.keys(map)) {
    const tv = trivia[name] ?? { before: "", after: "" };
    out += `${tv.before}  --${name}: ${map[name]};${tv.after}\n`;
  }
  return out;
}
