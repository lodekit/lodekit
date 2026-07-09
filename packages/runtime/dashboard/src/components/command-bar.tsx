import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Settings } from "lucide-react";
import {
  Button,
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@lodekit/ui";
import { SERVICES } from "./nav";

interface AppInfo { appId: string; name: string; icon?: string }

const PAGES = [...SERVICES, { label: "Settings", icon: Settings, to: "/settings" as const }];

export function CommandBar() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const apps = useQuery<AppInfo[]>({
    queryKey: ["apps"],
    queryFn: async () => (await fetch("/api/apps")).json(),
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      {/* Desktop: input-lookalike trigger. Narrow: bare icon (spec §1). */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-8 w-56 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent md:inline-flex"
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="pointer-events-none rounded border bg-muted px-1.5 font-mono text-[10px]">⌘K</kbd>
      </button>
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search" onClick={() => setOpen(true)}>
        <Search className="size-4" />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search apps and pages…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          {(apps.data ?? []).length > 0 && (
            <CommandGroup heading="Apps">
              {(apps.data ?? []).map((a) => (
                <CommandItem
                  key={a.appId}
                  onSelect={() => { setOpen(false); window.location.assign(`/${a.appId}/`); }}
                >
                  <span aria-hidden="true">{a.icon || "📦"}</span> {a.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading="Pages">
            {PAGES.map((p) => (
              <CommandItem
                key={p.label}
                onSelect={() => {
                  setOpen(false);
                  if (p.href) window.location.assign(p.href);
                  else void navigate({ to: p.to });
                }}
              >
                <p.icon className="size-4" aria-hidden="true" /> {p.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
