import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, Settings } from "@lodekit/ui/icons";
import { Button } from "@lodekit/ui";
import { Logo } from "./logo";
import { CommandBar } from "./command-bar";
import { ServicesGrid, ServicesMenu } from "./services-menu";

export function Header() {
  // Narrow-only services panel, expanding below the sticky bar (spec §1).
  const [panelOpen, setPanelOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => setPanelOpen(false), [pathname]); // close on navigation

  return (
    <header className="sticky top-0 z-40 mx-auto w-full min-w-80 max-w-[70rem] bg-background md:static md:px-8 md:pt-6">
      <div className="flex items-center gap-1 border-b bg-card px-4 py-2 md:rounded-xl md:border">
        {/* Lockup matches web/main's Lockup.astro — same gap, mark size, wordmark
            size and opacity, so the identity reads identically across surfaces. */}
        <Link
          to="/"
          aria-label="Lodekit home"
          className="mr-1 flex items-center gap-[0.6em] text-foreground opacity-80"
        >
          <Logo className="size-6 shrink-0" />
          <span
            className="hidden text-[1.2rem] leading-none font-bold uppercase tracking-[0.22em] sm:inline"
            style={{ fontFamily: "var(--lk-font-wordmark)" }}
          >
            Lodekit
          </span>
        </Link>
        <div className="flex-1" />
        <CommandBar />
        <div className="flex-1" />
        {/* Desktop: popover. Narrow: plain toggle for the under-bar panel. */}
        <div className="hidden md:block">
          <ServicesMenu />
        </div>
        <Button
          variant="ghost" size="icon" className="md:hidden" aria-label="Services"
          aria-expanded={panelOpen} onClick={() => setPanelOpen((o) => !o)}
        >
          <LayoutGrid className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Settings" render={<Link to="/settings" />}>
          <Settings className="size-4" />
        </Button>
      </div>
      {panelOpen && (
        <div className="border-b bg-card px-4 py-2 md:hidden">
          <ServicesGrid onNavigate={() => setPanelOpen(false)} />
        </div>
      )}
    </header>
  );
}
