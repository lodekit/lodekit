// Vendored from prompt-kit (MIT) — https://github.com/ibelick/prompt-kit
// @ de80375, trimmed for the scripted hero demo: static row, no collapsible,
// no state badges — running is the shared opacity pulse, done is a check.
import { Check, FilePenLine, Plug } from "lucide-react";
import { cn } from "@/lib/utils";

export function ToolRow({
  via,
  name,
  caption,
  done,
}: {
  via: "mcp" | "file";
  name: string;
  caption: string;
  done: boolean;
}) {
  const Icon = via === "mcp" ? Plug : FilePenLine;
  return (
    <div className="flex items-center gap-2.5 rounded-[3px] border border-border px-3 py-2">
      {done ? (
        <Check className="size-3.5 shrink-0 text-card-foreground" />
      ) : (
        <Icon className="demo-pulse size-3.5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <div className={cn("truncate font-mono text-[0.8125rem]", done ? "text-card-foreground" : "text-muted-foreground")}>
          {name}
        </div>
        <div className="truncate text-[0.75rem] text-muted-foreground">{caption}</div>
      </div>
      <span className="shrink-0 font-mono text-[0.65rem] tracking-[0.08em] text-muted-foreground uppercase">
        {via === "mcp" ? "MCP · lodekit" : "write"}
      </span>
    </div>
  );
}
