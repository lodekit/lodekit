import { createRootRoute, createRoute, createRouter, Link, Outlet } from "@tanstack/react-router";
import { appId } from "@lodekit/sdk";
import Today from "./pages/Today";
import Manage from "./pages/Manage";

const rootRoute = createRootRoute({
  component: () => (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Habit Tracker</h1>
        <nav className="flex gap-3">
          <Link to="/" className="hover:underline [&.active]:font-semibold">Today</Link>
          <Link to="/manage" className="hover:underline [&.active]:font-semibold">Manage</Link>
        </nav>
      </div>
      <Outlet />
    </main>
  ),
});

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Today });
const manageRoute = createRoute({ getParentRoute: () => rootRoute, path: "/manage", component: Manage });

// Real browser history under the app's own URL prefix: /<app-id>/.
export const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, manageRoute]),
  basepath: `/${appId}/`,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
