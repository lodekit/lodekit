import { createFileRoute } from "@tanstack/react-router";
import { HardDrive } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@lodekit/ui";

export const Route = createFileRoute("/data/$appId/storage")({
  component: () => (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon"><HardDrive aria-hidden="true" /></EmptyMedia>
        <EmptyTitle role="heading" aria-level={1}>Storage</EmptyTitle>
        <EmptyDescription>Coming soon — a breakdown of this app's disk usage over time.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  ),
});
