import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/data/$appId/files")({
  component: () => <p className="text-muted-foreground text-sm">Files</p>,
});
