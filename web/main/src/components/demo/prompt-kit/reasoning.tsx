// Vendored from prompt-kit (MIT) — https://github.com/ibelick/prompt-kit
// @ de80375, trimmed for the scripted hero demo: the collapsed trigger row
// only — no expansion, no markdown; activity is the shared opacity pulse.
import { SparkleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export function ReasoningRow({ label, active }: { label: string; active: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-[0.8125rem] text-muted-foreground",
        active && "demo-pulse"
      )}
    >
      <SparkleIcon weight="regular" className="size-3.5 shrink-0" />
      <span>{label}</span>
    </div>
  );
}
