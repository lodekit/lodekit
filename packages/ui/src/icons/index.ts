// Public surface of @lodekit/ui/icons. The per-name icon components live in the
// generated block (./generated/names) — regenerate via
// `node scripts/generate-icon-maps.mjs`. Everything below is hand-written and
// stable.
export * from "./generated/names"
export { createIcon, type IconProps } from "./create-icon"
export { useIconLibrary, type IconLibrary } from "./use-icon-library"
export type { LucideIcon } from "lucide-react"
export type { LucideIcon as IconComponent } from "lucide-react"
