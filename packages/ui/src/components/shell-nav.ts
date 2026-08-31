import type { ComponentType } from "react";
import { Cpu, Database, Folder, KeyRound, ListChecks, Palette, Plug, ScrollText, Zap, type IconProps } from "../icons";

// The facade's swap-at-runtime icon components are plain function components,
// not lucide's forwardRef shape — type against the facade, not lucide-react.
export type ServiceIcon = ComponentType<IconProps>;

// The platform services the shell's rail, sheet, and command bar list
// (app-shell spec §1). Hrefs are absolute so they resolve from any surface —
// an app document navigates cross-document; the dashboard maps them onto SPA
// links via AppShell's renderLink adapter.
export type ServiceEntry = { label: string; icon: ServiceIcon; href: string };

export const SERVICES: ServiceEntry[] = [
  { label: "Data", icon: Database, href: "/_dashboard/data" },
  { label: "Tasks", icon: ListChecks, href: "/_dashboard/tasks" },
  { label: "Events", icon: Zap, href: "/_dashboard/events" },
  { label: "Secrets", icon: KeyRound, href: "/_dashboard/secrets" },
  { label: "Gateways", icon: Plug, href: "/_dashboard/gateways" },
  { label: "Logs", icon: ScrollText, href: "/_dashboard/logs" },
  { label: "Themes", icon: Palette, href: "/_dashboard/themes" },
];

export const SETTINGS_HREF = "/_dashboard/settings";
export const DASHBOARD_HOME_HREF = "/_dashboard/";

// Canonical service → icon map, keyed by the settings section name the engine
// emits (platformSettings.ts SECTIONS). Any surface that shows a service by
// name pulls its icon from here so the pairing never drifts; a service shares
// its icon with the related page above (Store ↔ Data, both the Database icon).
// "Data" is the settings display tab that aggregates Store + Files.
export const SERVICE_ICONS: Record<string, ServiceIcon> = {
  Data: Database,
  Store: Database,
  Files: Folder,
  Tasks: ListChecks,
  Events: Zap,
  Logs: ScrollText,
  Gateways: Plug,
  Engine: Cpu,
};
