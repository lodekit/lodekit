// packages/runtime/dashboard/src/components/nav.ts
import { Cpu, Database, Folder, KeyRound, ListChecks, Palette, Plug, ScrollText, Zap, type LucideIcon } from "lucide-react";

// The services menu / command-bar page list (UI revamp spec §2). `to` navigates
// inside the SPA; `href` (currently unused) is a full-page navigation escape
// hatch for surfaces that can't render inside the router.
export type ServiceEntry = { label: string; icon: LucideIcon } & ({ to: string; href?: never } | { href: string; to?: never });

export const SERVICES: ServiceEntry[] = [
  { label: "Data", icon: Database, to: "/data" },
  { label: "Tasks", icon: ListChecks, to: "/tasks" },
  { label: "Events", icon: Zap, to: "/events" },
  { label: "Secrets", icon: KeyRound, to: "/secrets" },
  { label: "Gateways", icon: Plug, to: "/gateways" },
  { label: "Logs", icon: ScrollText, to: "/logs" },
  { label: "Themes", icon: Palette, to: "/themes" },
];

// Canonical service → icon map, keyed by the settings section name the runtime
// emits (platformSettings.ts SECTIONS). Any surface that shows a service by
// name pulls its icon from here so the pairing never drifts; a service shares
// its icon with the related page above (Store ↔ Data, both the Database icon).
// "Data" is the settings display tab that aggregates Store + Files.
export const SERVICE_ICONS: Record<string, LucideIcon> = {
  Data: Database,
  Store: Database,
  Files: Folder,
  Tasks: ListChecks,
  Events: Zap,
  Logs: ScrollText,
  Gateways: Plug,
  Engine: Cpu,
};
