import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { LayoutGrid } from "@lodekit/ui/icons";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@lodekit/ui";
import { SERVICES } from "./nav";

const tileClass =
  "flex flex-col items-center gap-1.5 rounded-lg p-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

// The Gmail-style tile grid — shared by the desktop popover and the narrow
// under-header panel (spec §2). onNavigate lets the container close itself.
export function ServicesGrid({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {SERVICES.map((s) =>
        s.href ? (
          <a key={s.label} href={s.href} className={tileClass} onClick={onNavigate}>
            <s.icon className="size-5" aria-hidden="true" />
            {s.label}
          </a>
        ) : (
          <Link key={s.label} to={s.to} className={tileClass} onClick={onNavigate}>
            <s.icon className="size-5" aria-hidden="true" />
            {s.label}
          </Link>
        )
      )}
    </div>
  );
}

// Desktop container: a popover card anchored to the grid button. The narrow
// variant is rendered by the header itself (full-width panel under the bar).
export function ServicesMenu() {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={
        <Button variant="ghost" size="icon" aria-label="Services">
          <LayoutGrid className="size-4" />
        </Button>
      } />
      <PopoverContent align="end" className="w-64 p-2">
        <ServicesGrid onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
