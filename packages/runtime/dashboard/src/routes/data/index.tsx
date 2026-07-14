import { Navigate, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Database } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle, Skeleton } from "@lodekit/ui";
import { fetchApps } from "../../lib/data-api";

export const Route = createFileRoute("/data/")({
  component: DataIndex,
});

function DataIndex() {
  const apps = useQuery({ queryKey: ["apps"], queryFn: fetchApps });
  if (!apps.data) return <Skeleton className="h-32" />;
  if (apps.data.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Database aria-hidden="true" /></EmptyMedia>
          <EmptyTitle role="heading" aria-level={1}>Data</EmptyTitle>
          <EmptyDescription>No apps yet — ask your agent to build one, then explore its data here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return <Navigate to="/data/$appId" params={{ appId: apps.data[0].appId }} replace />;
}
