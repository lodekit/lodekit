import { useSyncExternalStore } from "react"

export type IconLibrary = "lucide" | "phosphor" | "tabler"

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-icon-library"],
  })
  return () => observer.disconnect()
}

function snapshot(): IconLibrary {
  const value = document.documentElement.getAttribute("data-icon-library")
  return value === "phosphor" || value === "tabler" ? value : "lucide"
}

const serverSnapshot = (): IconLibrary => "lucide"

export function useIconLibrary(): IconLibrary {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}
