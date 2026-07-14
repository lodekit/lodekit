import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/data/$appId/tables/$table")({
  component: () => <p className="text-muted-foreground text-sm">Table</p>,
});
