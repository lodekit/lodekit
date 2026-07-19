// Vendored from prompt-kit (MIT) — https://github.com/ibelick/prompt-kit
// @ de80375, trimmed for the scripted hero demo (no markdown, no avatar,
// no tooltip actions; print-register styling via role tokens).
import { cn } from "@/lib/utils";

export type MessageRole = "user" | "agent";

export function Message({
  role,
  className,
  children,
}: {
  role: MessageRole;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex w-full",
        role === "user" ? "justify-end" : "justify-start",
        className
      )}
    >
      {children}
    </div>
  );
}

export function MessageContent({
  role,
  className,
  children,
}: {
  role: MessageRole;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "text-[0.9rem] leading-relaxed break-words whitespace-normal",
        role === "user"
          ? "max-w-[85%] rounded-[5px] bg-secondary px-3 py-2 text-secondary-foreground"
          : "max-w-full text-card-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}
