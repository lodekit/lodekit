import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createFileRoute, Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Copy } from "@lodekit/ui/icons";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from "@lodekit/ui";
import { useSSEEvent } from "../components/sse";
import { ThemeCanvas } from "../components/theme-editor/canvas";
import { Controls } from "../components/theme-editor/controls";
import { COLOR_TOKENS, parseTheme, serializeTheme, type ThemeModel } from "../lib/theme-css";
import { duplicateTheme, fetchThemeCss, fetchThemes, putPreview, putThemeCss } from "../lib/themes-api";
import { fetchApps } from "../lib/data-api";

export const Route = createFileRoute("/themes_/$name")({ component: ThemeEditor });

// Same name grammar the server enforces (registry's isValidAppId) — validated
// client-side so the Duplicate dialog hints before the round-trip.
const NAME_RE = /^[a-z0-9-]+$/;

// The model rendered as inline custom properties for the preview subtree: every
// color token present in the mode's map, plus the shared radius/spacing/font
// fields. Tasks 12-13 wrap the canvas/iframe preview in `<div style={cssVarsFor(…)}>`.
export function cssVarsFor(model: ThemeModel, mode: "light" | "dark"): Record<string, string> {
  const map = mode === "light" ? model.light : model.dark;
  const vars: Record<string, string> = {};
  for (const token of COLOR_TOKENS) {
    if (token in map) vars[`--${token}`] = map[token];
  }
  if (model.radius) vars["--radius"] = model.radius;
  if (model.spacing) vars["--spacing"] = model.spacing;
  if (model.fontUi) vars["--font-ui"] = model.fontUi;
  if (model.fontDisplay) vars["--font-display"] = model.fontDisplay;
  return vars;
}

function ThemeEditor() {
  const { name } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const themesQ = useQuery({ queryKey: ["themes"], queryFn: fetchThemes });
  const cssQ = useQuery({ queryKey: ["theme-css", name], queryFn: () => fetchThemeCss(name) });

  const [model, setModel] = useState<ThemeModel | null>(null);
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [dirty, setDirty] = useState(false);
  const loadedFor = useRef<string | null>(null);

  // Initialize the model when the CSS arrives (once per theme). A background
  // refetch of the same theme must not clobber unsaved edits, so skip re-init
  // while dirty; a different theme name always re-initializes.
  useEffect(() => {
    if (cssQ.data === undefined) return;
    if (loadedFor.current === name && dirty) return;
    setModel(parseTheme(cssQ.data));
    setDirty(false);
    loadedFor.current = name;
  }, [cssQ.data, name, dirty]);

  useSSEEvent("event", (e) => {
    const d = JSON.parse(e.data) as { component: string; type: string };
    if (d.component === "themes" && d.type === "theme-change") {
      void queryClient.invalidateQueries({ queryKey: ["themes"] });
      void queryClient.invalidateQueries({ queryKey: ["theme-css"] });
    }
  });

  const update = useCallback((next: ThemeModel) => {
    setModel(next);
    setDirty(true);
  }, []);

  const vendored = themesQ.data?.themes.find((t) => t.name === name)?.vendored ?? false;

  // App tab: pick an app, iframe it with the preview flag. Base UI unmounts the
  // inactive tab panel, so the iframe only loads while the App tab is active.
  const appsQ = useQuery({ queryKey: ["apps"], queryFn: fetchApps });
  const [tab, setTab] = useState("components");
  const [appId, setAppId] = useState("");

  // Save serializes the *current* model, so keep a ref the click handler reads
  // (avoids a stale render closure). A pending preview PUT is cancelled on save
  // and on unmount so a late draft can't flash over the just-saved theme.
  const modelRef = useRef<ThemeModel | null>(null);
  modelRef.current = model;
  const previewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  async function save() {
    const m = modelRef.current;
    if (!m) return;
    clearTimeout(previewTimer.current);
    setSaving(true);
    try {
      await putThemeCss(name, serializeTheme(m));
      // Only clear dirty if no edit landed during the await; an edit that raced
      // the save is genuinely unsaved, so keep dirty (Save stays enabled, guard armed).
      if (modelRef.current === m) setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["themes"] });
      await queryClient.invalidateQueries({ queryKey: ["theme-css", name] });
      toast.success("Theme saved");
    } catch (err) {
      toast.error((err as Error).message || "Failed to save theme");
    } finally {
      setSaving(false);
    }
  }

  // While editing on the App tab, debounce a draft PUT to the preview slot; the
  // engine emits theme-change over SSE and the iframe restyles in place — no
  // reload. Entering the tab (tab dep) also fires this, so the iframe shows the
  // current edits. Only PUT while dirty: a clean model leaves the slot untouched
  // and the iframe's `?preview=1` self-heals to the saved theme. (`raw` models
  // never render the Tabs — the degraded card shows instead — so no guard needed
  // beyond the dirty gate, which raw never trips.)
  useEffect(() => {
    if (!(tab === "app" && dirty && model && !model.raw)) return;
    const css = serializeTheme(model);
    previewTimer.current = setTimeout(() => void putPreview(css), 300);
    return () => clearTimeout(previewTimer.current);
  }, [tab, dirty, model]);

  // Guard against losing unsaved edits: block in-app navigation with a confirm,
  // and arm the native beforeunload prompt (both gated on `dirty`).
  useBlocker({
    shouldBlockFn: () => (dirty ? !window.confirm("Discard unsaved theme changes?") : false),
    enableBeforeUnload: () => dirty,
  });

  // Duplicate-to-edit dialog (vendored themes are read-only).
  const [dupOpen, setDupOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const names = new Set(themesQ.data?.themes.map((t) => t.name) ?? []);
  const slugTaken = names.has(slug.trim());
  const slugValid = NAME_RE.test(slug.trim());
  async function submitDuplicate() {
    if (!slugValid || slugTaken) return;
    const to = slug.trim();
    try {
      await duplicateTheme(name, to);
      await queryClient.invalidateQueries({ queryKey: ["themes"] });
      await queryClient.invalidateQueries({ queryKey: ["theme-css"] });
      setDupOpen(false);
      void navigate({ to: "/themes/$name", params: { name: to } });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const disabled = vendored || (model?.raw ?? false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <Link to="/themes" aria-label="Back to themes" className="text-muted-foreground hover:text-foreground">
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Link>
          <h1 className="truncate text-xl font-semibold">{name}</h1>
          {vendored && <Badge variant="outline">vendored</Badge>}
          {dirty && <Badge variant="secondary">unsaved</Badge>}
        </div>
        {vendored ? (
          <Button onClick={() => { setSlug(""); setDupOpen(true); }}>
            <Copy aria-hidden="true" className="size-4" /> Duplicate to edit
          </Button>
        ) : (
          <Button onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        )}
      </div>

      {vendored && (
        <p className="text-sm text-muted-foreground">
          This is a built-in theme and is read-only. Duplicate it to make your own editable copy.
        </p>
      )}
      {model && !model.raw && model.custom.trim() !== "" && (
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          This theme contains custom CSS beyond the standard tokens. It is preserved on save.
        </p>
      )}

      {cssQ.isLoading || !model ? (
        <div className="flex gap-6">
          <Skeleton className="h-96 w-[340px] shrink-0" />
          <Skeleton className="h-96 flex-1" />
        </div>
      ) : model.raw ? (
        <Card>
          <CardHeader><CardTitle>Custom CSS</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This theme isn&apos;t in the standard two-block format, so the visual editor can&apos;t open it.
              Edit the theme file directly to change it.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-6">
          <aside className="max-h-[calc(100vh-12rem)] w-[340px] shrink-0 overflow-y-auto pr-1">
            <Controls model={model} mode={mode} disabled={disabled} onMode={setMode} update={update} />
          </aside>

          <div className="max-h-[calc(100vh-12rem)] flex-1 overflow-y-auto">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="components">Components</TabsTrigger>
                <TabsTrigger value="app">App</TabsTrigger>
              </TabsList>
              <TabsContent value="components">
                {/* The cssVarsFor div makes every model edit visibly restyle
                    the canvas — see canvas.tsx for the self-contained sample
                    composition (task 12). */}
                <div
                  className="rounded-lg border bg-background p-6 text-foreground"
                  style={cssVarsFor(model, mode) as CSSProperties}
                >
                  <ThemeCanvas />
                </div>
              </TabsContent>
              <TabsContent value="app" className="flex h-[calc(100vh-16rem)] flex-col gap-3">
                <Select
                  value={appId}
                  onValueChange={(v) => setAppId(v ?? "")}
                  items={(appsQ.data ?? []).map((a) => ({ value: a.appId, label: `${a.icon ? `${a.icon} ` : ""}${a.name}` }))}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select an app" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(appsQ.data ?? []).map((a) => (
                        <SelectItem key={a.appId} value={a.appId}>{a.icon ? `${a.icon} ` : ""}{a.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {appId ? (
                  <iframe
                    src={`/${appId}/?lodekit-theme-preview=1`}
                    className="h-full w-full rounded-md border"
                    title="App preview"
                  />
                ) : (
                  <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    Pick an app to preview it with this theme.
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}

      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate theme</DialogTitle>
            <DialogDescription>Copy &quot;{name}&quot; to a new, editable theme.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Input
              autoFocus
              value={slug}
              placeholder="theme-name"
              onChange={(e) => setSlug(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submitDuplicate()}
            />
            <p className="text-xs text-muted-foreground">
              {slug.trim() && !slugValid
                ? "Lowercase letters, digits and hyphens only."
                : slugTaken
                  ? `"${slug.trim()}" already exists.`
                  : "Lowercase letters, digits and hyphens."}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDupOpen(false)}>Cancel</Button>
            <Button disabled={!slugValid || slugTaken} onClick={() => void submitDuplicate()}>Duplicate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
