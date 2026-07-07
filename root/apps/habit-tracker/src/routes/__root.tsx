import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import appCss from "../index.css?url";

const queryClient = new QueryClient();

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: "Habit Tracker" }],
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
        <QueryClientProvider client={queryClient}>
          <nav className="mx-auto flex max-w-2xl gap-4 p-4">
            <Link to="/">Today</Link>
            <Link to="/manage">Manage</Link>
          </nav>
          <Outlet />
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  ),
});
