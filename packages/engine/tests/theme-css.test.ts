import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseTheme,
  serializeTheme,
  COLOR_TOKENS,
  SHADOW_TOKENS,
  ROLES,
  roleValue,
  applyRole,
  readableForeground,
} from "../dashboard/src/lib/theme-css.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THEMES_DIR = path.resolve(__dirname, "../themes");
const themeFiles = fs.readdirSync(THEMES_DIR).filter((f) => f.endsWith(".css"));

describe("round-trip", () => {
  it("has vendored theme fixtures to test", () => {
    expect(themeFiles.length).toBeGreaterThan(0);
  });

  for (const f of themeFiles) {
    it(`serializeTheme(parseTheme()) is byte-identical for ${f}`, () => {
      const css = fs.readFileSync(path.join(THEMES_DIR, f), "utf8");
      expect(serializeTheme(parseTheme(css))).toBe(css);
    });

    it(`parseTheme(serializeTheme()) deep-equals model for ${f}`, () => {
      const css = fs.readFileSync(path.join(THEMES_DIR, f), "utf8");
      const model = parseTheme(css);
      expect(parseTheme(serializeTheme(model))).toEqual(model);
    });
  }
});

describe("model shape", () => {
  const css = fs.readFileSync(path.join(THEMES_DIR, "lodekit.css"), "utf8");
  const model = parseTheme(css);

  it("lifts typed fields out of the token maps", () => {
    expect(model.radius).toBe("0.1875rem");
    expect(model.spacing).toBe("0.25rem");
    expect(model.iconLibrary).toBe("lucide");
    expect(model.fontDisplay).toBe('"Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"');
    expect(model.fontMono).toBe('"Spline Sans Mono", ui-monospace, monospace');
    expect(model.light["radius"]).toBeUndefined();
    expect(model.light["color-scheme"]).toBeUndefined();
  });

  it("captures @import statements verbatim", () => {
    expect(model.imports).toHaveLength(1);
    expect(model.imports[0]).toContain("fonts.googleapis.com");
  });

  it("holds all color tokens in the light and dark maps", () => {
    for (const t of COLOR_TOKENS) {
      expect(model.light[t]).toBeDefined();
      expect(model.dark[t]).toBeDefined();
    }
  });
});

describe("custom CSS preservation", () => {
  it("preserves an appended @media block verbatim", () => {
    const base = fs.readFileSync(path.join(THEMES_DIR, "lodekit.css"), "utf8");
    const extra = '\n@media (min-width: 40rem) {\n  :root {\n    --radius: 1rem;\n  }\n}\n';
    const css = base + extra;
    const model = parseTheme(css);
    expect(model.custom).toContain("@media (min-width: 40rem)");
    expect(serializeTheme(model)).toBe(css);
  });

  it("reports empty custom for vendored themes", () => {
    const css = fs.readFileSync(path.join(THEMES_DIR, "lodekit.css"), "utf8");
    expect(parseTheme(css).custom).toBe("");
  });
});

describe("non-canonical content preservation", () => {
  const base = fs.readFileSync(path.join(THEMES_DIR, "lodekit.css"), "utf8");

  it("preserves content between :root and .dark verbatim", () => {
    const css = base.replace("}\n\n.dark {", "}\n\n.between-marker { color: red }\n\n.dark {");
    const model = parseTheme(css);
    expect(model.custom).toBe("");
    expect(serializeTheme(model)).toBe(css);
  });

  it("preserves a trailing standalone comment just before a block's }", () => {
    const css = base.replace(
      "  --sidebar-ring: #a93510;\n}",
      "  --sidebar-ring: #a93510;\n  /* trailing note */\n}",
    );
    expect(serializeTheme(parseTheme(css))).toBe(css);
  });

  it("preserves a comment before a typed field", () => {
    const css = base.replace("  --radius: 0.1875rem;", "  /* pick a radius */\n  --radius: 0.1875rem;");
    expect(serializeTheme(parseTheme(css))).toBe(css);
  });

  it("preserves an inline comment after a typed field", () => {
    const css = base.replace("  --icon-library: lucide;", "  --icon-library: lucide;  /* icons */");
    expect(serializeTheme(parseTheme(css))).toBe(css);
  });

  it("degrades to verbatim custom when .dark is missing", () => {
    const css = "/* header */\n:root {\n  color-scheme: light;\n  --radius: 1rem;\n}\n";
    const model = parseTheme(css);
    expect(model.custom).toBe(css);
    expect(serializeTheme(model)).toBe(css);
    expect(parseTheme(serializeTheme(model))).toEqual(model);
  });

  it("degrades to verbatim custom when a block is unterminated", () => {
    const css = ":root {\n  color-scheme: light;\n.dark {\n  color-scheme: dark;\n}\n";
    const model = parseTheme(css);
    expect(model.custom).toBe(css);
    expect(serializeTheme(model)).toBe(css);
  });
});

describe("roles", () => {
  const model = parseTheme(fs.readFileSync(path.join(THEMES_DIR, "lodekit.css"), "utf8"));
  const brand = ROLES.find((r) => r.key === "brand")!;

  it("exposes the spec §4 role table", () => {
    expect(ROLES.map((r) => r.key)).toEqual([
      "brand",
      "background",
      "surface",
      "muted",
      "border",
      "destructive",
      "charts",
    ]);
    expect(brand.tokens).toEqual([
      "primary",
      "primary-foreground",
      "ring",
      "sidebar-primary",
      "sidebar-primary-foreground",
    ]);
  });

  it("reads the shared value when lead tokens agree", () => {
    expect(roleValue(model, "light", brand)).toBe("#a93510");
  });

  it("reads 'mixed' when lead tokens diverge", () => {
    const border = ROLES.find((r) => r.key === "border")!;
    // lodekit: border/input/sidebar-border are #cdc4ae but sidebar-ring is the brand color
    expect(roleValue(model, "light", border)).toBe("mixed");
    const mixed = applyRole(model, "light", { key: "x", label: "x", tokens: ["primary"] }, "#cdc4ae");
    // primary now diverges from ring/sidebar-primary
    expect(roleValue(mixed, "light", brand)).toBe("mixed");
  });

  it("applyRole writes the group and derives foregrounds", () => {
    const next = applyRole(model, "light", brand, "#ff0000");
    expect(next.light["primary"]).toBe("#ff0000");
    expect(next.light["ring"]).toBe("#ff0000");
    expect(next.light["sidebar-primary"]).toBe("#ff0000");
    expect(next.light["primary-foreground"]).toBe(readableForeground("#ff0000"));
    expect(next.light["sidebar-primary-foreground"]).toBe(readableForeground("#ff0000"));
    // immutable: original untouched, other mode untouched
    expect(model.light["primary"]).toBe("#a93510");
    expect(next.dark["primary"]).toBe(model.dark["primary"]);
  });

  it("readableForeground picks a light fg on dark colors, dark fg on light colors", () => {
    const fgOnBlack = readableForeground("#000000");
    const fgOnWhite = readableForeground("#ffffff");
    expect(fgOnBlack).not.toBe(fgOnWhite);
    // a dark (black) background wants a light, near-white foreground; and vice versa
    expect(readableForeground("#1e1e2e")).toBe(fgOnBlack);
    expect(readableForeground("#f5f5f5")).toBe(fgOnWhite);
  });

  it("never coerces non-hex values but still writes hex on applyRole", () => {
    // dark border/input are rgba; Border role reads mixed (sidebar-ring diverges anyway)
    const border = ROLES.find((r) => r.key === "border")!;
    expect(roleValue(model, "dark", border)).toBe("mixed");
    const next = applyRole(model, "dark", border, "#123456");
    expect(next.dark["border"]).toBe("#123456");
    expect(next.dark["input"]).toBe("#123456");
    // model still has the original oklch untouched
    expect(model.dark["border"]).toBe("rgba(243, 224, 165, 0.16)");
  });
});

describe("font-mono typed field", () => {
  const base = fs.readFileSync(path.join(THEMES_DIR, "lodekit.css"), "utf8");
  const MONO = '"Spline Sans Mono", ui-monospace, monospace';
  // Insert a --font-mono line right after --font-display (works whether or not
  // the vendored file ships one yet; strip any existing line first).
  const stripped = base.replace(/^ {2}--font-mono: .*\n/m, "");
  const withMono = stripped.replace(
    /^( {2}--font-display: .*\n)/m,
    `$1  --font-mono: ${MONO};\n`,
  );

  it("parses --font-mono into the model, not the color maps", () => {
    const model = parseTheme(withMono);
    expect(model.fontMono).toBe(MONO);
    expect(model.light["font-mono"]).toBeUndefined();
  });

  it("round-trips a theme WITH --font-mono byte-identical", () => {
    expect(serializeTheme(parseTheme(withMono))).toBe(withMono);
  });

  it("round-trips a theme WITHOUT --font-mono untouched (no empty line emitted)", () => {
    const model = parseTheme(stripped);
    expect(model.fontMono).toBe("");
    expect(serializeTheme(model)).toBe(stripped);
    // Checks for a declaration line specifically (colon suffix) rather than the
    // bare token: the header comment legitimately documents "--font-mono" as one
    // of the typed fields in prose, with no declaration emitted.
    expect(serializeTheme(model)).not.toContain("--font-mono:");
  });

  it("serializes an edited-in fontMono after font-display, before radius", () => {
    const model = { ...parseTheme(stripped), fontMono: '"IBM Plex Mono", ui-monospace, monospace' };
    const out = serializeTheme(model);
    expect(out).toContain('  --font-mono: "IBM Plex Mono", ui-monospace, monospace;\n');
    expect(out.indexOf("--font-display")).toBeLessThan(out.indexOf("--font-mono"));
    expect(out.indexOf("--font-mono")).toBeLessThan(out.indexOf("--radius:"));
  });
});

describe("physics typed fields (font-weight-body, default-transition-timing-function)", () => {
  const base = fs.readFileSync(path.join(THEMES_DIR, "lodekit.css"), "utf8");
  const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
  // Strip any lines the vendored file may ship, then insert both after
  // --icon-library (their canonical position).
  const stripped = base
    .replace(/^ {2}--font-weight-body: .*\n/m, "")
    .replace(/^ {2}--default-transition-timing-function: .*\n/m, "");
  const withPhysics = stripped.replace(
    /^( {2}--icon-library: .*\n)/m,
    `$1  --font-weight-body: 500;\n  --default-transition-timing-function: ${EASE};\n`,
  );

  it("parses both fields into the model, not the color maps", () => {
    const model = parseTheme(withPhysics);
    expect(model.fontWeightBody).toBe("500");
    expect(model.easeDefault).toBe(EASE);
    expect(model.light["font-weight-body"]).toBeUndefined();
    expect(model.light["default-transition-timing-function"]).toBeUndefined();
  });

  it("round-trips a theme WITH physics fields byte-identical", () => {
    expect(serializeTheme(parseTheme(withPhysics))).toBe(withPhysics);
  });

  it("round-trips a theme WITHOUT them untouched (no empty lines emitted)", () => {
    const model = parseTheme(stripped);
    expect(model.fontWeightBody).toBe("");
    expect(model.easeDefault).toBe("");
    expect(serializeTheme(model)).toBe(stripped);
    expect(serializeTheme(model)).not.toContain("--font-weight-body:");
    expect(serializeTheme(model)).not.toContain("--default-transition-timing-function:");
  });

  it("serializes edited-in fields after icon-library, before the color tokens", () => {
    const model = { ...parseTheme(stripped), fontWeightBody: "500", easeDefault: EASE };
    const out = serializeTheme(model);
    expect(out.indexOf("--icon-library")).toBeLessThan(out.indexOf("--font-weight-body"));
    expect(out.indexOf("--font-weight-body")).toBeLessThan(out.indexOf("--default-transition-timing-function"));
    expect(out.indexOf("--default-transition-timing-function")).toBeLessThan(out.indexOf("--background:"));
  });

  it("preserves a comment before a physics field", () => {
    const css = withPhysics.replace(
      "  --font-weight-body: 500;",
      "  /* identity physics */\n  --font-weight-body: 500;",
    );
    expect(serializeTheme(parseTheme(css))).toBe(css);
  });
});

describe("per-plate shadow tokens", () => {
  const base = fs.readFileSync(path.join(THEMES_DIR, "lodekit.css"), "utf8");
  const OVERLAY = "0 2px 4px rgba(37, 27, 37, 0.08), 0 22px 44px -20px rgba(37, 27, 37, 0.42)";
  // Append a divergent shadow set to each plate: flat rest + ink overlay in
  // light, everything flat in dark — the Flat Paper pattern.
  const lightShadows = SHADOW_TOKENS
    .map((t) => `  --${t}: ${["shadow-md", "shadow-lg", "shadow-xl", "shadow-2xl"].includes(t) ? OVERLAY : "0 0 #0000"};`)
    .join("\n");
  const darkShadows = SHADOW_TOKENS.map((t) => `  --${t}: 0 0 #0000;`).join("\n");
  const withShadows = base
    .replace(/\n\}\n\n\.dark \{/, `\n${lightShadows}\n}\n\n.dark {`)
    .replace(/\n\}\n*$/, `\n${darkShadows}\n}\n`);

  it("flows shadows through the plate maps, per plate", () => {
    const model = parseTheme(withShadows);
    expect(model.light["shadow-md"]).toBe(OVERLAY);
    expect(model.light["shadow-sm"]).toBe("0 0 #0000");
    expect(model.dark["shadow-md"]).toBe("0 0 #0000");
    // not lifted into typed fields, not confused with color tokens
    expect(COLOR_TOKENS).not.toContain("shadow-md");
  });

  it("round-trips a theme with per-plate shadows byte-identical", () => {
    expect(serializeTheme(parseTheme(withShadows))).toBe(withShadows);
  });

  it("round-trips shadows with an inline comment", () => {
    const css = withShadows.replace(
      "  --shadow-2xs: 0 0 #0000;",
      "  --shadow-2xs: 0 0 #0000; /* Flat Paper */",
    );
    expect(serializeTheme(parseTheme(css))).toBe(css);
  });

  it("leaves a shadow-free theme's plates without shadow entries", () => {
    const model = parseTheme(base);
    for (const t of SHADOW_TOKENS) {
      expect(model.light[t]).toBeUndefined();
      expect(model.dark[t]).toBeUndefined();
    }
  });
});
