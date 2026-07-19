# Lodekit Retheme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** Replace the retired cork-amber identity with the "Sky in a Jar" woodblock-print identity (docs/DESIGN.md) across the default theme, `@lodekit/ui`, the dashboard chrome, the Greenhouse showcase, and the docs skin — including the `--font-mono` canonical-format extension.

**Architecture:** Two token files carry the identity in lockstep (`packages/engine/themes/lodekit.css` vendored theme + `packages/ui/theme-tokens.css` build-time base). Identity physics (easing, shadows, focus) live in `theme-tokens.css`'s `@theme inline`/`@layer base` sections, which `@lodekit/ui` owns — component internals are never forked. Two new primitives (`Kicker`, `Meta`) carry the mono voice; the dashboard chrome migrates to them.

**Tech Stack:** Tailwind v4 (`@theme inline` runtime vars), shadcn-style components, vitest, TanStack Start dashboard, Starlight docs.

**Spec:** `docs/specs/2026-07-19-lodekit-retheme-design.md`. **Session bead:** lk-is3.

## Global Constraints

- **Never touch `web/main`** — the landing redesign is in flight on the `web` branch.
- Component internals (`packages/ui/src/components/*`) and the vendored `packages/ui/shadcn-tailwind.css` are **never edited** — identity flows through tokens, `theme-tokens.css`'s owned blocks, and the two new primitives. (Exception: the new `typography.tsx` file is created, not an edit of an existing internal.)
- Palette values verbatim from the spec §2 tables (light + dark, incl. derived values `#e06a7d`, `rgba(243, 224, 165, 0.16)`/`0.22`, dark charts `#7285bd #e5a85c #c07a63 #9daec2 #a893a8`). Lowercase hex in CSS files.
- Fonts via Google css2 imports only: `Zen+Kaku+Gothic+New:wght@400;500;700`, `Spline+Sans+Mono:wght@400;500`, `display=swap`.
- `docs/changelog.md` is **append-only**; entry lands in the same PR (Task 11).
- No `Co-Authored-By` trailers in commits; bead IDs in every commit message.
- All work on the current branch `ui`; commit per task; PR at the end (squash-merge, conventional title). Never merge — the person merges.
- WCAG AA is a floor: 4.5:1 text, 3:1 UI. The contrast test (Task 5) is the arbiter; if a spec value fails there, tune the *derived* values only (never the DESIGN.md verbatim ones) and note it.

---

### Task 1: `--font-mono` in the theme parser/serializer

**Files:**
- Modify: `packages/engine/dashboard/src/lib/theme-css.ts`
- Test: `packages/engine/tests/theme-css.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ThemeModel.fontMono: string` (empty when the theme has no `--font-mono`); `parseTheme` lifts `--font-mono`; `serializeTheme` emits it between `--font-display` and `--radius` **only when non-empty**. Tasks 2, 5, 6 rely on this exact behavior.

**Acceptance Criteria:**
- `parseTheme` lifts `--font-mono` into `model.fontMono` (never into the color maps).
- A theme *without* `--font-mono` parses to `fontMono: ""` and round-trips byte-identical (no `--font-mono: ;` line ever emitted).
- An edited-in `fontMono` serializes on its own line after `--font-display`, before `--radius`.
- All existing theme-css tests still pass unmodified.

- [ ] **Step 1: Write the failing tests** — append to `packages/engine/tests/theme-css.test.ts`. The current vendored `lodekit.css` has no `--font-mono` yet (Task 2 adds it), so build the with-mono fixture by string insertion — this keeps Task 1 independent of Task 2:

```ts
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
    expect(serializeTheme(model)).not.toContain("--font-mono");
  });

  it("serializes an edited-in fontMono after font-display, before radius", () => {
    const model = { ...parseTheme(stripped), fontMono: '"IBM Plex Mono", ui-monospace, monospace' };
    const out = serializeTheme(model);
    expect(out).toContain('  --font-mono: "IBM Plex Mono", ui-monospace, monospace;\n');
    expect(out.indexOf("--font-display")).toBeLessThan(out.indexOf("--font-mono"));
    expect(out.indexOf("--font-mono")).toBeLessThan(out.indexOf("--radius:"));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @lodekit/engine test -- theme-css`
Expected: the four new tests FAIL (`fontMono` undefined / lines land in `light` map); all pre-existing tests PASS.

- [ ] **Step 3: Implement** — in `packages/engine/dashboard/src/lib/theme-css.ts`:

1. `ThemeModel` (after `fontDisplay: string;`): add `fontMono: string;`
2. Update the model comment `// the five typed fields (font-ui/font-display/radius/spacing/icon-library)` → `// the six typed fields (font-ui/font-display/font-mono/radius/spacing/icon-library)` and the file-header comment's field list (`--font-*` already covers it — only touch it if it enumerates).
3. `TYPED_FIELDS`: add `"font-mono": "fontMono",` after the `"font-display"` entry.
4. `parseTheme` return object (after `fontDisplay: …`): `fontMono: root.block.typed["font-mono"] ?? "",`
5. `degraded()` (after `fontDisplay: "",`): `fontMono: "",`
6. `serializeTheme`, after the `font-display` line emission:

```ts
  if (model.fontMono) out += line(model.lightTrivia, "font-mono", `  --font-mono: ${model.fontMono};`);
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @lodekit/engine test -- theme-css` — Expected: ALL PASS.
Run: `pnpm --filter @lodekit/engine check` — Expected: clean (`cssVarsFor` etc. only read existing fields; no literals construct `ThemeModel` outside `parseTheme`/`degraded` — verified at planning).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/dashboard/src/lib/theme-css.ts packages/engine/tests/theme-css.test.ts
git commit -m "feat(engine): --font-mono typed field in the canonical theme format (<task-bead-id>)"
```

---

### Task 2: Rewrite the token files in the new identity

**Files:**
- Modify: `packages/engine/themes/lodekit.css` (full rewrite)
- Modify: `packages/ui/theme-tokens.css` (token blocks only — the `@theme inline` / `@layer base` sections are Task 3)
- Modify: `packages/engine/tests/theme-css.test.ts` (old-value anchors)

**Interfaces:**
- Consumes: Task 1's `fontMono` support (the new lodekit.css sets `--font-mono`; round-trip tests iterate every vendored theme).
- Produces: the token values every later task renders against. Sidebar/nav wash = `--accent`/`--sidebar-accent` `#dcd3be` (light) / `#242e63` (dark).

**Acceptance Criteria:**
- `lodekit.css` and `theme-tokens.css` carry identical token values: spec §2.2/§2.3 tables verbatim, `--radius: 0.1875rem`, the three font stacks, one css2 `@import` in `lodekit.css` (none in `theme-tokens.css`).
- No retired value remains anywhere in either file (`#ce6f26`, `#f7fafd`, Fraunces, Hanken Grotesk).
- `pnpm --filter @lodekit/engine test` passes (round-trip + updated anchors).

- [ ] **Step 1: Replace `packages/engine/themes/lodekit.css` with exactly:**

```css
/* Lodekit — the Sky in a Jar identity (DESIGN.md): plum ink on aged parchment,
   rust accent by day; pale gold on deep indigo, ochre accent by night. Canonical
   theme format: one @import block, :root (light) + .dark, full shadcn token set,
   plus --font-ui/--font-display/--font-mono/--radius/--spacing/--icon-library. */
@import url("https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Spline+Sans+Mono:wght@400;500&display=swap");

:root {
  color-scheme: light;
  --font-ui: "Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  --font-display: "Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  --font-mono: "Spline Sans Mono", ui-monospace, monospace;
  --radius: 0.1875rem;
  --spacing: 0.25rem;
  --icon-library: lucide;
  --background: #ede7d8;
  --foreground: #251b25;
  --card: #f6f1e6;
  --card-foreground: #251b25;
  --popover: #f6f1e6;
  --popover-foreground: #251b25;
  --primary: #935842;
  --primary-foreground: #f6f1e6;
  --secondary: #dcd3be;
  --secondary-foreground: #251b25;
  --muted: #dcd3be;
  --muted-foreground: #4f4f59;
  --accent: #dcd3be;
  --accent-foreground: #251b25;
  --destructive: #a61e33;
  --border: #cdc4ae;
  --input: #cdc4ae;
  --ring: #935842;
  /* Chart series — DESIGN.md fixed order; the sky family is charts-only. */
  --chart-1: #4b5d91;
  --chart-2: #dd9741;
  --chart-3: #935842;
  --chart-4: #8394a9;
  --chart-5: #251b25;
  --sidebar: #ede7d8;
  --sidebar-foreground: #251b25;
  --sidebar-primary: #935842;
  --sidebar-primary-foreground: #f6f1e6;
  --sidebar-accent: #dcd3be;
  --sidebar-accent-foreground: #251b25;
  --sidebar-border: #cdc4ae;
  --sidebar-ring: #935842;
}

.dark {
  color-scheme: dark;
  --background: #121a44;
  --foreground: #f3e0a5;
  --card: #1b2452;
  --card-foreground: #f3e0a5;
  --popover: #1b2452;
  --popover-foreground: #f3e0a5;
  --primary: #dd9741;
  --primary-foreground: #121a44;
  --secondary: #242e63;
  --secondary-foreground: #f3e0a5;
  --muted: #242e63;
  --muted-foreground: #c6bba8;
  --accent: #242e63;
  --accent-foreground: #f3e0a5;
  --destructive: #e06a7d; /* derived (L): crimson brightened for AA on the night surfaces */
  --border: rgba(243, 224, 165, 0.16); /* derived (L): gold-tinted hairline on the night plate */
  --input: rgba(243, 224, 165, 0.22);
  --ring: #dd9741;
  /* derived (L): the light series brightened for the night plate (plum → pale plum). */
  --chart-1: #7285bd;
  --chart-2: #e5a85c;
  --chart-3: #c07a63;
  --chart-4: #9daec2;
  --chart-5: #a893a8;
  --sidebar: #121a44;
  --sidebar-foreground: #f3e0a5;
  --sidebar-primary: #dd9741;
  --sidebar-primary-foreground: #121a44;
  --sidebar-accent: #242e63;
  --sidebar-accent-foreground: #f3e0a5;
  --sidebar-border: rgba(243, 224, 165, 0.16);
  --sidebar-ring: #dd9741;
}
```

- [ ] **Step 2: Update `packages/ui/theme-tokens.css`** — replace the file-header comment and the whole `@layer lodekit-tokens { … }` block (leave `@theme inline` and `@layer base` for Task 3). New header + block:

```css
/* Sky in a Jar — the Lodekit identity tokens (DESIGN.md): plum ink on aged
   parchment, rust accent by day; pale gold on deep indigo, ochre by night.
   Build-time base for @lodekit/ui consumers; the served theme (/_ui/theme.css)
   overrides these same tokens at runtime and carries the font @import. The brand
   accent maps to shadcn's --primary (buttons, fills, active states); shadcn's own
   --accent stays a neutral hover wash and must not carry rust/ochre. */
@layer lodekit-tokens {
:root {
  /* Native scrollbars and form controls follow the theme; without this the
     browser paints them light-scheme even under .dark. */
  color-scheme: light;
  --font-ui: "Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  --font-display: "Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  --font-mono: "Spline Sans Mono", ui-monospace, monospace;
  --radius: 0.1875rem;
  --spacing: 0.25rem;
  --icon-library: lucide;
  [… identical token lines to lodekit.css :root, from --background through --sidebar-ring …]
}

.dark {
  color-scheme: dark;
  [… identical token lines to lodekit.css .dark …]
}
}
```

The token lines are copied **exactly** from Step 1 (same values, same order, same comments). The two files' `:root`/`.dark` bodies differ only in `theme-tokens.css`'s color-scheme comment.

- [ ] **Step 3: Update test anchors in `packages/engine/tests/theme-css.test.ts`** — these string anchors reference old values and must track the new file:

1. "lifts typed fields": `model.radius` → `"0.1875rem"`; `model.fontDisplay` → `'"Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"'`; add `expect(model.fontMono).toBe('"Spline Sans Mono", ui-monospace, monospace');`
2. "preserves a trailing standalone comment": both `--sidebar-ring: #ce6f26;` → `--sidebar-ring: #935842;`
3. "preserves a comment before a typed field": `--radius: 0.625rem` → `--radius: 0.1875rem` (both occurrences in the replace call).
4. roles → "reads the shared value": `#ce6f26` → `#935842`.
5. "reads 'mixed'": comment `border/input/sidebar-border are #dbe6f0` → `#cdc4ae`; `applyRole(... "#dbe6f0")` → `"#cdc4ae"`.
6. "applyRole writes the group": `expect(model.light["primary"]).toBe("#ce6f26")` → `"#935842"`.
7. "never coerces non-hex": `expect(model.dark["border"]).toBe("oklch(1 0 0 / 10%)")` → `"rgba(243, 224, 165, 0.16)"` (still non-hex — the test's intent holds).

- [ ] **Step 4: Run to verify**

Run: `pnpm --filter @lodekit/engine test -- theme-css` — Expected: ALL PASS (round-trip now exercises the real `--font-mono` line).
Run: `grep -rn "ce6f26\|Fraunces\|Hanken\|f7fafd" packages/engine/themes packages/ui/theme-tokens.css` — Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/themes/lodekit.css packages/ui/theme-tokens.css packages/engine/tests/theme-css.test.ts
git commit -m "feat(ui): Sky in a Jar token palette — lodekit default theme + ui base (<task-bead-id>)"
```

---

### Task 3: `@lodekit/ui` identity layer (easing, shadows, focus, type, code)

**Files:**
- Modify: `packages/ui/theme-tokens.css` (the `@theme inline` and `@layer base` sections)

**Interfaces:**
- Consumes: Task 2's token values in the same file.
- Produces: `--lk-ease-drift`, `--lk-shadow-rest`/`--lk-shadow-lift`/`--lk-shadow-overlay` identity vars; themed `font-mono` utility; global focus outline; mono `code/kbd/samp/pre`. Tasks 4/7/8/9 render against these.

**Acceptance Criteria:**
- All `transition-*` utilities default to `cubic-bezier(0.22, 1, 0.36, 1)`; `ease-drift` exists as a utility.
- `shadow-2xs/xs/sm` render no shadow; `shadow-md/lg/xl/2xl` render the ink-tinted overlay shadow; **all** shadows are `none` under `.dark`.
- `:focus-visible` shows a 2px `var(--ring)` outline offset 3px with no ring glow, including on components that set `outline-none`/ring utilities internally.
- `h1–h4` weight 700; `code/kbd/samp/pre` use `var(--font-mono)`.
- `pnpm --filter @lodekit/ui test` and `pnpm --filter @lodekit/engine check` pass.

- [ ] **Step 1: Extend the `@theme inline` block** — after `--font-display: var(--font-display);` add:

```css
  --font-mono: var(--font-mono);
  --ease-drift: var(--lk-ease-drift);
  --default-transition-timing-function: var(--lk-ease-drift);
```

and at the end of the same `@theme inline` block (after `--color-sidebar-ring`) add:

```css
  --shadow-2xs: var(--lk-shadow-rest);
  --shadow-xs: var(--lk-shadow-rest);
  --shadow-sm: var(--lk-shadow-rest);
  --shadow-md: var(--lk-shadow-overlay);
  --shadow-lg: var(--lk-shadow-overlay);
  --shadow-xl: var(--lk-shadow-overlay);
  --shadow-2xl: var(--lk-shadow-overlay);
```

- [ ] **Step 2: Replace the `@layer base` block** at the end of the file with:

```css
@layer base {
  :root {
    /* Identity physics (DESIGN.md §4–5) — ui-owned, above the theme format:
       themes recolor tokens; these carry the print register. */
    --lk-ease-drift: cubic-bezier(0.22, 1, 0.36, 1);
    --lk-shadow-rest: 0 0 #0000; /* Flat Paper: nothing floats at rest */
    --lk-shadow-lift: 0 1px 2px rgba(37, 27, 37, 0.08), 0 14px 34px -22px rgba(37, 27, 37, 0.4);
    --lk-shadow-overlay: 0 2px 4px rgba(37, 27, 37, 0.08), 0 22px 44px -20px rgba(37, 27, 37, 0.42);
  }
  .dark {
    /* Night has no shadows — elevation is the night-hi / night-lo steps. */
    --lk-shadow-lift: 0 0 #0000;
    --lk-shadow-overlay: 0 0 #0000;
  }
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  h1, h2, h3, h4 {
    font-family: var(--font-display);
    font-weight: 700;
  }
  code, kbd, samp, pre {
    font-family: var(--font-mono);
  }
  /* Focus is an outline, never a glow (DESIGN.md §5). Centralized so component
     internals stay stock; !important intentionally outranks the internals'
     outline-none and focus ring utilities. */
  :focus-visible {
    outline: 2px solid var(--ring) !important;
    outline-offset: 3px !important;
    --tw-ring-shadow: 0 0 #0000 !important;
  }
}
```

- [ ] **Step 3: Run to verify**

Run: `pnpm --filter @lodekit/ui test` — Expected: PASS (ssr/chart/icon suites unaffected).
Run: `pnpm --filter @lodekit/engine check` — Expected: clean.
Runnable CSS check (Tailwind compiles the file): `pnpm --filter @lodekit/engine test` — the dashboard's vitest setup does not compile CSS, so additionally do the visual smoke in Step 4.

- [ ] **Step 4: Visual smoke (evidence for the print physics)**

Run: `pnpm dev` (from repo root), open `http://localhost:4700` (or the printed port). Verify in devtools: a `Button`'s computed `transition-timing-function` is `cubic-bezier(0.22, 1, 0.36, 1)`; a `Popover`/menu shows the soft ink shadow in light and none in dark; tabbing shows the 2px outline (no glow). Note findings in the task bead.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/theme-tokens.css
git commit -m "feat(ui): identity layer — drift easing, Flat Paper shadow scale, outline focus, mono code (<task-bead-id>)"
```

---

### Task 4: `Kicker` and `Meta` primitives

**Files:**
- Create: `packages/ui/src/components/typography.tsx`
- Modify: `packages/ui/src/index.ts`
- Test: `packages/ui/tests/typography.test.tsx`

**Interfaces:**
- Consumes: `cn` from `../lib/utils`; the `font-mono` utility (themed by Task 3, but renders regardless).
- Produces: `Kicker` and `Meta` — `React.ComponentProps<"span">` components exported from `@lodekit/ui`. Tasks 7, 8, 9 import them by these exact names.

**Acceptance Criteria:**
- `Kicker`: mono, 0.72rem, weight 500, uppercase, `tracking-[0.12em]`, muted-foreground default; `className` merges via `cn`.
- `Meta`: mono, 0.8125rem, normal case, `tracking-[0.01em]`, `tabular-nums`.
- Both exported from `@lodekit/ui`; SSR test passes.

- [ ] **Step 1: Write the failing test** — `packages/ui/tests/typography.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { Kicker, Meta } from "../src";

describe("Kicker", () => {
  it("renders the mono uppercase eyebrow and merges classes", () => {
    const html = renderToString(<Kicker className="mb-1">Colors</Kicker>);
    expect(html).toContain("font-mono");
    expect(html).toContain("uppercase");
    expect(html).toContain("tracking-[0.12em]");
    expect(html).toContain("mb-1");
    expect(html).toContain("Colors");
  });
});

describe("Meta", () => {
  it("renders the normal-case mono data voice with tabular-nums", () => {
    const html = renderToString(<Meta>2026-07-19 14:02</Meta>);
    expect(html).toContain("font-mono");
    expect(html).toContain("tabular-nums");
    expect(html).toContain("tracking-[0.01em]");
    expect(html).not.toContain("uppercase");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @lodekit/ui test -- typography` — Expected: FAIL (`Kicker` not exported).

- [ ] **Step 3: Implement** — `packages/ui/src/components/typography.tsx`:

```tsx
import type * as React from "react";

import { cn } from "../lib/utils";

// The identity's mono voices (DESIGN.md §3): Kicker is the uppercase eyebrow;
// Meta is the normal-case data voice (app ids, paths, values, timestamps).
function Kicker({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="kicker"
      className={cn(
        "text-muted-foreground font-mono text-[0.72rem] font-medium tracking-[0.12em] uppercase",
        className,
      )}
      {...props}
    />
  );
}

function Meta({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="meta"
      className={cn("font-mono text-[0.8125rem] tracking-[0.01em] tabular-nums", className)}
      {...props}
    />
  );
}

export { Kicker, Meta };
```

In `packages/ui/src/index.ts`, add alphabetically (after the `tooltip` export line):

```ts
export * from "./components/typography";
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @lodekit/ui test` — Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/typography.tsx packages/ui/src/index.ts packages/ui/tests/typography.test.tsx
git commit -m "feat(ui): Kicker + Meta mono-voice primitives (<task-bead-id>)"
```

---

### Task 5: WCAG contrast regression test

**Files:**
- Create: `packages/engine/tests/theme-contrast.test.ts`

**Interfaces:**
- Consumes: `parseTheme` from `../dashboard/src/lib/theme-css.js`; the vendored themes dir and `root/themes`.
- Produces: a permanent AA gate over every theme file in both dirs (this discharges DESIGN.md §2's "validated properly in the retheme slice").

**Acceptance Criteria:**
- Asserts ≥4.5:1 on the load-bearing text pairs and ≥3:1 on ring/charts, both modes, for every `.css` in `packages/engine/themes/` AND `root/themes/`.
- Non-hex values (alpha hairlines, any legacy oklch) are skipped, not failed — measured pairs only.
- Passes against the Task 2 lodekit.css. (greenhouse-green gains full coverage when Task 7 makes it all-hex.)

- [ ] **Step 1: Write the test** — `packages/engine/tests/theme-contrast.test.ts`:

```ts
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
  ["chart-1", "background", 3],
  ["chart-2", "background", 3],
  ["chart-3", "background", 3],
  ["chart-4", "background", 3],
  ["chart-5", "background", 3],
];

for (const dir of THEME_DIRS) {
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".css"))) {
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
```

- [ ] **Step 2: Run to verify**

Run: `pnpm --filter @lodekit/engine test -- theme-contrast`
Expected: PASS. Pre-computed at planning: worst pairs are light `primary/background` ≈ 4.58 and dark `destructive/card` ≈ 4.59 — both above floor. If any pair fails, tune only derived values (spec §2.3) and re-run.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/tests/theme-contrast.test.ts
git commit -m "test(engine): WCAG AA contrast regression gate over all shipped themes (<task-bead-id>)"
```

---

### Task 6: Theme editor — mono slot, catalog, preview

**Files:**
- Modify: `packages/engine/dashboard/src/components/theme-editor/controls.tsx`
- Modify: `packages/engine/dashboard/src/routes/themes_.$name.tsx` (one line in `cssVarsFor`)

**Interfaces:**
- Consumes: Task 1's `model.fontMono`.
- Produces: a third "Mono font" select; `importsFor(existing, fontUi, fontDisplay, fontMono)`; catalog with Zen Kaku Gothic New + Spline Sans Mono + System mono, minus Fraunces/Hanken Grotesk.

**Acceptance Criteria:**
- Typography section shows Interface/Display/Mono selects; picking any rewrites the managed css2 import from all three selections.
- `FONT_CATALOG` has no Fraunces/Hanken entries; new entries' `family` strings exactly match the Task 2 theme values (so the default theme's labels resolve).
- Radius slider can represent 0.1875rem (step 0.0625).
- Live preview applies `--font-mono`.
- `pnpm --filter @lodekit/engine check` clean; theme-css tests pass.

- [ ] **Step 1: Catalog changes** in `controls.tsx` — delete the Fraunces and Hanken Grotesk entries; add at the top of `FONT_CATALOG` and at the mono end:

```ts
const FONT_CATALOG: readonly FontEntry[] = [
  { label: "Zen Kaku Gothic New", family: '"Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"', googleSpec: "Zen+Kaku+Gothic+New:wght@400;500;700" },
  { label: "Inter", family: '"Inter", ui-sans-serif, system-ui, sans-serif', googleSpec: "Inter:wght@400;500;600" },
  { label: "Lora", family: '"Lora", Georgia, serif', googleSpec: "Lora:wght@400;500;600" },
  { label: "Source Serif 4", family: '"Source Serif 4", Georgia, serif', googleSpec: "Source+Serif+4:wght@400;500;600" },
  { label: "IBM Plex Sans", family: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif', googleSpec: "IBM+Plex+Sans:wght@400;500;600" },
  { label: "Space Grotesk", family: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif', googleSpec: "Space+Grotesk:wght@400;500;600" },
  { label: "Nunito", family: '"Nunito", ui-sans-serif, system-ui, sans-serif', googleSpec: "Nunito:wght@400;500;600" },
  { label: "Merriweather", family: '"Merriweather", Georgia, serif', googleSpec: "Merriweather:wght@400;500;600" },
  { label: "Spline Sans Mono", family: '"Spline Sans Mono", ui-monospace, monospace', googleSpec: "Spline+Sans+Mono:wght@400;500" },
  { label: "IBM Plex Mono", family: '"IBM Plex Mono", ui-monospace, monospace', googleSpec: "IBM+Plex+Mono:wght@400;500" },
  { label: "System sans", family: "ui-sans-serif, system-ui, sans-serif", googleSpec: null },
  { label: "System mono", family: "ui-monospace, monospace", googleSpec: null },
  { label: "Georgia serif", family: 'Georgia, "Times New Roman", serif', googleSpec: null },
];
```

- [ ] **Step 2: Three-font plumbing** — update `importsFor` and `setFont`:

```ts
function importsFor(existing: string[], fontUi: string, fontDisplay: string, fontMono: string): string[] {
  const specs = new Set<string>();
  for (const family of [fontUi, fontDisplay, fontMono]) {
```

(rest of the function unchanged), and:

```ts
  const setFont = (which: "ui" | "display" | "mono", entry: FontEntry) => {
    const fontUi = which === "ui" ? entry.family : model.fontUi;
    const fontDisplay = which === "display" ? entry.family : model.fontDisplay;
    const fontMono = which === "mono" ? entry.family : model.fontMono;
    update({ ...model, fontUi, fontDisplay, fontMono, imports: importsFor(model.imports, fontUi, fontDisplay, fontMono) });
  };
```

Add beside the other label lookups: `const fontMonoLabel = FONT_CATALOG.find((f) => f.family === model.fontMono)?.label ?? "";`

- [ ] **Step 3: Third select** — duplicate the "Display font" `<div className="space-y-1.5">` block directly below it, with label text `Mono font`, `value={fontMonoLabel}`, and `setFont("mono", entry)`.

- [ ] **Step 4: Radius slider step** — in the Shape section's `<Slider`, change `step={0.125}` to `step={0.0625}` (0.1875rem must be representable).

- [ ] **Step 5: Preview var** — in `themes_.$name.tsx` `cssVarsFor`, after the `fontDisplay` line:

```ts
  if (model.fontMono) vars["--font-mono"] = model.fontMono;
```

- [ ] **Step 6: Verify**

Run: `pnpm --filter @lodekit/engine check` — Expected: clean.
Run: `pnpm --filter @lodekit/engine test` — Expected: PASS.
Visual: `pnpm dev` → `/themes` → open `lodekit` (read-only vendored view) — Typography shows all three labels resolved; duplicate it, change the mono font, confirm the managed `@import` line rewrites to include all three families and `--font-mono` appears in the saved CSS.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/dashboard/src/components/theme-editor/controls.tsx "packages/engine/dashboard/src/routes/themes_.\$name.tsx"
git commit -m "feat(dashboard): mono font slot in the theme editor; identity font catalog (<task-bead-id>)"
```

---

### Task 7: Greenhouse showcase theme + DoD + mono-voice exercise

**Files:**
- Modify: `root/themes/greenhouse-green.css` (full rewrite)
- Modify: `root/README.md` (stale themes bullet + DoD rows)
- Modify: `root/apps/greenhouse/src/routes/almanac.tsx`

**Interfaces:**
- Consumes: Task 2's base values; Task 4's `Kicker`/`Meta` from `@lodekit/ui`.
- Produces: an all-hex showcase theme (Task 5's gate then fully covers it).

**Acceptance Criteria:**
- greenhouse-green = the new lodekit base with moss primary (`#3f6e50` light / `#7fae92` dark, contrast-checked at planning: 4.78/5.24/6.66), identity fonts, `--font-mono`.
- `root/README.md` no longer references retired `theme.css` locations; DoD table gains `--font-mono` + `Kicker`/`Meta` rows.
- Almanac exercises `Kicker` (eyebrow) and `Meta` (duration + payload).
- Contrast test passes with greenhouse fully measured; theme round-trip unaffected (file lives outside the vendored round-trip fixtures).

- [ ] **Step 1: Replace `root/themes/greenhouse-green.css`** with the Task 2 `lodekit.css` content, with exactly these differences:

1. Header comment:
```css
/* Per-app showcase theme for greenhouse (moss primary on the Sky in a Jar base).
   Demonstrates user themes + per-app assignment (themes/config.json). Canonical
   theme format: one @import block, :root (light) + .dark, full shadcn token set,
   plus --font-ui/--font-display/--font-mono/--radius/--spacing/--icon-library. */
```
2. `:root`: `--primary: #3f6e50;`, `--ring: #3f6e50;`, `--sidebar-primary: #3f6e50;`, `--sidebar-ring: #3f6e50;` (foregrounds stay `#f6f1e6`).
3. `.dark`: `--primary: #7fae92;`, `--primary-foreground: #121a44;`, `--ring: #7fae92;`, `--sidebar-primary: #7fae92;`, `--sidebar-primary-foreground: #121a44;`, `--sidebar-ring: #7fae92;`
4. Everything else identical to lodekit.css (including the css2 `@import`).

- [ ] **Step 2: `root/README.md`** — replace the stale bullet

```md
- **`theme.css`** — the root-level global theme example; `apps/greenhouse/theme.css` shows
  the per-app layer that wins over it.
```

with:

```md
- **`themes/`** — user themes plus `config.json`; `greenhouse-green` demonstrates a
  per-app theme assignment on the platform base.
```

and append to the DoD table (after the existing themes row):

```md
| themes: `--font-mono` typed field | `greenhouse-green` sets the mono voice |
| `@lodekit/ui` `Kicker` / `Meta` | almanac: page eyebrow; run duration + payload metadata |
```

- [ ] **Step 3: Almanac mono voices** — in `root/apps/greenhouse/src/routes/almanac.tsx`:

1. Add `Kicker, Meta` to the existing `@lodekit/ui` import (line 7 imports `Badge, Button, Card, …`).
2. The "When" column cell (`<span className="text-muted-foreground">{fmt(getValue<number>())}</span>`) →

```tsx
      <Meta className="text-muted-foreground">{fmt(getValue<number>())}</Meta>
```

3. The "Duration" cell (`return <span className="text-muted-foreground">{ms == null ? "—" : `${ms}ms`}</span>;`) →

```tsx
      return <Meta className="text-muted-foreground">{ms == null ? "—" : `${ms}ms`}</Meta>;
```

4. The page heading block

```tsx
      <h1 className="text-xl font-semibold">
        Almanac {live && <Badge>🌀 rounds in progress…</Badge>}
      </h1>
```

→

```tsx
      <div>
        <Kicker>Greenhouse</Kicker>
        <h1 className="text-xl font-semibold">
          Almanac {live && <Badge>🌀 rounds in progress…</Badge>}
        </h1>
      </div>
```

5. The upcoming-care payload span (`<span className="text-muted-foreground">{JSON.stringify(r.payload)}</span>`) →

```tsx
              <Meta className="text-muted-foreground">{JSON.stringify(r.payload)}</Meta>
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @lodekit/engine test -- theme-contrast` — Expected: greenhouse-green now fully measured, ALL PASS.
Visual: `pnpm dev`, open the greenhouse app — moss primary buttons on parchment; almanac shows the mono eyebrow + mono metadata; dark mode shows sage-on-indigo.

- [ ] **Step 5: Commit**

```bash
git add root/themes/greenhouse-green.css root/README.md root/apps/greenhouse/src/routes/almanac.tsx
git commit -m "feat(showcase): greenhouse on the Sky in a Jar base — moss primary, mono voices, DoD rows (<task-bead-id>)"
```

---

### Task 8: Dashboard shell chrome — lockup, header, sidebars

**Files:**
- Modify: `packages/engine/dashboard/src/components/header.tsx`
- Modify: `packages/engine/dashboard/src/routes/__root.tsx`
- Modify: `packages/engine/dashboard/src/components/data/explorer-sidebar.tsx` (shadow only — kickers are Task 9)
- Modify: `packages/engine/dashboard/src/routes/settings.tsx:580` (shadow only)

**Interfaces:**
- Consumes: `Meta` from `@lodekit/ui` (Task 4); tokens (Task 2).
- Produces: the DESIGN.md §5 lockup; a flat-at-rest shell.

**Acceptance Criteria:**
- Wordmark: LODEKIT rendered as `Lodekit` + `uppercase`, Zen Kaku 700, `tracking-[0.22em]`, ~1.25rem, same single color as the mark (ink); lockup gap ≈0.6em.
- No authored resting `shadow-sm` remains in the dashboard (`grep -rn "shadow-sm" packages/engine/dashboard/src` → no matches).
- Footer version line speaks Meta.
- Nav active states: page-lo wash + ink text (the wash form; accent *text* on the wash was rejected at planning — rust on `#dcd3be` ≈ 3.8:1 fails AA, and DESIGN.md's AA floor outranks its nav sketch). No change needed — current `bg-accent text-accent-foreground` / `bg-accent font-medium` already render exactly this against the new tokens; verify, don't edit.

- [ ] **Step 1: `header.tsx`** — three changes in the JSX quoted below (current code shown first):

Current line 17: `<div className="flex items-center gap-1 border-b bg-card px-4 py-2 md:rounded-xl md:border md:shadow-sm">` → drop `md:shadow-sm`:

```tsx
      <div className="flex items-center gap-1 border-b bg-card px-4 py-2 md:rounded-xl md:border">
```

Current lines 18–23 →

```tsx
        <Link to="/" aria-label="Lodekit home" className="mr-1 flex items-center gap-3">
          <Logo className="size-7 text-foreground" />
          <span className="hidden font-display text-xl font-bold uppercase tracking-[0.22em] text-foreground sm:inline">
            Lodekit
          </span>
        </Link>
```

(The mark drops `text-primary` — DESIGN.md §5: lockup in one color, ink in product; the accent-as-brand-moment belongs to brand surfaces.)

- [ ] **Step 2: `__root.tsx` footer** — add `Meta` to the file's `@lodekit/ui` import (create one if none exists: `import { Meta } from "@lodekit/ui";`), then:

Current: `<footer className="text-muted-foreground py-4 text-center text-xs">{versionLine}</footer>` →

```tsx
        <footer className="py-4 text-center">
          <Meta className="text-xs text-muted-foreground">{versionLine}</Meta>
        </footer>
```

- [ ] **Step 3: Sidebar shadows** — remove the literal `shadow-sm` token (nothing else) from:
  - `components/data/explorer-sidebar.tsx:34` (`<aside className="rounded-xl border bg-card p-3 shadow-sm md:sticky …">`)
  - `routes/settings.tsx:580` (`<nav className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-3 text-sm shadow-sm md:sticky …">`)

- [ ] **Step 4: Verify**

Run: `grep -rn "shadow-sm\|text-primary" packages/engine/dashboard/src/components/header.tsx packages/engine/dashboard/src/components/data/explorer-sidebar.tsx` — Expected: no matches.
Run: `pnpm --filter @lodekit/engine check` — Expected: clean.
Visual: header shows the ink lockup with tracked LODEKIT; footer version is mono.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/dashboard/src/components/header.tsx packages/engine/dashboard/src/routes/__root.tsx packages/engine/dashboard/src/components/data/explorer-sidebar.tsx packages/engine/dashboard/src/routes/settings.tsx
git commit -m "feat(dashboard): ink lockup + flat-at-rest shell (<task-bead-id>)"
```

---

### Task 9: Dashboard chrome sweep — kickers + data voice

**Files** (all under `packages/engine/dashboard/src`):
- Modify: `components/theme-editor/controls.tsx`, `components/data/explorer-sidebar.tsx`, `components/data/detail-sheet.tsx`, `components/theme-card.tsx`, `routes/settings.tsx`, `routes/events.tsx`, `routes/logs.tsx`, `routes/secrets.tsx`, `routes/gateways_.$providerId.tsx`, `routes/themes.tsx`, `routes/data/$appId/index.tsx`, `routes/data/$appId/files.tsx`, `routes/data/$appId/kv.tsx`, `routes/data/$appId/tables/$table.tsx`

**Interfaces:**
- Consumes: `Kicker`, `Meta` from `@lodekit/ui` (add to each file's existing `@lodekit/ui` import).
- Produces: no new interfaces — a mechanical migration off ad-hoc styling.

**Acceptance Criteria:**
- Zero ad-hoc uppercase eyebrows remain: `grep -rn "uppercase tracking-wide" packages/engine/dashboard/src` → no matches.
- Every site in the two lists below is converted exactly as specified; nothing else is touched (Surgical Changes).
- `pnpm --filter @lodekit/engine check` clean; visual smoke shows mono kickers/metadata across Events/Logs/Data/Settings/Themes.

**Kicker migrations** (pattern: the uppercase utility soup is replaced by the primitive; layout-only classes stay on the wrapper):

1. `components/theme-editor/controls.tsx:179` `<h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Colors</h3>` → `<h3 className="mb-1"><Kicker>Colors</Kicker></h3>`
2. `controls.tsx:200` same shape → `<h3><Kicker>Typography</Kicker></h3>`
3. `controls.tsx:240` → `<h3><Kicker>Icons</Kicker></h3>`
4. `controls.tsx:267` → `<h3><Kicker>Shape</Kicker></h3>`
5. `components/data/explorer-sidebar.tsx:60` `className="text-muted-foreground/70 mt-3 mb-1 flex items-center gap-2 px-2 text-xs font-medium uppercase tracking-wide"` → keep the element/icon, className becomes `"mt-3 mb-1 flex items-center gap-2 px-2"`, and wrap the text label in `<Kicker className="text-muted-foreground/70">…</Kicker>`
6. `routes/settings.tsx:247` `<AccordionTrigger className="pt-4 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:no-underline">` → `<AccordionTrigger className="pt-4 pb-2 hover:no-underline"><Kicker>…existing children…</Kicker></AccordionTrigger>`
7. `routes/settings.tsx:311` className template `` `pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground ${i === 0 ? "pt-1" : "pt-4"}` `` → `` `pb-2 ${i === 0 ? "pt-1" : "pt-4"}` `` with children wrapped in `<Kicker>`
8. `routes/settings.tsx:581` `<div className="hidden px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:block">` → `<div className="hidden px-2 pb-1 md:block"><Kicker>…</Kicker></div>`
9. `routes/settings.tsx:588` `<div className="hidden pt-3 px-2 text-xs uppercase text-muted-foreground md:block">Apps</div>` → `<div className="hidden pt-3 px-2 md:block"><Kicker>Apps</Kicker></div>` (this also fixes the one drifted eyebrow that had no tracking)

**Meta / mono migrations** (`<code>`/`kbd`/`pre` sites need nothing — Task 3's base rule themes them):

10. `routes/events.tsx:85-87` timestamp span `className="shrink-0 tabular-nums text-muted-foreground"` → `<Meta className="shrink-0 text-muted-foreground">` (Meta owns tabular-nums)
11. `routes/events.tsx:88` `<Badge variant="secondary">{r.type}</Badge>` → `<Badge variant="secondary" className="font-mono">{r.type}</Badge>`
12. `routes/events.tsx:89` component span → `<Meta className="shrink-0 text-muted-foreground">`
13. `routes/events.tsx:90` app span → `<Meta className="shrink-0 text-muted-foreground">`
14. `routes/events.tsx:91-93` payload span → `<Meta className="truncate text-muted-foreground">`
15. `routes/logs.tsx:50-52` timestamp span → `<Meta className="shrink-0 text-muted-foreground">`
16. `routes/logs.tsx:54` `{r.appId ?? "platform"}·{r.source}` span → `<Meta className="shrink-0 text-muted-foreground">`
17. `routes/secrets.tsx:85` mapping Badge → add `className="font-mono"`
18. `routes/gateways_.$providerId.tsx:102` the plain `{c.appId}` text: wrap as `<Meta>{c.appId}</Meta>` (the alias `<code>` is covered by Task 3)
19. `routes/themes.tsx:135-137` `Global: <span className="font-medium text-foreground">{config.global ?? "lodekit"}</span>` → `Global: <Meta className="text-foreground">{config.global ?? "lodekit"}</Meta>`
20. `routes/themes.tsx:139-140` assignment Badge → add `className="gap-1 font-mono"` (replaces the existing `className="gap-1"`)
21. `components/theme-card.tsx:53` assignment Badge → add `className="font-mono"`
22. `routes/data/$appId/index.tsx:48` stat `<p className="text-2xl font-semibold tabular-nums">` → `<p className="font-mono text-2xl font-semibold tabular-nums">`
23. `routes/data/$appId/index.tsx:127` `relativeTime` span → `<Meta className="text-muted-foreground ml-auto shrink-0 text-xs">`
24. `routes/data/$appId/index.tsx:141-142` `db file {formatBytes(…)}` span → `<Meta className="text-muted-foreground ml-2 text-xs font-normal">`
25. `routes/data/$appId/index.tsx:191-193` rows/bytes `<p className="text-muted-foreground text-xs">` → `<Meta className="text-muted-foreground block text-xs">` (same children)
26. `routes/data/$appId/files.tsx:107` size cell → `<TableCell className="text-xs"><Meta className="text-xs">{formatBytes(f.size)}</Meta></TableCell>`
27. `routes/data/$appId/files.tsx:108` created cell → inner `<Meta className="text-xs">{relativeTime(f.createdAt)}</Meta>` (cell keeps `text-muted-foreground text-xs`)
28. `routes/data/$appId/files.tsx:109` expiry cell → inner `<Meta className="text-xs">{f.expiresAt ? formatTs(f.expiresAt) : "—"}</Meta>`
29. `routes/data/$appId/kv.tsx:85-87` created/updated/expiry cells → same inner-`Meta` pattern as 27–28
30. `routes/data/$appId/tables/$table.tsx:30-34` timestamp cell span → `<Meta className="block max-w-64 truncate text-xs" title={String(value)}>{formatTs(at)}</Meta>` — and delete the now-stale "deliberately non-mono" comment if one exists at the site
31. `routes/data/$appId/tables/$table.tsx:97` column-type span → add `font-mono` to its className
32. `components/data/detail-sheet.tsx:60` scalar value `<p className={…}>` → keep the `<p>` wrapper and conditional classes, render children as `<Meta className="text-sm break-all">{d.text}</Meta>`

**Deliberately untouched** (recorded here so the sweep doesn't creep): `events.tsx:268` count line and `settings.tsx:222` platform-value line (prose); `gateways.tsx:92-96` hostname (interactive link); `logs.tsx:184` native `<option>`; `theme-card.tsx:44` theme name (title voice, not data); the `settings.tsx:217` save-flash ring (transient feedback, accent-as-active is on-register); page-title heterogeneity (`text-2xl`/`text-lg`/`EmptyTitle`) — observed, out of identity scope, goes in the Task 11 defer decision.

- [ ] **Step 1: Apply migrations 1–9** (kickers), adding `Kicker` to each file's `@lodekit/ui` import.
- [ ] **Step 2: Apply migrations 10–32** (data voice), adding `Meta` where used.
- [ ] **Step 3: Verify**

Run: `grep -rn "uppercase tracking-wide" packages/engine/dashboard/src` — Expected: no matches.
Run: `grep -rn "uppercase" packages/engine/dashboard/src --include="*.tsx" | grep -v Kicker` — Expected: no ad-hoc uppercase remains (wordmark uses `uppercase` in header.tsx — that one is budgeted; allow it).
Run: `pnpm --filter @lodekit/engine check && pnpm --filter @lodekit/engine test` — Expected: clean/PASS.
Visual: Events + Logs rows show mono timestamps/ids; Data tables show mono values with aligned figures; Settings sidebar shows mono kickers.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/dashboard/src
git commit -m "feat(dashboard): chrome sweep — Kicker eyebrows + Meta data voice (<task-bead-id>)"
```

---

### Task 10: Docs skin

**Files:**
- Modify: `web/docs/src/styles/custom.css`

**Interfaces:** none consumed/produced (isolated surface).

**Acceptance Criteria:**
- Starlight accents = rust family (light) / ochre family (dark); body font Zen Kaku Gothic New; code font Spline Sans Mono; backgrounds tinted page/night.
- Glossary CSS untouched; no Fraunces/Hanken/cork amber remains.
- `pnpm --filter @lodekit/web-docs build` succeeds.

- [ ] **Step 1: Verify Starlight variable names** (the mono/bg var names must not be guessed):

Run: `grep -rho -- "--sl-font[a-z-]*\|--sl-color-bg[a-z-]*" web/docs/node_modules/@astrojs/starlight/style/*.css 2>/dev/null | sort -u`
Expected: a list containing `--sl-font`; if it contains a mono font var (e.g. `--sl-font-mono` or `--sl-font-system-mono`), use that exact name in Step 2; if none exists, drop the mono line and instead add `code, pre { font-family: 'Spline Sans Mono', ui-monospace, monospace; }` to the file. Same for `--sl-color-bg` (present in Starlight's props; use as below).

- [ ] **Step 2: Rewrite the identity section of `custom.css`** — replace the header comment, `@import`, both `:root` blocks, and the heading-font rule (keep the glossary block between them verbatim):

```css
/* Lodekit docs theme — Sky in a Jar: rust/ochre accents + brand type (DESIGN.md),
   reading-calm register. */
@import url('https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Spline+Sans+Mono:wght@400;500&display=swap');

:root {
  /* dark scheme (Starlight default root) — ochre on the night plate */
  --sl-color-accent-low: #3a2c10;
  --sl-color-accent: #dd9741;
  --sl-color-accent-high: #e5a85c;
  --sl-color-bg: #121a44;
  --sl-font: 'Zen Kaku Gothic New', 'Hiragino Kaku Gothic ProN', system-ui, sans-serif;
  --sl-font-mono: 'Spline Sans Mono', ui-monospace, monospace; /* adjust per Step 1 */
}

:root[data-theme='light'] {
  --sl-color-accent-low: #ecd9c9;
  --sl-color-accent: #935842;
  --sl-color-accent-high: #7c4636;
  --sl-color-bg: #f6f1e6;
}
```

and the heading rule (replacing the Fraunces block, dropping `font-variation-settings`):

```css
.site-title,
.sl-markdown-content h1,
.sl-markdown-content h2,
.sl-markdown-content h3,
.sl-markdown-content h4,
h1[data-page-title],
.hero h1 {
  font-family: 'Zen Kaku Gothic New', 'Hiragino Kaku Gothic ProN', system-ui, sans-serif;
  font-weight: 700;
}
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @lodekit/web-docs build` — Expected: build succeeds.
Visual: `pnpm --filter @lodekit/web-docs dev` — light = rust accents on parchment; dark = ochre on indigo; headings Zen Kaku; code blocks Spline Sans Mono. If `--sl-color-bg` makes sidebar/content contrast odd, tune with Starlight's bg-nav/bg-sidebar vars found in Step 1 and note it in the bead.

- [ ] **Step 4: Commit**

```bash
git add web/docs/src/styles/custom.css
git commit -m "feat(docs): Sky in a Jar docs skin — rust/ochre accents, identity type (<task-bead-id>)"
```

---

### Task 11: Changelog, deferrals, full verification

**Files:**
- Modify: `docs/changelog.md` (append under `## New`)
- Beads: defer beads (see below)

**Acceptance Criteria:**
- Changelog entry appended (append-only respected).
- Defer beads filed with severity/confidence stamp + provenance.
- `pnpm test` green across the workspace; visual verification evidence recorded in the epic bead.

- [ ] **Step 1: Append to `docs/changelog.md`** under `## New` (never edit existing lines):

```md
- **A new look: the Sky in a Jar** — Lodekit's woodblock-print identity lands across
  the dashboard and every app: plum ink on aged parchment by day, pale gold on deep
  indigo by night, a rust accent reserved for actions, and a mono voice for ids and
  data. Themes gain a third font slot (`--font-mono`), editable in the theme editor.
```

- [ ] **Step 2: File defer beads** (stamped: `severity:low confidence:high`, provenance = spec `docs/specs/2026-07-19-lodekit-retheme-design.md` §9):

```bash
bd create "Self-hosted identity fonts served by the engine (offline purity)" -t task -p 3 --label defer
bd create "Retune tw-animate entrance micro-motions to the drift register" -t task -p 3 --label defer
bd create "Normalize dashboard page-title treatments (text-2xl vs text-lg vs EmptyTitle)" -t task -p 3 --label defer
```

(Include the stamp + provenance in each body via `-d`.)

- [ ] **Step 3: Full test run**

Run: `pnpm test` (repo root) — Expected: every workspace package PASSES. Paste the summary into the epic bead.

- [ ] **Step 4: Visual verification (both plates)**

Run: `pnpm dev` → dashboard home, Events, Data explorer, Settings, Themes, theme editor (`lodekit` + `greenhouse-green`), Greenhouse app, Welcome app — in light AND dark (`/settings` appearance toggle). The Print Test is the bar (DESIGN.md §1). Confirm: no cork amber/blue-gray anywhere; fonts are Zen Kaku/Spline; accent ≤~10% per screen; theme-editor round-trip of the new default is byte-stable (open `lodekit`, Duplicate, save without edits, diff). Record evidence in the epic bead.

Scaffold smoke (spec §8): scaffold a fresh app against the running dev engine — find the scaffold route in `packages/engine/src/routes.ts` (`grep -n scaffold packages/engine/src/routes.ts`) and POST it (e.g. `curl -X POST http://localhost:<port><scaffold-path> -H 'content-type: application/json' -d '{"appId":"smoke-retheme","name":"Smoke"}'`), open the new app's URL, confirm it renders in the identity with zero app-side changes, then delete `root/apps/smoke-retheme` (and its `root/data` entry if created) so the checked-in root stays clean.

- [ ] **Step 5: Commit + PR**

```bash
git add docs/changelog.md
git commit -m "docs(changelog): Sky in a Jar retheme entry (<task-bead-id>)"
git push -u origin ui
```

Raise the PR (title `feat(ui): Sky in a Jar retheme — default theme, identity layer, dashboard chrome, docs skin`; body with Summary / Notes (incl. the nav accent-text AA deviation, timestamps-to-mono decision, deferrals list) / Test plan checkboxes). **Do not merge** — the person merges.

---

## Task dependency order

```
T1 ─┬─▶ T2 ─┬─▶ T3 ─┬─▶ T8 ─▶ T9 ─┐
    │       ├─▶ T5  │              ├─▶ T11
    └─▶ T6  │       │              │
            └─▶ T7 ◀┴── T4 ────────┤
                        T10 ───────┘
```

T4 (primitives) has no hard dependency; T7 needs T2+T4; T8 needs T3+T4; T9 after T8 (shared files); T11 last.
