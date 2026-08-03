// web/main/src/components/demo/DemoWindow.tsx
// The illustration frame (spec §5.1): a generic mac window, not Lodekit UI.
// The .demo-window CSS scope re-points every role token to generic grays.
import type { ReactNode, Ref } from "react";

export function DemoWindow({
  title,
  ref,
  children,
}: {
  title: string;
  ref?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <div
      ref={ref}
      className="demo-window flex h-[540px] flex-col overflow-hidden rounded-[8px] border border-border bg-card font-normal"
    >
      <div
        className="relative flex items-center justify-center border-b border-border bg-secondary px-4 py-2.5"
        aria-hidden="true"
      >
        <span className="absolute left-4 flex gap-1.5">
          <span className="size-3 rounded-full bg-[#ec6a5e]" />
          <span className="size-3 rounded-full bg-[#f4bf50]" />
          <span className="size-3 rounded-full bg-[#61c554]" />
        </span>
        <span className="text-[0.8125rem] text-muted-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}
