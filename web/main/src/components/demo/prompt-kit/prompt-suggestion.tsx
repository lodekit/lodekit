// Vendored from prompt-kit (MIT) — https://github.com/ibelick/prompt-kit
// @ de80375, trimmed for the scripted hero demo: a non-interactive chip
// (the demo is a movie); the pressed state depicts the scripted click.
import { cn } from "@/lib/utils";

export function PromptSuggestion({
  label,
  detail,
  pressed,
}: {
  label: string;
  detail: string;
  pressed: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[3px] border px-3 py-2 transition-[border-color,color,transform] duration-200",
        pressed
          ? "translate-y-px border-primary text-primary"
          : "border-border text-card-foreground"
      )}
      style={{ transitionTimingFunction: "var(--ease-drift)" }}
    >
      <span className="text-[0.85rem] font-medium">{label}</span>
      <span className={cn("ml-1.5 text-[0.8125rem]", pressed ? "text-primary" : "text-muted-foreground")}>
        — {detail}
      </span>
    </div>
  );
}
