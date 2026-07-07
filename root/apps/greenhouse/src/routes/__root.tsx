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
        {/* Theme before hydration — no dark-mode flash (spec §2 / shadcn item 2).
            dangerouslySetInnerHTML is safe ONLY because this is a fixed string
            literal; never interpolate anything into it. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.toggle("dark",matchMedia("(prefers-color-scheme: dark)").matches)`,
          }}
        />
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
