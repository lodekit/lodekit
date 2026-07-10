// packages/runtime/dashboard/src/components/empty-stub.tsx
import type { LucideIcon } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@lodekit/ui";

export function EmptyStub({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon"><Icon aria-hidden="true" /></EmptyMedia>
        <EmptyTitle role="heading" aria-level={1}>{title}</EmptyTitle>
        <EmptyDescription>Nothing here yet.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
