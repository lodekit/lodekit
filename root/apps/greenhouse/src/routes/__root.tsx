import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { LayoutGrid, ScrollText, Settings } from "@lodekit/ui/icons";
import appCss from "../index.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: "Greenhouse" }],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: "/_ui/theme.css?app=greenhouse" },
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
        {/* Theme before hydration — no dark-mode flash. Served by the runtime
            from the effective appearance.theme setting; system mode keeps the
            OS media query (settings spec §8). */}
        <script src="/_ui/theme.js" />
      </head>
      <body>
        <nav className="mx-auto flex max-w-4xl items-center gap-4 p-4">
          <span className="text-lg">🪴</span>
          <Link to="/" className="font-medium inline-flex items-center gap-1">
            <LayoutGrid size={16} aria-hidden="true" />
            Conservatory
          </Link>
          <Link to="/almanac" className="inline-flex items-center gap-1">
            <ScrollText size={16} aria-hidden="true" />
            Almanac
          </Link>
          <Link to="/shed" className="inline-flex items-center gap-1">
            <Settings size={16} aria-hidden="true" />
            Potting Shed
          </Link>
        </nav>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
