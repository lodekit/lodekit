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
// --font-ui/--font-display; `googleSpec` is the css2 `family=` query segment used
// to rebuild the @import line (null for system stacks, which need no import).
interface FontEntry {
  label: string;
  family: string;
  googleSpec: string | null;
}
const FONT_CATALOG: readonly FontEntry[] = [
  { label: "Fraunces", family: '"Fraunces", Georgia, serif', googleSpec: "Fraunces:opsz,wght@9..144,400..600" },
  { label: "Hanken Grotesk", family: '"Hanken Grotesk", ui-sans-serif, system-ui, sans-serif', googleSpec: "Hanken+Grotesk:wght@400;500;600" },
  { label: "Inter", family: '"Inter", ui-sans-serif, system-ui, sans-serif', googleSpec: "Inter:wght@400;500;600" },
  { label: "Lora", family: '"Lora", Georgia, serif', googleSpec: "Lora:wght@400;500;600" },
  { label: "Source Serif 4", family: '"Source Serif 4", Georgia, serif', googleSpec: "Source+Serif+4:wght@400;500;600" },
  { label: "IBM Plex Sans", family: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif', googleSpec: "IBM+Plex+Sans:wght@400;500;600" },
  { label: "IBM Plex Mono", family: '"IBM Plex Mono", ui-monospace, monospace', googleSpec: "IBM+Plex+Mono:wght@400;500" },
  { label: "Space Grotesk", family: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif', googleSpec: "Space+Grotesk:wght@400;500;600" },
  { label: "Nunito", family: '"Nunito", ui-sans-serif, system-ui, sans-serif', googleSpec: "Nunito:wght@400;500;600" },
  { label: "Merriweather", family: '"Merriweather", Georgia, serif', googleSpec: "Merriweather:wght@400;500;600" },
  { label: "System sans", family: "ui-sans-serif, system-ui, sans-serif", googleSpec: null },
  { label: "Georgia serif", family: 'Georgia, "Times New Roman", serif', googleSpec: null },
];

// Rebuild the model's imports from the two selected fonts: one @import line
// covering the union of the selected Google families (deduped), or none when both
// are system stacks / unrecognized.
function importsFor(fontUi: string, fontDisplay: string): string[] {
  const specs = new Set<string>();
  for (const family of [fontUi, fontDisplay]) {
    const entry = FONT_CATALOG.find((f) => f.family === family);
    if (entry?.googleSpec) specs.add(entry.googleSpec);
  }
  if (specs.size === 0) return [];
  const families = [...specs].map((s) => `family=${s}`).join("&");
  return [`@import url("https://fonts.googleapis.com/css2?${families}&display=swap");`];
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
  const setFont = (which: "ui" | "display", entry: FontEntry) => {
    const fontUi = which === "ui" ? entry.family : model.fontUi;
    const fontDisplay = which === "display" ? entry.family : model.fontDisplay;
    update({ ...model, fontUi, fontDisplay, imports: importsFor(fontUi, fontDisplay) });
  };

  const tokensOf = (tokens: readonly string[]) => tokens.map((token) => ({ token, value: map[token] ?? "" }));

  const fontUiLabel = FONT_CATALOG.find((f) => f.family === model.fontUi)?.label ?? "";
  const fontDisplayLabel = FONT_CATALOG.find((f) => f.family === model.fontDisplay)?.label ?? "";
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
            step={0.125}
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
