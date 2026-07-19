import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, X } from "@lodekit/ui/icons";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Input,
  Meta,
  Skeleton,
  toast,
} from "@lodekit/ui";
import { useSSEEvent } from "../components/sse";
import { ThemeCard } from "../components/theme-card";
import { fetchApps } from "../lib/data-api";
import {
  deleteTheme,
  duplicateTheme,
  fetchThemes,
  putThemesConfig,
  renameTheme,
  type ThemesIndex,
} from "../lib/themes-api";

export const Route = createFileRoute("/themes")({ component: ThemesView });

// Same grammar as the app-id / theme-name rule the server enforces (registry's
// isValidAppId) — validate client-side so the Duplicate/Rename dialogs give an
// instant hint before the round-trip.
const NAME_RE = /^[a-z0-9-]+$/;

function ThemesView() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const themesQ = useQuery({ queryKey: ["themes"], queryFn: fetchThemes });
  const appsQ = useQuery({ queryKey: ["apps"], queryFn: fetchApps });

  useSSEEvent("event", (e) => {
    const d = JSON.parse(e.data) as { component: string; type: string };
    if (d.component === "themes" && d.type === "theme-change") {
      void queryClient.invalidateQueries({ queryKey: ["themes"] });
      void queryClient.invalidateQueries({ queryKey: ["theme-css"] });
    }
  });

  const [dialog, setDialog] = useState<{ kind: "duplicate" | "rename"; from: string } | null>(null);
  const [slug, setSlug] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const config = themesQ.data?.config ?? {};
  const themes = themesQ.data?.themes ?? [];
  const apps = appsQ.data ?? [];
  const names = new Set(themes.map((t) => t.name));

  // Build the PUT from the freshest cached config, never the render-closure
  // snapshot: a PUT sends the whole config object, so two rapid actions must
  // each layer onto the latest state or the second silently drops the first.
  async function saveConfig(mutate: (current: ThemesIndex["config"]) => ThemesIndex["config"]) {
    const current = queryClient.getQueryData<ThemesIndex>(["themes"])?.config ?? {};
    try {
      await putThemesConfig(mutate(current));
      await queryClient.invalidateQueries({ queryKey: ["themes"] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const useEverywhere = (name: string) => saveConfig((c) => ({ ...c, global: name }));
  const assign = (name: string, appId: string) =>
    saveConfig((c) => ({ ...c, apps: { ...(c.apps ?? {}), [appId]: name } }));
  const unassign = (appId: string) =>
    saveConfig((c) => {
      const apps = { ...(c.apps ?? {}) };
      delete apps[appId];
      return { ...c, apps };
    });

  const slugTaken = names.has(slug.trim()) && slug.trim() !== dialog?.from;
  const slugValid = NAME_RE.test(slug.trim());

  async function submitDialog() {
    if (!dialog || !slugValid || slugTaken) return;
    const to = slug.trim();
    try {
      if (dialog.kind === "duplicate") await duplicateTheme(dialog.from, to);
      else await renameTheme(dialog.from, to);
      await queryClient.invalidateQueries({ queryKey: ["themes"] });
      await queryClient.invalidateQueries({ queryKey: ["theme-css"] });
      setDialog(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteTheme(deleteTarget);
      await queryClient.invalidateQueries({ queryKey: ["themes"] });
    } catch (err) {
      toast.error((err as Error).message);
    }
    setDeleteTarget(null);
  }

  const assignedApps = Object.entries(config.apps ?? {});

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Themes</h1>

      {/* Current state: the global selection plus each per-app override. */}
      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          Global: <Meta className="text-foreground">{config.global ?? "lodekit"}</Meta>
        </span>
        {assignedApps.map(([appId, name]) => (
          <Badge key={appId} variant="outline" className="gap-1 font-mono">
            {appId} → {name}
            <button
              type="button"
              aria-label={`Unassign ${name} from ${appId}`}
              className="ml-0.5 rounded-sm hover:text-foreground"
              onClick={() => void unassign(appId)}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </Badge>
        ))}
      </div>

      {themesQ.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-48" /><Skeleton className="h-48" /><Skeleton className="h-48" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {themes.map((t) => {
            const assignments: string[] = [];
            if (config.global === t.name) assignments.push("global");
            for (const [appId, name] of assignedApps) if (name === t.name) assignments.push(appId);
            return (
              <ThemeCard
                key={t.name}
                theme={t}
                assignments={assignments}
                onOpen={() => void navigate({ to: "/themes/$name", params: { name: t.name } })}
                actions={
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${t.name}`} />}
                    >
                      <MoreHorizontal className="size-4" aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => void useEverywhere(t.name)}>Use everywhere</DropdownMenuItem>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Assign to app…</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {apps.length === 0 ? (
                            <DropdownMenuItem disabled>No apps installed</DropdownMenuItem>
                          ) : (
                            apps.map((a) => (
                              <DropdownMenuItem key={a.appId} onClick={() => void assign(t.name, a.appId)}>
                                {a.name}
                              </DropdownMenuItem>
                            ))
                          )}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuItem
                        onClick={() => {
                          setSlug("");
                          setDialog({ kind: "duplicate", from: t.name });
                        }}
                      >
                        Duplicate
                      </DropdownMenuItem>
                      {!t.vendored && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setSlug(t.name);
                              setDialog({ kind: "rename", from: t.name });
                            }}
                          >
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(t.name)}>
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                }
              />
            );
          })}
        </div>
      )}

      {/* Duplicate / Rename share one slug dialog. */}
      <Dialog open={dialog != null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.kind === "rename" ? "Rename theme" : "Duplicate theme"}</DialogTitle>
            <DialogDescription>
              {dialog?.kind === "rename"
                ? `Rename "${dialog?.from}" to a new name.`
                : `Copy "${dialog?.from}" to a new theme.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Input
              autoFocus
              value={slug}
              placeholder="theme-name"
              onChange={(e) => setSlug(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submitDialog()}
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
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button disabled={!slugValid || slugTaken} onClick={() => void submitDialog()}>
              {dialog?.kind === "rename" ? "Rename" : "Duplicate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget != null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the theme file. Any app or global selection pointing at it falls back to the default.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
