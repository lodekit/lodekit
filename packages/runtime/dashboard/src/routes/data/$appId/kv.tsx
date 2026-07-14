import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/data/$appId/kv")({
  component: () => <p className="text-muted-foreground text-sm">Key-value</p>,
});
