// Vendored from prompt-kit (MIT) — https://github.com/ibelick/prompt-kit
// @ de80375, trimmed for the scripted hero demo: display-only (the demo is
// a movie — no real textarea, no tooltips, no autosize).
import { ArrowCounterClockwiseIcon, ArrowUpIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export function PromptInput({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-end gap-2 rounded-[5px] border border-border bg-background p-2",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PromptInputDisplay({
  text,
  placeholder = "Ask for an app…",
}: {
  text: string;
  placeholder?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none min-h-[2.25rem] flex-1 px-1 py-1.5 text-[0.9rem] leading-relaxed select-none"
    >
      {text.length === 0 && (
        <span className="text-muted-foreground">{placeholder}</span>
      )}
      {text}
      <span
        aria-hidden="true"
        className="ml-px inline-block h-[1.05em] w-px translate-y-[0.15em] bg-current"
      />
    </div>
  );
}

// The submit affordance doubles as the replay control: while the movie plays
// it is a decorative send button; at rest it becomes the real Replay button.
export function PromptInputActions({
  resting = false,
  onReplay,
  children,
}: {
  resting?: boolean;
  onReplay?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      {children}
      {resting && onReplay ? (
        <button
          type="button"
          onClick={onReplay}
          aria-label="Replay demo"
          className="chip inline-flex h-8 items-center gap-1.5 transition-opacity duration-200 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[3px] focus-visible:outline-ring"
          style={{ transitionTimingFunction: "var(--ease-drift)" }}
        >
          <ArrowCounterClockwiseIcon weight="regular" className="size-3" />
          Replay
        </button>
      ) : (
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-[3px] bg-secondary text-secondary-foreground"
        >
          <ArrowUpIcon weight="regular" className="size-4" />
        </span>
      )}
    </div>
  );
}
