import { useQuery } from "@tanstack/react-query";
import { MARK_BODIES, type MarkStyle } from "../../../src/marks";

type SvgProps = { className?: string };

// jar-cloud marks (running variation) — vector data lives in src/marks.ts,
// shared with the engine's favicon routes. fills/strokes are currentColor so
// the theme's --primary carries through. dangerouslySetInnerHTML is safe here:
// MARK_BODIES is a compile-time constant in our own module, never user input.
function Mark({ style, className }: { style: MarkStyle } & SvgProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: MARK_BODIES[style] }}
    />
  );
}

// Exported for the settings page: the icon_style select shows each option
// with its actual mark.
export const MARKS = {
  a: (p: SvgProps) => <Mark style="a" {...p} />,
  b: (p: SvgProps) => <Mark style="b" {...p} />,
  c: (p: SvgProps) => <Mark style="c" {...p} />,
} as const;

// Tracks the effective appearance.icon_style setting (live via the settings SSE component).
// Always the "running" mark — the logo does not reflect runtime state.
export function Logo({ className }: SvgProps) {
  const q = useQuery<{ settings: { key: string; effective: unknown }[] }>({
    queryKey: ["settings", "_platform"],
    queryFn: async () => (await fetch("/api/settings")).json(),
  });
  const style = q.data?.settings.find((s) => s.key === "appearance.icon_style")?.effective;
  return <Mark style={style === "a" || style === "c" ? style : "b"} className={className} />;
}
