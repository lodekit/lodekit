// Vendored from prompt-kit (MIT) — https://github.com/ibelick/prompt-kit
// @ de80375, trimmed for the scripted hero demo: display-only (the demo is
// a movie — no real textarea, no tooltips, no autosize).
import { ArrowUp } from "lucide-react";
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
  placeholder = "",
}: {
  text: string;
  placeholder?: string;
}) {
  return (
    <div className="min-h-[2.25rem] flex-1 px-1 py-1.5 text-[0.9rem] leading-relaxed">
      {text.length === 0 && placeholder.length > 0 && (
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

export function PromptInputActions({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {children}
      <span className="flex size-8 items-center justify-center rounded-[3px] bg-primary text-primary-foreground">
        <ArrowUp className="size-4" />
      </span>
    </div>
  );
}
