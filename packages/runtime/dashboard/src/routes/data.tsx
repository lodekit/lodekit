import { Navigate, Outlet, createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchApps } from "../lib/data-api";
import { ExplorerSidebar } from "../components/data/explorer-sidebar";

export const Route = createFileRoute("/data")({
  component: DataLayout,
});

function DataLayout() {
  const { appId } = useParams({ strict: false }) as { appId?: string };
  const apps = useQuery({ queryKey: ["apps"], queryFn: fetchApps });
  // Unknown app id (deleted app, stale link) → back to the explorer root.
  if (appId && apps.data && !apps.data.some((a) => a.appId === appId)) {
    return <Navigate to="/data" replace />;
  }
  // Same in-container split the Settings page uses: sticky card nav + fluid panel.
  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-8">
      <ExplorerSidebar />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
