import type { ComponentType } from "react"

type IconMap = Record<string, ComponentType<any>>

const loaded = new Map<string, IconMap>()
const loading = new Set<string>()
const subscribers = new Set<() => void>()

/**
 * Returns the loaded icon map for an alternate set, or `undefined` while its
 * lazy chunk is still resolving (callers render the lucide fallback until then).
 * The first call kicks off the dynamic import; when it lands, subscribers fire
 * so mounted icons re-render into the alternate glyph.
 */
export function getSet(library: "phosphor" | "tabler"): IconMap | undefined {
  if (loaded.has(library)) return loaded.get(library)
  if (!loading.has(library)) {
    loading.add(library)
    const load =
      library === "phosphor"
        ? import("./generated/phosphor")
        : import("./generated/tabler")
    load
      .then((module) => {
        loaded.set(library, module.default)
        subscribers.forEach((callback) => callback())
      })
      .catch(() => {
        loading.delete(library)
      })
  }
  return undefined
}

export function subscribeSets(callback: () => void) {
  subscribers.add(callback)
  return () => subscribers.delete(callback)
}

export const setsVersion = () => loaded.size
