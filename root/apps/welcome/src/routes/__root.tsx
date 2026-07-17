import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import appCss from "../index.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: "Welcome to Lodekit" }],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: "/_ui/theme.css?app=welcome" },
      { rel: "icon", href: "/_ui/favicon.svg?app=welcome" },
    ],
  }),
  notFoundComponent: () => (
    <main className="mx-auto max-w-2xl space-y-2 p-8">
      <h1 className="text-lg font-medium">Page not found</h1>
      <Link to="/" className="text-muted-foreground underline">Back to Welcome</Link>
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
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
