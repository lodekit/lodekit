import { HeadContent, Outlet, Scripts, createRootRoute, useMatches } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import appCss from "../index.css?url";
import { SSEProvider } from "../components/sse";
import { Header } from "../components/header";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    fullBleed?: boolean;
  }
}

const queryClient = new QueryClient();

// Injected by the runtime's dashboard build (build.ts defines) — never present in app builds.
declare const __LODEKIT_VERSION__: string;
declare const __LODEKIT_COMMIT__: string | null;

const versionLine = `lodekit v${__LODEKIT_VERSION__}${__LODEKIT_COMMIT__ ? ` ${__LODEKIT_COMMIT__}` : ""}`;

function Main() {
  const fullBleed = useMatches().some((m) => m.staticData?.fullBleed);
  return (
    <main className={fullBleed ? "w-full min-w-80 flex-1" : "mx-auto w-full min-w-80 max-w-[70rem] flex-1 px-4 py-6 md:px-8"}>
      <Outlet />
    </main>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: "Lodekit" }],
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
      <body className="flex min-h-screen flex-col">
        <QueryClientProvider client={queryClient}>
          <SSEProvider>
            <Header />
            <Main />
          </SSEProvider>
        </QueryClientProvider>
        <footer className="text-muted-foreground py-4 text-center text-xs">{versionLine}</footer>
        <Scripts />
      </body>
    </html>
  ),
});
