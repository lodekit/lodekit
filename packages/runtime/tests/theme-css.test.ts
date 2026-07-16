import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseTheme,
  serializeTheme,
  COLOR_TOKENS,
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
    expect(model.radius).toBe("0.625rem");
    expect(model.spacing).toBe("0.25rem");
    expect(model.iconLibrary).toBe("lucide");
    expect(model.fontDisplay).toBe('"Fraunces", Georgia, serif');
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
      "  --sidebar-ring: #ce6f26;\n}",
      "  --sidebar-ring: #ce6f26;\n  /* trailing note */\n}",
    );
    expect(serializeTheme(parseTheme(css))).toBe(css);
  });

  it("preserves a comment before a typed field", () => {
    const css = base.replace("  --radius: 0.625rem;", "  /* pick a radius */\n  --radius: 0.625rem;");
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
    expect(roleValue(model, "light", brand)).toBe("#ce6f26");
  });

  it("reads 'mixed' when lead tokens diverge", () => {
    const border = ROLES.find((r) => r.key === "border")!;
    // lodekit: border/input/sidebar-border are #dbe6f0 but sidebar-ring is the brand color
    expect(roleValue(model, "light", border)).toBe("mixed");
    const mixed = applyRole(model, "light", { key: "x", label: "x", tokens: ["primary"] }, "#dbe6f0");
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
    expect(model.light["primary"]).toBe("#ce6f26");
    expect(next.dark["primary"]).toBe(model.dark["primary"]);
  });

  it("readableForeground picks a light fg on dark colors, dark fg on light colors", () => {
    const fgOnBlack = readableForeground("#000000");
    const fgOnWhite = readableForeground("#ffffff");
    expect(fgOnBlack).not.toBe(fgOnWhite);
    // a dark (black) background wants a light, near-white foreground; and vice versa
    expect(readableForeground("#1e1e2e")).toBe(fgOnBlack);
    expect(readableForeground("#f7fafd")).toBe(fgOnWhite);
  });

  it("never coerces non-hex values but still writes hex on applyRole", () => {
    // dark border/input are oklch; Border role reads mixed (sidebar-ring diverges anyway)
    const border = ROLES.find((r) => r.key === "border")!;
    expect(roleValue(model, "dark", border)).toBe("mixed");
    const next = applyRole(model, "dark", border, "#123456");
    expect(next.dark["border"]).toBe("#123456");
    expect(next.dark["input"]).toBe("#123456");
    // model still has the original oklch untouched
    expect(model.dark["border"]).toBe("oklch(1 0 0 / 10%)");
  });
});
