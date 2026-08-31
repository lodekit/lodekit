import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import appCss from "../index.css?url";
import { Meta, Toaster } from "@lodekit/ui";
import { SSEProvider } from "../components/sse";
import { DashboardShell } from "../components/shell";

const queryClient = new QueryClient();

// Injected by the engine's dashboard build (build.ts defines) — never present in app builds.
declare const __LODEKIT_VERSION__: string;
declare const __LODEKIT_COMMIT__: string | null;

const versionLine = `lodekit v${__LODEKIT_VERSION__}${__LODEKIT_COMMIT__ ? ` ${__LODEKIT_COMMIT__}` : ""}`;

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: "Lodekit" }],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: "/_ui/theme.css" },
      { rel: "icon", href: "/favicon.svg" },
    ],
  }),
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
        <QueryClientProvider client={queryClient}>
          <SSEProvider>
            <DashboardShell>
              {/* Column so the footer sits at the bottom of short pages inside
                  the shell's scroll cell. */}
              <div className="flex min-h-full flex-col">
                <main className="mx-auto w-full min-w-80 max-w-[70rem] flex-1 px-4 py-6 md:px-8">
                  <Outlet />
                </main>
                <footer className="py-4 text-center">
                  <Meta className="text-xs text-muted-foreground">{versionLine}</Meta>
                </footer>
              </div>
            </DashboardShell>
          </SSEProvider>
        </QueryClientProvider>
        <Toaster />
        <Scripts />
      </body>
    </html>
  ),
});
