import { Folder, Search, Settings, Sun } from "@lodekit/ui/icons";
import {
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  ToggleGroup,
  ToggleGroupItem,
} from "@lodekit/ui";
import {
  applyRole,
  ROLES,
  roleValue,
  type ThemeModel,
} from "../../lib/theme-css";
import { ChartsRow, RoleRow } from "./role-row";

// Curated font list (spec §4). `family` is the full CSS font-stack written into
// --font-ui/--font-display/--font-mono; `googleSpec` is the css2 `family=` query
// segment used to rebuild the @import line (null for system stacks, which need no import).
interface FontEntry {
  label: string;
  family: string;
  googleSpec: string | null;
}
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

// The family token of a css2 spec/param is the segment before the first ":".
// Families use "+" for spaces (e.g. "Hanken+Grotesk"), matching the catalog form.
function specFamily(spec: string): string {
  return spec.split(":")[0];
}

// Family tokens the editor can model — used to tell "our" @import line apart from
// a hand-authored one.
const CATALOG_FAMILIES = new Set(
  FONT_CATALOG.flatMap((f) => (f.googleSpec ? [specFamily(f.googleSpec)] : [])),
);

const CSS2_URL_RE = /fonts\.googleapis\.com\/css2\?/;

// Family tokens named by a css2 @import line's `family=` params.
function importFamilies(line: string): string[] {
  const families: string[] = [];
  const re = /family=([^&"]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) families.push(specFamily(m[1]));
  return families;
}

// A "managed" import is the one the editor owns: a css2 Google Fonts line whose
// families are ALL in FONT_CATALOG. Anything else — a non-css2 URL, a different
// font host, or a css2 line naming a family beyond the catalog (extra families or
// hand-tuned axes we can't model) — is not managed.
function isManaged(line: string): boolean {
  if (!CSS2_URL_RE.test(line)) return false;
  const fams = importFamilies(line);
  return fams.length > 0 && fams.every((f) => CATALOG_FAMILIES.has(f));
}

// Rewrite ONLY the managed @import line from the three selected fonts, preserving
// every other import verbatim in its original order (spec §4: never destroy CSS
// the editor can't model). The managed line — one css2 URL covering the deduped
// union of the selected Google families, or nothing when all are system stacks
// — replaces the first existing managed line in place, else is appended. A
// hand-tuned Google line naming a family beyond the catalog is NOT managed, so it
// survives and the new managed line is added alongside (worst case: a duplicated
// family; never a lost one).
function importsFor(existing: string[], fontUi: string, fontDisplay: string, fontMono: string): string[] {
  const specs = new Set<string>();
  for (const family of [fontUi, fontDisplay, fontMono]) {
    const entry = FONT_CATALOG.find((f) => f.family === family);
    if (entry?.googleSpec) specs.add(entry.googleSpec);
  }
  const managedLine =
    specs.size === 0
      ? null
      : `@import url("https://fonts.googleapis.com/css2?${[...specs].map((s) => `family=${s}`).join("&")}&display=swap");`;

  const result: string[] = [];
  let replaced = false;
  for (const line of existing) {
    if (isManaged(line)) {
      // First managed line becomes the new one (dropped when nothing to manage);
      // any further managed lines are collapsed away.
      if (!replaced && managedLine) result.push(managedLine);
      replaced = true;
    } else {
      result.push(line);
    }
  }
  if (managedLine && !replaced) result.push(managedLine);
  return result;
}

// Density presets → --spacing (spec §4). An unrecognized spacing value surfaces as
// a "Custom" option so editing another control never clobbers it.
const DENSITY: readonly { label: string; value: string }[] = [
  { label: "Compact", value: "0.2rem" },
  { label: "Default", value: "0.25rem" },
  { label: "Comfortable", value: "0.3rem" },
];

const ICON_LIBRARIES = ["lucide", "phosphor", "tabler"] as const;

export function Controls({
  model,
  mode,
  disabled,
  onMode,
  update,
}: {
  model: ThemeModel;
  mode: "light" | "dark";
  disabled: boolean;
  onMode: (mode: "light" | "dark") => void;
  update: (next: ThemeModel) => void;
}) {
  const map = mode === "light" ? model.light : model.dark;

  const editRole = (role: (typeof ROLES)[number], color: string) => update(applyRole(model, mode, role, color));
  // setToken clones the mode's color map immutably — same style as applyRole.
  const setToken = (token: string, value: string) => {
    const next = { ...map, [token]: value };
    update(mode === "light" ? { ...model, light: next } : { ...model, dark: next });
  };
  const setField = (patch: Partial<ThemeModel>) => update({ ...model, ...patch });
  const setFont = (which: "ui" | "display" | "mono", entry: FontEntry) => {
    const fontUi = which === "ui" ? entry.family : model.fontUi;
    const fontDisplay = which === "display" ? entry.family : model.fontDisplay;
    const fontMono = which === "mono" ? entry.family : model.fontMono;
    update({ ...model, fontUi, fontDisplay, fontMono, imports: importsFor(model.imports, fontUi, fontDisplay, fontMono) });
  };

  const tokensOf = (tokens: readonly string[]) => tokens.map((token) => ({ token, value: map[token] ?? "" }));

  const fontUiLabel = FONT_CATALOG.find((f) => f.family === model.fontUi)?.label ?? "";
  const fontDisplayLabel = FONT_CATALOG.find((f) => f.family === model.fontDisplay)?.label ?? "";
  const fontMonoLabel = FONT_CATALOG.find((f) => f.family === model.fontMono)?.label ?? "";
  const densityOptions = DENSITY.some((d) => d.value === model.spacing)
    ? DENSITY
    : [{ label: `Custom (${model.spacing})`, value: model.spacing }, ...DENSITY];
  const radiusNum = Number.parseFloat(model.radius);
  const radius = Number.isFinite(radiusNum) ? Math.min(1.5, Math.max(0, radiusNum)) : 0.5;

  return (
    <div className="space-y-6">
      {/* Light/dark switches both the preview vars and which palette the color
          controls edit. Radius/density/fonts/icons below are mode-shared. */}
      <ToggleGroup
        value={[mode]}
        onValueChange={(v) => {
          const next = v[0];
          if (next === "light" || next === "dark") onMode(next);
        }}
        variant="outline"
        className="w-full"
      >
        <ToggleGroupItem value="light" className="flex-1">Light</ToggleGroupItem>
        <ToggleGroupItem value="dark" className="flex-1">Dark</ToggleGroupItem>
      </ToggleGroup>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Colors</h3>
        <div>
          {ROLES.map((role) =>
            role.key === "charts" ? (
              <ChartsRow key={role.key} tokens={tokensOf(role.tokens)} disabled={disabled} onToken={setToken} />
            ) : (
              <RoleRow
                key={role.key}
                role={role}
                value={roleValue(model, mode, role)}
                tokens={tokensOf(role.tokens)}
                disabled={disabled}
                onRole={(color) => editRole(role, color)}
                onToken={setToken}
              />
            ),
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Typography</h3>
        <div className="space-y-1.5">
          <Label className="text-xs">Interface font</Label>
          <Select
            value={fontUiLabel}
            disabled={disabled}
            onValueChange={(label) => {
              const entry = FONT_CATALOG.find((f) => f.label === label);
              if (entry) setFont("ui", entry);
            }}
          >
            <SelectTrigger className="w-full"><SelectValue placeholder="Select a font…" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {FONT_CATALOG.map((f) => <SelectItem key={f.label} value={f.label}>{f.label}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Display font</Label>
          <Select
            value={fontDisplayLabel}
            disabled={disabled}
            onValueChange={(label) => {
              const entry = FONT_CATALOG.find((f) => f.label === label);
              if (entry) setFont("display", entry);
            }}
          >
            <SelectTrigger className="w-full"><SelectValue placeholder="Select a font…" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {FONT_CATALOG.map((f) => <SelectItem key={f.label} value={f.label}>{f.label}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Mono font</Label>
          <Select
            value={fontMonoLabel}
            disabled={disabled}
            onValueChange={(label) => {
              const entry = FONT_CATALOG.find((f) => f.label === label);
              if (entry) setFont("mono", entry);
            }}
          >
            <SelectTrigger className="w-full"><SelectValue placeholder="Select a font…" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {FONT_CATALOG.map((f) => <SelectItem key={f.label} value={f.label}>{f.label}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Icons</h3>
        <Select
          value={model.iconLibrary}
          disabled={disabled}
          onValueChange={(v) => { if (v) setField({ iconLibrary: v }); }}
        >
          <SelectTrigger className="w-full"><SelectValue placeholder="Select a set…" /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {ICON_LIBRARIES.map((lib) => <SelectItem key={lib} value={lib}>{lib}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
        {/* Glyph preview. The icon components read the ACTIVE set from
            <html data-icon-library> (set by the applied dashboard theme), NOT this
            model's iconLibrary — so this row previews whichever set the dashboard
            currently renders, and re-renders when a saved theme changes it. A true
            per-set preview would need the lazy set maps and is out of scope. */}
        <div className="flex items-center gap-3 text-muted-foreground" aria-label="Active icon set preview">
          <Settings aria-hidden="true" className="size-4" />
          <Search aria-hidden="true" className="size-4" />
          <Folder aria-hidden="true" className="size-4" />
          <Sun aria-hidden="true" className="size-4" />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shape</h3>
        <div className="space-y-1.5">
          <Label className="flex items-center justify-between text-xs">
            <span>Radius</span>
            <span className="font-mono text-muted-foreground">{model.radius}</span>
          </Label>
          <Slider
            value={radius}
            min={0}
            max={1.5}
            step={0.0625}
            disabled={disabled}
            onValueChange={(v) => setField({ radius: `${v as number}rem` })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Density</Label>
          <Select
            value={model.spacing}
            disabled={disabled}
            onValueChange={(v) => { if (v) setField({ spacing: v }); }}
          >
            <SelectTrigger className="w-full"><SelectValue placeholder="Select density…" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {densityOptions.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </section>
    </div>
  );
}
