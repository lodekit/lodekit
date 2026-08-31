import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppShell } from "@lodekit/ui";
import { LayoutGrid, ScrollText, Settings } from "@lodekit/ui/icons";
import appCss from "../index.css?url";

// The platform chrome around every page (app-shell spec §7). The shell picks
// up this app's designated theme through the theme.css?app= link below.
const shellApp = { appId: "greenhouse", name: "Greenhouse", icon: "🪴" };

// The app's own nav: a slim tab row inside the shell's content area — the
// intended pattern now that the platform header carries the app identity.
const tabClass =
  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground";
const tabActiveClass = `${tabClass} bg-accent text-accent-foreground`;

function Tab({ to, exact, children }: { to: string; exact?: boolean; children: ReactNode }) {
  return (
    <Link to={to} className={tabClass} activeProps={{ className: tabActiveClass }} activeOptions={{ exact: exact ?? false }}>
      {children}
    </Link>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: "Greenhouse" }],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: "/_ui/theme.css?app=greenhouse" },
      { rel: "icon", href: "/_ui/favicon.svg?app=greenhouse" },
    ],
  }),
  notFoundComponent: () => (
    <main className="mx-auto max-w-4xl space-y-2 p-4">
      <p className="text-muted-foreground">Nothing grows here — page not found.</p>
      <Link to="/" className="underline">Back to the Conservatory</Link>
    </main>
  ),
  component: () => (
    <html lang="en">
      <head>
        <HeadContent />
        {/* Theme before hydration — no dark-mode flash. Served by the engine
            from the effective appearance.theme setting; system mode keeps the
            OS media query (settings spec §8). */}
        <script src="/_ui/theme.js" />
      </head>
      <body>
        <AppShell app={shellApp}>
          <nav className="mx-auto flex max-w-4xl items-center gap-1 px-4 pt-4">
            <Tab to="/" exact>
              <LayoutGrid size={16} aria-hidden="true" />
              Conservatory
            </Tab>
            <Tab to="/almanac">
              <ScrollText size={16} aria-hidden="true" />
              Almanac
            </Tab>
            <Tab to="/shed">
              <Settings size={16} aria-hidden="true" />
              Potting Shed
            </Tab>
          </nav>
          <Outlet />
        </AppShell>
        <Scripts />
      </body>
    </html>
  ),
});
