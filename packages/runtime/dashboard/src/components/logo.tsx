import { useQuery } from "@tanstack/react-query";

type SvgProps = { className?: string };

// jar-cloud marks (running variation), fills/strokes converted to currentColor
// so the theme's --primary carries through. Source: menubar-icons/svg.

function MarkA({ className }: SvgProps) { // "Solid": outline jar, solid cork + cloud
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path fill="currentColor" d="M10.4 8.6 L9.9 4.6 C9.77 3.6 10.5 3 11.4 3 L20.6 3 C21.5 3 22.23 3.6 22.1 4.6 L21.6 8.6 Z" />
      <rect fill="currentColor" x="9" y="8.6" width="14" height="2.9" rx="1.45" />
      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        d="M10 11.5 C7.8 11.6 6.2 11.9 5.3 12.6 C4.1 13.5 3.5 14.8 3.5 16.5 L3.5 25.5 C3.5 28.8 5.7 30.5 9.3 30.5 L22.7 30.5 C26.3 30.5 28.5 28.8 28.5 25.5 L28.5 16.5 C28.5 14.8 27.9 13.5 26.7 12.6 C25.8 11.9 24.2 11.6 22 11.5" />
      <path fill="currentColor" transform="translate(6.64 12.2) scale(0.78)"
        d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
    </svg>
  );
}

function MarkB({ className }: SvgProps) { // "Knockout": solid jar, cloud as negative space
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path fill="currentColor" d="M10.4 8.6 L9.9 4.6 C9.77 3.6 10.5 3 11.4 3 L20.6 3 C21.5 3 22.23 3.6 22.1 4.6 L21.6 8.6 Z" />
      <rect fill="currentColor" x="9" y="8.6" width="14" height="2.9" rx="1.45" />
      <path fill="currentColor" fillRule="evenodd" d="
        M10 11.5 L22 11.5 C24.2 11.6 25.8 11.9 26.7 12.6 C27.9 13.5 28.5 14.8 28.5 16.5 L28.5 25.5 C28.5 28.8 26.3 30.5 22.7 30.5 L9.3 30.5 C5.7 30.5 3.5 28.8 3.5 25.5 L3.5 16.5 C3.5 14.8 4.1 13.5 5.3 12.6 C6.2 11.9 7.8 11.6 10 11.5 Z
        M21.733 20.031 C21.203 17.34 18.839 15.32 16 15.32 C13.746 15.32 11.788 16.599 10.813 18.471 C8.465 18.721 6.64 20.71 6.64 23.12 C6.64 25.702 8.738 27.8 11.32 27.8 L21.46 27.8 C23.613 27.8 25.36 26.053 25.36 23.9 C25.36 21.841 23.761 20.172 21.733 20.031 Z" />
    </svg>
  );
}

function MarkC({ className }: SvgProps) { // "Outline": outline jar + outline cloud
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path fill="currentColor" d="M10.4 8.6 L9.9 4.6 C9.77 3.6 10.5 3 11.4 3 L20.6 3 C21.5 3 22.23 3.6 22.1 4.6 L21.6 8.6 Z" />
      <rect fill="currentColor" x="9" y="8.6" width="14" height="2.9" rx="1.45" />
      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        d="M10 11.5 C7.8 11.6 6.2 11.9 5.3 12.6 C4.1 13.5 3.5 14.8 3.5 16.5 L3.5 25.5 C3.5 28.8 5.7 30.5 9.3 30.5 L22.7 30.5 C26.3 30.5 28.5 28.8 28.5 25.5 L28.5 16.5 C28.5 14.8 27.9 13.5 26.7 12.6 C25.8 11.9 24.2 11.6 22 11.5" />
      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
        transform="translate(7.6 13.4) scale(0.7)"
        d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
    </svg>
  );
}

// Exported for the settings page: the icon_style select shows each option
// with its actual mark.
export const MARKS = { a: MarkA, b: MarkB, c: MarkC } as const;

// Tracks the effective appearance.icon_style setting (live via the settings SSE component).
// Always the "running" mark — the logo does not reflect runtime state.
export function Logo({ className }: SvgProps) {
  const q = useQuery<{ settings: { key: string; effective: unknown }[] }>({
    queryKey: ["settings", "_platform"],
    queryFn: async () => (await fetch("/api/settings")).json(),
  });
  const style = q.data?.settings.find((s) => s.key === "appearance.icon_style")?.effective;
  const Mark = MARKS[style === "a" || style === "c" ? style : "b"];
  return <Mark className={className} />;
}
