import { useState } from "react";
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle } from "@lodekit/ui";
import { Check, Copy } from "lucide-react";

export interface DetailField { label: string; value: unknown }

function display(value: unknown): { text: string; pre: boolean } {
  if (value === null || value === undefined) return { text: "NULL", pre: false };
  if (typeof value === "string") {
    try {
      return { text: JSON.stringify(JSON.parse(value), null, 2), pre: true };
    } catch {
      return { text: value, pre: value.length > 80 };
    }
  }
  if (typeof value === "object") return { text: JSON.stringify(value, null, 2), pre: true };
  return { text: String(value), pre: false };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-6 shrink-0"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      <span className="sr-only">Copy value</span>
    </Button>
  );
}

export function DetailSheet({ open, title, fields, onClose }: {
  open: boolean; title: string; fields: DetailField[]; onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="truncate font-mono text-sm">{title}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-6">
          {fields.map((f) => {
            const d = display(f.value);
            return (
              <div key={f.label}>
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground font-mono text-xs">{f.label}</p>
                  {f.value != null && <CopyButton text={d.text} />}
                </div>
                {d.pre ? (
                  <pre className="bg-muted mt-1 overflow-x-auto rounded p-2 text-xs whitespace-pre-wrap break-all">{d.text}</pre>
                ) : (
                  <p className={`text-sm break-all ${f.value == null ? "text-muted-foreground/60 italic" : ""}`}>{d.text}</p>
                )}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
