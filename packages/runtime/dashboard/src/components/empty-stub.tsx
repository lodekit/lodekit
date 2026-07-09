// packages/runtime/dashboard/src/components/empty-stub.tsx
import type { LucideIcon } from "lucide-react";

export function EmptyStub({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <Icon className="size-10 text-muted-foreground/50" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">Nothing here yet.</p>
    </div>
  );
}
