import type * as React from "react"

import { cn } from "../lib/utils"

// The identity's mono voices (DESIGN.md §3): Kicker is the uppercase eyebrow;
// Meta is the normal-case data voice (app ids, paths, values, timestamps).
function Kicker({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="kicker"
      className={cn(
        "text-muted-foreground font-mono text-[0.72rem] font-medium tracking-[0.12em] uppercase",
        className
      )}
      {...props}
    />
  )
}

function Meta({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="meta"
      className={cn(
        // font-normal: body defaults to 500, but the mono data voice sets at 400.
        "font-mono text-[0.8125rem] font-normal tracking-[0.01em] tabular-nums",
        className
      )}
      {...props}
    />
  )
}

export { Kicker, Meta }
