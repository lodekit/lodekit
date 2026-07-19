// Vendored from prompt-kit (MIT) — https://github.com/ibelick/prompt-kit
// @ de80375, trimmed for the scripted hero demo: a non-interactive chip
// (the demo is a movie); the pressed state depicts the scripted click.
import { cn } from "@/lib/utils";

export function PromptSuggestion({
  label,
  detail,
  pressed,
  icon,
  emphasis = false,
}: {
  label: string;
  detail: string;
  pressed: boolean;
  icon?: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-[3px] border px-3 py-2 transition-[border-color,color,transform] duration-200",
        pressed
          ? "translate-y-px border-primary text-primary"
          : emphasis
            ? "border-primary/50 text-card-foreground"
            : "border-border text-card-foreground"
      )}
      style={{ transitionTimingFunction: "var(--ease-drift)" }}
    >
      {icon && (
        <span
          className={cn(
            "mt-0.5 shrink-0 [&_svg]:size-3.5",
            pressed || emphasis ? "text-primary" : "text-muted-foreground"
          )}
        >
          {icon}
        </span>
      )}
      <span>
        <span className={cn("text-[0.85rem] font-medium", emphasis && !pressed && "text-primary")}>
          {label}
        </span>
        <span className={cn("ml-1.5 text-[0.8125rem]", pressed ? "text-primary" : "text-muted-foreground")}>
          — {detail}
        </span>
      </span>
    </div>
  );
}
