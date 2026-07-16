// jar-cloud mark vector data (running variation) — the single source of truth,
// consumed by the dashboard logo (dashboard/src/components/logo.tsx) and the
// engine's favicon routes (server.ts). Inner markup for a 32×32 viewBox; every
// fill/stroke is currentColor so the consumer chooses the color.

export type MarkStyle = "a" | "b" | "c";

export const isMarkStyle = (s: string): s is MarkStyle => s === "a" || s === "b" || s === "c";

const lid = `<path fill="currentColor" d="M10.4 8.6 L9.9 4.6 C9.77 3.6 10.5 3 11.4 3 L20.6 3 C21.5 3 22.23 3.6 22.1 4.6 L21.6 8.6 Z"/><rect fill="currentColor" x="9" y="8.6" width="14" height="2.9" rx="1.45"/>`;
const jarOutline = `<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M10 11.5 C7.8 11.6 6.2 11.9 5.3 12.6 C4.1 13.5 3.5 14.8 3.5 16.5 L3.5 25.5 C3.5 28.8 5.7 30.5 9.3 30.5 L22.7 30.5 C26.3 30.5 28.5 28.8 28.5 25.5 L28.5 16.5 C28.5 14.8 27.9 13.5 26.7 12.6 C25.8 11.9 24.2 11.6 22 11.5"/>`;
const cloud = `M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z`;

export const MARK_BODIES: Record<MarkStyle, string> = {
  // "Solid": outline jar, solid cork + cloud
  a: `${lid}${jarOutline}<path fill="currentColor" transform="translate(6.64 12.2) scale(0.78)" d="${cloud}"/>`,
  // "Knockout": solid jar, cloud as negative space
  b: `${lid}<path fill="currentColor" fill-rule="evenodd" d="M10 11.5 L22 11.5 C24.2 11.6 25.8 11.9 26.7 12.6 C27.9 13.5 28.5 14.8 28.5 16.5 L28.5 25.5 C28.5 28.8 26.3 30.5 22.7 30.5 L9.3 30.5 C5.7 30.5 3.5 28.8 3.5 25.5 L3.5 16.5 C3.5 14.8 4.1 13.5 5.3 12.6 C6.2 11.9 7.8 11.6 10 11.5 Z M21.733 20.031 C21.203 17.34 18.839 15.32 16 15.32 C13.746 15.32 11.788 16.599 10.813 18.471 C8.465 18.721 6.64 20.71 6.64 23.12 C6.64 25.702 8.738 27.8 11.32 27.8 L21.46 27.8 C23.613 27.8 25.36 26.053 25.36 23.9 C25.36 21.841 23.761 20.172 21.733 20.031 Z"/>`,
  // "Outline": outline jar + outline cloud
  c: `${lid}${jarOutline}<path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" transform="translate(7.6 13.4) scale(0.7)" d="${cloud}"/>`,
};

const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// Favicon builders: self-contained SVG documents (favicons load no page CSS).
// The mark keeps currentColor and picks its fill from an embedded
// prefers-color-scheme block (Chromium honors media queries in SVG favicons).
export function markFaviconSvg(style: string): string {
  const body = MARK_BODIES[isMarkStyle(style) ? style : "b"];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><style>svg{color:#18181b}@media(prefers-color-scheme:dark){svg{color:#fafafa}}</style>${body}</svg>`;
}

// The manifest icon is user-authored — XML-escape it so markup in the field
// renders as text instead of executing when the SVG URL is opened directly.
export function emojiFaviconSvg(icon: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${escapeXml(icon)}</text></svg>`;
}
