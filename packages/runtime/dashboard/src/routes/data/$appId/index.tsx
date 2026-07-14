import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/data/$appId/")({
  component: () => <p className="text-muted-foreground text-sm">Overview</p>,
});
