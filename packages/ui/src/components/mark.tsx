import { MARK_BODIES, type MarkStyle } from "../marks";

// jar-cloud mark (running variation) — vector data lives in ../marks, shared
// with the engine's favicon routes. fills/strokes are currentColor so the
// theme's foreground carries through. dangerouslySetInnerHTML is safe here:
// MARK_BODIES is a compile-time constant in our own module, never user input.
export function Mark({ style, className }: { style: MarkStyle; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: MARK_BODIES[style] }}
    />
  );
}
