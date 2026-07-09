import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
  Badge, Button, Card, CardContent, CardHeader, CardTitle,
  Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Switch,
} from "@lodekit/ui";
import { Check, RotateCcw } from "lucide-react";

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

async function write(url: string, value: unknown | undefined) {
  const res = value === undefined
    ? await fetch(url, { method: "DELETE" })
    : await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value }) });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText);
}

// One schema-driven control per field type (spec §4's type → component table).
// The draft/commit-on-blur state (number/string/duration) must be an unconditional
// hook — SettingRow remounts this component (key'd on type+effective) on every
// external change, so every render here calls the same hooks regardless of branch.
function FieldControl({ field, value, onChange }: { field: Field; value: unknown; onChange: (v: unknown) => void }) {
  const [draft, setDraft] = useState(String(value));
  if (field.type === "boolean") {
    return <Switch checked={Boolean(value)} onCheckedChange={(v) => onChange(v)} />;
  }
  if (field.type === "select") {
    return (
      <Select value={String(value)} onValueChange={(v) => onChange(v)}>
        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(field.options ?? []).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === "number") {
    const commit = () => {
      const n = Number(draft);
      if (draft.trim() !== "" && Number.isFinite(n)) { onChange(n); return; }
      setDraft(String(value)); // emptied/invalid input: no-op, never write 0
    };
    return (
      <Input
        type="number" className="w-32" value={draft}
        min={field.min as number | undefined} max={field.max as number | undefined} step={field.step ?? (field.integer ? 1 : undefined)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
      />
    );
  }
  // string + duration: text input; the server validates the duration grammar.
  const commit = () => onChange(draft);
  return (
    <Input
      className="w-40" value={draft} placeholder={field.placeholder}
      maxLength={field.maxLength} onChange={(e) => setDraft(e.target.value)}
      onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
    />
  );
}

// A setting row: label, one-liner description, [saved ✓] [reset ↺] [control].
// The reset icon is faint+disabled at default and lights up when modified —
// it carries the "modified" signal (the old dot is gone). A successful write
// fades a check in beside the control for ~1.5s.
function SettingRow(props: {
  field: Field; value: unknown; effective: unknown; inheritedLabel?: string; drifted?: boolean;
  onWrite: (v: unknown | undefined) => Promise<void>;
}) {
  const modified = props.value !== null && props.value !== undefined;
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const commit = (v: unknown | undefined) => {
    props.onWrite(v)
      .then(() => {
        setError(null);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  return (
    <div className="flex items-start justify-between gap-6 border-b py-3 last:border-b-0">
      <div className="min-w-0">
        <Label className="flex items-center gap-2">
          {props.field.label}
          {props.drifted && <Badge variant="outline">was reset to default</Badge>}
        </Label>
        <p className="mt-1 text-sm text-muted-foreground">{props.field.description}</p>
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
        {props.inheritedLabel && !modified && (
          <p className="mt-0.5 text-xs text-muted-foreground">{props.inheritedLabel}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Check
          aria-hidden="true"
          className={`size-4 text-muted-foreground transition-opacity duration-500 ${saved ? "opacity-100" : "opacity-0"}`}
        />
        <Button
          variant="ghost" size="icon"
          disabled={!modified}
          title="Reset to default" aria-label="Reset to default"
          className={modified ? "" : "opacity-30"}
          onClick={() => commit(undefined)}
        >
          <RotateCcw className="size-4" />
        </Button>
        <FieldControl key={`${props.field.type}:${String(props.effective)}`} field={props.field} value={props.effective} onChange={commit} />
      </div>
    </div>
  );
}

function SettingsGroup({ title, entries, render }: { title: string; entries: { advanced: boolean }[]; render: (advanced: boolean) => ReactNode }) {
  const advanced = entries.filter((e) => e.advanced);
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {render(false)}
        {advanced.length > 0 && (
          <Accordion type="single" collapsible>
            <AccordionItem value="advanced" className="border-b-0">
              <AccordionTrigger className="py-2 text-sm text-muted-foreground hover:no-underline">
                Advanced · {advanced.length}
              </AccordionTrigger>
              <AccordionContent>{render(true)}</AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}

function PlatformSection({ section, entries, invalidate }: { section: string; entries: PlatformEntry[]; invalidate: () => void }) {
  const rows = entries.filter((e) => e.section === section);
  return (
    <SettingsGroup
      title={section}
      entries={rows}
      render={(advanced) => rows.filter((e) => e.advanced === advanced).map((e) => (
        <SettingRow
          key={e.key} field={e.field} value={e.value} effective={e.effective} drifted={e.drifted}
          inheritedLabel={e.scope === "global" ? "Applies to all apps" : undefined}
          onWrite={async (v) => { await write(`/api/settings/${e.key}`, v); invalidate(); }}
        />
      ))}
    />
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
              <p className="mt-1 text-sm text-muted-foreground">{s.error ?? s.description}</p>
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
                    <Select value="" onValueChange={(slug) => link(s.slot, slug)}>
                      <SelectTrigger className="w-44"><SelectValue placeholder="Link a secret…" /></SelectTrigger>
                      <SelectContent>
                        {(catalog.data?.secrets ?? []).map((c) => (
                          <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>
                        ))}
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
                key={d.key} field={d.field} value={d.value} effective={d.effective} drifted={d.drifted}
                onWrite={async (v) => { await write(`/api/apps/${app.appId}/settings/${d.key}`, v); invalidate(); }}
              />
            ) : (
              <div key={d.key} className="border-b py-3 last:border-b-0">
                <Label className="flex items-center gap-2"><code>{d.key}</code><Badge variant="destructive">declaration error</Badge></Label>
                <p className="mt-1 text-sm text-muted-foreground">{d.error}</p>
              </div>
            )
          )}
        </CardContent>
      </Card>
      <AppSecretsCard app={app} />
      <SettingsGroup
        title="Service overrides"
        entries={overrides}
        render={(advanced) => overrides.filter((o) => o.advanced === advanced).map((o) => (
          <SettingRow
            key={o.key}
            field={{ ...o.field, label: `${o.section} · ${o.field.label}` }}
            value={o.override}
            effective={o.override ?? o.platformEffective}
            inheritedLabel={`Platform value: ${String(o.platformEffective)}`}
            onWrite={async (v) => { await write(`/api/apps/${app.appId}/settings/${o.key}`, v); invalidate(); }}
          />
        ))}
      />
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
  // Pinned display order (UI revamp spec §4); unknown future sections append.
  const SERVICE_ORDER = ["Store", "Files", "Tasks", "Events", "Logs", "Engine"];
  const present = [...new Set(entries.map((e) => e.section))].filter((s) => s !== "General" && s !== "Appearance");
  const services = [
    ...SERVICE_ORDER.filter((s) => present.includes(s)),
    ...present.filter((s) => !SERVICE_ORDER.includes(s)),
  ];
  const app = apps.data?.find((a) => a.appId === section);

  const itemClass = (active: boolean) =>
    `block shrink-0 rounded px-2 py-1 hover:bg-accent ${active ? "bg-accent font-medium" : "text-muted-foreground"}`;
  const groupLabel = "hidden pt-3 px-2 text-xs uppercase text-muted-foreground md:block";

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-8">
      {/* Floating sidebar; below md it becomes a horizontal scrollable picker. */}
      <nav className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-3 text-sm shadow-sm md:sticky md:top-24 md:block md:w-48 md:shrink-0 md:space-y-1 md:self-start">
        <div className="hidden px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:block">
          Settings
        </div>
        {["General", "Appearance"].map((s) => (
          <Link key={s} to="/settings" search={{ section: s }} className={itemClass(section === s)}>{s}</Link>
        ))}
        <div className={groupLabel}>Apps</div>
        {(apps.data ?? []).map((a) => (
          <Link key={a.appId} to="/settings" search={{ section: a.appId }} className={itemClass(section === a.appId)}>
            {a.icon} {a.name}
          </Link>
        ))}
        <div className={groupLabel}>Services</div>
        {services.map((s) => (
          <Link key={s} to="/settings" search={{ section: s }} className={itemClass(section === s)}>{s}</Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1 space-y-4">
        {platform.isLoading ? (
          <Skeleton className="h-40" />
        ) : app ? (
          <AppSection app={app} />
        ) : (
          <PlatformSection
            section={section} entries={entries}
            invalidate={() => void queryClient.invalidateQueries({ queryKey: ["settings", "_platform"] })}
          />
        )}
      </div>
    </div>
  );
}
