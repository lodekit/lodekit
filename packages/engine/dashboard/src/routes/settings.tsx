import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState, type ComponentType, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
  Badge, Button, Card, CardContent, CardHeader, CardTitle,
  Collapsible, CollapsibleContent, CollapsibleTrigger,
  Field as FieldRoot, FieldContent, FieldDescription, FieldError, FieldLabel,
  Input, Kicker, Label,
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, Skeleton, Switch,
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@lodekit/ui";
import { ChevronDown, Monitor, Moon, RotateCcw, Sun } from "@lodekit/ui/icons";
import { SERVICE_ICONS } from "../components/nav";
import { MARKS } from "../components/logo";

export const Route = createFileRoute("/settings")({
  validateSearch: (s: Record<string, unknown>): { section?: string } =>
    typeof s.section === "string" ? { section: s.section } : {},
  component: SettingsView,
});

// Shapes mirror services/settings.ts route payloads exactly.
interface Field {
  type: "boolean" | "string" | "number" | "select" | "duration";
  label: string; description: string; advanced?: boolean;
  default: unknown; min?: number | string; max?: number | string; step?: number;
  integer?: boolean; maxLength?: number; placeholder?: string;
  options?: { value: string; label: string }[];
}
interface PlatformEntry { key: string; section: string; scope: "global" | "per-app"; advanced: boolean; field: Field; value: unknown; effective: unknown; drifted: boolean }
interface DeclaredEntry { key: string; field: Field | null; error: string | null; value: unknown; effective: unknown; drifted: boolean }
interface OverrideEntry { key: string; section: string; advanced: boolean; field: Field; platformEffective: unknown; override: unknown }
interface SlotEntry {
  slot: string; label: string | null; description: string | null; error: string | null;
  status: "linked" | "pending"; secret: { slug: string; label: string } | null;
}
interface AppInfo { appId: string; name: string; icon?: string }

// Pinned display order (UI revamp spec §4); unknown future sections append.
const SERVICE_ORDER = ["Store", "Files", "Tasks", "Events", "Logs", "Gateways", "Engine"];

// Icons shown beside select options ("<icon> Knockout"), keyed by setting key →
// option value. icon_style uses the actual jar-cloud marks (logo.tsx). Selects
// without an entry render plain labels.
const OPTION_ICONS: Record<string, Record<string, ComponentType<{ className?: string }>>> = {
  "appearance.theme": { system: Monitor, light: Sun, dark: Moon },
  "appearance.icon_style": MARKS,
};

function orderedSections(present: string[]): string[] {
  return [
    ...SERVICE_ORDER.filter((s) => present.includes(s)),
    ...present.filter((s) => !SERVICE_ORDER.includes(s)),
  ];
}

// A display tab on the service tab strips. Store + Files aggregate into one
// "Data" tab (spec §4c) rendered as flat per-service sections — both are
// all-advanced, so an accordion inside the tab would bury everything.
interface ServiceTab { name: string; sections: string[] }
const DATA_SECTIONS = ["Store", "Files"];

function serviceTabs(present: string[]): ServiceTab[] {
  const ordered = orderedSections(present);
  const data = ordered.filter((s) => DATA_SECTIONS.includes(s));
  return [
    ...(data.length > 0 ? [{ name: "Data", sections: data }] : []),
    ...ordered.filter((s) => !DATA_SECTIONS.includes(s)).map((s) => ({ name: s, sections: [s] })),
  ];
}

async function write(url: string, value: unknown | undefined) {
  const res = value === undefined
    ? await fetch(url, { method: "DELETE" })
    : await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value }) });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText);
}

// One schema-driven control per field type (spec §4's type → component table).
// Text-ish fields hold a local draft so a rejected write keeps the person's
// input for correction; the draft re-seeds only when the effective value
// actually changes externally (reset, another tab, manager reconciliation).
// Focus selects the content (type-to-replace); blurring an unchanged field
// writes nothing.
function FieldControl({ field, fieldKey, value, onChange }: { field: Field; fieldKey?: string; value: unknown; onChange: (v: unknown) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [seeded, setSeeded] = useState(String(value));
  // The no-write baseline: the last draft submitted (or seeded). Comparing the
  // draft against this — not the server value — keeps a standing rejected
  // draft from re-submitting on focus+blur, and Enter-then-blur from writing
  // twice while the refetched value is still in flight.
  const lastSent = useRef(String(value));
  if (String(value) !== seeded) { // external change: re-seed during render (React's sanctioned pattern)
    setSeeded(String(value));
    setDraft(String(value));
    lastSent.current = String(value);
  }
  if (field.type === "boolean") {
    return <Switch checked={Boolean(value)} onCheckedChange={(v) => onChange(v)} />;
  }
  if (field.type === "select") {
    const icons = fieldKey ? OPTION_ICONS[fieldKey] : undefined;
    const display = (o: { value: string; label: string }) => {
      const Icon = icons?.[o.value];
      if (!Icon) return o.label;
      return (
        <>
          <Icon className="size-4" />
          {o.label}
        </>
      );
    };
    // items: Base UI resolves the closed SelectValue through it — without it the
    // trigger shows the raw stored value ("b") instead of the label.
    const items = (field.options ?? []).map((o) => ({ value: o.value, label: display(o) }));
    return (
      <Select value={String(value)} onValueChange={(v) => { if (v !== null && v !== String(value)) onChange(v); }} items={items}>
        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
        {/* alignItemWithTrigger=false: drop below the trigger (shadcn-classic)
            instead of Base UI's macOS-style overlay atop the control.
            SelectGroup carries the popup's inner padding in base-nova (p-1);
            groupless items would sit flush against the popup edge. */}
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {(field.options ?? []).map((o) => <SelectItem key={o.value} value={o.value}>{display(o)}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    );
  }
  const onFocus = (e: FocusEvent<HTMLInputElement>) => e.currentTarget.select();
  const keys = (commit: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") commit();
  };
  if (field.type === "number") {
    const commit = () => {
      if (draft === lastSent.current) return; // unchanged: no write
      const n = Number(draft);
      if (draft.trim() !== "" && Number.isFinite(n)) { lastSent.current = draft; onChange(n); return; }
      setDraft(String(value)); // emptied/invalid input: no-op, never write 0
      lastSent.current = String(value); // realign so the restored value never counts as a pending edit
    };
    return (
      <Input
        type="number" className="w-32" value={draft}
        min={field.min as number | undefined} max={field.max as number | undefined} step={field.step ?? (field.integer ? 1 : undefined)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={onFocus} onBlur={commit} onKeyDown={keys(commit)}
      />
    );
  }
  // string + duration: text input; the server validates the duration grammar.
  const commit = () => {
    if (draft === lastSent.current) return; // unchanged: no write
    lastSent.current = draft;
    onChange(draft);
  };
  return (
    <Input
      className="w-32" value={draft} placeholder={field.placeholder}
      maxLength={field.maxLength} onChange={(e) => setDraft(e.target.value)}
      onFocus={onFocus} onBlur={commit} onKeyDown={keys(commit)}
    />
  );
}

// A setting row: label, one-liner description, [reset ↺] [control].
// The reset icon carries the "modified" signal: muted when the value is
// overridden, hidden (space kept) at default. A successful write flashes a
// soft ring around the control (300ms fade, 800ms hold) — no extra element,
// so nothing pops in beside the hidden reset button. A rejected write keeps
// the typed input.
function SettingRow(props: {
  field: Field; fieldKey?: string; value: unknown; effective: unknown; platformValue?: unknown; drifted?: boolean;
  onWrite: (v: unknown | undefined) => Promise<void>;
}) {
  const modified = props.value !== null && props.value !== undefined;
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const commit = (v: unknown | undefined) => {
    props.onWrite(v)
      .then(() => {
        setError(null);
        setSaved(true);
        clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(false), 800);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg.replace(/^[a-z0-9_.]+: /, "")); // drop the key prefix — the row is the context
      });
  };
  return (
    <FieldRoot orientation="horizontal" className="justify-between gap-6 border-b py-3 last:border-b-0">
      <FieldContent className="min-w-0">
        <FieldLabel className="items-center">
          {props.field.label}
          {props.drifted && <Badge variant="outline">was reset to default</Badge>}
        </FieldLabel>
        <FieldDescription>{props.field.description}</FieldDescription>
        {error && <FieldError>{error}</FieldError>}
      </FieldContent>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost" size="icon"
            title="Reset to default" aria-label="Reset to default"
            className={`size-7 text-muted-foreground hover:text-foreground ${modified ? "" : "invisible"}`}
            onClick={() => commit(undefined)}
          >
            <RotateCcw className="size-3.5" />
          </Button>
          {/* rounded-full/-lg mirror the control's own radius (switch / base-nova
              input+select trigger) so the saved ring hugs it without a corner gap. */}
          <span className={`inline-flex transition-shadow duration-300 ${props.field.type === "boolean" ? "rounded-full" : "rounded-lg"} ${saved ? "ring-2 ring-primary/40" : ""}`}>
            <FieldControl field={props.field} fieldKey={props.fieldKey} value={props.effective} onChange={commit} />
          </span>
        </div>
        {props.platformValue !== undefined && (
          <p className="text-xs text-muted-foreground">Platform value: {String(props.platformValue)}</p>
        )}
      </div>
    </FieldRoot>
  );
}

// Rows for one group: the general rows, then an "Advanced" accordion styled as
// a small heading. Groups where everything is advanced (Store, Files) get a
// note instead of a broken-empty general area.
function SettingRows({ entries, render }: { entries: { advanced: boolean }[]; render: (advanced: boolean) => ReactNode }) {
  const advanced = entries.filter((e) => e.advanced);
  const general = entries.filter((e) => !e.advanced);
  return (
    <>
      {general.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">
          {advanced.length > 0 ? "No general settings — see Advanced." : "No settings."}
        </p>
      ) : (
        render(false)
      )}
      {advanced.length > 0 && (
        <Accordion>
          <AccordionItem value="advanced" className="border-b-0">
            <AccordionTrigger className="pt-4 pb-2 hover:no-underline">
              <Kicker>Advanced</Kicker>
            </AccordionTrigger>
            {/* pr-1: the outer accordion wrapper is overflow-hidden for its height
                animation and would clip the controls' 3px focus ring at the edge. */}
            <AccordionContent className="pr-1">{render(true)}</AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </>
  );
}

// Per-service tab strip shared by the platform Services page and the app page's
// Service Overrides card. children renders one tab's content. A multi-section
// tab (Data) renders its sections as flat headed groups via renderSection.
function ServiceTabs({ tabs, initial, children }: { tabs: ServiceTab[]; initial?: string; children: (tab: ServiceTab) => ReactNode }) {
  if (tabs.length === 0) return null;
  const names = tabs.map((t) => t.name);
  return (
    <Tabs defaultValue={initial && names.includes(initial) ? initial : names[0]}>
      {/* pb-[5px]: the line variant's active underline is an ::after 5px below
          the trigger box; overflow-x-auto forces overflow-y to auto, so without
          the padding the underline becomes 2px of vertical scrollable overflow
          (scrollbar + clipped line). no-scrollbar (upstream utility): scroll on
          narrow screens without chrome, as upstream tab strips do. */}
      <TabsList variant="line" className="no-scrollbar max-w-full justify-start overflow-x-auto pb-[5px]">
        {tabs.map((t) => {
          const Icon = SERVICE_ICONS[t.name]; // canonical service → icon map (components/nav.ts)
          return (
            <TabsTrigger key={t.name} value={t.name}>
              {Icon && <Icon aria-hidden="true" />}
              {t.name}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {/* keepMounted: inactive panels stay mounted (and hidden) so an uncommitted
          draft or rejected-write error survives switching tabs. The grid stacks
          all panels in one cell and overrides `hidden` to invisible-but-laid-out,
          so the container holds the tallest tab's height — no jump on switching.
          visibility:hidden keeps inactive panels out of the a11y tree and focus
          order, as `hidden` did. */}
      <div className="grid">
        {tabs.map((t) => (
          <TabsContent
            key={t.name} value={t.name} keepMounted
            className="col-start-1 row-start-1 [&[hidden]]:block [&[hidden]]:invisible"
          >
            {children(t)}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}

// A multi-section tab's body: each service under a small heading, every field
// listed flat — no accordion inside an aggregated tab.
function SectionedTab({ sections, renderSection }: { sections: string[]; renderSection: (section: string) => ReactNode }) {
  return (
    <>
      {sections.map((s, i) => (
        <div key={s}>
          <div className={`pb-2 ${i === 0 ? "pt-1" : "pt-4"}`}>
            <Kicker>{s}</Kicker>
          </div>
          {renderSection(s)}
        </div>
      ))}
    </>
  );
}

const platformRow = (invalidate: () => void) => (e: PlatformEntry) => (
  <SettingRow
    key={e.key} field={e.field} fieldKey={e.key} value={e.value} effective={e.effective} drifted={e.drifted}
    onWrite={async (v) => { await write(`/api/settings/${e.key}`, v); invalidate(); }}
  />
);

function PlatformRows({ rows, invalidate }: { rows: PlatformEntry[]; invalidate: () => void }) {
  return (
    <SettingRows
      entries={rows}
      render={(advanced) => rows.filter((e) => e.advanced === advanced).map(platformRow(invalidate))}
    />
  );
}

function PlatformSection({ section, entries, invalidate }: { section: string; entries: PlatformEntry[]; invalidate: () => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>{section}</CardTitle></CardHeader>
      <CardContent>
        <PlatformRows rows={entries.filter((e) => e.section === section)} invalidate={invalidate} />
      </CardContent>
    </Card>
  );
}

// One Services page for all per-service platform settings, a tab per service
// (Store + Files aggregate into the Data tab).
function ServicesSection({ services, entries, invalidate, initial }: {
  services: string[]; entries: PlatformEntry[]; invalidate: () => void; initial?: string;
}) {
  const rowsOf = (s: string) => entries.filter((e) => e.section === s);
  return (
    <Card>
      <CardHeader><CardTitle>Services</CardTitle></CardHeader>
      <CardContent>
        <ServiceTabs tabs={serviceTabs(services)} initial={initial}>
          {(t) => t.sections.length === 1 ? (
            <PlatformRows rows={rowsOf(t.sections[0])} invalidate={invalidate} />
          ) : (
            <SectionedTab sections={t.sections} renderSection={(s) => rowsOf(s).map(platformRow(invalidate))} />
          )}
        </ServiceTabs>
      </CardContent>
    </Card>
  );
}

// The app's declared secret slots (secret-store spec §9): linked → which secret
// + Unlink; pending → link an existing secret or create one inline. Renders
// nothing when the app declares no slots.
function AppSecretsCard({ app }: { app: AppInfo }) {
  const queryClient = useQueryClient();
  const q = useQuery<{ slots: SlotEntry[] }>({
    queryKey: ["secrets", app.appId],
    queryFn: async () => (await fetch(`/api/apps/${app.appId}/secrets`)).json(),
  });
  const catalog = useQuery<{ secrets: { slug: string; label: string }[] }>({
    queryKey: ["secrets", "_platform"],
    queryFn: async () => (await fetch("/api/secrets")).json(),
  });
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null); // slot being created-for
  const [newLabel, setNewLabel] = useState("");
  const [newValue, setNewValue] = useState("");
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["secrets", app.appId] });
    void queryClient.invalidateQueries({ queryKey: ["secrets", "_platform"] });
  };
  const act = async (fn: () => Promise<Response>) => {
    const res = await fn();
    if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? res.statusText); return; }
    setError(null); setCreating(null); setNewLabel(""); setNewValue("");
    invalidate();
  };
  const link = (slot: string, slug: string) =>
    void act(() => fetch(`/api/apps/${app.appId}/secrets/${slot}/link`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }),
    }));
  const createAndLink = async (slot: string) => {
    const res = await fetch("/api/secrets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel, value: newValue }),
    });
    setNewValue(""); // typed value never lingers, success or failure
    if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? res.statusText); return; }
    link(slot, (await res.json()).slug);
  };
  const slots = q.data?.slots ?? [];
  if (q.isLoading || slots.length === 0) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Secrets</CardTitle></CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {slots.map((s) => (
          <div key={s.slot} className="flex items-start justify-between gap-6 border-b py-3 last:border-b-0">
            <div className="min-w-0">
              <Label className="flex items-center gap-2">
                {s.label ?? <code>{s.slot}</code>}
                {s.error && <Badge variant="destructive">declaration error</Badge>}
                {s.status === "pending" && !s.error && <Badge variant="outline">needs a secret</Badge>}
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">{s.error ?? s.description}</p>
            </div>
            {!s.error && (
              <div className="flex shrink-0 items-center gap-2">
                {s.status === "linked" && s.secret ? (
                  <>
                    <Badge variant="secondary">{s.secret.label}</Badge>
                    <Button variant="ghost" size="sm" onClick={() =>
                      void act(() => fetch(`/api/apps/${app.appId}/secrets/${s.slot}/link`, { method: "DELETE" }))
                    }>Unlink</Button>
                  </>
                ) : creating === s.slot ? (
                  <>
                    <Input className="w-32" placeholder="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
                    <Input type="password" autoComplete="off" className="w-36" placeholder="Value" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
                    <Button size="sm" disabled={!newLabel.trim() || !newValue} onClick={() => void createAndLink(s.slot)}>Save & link</Button>
                    <Button variant="ghost" size="sm" onClick={() => { setCreating(null); setNewValue(""); }}>Cancel</Button>
                  </>
                ) : (
                  <>
                    {/* Base UI Select's onValueChange can emit null (controlled reset) — never link an empty slug. */}
                    <Select value="" onValueChange={(slug) => { if (slug) link(s.slot, slug); }}>
                      <SelectTrigger className="w-44"><SelectValue placeholder="Link a secret…" /></SelectTrigger>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectGroup>
                          {(catalog.data?.secrets ?? []).map((c) => (
                            <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" onClick={() => setCreating(s.slot)}>New secret…</Button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// Per-app service overrides: an initially-collapsed card, then the same
// per-service tabs as the platform Services page. The tab names the service,
// so row labels drop the old "Section · " prefix; the platform value the
// override shadows sits under each control.
function ServiceOverridesCard({ app, overrides, invalidate }: {
  app: AppInfo; overrides: OverrideEntry[]; invalidate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const tabs = serviceTabs([...new Set(overrides.map((o) => o.section))]);
  const rowsOf = (s: string) => overrides.filter((o) => o.section === s);
  const overrideRow = (o: OverrideEntry) => (
    <SettingRow
      key={o.key}
      field={o.field}
      fieldKey={o.key}
      value={o.override}
      effective={o.override ?? o.platformEffective}
      platformValue={o.platformEffective}
      onWrite={async (v) => { await write(`/api/apps/${app.appId}/settings/${o.key}`, v); invalidate(); }}
    />
  );
  if (tabs.length === 0) return null;
  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <CardTitle>Service Overrides</CardTitle>
            <ChevronDown aria-hidden="true" className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
        </CardHeader>
        {/* keepMounted: collapsing must not unmount rows mid-edit. */}
        <CollapsibleContent keepMounted>
          <CardContent>
            <ServiceTabs tabs={tabs}>
              {(t) => t.sections.length === 1 ? (
                <SettingRows
                  entries={rowsOf(t.sections[0])}
                  render={(advanced) => rowsOf(t.sections[0]).filter((o) => o.advanced === advanced).map(overrideRow)}
                />
              ) : (
                <SectionedTab sections={t.sections} renderSection={(s) => rowsOf(s).map(overrideRow)} />
              )}
            </ServiceTabs>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function AppSection({ app }: { app: AppInfo }) {
  const queryClient = useQueryClient();
  const q = useQuery<{ declared: DeclaredEntry[]; overrides: OverrideEntry[] }>({
    queryKey: ["settings", app.appId],
    queryFn: async () => (await fetch(`/api/apps/${app.appId}/settings`)).json(),
  });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["settings", app.appId] });
  if (q.isLoading) return <Skeleton className="h-24" />;
  if (q.isError || !q.data) return <p className="text-sm text-muted-foreground">Failed to load settings.</p>;
  const { declared, overrides } = q.data;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>{app.icon} {app.name}</CardTitle></CardHeader>
        <CardContent>
          {declared.length === 0 && <p className="text-sm text-muted-foreground">This app declares no settings.</p>}
          {declared.map((d) =>
            d.field ? (
              <SettingRow
                key={d.key} field={d.field} fieldKey={d.key} value={d.value} effective={d.effective} drifted={d.drifted}
                onWrite={async (v) => { await write(`/api/apps/${app.appId}/settings/${d.key}`, v); invalidate(); }}
              />
            ) : (
              <div key={d.key} className="border-b py-3 last:border-b-0">
                <Label className="flex items-center gap-2"><code>{d.key}</code><Badge variant="destructive">declaration error</Badge></Label>
                <p className="mt-1 text-xs text-muted-foreground">{d.error}</p>
              </div>
            )
          )}
        </CardContent>
      </Card>
      <AppSecretsCard app={app} />
      <ServiceOverridesCard app={app} overrides={overrides} invalidate={invalidate} />
    </div>
  );
}

function SettingsView() {
  const { section = "General" } = Route.useSearch();
  const queryClient = useQueryClient();
  const platform = useQuery<{ settings: PlatformEntry[] }>({
    queryKey: ["settings", "_platform"],
    queryFn: async () => (await fetch("/api/settings")).json(),
  });
  const apps = useQuery<AppInfo[]>({ queryKey: ["apps"], queryFn: async () => (await fetch("/api/apps")).json() });

  const entries = platform.data?.settings ?? [];
  const services = orderedSections(
    [...new Set(entries.map((e) => e.section))].filter((s) => s !== "General" && s !== "Appearance")
  );
  const app = apps.data?.find((a) => a.appId === section);
  // Old per-service deep links (?section=Tasks) land on the Services page with that tab active.
  const isServices = section === "Services" || services.includes(section);
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["settings", "_platform"] });

  const itemClass = (active: boolean) =>
    `block shrink-0 rounded px-2 py-1 hover:bg-accent ${active ? "bg-accent font-medium" : "text-muted-foreground"}`;

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-8">
      {/* Floating sidebar; below md it becomes a horizontal scrollable picker. */}
      <nav className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-3 text-sm md:sticky md:top-24 md:block md:w-48 md:shrink-0 md:space-y-1 md:self-start">
        <div className="hidden px-2 pb-1 md:block"><Kicker>Settings</Kicker></div>
        {["General", "Appearance"].map((s) => (
          <Link key={s} to="/settings" search={{ section: s }} className={itemClass(section === s)}>{s}</Link>
        ))}
        <Link to="/settings" search={{ section: "Services" }} className={itemClass(isServices)}>Services</Link>
        <div className="hidden pt-3 px-2 md:block"><Kicker>Apps</Kicker></div>
        {(apps.data ?? []).map((a) => (
          <Link key={a.appId} to="/settings" search={{ section: a.appId }} className={itemClass(section === a.appId)}>
            {a.icon} {a.name}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1 space-y-4">
        {platform.isLoading ? (
          <Skeleton className="h-40" />
        ) : app ? (
          <AppSection app={app} />
        ) : isServices ? (
          <ServicesSection
            services={services} entries={entries} invalidate={invalidate}
            initial={section === "Services" ? undefined : DATA_SECTIONS.includes(section) ? "Data" : section}
          />
        ) : (
          <PlatformSection section={section} entries={entries} invalidate={invalidate} />
        )}
      </div>
    </div>
  );
}
