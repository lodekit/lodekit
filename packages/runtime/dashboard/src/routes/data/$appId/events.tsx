import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/data/$appId/events")({
  component: () => <p className="text-muted-foreground text-sm">Events</p>,
});
