// jar-cloud mark vector data (running variation) — the single source of truth,
// consumed by the dashboard logo (dashboard/src/components/logo.tsx) and the
// engine's favicon routes (server.ts). Inner markup for a 32×32 viewBox; every
// fill/stroke is currentColor so the consumer chooses the color.

export type MarkStyle = "a" | "b" | "c";

export const isMarkStyle = (s: string): s is MarkStyle => s === "a" || s === "b" || s === "c";

const cork = `<path fill="currentColor" d="M10.4 6.13 L9.9 3.23 C9.77 2.51 10.5 2.07 11.4 2.07 L20.58 2.07 C21.48 2.07 22.21 2.51 22.08 3.23 L21.58 6.13 Z"/>`;
const lip = `<rect fill="currentColor" x="9" y="5.14" width="13.98" height="1.9" rx="0.52"/>`;
// neck flare between lip and body; style b extends its bottom edge (8.01 → 9.5) to fuse with the solid body
const neck = `<path fill="currentColor" d="M22.98 7.96 L22.98 8.01 L9.01 8.01 L9.01 7.96 C9.81 7.96 10.46 7.31 10.46 6.51 L21.53 6.51 C21.53 7.31 22.18 7.96 22.98 7.96 Z"/>`;
const neckFused = `<path fill="currentColor" d="M22.98 7.96 L22.98 9.5 L9.01 9.5 L9.01 7.96 C9.81 7.96 10.46 7.31 10.46 6.51 L21.53 6.51 C21.53 7.31 22.18 7.96 22.98 7.96 Z"/>`;
// jar body outline (stroke inherits the source logo's non-uniform scale via the matrix)
const jarOutline = `<g transform="matrix(0.918295,0,0,1.065459,1.307282,-3.495313)"><path fill="none" stroke="currentColor" stroke-width="2.01" stroke-linejoin="round" d="M10 11.5 L22 11.5 C24.2 11.6 25.8 11.9 26.7 12.6 C27.9 13.5 28.5 14.8 28.5 16.5 L28.5 25.5 C28.5 28.8 26.3 30.5 22.7 30.5 L9.3 30.5 C5.7 30.5 3.5 28.8 3.5 25.5 L3.5 16.5 C3.5 14.8 4.1 13.5 5.3 12.6 C6.2 11.9 7.8 11.6 10 11.5 Z"/></g>`;
const cloud = `<path fill="currentColor" d="M21.37 17.49 C20.87 15.06 18.66 13.23 16 13.23 C13.89 13.23 12.06 14.39 11.15 16.08 C8.95 16.31 7.24 18.11 7.24 20.29 C7.24 22.63 9.21 24.53 11.62 24.53 L21.11 24.53 C23.13 24.53 24.76 22.95 24.76 21 C24.76 19.13 23.26 17.62 21.37 17.49 Z"/>`;
const bodyKnockout = `<path fill="currentColor" fill-rule="evenodd" d="M10.49 8.76 L21.51 8.76 C23.53 8.86 25 9.18 25.83 9.93 C26.93 10.89 27.48 12.27 27.48 14.08 L27.48 23.67 C27.48 27.19 25.46 29 22.15 29 L9.85 29 C6.54 29 4.52 27.19 4.52 23.67 L4.52 14.08 C4.52 12.27 5.07 10.89 6.17 9.93 C7 9.18 8.47 8.86 10.49 8.76 Z M21.37 17.49 C20.87 15.06 18.66 13.23 16 13.23 C13.89 13.23 12.06 14.39 11.15 16.08 C8.95 16.31 7.24 18.11 7.24 20.29 C7.24 22.63 9.21 24.53 11.62 24.53 L21.11 24.53 C23.13 24.53 24.76 22.95 24.76 21 C24.76 19.13 23.26 17.62 21.37 17.49 Z"/>`;
const cloudOutline = `<g transform="matrix(0.657113,0,0,0.605778,8.114642,11.609996)"><path fill="none" stroke="currentColor" stroke-width="2.66" stroke-linecap="round" stroke-linejoin="round" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></g>`;

export const MARK_BODIES: Record<MarkStyle, string> = {
  // "Solid": outline jar, solid cork/lip/neck, solid cloud
  a: `${cork}${lip}${neck}${jarOutline}${cloud}`,
  // "Knockout": solid jar (cloud as negative space) + outline pass matching the outline variant's outer edge
  b: `${cork}${lip}${neckFused}${bodyKnockout}${jarOutline}`,
  // "Outline": outline jar, solid cork/lip/neck, outline cloud
  c: `${cork}${lip}${neck}${jarOutline}${cloudOutline}`,
};

const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// Favicon builders: self-contained SVG documents (favicons load no page CSS).
// The mark keeps currentColor and picks its fill from an embedded
// prefers-color-scheme block (Chromium honors media queries in SVG favicons).
export function markFaviconSvg(style: string): string {
  const body = MARK_BODIES[isMarkStyle(style) ? style : "b"];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><style>svg{color:#251b25}@media(prefers-color-scheme:dark){svg{color:#f3e0a5}}</style>${body}</svg>`;
}

// The manifest icon is user-authored — XML-escape it so markup in the field
// renders as text instead of executing when the SVG URL is opened directly.
export function emojiFaviconSvg(icon: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${escapeXml(icon)}</text></svg>`;
}
