import { useSyncExternalStore, type ComponentType } from "react"

import { useIconLibrary } from "./use-icon-library"
import { getSet, subscribeSets, setsVersion } from "./sets"

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string
  strokeWidth?: number | string
  absoluteStrokeWidth?: boolean
}

/**
 * Wraps a lucide icon in the active-set indirection: renders the lucide glyph
 * for the default set (and as the fallback while an alternate chunk loads or
 * when `name` is unmapped), otherwise the mapped Phosphor/Tabler glyph.
 */
export function createIcon(name: string, Lucide: ComponentType<IconProps>) {
  function Icon(props: IconProps) {
    const library = useIconLibrary()
    useSyncExternalStore(subscribeSets, setsVersion, setsVersion)
    if (library !== "lucide") {
      const Alt = getSet(library)?.[name]
      if (Alt) {
        const { size = 24, strokeWidth, absoluteStrokeWidth: _absolute, ...rest } =
          props
        return library === "tabler" ? (
          <Alt size={size} stroke={strokeWidth} {...rest} />
        ) : (
          // Phosphor uses discrete weights; drop lucide's strokeWidth.
          <Alt size={size} {...rest} />
        )
      }
    }
    return <Lucide {...props} />
  }
  Icon.displayName = name
  return Icon
}
