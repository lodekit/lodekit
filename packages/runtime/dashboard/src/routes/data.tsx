import { Navigate, Outlet, createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchApps } from "../lib/data-api";
import { ExplorerSidebar } from "../components/data/explorer-sidebar";

export const Route = createFileRoute("/data")({
  staticData: { fullBleed: true },
  component: DataLayout,
});

function DataLayout() {
  const { appId } = useParams({ strict: false }) as { appId?: string };
  const apps = useQuery({ queryKey: ["apps"], queryFn: fetchApps });
  // Unknown app id (deleted app, stale link) → back to the explorer root.
  if (appId && apps.data && !apps.data.some((a) => a.appId === appId)) {
    return <Navigate to="/data" replace />;
  }
  return (
    <div className="flex min-h-full">
      <ExplorerSidebar />
      <div className="min-w-0 flex-1 px-4 py-6 md:px-8">
        <Outlet />
      </div>
    </div>
  );
}
