import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import appCss from "../index.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: "Greenhouse" }],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
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
          <Link to="/" className="font-medium">Conservatory</Link>
          <Link to="/almanac">Almanac</Link>
          <Link to="/shed">Potting Shed</Link>
        </nav>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
